# Sprint 68 — eRx / electronic prescribing production onboarding readiness

> **Sprint 78** stabilizes this rail for production activation readiness. See `docs/ops/S78_ERX_ONBOARDING.md`. Remaining blocker: **NO_PRODUCTION_ERX_PROVIDER** (related: `NO_PRODUCTION_CLINICAL_ADAPTER`).

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (NullERxAdapter + SandboxERxAdapter only) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (internal Rx + optional sandbox adapter) |
| Production | **EXTERNAL_GATED** |
| Transmission | **SANDBOX_ONLY** — not legally transmitted eRx |
| Webhook | **NOT_APPLICABLE** / EXTERNAL_GATED for production |
| Country support | **POLICY_DRIVEN** (`rx_erx_enabled` / pack provider code) |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Controlled substances | **LEGAL_GATED** |
| Pharmacy network | **EXTERNAL_GATED** |
| Remaining blocker | `NO_PRODUCTION_CLINICAL_ADAPTER` |

No live eRx SDK, credentials, DEA/controlled capability, or pharmacy network were introduced.

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| INTERNAL prescription | `Prescription` DRAFT → ISSUED / CANCELLED / … in World-Pharma |
| eRx submission record | `PrescriptionErxSubmission` when pack enables eRx path |
| LEGAL transmission | Requires non-mock `ERxPort` + legal gate + live flags — **not present** |

`ISSUED` internal prescription **does not** mean legally transmitted eRx.

## Safe path verified

1. Doctor may create/issue internal prescriptions in sandbox.
2. `ErxRouter` only wires `sandbox` when `ERX_PROVIDER=sandbox`; otherwise Null adapter.
3. Production healthcare gate always includes `NO_PRODUCTION_CLINICAL_ADAPTER` and `never_fallback_to_sandbox_adapter`.
4. Enablement guard requires non-mock adapter + production env + live flag + human approval + legal gate + callback readiness.
5. Submission idempotency uses unique `prescriptionVersionId` + outbox `occurrenceKey`.
6. Emergency disable: `HEALTHCARE_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_ERX` — preserve clinical records; do not invent SUBMITTED legal status.

## Admin

- `/provider-activation` — eRx onboarding card
- `GET /api/v1/admin/control-plane/erx-onboarding`

## Legal / clinical prerequisites

See `S68_ERX_LEGAL_CLINICAL_GATE.md`.

## When a real eRx provider is supplied

1. Register non-mock `ERxPort` adapter (submit/status/cancel + callbacks).
2. Vault secret refs; org/account id; market capability matrix.
3. Clear legal/clinical gate items with evidence.
4. `PROVIDER_APPROVED_ERX=true`.
5. Set `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** transmit a real prescription without explicit authorization.
