# 168 — R8-F Physical imaging report delivery + sandbox finance implementation

**CR:** CR-R8-F-IMPL-168  
**Verdict:** **R8_F_IMPLEMENTED**  
**Date:** 2026-08-29  
**Canonical plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md)  
**Depends:** R8-E [166](166_R8_E_IMAGING_REPORT_PUBLICATION_IMPLEMENTATION.md); audit [167](167_POST_R8_E_AUDIT.md) (**R8_E_GREEN_R8_F_READY**)

---

## 1. Scope delivered (R8-F only)

| Area | Status |
|------|--------|
| `ImagingPhysicalReportRequest` bounded context | Separate from lab `PhysicalReportRequest` |
| State machine | Reuses `PhysicalReportRequestStatus` + shared transition helper |
| Customer APIs | Eligibility, request (address required), status, cancel |
| Imaging center ops APIs | Queue, accept/prepare/pack/dispatch, fail/cancel |
| `REPORT_DELIVERY` logistics | `imaging_physical_report_request_id` FK on `logistics_jobs` |
| Rider delivery | Reuses `DeliveryService` branch; imaging vs lab by FK |
| Sandbox finance | `IMAGING_PAYABLE` on publish; `REPORT_DELIVERY_FEE` on imaging dispatch |
| Notifications / outbox | Reuses `PHYSICAL_REPORT_*` events; PHI-safe payloads |
| `web-customer` physical report UI | `/radiology/bookings/[id]` |
| `mobile` physical report UI | `ImagingBookingDetailScreen` parity |
| `web-radiology` ops panel | Physical reports queue + actions |
| `mobile-delivery` | Existing `REPORT_DELIVERY` UX (no clinical payload) |
| `admin` governance | `GET /admin/imaging/physical-reports` metadata |
| E2E | `r8f.imaging-physical-finance.e2e.spec.ts` full chain |

## 2. Hard stops respected

| Not started / OFF | Status |
|-------------------|--------|
| R9+ | **NOT STARTED** |
| Live PSP / real money / bank payouts | **OFF** |
| Real carriers | **OFF** |
| Production PACS / DICOM / LIS/HIS | **OFF** |
| Live e-Rx / automatic refill | **OFF** |
| Production LiveKit / recording | **OFF** |

---

## 3. Migrations

| Migration | Purpose |
|-----------|---------|
| `20260829150000_r8f_imaging_payable_enum` | `IMAGING_PAYABLE` on `FinancialFactKind` |
| `20260829150100_r8f_imaging_physical_report_finance` | `imaging_physical_report_requests` + logistics FK + RLS |
| `20260829150200_r8f_imaging_physical_report_logistics_rls` | Extend `logistics_jobs` RLS for imaging `REPORT_DELIVERY` |

---

## 4. State machine

`REQUESTED` → `ACCEPTED` → `PREPARING` → `PACKED` → `DISPATCHED` → `DELIVERED` | `FAILED` | `CANCELLED`

Server-enforced via `assertPhysicalReportTransition` (shared with R7-F). Customer cancel allowed until pre-dispatch packed states.

---

## 5. APIs

| Method | Path | Actor |
|--------|------|-------|
| GET | `/api/v1/me/imaging/bookings/:id/physical-report/eligibility` | Customer |
| POST | `/api/v1/me/imaging/bookings/:id/physical-report` | Customer (`customer_address_id`, `Idempotency-Key`) |
| GET | `/api/v1/me/imaging/bookings/:id/physical-report` | Customer |
| POST | `/api/v1/me/imaging/bookings/:id/physical-report/cancel` | Customer |
| GET | `/api/v1/radiology/physical-reports?imaging_org_id=` | Imaging center staff |
| POST | `/api/v1/radiology/physical-reports/:id/{accept,prepare,pack,dispatch,cancel,fail}` | Imaging center staff |
| GET | `/api/v1/admin/imaging/physical-reports?imaging_org_id=` | Admin metadata |
| POST | `/api/v1/delivery/jobs/:id/{accept,pickup,deliver,fail}` | Rider (`REPORT_DELIVERY`) |

Digital report APIs unchanged; physical delivery never mutates published report content.

---

## 6. Finance (sandbox)

| Fact | Trigger | Source key |
|------|---------|------------|
| `IMAGING_PAYABLE` | Report publish (R8-E hook) | `imaging_payable:{bookingId}` |
| `REPORT_DELIVERY_FEE` | Imaging physical dispatch | `imaging_report_delivery_fee:{requestId}` |

No live PSP, no bank payout records.

---

## 7. PHI / data minimization

- Rider / delivery JSON: sealed parcel metadata only (city, masked recipient, package id).
- Outbox / notifications: IDs + status enums; no findings/diagnosis.
- Imaging center queue: version number + booking id; no report body.
- Admin list: operational metadata only.

---

## 8. Tests & regression

| Suite | Result |
|-------|--------|
| `r8f.imaging-physical-finance.e2e.spec.ts` | **1/1 PASS** (isolated) |
| `r8e` + `r8f` together | **5/5 PASS** |
| Full API run 1 | **74/74 suites, 172/172 tests PASS** |
| Full API run 2 | **74/74 suites, 172/172 tests PASS** |
| Full API run 3 | **73/74 suites** — `order.e2e.spec.ts` **timeout under suite load**; **PASS isolated** (infrastructure flake, not R8-F) |

---

## 9. Runtime

| Check | Status |
|-------|--------|
| API typecheck | PASS |
| web-customer build | PASS |
| web-radiology build | PASS |
| mobile typecheck | PASS |
| Browser interactive | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Mobile emulator | **MOBILE_RUNTIME_NOT_VERIFIED** |

---

## 10. Known debt

- Full-suite `order.e2e.spec.ts` 5s timeout can flake under parallel DB load (pre-existing).
- Book 167 `policyPack` version isolation debt unchanged; R8-F uses unique pack versions per test.
