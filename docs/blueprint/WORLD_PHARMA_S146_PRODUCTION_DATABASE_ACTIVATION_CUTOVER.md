# WORLD_PHARMA S146 — Production Database Activation + Cutover Safety

**Sprint:** 146  
**Master backlog:** #443  
**Status:** COMPLETE (software) — production database remains **NOT_CONFIGURED / EXTERNAL_GATED**  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Complete the **software-side** production database activation and cutover safety path.

S145 remaining blocker: `NO_PRODUCTION_DATABASE`.

This sprint does **not** invent a production database, credentials, or claim ENABLED / migrated.

## Authoritative lifecycle

```
NOT_CONFIGURED → CONFIGURED → VERIFIED → APPROVED → ENABLED
```

Migration execution:

```
NOT_AUTHORIZED → AUTHORIZED → PRECHECKED → EXECUTING → VERIFIED
```

Current evaluated DB lifecycle: **NOT_CONFIGURED**.  
Current migration lifecycle: **NOT_AUTHORIZED**.

| Claim | Reality in S146 |
| --- | --- |
| SOFTWARE_COMPLETE | Software path closed |
| Live CONFIGURED / VERIFIED | **false** |
| ENABLED | **false** |
| Production migration proven | **false** |

## Authoritative module

`apps/api/src/ops/production-database-activation-path.ts`

Reuses:

- `packages/database` Prisma schema + forward-only migrations
- Existing `PrismaService` connection pool / timeouts / graceful disconnect
- S74 / S83 / S96 / S108 backup + PITR readiness (S141 not rebuilt)
- S117 / S118 / S119 foundation + deployment contracts
- S142 secrets-manager runtime resolver
- S143 observability (safe events)
- S144 release engineering
- S145 deployment-target activation

No second database abstraction. No redo of S132–S145.

## Environment isolation

development ≠ sandbox ≠ staging ≠ production.

Production DB validation rejects: localhost, 127.0.0.1, sandbox/dev/test refs, mock providers, local `.env` fallback, client-supplied connection strings. Private production networking is not rejected solely for being private.

## Secrets (S142)

Credentials: **secret reference → S142 resolver → authorized server-side connection**.  
Never exposed in Admin/API/logs. Missing secrets manager/adapter → fail closed.

## Connection safety

Documents existing Prisma safety: pool limits, interactive transaction timeouts (10s/20s), fail-closed retries, graceful disconnect, no credential leakage in errors, server-side only.

## Migration cutover

Forward-only Prisma policy. Prechecks: target identity, environment, artifact, migration state, backup/PITR, authorization, ordering, incompatible schema fail-closed. No down-migrations invented. Without a real production DB: execution **EXTERNAL_GATED**; never execute sandbox as production proof.

## Backup / DR

S141 not rebuilt. Production DB included in backup/PITR dependency checks. Restore cannot target live primary without authorization. Production restore remains unauthorized (`NO_PRODUCTION_MANAGED_BACKUP_PITR`).

## Deployment integration

S144/S145 gates not loosened. `production_deployable` remains **false** while `NO_PRODUCTION_DATABASE` stands.

## Observability

Safe events: DB target identity (ref), migration ID context, artifact, environment, state, timestamp, correlation ID. Never credentials or connection strings.

## Admin

`GET /api/v1/admin/control-plane/production-database-activation-path` (`policy:read`)

PRODUCTION DATABASE card: provider, target/config/verification/migration state, backup/PITR dependency, readiness, blockers. No passwords/connection strings/secrets.

## Tests

```bash
npx nx test api --testPathPatterns="s146-production-database-activation" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 10 passed, 10 total

npx nx test api --testPathPatterns="s146-production-database|s108-backup|s142-secrets|s143-observability|s144-deployment|s145-production-deployment" --skip-nx-cache
# Test Suites: 6 passed, 6 total | Tests: 53 passed, 53 total
```

## Runtime evidence (2026-09-05)

API rebuilt (`nx build api`) and **restarted** (`nx serve api`) before checks. Admin on `:3001`.

| Check | Result |
| --- | --- |
| `GET /health` | **200** |
| `GET /health/ready` | **200** (local/sandbox postgres+redis) |
| `GET /health/version` | **200** |
| `GET …/production-database-activation-path` (no auth) | **401** |
| `GET …/deployment-release-engineering-production-activation-path` (migration readiness, no auth) | **401** |
| Admin UI `/` | **200** |
| Admin `/provider-activation` | **200** |

**Production DB runtime verification was NOT performed** — only local/sandbox DB is available. Local readiness ≠ production DB verified.

Authenticated Admin browser evidence: **AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED** (OTP/MFA). Do not claim Browser PASS.

## Remaining external blockers

- `NO_PRODUCTION_DATABASE`
- `NO_PRODUCTION_DATABASE_PROVIDER`
- `NO_PRODUCTION_DATABASE_SECRET`
- `PRODUCTION_DATABASE_UNVERIFIED`
- `PRODUCTION_DATABASE_MIGRATION_NOT_READY`
- `NO_PRODUCTION_MANAGED_BACKUP_PITR`
- `MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED`

**Explicit:** Real production DB configured? **NO**. Real production DB verified? **NO**. Production migration executed? **NO**. Production database ENABLED? **NO**. Production launch allowed? **NO**.

**Software completion ≠ production database exists.**

**STOP after S146.**
