# WORLD_PHARMA S142 — Secrets-Manager Runtime Resolver

**Sprint:** 142  
**Master backlog:** #439  
**Status:** COMPLETE (software) — external vault remains EXTERNAL_GATED  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Remove the **software** blocker `SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING` that was blocking production activation path reports across S132–S141.

This sprint does **not** invent vault credentials, cloud secret stores, or claim any production provider is ENABLED.

## Implementation status

| Item | Status |
| --- | --- |
| Authoritative runtime contract | COMPLETE |
| Provider-neutral resolver abstraction | COMPLETE |
| Sandbox/dev env adapter | COMPLETE |
| Production fail-closed adapter | COMPLETE |
| Environment isolation | COMPLETE |
| Least-privilege caller policy | COMPLETE |
| Admin presence-only visibility | COMPLETE |
| Wire into S132–S140 activation paths | COMPLETE |
| External secrets-manager provider | EXTERNAL_GATED |
| Any production secret/provider ENABLED | NO |

## Supported environments

Explicit isolation:

`development` ≠ `sandbox` ≠ `staging` ≠ `production`

| Runtime | Adapter | Behavior |
| --- | --- | --- |
| development / sandbox / staging | `SandboxEnvSecretsManagerAdapter` | May resolve env-backed refs for local/test |
| production | Registered production adapter **or** `FailClosedProductionSecretsManagerAdapter` | Never falls back to `.env` / mock / sandbox |

## Resolver lifecycle

```
NOT_SELECTED → EXTERNAL_GATED → CONFIGURED → VERIFIED → APPROVED → ENABLED
```

Software rules:

- Secret **ref** ≠ secret **value**
- CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED
- Resolving a secret successfully ≠ provider production-enabled
- Production remains `enabled: false` until a genuine adapter is registered **and** ops enablement exists (not invented in S142)

Admin summary mapping (presence only):

| Admin SECRETS_MANAGER | Meaning |
| --- | --- |
| NOT_CONFIGURED | No production secrets-manager provider/ref selected |
| CONFIGURED | Provider + ref present |
| VERIFIED | Human verification marker set |
| EXTERNAL_GATED / BLOCKED | External vault/adapter missing or mock rejected |

## Fail-closed behavior

Production rejects:

- missing secrets manager / adapter
- missing / invalid secret reference
- wrong-environment refs
- sandbox/mock/placeholder refs in production
- unauthorized callers (`unknown`)
- browser / mobile callers
- silent `.env` / mock / local fallback

Errors never embed secret material (redaction gate).

## Provider integration points

Activation paths now report `secrets_manager_runtime_resolver: SOFTWARE_COMPLETE`:

- PSP / payment (S132)
- OTP / transactional communications (S133)
- Carrier / logistics (S134)
- eRx (S137)
- Telemedicine / video (S138)
- PACS / DICOM (S139)
- Private storage / KMS / malware (S140)
- Backup / PITR / DR (S141) — consumes shared resolver contract; recovery still EXTERNAL_GATED

Provider lifecycle gates remain unchanged:

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`

## Security model

Reuses existing:

- `ops/secret-redaction.ts`
- Admin `policy:read` control-plane authz
- Server-only resolution (`SecretCaller.kind`)

Never returned to Admin / clients / logs / API responses:

- API keys, private keys, webhook secrets, OTP credentials, payment credentials, vault material

Admin may see: provider, secret **reference**, configured/verified flags, rotation/health metadata placeholders, blocker reason.

## Authoritative module

`apps/api/src/ops/secrets-manager-runtime-resolver.ts`

Nest facade: `SecretsManagerRuntimeService` in `apps/api/src/security/secrets.ts`  
Admin GET: `/api/v1/admin/control-plane/secrets-manager-runtime-resolver`

## Tests

Focused commands (exact):

```bash
npx nx test api --testPathPatterns="s142-secrets-manager-runtime-resolver" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 11 passed, 11 total

npx nx test api --testPathPatterns="s142-secrets-manager-runtime-resolver|s98-secrets-env-activation|s132-psp-payment-production-activation-path|s133-otp-messaging-production-activation-path|s134-carrier-logistics-production-activation-path|s137-doctor-consultation-erx|s138-telemedicine|s139-imaging-pacs|s140-private-storage" --skip-nx-cache
# Test Suites: 9 passed, 9 total | Tests: 90 passed, 90 total
```

## Remaining external blockers

- `NO_PRODUCTION_SECRETS_MANAGER`
- `NO_PRODUCTION_SECRETS_MANAGER_ADAPTER`
- Real vault / KMS / cloud secrets-manager contract, credentials, and ops approval
- All S132–S141 domain providers remain EXTERNAL_GATED / NOT ENABLED

## Explicit statement

**No production secret and no production provider was actually enabled by S142.**  
Software resolver COMPLETE ≠ production readiness.
