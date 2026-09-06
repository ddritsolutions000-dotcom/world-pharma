# Sprint 106 — KYC/KYB + Healthcare Partner Verification Activation Readiness

**Status:** COMPLETE (software readiness)  
**Real KYC/KYB provider selected:** **NO**  
**Production KYC/KYB enabled:** **NO**  
**Real healthcare registry/verification connected:** **NO**  
**Real partner production verified:** **NO**  
**Production privilege enabled:** **NO**  
**Lifecycle:** `NOT_SELECTED` / `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_KYC_KYB_PROVIDER`  
**Composes:** S72/S81/S94 + S87/S95/S98/S100/S101 (+ S105 foundation reuse)  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**SANDBOX / MANUAL REVIEW ≠ PRODUCTION / EXTERNAL PROVIDER**  
**DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED**  
**READY_FOR_ACTIVATION ≠ ENABLED**  
**Manual sandbox adapters must never silently become production KYC providers**  
**No invented KYC vendors, registries, licences, certificates, or credentials**  
**No fake production activation**  
**Healthcare credential fields are policy-driven — never asserted as globally legally sufficient**  
**Native Android/iOS: DEVICE_NOT_AVAILABLE**

---

## Architecture reused

| Plane | Role |
|-------|------|
| S72 / S81 | KYC/KYB + partner verification foundation |
| S94 | KYC first-onboarding + production requirements validation |
| S87 | Production Launch Control (fail-closed) |
| S100 | Provider Activation control plane (reused) |
| S101 | Production foundation gates (env/secrets/DB/deploy) |
| S106 | Real-activation compose layer (`kyc-real-activation-first-onboarding.ts`) |

Admin surface: Sprint **106** card on `/provider-activation` (above Sprint 94).  
API: `GET /api/v1/admin/control-plane/production-kyc-real-activation-onboarding` (`policy:read`).

---

## Provider lifecycle

`NOT_SELECTED` → `CONFIGURATION_REQUIRED` → `CREDENTIALS_REQUIRED` → `VERIFICATION_REQUIRED` → `APPROVAL_REQUIRED` → `READY_FOR_ACTIVATION` → `ENABLED` / `DISABLED` / `EXTERNAL_GATED`

Initial state without a real KYC provider: **NOT_SELECTED** / **EXTERNAL_GATED**.  
Runtime adapter today: `manual_sandbox_review` (sandbox only).

---

## Partner types

Production privilege remains **EXTERNAL_GATED** for:

- `VENDOR` (pharmacy/vendor) — business KYC/KYB
- `DOCTOR` — healthcare credential verification distinct from business KYC
- `LAB` — laboratory authorization (policy-driven)
- `IMAGING` — imaging/facility authorization (policy-driven)
- `AFFILIATE` — beneficiary/KYC subject to payout eligibility gates

---

## Document lifecycle

Supported statuses (from S94): uploaded → pending → under_review → verified → rejected → expired → revoked (where supported).

Gating rules:

- Document **VERIFIED** does not imply partner **APPROVED**
- Partner **APPROVED** does not imply production **ENABLED**
- Expired/revoked verification loses production privileges
- Documents remain private, tenant-scoped, permission-controlled, audited

---

## Healthcare verification model

Policy/config-driven reference fields (not legal claims):

- professional licence
- facility/business licence
- pharmacy / laboratory / imaging authorization
- registration/registry reference
- jurisdiction/country
- expiry date
- verification status
- reviewer decision
- audit trail

Market applicability: GLOBAL / IN / AE / US — each **PRODUCTION_EXTERNAL_GATED** / healthcare **LEGAL_GATED**.  
No India-specific rules hardcoded into global logic.

---

## Exact unresolved external blockers

- `NO_PRODUCTION_KYC_KYB_PROVIDER` (umbrella)
- `NO_PRODUCTION_KYC_PROVIDER` (related adapter)
- `KYC_PROVIDER_NOT_SELECTED`
- `KYC_CREDENTIAL_REFERENCE_MISSING`
- `KYC_API_ENDPOINT_REFERENCE_MISSING`
- `KYC_CALLBACK_CONFIGURATION_MISSING`
- `KYC_MARKET_POLICY_CONFIGURATION_MISSING`
- `KYC_PARTNER_TYPE_CONFIGURATION_MISSING`
- `KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING`
- `KYC_STORAGE_KMS_DEPENDENCY_GATED`
- `KYC_MALWARE_SCAN_DEPENDENCY_GATED`
- plus S101 foundation gates where applicable (`NO_PRODUCTION_ENVIRONMENT`, secrets, database, deployment)

---

## What is sandbox / manual

- Manual Admin partner document review
- Sandbox partner portals (vendor/doctor/lab/imaging/affiliate)
- Unsigned KYC webhook remains fail-closed
- Console/sandbox verification paths

## What is genuinely production-ready (software)

- Activation lifecycle model + Admin control plane visibility
- Fail-closed production gates when provider/credentials/registry missing
- Privilege gating contracts for unverified partners
- Launch Control composition (cannot force-enable)
- Tenant/RBAC/audit/document privacy contracts

## What remains externally gated

- Real KYC/KYB vendor selection + commercial account
- Vaulted production credentials + webhook/callback security
- Healthcare registry / market policy packs
- Private storage + KMS + malware scan dependencies
- Human approval after verification evidence
- Production environment / secrets / database / deployment foundation

---

## Evidence

- Unit: `apps/api/src/partner/s106-kyc-real-activation.spec.ts` — **4/4** (focused suite); related S72/S81/S94/S87/S100/S101/S105 compose **56/56**
- Playwright: `apps/web-customer/src/__tests__/s106-kyc.spec.ts` — **3/3**
- Regression Playwright: S94 + S105 + S87 — **8/8**
- Screenshots: `apps/test-results/s106-kyc-shots/` (**16**)
- Status JSON: `apps/test-results/s106-kyc/final-kyc-status.json`
- Master Index: **#404**

**STOP** — do not invent a KYC provider or claim production partner verification from sandbox review.
