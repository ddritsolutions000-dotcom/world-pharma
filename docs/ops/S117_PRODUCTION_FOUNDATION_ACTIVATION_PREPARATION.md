# Sprint 117 — Production Foundation Activation Preparation

**Status:** COMPLETE (contracts / control-plane preparation — no live infra)  
**Master Index:** #415  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Rail | State |
|------|--------|
| Production environment | **NOT_CONFIGURED** (separation software **YES**) |
| Secrets manager | **NOT_CONFIGURED** / NOT_SELECTED |
| Production database | **NOT_CONFIGURED** |
| Deployment target | lifecycle **NOT_CONFIGURED** |
| Migration cutover | **NOT_AUTHORIZED** |
| Rollback (production) | **NOT_PROVEN** |

**Security statement:** Foundation contracts prepared for future configuration-driven activation. No production infrastructure invented or enabled. Sandbox fail-closed retained. Production launch remains NO.

## Goal

Prepare the codebase so **real** environment / secrets / database / deployment can later be activated by **configuration**, not architectural rewrites — without inventing cloud accounts or claiming production is live.

## Authoritative source

`apps/api/src/ops/production-foundation-activation-preparation.ts` composes:

| Plane | Module |
|-------|--------|
| Secrets/env inventory | S98 |
| Deployment/migration/rollback | S99 |
| Foundation rails | S101 |
| Real activation compose | S112 |
| Security gate SoT | S116 |
| Provider rails | S87 |

**No new LaunchRailId.** S98–S112 cards remain drill-downs.

## Environment separation

- DEVELOPMENT / SANDBOX / TEST: isolated  
- STAGING / PRODUCTION: EXTERNAL_GATED  
- Sandbox adapters cannot activate production  
- Dev credentials in production: FORBIDDEN  
- Client public env cannot carry secrets (PASS)

## Secrets / configuration contract

Authoritative inventory (presence-only, never prints values) covers:

DATABASE, AUTH (JWT/OTP pepper), OTP/SMS/EMAIL/PUSH, PSP, CARRIER, STORAGE, KMS, MALWARE, BACKUP/PITR, APM/MONITORING/ALERTING, ERX, VIDEO, PACS, KYC, **EDGE_WAF** (new refs), **AFFILIATE_PAYOUT** (new refs), platform runtime.

Statuses: `NOT_SELECTED` | `CONFIGURATION_REQUIRED` | `CREDENTIALS_REQUIRED` | `EXTERNAL_GATED` | …

## Database contract

- `NO_PRODUCTION_DATABASE`  
- No sandbox DB fallback in production  
- Destructive down migrations: FAIL_CLOSED  
- Cutover: NOT_AUTHORIZED  
- Schema drift: `pnpm ci:migrations`  

## Deployment lifecycle

```
NOT_CONFIGURED → CONFIGURED → VERIFIED → DEPLOYABLE → DEPLOYED
```

**Current:** `NOT_CONFIGURED`  
Health `/health` + `/health/ready` ≠ production activation. Readiness fail-closed on DB/Redis.

## Migration + rollback

| Control | State |
|---------|--------|
| Software migration contract | PASS |
| Production cutover | NOT_AUTHORIZED |
| Rollback sandbox | SANDBOX_PROVEN |
| Rollback production | NOT_PROVEN |

## Admin

- Launch readiness: Foundation activation preparation (S117) summary  
- Provider activation: Sprint 117 card  
- API: `GET /api/v1/admin/control-plane/production-foundation-activation-preparation`

## Security preservation

S110–S116 controls retained (authz, SSRF, rate limits, fail-closed providers, sandbox separation).

## Tests

| Suite | Result |
|-------|--------|
| Unit S117 | **4/4** |
| Playwright S117 | **2/2** |
| Regression S98+S99+S112+S116+S117 | **21/21** |
| Screenshots | `apps/test-results/s117-foundation-prep-shots/` (**7**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |

## STOP

Sprint 117 complete. Do **not** invent infrastructure. Do **not** auto-start Sprint 118.
