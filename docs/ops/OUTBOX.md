# Outbox runbook

## Observe backlog

- `/health/ready` → `outbox.pending|processing|dead_lettered`
- `GET /api/v1/admin/control-plane/reliability/snapshot`
- Metrics gauges on `GET /metrics`: `outbox_pending`, `outbox_processing`, `outbox_dead_lettered`, `outbox_failed`, `outbox_stuck_processing`

## Failed event

1. List: `GET /api/v1/admin/control-plane/reliability/outbox?status=FAILED`
2. Note `correlation_id`, `occurrence_key`, `aggregate_id`, `attempts`, `last_error`.
3. Events retry until max attempts then become `DEAD_LETTERED`.

## Dead-letter event

Same as failed, status `DEAD_LETTERED`. Investigate consumer/handler. No UI “replay all”.

## Duplicate / idempotency investigation

1. Outbox uniqueness: `(aggregateId, type, occurrenceKey)`.
2. Consumer inbox: `inbox_receipts` (`consumerName`, `eventId`).
3. Notifications: Redis NX dedupe key `notification:dedupe:{occurrenceKey}` (TTL 30 days).
4. Lookup payment/checkout keys: `GET /api/v1/admin/control-plane/reliability/idempotency?key=...`

## Correlation survival

`correlation_id` is stored on the outbox row and included in notification ops records where dispatched.
