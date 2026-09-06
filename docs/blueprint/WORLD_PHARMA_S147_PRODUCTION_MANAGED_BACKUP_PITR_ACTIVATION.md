# WORLD_PHARMA S147 — Production Managed Backup + PITR Activation Control

**Sprint:** 147  
**Master backlog:** #444  
**Status:** COMPLETE (software) — managed backup/PITR remains **NOT_SELECTED / EXTERNAL_GATED**  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Close the remaining **software-side** production managed backup/PITR activation orchestration.

S141 already verified the backup/PITR/DR foundation — **not rebuilt**. No second backup system. No invented cloud provider, credentials, snapshots, or PITR proof.

## Authoritative lifecycle

```
NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED
```

Current evaluated lifecycle: **NOT_SELECTED**. Enabled: **false**.

## Authoritative module

`apps/api/src/ops/production-managed-backup-pitr-activation-path.ts`

Composes:

- S74 / S83 / S96 / S108 backup readiness (S141 reused, not rebuilt)
- S140 private storage / KMS / malware (where applicable)
- S142 secrets-manager runtime resolver
- S143 observability
- S144 release engineering (safe events)
- S145 deployment target (gates not loosened)
- S146 production database binding

## Provider adapter

Provider-neutral `ManagedBackupProviderAdapter` with: configure, validate, verify, createBackup, listBackups, verifyBackup, createRecoveryPoint, validateRecoveryPoint, initiateRestore, verifyRestore, recordEvidence.

Default: `FailClosedProductionBackupAdapter` — never reports production backup/PITR success. Without a real adapter: **EXTERNAL_GATED**, enabled **false**.

## Production DB binding

Backup/PITR bound only to S146 production DB identity. Rejects localhost, sandbox, development, test, ambiguous, and client-supplied targets. Local DB backup ≠ production readiness.

## Secrets (S142)

Credential / encryption refs only. Fail closed when secrets manager unavailable, wrong environment, or sandbox credential refs. Never exposed in Admin/API/logs.

## RPO / RTO

Reuses S141 targets:

| Metric | Target | Achievement |
| --- | --- | --- |
| RPO | 15 minutes | **TARGET_DEFINED / NOT_YET_PROVEN** |
| RTO | 4 hours | **TARGET_DEFINED / NOT_YET_PROVEN** |

## PITR / restore / DR

PITR capability, WAL retention, recovery window, isolated restore target, and authorization contracts defined — all **EXTERNAL_GATED**. Restore requires server-side authorization; browser cannot trigger privileged restore. Sandbox restore ≠ production proof. DR environment: `NO_PRODUCTION_DR_ENVIRONMENT`.

## Deployment integration

S145 gates not loosened. `production_deployable` remains **false** while `NO_PRODUCTION_MANAGED_BACKUP_PITR` stands.

## Observability

Safe events (backup/recovery refs, env, state, timestamp, correlation). Critical alert contracts for backup/recovery/PITR/restore/DR failure — production pager **EXTERNAL_GATED**.

## Admin

`GET /api/v1/admin/control-plane/production-managed-backup-pitr-activation-path` (`policy:read`)

PRODUCTION BACKUP / PITR card: provider, DB binding, config, verification, approval, enabled, RPO/RTO, DR, restore readiness, blockers. No credentials.

## Tests

```bash
npx nx test api --testPathPatterns="s147-production-managed-backup" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 10 passed, 10 total

npx nx test api --testPathPatterns="s147-production-managed-backup|s108-backup|s142-secrets|s143-observability|s145-production-deployment|s146-production-database" --skip-nx-cache
# Test Suites: 6 passed, 6 total | Tests: 55 passed, 55 total
```

## Runtime evidence (2026-09-05)

API rebuilt and **restarted** before checks. Admin on `:3001`.

| Check | Result |
| --- | --- |
| `GET /health` | **200** |
| `GET /health/ready` | **200** (local/sandbox) |
| `GET /health/version` | **200** |
| `GET …/production-managed-backup-pitr-activation-path` (no auth) | **401** |
| `GET …/production-database-activation-path` (no auth) | **401** |
| `GET …/production-deployment-target-activation-path` (no auth) | **401** |
| Admin UI `/` + `/provider-activation` | **200** |

**Production backup/PITR runtime verification was NOT performed** — only local/sandbox infrastructure is available.

Authenticated Admin: **AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED** (OTP/MFA). Do not claim Browser PASS.

## Remaining external blockers

- `NO_PRODUCTION_MANAGED_BACKUP_PITR`
- `NO_PRODUCTION_MANAGED_BACKUP`
- `NO_PRODUCTION_PITR`
- `NO_PRODUCTION_DR_ENVIRONMENT`
- `NO_PRODUCTION_BACKUP_ADAPTER`
- `NO_PRODUCTION_DATABASE`
- `RPO_RTO_NOT_YET_PROVEN`

**Explicit:** Real managed backup provider configured? **NO**. Real production PITR configured? **NO**. Real production DR environment configured? **NO**. Production backup actually running? **NO**. Production PITR actually enabled? **NO**. Production restore actually proven? **NO**. Production launch allowed? **NO**.

**Software completion ≠ real production backup.**

**STOP after S147.**
