# Sprint 79 — Production telemedicine / live video activation readiness

Stabilization of the **Sprint 69** video-first onboarding path. No video vendor was invented.

> **Sprint 92** continues production activation readiness on this foundation. See `docs/ops/S92_PRODUCTION_VIDEO_ACTIVATION_READINESS.md`. Remaining blocker: **NO_PRODUCTION_VIDEO_PROVIDER**.

## Provider status (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (MockVideoProvider; LiveKit refs ≠ production selection) |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** |
| Production | **EXTERNAL_GATED** |
| Session creation | **SANDBOX_ONLY** |
| Live session | **SANDBOX_ONLY** |
| Consent | **SANDBOX_VERIFIED** (production LEGAL_GATED) |
| Recording | **PRODUCTION_RECORDING_EXTERNAL_GATED** |
| Webhook | **EXTERNAL_GATED** (no production provider webhook) |
| Country support | **POLICY_DRIVEN** |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Remaining blocker | **NO_PRODUCTION_VIDEO_PROVIDER** |
| Related clinical gate | `NO_PRODUCTION_CLINICAL_ADAPTER` |

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| Appointment | Booking / status |
| Video session | CREATED → READY → JOINED → IN_PROGRESS → ENDED |
| Consultation | Encounter clinical workflow |
| Live telemedicine | Requires production vendor + legal gate + live flags — **not present** |

`APPOINTMENT CONFIRMED` ≠ `VIDEO SESSION LIVE`.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

LiveKit sandbox env refs alone ≠ ENABLED.

## Session lifecycle

Valid path: `CREATED → READY → DOCTOR_JOINED / CUSTOMER_JOINED → IN_PROGRESS → ENDED`

Exceptions: `FAILED` / `EXPIRED`. Terminal overwrite forbidden. Duplicate start/end idempotent.

## Consent + security

Sandbox consent gate remains. Missing consent blocks session progression.

Tokens: scoped to session, participant-validated, secrets server-side only, never logged. Sandbox tokens ≠ production credentials.

## Recording / webhooks

Recording: **PRODUCTION_RECORDING_EXTERNAL_GATED** (storage/KMS/legal).

Production webhooks: **EXTERNAL_GATED** until a real provider is selected. Do not invent a webhook contract.

## Country / policy

Policy-driven. No hardcoded INR / ₹ / UPI / +91 / IST. Unknown market legality → LEGAL_GATED / POLICY_REQUIRED / EXTERNAL_GATED.

## Emergency disable

- `HEALTHCARE_LIVE_ENABLED=false`
- or `PROVIDER_EMERGENCY_DISABLE_VIDEO`

Preserve appointments; do not invent completed consults.

## Admin

- `/provider-activation` — Telemedicine / live video activation readiness (Sprint 79)
- `GET /api/v1/admin/control-plane/video-onboarding`

## Production activation sequence

1. Register production `VideoProviderPort` adapter (create/join/end + webhook verify).
2. Vault secret refs; project/account; allowed origins; regions.
3. Clear legal/clinical gate; keep recording off until storage/KMS + consent cleared.
4. `PROVIDER_APPROVED_VIDEO=true`.
5. `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after `can_enable=true`.
6. Do **not** run a real patient video session without explicit authorization.

## Explicit blockers

- **NO_PRODUCTION_VIDEO_PROVIDER**
- Production = **EXTERNAL_GATED**

See also: `S69_VIDEO_ONBOARDING.md`, `S69_VIDEO_LEGAL_CLINICAL_GATE.md`.
