# 144 — R7-C Phlebotomist + SAMPLE_COLLECTION + Chain of Custody

**Status:** Implementation  
**Change ID:** **CR-R7-C-IMPL-144**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_C_IMPLEMENTED**

**Authority:** R7-C only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-D/E/F NOT STARTED. R8+ NOT STARTED.**  
Live money NOT enabled. No LIS/HIS. No pathology. No production healthcare enablement.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md) · [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| Phlebotomist actor (partner `PHLEBOTOMIST` or LAB `org_staff`/`org_operations`) | Accession / lab processing |
| `LabSample` + append-only `LabSampleCocEvent` through `HANDED_OVER` | Pathology / digital report |
| `LogisticsJobType.SAMPLE_COLLECTION` linked to sample | LIS/HIS / EHR |
| Customer collection status + custody timeline (min fields) | Live PSP / live carrier |
| `apps/mobile-phlebotomist` field journey | GPS / maps SDK |
| web-lab collection queue + custody history | Admin CoC rewrite |
| Pack fail-closed (`lab_home` / `lab_center`) for enqueue | R7-D+ |

---

## 1. Kernels reused (no duplicates)

Identity · Partner/org/location · LabBooking (R7-B) · Payment sandbox confirm hook · Logistics jobs · Policy packs · Outbox / notifications · Security events · RLS / `workerTenantContext` · ui-kit / shell-core.

---

## 2. Schema / migrations

| Migration | Purpose |
|-----------|---------|
| `20260828120000_r7c_sample_collection_coc` | `LabSample`, `LabSampleCocEvent`, `logistics_jobs.lab_sample_id`, FORCE RLS (CoC INSERT-only) |
| `20260828140000_r7c_logistics_jobs_sample_collection_rls` | Extend `logistics_jobs` RLS for SAMPLE_COLLECTION queue visibility |

`LabSampleCocStatus`: `ASSIGNED` → `ACCEPTED` → `ARRIVED` → `VERIFIED` → `COLLECTED` → `SEALED` → `HANDED_OVER` (+ exception terminals). State machine enforced in `lab-sample-coc-status.ts`.

---

## 3. API surface

| Method | Path | Role |
|--------|------|------|
| GET | `/phlebotomist/jobs` · `/jobs/:id` | Phlebotomist queue (assignment-scoped) |
| POST | `/phlebotomist/jobs/:id/accept` | Accept assignment |
| POST | `/phlebotomist/jobs/:id/arrive` | CoC `ARRIVED` |
| POST | `/phlebotomist/jobs/:id/verify` | CoC `VERIFIED` |
| POST | `/phlebotomist/jobs/:id/collect` | CoC `COLLECTED` (idempotent key supported) |
| POST | `/phlebotomist/jobs/:id/seal` | CoC `SEALED` + container barcode |
| POST | `/phlebotomist/jobs/:id/handover` | CoC `HANDED_OVER` (R7-C terminal) |
| POST | `/phlebotomist/jobs/:id/fail` | Exception statuses |
| GET | `/lab/collections` · `/:id` | Lab staff queue + custody timeline |
| GET | `/me/lab/bookings/:id/collection` | Customer progress (no clinical data) |
| POST | `/admin/lab/collections/assign` | Admin/lab-operator phlebotomist assignment |

Enqueue: idempotent on `LabBooking` → `CONFIRMED` (payment capture + lab confirm). Worker tenant context for sample/job creation.

---

## 4. PHI minimization

Phlebotomist presenter masks customer name/address. APIs and outbox payloads exclude diagnosis, clinical notes, prescriptions, unrelated history. Customer collection API returns status + custody timeline only.

---

## 5. Apps & screens (UI completeness gate)

### Customer web (`apps/web-customer`)

| Screen | Route | API | States |
|--------|-------|-----|--------|
| Lab bookings list | `/lab/bookings` | `GET /me/lab/bookings` | loading, empty, error, 401, 403, session, network |
| Lab booking detail + collection | `/lab/bookings/[id]` | `GET /me/lab/bookings/:id`, `GET .../collection` | same + custody timeline |

### Customer mobile (`apps/mobile`)

| Screen | API | States |
|--------|-----|--------|
| `LabBookingsScreen` | `GET /me/lab/bookings` | via `FeatureStates` |
| `LabBookingDetailScreen` | booking + collection | loading, error, collection timeline |

### Phlebotomist mobile (`apps/mobile-phlebotomist`)

| Screen | API | States |
|--------|-----|--------|
| OTP sign-in | auth OTP | network |
| Jobs list | `GET /phlebotomist/jobs` | loading, empty, forbidden, network, session expired |
| Job detail / actions | job + CoC POSTs | accept → handover / fail |

### web-lab (`apps/web-lab`)

| Screen | API | States |
|--------|-----|--------|
| Collections tab | `GET /lab/collections` | loading, empty, forbidden, network, custody drill-down |

Accession / processing tabs remain deferred (R7-D+).

### Admin

Assignment via `POST /admin/lab/collections/assign` (`partner:manage`). No CoC history mutation UI.

---

## 6. Tests & regression (28 Aug 2026)

| Suite | Result |
|-------|--------|
| API | **62/62** suites · **149/149** tests PASS |
| R7-C e2e | `r7c.sample-collection.e2e.spec.ts` PASS |
| R7-B e2e | PASS |
| R7-A / R3 / R5 / R6 / RLS | included in API suite PASS |
| Workspace tests | **11/11** projects PASS |
| Typecheck | **20/20** projects PASS |
| web-customer build | PASS |
| web-lab build | PASS |
| mobile-phlebotomist typecheck | PASS |

---

## 7. Production boundary

Sandbox collection only. No live money. No LIS/HIS. No pathology. No accession. CoC history append-only at DB policy layer (no UPDATE/DELETE policies on `lab_sample_coc_events`).

---

## 8. Next authorized step

**CR-R7-D-IMPL** (transport + accession) only after explicit authorization. **STOP** at R7-C boundary.
