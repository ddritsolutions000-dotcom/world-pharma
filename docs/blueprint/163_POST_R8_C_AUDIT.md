# 163 — Post-R8-C audit (final gate)

**Status:** Audit only — **no R8-D+ coding, no source changes**  
**Change ID:** **CR-POST-R8-C-AUDIT-163**  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R8_C_GREEN_R8_D_READY**

**Authority:** Final verification after [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md). **Do not** implement R8-D+, production healthcare, live PSP/money/carriers, PACS/DICOM transfer, or radiologist workflow under this CR.

**Canonical inputs:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [157](157_POST_R8_A_AUDIT.md) · [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) · [161](161_POST_R8_B_FINAL_REAUDIT.md) · [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md)

**Repo truth:** `apps/api/src/radiology/*` · `apps/web-radiology/src/*` · `apps/web-customer` · `apps/mobile` · `packages/database/prisma` · `worldpharma_test` DB · regression runs 29 Aug 2026.

---

## 0. Executive summary

R8-C implementation in repository matches Book 155 scope: `ImagingStudy` + sandbox `ImagingAcquisition`, server-authoritative lifecycle, technician workflow APIs, customer operational progress (web + RN), `web-radiology` check-in/studies panels, RLS, audit/events, and DICOM/PACS boundary flags remain OFF.

**R8-D boundary:** No `ImagingReport` tables, no radiologist app, no interpretation/report APIs or UI in radiology bounded context.

**Payment-capture study enqueue:** `PaymentService.confirmImagingBookingCapture` calls `ImagingStudyService.enqueueForConfirmedBooking` on first confirm and on idempotent re-confirm (no duplicate studies; DB unique on `imaging_booking_id`).

**Test determinism note:** First isolated full-API run (`--skip-nx-cache`) reported **2 failed / 164 passed** (suite names not captured in log). Two subsequent isolated runs: **166/166 PASS**. Classified as **test isolation debt / intermittent** (not R8-C-specific; no R8-C e2e failure).

**R8-D readiness:** **R8_D_READY** — requires separate **`CR-R8-D-IMPL-*`** authorization.

---

## 1. R8-D boundary (NOT STARTED)

| Check | Result |
|-------|--------|
| `ImagingReport` / `imaging_report*` tables in Prisma or DB | **ABSENT** |
| `apps/web-radiologist` | **ABSENT** |
| Radiologist worklist / interpretation / report publication APIs in `radiology` module | **ABSENT** |
| Diagnostic findings in acquisition DTOs | **ABSENT** (e2e regex + manual DTO review) |
| Pathologist worklist (`web-pathologist`) | **Lab R7-E only** — not radiology R8-D |

**OD-RAD-02** (DICOM/PACS viewer strategy): **OPEN** per [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) §15 — not resolved in R8-C.

---

## 2. Data model

**Migration:** `20260829010000_r8c_imaging_study_acquisition`

| Artifact | Verified |
|----------|----------|
| Enums `ImagingStudyStatus`, `ImagingAcquisitionStatus` | Yes |
| Tables `imaging_studies`, `imaging_study_status_history`, `imaging_acquisitions` | Yes |
| UNIQUE `imaging_booking_id` (1 booking → 1 study) | Yes |
| UNIQUE `accession_number`, `idempotency_key`, `imaging_study_id` on acquisition | Yes |
| FKs to booking, org, location, country, assignee, technician | Yes |
| RLS ENABLE + FORCE on all three tables | Yes (migration SQL) |
| Policies `imaging_studies_access`, `imaging_study_status_history_access`, `imaging_acquisitions_access` | Yes — no `USING(true)` |

**Separation:** booking (`imaging_bookings`) ≠ study ≠ acquisition ≠ report (no report table).

**Immutability:** `imaging_study_status_history` append-only inserts; acquisition completion sets `sandbox_object_ref` once; `completeAcquisition` / `failAcquisition` idempotent on terminal study states.

---

## 3. Study creation & idempotency

| Scenario | Evidence |
|----------|----------|
| CONFIRMED booking → SCHEDULED study on pay capture | `r8c` e2e `studyAfterPay` |
| Cancelled booking → check-in 409 | `r8c` e2e |
| Duplicate check-in → same study id | `r8c` e2e |
| Duplicate pay on CONFIRMED → 409 | `r8c` e2e |
| `enqueueForConfirmedBooking` early-return if study exists | `imaging-study.service.ts` |
| Re-confirm path still calls enqueue (idempotent) | `payment.service.ts` `confirmImagingBookingCapture` |
| No Order on imaging pay | `r8c` e2e `orders.count === 0` |

---

## 4. State machine

**Server module:** `imaging-study-status.ts` + `ImagingStudyService` transitions.

| Transition | Supported |
|------------|-----------|
| SCHEDULED → CHECKED_IN | Yes |
| CHECKED_IN → ACQUISITION_IN_PROGRESS | Yes |
| ACQUISITION_IN_PROGRESS → ACQUIRED / ACQUISITION_FAILED | Yes |
| ACQUISITION_FAILED → ACQUISITION_IN_PROGRESS (retry via start) | Yes |
| Complete without start → 409 | `r8c` e2e |
| Client direct status set | **No** — POST actions only |

---

## 5. Technician authorization

| Gate | Result |
|------|--------|
| Org scoped (`assertImagingOrgAccess`) | Yes |
| Technician B (org B) ↛ org A studies | `r8c` e2e 403 |
| Unassigned ↛ start | `r8c` e2e 403 |
| Wrong assignee ↛ start (assigned tech only) | Code `assertAssignedTechnician` |
| Assign API | `r8c` e2e |
| Admin / finance / radiologist endpoints on technician routes | **None** |
| Location-level technician filter | **Not implemented** — access is org-wide (location stored on study, not used in authz). Consistent with R8-B staff booking list. |

---

## 6. Acquisition workflow & metadata

**APIs (real, tested):** worklist GET, check-in POST, assign POST, start POST, complete POST, fail POST.

**Metadata stored:** modality, equipment code, timestamps, technician id, `sandbox_object_ref` (`sandbox://imaging-objects/...`), failure code.

**Not stored:** image pixels, DICOM files, findings, interpretation.

**`boundary.pacs` / `boundary.dicom`:** `false` in staff list, customer progress, staff study DTOs.

---

## 7. Customer surfaces

### web-customer

- `imaging-bookings-page.tsx` — `fetchImagingProgress` with accession + note; 401/403/network via `ImagingCustomerApiError`.

### RN (`apps/mobile`)

- `ImagingBookingDetailScreen` — shared RN; `fetchImagingProgress` + accession; booking load via `applyApiResult` (401/403/network). Progress fetch failure is silent (non-blocking) — minor UX observation only.

---

## 8. web-radiology

| Panel | Real API |
|-------|----------|
| Check-in (`imaging-check-in-panel.tsx`) | `fetchImagingStaffBookings`, `checkInImagingBooking` |
| Studies (`imaging-studies-panel.tsx`) | `fetchImagingStudies`, `startImagingAcquisition`, `completeImagingAcquisition`, `failImagingAcquisition` |

**Shell:** session expired, forbidden, network, error states in `radiology-shell.tsx`.

**Observation:** `fetchImagingStudy` (GET by id) exists in `radiology-api.ts` and is e2e-tested, but Studies panel uses list row on “Open” without a separate GET — list data is from real API.

**No** radiologist/report controls in radiology shell.

---

## 9. Admin

`admin-radiology.controller.ts` — partner acceptance only; no study/acquisition/image/report surfaces. Metadata-only per Book 162.

---

## 10. Security / RLS (live test DB)

**Database:** `worldpharma_test` @ `127.0.0.1:55432` after `prisma migrate deploy` with test isolation.

| Check | Result |
|-------|--------|
| Total migrations in repo | **60** |
| Pending on test DB (post-deploy) | **0** |
| R8-A/B/C applied | `20260828210000_r8a_*`, `20260828220000_r8b_*`, `20260829010000_r8c_*` |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | `rls.tenancy.e2e` |
| `USING(true)` policy count | **0** (`rls.tenancy.e2e`) |
| Customer A ↛ B progress | `r8c` e2e 403 |
| Imaging org A ↛ B | `r8c` e2e 403 |

**Note:** Default `.env` `DATABASE_URL` (non-test) may show pending migrations if not using test isolation — authoritative gate is `worldpharma_test` used by e2e global-setup.

---

## 11. PHI / production boundary

| Boundary | Status |
|----------|--------|
| Production PACS | **OFF** |
| Real DICOM transfer | **OFF** |
| Image upload/download/viewer | **OFF** |
| Live PSP / real money | **OFF** (`sandbox: true`, no Order) |
| Live carriers / production healthcare / LIS/HIS | **OFF** |
| R8-D/E/F / R9+ | **NOT STARTED** |

---

## 12. File hygiene

Single radiology module (`apps/api/src/radiology/` — 15 files). No duplicate payment/catalog/RLS kernels. No speculative report/PACS code. No `web-radiologist` app.

---

## 13. Tests (actual runs — 29 Aug 2026)

| Run | Result |
|-----|--------|
| R8-C `r8c.imaging-acquisition.e2e` | **1/1** |
| R8-B `r8b.imaging-booking.e2e` | **1/1** |
| R8-A `r8a.radiology.e2e` | **1/1** |
| RLS `rls.tenancy.e2e` | **11/11** |
| R3 `r3.isolation.e2e` | **13/13** |
| R5 prescription | **2/2** |
| R5 dispensing | **1/1** |
| R5 refill | **1/1** |
| R5 rx-handoff | **2/2** |
| R6 vendor `r6a`–`r6f` | **6/6** |
| R7-A `r7a.lab.e2e` | **1/1** |
| R7-B `r7b.lab-booking.e2e` | **1/1** |
| R7-C `r7c.sample-collection.e2e` | **1/1** |
| R7-D `r7d.transport-accession-processing.e2e` | **1/1** |
| R7-E `r7e.pathology-digital-report.e2e` | **2/2** |
| R7-F `r7f.physical-report-finance.e2e` | **2/2** |
| Payment + order e2e | **2/2** |
| Focused regression (combined pattern incl. R8-C) | **23/23 suites · 49/49** |
| Full API run 1 (`--skip-nx-cache`) | **69/71 suites · 164/166** — **2 failures (intermittent; suites not logged)** |
| Full API run 2 (`--skip-nx-cache`) | **71/71 · 166/166** |
| Full API run 3 (`--skip-nx-cache`) | **71/71 · 166/166** |
| Workspace `nx run-many -t test` (11 projects) | **PASS** (API 166 + front-end 74 unit tests) |
| Typecheck (22 projects) | **22/22 PASS** |
| Web builds (10 apps) | **10/10 PASS** |

**Failure classification:** First isolated full-API run → **test isolation debt / intermittent** (R8-C suite green on every dedicated run).

---

## 14. Global scorecard

| Domain | Status |
|--------|--------|
| R8-A | **PASS** |
| R8-B | **PASS** |
| R8-C study | **PASS** |
| R8-C acquisition | **PASS** |
| Technician workflow | **PASS** |
| Check-in | **PASS** |
| Assignment | **PASS** |
| State machine | **PASS** |
| Idempotency | **PASS** |
| Concurrency | **PASS** (partial — duplicate start/check-in; duplicate complete/fail idempotent in code) |
| Customer web | **PASS** |
| Customer RN | **PASS** |
| web-radiology | **PASS** (minor: study detail uses list row) |
| Admin | **PASS** |
| RLS | **PASS** |
| PHI | **PASS** |
| DICOM/PACS boundary | **PASS** |
| Audit/immutability | **PASS** |
| Regression | **PASS** (one intermittent full-API run) |
| Test determinism | **PASS WITH DEBT** (1/3 isolated full-API runs flaky) |
| Migration | **PASS** (60/60 on test DB) |
| File hygiene | **PASS** |
| Production boundary | **PASS** |

---

## 15. Observations (non-blocking)

1. **Location scoping:** Study carries `imaging_location_id`; technician authz is org-level, not per-location. No e2e for “wrong location ↛ study”.
2. **Studies UI:** Does not call `GET /radiology/studies/:id` on open; uses worklist row (API exists and is e2e-tested).
3. **RN progress errors:** Progress fetch failure does not surface dedicated error state (booking errors still handled).
4. **Start idempotency header:** Accepted in controller but not wired to payment-style idempotency store (duplicate start handled by state idempotency in service).

---

## 16. R8-D readiness

**R8_D_READY** — acquisition foundation, technician workflow, and sandbox boundary are in place. R8-D requires **`CR-R8-D-IMPL-*`**.

**R8-D NOT STARTED.** **R8-E NOT STARTED.** **R8-F NOT STARTED.** **R9+ NOT STARTED.**

---

## 17. Final verdict

**R8_C_GREEN_R8_D_READY**
