# Idempotency ops

## Storage

| Mechanism | Storage | TTL | Used by |
|-----------|---------|-----|---------|
| `idempotency_records` | Postgres (`personId` + `key`) | **none (durable)** | Payment pay/confirm/capture/refund, checkout/order paths using `runPaymentIdempotent` / cart idempotency |
| Notification dedupe | Redis `notification:dedupe:{occurrenceKey}` | **30 days** | In-app notification enqueue |
| Outbox uniqueness | Postgres unique `(aggregateId, type, occurrenceKey)` | durable | Domain event producers |
| Inbox receipts | Postgres `(consumerName, eventId)` | durable | Event consumers |

## Critical workflows

- Payment / refund: same Idempotency-Key returns stored response; concurrent duplicates are serialized by unique constraint / prior-record check.
- Notification dispatch: duplicate occurrence keys do not create second inbox rows.
- Affiliate lifecycle: finance emit skips if outbox row for same occurrence already exists.
- Settlement membership: existing finance uniqueness / idempotency paths remain authoritative.

## Admin lookup

`GET /api/v1/admin/control-plane/reliability/idempotency?key=` or `person_id=` (requires `policy:read`).
Response excludes response bodies by default listing fields (id, person, key, method, path, status_code, created_at).
