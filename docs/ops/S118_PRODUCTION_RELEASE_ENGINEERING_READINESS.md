# Sprint 118 — Production Release Engineering + Deployment Pipeline Readiness

**Status:** COMPLETE (contracts / control-plane preparation — no live deploy pipeline)  
**Master Index:** #416  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| Software | **READY** (contracts) |
| Production infrastructure | **NOT_CONFIGURED** |
| Deployment target | **NOT_CONFIGURED** |
| Release pipeline | **NOT_CONFIGURED** (not live) |
| Migration | **NOT_AUTHORIZED** |
| Rollback (production) | **PRODUCTION_NOT_PROVEN** |
| Smoke (production) | **NOT_AUTHORIZED** (SANDBOX_ONLY contract) |
| Artifact signing | **EXTERNAL_GATED** |

**Security statement:** S99 release stages reused — no second deployment state machine. Fail-closed retained. No invented cloud/hosting/credentials. Production launch remains NO.

## Goal

Prepare the codebase so a **real** build → artifact → validation → migration gate → deploy → smoke → release → rollback pipeline can later be activated by **configuration**, not architectural rewrites.

## Authoritative source

`apps/api/src/ops/production-release-engineering-readiness.ts` composes:

| Plane | Module |
|-------|--------|
| Release pipeline stages | **S99** `DeploymentLifecycleStage` (authoritative) |
| Deploy target lifecycle | **S117** `NOT_CONFIGURED → … → DEPLOYED` |
| Foundation | S117 |
| Security gate | S116 |
| Launch control | S87 |

**No new LaunchRailId.** S99 card remains the deep drill-down.

## Release lifecycle

Authoritative S99 stages:

```
CODE → BUILD → TEST → ARTIFACT → MIGRATION_CHECK → DEPLOYMENT_GATE
→ HEALTH_CHECK → SMOKE_TEST → RELEASE_VERIFIED → ROLLBACK_IF_REQUIRED
```

Operator-facing aliases (mapped, not duplicated):

```
PRECHECK → BUILD → VALIDATE → MIGRATION_GATE → DEPLOY
→ READINESS_CHECK → SMOKE_TEST → RELEASE_SUCCESS
```

**Current overall:** `NOT_CONFIGURED` / not live.

### Distinctions

| Concept | Current |
|---------|---------|
| software-ready | READY |
| deployment-target-ready | NOT_CONFIGURED |
| production-deployable | false |
| actually deployed | false |

`buildable ≠ deployable ≠ activation_ready ≠ CAN_PRODUCTION_LAUNCH`

## Build + artifact identity

- Nx/pnpm contracts for API, customer, Admin, vendor, doctor, lab, pathologist, radiologist, Prisma generate
- Identity: `APP_VERSION` + `GIT_SHA` + `BUILD_TIME` via `/health/version`
- Server secrets must not embed in client builds
- Artifact hashing/signing: **EXTERNAL_GATED** (no invented keys)

## Pre-deployment validation

Build contract / fallback protections / security software checks composed; environment + production dependencies **NOT_CONFIGURED**; overall **BLOCKED** while external gates unresolved.

## Migration gate

- Prisma forward-only; status/drift observable via existing CI scripts
- Production cutover **NOT_AUTHORIZED**
- `NO_PRODUCTION_DATABASE` retained
- Sandbox DB from production process: **FORBIDDEN**

## Smoke + rollback

- Smoke contract: SANDBOX_ONLY domains (public/auth/customer/admin/…); no money movement
- Production smoke: **NOT_AUTHORIZED**
- Rollback: sandbox **SANDBOX_PROVEN**; production **PRODUCTION_NOT_PROVEN**

## Conditions to reach DEPLOYABLE

See report `conditions_to_reach_deployable` — requires real env/secrets/DB/target, authorized migration, pentest certification, then advance S117 lifecycle to **DEPLOYABLE** (still not **DEPLOYED** until real rollout).

## Admin

- Launch readiness: Release engineering readiness (S118) summary
- Provider activation: Sprint 118 card
- API: `GET /api/v1/admin/control-plane/production-release-engineering-readiness`

## Tests

| Suite | Result |
|-------|--------|
| Unit S118 | **4/4** |
| Playwright S118 | **2/2** |
| Regression S99+S112+S116+S117+S118 | **21/21** |
| Screenshots | `apps/test-results/s118-release-eng-shots/` (**8**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |

## STOP

Sprint 118 complete. Do **not** invent infrastructure. Do **not** auto-start Sprint 119.
