# WORLD_PHARMA S144 — Production Deployment + Release Pipeline Closure

**Sprint:** 144  
**Master backlog:** #441  
**Status:** COMPLETE (software) — production deployment target remains EXTERNAL_GATED / NOT_CONFIGURED  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Complete the **software-side** production deployment and release-engineering path by consolidating S99 / S112 / S117 / S118 / S119 (S131 secrets gap closed by S142) and composing S142 + S143.

This sprint does **not** invent cloud accounts, CI deploy credentials, or claim production DEPLOYED.

## Authoritative lifecycle

```
NOT_CONFIGURED → CONFIGURED → VERIFIED → DEPLOYABLE → DEPLOYED
```

Current evaluated lifecycle: **NOT_CONFIGURED**.

Distinctions:

| Claim | Reality in S144 |
| --- | --- |
| SOFTWARE_READY | Build/CI contracts may be ready |
| PRODUCTION_DEPLOYABLE | **false** |
| DEPLOYED | **false** |
| PRODUCTION_ENABLED | **false** |

## Authoritative module

`apps/api/src/ops/deployment-release-engineering-production-activation-path.ts`

Composes:

- S99 deployment requirements / onboarding
- S112 foundation real activation
- S117 foundation activation preparation
- S118 release engineering readiness
- S119 deployment target activation
- S142 secrets-manager runtime resolver
- S143 observability release events

## CI/CD stages

Existing `.github/workflows/ci.yml` is **validate-only** (no deploy job).

Software stage contracts: install → lint/typecheck → unit tests → focused e2e → production build → artifact validation → migration validation → deployment readiness gate → post-deploy smoke → release evidence.

Production deploy provider: **EXTERNAL_GATED** (`NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER`).

## Artifact identity

`APP_VERSION` / `GIT_SHA` / `BUILD_TIME` / optional `ARTIFACT_ID`.  
Exposed safely via `/health/version`. Never secrets.

## Configuration gates

Environment, DB, secrets-manager, storage/KMS/malware, backup/PITR, observability/APM, PSP, OTP, carrier, clinical, deployment target — all remain EXTERNAL_GATED where not live.

## Migration safety

Forward-only Prisma policy. Production cutover **NOT_AUTHORIZED**. No invented down-migrations. Failed migration fails deployment safely (contract).

## Rollback

Sandbox may be proven. Production rollback **NOT_YET_PROVEN**. Cannot target sandbox from production. Schema backward rollback **FORBIDDEN**.

## Observability / backup integration

Safe release events (artifact, env, state, timestamp, correlation) via S143 — no secrets/PHI.  
Backup/PITR readiness acknowledged; **not** production-enabled (S141).

## Admin

`GET /api/v1/admin/control-plane/deployment-release-engineering-production-activation-path` (`policy:read`)

Shows: PRODUCTION RELEASE state, artifact identity, migration/readiness/rollback, blockers. No bypass of provider/security gates.

## Tests

```bash
npx nx test api --testPathPatterns="s144-deployment-release-engineering" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 8 passed, 8 total

npx nx test api --testPathPatterns="s144-deployment|s99-deployment-activation|s112-foundation-real-activation|s117-foundation-activation|s118-release-engineering|s119-deployment-target|s142-secrets|s143-observability" --skip-nx-cache
# Test Suites: 8 passed, 8 total | Tests: 48 passed, 48 total
```

## Runtime evidence (2026-09-05)

API restarted after S144 build (`nx serve api`):

| Check | Result |
| --- | --- |
| `GET /health` | **200** `{"status":"ok"}` |
| `GET /health/version` | **200** `version=0.0.0`, `git_sha=local` |
| `GET /health/ready` | **200** `status=ready` |
| `GET …/deployment-release-engineering-production-activation-path` (no auth) | **401** |
| `GET …/observability-apm-monitoring-alerting-production-activation-path` (no auth) | **401** |
| Admin web `:3001` | **200** |
| Dist route present | **YES** |

Authenticated Admin browser card requires OTP/MFA — **not claimed Browser PASS**.

## Explicit statements

- Real production deployment target configured? **NO**
- Real production deployment executed? **NO**
- Production actually DEPLOYED? **NO**
- Production actually ENABLED? **NO**
- External blockers: `NO_PRODUCTION_DEPLOYMENT_TARGET`, release pipeline, secrets manager, DB, infra, migration cutover, smoke, rollback proof, CI deploy provider

Software completion ≠ production deployment.
