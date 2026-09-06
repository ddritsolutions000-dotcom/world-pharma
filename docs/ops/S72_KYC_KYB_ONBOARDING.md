# Sprint 72 — KYC / KYB + healthcare partner verification activation readiness

> **Sprint 94** continues production activation readiness on this foundation. See `docs/ops/S94_PRODUCTION_KYC_KYB_ACTIVATION_READINESS.md`.
> Primary production blocker remains **`NO_PRODUCTION_KYC_KYB_PROVIDER`** (related: `NO_PRODUCTION_KYC_PROVIDER`).

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (manual sandbox review only) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (partner document upload + Admin manual review) |
| Production | **EXTERNAL_GATED** |
| Verification status | **SANDBOX_ONLY** |
| Identity / business / credentials | **SANDBOX_ONLY** (manual) |
| Beneficiary / affiliate KYC | **EXTERNAL_GATED** |
| Country support | **POLICY_DRIVEN** |
| Legal/compliance gate | **EXTERNAL_GATED** |
| Object storage / KMS / malware | **EXTERNAL_GATED** |
| PHI separation | **SANDBOX_VERIFIED** (KYC ≠ clinical records) |
| Remaining blocker | **NO_PRODUCTION_KYC_PROVIDER** |

No KYC vendor, accreditation registry, real license numbers, or live verification credentials were invented.

Manual sandbox document review **is not** production KYC.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Configuration / credentials alone **never** imply production enablement. Enablement requires:

- non-mock production KYC provider
- `INFRASTRUCTURE_ENVIRONMENT=production`
- `KYC_LIVE_ENABLED=true`
- `PROVIDER_APPROVED_KYC=true`
- legal/compliance + privacy/DPA
- production object storage + KMS + malware scanning
- no emergency disable

## Approval vs verification

| Concept | Meaning |
|---------|---------|
| DOCUMENT VERIFIED | Sandbox/manual review of an uploaded evidence file |
| PARTNER APPROVED | Operational onboarding decision (separate) |
| PRODUCTION ENABLED | Live KYC provider + flags after enablement guard |

Example: doctor credential verified in sandbox ≠ eRx legally enabled. Pharmacy documents verified ≠ all medicine categories fulfillable. Affiliate KYC sandbox ≠ payout provider live.

## Partner-type model (policy-driven)

| Partner | Focus | Status here |
|---------|-------|-------------|
| Vendor / pharmacy | Legal entity, license where applicable, authorized rep, country, address, payout dependency | SANDBOX_ONLY |
| Doctor | Professional identity, license, jurisdiction, specialty, expiry, status | SANDBOX_ONLY |
| Lab | Org identity, accreditation, authorized operator, jurisdiction, expiry | SANDBOX_ONLY |
| Imaging | Facility + radiologist credentials / modality authorization | SANDBOX_ONLY |
| Affiliate | Identity, beneficiary, tax/payment where required, country eligibility | EXTERNAL_GATED |

Country-specific legal requirements not established in policy → **POLICY_REQUIRED** / **LEGAL_REVIEW_REQUIRED**. Do not hardcode India/IN/INR/₹/UPI/+91/IST into global KYC logic.

## Document lifecycle (existing enums)

**Case:** `NOT_STARTED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → VERIFIED | REJECTED | ADDITIONAL_INFORMATION_REQUIRED | EXPIRED`

**Document:** `UPLOADED → UNDER_REVIEW → VERIFIED | REJECTED | RETIRED`

Safe transitions enforced via `kyc-state.ts`. `VERIFIED → EXPIRED` is supported — verified today is not verified forever. Uploading a file does **not** auto-verify.

## Security model

- Documents tenant-scoped; short-lived / private object access (no permanent public URLs)
- Cross-partner isolation (affiliate ↛ vendor docs; vendor ↛ doctor credentials; customer ↛ partner KYC)
- Admin review permission-scoped (`policy:read` inspect; restricted actions need review permissions)
- Secrets / raw document bytes / unnecessary PHI not returned in activation reports or list UIs
- Production must not silently fall back to local filesystem storage
- Malware scanning / KMS remain **EXTERNAL_GATED** until real adapters exist

## PHI / clinical separation

Identity/business verification documents stay outside clinical PHI workflows. Credential reviewers do not automatically gain clinical access. Doctor credential docs are not customer-visible.

## Admin

- `/provider-activation` — KYC / KYB onboarding card
- `/partners` — application + document review
- `/healthcare-network` — healthcare partner context
- `GET /api/v1/admin/control-plane/kyc-onboarding`

## Payout dependency

Affiliate beneficiary verification and production payout remain **EXTERNAL_GATED** (see Sprint 71). Sandbox KYC review does not unlock live disbursement.

## Emergency disable

- `KYC_LIVE_ENABLED=false`
- `PROVIDER_EMERGENCY_DISABLE_KYC=true` or `PROVIDER_EMERGENCY_DISABLE_ALL=true`

Preserve partner application state; do not invent live verification.

## When a real KYC provider is supplied

1. Register non-mock KYC/accreditation adapter + vault secret refs.
2. Production private storage + KMS + malware scanner.
3. Country coverage matrix by partner type; clear legal/privacy gates.
4. `PROVIDER_APPROVED_KYC=true`.
5. Set production environment + `KYC_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** treat sandbox manual review as legally attested verification.
