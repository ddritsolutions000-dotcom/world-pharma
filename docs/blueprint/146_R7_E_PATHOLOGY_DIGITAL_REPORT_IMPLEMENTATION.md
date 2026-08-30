# 146 — R7-E Pathology + digital diagnostic report

**Status:** Implementation  
**Change ID:** **CR-R7-E-IMPL-146**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_E_IMPLEMENTED**

**Authority:** R7-E only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-F NOT STARTED. R8+ NOT STARTED.**  
Live money NOT enabled. No LIS/HIS. No physical report delivery. No production healthcare enablement.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) · [70](70_PATHOLOGY_REPORTING.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| Pathology workflow linked to `LabAccession`, `LabSample`, `LabBooking`, lab org | Physical report delivery (R7-F) |
| Pathologist actor via existing `Person` + `PATHOLOGIST` partner + lab org membership | Second identity system |
| Separation of duties: lab staff enters results; pathologist verifies/publishes | Pathologist result entry |
| Versioned digital report (`DRAFT` → `PENDING_VERIFY` → `VERIFIED` → `PUBLISHED`) | Radiology / imaging |
| Amendment creates new version; published facts immutable | LIS/HIS / EHR |
| Customer final-report view (web + RN) | Unfinalized diagnostic content to customer |
| `web-pathologist` app (port 3006) | Generic partner app |
| web-lab pathology queue + result entry | Admin clinical editing |
| Admin report metadata oversight (no fact rewrite) | Live PSP / payout |
| `HealthArtifact` pointer on publish (minimal R9 foundation) | Full health timeline UX |
| `LAB_REPORT_PUBLISHED` notification (opaque ref only) | Diagnostic values in push/SMS |

---

## 1. Kernels reused (no duplicates)

Identity · Partner/org/location · `LabSample` / `LabSampleCocEvent` / `LabAccession` / `LabProcessing` (R7-C/D) · `LabBooking` · Policy packs · Outbox / notifications · Security events · `PrivateObjectStore` · RLS / `workerTenantContext` · ui-kit / shell-core / shell-web.

---

## 2. Schema / migrations

| Migration | Purpose |
|-----------|---------|
| `20260828180000_r7e_pathology_digital_report` | `lab_reports`, `lab_report_versions`, `lab_result_lines`, `health_artifacts`; enums `LabReportVersionStatus`, `HealthArtifactType`; RLS + grants |
| `20260828180100_r7e_result_lines_delete` | `DELETE` grant + policy on `lab_result_lines` (draft re-entry) |

**Report version state machine (Book 70):**  
`DRAFT` → `PENDING_VERIFY` → `VERIFIED` → `PUBLISHED`  
`PENDING_VERIFY` may return to `DRAFT` (reject). Amendment after `PUBLISHED` creates new `DRAFT` version; prior version preserved.

**Auto-draft:** When `LabProcessing` → `COMPLETED`, `PathologyService.ensureDraftReportForProcessing` creates `LabReport` + version `DRAFT` (idempotent).

---

## 3. API surface

### Pathologist (`PathologistController`)

| Method | Path | Role |
|--------|------|------|
| GET | `/pathologist/work` | Assigned / unassigned pathology queue |
| GET | `/pathologist/reports/:id` | Case detail (minimum necessary) |
| POST | `/pathologist/reports/:id/assign` | Self-assign case |
| POST | `/pathologist/reports/:id/verify` | Verify (SoD — not result entry) |
| POST | `/pathologist/reports/:id/publish` | Publish final digital report |
| POST | `/pathologist/reports/:id/amend` | Amendment → new version |

### Lab operations (extended `LabOperationsController`)

| Method | Path | Role |
|--------|------|------|
| GET | `/lab/pathology` | Lab pathology queue (metadata) |
| GET | `/lab/reports/:id` | Report detail for lab staff |
| POST | `/lab/reports/:id/results` | Result entry (lab staff only; pathologist blocked) |
| POST | `/lab/reports/:id/submit-verify` | Submit for pathologist verification |

### Customer (`CustomerLabBookingController`)

| Method | Path | Role |
|--------|------|------|
| GET | `/me/lab/bookings/:id/report/status` | Safe status only (`report_available`, `report_status`) |
| GET | `/me/lab/bookings/:id/report` | **PUBLISHED** report only (404 before publish) |

### Admin (`AdminLabController`)

| Method | Path | Role |
|--------|------|------|
| GET | `/admin/lab/reports` | Governance metadata only (no clinical edit) |

---

## 4. Pathologist actor

- `PATHOLOGIST` partner type activates with `org_staff` lab membership (existing partner kernel).
- Scoped to authorized lab org via membership + RLS.
- No global company permissions, finance permissions, or unrelated patient access.
- `assertNotPathologistOnly` blocks all `PATHOLOGIST` partners from result entry (SoD).

---

## 5. PHI minimization

- Customer APIs return structured analyte lines only after `PUBLISHED`; pre-publish returns safe status / 404.
- No prescriptions, clinical notes, diagnoses, encounter history, finance, or internal pathologist notes on customer surfaces.
- Notifications: `LAB_REPORT_PUBLISHED` with booking/report id reference only — no diagnostic values.
- Audit/security events use IDs (`LAB_REPORT_*` types) — no report body in logs.
- Published blob stored in `PrivateObjectStore`; customer API returns structured JSON, not raw blob URL in ordinary flow.

---

## 6. Apps & screens (UI completeness gate)

### web-pathologist (`apps/web-pathologist`) — route `/` (port 3006)

| Screen | Route/Nav | API | loading | empty | error | 401 | 403 | session | network | success | failure | validation | a11y/responsive |
|--------|-----------|-----|---------|-------|-------|-----|-----|---------|---------|---------|---------|------------|-----------------|
| Sign in (OTP) | `/` unauthenticated | shell OTP | — | — | — | ✓ | — | — | — | ✓ | — | email | FormField + shell |
| Session expired | `/` expired | — | — | — | — | — | — | ✓ | — | — | — | — | SessionExpiredState |
| Lab selector | `/` authenticated | `GET /lab/organizations` | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | list | — | org required | select + shell |
| Worklist | `/` main | `GET /pathologist/work` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | case cards | API error | lab_org_id | cards + HeaderBar |
| Case review | inline panel | assign/verify/publish/amend | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | actions | onError | amend reason | FormField + buttons |
| Forbidden | shell | — | — | — | — | — | ✓ | — | — | — | — | — | PermissionDeniedState |

### web-lab (`apps/web-lab`) — tab `Pathology`

| Screen | Nav tab | API | States |
|--------|---------|-----|--------|
| Pathology queue | Pathology | `GET /lab/pathology` | loading, empty, error (shell), 401, 403, session, network |
| Report detail | Pathology (Open) | `GET /lab/reports/:id` | success, error |
| Result entry + submit verify | Pathology (DRAFT row) | `POST .../results`, `POST .../submit-verify` | validation, success, failure |
| Org required empty | Pathology | — | empty when no org selected |

### Customer web (`apps/web-customer`)

| Screen | Route | API | States |
|--------|-------|-----|--------|
| Lab bookings list | `/lab/bookings` | `GET /me/lab/bookings` | loading, empty, error, 401, 403, session, network |
| Lab booking detail + report status | `/lab/bookings/[id]` | booking + collection + report | `report_status`, `report_available`; pre-publish safe message |
| View final report | inline on detail | `GET .../report` | loading, 404/unavailable, success, 403 (wrong customer), network |

### Customer mobile (`apps/mobile` — shared RN, iOS + Android)

| Screen | API | States |
|--------|-----|--------|
| `LabBookingsScreen` | `GET /me/lab/bookings` | via `FeatureStates` |
| `LabBookingDetailScreen` | collection + `GET .../report` | loading, error, 401, 403, session, network, report unavailable, final report view |

### Admin (`apps/web-admin`)

| Surface | API | Notes |
|---------|-----|-------|
| Lab partners panel (existing) | `GET /admin/lab/reports` via API only in e2e | Metadata governance; no clinical edit UI added (minimum R7-E) |

---

## 7. Security / RLS

- `FORCE RLS` on `lab_reports`, `lab_report_versions`, `lab_result_lines`, `health_artifacts`.
- Lab A ↛ Lab B; pathologist A ↛ pathologist B cases; customer A ↛ customer B reports.
- Ordinary lab staff ↛ pathologist verify/publish without `PATHOLOGIST` partner.
- Pathologist ↛ result entry (403).
- Admin ↛ rewrite finalized clinical facts (metadata list only).
- Illegal report transitions → 409 `ILLEGAL_REPORT_TRANSITION`.
- Published version blob + result lines protected from silent overwrite.

---

## 8. Tests & regression (28 Aug 2026)

| Suite | Result |
|-------|--------|
| API | **66/66** suites · **157/157** tests PASS |
| R7-E e2e | `r7e.pathology-digital-report.e2e.spec.ts` PASS |
| R7-D / R7-C / R7-B / R7-A / R3 / R5 / R6 / RLS | included in API suite PASS |
| Workspace tests | **11/11** projects PASS (**227** tests total) |
| Typecheck | **21/21** projects PASS |
| web-customer build | PASS |
| web-lab build | PASS |
| web-pathologist build | PASS |
| web-admin build | PASS |
| mobile (customer) typecheck | PASS |
| mobile-phlebotomist typecheck | PASS |
| mobile-delivery typecheck | PASS |
| Web tests (admin, customer, shell-*, ui-kit) | **24/24** suites · **45/45** tests PASS |

**R7-E focused coverage:** pathologist auth · SoD · Lab A ↛ B · pathologist isolation · accession/sample isolation · result entry authorization · illegal transitions · verify/publish authorization · finalized immutability · amendment versioning · customer final-only · unauthorized report access · admin metadata only · PHI minimization · notification safety (opaque ref) · pack fail-closed (inherited) · audit trail.

---

## 9. Production boundary

Sandbox pathology interpretation only. No official e-report legal claim (OD-LAB-08). No live money. No LIS/HIS. No physical report delivery. No radiology. No production healthcare enablement.

**STOP** at R7-E — next authorized step is **CR-R7-F-IMPL** (physical report + sandbox finance hooks) only after explicit authorization.

---

## Final declaration

**FINAL STATUS: R7_E_IMPLEMENTED**

**R7-F NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No physical report delivery.**  
**No production healthcare enablement.**

**STOP.**
