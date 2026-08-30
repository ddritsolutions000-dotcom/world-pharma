# 44 — Event / Outbox Implementation Notes

**Status:** Phase 0 Task 5 — implemented; Task 5.1 runtime verified against Compose Redis 7  
**Canonical:** [22](22_EVENT_ARCHITECTURE.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

This note records the Phase 0 **transactional outbox → BullMQ** foundation. It is not a second event bus and not event sourcing.

---

## Model

PostgreSQL is the source of truth.

```
Domain mutation + OutboxEvent  (same Prisma transaction)
  → COMMIT
  → OutboxDispatcher (compare-and-set claim)
  → BullMQ (Redis delivery buffer)
  → EventWorker + InboxReceipt
  → handler side effect (at-least-once delivery, exactly-once effect)
```

Audit remains `SecurityEvent`. Domain delivery is `OutboxEvent`. Not every audit row is published.

---

## Redis 7 / REDIS_URL

BullMQ requires **Redis 5+**. This repo’s Compose service is **Redis 7**.

Do **not** point BullMQ at a host Redis 3.x (common on Windows `:6379`). Leave the host install alone; use Compose.

| How the API runs | `REDIS_URL` |
| --- | --- |
| Inside Compose | `redis://redis:6379` (service name; container port 6379) |
| On the host (this repo default) | `redis://127.0.0.1:${REDIS_PORT}` with `REDIS_PORT=56379` |

Compose maps `${REDIS_PORT:-56379}:6379`. Application code does **not** hardcode host or port; it requires `REDIS_URL`.

Verify container version:

```
docker exec world-pharma-redis redis-server --version
```

Queue health: `GET /health` stays liveness-only (`{ status: "ok" }`). `GET /health/ready` reports postgres, redis, redis_version, and bullmq.

If Redis is missing or older than 5, the dispatcher/worker **do not start**. Ready shows `bullmq: down`. Outbox rows still persist in PostgreSQL.

---

## Envelope

SCREAMING_SNAKE `type` / `eventName`. `schemaVersion` integer (default 1). Payload is ids/status only. Sensitive keys (`otp`, `password`, `token`, …) are stripped before insert.

`countryId` is optional for identity registration (no country yet). Money/clinical events in later phases must set it.

---

## Dispatcher / BullMQ

- Claim batch in a transaction: read PENDING due rows, then `updateMany` where `status=PENDING` (compare-and-set). Two workers cannot both claim the same row. Native `SKIP LOCKED` can be added later without changing the envelope.
- Stale `PROCESSING` rows older than 120s return to `PENDING`.
- Queue name: `domain-events`. Job id = event id.
- BullMQ is not the source of truth; Redis may be rebuilt from outbox.

**Retry (Phase 0 default):** 8 attempts, exponential backoff 15s × 2^(n-1), cap 1h. Override `OUTBOX_MAX_ATTEMPTS`. Production may raise to 25 per OD-EVT-08 — **do not treat 8 as a legal SLA**.

**Dead letter:** status `DEAD_LETTERED`, `lastError` sanitized, attempts stored. No admin UI. Replay = set `PENDING` + new `availableAt` after an operator CR/runbook; inbox still blocks duplicate handler effects.

---

## Idempotency

Inbox unique `(consumer_name, event_id)`. On handler failure the receipt is released so a retry can run. Success receipts make the business effect once.

---

## Transaction helper

`OutboxService.enqueue(tx, …)` must be called with the same `tx` as the aggregate write.

Phase 0 producers:

- `USER_REGISTERED` with Person create
- `PARTNER_CREATED` / `PARTNER_STATUS_CHANGED` with Partner writes

End-to-end check (after Compose Redis 7 is up and `REDIS_URL` points at it):

```
pnpm exec nx test api
```

The suite includes a live BullMQ job (`USER_REGISTERED` → outbox → dispatcher → queue → worker → `PUBLISHED`).

API Jest uses a **separate data plane** so a local `nx serve api` cannot steal test outbox rows:

- Postgres database `worldpharma_test` (sibling of `worldpharma`)
- Redis logical database `/1`
- BullMQ prefix `wp-test` via `BULLMQ_PREFIX`

Claim/SKIP semantics in production are unchanged. Tests own their dispatcher/worker lifecycle.

---

## Security / observability

No public `POST /events`. Logs use event id, name, correlation id — not payloads. Logs: `outbox_dispatched`, `event_handling`, `outbox_retry_scheduled`, `outbox_dead_lettered`, `handler_failed`. Retention of outbox/inbox: **LEGAL/COMPLIANCE REVIEW REQUIRED**; do not invent country periods.

---

## Deferred

- Kafka extraction (OD-EVT-02) — not now
- Per-event retry policy table
- Admin replay UI
- Outbox payload legal retention
- Mandatory `country_id` on identity events
- Full consumer catalog (notify, search, ledger)
- Native `SKIP LOCKED` claim SQL

**Next:** Phase 0 Task 6 — Security / observability foundation. Not started.
