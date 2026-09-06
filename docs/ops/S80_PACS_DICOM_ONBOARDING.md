# Sprint 80 — Production PACS / DICOM imaging activation readiness

Stabilization of the **Sprint 70** PACS-first onboarding path. No PACS/DICOM vendor was invented.

> **Sprint 93** continues production activation readiness on this foundation. See `docs/ops/S93_PRODUCTION_PACS_DICOM_ACTIVATION_READINESS.md`. Remaining blocker: **NO_PRODUCTION_PACS_PROVIDER**.

## Provider status (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (SandboxPacsAdapter only) |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** |
| Production | **EXTERNAL_GATED** |
| Transmission | **SANDBOX_ONLY** |
| Viewer | **EXTERNAL_GATED** |
| Private storage | **PRIVATE_STORAGE_EXTERNAL_GATED** |
| KMS | **KMS_EXTERNAL_GATED** |
| Malware scan | **MALWARE_SCAN_EXTERNAL_GATED** |
| Webhook | **EXTERNAL_GATED** |
| Backup/recovery | **EXTERNAL_GATED** |
| Country support | **POLICY_DRIVEN** |
| Legal/clinical gate | **EXTERNAL_GATED** |
| Remaining blocker | **NO_PRODUCTION_PACS_PROVIDER** |
| Related adapter gate | `NO_PRODUCTION_PACS_ADAPTER` |

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| Imaging study | SCHEDULED → CHECKED_IN → ACQUIRED (sandbox) |
| Sandbox DICOM metadata | Private object store payload (`sandbox: true`) — not clinical viewer |
| Radiologist report | Interpretation / SoD / publish text report |
| Production PACS | Requires non-sandbox adapter + storage/KMS + viewer + legal gate — **not present** |

Sandbox study/report **does not** mean production PACS or clinical image viewing.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Credentials / local storage alone ≠ ENABLED.

## Study / report lifecycle

Study: `SCHEDULED → CHECKED_IN → ACQUISITION_IN_PROGRESS → ACQUIRED` (exceptions FAILED/CANCELLED).

Report: draft → finalize/publish → customer visibility after appropriate state. Terminal overwrite forbidden. Idempotent ingest keys.

## Access control

- Customer: own reports only  
- Radiologist: assigned/permitted studies  
- Imaging operator: scoped  
- Admin activation ≠ universal image access  
- Tenant isolation  

## Country / policy

Policy-driven. No hardcoded INR / ₹ / UPI / +91 / IST. Unknown legality → LEGAL_GATED / POLICY_REQUIRED / EXTERNAL_GATED.

## Emergency disable

- `HEALTHCARE_LIVE_ENABLED=false`
- or `PROVIDER_EMERGENCY_DISABLE_PACS_DICOM`

Preserve study/report records.

## Admin

- `/provider-activation` — PACS / DICOM imaging activation readiness (Sprint 80)
- `GET /api/v1/admin/control-plane/pacs-onboarding`

## Production activation sequence

1. Register production `PacsAdapter` (ingest/retrieve + audit; no local-disk production storage).
2. Vault endpoint/AE-title refs; private object storage + KMS; malware scanner; clinical viewer with short-lived auth.
3. Clear legal/clinical + retention gates with evidence.
4. `PROVIDER_APPROVED_PACS_DICOM=true`.
5. `HEALTHCARE_ENVIRONMENT=production` + `HEALTHCARE_LIVE_ENABLED=true` only after `can_enable=true`.
6. Do **not** transmit/view live clinical DICOM without explicit authorization.

## Explicit blockers

- **NO_PRODUCTION_PACS_PROVIDER**
- PRIVATE_STORAGE_EXTERNAL_GATED · KMS_EXTERNAL_GATED · MALWARE_SCAN_EXTERNAL_GATED
- Production = **EXTERNAL_GATED**

## Exact tests performed

- Unit S80: `s80-pacs-onboarding.spec.ts` **10/10**
- Regression: S70 **13/13**, S64 **10/10**, S73 **14/14**, S74 **16/16**, S75 **15/15**, S77 **12/12**, S78 **11/11**, S79 **12/12**
- Playwright: S80 **2/2**, S70 **2/2**
- Browser evidence: `apps/test-results/s80-pacs-shots/`
- Status artifact: `apps/test-results/s80-pacs/final-pacs-status.json`
- Native Android/iOS: **DEVICE_NOT_AVAILABLE** (390px = RESPONSIVE_WEB_VERIFIED only)

See also: `S70_PACS_DICOM_ONBOARDING.md`, `S70_PACS_DICOM_SECURITY_CLINICAL_GATE.md`.
