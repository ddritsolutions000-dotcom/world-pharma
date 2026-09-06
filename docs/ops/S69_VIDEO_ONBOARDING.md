# Sprint 69 — Telemedicine / live video production onboarding readiness

> **Sprint 92** stabilizes this rail for production activation readiness. See `docs/ops/S92_PRODUCTION_VIDEO_ACTIVATION_READINESS.md`. Remaining blocker: **NO_PRODUCTION_VIDEO_PROVIDER** (related: `NO_PRODUCTION_CLINICAL_ADAPTER`).

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (MockVideoProvider default; LiveKit refs ≠ production selection) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (appointment + consultation + mock video path) |
| Production | **EXTERNAL_GATED** |
| Session creation | **SANDBOX_ONLY** |
| Live session | **SANDBOX_ONLY** / **NOT_VERIFIED** for production |
| Participant authorization | **SANDBOX_VERIFIED** |
| Consent | **SANDBOX_VERIFIED** (existing clinical consent) |
| Recording | **EXTERNAL_GATED** (disabled in adapters; storage/KMS gated) |
| Country support | **POLICY_DRIVEN** |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Remaining blocker | `NO_PRODUCTION_CLINICAL_ADAPTER` |

No fake meeting URLs, production tokens, recordings, or clinical certifications were invented.

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| Appointment | Booking / status (CONFIRMED, CHECKED_IN, …) |
| Video session | `VideoSession` CREATED → READY → JOINED → IN_PROGRESS → ENDED |
| Consultation | Encounter clinical workflow |
| Live telemedicine | Requires production video vendor + legal gate + live flags — **not present** |

`APPOINTMENT CONFIRMED` **does not** mean `VIDEO SESSION ACTIVE`.

## Safe path verified

1. Sandbox consultation workflow remains available.
2. `VIDEO_PROVIDER=mock` / missing LiveKit → MockVideoProvider (sandbox only).
3. LiveKit env refs (if present) do **not** flip production to ENABLED.
4. Production healthcare gate always includes `NO_PRODUCTION_CLINICAL_ADAPTER`.
5. Enablement guard requires non-mock production adapter + legal gate + recording policy + live flags.
6. Session transitions enforced (`video-status.ts`); illegal transitions blocked.
7. Emergency disable: `HEALTHCARE_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_VIDEO` — preserve appointments; do not invent completed consults.

## Admin

- `/provider-activation` — Telemedicine / live video onboarding card
- `GET /api/v1/admin/control-plane/video-onboarding`

## Legal / clinical prerequisites

See `S69_VIDEO_LEGAL_CLINICAL_GATE.md`.

## When a real video provider is supplied

1. Register production `VideoProviderPort` adapter (create/join/end + webhook verify).
2. Vault secret refs; project/account id; allowed origins; regions.
3. Clear legal/clinical gate with evidence; keep recording off until storage/KMS + consent cleared.
4. `PROVIDER_APPROVED_VIDEO=true`.
5. Set `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** run a real patient video session without explicit authorization.
