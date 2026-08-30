# 164 — R8-D Radiologist interpretation + SoD implementation

**CR:** CR-R8-D-IMPL-164  
**Verdict:** **R8_D_IMPLEMENTED**  
**Date:** 2026-08-29  
**Canonical plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md)  
**Depends:** R8-C [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md); audit [163](163_POST_R8_C_AUDIT.md) (**R8_C_GREEN_R8_D_READY**)

---

## 1. Scope delivered (R8-D only)

| Area | Status |
|------|--------|
| Radiologist partner type `RADIOLOGIST` | Added to policy catalog + seed |
| DB: `ImagingReport`, `ImagingReportVersion`, `ImagingFindingLine` | Migrated with RLS |
| API: `/radiologist/*` worklist, case, assign, findings, submit, verify | Implemented |
| `apps/web-radiologist` | Created (port 3007) |
| `web-radiology` interpretation ops tab | Metadata-only queue |
| Customer operational progress (no findings) | Web + RN via existing progress API |
| SoD: enterer ≠ verifier | Server-enforced |
| Sign-off boundary (`VERIFIED`) | Terminal for R8-D |

## 2. Hard stops respected

| Not started | Status |
|-------------|--------|
| R8-E customer report publication | **NOT STARTED** — no publish endpoint, no `HealthArtifactType.IMAGING_REPORT`, no customer report UI |
| R8-F physical delivery | **NOT STARTED** |
| Production PACS / DICOM / image viewer | **OFF** |
| Live money / PSP / carriers | **OFF** |

**R8-D / R8-E boundary:** Interpretation data exists in `imaging_report_versions` + `imaging_finding_lines` for radiologist workflow only. Customer `boundary.report` remains `false`. `VERIFIED` is the R8-D terminal state; `PUBLISHED` enum value exists for schema parity but has no R8-D API path.

---

## 3. Migrations

| Migration | Purpose |
|-----------|---------|
| `20260829120000_r8d_imaging_interpretation` | Tables, enums, RLS, `RADIOLOGIST` partner type seed |
| `20260829120100_r8d_imaging_interpretation_rls_fix` | Allow `VERIFIED` transition under RLS WITH CHECK |

### Schema (additive)

- **Enum:** `ImagingReportVersionStatus` — `DRAFT`, `PENDING_VERIFY`, `VERIFIED`, `PUBLISHED`
- **`imaging_reports`** — 1:1 with `imaging_studies` / `imaging_bookings`; `assigned_radiologist_person_id`; `current_version_id`
- **`imaging_report_versions`** — versioned interpretation; SoD actor columns
- **`imaging_finding_lines`** — structured findings (code, text, body region, severity)

---

## 4. APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/radiologist/organizations` | Imaging centers for radiologist membership |
| GET | `/api/v1/radiologist/worklist?imaging_org_id=` | Assigned + unassigned interpretable cases |
| GET | `/api/v1/radiologist/verify-queue?imaging_org_id=` | `PENDING_VERIFY` queue |
| GET | `/api/v1/radiologist/cases/:studyId?imaging_org_id=` | Case detail + sandbox acquisition metadata |
| POST | `/api/v1/radiologist/reports/:id/assign` | Claim assignment |
| POST | `/api/v1/radiologist/reports/:id/findings` | Draft findings (DRAFT only) |
| POST | `/api/v1/radiologist/reports/:id/submit` | Submit for verification |
| POST | `/api/v1/radiologist/reports/:id/verify` | Verify / sign-off (SoD) |
| GET | `/api/v1/radiology/interpretations?imaging_org_id=` | Imaging center ops metadata (no findings) |

**Not implemented (R8-E):** `POST .../publish`, `POST .../amend`, customer report GET.

---

## 5. Apps / surfaces

### `apps/web-radiologist` (new)

- Sign-in (OTP, `partner_applicant` audience)
- Organization selector
- Worklist + verify queue tabs
- Case review (sandbox acquisition placeholder — explicit, no viewer)
- Assignment, draft findings, submit, verify/sign-off
- Error states: loading, empty, 401, 403, network

### `apps/web-radiology` (extended)

- **Interpretation** tab — ops metadata via `GET /radiology/interpretations`
- Studies panel — `interpretation_status` on study rows

### Customer web / RN

- Progress API returns operational states: `INTERPRETATION_IN_PROGRESS`, `INTERPRETATION_VERIFIED`
- No diagnostic findings in responses or notifications

---

## 6. Security / RLS

- All new tables: `ENABLE` + `FORCE RLS`; **no `USING(true)`**
- Radiologist: `RADIOLOGIST` partner + `IMAGING_CENTER` membership
- Worklist isolation: org-scoped; cross-org 403
- Assignment required before draft edit; SoD on verify
- Technician / non-radiologist: 403 on `/radiologist/*`
- Customer: no direct access to interpretation tables; operational status via worker-scoped progress query only

---

## 7. PHI

| Data | Who can access |
|------|----------------|
| Finding lines + summary | Assigned radiologist, org radiologists (verify queue), imaging org staff (org scope) |
| Customer progress | Operational status + note only — **no findings** |
| Notifications / outbox | Opaque IDs only — **no diagnostic content** |
| Admin | Not extended for clinical editing in R8-D |

---

## 8. DICOM / PACS

| Item | R8-D status |
|------|-------------|
| Sandbox `sandbox_object_ref` on acquisition | **ON** (metadata pointer only) |
| Production PACS | **OFF** |
| Real DICOM transfer | **OFF** |
| Image storage / viewer | **OFF** — UI shows explicit sandbox placeholder |

---

## 9. Tests (2026-08-29)

| Suite | Result |
|-------|--------|
| `r8d.radiologist-interpretation.e2e.spec.ts` | 1/1 |
| `r8c.imaging-acquisition.e2e.spec.ts` | 1/1 (progress expectation updated) |
| `r8b` + `r8a` + `r7e` regression | 5/5 |
| Full API e2e | **72/72 suites, 167/167 tests** |
| `web-radiologist` build | PASS |
| `web-radiology` build | PASS |

---

## 10. Production boundaries

Live PSP, real money, bank payouts, real carriers, production healthcare, production LiveKit, recording, LIS/HIS, production PACS, real DICOM, image storage, image viewer, R8-E publication, R8-F, R9+ — **all OFF**.

---

## 11. Next authorized phase

**R8-E** — digital imaging report publication (`HealthArtifactType.IMAGING_REPORT`, customer report access, immutability triggers). Requires **`CR-R8-E-IMPL-*`**.
