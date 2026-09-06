# WORLD_PHARMA S145 — Production Deployment Target Activation

**Sprint:** 145  
**Master backlog:** #442  
**Status:** COMPLETE (software) — production deployment target remains **NOT_CONFIGURED / EXTERNAL_GATED**  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Close the remaining **software-side** gap around the real production deployment target and deployment-provider activation.

S144 established the release/deployment path. Production remains **NOT_CONFIGURED / EXTERNAL_GATED**.

S145 makes the deployment-target activation path operationally complete **without** inventing a cloud account, server, CI credentials, domain, database, or deployment success.

## Authoritative lifecycle

```
NOT_CONFIGURED → CONFIGURED → VERIFIED → DEPLOYABLE → DEPLOYED
```

Current evaluated lifecycle: **NOT_CONFIGURED**.

Refs-only env presence never advances Admin **PRODUCTION DEPLOYMENT** past **EXTERNAL_GATED** without live verification.

| Claim | Reality in S145 |
| --- | --- |
| SOFTWARE_COMPLETE | Software activation path closed |
| CONFIGURED (live) | **false** |
| VERIFIED | **false** |
| DEPLOYABLE | **false** |
| DEPLOYED | **false** |
| PRODUCTION_ENABLED | **false** |

## Authoritative modules

- `apps/api/src/ops/production-deployment-target-activation-path.ts` (S145 path)
- `apps/api/src/ops/production-deployment-target-activation-contract.ts` (S119 contract retained)

Composes / reuses:

- S99 / S112 / S117 / S118 / S119
- S144 deployment/release engineering
- S142 secrets-manager runtime resolver
- S143 observability

No parallel deployment state machine. No redo of S132–S144 domains.

## Provider-neutral adapter

`DeploymentProviderAdapter` with:

`validateTarget` · `validateCredentialReferences` · `deployArtifact` · `verifyDeployment` · `checkHealth` · `checkReadiness` · `recordDeployment` · `identifyCurrentRelease` · `identifyPreviousKnownGoodRelease` · `rollback`

- Production default: `FailClosedProductionDeploymentAdapter` (**EXTERNAL_GATED**, never reports deploy success)
- Non-production: `SandboxNoopDeploymentAdapter` (cannot operate when env is production; never claims production success)

## Environment safety

Strictly distinguishes development / sandbox / staging / production.

Production target validation rejects: localhost, 127.0.0.1, sandbox/mock/dev.local targets, test/mock providers, missing environment/target/config. Private production networking is not rejected solely for being private — rules are environment/authorization based.

## Credentials (S142)

Deploy credentials are **secret references** only. Production rejects local `.env` fallback, plaintext, sandbox/dev/client credentials. Admin never sees secret values.

## Target verification

Deterministic checks for provider, artifact destination, runtime config, secrets manager, database, observability, health/readiness, rollback reference. Explicit blockers include:

- `NO_PRODUCTION_DEPLOYMENT_TARGET`
- `NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER`
- `NO_PRODUCTION_DEPLOYMENT_ADAPTER`
- `NO_PRODUCTION_DATABASE`
- `NO_PRODUCTION_SECRETS_MANAGER`

No silent sandbox downgrade.

## CI/CD deploy provider

Software stages: SOURCE → BUILD → TEST → ARTIFACT → CONFIG VALIDATION → MIGRATION GATE → DEPLOY → HEALTH → READINESS → RELEASE EVIDENCE.

Existing validate-only CI remains valid. Without a real CI/CD deploy provider: state **EXTERNAL_GATED**, deployment ≠ DEPLOYED, no fake pipeline run.

## Artifact handling

Reuses S144 artifact identity (`APP_VERSION` / `GIT_SHA` / `BUILD_TIME` / optional immutable id). Ambiguous/missing identity → `ARTIFACT_IDENTITY_AMBIGUOUS`.

## Database / migration

Reuses S144 forward-only migration gate. No production DB credentials invented. No local/fake migration called production.

## Secrets / observability

Safe deployment events: deployment ID, artifact identity, environment, target, state, timestamp, correlation ID. Never secrets/tokens/credentials/unnecessary PHI.

## Post-deploy verification sequence

1. deployment acknowledged  
2. artifact identity verified  
3. application startup verified  
4. `/health`  
5. `/health/ready`  
6. `/health/version`  
7. critical dependency readiness  
8. release evidence recorded  

Local/sandbox verification ≠ production verification.

## Rollback

Reuses S144. Requires known-good artifact, authorized request, correct production target, deployment identity, audit event. Schema remains forward-only. Production rollback **not proven** without real production deployment.

## Admin

`GET /api/v1/admin/control-plane/production-deployment-target-activation-path` (`policy:read`)

PRODUCTION DEPLOYMENT card: provider, target state, environment, CI/CD, artifact, configuration, database, secrets, observability, deployment state, current/previous release (null), blockers, external-gated reason. No credentials. No gate bypass.

## Tests

```bash
npx nx test api --testPathPatterns="s145-production-deployment-target" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 12 passed, 12 total

npx nx test api --testPathPatterns="s119-deployment-target|s144-deployment|s142-secrets|s143-observability|s145-production-deployment-target" --skip-nx-cache
# Test Suites: 5 passed, 5 total | Tests: 44 passed, 44 total
```

## Runtime evidence (2026-09-05)

API rebuilt (`nx build api`) and **restarted** (`nx serve api`) before checks. Admin served on `:3001`.

| Check | Result |
| --- | --- |
| `GET /health` | **200** `{"status":"ok"}` |
| `GET /health/ready` | **200** `status=ready` |
| `GET /health/version` | **200** `version=0.0.0`, `git_sha=local` |
| `GET …/production-deployment-target-activation-path` (no auth) | **401** |
| `GET …/deployment-release-engineering-production-activation-path` (no auth) | **401** |
| Admin UI `http://127.0.0.1:3001/` | **200** |
| Admin `/provider-activation` | **200** |

Authenticated Admin browser evidence: **AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED** (OTP/MFA). Do not claim Browser PASS.

## Remaining external blockers

- `NO_PRODUCTION_DEPLOYMENT_TARGET`
- `NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER`
- `NO_PRODUCTION_DEPLOYMENT_ADAPTER`
- `NO_PRODUCTION_DATABASE`
- `NO_PRODUCTION_SECRETS_MANAGER` / adapter
- Real production deploy not executed

**Explicit:** Real production deployment target configured? **NO**. Real CI/CD provider configured? **NO**. Real production deployment executed? **NO**. Production actually DEPLOYED? **NO**. Production actually ENABLED? **NO**.

**Software completion ≠ production deployment.**

**STOP after S145.** Do not auto-start the next sprint.
