# Sprint 81 — Production KYC/KYB + healthcare partner verification activation readiness

Stabilization of the **Sprint 72** KYC-first onboarding path. No KYC/KYB vendor, license, accreditation, or live verification result was invented.

> **Sprint 94** continues production activation readiness on this foundation. See `docs/ops/S94_PRODUCTION_KYC_KYB_ACTIVATION_READINESS.md`. Remaining blocker: **NO_PRODUCTION_KYC_KYB_PROVIDER**.

## Provider status (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (manual sandbox review only) |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** |
| Production | **EXTERNAL_GATED** |
| Verification | **SANDBOX_ONLY** |
| Beneficiary / affiliate KYC | **EXTERNAL_GATED** |
| Private storage | **PRIVATE_STORAGE_EXTERNAL_GATED** |
| KMS | **KMS_EXTERNAL_GATED** |
| Malware scan | **MALWARE_SCAN_EXTERNAL_GATED** |
| Webhook | **EXTERNAL_GATED** |
| Country support | **POLICY_DRIVEN** |
| Legal/compliance gate | **EXTERNAL_GATED** |
| Remaining blocker | **NO_PRODUCTION_KYC_KYB_PROVIDER** |
| Related adapter gate | `NO_PRODUCTION_KYC_PROVIDER` |

Manual sandbox document review **is not** production KYC.

## Approval vs verification

| Concept | Meaning |
|---------|---------|
| DOCUMENT VERIFIED | Sandbox/manual review of an uploaded evidence file |
| PARTNER APPROVED | Operational onboarding decision (separate) |
| PRODUCTION ENABLED | Live KYC provider + flags after enablement guard |

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Credentials / local storage alone ≠ ENABLED.

## Verification / document lifecycle

**Case:** `NOT_STARTED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → VERIFIED` (exceptions: ADDITIONAL_INFORMATION_REQUIRED, REJECTED, EXPIRED)

**Document:** `UPLOADED → UNDER_REVIEW → VERIFIED | REJECTED | RETIRED`

`VERIFIED → EXPIRED` supported. REJECTED is terminal in current enum. Idempotent submission; terminal overwrite forbidden.

## Partner types

| Partner | Status here |
|---------|-------------|
| Vendor / pharmacy | SANDBOX_ONLY |
| Doctor | SANDBOX_ONLY |
| Lab | SANDBOX_ONLY |
| Imaging | SANDBOX_ONLY |
| Affiliate beneficiary | EXTERNAL_GATED |

Country-specific rules → POLICY_REQUIRED / LEGAL_REVIEW_REQUIRED / LEGAL_GATED. No hardcoded INR / ₹ / UPI / +91 / IST.

## Partner activation gating

Unverified partners must not receive production operational / clinical / payout privileges. Activation state remains distinct from verification state.

## Access control

- Tenant + cross-partner document isolation
- Customer cannot access partner KYC
- Admin activation ≠ universal document access
- Review permission-scoped

## Admin

- `/provider-activation` — KYC / KYB activation readiness (Sprint 81)
- `/partners` — sandbox manual review queue
- `/healthcare-network` — healthcare partner view
- `GET /api/v1/admin/control-plane/kyc-onboarding`

## Production activation sequence

1. Register production KYC/KYB provider + accreditation sources.
2. Vault credentials; private object storage + KMS + malware scanner.
3. Clear legal/compliance + privacy/DPA + country policy packs with evidence.
4. `PROVIDER_APPROVED_KYC=true`.
5. `INFRASTRUCTURE_ENVIRONMENT=production` + `KYC_LIVE_ENABLED=true` only after `can_enable=true`.
6. Do **not** claim live identity/license verification without authorization.

## Explicit blockers

- **NO_PRODUCTION_KYC_KYB_PROVIDER**
- PRIVATE_STORAGE_EXTERNAL_GATED · KMS_EXTERNAL_GATED · MALWARE_SCAN_EXTERNAL_GATED
- Production = **EXTERNAL_GATED**

## Exact tests performed

- Unit S81: `s81-kyc-onboarding.spec.ts` **10/10**
- Regression: S72 **17/17**, S64 **10/10**, S73 **14/14**, S75 **15/15**, S77 **12/12**, S78 **11/11**, S79 **12/12**, S80 **10/10**
- Playwright: S81 **2/2**, S72 **2/2**
- Browser evidence: `apps/test-results/s81-kyc-shots/`
- Status artifact: `apps/test-results/s81-kyc/final-kyc-status.json`
- Native Android/iOS: **DEVICE_NOT_AVAILABLE** (390px = RESPONSIVE_WEB_VERIFIED only)

See also: `S72_KYC_KYB_ONBOARDING.md`, `S72_KYC_SECURITY_COMPLIANCE_GATE.md`.
