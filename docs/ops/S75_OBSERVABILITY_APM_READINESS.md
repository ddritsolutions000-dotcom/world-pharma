# Sprint 75 — Production observability / APM / alerting readiness

> **Sprint 84** stabilizes activation readiness on this foundation. See `S84_OBSERVABILITY_APM_ALERTING_ONBOARDING.md`.
> **Sprint 97** is the production activation-readiness pass. See `S97_PRODUCTION_APM_MONITORING_ALERTING_ACTIVATION_READINESS.md`.
> Primary blocker remains **`NO_PRODUCTION_APM_PROVIDER`** (also: `NO_PRODUCTION_MONITORING_PROVIDER` / `NO_PRODUCTION_ALERTING_PROVIDER`).

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (in-process `/metrics`, structured logs, correlation IDs, Admin Reliability) |
| Production | **EXTERNAL_GATED** |
| Alerting / pager | **EXTERNAL_GATED** |
| Remaining blocker | **NO_PRODUCTION_APM_PROVIDER** |

No Datadog/New Relic/Sentry/Grafana/CloudWatch credentials were invented.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

`/metrics` present ≠ production APM enabled.

## Health semantics

| Layer | Status |
|-------|--------|
| Liveness | SOFTWARE_READY |
| Application health | SOFTWARE_READY |
| Dependency health (Postgres/Redis) | SOFTWARE_READY |
| Production readiness / APM | EXTERNAL_GATED |

## Logging / PHI

Structured operational logs may include timestamp, severity, service, environment, correlation/request ID, route, safe status, duration.

Must **not** log: passwords, OTP, tokens, API keys, KMS material, document contents, DICOM payloads, unnecessary PHI.

Metrics label deny-list excludes `userId`, `email`, `phone`, `url`, `documentId`.

## Error taxonomy

`AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `VALIDATION_ERROR`, `DEPENDENCY_UNAVAILABLE`, `PROVIDER_EXTERNAL_GATED`, `DATABASE_ERROR`, `STORAGE_ERROR`, `WEBHOOK_ERROR`, `OUTBOX_ERROR`, `TIMEOUT`, `RATE_LIMIT`, `INTERNAL_ERROR`

## Alert model

Severities: **P0** critical outage/security · **P1** major degradation · **P2** limited · **P3** informational.

Thresholds default to **OPS_CONFIG_REQUIRED** until ops approval.

When a provider is `NOT_SELECTED`, alerts use `SUPPRESS_AS_NOT_CONFIGURED` (do not pretend the provider is down). Software rails (outbox/webhook/API) remain monitorable.

## Controlled sandbox failure

Unsigned `POST /api/v1/webhooks/payments/MOCK_PRIMARY` → rejected (WEBHOOK_ERROR) → Admin Reliability still inspectable → Customer login recovers.

## Admin

- `/provider-activation` — Observability / APM card
- `/reliability` — outbox + operational signals
- `GET /api/v1/admin/control-plane/observability-onboarding`

## Retention / residency

Log/trace/metric retention and telemetry residency remain **POLICY_REQUIRED** / **LEGAL_REVIEW_REQUIRED**.

## When a real APM is supplied

1. Register non-mock APM + pager endpoints (vault secret refs).
2. Attest PHI scrubbing + retention + residency.
3. Approve P0–P3 thresholds.
4. `PROVIDER_APPROVED_MONITORING_APM=true`.
5. `APM_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
