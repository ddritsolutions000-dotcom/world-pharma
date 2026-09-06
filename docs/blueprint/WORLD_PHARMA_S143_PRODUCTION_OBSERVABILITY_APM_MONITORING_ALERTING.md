# WORLD_PHARMA S143 — Production Observability + APM + Monitoring + Alerting Closure

**Sprint:** 143  
**Master backlog:** #440  
**Status:** COMPLETE (software) — external APM/monitoring/alerting remain EXTERNAL_GATED  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Complete the **software-side** production observability control plane by consolidating S75 / S84 / S97 / S109 and composing the S142 secrets-manager runtime resolver.

This sprint does **not** invent vendor credentials or claim production monitoring is active.

## Authoritative architecture

| Layer | Module | Status |
| --- | --- | --- |
| Onboarding triad | `observability-first-onboarding.ts` (S75/S84/S97) | REUSED |
| Real activation | `observability-real-activation-first-onboarding.ts` (S109) | COMPOSED |
| Config validation | `production-observability-requirements.ts` | REUSED |
| Secrets | `secrets-manager-runtime-resolver.ts` (S142) | COMPOSED |
| **Closure path** | `observability-apm-monitoring-alerting-production-activation-path.ts` | **AUTHORITATIVE S143** |
| Runtime logs/metrics | `HttpObservabilityInterceptor`, `MetricsService`, `/health*` | REUSED |

No parallel observability framework was created.

## Lifecycle / readiness states

Per rail (APM / Monitoring / Alerting):

```
NOT_SELECTED → EXTERNAL_GATED → CONFIGURED → VERIFIED → APPROVED → ENABLED
```

Distinctions enforced:

| State | Meaning |
| --- | --- |
| SOFTWARE_COMPLETE | Contracts, adapters, Admin visibility, fail-closed gates exist |
| EXTERNAL_GATED | Real vendor / pager / shipper not configured |
| PRODUCTION_ENABLED | Live production observability — **false** in S143 |

Inequalities:

- In-process `/metrics` ≠ production APM
- Sandbox structured logs ≠ production monitoring
- Software alert contracts ≠ production pager

## Metrics

Software metric contracts cover HTTP count/latency/errors, DB, queue/outbox, jobs, webhooks, payment, notifications, carrier, clinical, storage, auth failures, rate limits.

All contracts are PHI/secret-safe and `production_status: EXTERNAL_GATED`.

## Logging / redaction

Required fields: timestamp, service, environment, severity, request/correlation IDs, safe metadata.

Forbidden: passwords, OTP, payment credentials, API keys, secrets, tokens, unnecessary PHI, full clinical payloads.

Uses existing `redactText` / `assertNoSecretLeak`.

## Tracing (APM)

Provider-neutral `ApmTracingAdapter`:

- Sandbox: `SandboxNoopApmTracingAdapter`
- Production without registration: `FailClosedProductionApmTracingAdapter`

Trace boundaries: HTTP, DB, queue, external provider, payment, notification, logistics, clinical, storage.

## Alerting

Reuses S97 alert definitions with CRITICAL (P0/P1) and WARNING (P2/P3) views.

Software dispatch:

- fingerprint + 60s dedupe
- suppress provider alerts when provider not selected
- `production_pager_active: false` always in S143

## Health / readiness

| Endpoint | Role |
| --- | --- |
| `/health` | Liveness — does **not** claim dependency health |
| `/health/ready` | Dependency-aware readiness (postgres/redis/bullmq/outbox) |
| `/health/version` | Build identity |

Sandbox health ≠ production health. No public sensitive diagnostics.

## Admin control

`GET /api/v1/admin/control-plane/observability-apm-monitoring-alerting-production-activation-path`  
(`policy:read`)

Admin card shows: OBSERVABILITY state, APM/metrics/alerting/health states, S142 resolver status, blocker reason. Never secrets.

## S142 dependency

APM/monitoring/alerting credentials must use secret **references**.  
Report field: `secrets_manager_runtime_resolver: SOFTWARE_COMPLETE`.  
Production activation asserts secrets-manager resolution when a real adapter is present.

## Production external blockers

- `NO_PRODUCTION_APM_PROVIDER`
- `NO_PRODUCTION_MONITORING_PROVIDER`
- `NO_PRODUCTION_ALERTING_PROVIDER`
- `NO_PRODUCTION_APM_ADAPTER`
- Real vendor contracts, credentials (via S142), verification, approval, live enablement

## Tests

```bash
npx nx test api --testPathPatterns="s143-observability-apm-monitoring-alerting" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 8 passed, 8 total

npx nx test api --testPathPatterns="s143-observability|s75-observability|s84-observability|s97-observability|s109-observability|s142-secrets-manager" --skip-nx-cache
# Test Suites: 6 passed, 6 total | Tests: 51 passed, 51 total

npx nx test api --testPathPatterns="s132-psp-payment-production-activation-path|s140-private-storage|s142-secrets-manager" --skip-nx-cache
# Test Suites: 3 passed, 3 total | Tests: 34 passed, 34 total
```

## Runtime evidence (2026-09-05)

API restarted after S143 build (`nx serve api`):

| Check | Result |
| --- | --- |
| `GET /health` | **200** `{"status":"ok"}` |
| `GET /health/version` | **200** (build identity) |
| `GET /health/ready` | **200** `status=ready` (postgres/redis/bullmq up; infra EXTERNAL_GATED) |
| `GET …/observability-apm-monitoring-alerting-production-activation-path` (no auth) | **401** |
| `GET …/secrets-manager-runtime-resolver` (no auth) | **401** |
| Admin web `:3001` | **200** |

Authenticated Admin browser card load was not completed in this session (OTP/MFA login required); unauthenticated denial + route presence confirmed on the **running** process.

## Explicit statement

**No real production APM/monitoring provider is configured.**  
**No production alerts are actually active.**  
**Production monitoring is NOT ENABLED.**

Software completion ≠ production activation.
