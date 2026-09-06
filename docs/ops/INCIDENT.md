# Incident runbook

## Identify correlation

1. Capture `x-correlation-id` / `x-request-id` from the client or Problem+JSON body (`correlation_id`, `request_id`).
2. Search structured API logs for that correlation id (HTTP interceptor / ProblemFilter).

## Inspect health

```bash
curl -sS http://localhost:3000/health
curl -sS http://localhost:3000/health/ready
```

- `/health` = process liveness only.
- `/health/ready` = Postgres + Redis (BullMQ-compatible). External-gated PSP/SMS/carrier absence must **not** alone mark not_ready.

## Inspect queue / outbox

Main Admin (permission `policy:read`):

- `GET /api/v1/admin/control-plane/reliability/snapshot`
- `GET /api/v1/admin/control-plane/reliability/outbox?status=FAILED`
- `GET /api/v1/admin/control-plane/reliability/outbox?status=DEAD_LETTERED`

UI: `/reliability`

## Inspect dead letters

Outbox: status `DEAD_LETTERED` via reliability outbox filter.
Notifications: `GET /api/v1/admin/notifications/ops/dead-letters` (admin notification ops).

## Isolate failing dependency

Use `/health/ready` fields `postgres`, `redis`, `bullmq`, `outbox`, and `runtime.dependencies`.
Do not enable live PSP/messaging to “fix” readiness.

## Remediation posture

No replay-everything control. Remediations are case-by-case via authorized runbooks (outbox / queue / payment / notification).
