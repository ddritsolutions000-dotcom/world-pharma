# Queue / worker runbook

## Architecture note

Domain delivery SoT is the Postgres **outbox**. BullMQ (`domain-events`) is a delivery buffer. Job id = outbox event id. Outbox retries use `OUTBOX_MAX_ATTEMPTS` (default 8) with backoff; BullMQ jobs use `attempts: 1`.

## Worker failure

1. Confirm Redis via `/health/ready` (`redis`, `bullmq`).
2. Confirm API process running dispatcher/worker (`NODE_ENV=test` disables BullMQ worker path).
3. Check metrics: `outbox_failed_total`, `outbox_dead_lettered_total`, `bullmq_jobs_processed_total`.

## Stuck job / stuck PROCESSING

Reliability snapshot includes `outbox.stuck_processing` (PROCESSING older than ~120s).
Dispatcher reclaim restores stale `PROCESSING` to retryable state — do not invent a second reclaim tool.

```bash
# Observe
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/api/v1/admin/control-plane/reliability/snapshot"
```

## Poison / dead-lettered job

1. Filter outbox `DEAD_LETTERED`.
2. Inspect `last_error`, `attempts`, `correlation_id`, `occurrence_key`.
3. Fix consumer bug or payload cause.
4. Authorized remediation only: reset a **single** row to `PENDING` with ops approval — never bulk replay.

## Logistics queue

Separate queue `logistics-booking` exists for carrier booking mocks. Not shown on reliability console; treat as sandbox/external-gated for live carriers.
