# Sprint 70 — PACS / DICOM imaging production onboarding readiness

> **Sprint 93** continues production activation readiness on this foundation. See `docs/ops/S93_PRODUCTION_PACS_DICOM_ACTIVATION_READINESS.md`.
> Primary production blocker remains **`NO_PRODUCTION_PACS_PROVIDER`** (related: `NO_PRODUCTION_PACS_ADAPTER`).

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (SandboxPacsAdapter only) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (study lifecycle + radiologist report + customer report) |
| Production | **EXTERNAL_GATED** |
| Transmission | **SANDBOX_ONLY** |
| Viewer | **EXTERNAL_GATED** |
| Country support | **POLICY_DRIVEN** |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Storage / KMS / retention / malware | **EXTERNAL_GATED** |
| Remaining blocker | **NO_PRODUCTION_PACS_ADAPTER** |

No live PACS vendor, DICOM C-STORE endpoint, clinical viewer, or production credentials were invented.

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| Imaging study | SCHEDULED → CHECKED_IN → ACQUIRED (sandbox workflow) |
| Sandbox DICOM metadata | Private object store payload (`sandbox: true`) — not clinical viewer |
| Radiologist report | Interpretation / SoD / publish text report |
| Production PACS | Requires non-sandbox `PacsAdapter` + storage/KMS + viewer + legal gate — **not present** |

Sandbox study/report **does not** mean production PACS or clinical image viewing.

## Safe path verified

1. Imaging ops + radiologist + customer sandbox workflows remain available.
2. `SandboxPacsAdapter` uses local private object store with idempotent ingest keys.
3. Viewer surfaces report `viewer: false` / EXTERNAL_GATED (no fake Open PACS success).
4. Production healthcare gate includes `NO_PRODUCTION_CLINICAL_ADAPTER` / never sandbox fallback.
5. Enablement guard requires production adapter + storage + KMS + viewer + legal + live flags.
6. Emergency disable: `HEALTHCARE_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_PACS_DICOM` — preserve study/report records.

## Admin

- `/provider-activation` — PACS / DICOM imaging onboarding card
- `GET /api/v1/admin/control-plane/pacs-onboarding`

## Security / clinical prerequisites

See `S70_PACS_DICOM_SECURITY_CLINICAL_GATE.md`.

## When a real PACS provider is supplied

1. Register production `PacsAdapter` (ingest/retrieve + audit; no local-disk production storage).
2. Vault endpoint/AE-title refs; object storage + KMS; optional clinical viewer with short-lived auth.
3. Clear legal/clinical + retention + malware gates with evidence.
4. `PROVIDER_APPROVED_PACS_DICOM=true`.
5. Set `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** transmit/view live clinical DICOM without explicit authorization.
