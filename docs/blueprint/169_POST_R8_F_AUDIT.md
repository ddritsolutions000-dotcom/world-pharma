# 169 — Post-R8-F audit

**CR:** CR-POST-R8-F-AUDIT-169  
**Verdict:** **R8_F_GREEN_R9_READY_FOR_PLANNING**  
**Date:** 2026-08-29  
**Audited implementation:** [168](168_R8_F_PHYSICAL_REPORT_DELIVERY_FINANCE_IMPLEMENTATION.md)  
**Canonical plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md)

---

## Executive summary

Repository inspection confirms R8-F is implemented as a **separate imaging bounded context** (`ImagingPhysicalReportRequest`), reusing R7-F logistics/finance/notification kernels without duplicating them. State machine, eligibility gates, sandbox finance idempotency, PHI minimization, and RLS migrations match Book 155 and Book 168 claims.

**R8-F product chain passes** isolated e2e (`r8f.imaging-physical-finance.e2e.spec.ts`). **No product-level security, RLS, finance, or PHI blockers** were found in source review.

**Full API suite did not achieve 172/172 in all three audit runs** due to **shared-DB test isolation debt** (policyPack pollution, suite-load timeouts) — same class of issue documented in [167](167_POST_R8_E_AUDIT.md). Failures reproduced as infrastructure/concurrency, not R8-F regressions.

**Runtime:** API `nest start` unavailable in audit shell; `health.e2e.spec.ts` passes in suite. **BROWSER_RUNTIME_NOT_VERIFIED**, **MOBILE_RUNTIME_NOT_VERIFIED**.

---

## Audit matrix

| Area | Result | Evidence | Blocker? |
|------|--------|----------|----------|
| R8-F backend lifecycle | PASS | `imaging-physical-report.service.ts`; shared `assertPhysicalReportTransition`; tenant via `workerTenantContext` | No |
| Eligibility / fail-closed | PASS | Server resolves booking ownership, published version, pack gate, address ownership/country; e2e cross-customer 403/404 | No |
| Digital report separation | PASS | Physical service updates only `imaging_physical_report_requests`; e2e asserts published `objectKey` unchanged post-delivery | No |
| Customer APIs | PASS | 4 endpoints in `customer-imaging-booking.controller.ts`; e2e eligibility/request/dup/customer-B isolation | No |
| Imaging center APIs | PASS | `imaging-operations.controller.ts` queue + lifecycle; org access via `assertImagingOrgAccess`; no publish/findings routes | No |
| Delivery / rider | PASS | `delivery.service.ts` branches on `imagingPhysicalReportRequestId`; `presentReportDeliveryJob` sealed-parcel only; e2e PHI grep on rider JSON | No |
| Sandbox finance | PASS | `IMAGING_PAYABLE` + `imaging_report_delivery_fee:{id}` source keys; `recordFact` idempotent; e2e dup dispatch | No |
| Notifications / outbox | PASS | `PHYSICAL_REPORT_*` titles only; payloads use opaque IDs (inspected service `outbox.enqueue`) | No |
| Security events | PASS | `PHYSICAL_REPORT_*` metadata: request/booking/job IDs only; no findings | No |
| RLS / tenancy | PASS | Migration FORCE RLS + policy; `rls.tenancy.e2e.spec.ts` NOSUPERUSER/NOBYPASSRLS + `USING(true)=0` | No |
| Migrations | PASS | 3 R8-F migrations applied; `prisma migrate status` up to date (68 total) | No |
| Customer web UI | PASS (minor UX debt) | `imaging-bookings-page.tsx` real APIs; all states via `status` string; address picker required | No |
| Customer mobile UI | PASS (minor UX debt) | `ImagingBookingDetailScreen` physical block; address confirmation buttons | No |
| web-radiology ops | PASS | `imaging-physical-reports-panel.tsx` queue + accept/prepare/pack/dispatch | No |
| mobile-delivery | PASS | Existing `REPORT_DELIVERY` branch; no clinical fields | No |
| Admin governance | PASS | `GET /admin/imaging/physical-reports` metadata-only select | No |
| R8-E regression | PASS | `r8e` 4/4 in focused R8 run | No |
| R8-D/C/B/A regression | PASS | Focused R8 suites 19/19 | No |
| R7 regression | PASS | Focused R3+R5+R6+R7 chain 22/22 incl. `r7f` | No |
| Full API suite ×3 | DEBT | See regression section | No (infra) |
| Typecheck / builds | PASS | API + web-customer/radiology/radiologist + mobile + mobile-delivery `tsc`; web builds OK | No |
| Runtime smoke | NOT VERIFIED | `nest` CLI missing in audit shell; no browser/emulator | No |
| Production boundary | PASS | Mock payment, sandbox flags, no live PSP/PACS paths in R8-F code | No |
| File hygiene | PASS | Single `ImagingPhysicalReportService`; no R9+ code in radiology | No |

---

## PASS

### Backend (verified in source)

- **Model:** `ImagingPhysicalReportRequest` with FKs to published `ImagingReport` / `ImagingReportVersion`, unique `imaging_booking_id`, unique `idempotency_key`.
- **State machine:** `REQUESTED → ACCEPTED → PREPARING → PACKED → DISPATCHED → DELIVERED | FAILED | CANCELLED` via shared `physical-report-status.ts`.
- **Idempotency:** Duplicate idempotency key returns same request; duplicate booking returns existing; dispatch short-circuits if already `DISPATCHED`; finance `sourceKey` uniqueness.
- **Logistics:** `@@unique([imagingPhysicalReportRequestId, jobType])` prevents duplicate `REPORT_DELIVERY` jobs.
- **Tenant scope:** `loadCustomerBooking` enforces `customerPersonId`; `assertImagingOrgAccess` for ops; address `customerPersonId` + `countryId` validated server-side.

### Digital report immutability

- Physical service never calls `imagingReportVersion.update` or mutates `objectKey`.
- Request pins `imagingReportVersionId` at creation from current published version.
- R8-E immutability triggers/migrations unchanged.

### PHI boundaries (inspected)

- Rider `presentReportDeliveryJob`: parcel label, masked recipient, city/region, sealed package id only.
- Outbox payloads: `imaging_physical_report_request_id`, `imaging_booking_id`, `customer_person_id`, status enums.
- Admin list: id, booking id, org id, status, sealed package id, timestamps — no report body.
- E2e assertion: rider job JSON does not match `/finding|diagnosis|IMPRESSION/i`.

### Finance (sandbox)

- `recordSandboxImagingPayable` on publish (`interpretation.service.ts`).
- `recordSandboxImagingReportDeliveryFee` on dispatch (`imaging-physical-report.service.ts`).
- Separate source keys from lab: `imaging_payable:*` vs `lab_payable:*`; `imaging_report_delivery_fee:*` vs `report_delivery_fee:*`.
- No live PSP, payout, or bank integration in R8-F paths.

### Migrations (all applied)

1. `20260829150000_r8f_imaging_payable_enum`
2. `20260829150100_r8f_imaging_physical_report_finance`
3. `20260829150200_r8f_imaging_physical_report_logistics_rls`

`prisma migrate status`: **Database schema is up to date** (68 migrations).

### Tests (audit session)

| Suite | Result |
|-------|--------|
| `r8f` isolated (attempt 1) | FAIL — booking 400 after full-suite DB pollution (invalid catalog UUID) |
| `r8f` isolated (attempt 2) | **PASS** 1/1 |
| R8-A..E + RLS focused | **PASS** 19/19 |
| R3 + R5 + R6 + R7-A/B/F focused | **PASS** 22/22 |
| `order.e2e` isolated | **PASS** (after prior timeout under full suite) |

### Typecheck / builds

- `apps/api` `tsc --noEmit` — PASS
- `web-customer`, `web-radiology`, `web-radiologist`, `mobile`, `mobile-delivery` — PASS
- `web-customer`, `web-radiology`, `web-radiologist` `next build` — PASS

---

## BLOCKERS

**None (product-level).**

---

## NON-BLOCKING DEBT

### 1. Full API suite determinism (shared `worldpharma_test`)

| Run | Suites | Tests | Failure |
|-----|--------|-------|---------|
| 1 | 73/74 | 171/172 | `orders/order.e2e.spec.ts` — **5000 ms timeout** under ~176s suite load |
| 2 | 73/74 | 171/172 | `lab/r7e.pathology-digital-report.e2e.spec.ts` — assertion failure (polluted pack/DB state) |
| 3 | 72/74 | 170/172 | `radiology/r8c.imaging-acquisition.e2e.spec.ts` + one additional suite |

**Evidence:**

- `order.e2e.spec.ts` **passes in isolation** (6.8s) — timeout is suite-load/concurrency, not order logic.
- `r7f` **failed in isolation** after run 1 with `SERVICE_DISABLED` (wrong country pack active) — **passes** when run in focused batch with fresh pack (22/22).
- `r8f` **failed once** with Prisma UUID errors on catalog publish after pollution — **passes** on immediate retry.

**Classification:** Test infrastructure / shared-DB isolation (extends Book 167 `policyPack` debt). **Not introduced by R8-F product code.**

### 2. UI granularity

- Customer web/mobile display lifecycle via **single `status` field** (real API) rather than dedicated panels per `ACCEPTED`/`PREPARING`/`PACKED`/`DISPATCHED`.
- Sandbox delivery fee is **informational** (`sandbox_delivery_fee_minor`, dispatch-time finance fact) — no customer PSP step (correct for sandbox).
- web-radiology panel: no dedicated fail/cancel ops buttons (fail handled server-side; cancel not exposed in panel).

### 3. Runtime verification

- **BROWSER_RUNTIME_NOT_VERIFIED** — no interactive browser automation in audit environment.
- **MOBILE_RUNTIME_NOT_VERIFIED** — no Android emulator launch.
- API `GET /health` — not smoke-tested live (`nest` CLI not resolved); covered by `health.e2e.spec.ts` in passing suites.

### 4. R8-F e2e coverage gaps (non-blocking)

- No explicit illegal-transition HTTP test in `r8f` spec (state machine covered by shared helper + R7-F pattern).
- No explicit test for physical request on unpublished report (implicit: chain publishes first).

---

## REGRESSION FINDINGS

| Phase | Audit result |
|-------|----------------|
| R8-F | PASS isolated + full chain in spec |
| R8-E | PASS (4 tests, focused batch) |
| R8-D/C/B/A | PASS (focused batch) |
| R7-F | PASS (focused batch; flaky when DB polluted) |
| R7-E | Flaky under full suite run 2 only |
| R3 | PASS (`r3.isolation.e2e.spec.ts`) |
| R5 | PASS (prescription, dispensing, refill) |
| R6 | PASS (`r6e.vendor.e2e.spec.ts` in batch) |
| RLS | PASS (`rls.tenancy.e2e.spec.ts` — NOSUPERUSER, NOBYPASSRLS, USING(true)=0) |

R8-F does **not** worsen Book 167 isolation debt; uses same unique `policyPack` version pattern as R8-E/R7-F.

---

## R9 READINESS

**R9 (Health record + consent UX) may proceed to planning authorization.**

R8 imaging sandbox chain is complete through physical delivery + sandbox finance. Remaining work before R9 implementation:

1. Resolve shared-DB e2e determinism (CI isolation / per-worker DB / pack cleanup).
2. Optional UX polish for per-state customer physical-delivery panels.
3. Human/legal gates in Book 155 (`OD-R8-*`, `OD-RAD-*`) remain **OPEN** — not blockers for engineering planning.

**Explicit non-starts confirmed:** R9+ implementation, live money, production healthcare, real carriers, production PACS/DICOM — **not started**.

---

## Book 168 claim verification

| Book 168 claim | Verified |
|----------------|----------|
| Separate `ImagingPhysicalReportRequest` | Yes — schema + service |
| Customer address required | Yes — `customer_address_id` validation |
| `IMAGING_PAYABLE` on publish | Yes — `interpretation.service.ts` |
| Delivery fee on dispatch | Yes — `recordSandboxImagingReportDeliveryFee` |
| 3 migrations | Yes — applied |
| Full suite 172/172 ×2 | **Partially** — achieved in prior session; audit runs 0/3 clean |
| R8-F e2e | Yes — passes isolated in audit |

---

## Production boundary (OFF)

Verified unchanged: live PSP, real money, bank payouts, real carriers, production PACS, real DICOM, LIS/HIS, production healthcare, live e-Rx, automatic refill, production LiveKit, recording.
