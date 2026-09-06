# WORLD_PHARMA_S139 — Imaging / PACS / DICOM Production Workflow Closure

**Status:** COMPLETE (software workflow + PACS activation path)  
**Master Index:** #435  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production imaging/PACS workflow:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW`)  
**Real PACS / diagnostic viewer claimed:** NO  
**REPORT = DIAGNOSTIC VIEWER:** false  
**DRAFT = PUBLISHED:** false  

## Implementation completed

Sprint 139 closes the **software-side imaging / radiology workflow** and adds a **provider-neutral PACS/DICOM production activation path** (S137/S138 pattern). Production DICOM ingest and diagnostic viewer remain **fail-closed**.

### Workflow (software)

CUSTOMER / REFERRING CLINICIAN → IMAGING ORDER → SCHEDULING → STUDY / ACCESSION → DICOM INGEST → PACS/STORAGE REFERENCE → RADIOLOGY WORKLIST → INTERPRETATION → REPORT VERIFICATION → REPORT PUBLICATION → CUSTOMER / CLINICIAN ACCESS → HEALTH RECORD

**Separations:** DOCUMENT ≠ PARTNER VERIFIED ≠ RADIOLOGY APPROVED ≠ PRODUCTION ENABLED; DRAFT ≠ VERIFIED ≠ PUBLISHED; **REPORT ≠ DIAGNOSTIC PACS VIEWER**.

### Systems reused

| Component | Source |
| --- | --- |
| Imaging booking / order | `imaging-booking.service.ts` |
| Study / accession | `imaging-study.service.ts` |
| DICOM ingest adapter | `imaging-ingest.service.ts` + `PacsAdapter` / `SandboxPacsAdapter` |
| Report lifecycle | `interpretation.service.ts` + `imaging-report-status.ts` |
| Org access / worklist | Existing radiology controllers + `assertImagingOrgAccess` |
| Private storage | `PrivateObjectStore` |
| PACS onboarding / config | S70/S80/S93 `pacs-first-onboarding.ts`, `production-pacs-requirements.ts` |
| Partner / KYC rails | Existing PartnerStatus + KYC |

### New / extended

1. **`pacs-production-activation-path.ts`** — lifecycle CONFIGURED≠VERIFIED≠APPROVED≠ENABLED; `assertProductionPacsIngestAllowed`.  
2. **`imaging-pacs-dicom-production-workflow-closure.ts`** — workflow report + `evaluateImagingPartnerClinicalEligibility`.  
3. **Runtime wiring** — production DICOM ingest fail-closed; imaging booking partner/KYC gate.  
4. **Admin** — path APIs + Launch/Provider/S93 cards.

## Files changed

- `apps/api/src/radiology/pacs-production-activation-path.ts` (new)
- `apps/api/src/radiology/imaging-pacs-dicom-production-workflow-closure.ts` (new)
- `apps/api/src/radiology/s139-imaging-pacs-dicom-production-workflow-closure.spec.ts` (new)
- `apps/api/src/radiology/imaging-ingest.service.ts`
- `apps/api/src/radiology/imaging-booking.service.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s139-imaging-pacs-workflow.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S139_IMAGING_PACS_DICOM_WORKFLOW_CLOSURE.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Actual PACS / DICOM status

| Field | Status |
| --- | --- |
| PACS provider | NOT_SELECTED / EXTERNAL_GATED |
| DICOM capability | EXTERNAL_GATED (sandbox adapter only) |
| Configuration | Refs only; CONFIGURED possible, never ENABLED |
| Credential reference | Refs only — no raw secrets |
| Viewer | BLOCKED / EXTERNAL_GATED |
| Storage / KMS / malware | EXTERNAL_GATED |
| Production DICOM ingest | BLOCKED |
| Modalities / markets | POLICY_DRIVEN |

## Exact external blockers

1. `NO_PRODUCTION_PACS_PROVIDER` — no genuine production PACS/DICOM provider.  
2. `NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW` — production imaging workflow blocked.  
3. Private storage / KMS / malware scanning still EXTERNAL_GATED.  
4. Secrets-manager runtime resolver still `MISSING`.  
5. SandboxPacsAdapter ≠ production enablement.

## Test results

| Suite | Result |
| --- | --- |
| `s139-imaging-pacs-dicom-production-workflow-closure.spec.ts` | **11/11** |
| `s93-pacs-activation.spec.ts` + `s80-pacs-onboarding.spec.ts` + S138 | PASS (combined **36/36** with S139) |
| `s136` + `s137` + `s125` regression | **17/17** |
| web-customer S139+S138 smoke | **2/2** |

## Production status

Software imaging/PACS workflow: **COMPLETE**  
Production DICOM ingest / viewer: **EXTERNAL_GATED / BLOCKED**  
`CAN_PRODUCTION_LAUNCH`: **NO**
