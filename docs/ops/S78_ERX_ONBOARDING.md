# Sprint 78 — Production eRx activation readiness

Stabilization of the **Sprint 68** eRx-first onboarding path. No eRx vendor was invented.

## Provider status (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (NullERxAdapter + SandboxERxAdapter only) |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (internal Rx + optional sandbox adapter) |
| Production | **EXTERNAL_GATED** |
| Transmission | **SANDBOX_ONLY** — not legally transmitted eRx |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Controlled substances | **LEGAL_GATED** |
| Pharmacy network | **EXTERNAL_GATED** |
| Country support | **POLICY_DRIVEN** |
| Remaining blocker | **NO_PRODUCTION_ERX_PROVIDER** |
| Related clinical gate | `NO_PRODUCTION_CLINICAL_ADAPTER` (healthcare production gate) |

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| INTERNAL prescription | `Prescription` DRAFT → ISSUED / CANCELLED / … |
| eRx submission record | `PrescriptionErxSubmission` when pack enables eRx path |
| LEGAL transmission | Requires non-mock `ERxPort` + legal gate + live flags — **not present** |

`ISSUED` internal prescription **does not** mean legally transmitted eRx.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Configured ≠ ENABLED. Credentials alone ≠ production transmission.

## Prescription lifecycle

Internal: `DRAFT → ISSUED → FULLY_DISPENSED` with exceptions `SUPERSEDED` / `CANCELLED` / `EXPIRED`.

Submission: `PENDING` / `SUBMITTED` / `FAILED` / `UNSUPPORTED` / `CANCELLED` (sandbox only until real provider).

Idempotency: `prescriptionVersionId` + outbox occurrence keys. Terminal overwrite forbidden.

## Permissions

- Customer: own prescriptions only  
- Doctor: scoped clinical access  
- Pharmacy/vendor: minimum necessary for fulfillment  
- Admin: activation oversight ≠ universal PHI  
- Tenant isolation enforced  

## Country / regulatory

Policy-driven. No hardcoded INR / ₹ / UPI / +91 / IST / India-only assumptions in the eRx rail.

Unknown market legality → **EXTERNAL_GATED** / **POLICY_REQUIRED** — do not invent legal rules.

## Observability

Audit events + correlation IDs. No PHI/secrets in logs. `NOT_SELECTED` is a controlled gate, not a false outage.

## Emergency disable

- `HEALTHCARE_LIVE_ENABLED=false`
- or `PROVIDER_EMERGENCY_DISABLE_ERX`

Preserve clinical records; do not invent SUBMITTED legal status.

## Admin

- `/provider-activation` — eRx activation readiness (Sprint 78)
- `/healthcare-network` — clinical network oversight
- `GET /api/v1/admin/control-plane/erx-onboarding`

## Production activation sequence

1. Register non-mock `ERxPort` adapter (submit/status/cancel + callbacks).
2. Vault secret refs; org/account id; market capability matrix.
3. Clear legal/clinical gate items with evidence.
4. `PROVIDER_APPROVED_ERX=true`.
5. `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after `can_enable=true`.
6. Do **not** transmit a real prescription without explicit authorization.

## Explicit blockers

- **NO_PRODUCTION_ERX_PROVIDER**
- Production = **EXTERNAL_GATED**
- Do **not** mark World-Pharma production-ready while eRx and other external gates remain open.

See also: `S68_ERX_ONBOARDING.md`, `S68_ERX_LEGAL_CLINICAL_GATE.md`.
