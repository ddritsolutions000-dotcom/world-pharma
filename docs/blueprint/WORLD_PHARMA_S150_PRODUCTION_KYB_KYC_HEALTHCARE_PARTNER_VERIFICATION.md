# WORLD_PHARMA S150 — Production KYC/KYB + Healthcare Partner Verification Activation

**Sprint:** 150  
**Master backlog:** #447  
**Status:** COMPLETE (software) — production KYC/KYB remains **EXTERNAL_GATED** (`NO_PRODUCTION_KYC_KYB_PROVIDER`)  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Complete the **software-side** production KYC/KYB and healthcare partner verification activation path.

Does **not** invent KYC providers, verification results, licenses, accreditation, or production approvals. Sandbox/manual review ≠ production proof.

## Authoritative lifecycle

```
NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED
```

Current evaluated production lifecycle: **NOT_SELECTED**. Enabled: **false**.

### Semantic states (not collapsed)

| State | Meaning |
| --- | --- |
| `DOCUMENT_VERIFIED` | Evidence/document check only |
| `PARTNER_VERIFIED` | Partner identity/business verification |
| `PARTNER_APPROVED` | Explicit approval (SoD) |
| `PRODUCTION_ENABLED` | Production activation |
| `PAYOUT_ENABLED` | Affiliate payout eligibility |
| `CLINICAL_ENABLED` | Clinical/fulfillment enablement |

**Rule:** document verified ≠ partner verified ≠ partner approved ≠ production enabled ≠ payout enabled ≠ clinical enabled. A verified document alone must never activate a healthcare partner.

## Provider adapter

Provider-neutral adapter operations:

- `submitVerification`
- `getVerificationStatus`
- `retrieveEvidenceReference`
- `handleVerificationWebhook`
- `verifyWebhook`
- `reconcileVerification`
- `expireVerification`
- `suspendVerification`

When no real provider is registered:

- `provider = EXTERNAL_GATED` / fail-closed adapter
- `enabled = false`

No fake adapter returns successful production verification.

## Evidence model

Stores **references/metadata only** (provider case ID, verification ID, document reference, timestamp, expiry, status, reviewer/approval reference).

- Raw identity documents stay in private-storage architecture (not unnecessary app-table blobs).
- No public URL exposure of sensitive documents.
- Secrets/credentials never printed in Admin payloads.

## Expiry / suspension

Supported fail-closed paths:

- verification expiry (`VERIFIED → EXPIRED`)
- partner suspension
- rejected verification
- re-verification
- approval withdrawal

Expired / rejected / suspended partners fail closed for production activity.

## Webhook security

Production callbacks require:

- signature verification
- replay protection
- idempotency
- correct environment
- provider identity validation

Unsigned / invalid / wrong-environment / browser-as-callback → rejected.

## Partner-type composition (single framework)

| Partner | Gates → production activation |
| --- | --- |
| Pharmacy/vendor | KYC/KYB + market/licence evidence + approval + catalog/fulfillment |
| Lab | KYC/KYB + accreditation evidence + approval + lab workflow |
| Doctor | KYC/KYB + professional/clinical evidence + approval + clinical enablement |
| Imaging | KYC/KYB + imaging/radiology evidence + approval + PACS readiness |
| Affiliate | KYC/KYB where applicable + payout eligibility + PSP readiness → payout |

No separate incompatible KYC engines. No invented country-specific licenses — policy/market configuration only.

## Global policy behavior

No hardcoded India / INR / GST / PAN / UPI / IST.

Source country, customer market, partner market, and provider jurisdiction remain distinct via existing policy packs.

## Payout / clinical / fulfillment gates

KYC status is consumed (not duplicated) by:

- affiliate payout (S149)
- vendor/pharmacy fulfillment (S135)
- lab production (S136)
- doctor clinical enablement (S137)
- imaging production (S139)

KYC failure/expiry blocks dependent production capability.

## Admin controls

Main Admin card: provider state, verification state, evidence reference, expiry, partner state, approval state, production activation, payout/clinical eligibility, blocker reason.

- Raw credentials never exposed
- Sensitive documents permissioned
- SoD: verifier ≠ approver where required; partner cannot approve itself; client cannot alter verification state

Endpoint: `GET /api/v1/admin/control-plane/production-kyc-kyb-healthcare-partner-verification-activation-path`

## Partner portal

Partner may view own verification status and required next action.

Partner cannot: mark self verified, upload arbitrary success, approve self, alter provider result, or access another partner’s case.

## Secrets / observability / security

- **S142:** credential secret references only; fail closed when secrets manager / credentials / adapter / wrong env / sandbox-in-prod
- **S143:** safe events (`verification_submitted`, `verification_result_received`, `verification_rejected`, `verification_expired`, `partner_approved`, `partner_suspended`, `activation_blocked`, `activation_enabled`) — no identity docs / secrets / PHI
- **S148:** security launch gate remains EXTERNAL_GATED / EVIDENCE_REQUIRED

## Authoritative module

`apps/api/src/partner/production-kyc-kyb-healthcare-partner-verification-activation-path.ts`

Composes S72/S81/S94/S106/**S124** (not rebuilt) + S127/S135–S139/S149 + S142/S143/S148.

## Tests

```bash
npx nx test api --testPathPatterns="s150-production-kyc-kyb" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 9 passed, 9 total

npx nx test api --testPathPatterns="s150-production-kyc-kyb|s124-kyc|s127-lab-partner|s135-pharmacy|s136-lab|s137-doctor|s139-imaging|s149-affiliate-payout|s142-secrets|s143-observability|s148-production-security" --skip-nx-cache
# Test Suites: 11 passed, 11 total | Tests: 84 passed, 84 total
```

## Runtime evidence (2026-09-05)

API rebuilt and **restarted**. Admin `:3001`. Affiliate portal `:3010` (already running).

| Check | Result |
| --- | --- |
| `GET /health` | **200** |
| `GET /health/ready` | **200** |
| `GET /health/version` | **200** |
| KYC activation API unauthenticated | **401** |
| Partner verification prep API unauthenticated | **401** |
| Admin UI `:3001` | **200** |
| Affiliate portal `:3010` | **200** |
| Authenticated Admin OTP/MFA | `AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED` |
| Real production KYC verification runtime | **NOT performed** (no real provider) |

## Explicit answers

| Question | Answer |
| --- | --- |
| Real KYC/KYB provider configured? | **NO** |
| Real verification executed? | **NO** |
| Production partner verification enabled? | **NO** |
| Production pharmacy activation enabled? | **NO** |
| Production lab activation enabled? | **NO** |
| Production doctor activation enabled? | **NO** |
| Production imaging activation enabled? | **NO** |
| Affiliate payout KYC gate enabled? | **YES** (software gate; payout remains EXTERNAL_GATED) |
| Production launch allowed? | **NO** |

## External blockers

- `NO_PRODUCTION_KYC_KYB_PROVIDER`
- `NO_PRODUCTION_KYC_PROVIDER`
- `NO_PRODUCTION_KYC_ADAPTER`
- `KYC_PROVIDER_NOT_SELECTED`
- Partner-type production activation blockers (pharmacy/lab/doctor/imaging/affiliate)
- Secrets manager / security launch external gates (S142/S148)

Software completion ≠ real-world KYC/KYB verification.
