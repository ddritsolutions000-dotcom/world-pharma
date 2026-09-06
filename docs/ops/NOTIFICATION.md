# Notification ops runbook

## Failed delivery (in-app)

1. Main Admin notification ops: `GET /api/v1/admin/notifications/ops/snapshot`
2. Records: `GET /api/v1/admin/notifications/ops/records`
3. Dead letters: `GET /api/v1/admin/notifications/ops/dead-letters`
4. Metric: `notification_failure_total` (dispatch exceptions)

In-app delivery uses sandbox labeling (`SANDBOX_DELIVERED` / `EXTERNAL_GATED`). Bodies stay safe defaults.

## External-gated channels

Live SMS / email / push / WhatsApp are **not** integrated. Provider absence must not be treated as an application outage.

## Duplicate suppression

Occurrence key `notif:{event}:{aggregateId}:{personId}` with Redis SET NX (30-day TTL).
