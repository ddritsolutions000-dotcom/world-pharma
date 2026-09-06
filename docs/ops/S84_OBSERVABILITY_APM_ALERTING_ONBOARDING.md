# Sprint 84 — Production observability / APM / alerting activation readiness

Stabilization of the **Sprint 75** observability-first onboarding path. No Datadog/New Relic/Sentry/Grafana/CloudWatch credentials were invented.

> **Sprint 97** continues activation readiness without inventing providers. See `S97_PRODUCTION_APM_MONITORING_ALERTING_ACTIVATION_READINESS.md`. Production remains **EXTERNAL_GATED**.

## Provider status (this environment)

| Rail | Provider | Sandbox | Production | Blocker |
|------|----------|---------|------------|---------|
| APM | **NOT_SELECTED** | in-process `/metrics` | **EXTERNAL_GATED** | **NO_PRODUCTION_APM_PROVIDER** |
| Monitoring | **NOT_SELECTED** | software signals | **EXTERNAL_GATED** | **NO_PRODUCTION_MONITORING_PROVIDER** |
| Alerting / pager | **NOT_SELECTED** | definitions only | **EXTERNAL_GATED** | **NO_PRODUCTION_ALERTING_PROVIDER** |

Sandbox: **SANDBOX_VERIFIED** (structured logs, correlation IDs, Admin Reliability). Production: **EXTERNAL_GATED**.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

`/metrics` present ≠ production APM enabled.

## Health semantics

| Layer | Status |
|-------|--------|
| Liveness / app / deps | SOFTWARE_READY |
| Production readiness / APM | EXTERNAL_GATED |

Optional provider NOT_SELECTED must not mark the whole application unhealthy.

## Structured logging

Allowed: timestamp, level, service, environment, request/correlation ID, route, error code, status, duration.

Never: passwords, OTP, tokens, payment credentials, secret keys, PHI, KYC docs, private objects, clinical payloads, sensitive signed URLs.

## Correlation

`x-request-id` / `x-correlation-id` preserved across requests (including controlled webhook failures).

## Error taxonomy

`AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `VALIDATION_ERROR`, `DEPENDENCY_UNAVAILABLE`, `PROVIDER_EXTERNAL_GATED`, `DATABASE_ERROR`, `STORAGE_ERROR`, `WEBHOOK_ERROR`, `OUTBOX_ERROR`, `TIMEOUT`, `RATE_LIMIT`, `INTERNAL_ERROR`

NOT_SELECTED ≠ false provider outage (`PROVIDER_EXTERNAL_GATED` / `SUPPRESS_AS_NOT_CONFIGURED`).

## Alert model

Severities **P0–P3**. Rate/spike thresholds: **THRESHOLD_REQUIRES_PRODUCTION_BASELINE**. Ops-configured infra: **OPS_CONFIG_REQUIRED**.

## Admin

- `/provider-activation` — Observability / APM / alerting activation readiness (Sprint 84)
- `/reliability`
- `GET /api/v1/admin/control-plane/observability-onboarding`

## Exact tests performed

| Suite | Result |
|-------|--------|
| Unit S84 | **9/9** |
| Unit S75 regression | **15/15** |
| Unit S64 Provider Activation | **10/10** |
| Unit S74 backup/PITR | **16/16** |
| Unit S77 carrier | **12/12** |
| Unit S78 eRx | **11/11** |
| Unit S79 video | **12/12** |
| Unit S80 PACS | **10/10** |
| Unit S81 KYC/KYB | **10/10** |
| Unit S82 storage/KMS/malware | **8/8** |
| Unit S83 backup/PITR/DR | **9/9** |
| Playwright S84 | **4/4** |
| Playwright S75 regression | **4/4** |

- Shots: `apps/test-results/s84-observability-shots/` (11 PNGs)
- Status artifact: `apps/test-results/s84-observability/final-observability-status.json`
- Native Android/iOS: **DEVICE_NOT_AVAILABLE** (390px = **RESPONSIVE_WEB_VERIFIED** only)
- Master Index: **#382**

See also: `S75_OBSERVABILITY_APM_READINESS.md`, `S75_OBSERVABILITY_SECURITY_GATE.md`.
