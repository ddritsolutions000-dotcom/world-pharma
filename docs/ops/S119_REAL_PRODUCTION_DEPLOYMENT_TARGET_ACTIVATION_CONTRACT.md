# Sprint 119 — Real Production Deployment Target Activation Contract

**Status:** COMPLETE (provider-neutral activation contract — no live hosting)  
**Master Index:** #417  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| Deployment target lifecycle | **NOT_CONFIGURED** |
| Deployable | **false** |
| Deployed | **false** |
| Production environment | **NOT_CONFIGURED** |
| Secrets manager | **NOT_CONFIGURED** |
| Production database | **NOT_CONFIGURED** |
| Release pipeline | **NOT_CONFIGURED** |
| Rollback target | **NOT_CONFIGURED** / **NOT_PROVEN** |
| Security certification | **PENDING** / **EXTERNAL_PENTEST_REQUIRED** |

**Security statement:** S117 `DeploymentTargetLifecycle` reused — no second state machine. Fail-closed activation validator. No invented cloud/hosting/credentials. Production launch remains NO.

## Goal

Make the existing deployment architecture ready for a **real** production deployment target to be connected later by **configuration**, without rewriting the application.

## Authoritative source

`apps/api/src/ops/production-deployment-target-activation-contract.ts` composes:

| Plane | Module |
|-------|--------|
| Target lifecycle | **S117** `NOT_CONFIGURED → CONFIGURED → VERIFIED → DEPLOYABLE → DEPLOYED` |
| Release pipeline | S99 / S118 |
| Foundation | S117 |
| Security gate | S116 |
| Launch control | S87 |

**No new LaunchRailId.**

## Reference slots (placeholders only)

Provider identity, environment identity, deployment endpoint, region, runtime/service, artifact source, deployment mechanism, health/readiness, rollback target, secrets manager, production DB, network/origin protection.

All: `value_present=false`, `invented=false`, status `NOT_CONFIGURED`.

## Activation validation

Statuses: `MISSING` | `INVALID` | `CONFIGURED` | `VERIFIED` | `EXTERNAL_GATED`

Live evaluation (empty fixture): **DEPLOYABLE = NO**, lifecycle **NOT_CONFIGURED**.

## Fail-closed cases (fixtures only)

1. No production target → blocked  
2. Target without secrets → blocked  
3. Target + secrets without DB → blocked  
4. Target + DB + secrets without security gate → blocked  
5. Software gates without provider rails → blocked  
6. Sandbox adapter for production → blocked  
7. Production config points to sandbox → blocked  

## Production configuration guards

Cannot resolve production to: sandbox, development, local filesystem, mock PSP/carrier, Console OTP, sandbox eRx/video/PACS, local backup, sandbox monitoring.

## Evidence to advance lifecycle

| To | Evidence |
|----|----------|
| CONFIGURED | Real target + env + mechanism + artifact + secrets/DB references (no secret values in repo) |
| VERIFIED | Human verify reachability, health/readiness refs, origin protection, no sandbox adapters |
| DEPLOYABLE | Migration authorized, pentest certified, provider rails satisfied, rollback identified |
| DEPLOYED | Actual successful rollout + readiness/smoke — never claim from CI green alone |

## Admin

- Launch readiness: “why can’t we deploy?” summary (S119)  
- Provider activation: Sprint 119 card  
- API: `GET /api/v1/admin/control-plane/production-deployment-target-activation`

## Tests

| Suite | Result |
|-------|--------|
| Unit S119 | **5/5** |
| Playwright S119 | **2/2** |
| Regression S99+S112+S116+S117+S118+S119 | **26/26** |
| Screenshots | `apps/test-results/s119-deploy-target-shots/` (**7**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |

## STOP

Sprint 119 complete. Do **not** invent infrastructure. Do **not** auto-start Sprint 120.
