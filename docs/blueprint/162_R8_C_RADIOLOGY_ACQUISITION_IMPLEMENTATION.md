# 162 — R8-C Radiology acquisition + technician workflow

**Status:** Implementation  
**Change ID:** **CR-R8-C-IMPL-162**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R8_C_IMPLEMENTED**

**Authority:** R8-C only per [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **R8-D/E/F NOT STARTED. R9+ NOT STARTED.**

**Sources:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [157](157_POST_R8_A_AUDIT.md) · [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) · [161](161_POST_R8_B_FINAL_REAUDIT.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| `ImagingStudy` + `ImagingAcquisition` sandbox metadata | `ImagingReport` / interpretation |
| Server-authoritative study lifecycle | Radiologist worklist |
| Technician check-in / assign / start / complete / fail | DICOM transfer / image storage |
| Sandbox `sandbox_object_ref` placeholder only | Production PACS |
| Customer operational progress (web + RN) | Diagnostic findings in any payload |
| `web-radiology` check-in + acquisition worklist | Technician mobile app (deferred per ED-R8-TECH-SURFACE) |
| Outbox + security events for acquisition | Physical report delivery |
| RLS on all new tables | Live PSP / real money / Order creation |

**Production PACS = OFF.** **Real DICOM transfer = OFF.** **OD-RAD-02** remains unresolved.

---

## 1. Kernels reused (no duplicates)

Identity · tenancy · policy · catalog · imaging booking (R8-B) · payment (`payImagingBooking` capture hook) · outbox/events · security events · RLS helpers · ui-kit / shell-web.

No duplicate identity, tenant, payment, notification, catalog, or policy kernels.

---

## 2. Schema / migration

| Migration | Purpose |
|-----------|---------|
| `20260829010000_r8c_imaging_study_acquisition` | Study + acquisition tables, enums, indexes, FKs, RLS |

**Enums:** `ImagingStudyStatus` (`SCHEDULED`, `CHECKED_IN`, `ACQUISITION_IN_PROGRESS`, `ACQUIRED`, `ACQUISITION_FAILED`, `CANCELLED`); `ImagingAcquisitionStatus` (`IN_PROGRESS`, `COMPLETED`, `FAILED`).

**Tables:** `imaging_studies` (1:1 `imaging_booking_id` UNIQUE) · `imaging_study_status_history` · `imaging_acquisitions` (1:1 `imaging_study_id` UNIQUE).

**Indexes:** booking id, accession number, idempotency key; org/country/assignee + status; acquisition technician + status.

**FKs:** booking → study; org, location, country, assignee; study → history/acquisition.

**RLS policies:** `imaging_studies_access`, `imaging_study_status_history_access`, `imaging_acquisitions_access` — worker/platform/customer-person/imaging-org/assignee/technician scoped; **no `USING(true)`**.

---

## 3. API surface

### Imaging staff / technician (`/api/v1/radiology`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/me` | Actor `person_id` for self-assign |
| GET | `/studies` | Acquisition worklist (`imaging_org_id`, optional `status`) |
| GET | `/studies/:id` | Study detail |
| POST | `/check-in` | Eligible CONFIRMED booking → CHECKED_IN; optional assignee |
| POST | `/studies/:id/assign` | Assign technician |
| POST | `/studies/:id/start` | Start acquisition (assigned technician only) |
| POST | `/studies/:id/complete` | Complete + sandbox object ref |
| POST | `/studies/:id/fail` | Acquisition exception |

### Customer (`/api/v1/me/imaging`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/bookings/:id/progress` | Extended operational progress + `boundary` flags |

**Study creation:** idempotent `enqueueForConfirmedBooking` on sandbox payment capture (`PaymentService.confirmImagingBookingCapture`) and on `ImagingBookingService.confirmFromPayment`.

---

## 4. Study lifecycle

`SCHEDULED` → `CHECKED_IN` → `ACQUISITION_IN_PROGRESS` → `ACQUIRED` | `ACQUISITION_FAILED` (retry path → `CHECKED_IN` via re-check-in after fail). Illegal transitions rejected server-side. Client cannot set status directly.

---

## 5. Customer UI

### web-customer

- `imaging-bookings-page.tsx` — progress + accession display on booking detail.

### mobile (RN)

- `ImagingBookingDetailScreen` in `customer-features.tsx` — progress + accession from `/progress` API.

---

## 6. Technician UI (`web-radiology`)

| Tab | Component | Workflow |
|-----|-----------|----------|
| Check-in | `imaging-check-in-panel.tsx` | CONFIRMED bookings → check-in + assign |
| Studies | `imaging-studies-panel.tsx` | Worklist → start → complete / fail |

Shell tabs: `check-in`, `studies` in `radiology-shell.tsx`. API client in `radiology-api.ts`.

---

## 7. Admin

No new admin screens. Existing imaging partner acceptance + security events provide metadata-only governance per Book 155 §14.

---

## 8. DICOM / PACS boundary

| Allowed | Blocked |
|---------|---------|
| `sandbox_object_ref` opaque pointer (`sandbox://imaging-objects/...`) | Real PACS connection |
| Modality / equipment metadata JSON | Image upload/download |
| `boundary.pacs: false`, `boundary.dicom: false` in API responses | DICOM viewer, PACS credentials |

---

## 9. Security / events

**Security event types added:** `IMAGING_STUDY_CREATED`, `IMAGING_STUDY_ASSIGNED`, `IMAGING_ACQUISITION_STARTED`, `IMAGING_ACQUISITION_COMPLETED`, `IMAGING_ACQUISITION_FAILED`.

**Outbox:** `IMAGING_STUDY_CREATED`, `IMAGING_ACQUISITION_STARTED`, `IMAGING_ACQUISITION_COMPLETED`, `IMAGING_ACQUISITION_FAILED`.

Isolation verified in `r8c.imaging-acquisition.e2e.spec.ts`: customer A ↛ B, org A ↛ B, unassigned technician ↛ start, wrong assignee ↛ start, cancelled booking ↛ check-in.

---

## 10. Tests

| Suite | Result |
|-------|--------|
| `r8c.imaging-acquisition.e2e` | **1/1** |
| Focused regression (R8-A/B/C, RLS, R3, R5, R6, R7) | **23/23 suites · 49/49 tests** |
| Full API (run 1) | **71/71 suites · 166/166 tests** |
| Full API (run 2) | **71/71 suites · 166/166 tests** |
| Full API (run 3) | **71/71 suites · 166/166 tests** |
| Workspace tests (`nx run-many -t test`, 11 projects) | **PASS** (includes API 166 + front-end 74 unit tests) |
| Typecheck (22 projects) | **22/22 PASS** |
| Web builds (customer, admin, vendor, store, doctor, join, lab, radiology, pathologist, ds-web) | **10/10 PASS** |

---

## 11. Explicit non-starts

R8-D (interpretation) · R8-E (digital imaging report) · R8-F (physical report) · R9+ · production PACS · real DICOM · live PSP · live money · real carriers · production healthcare.

---

## 12. Verdict

**R8_C_IMPLEMENTED**
