# 150 — R7-F Physical report + sandbox finance implementation

**Status:** Implemented  
**Change ID:** **CR-R7-F-IMPL-150**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R7_F_IMPLEMENTED**

**Authority:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [149](149_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION_PLAN.md)

**Prerequisite:** R7-A through R7-E + Book 148 blockers closed.

---

## 1. Summary

R7-F delivers the optional **physical hard-copy report** lifecycle linked to **published** `LabReportVersion`, `REPORT_DELIVERY` logistics in `mobile-delivery`, sandbox finance facts (`LAB_PAYABLE`, `REPORT_DELIVERY_FEE`), and customer/lab/admin surfaces. Digital reports remain immutable; riders receive parcel metadata only.

**R7 is complete** when R7-A through R7-F acceptance passes (this book).

**R8+ NOT STARTED.** Live money, LIS/HIS, radiology, production healthcare, live e-Rx, automatic refill, production LiveKit, recording remain OFF.

---

## 2. Schema / migrations (additive)

| Migration | Purpose |
|-----------|---------|
| `20260828190000_r7f_physical_report_finance` | `PhysicalReportRequestStatus`, `physical_report_requests`, `logistics_jobs.physical_report_request_id`, `FinancialFactKind` +`LAB_PAYABLE` +`REPORT_DELIVERY_FEE`, RLS on requests |
| `20260828190100_r7f_report_delivery_logistics_rls` | `logistics_jobs_access` extended for `REPORT_DELIVERY` |
| `20260828190200_r7f_logistics_rls_with_check_fix` | Restore R7-D rider `WITH CHECK` + report-delivery assignee writes |

### `PhysicalReportRequest`

- FK: `lab_report_id`, `lab_report_version_id` (must be `PUBLISHED` at request time), `lab_booking_id` (unique)
- States: `REQUESTED → ACCEPTED → PREPARING → PACKED → DISPATCHED → DELIVERED` (+ `FAILED`, `CANCELLED`)
- Server-side transitions only (`physical-report-status.ts`)

---

## 3. API surface

| Method | Path | Audience |
|--------|------|----------|
| GET | `/me/lab/bookings/:id/physical-report/eligibility` | Customer |
| POST | `/me/lab/bookings/:id/physical-report` | Customer — idempotent request |
| GET | `/me/lab/bookings/:id/physical-report` | Customer — status |
| POST | `/me/lab/bookings/:id/physical-report/cancel` | Customer |
| GET | `/lab/physical-reports` | Lab staff |
| GET | `/lab/physical-reports/:id` | Lab staff |
| POST | `/lab/physical-reports/:id/accept` | Lab |
| POST | `/lab/physical-reports/:id/prepare` | Lab |
| POST | `/lab/physical-reports/:id/pack` | Lab — `sealed_package_id` |
| POST | `/lab/physical-reports/:id/dispatch` | Lab — creates `REPORT_DELIVERY` job |
| POST | `/lab/physical-reports/:id/cancel` | Lab |
| POST | `/lab/physical-reports/:id/fail` | Lab |
| GET | `/admin/lab/physical-reports` | Admin metadata |
| Delivery | `/delivery/jobs/*` | `REPORT_DELIVERY` branch |

**Pack gate:** `physical_report_delivery` fail-closed via `PolicyResolver.canUseService`.

**Sandbox finance:**

- `LAB_PAYABLE` on report publish (`FinanceService.recordSandboxLabPayable`, worker tenant)
- `REPORT_DELIVERY_FEE` on dispatch (`recordSandboxReportDeliveryFee`, worker tenant)
- Digital report access independent of physical request/payment state

---

## 4. UI inventory (implemented)

### Customer web (`apps/web-customer`)

| Screen | Route | API | States |
|--------|-------|-----|--------|
| Booking detail — physical report | `/lab/bookings/[id]` | eligibility, request, status, cancel | loading, forbidden, unavailable, network, success, validation, session via shell |

### Customer mobile (`apps/mobile`)

| Screen | API | States |
|--------|-----|--------|
| `LabBookingDetailScreen` — physical report | same customer APIs | `FeatureStates` + eligibility/unavailable/network |

### web-lab (`apps/web-lab`)

| Screen | Tab | API | States |
|--------|-----|-----|--------|
| Physical report queue | `Physical` | `GET /lab/physical-reports` | loading, empty, error via shell |
| Accept/prepare/pack/dispatch | inline | lab physical-report POSTs | validation on package id |

### mobile-delivery (`apps/mobile-delivery`)

| Screen | API | States |
|--------|-----|--------|
| Jobs list/detail `REPORT_DELIVERY` | `/delivery/jobs` | accept, pickup, deliver, fail — sealed parcel copy only, no PDF |

### Admin (`apps/web-admin`)

| Surface | Route | API |
|---------|-------|-----|
| Partners → Lab governance | `/partners` | `GET /admin/lab/physical-reports` metadata list |

---

## 5. Security / PHI

- Rider `presentReportDeliveryJob`: masked recipient, sealed package id, **no** analyte/pathology/PDF
- Notifications: opaque ids only (`PHYSICAL_REPORT_*` events)
- Audit: `PHYSICAL_REPORT_*` security events + outbox
- Delivery completion uses worker tenant (rider cannot read `physical_report_requests` directly)

---

## 6. Tests

| Suite | Result |
|-------|--------|
| `physical-report-status.spec.ts` | PASS |
| `r7f.physical-report-finance.e2e.spec.ts` | PASS — lifecycle, finance, isolation, rider PII, illegal transition, idempotency |

### API full suite — three isolated runs (28 Aug 2026)

| Run | Suites | Tests |
|-----|--------|-------|
| 1 | **68/68 PASS** | **161/161 PASS** |
| 2 | **67/68 PASS** | **160/161 PASS** — `company-authority.e2e.spec.ts` intermittent `VALIDATION_ERROR` on `OrganizationService.create` (pre-existing; not R7-F) |
| 3 | **68/68 PASS** | **161/161 PASS** |

### `inventory.e2e.spec.ts` — three isolated runs

| Run | Result |
|-----|--------|
| 1 | **1/1 PASS** |
| 2 | **1/1 PASS** |
| 3 | **1/1 PASS** |

### Typecheck

`api`, `web-customer`, `web-lab`, `mobile`, `mobile-delivery` — **PASS**

---

## 7. Production boundary (unchanged)

OFF: live PSP, real money, bank payouts, real carriers, LIS/HIS, radiology, EHR, CMS/CRM, production healthcare, live e-Rx, automatic refill, production LiveKit, recording, R8+.

---

## 8. R7 final acceptance

| Stage | Status |
|-------|--------|
| R7-A Lab foundation | PASS |
| R7-B Customer booking/pay | PASS |
| R7-C Sample collection/CoC | PASS |
| R7-D Transport/accession/processing | PASS |
| R7-E Pathology/digital report | PASS |
| R7-F Physical report + sandbox finance | **PASS** |

**R7 COMPLETE** (A–F). **R8+ NOT STARTED.**

---

## 9. Key files

- `apps/api/src/lab/physical-report.service.ts`
- `apps/api/src/lab/physical-report-status.ts`
- `apps/api/src/lab/r7f.physical-report-finance.e2e.spec.ts`
- `apps/web-lab/src/lab-physical-panel.tsx`
- `apps/web-customer/src/lab-bookings-page.tsx` (physical section)
- `apps/mobile/src/customer-features.tsx` (`LabBookingDetailScreen`)
- `apps/mobile-delivery/src/app-root.tsx` (`REPORT_DELIVERY` branch)
