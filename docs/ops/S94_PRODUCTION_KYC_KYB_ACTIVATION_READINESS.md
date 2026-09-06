# Sprint 94 — Production KYC/KYB + Healthcare Partner Verification Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production KYC/KYB enabled:** **NO**  
**Provider:** `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED`  
**Verification:** `SANDBOX_ONLY`  
**Primary blocker:** `NO_PRODUCTION_KYC_KYB_PROVIDER`  
**Foundation:** Sprint 81 + Sprint 72  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED**  
**Manual sandbox review ≠ external KYC/KYB provider verification**

Sandbox partner document upload + Admin manual review remain available.

---

## Current status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Runtime | Manual sandbox review only |
| Sandbox | `SANDBOX_VERIFIED` |
| Verification | `SANDBOX_ONLY` |
| Object storage | `PRIVATE_STORAGE_EXTERNAL_GATED` (S82) |
| KMS | `KMS_EXTERNAL_GATED` |
| Malware scan | `MALWARE_SCAN_EXTERNAL_GATED` |
| Webhook | `EXTERNAL_GATED` |
| Beneficiary | `EXTERNAL_GATED` |
| Force-launch | **false** |
| Native Android/iOS | `DEVICE_NOT_AVAILABLE` |

No KYC vendor, licenses, accreditation registry results, or identity evidence were invented.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`.

---

## Required external configuration (references)

| Category | Example key |
|----------|-------------|
| Credential | `KYC_PROVIDER_SECRET_REF` |
| API endpoint | `KYC_API_ENDPOINT_REF` |
| Callback secret | `KYC_CALLBACK_SECRET_REF` |
| Market policy pack | `KYC_MARKET_POLICY_CONFIG_REF` |
| Partner-type pack | `KYC_PARTNER_TYPE_CONFIG_REF` |
| Healthcare registry | `KYC_HEALTHCARE_REGISTRY_CONFIG_REF` |

Also requires cleared S82 private storage + KMS + malware rails before production document ingestion.

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_KYC_KYB_PROVIDER`** (+ related **`NO_PRODUCTION_KYC_PROVIDER`**)

Granular: `KYC_PROVIDER_NOT_SELECTED`, `KYC_CREDENTIAL_REFERENCE_MISSING`, `KYC_API_ENDPOINT_REFERENCE_MISSING`, `KYC_CALLBACK_CONFIGURATION_MISSING`, `KYC_MARKET_POLICY_CONFIGURATION_MISSING`, `KYC_PARTNER_TYPE_CONFIGURATION_MISSING`, `KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING`, `KYC_STORAGE_KMS_DEPENDENCY_GATED`, `KYC_MALWARE_SCAN_DEPENDENCY_GATED`

---

## Case / document lifecycle

Case: `NOT_STARTED` → `IN_PROGRESS` → `SUBMITTED` → `UNDER_REVIEW` → `VERIFIED`  
Exceptions: `ADDITIONAL_INFORMATION_REQUIRED` / `REJECTED` / `EXPIRED`  

Document: `UPLOADED` → `UNDER_REVIEW` → `VERIFIED` (+ `REJECTED` / `RETIRED`)

- VERIFIED can expire  
- Timeout ≠ auto-VERIFIED  
- Duplicate callbacks idempotent  
- Sandbox review must not masquerade as external verification  

---

## Partner types / privilege boundary

Sandbox-only / policy-driven gates for: vendor/pharmacy, doctor, lab, imaging.  
Affiliate beneficiary remains EXTERNAL_GATED for production payout.

Unverified partners must not receive production privileges requiring verification.

---

## Country / policy

Policy-driven evaluation markets: **GLOBAL / IN / AE / US**.  
Do not invent regulatory document rules; unmodeled requirements = `LEGAL_REVIEW_REQUIRED` / policy gate.

---

## Required external approvals

1. Signed KYC/KYB vendor contract + DPA  
2. Vault credential / endpoint / webhook refs  
3. Country + partner-type policy packs  
4. Healthcare registry connectivity where required  
5. S82 private storage + KMS + malware production readiness  
6. Human `PROVIDER_APPROVED_KYC` + `KYC_LIVE_ENABLED` **after** enablement guard  

---

**PRODUCTION KYC/KYB ENABLED = NO**  
**CAN_PRODUCTION_LAUNCH = NO**
