# 159 — Post-R8-B audit (customer imaging booking + sandbox payment)

**Status:** Audit only — **no R8-C+ coding, no source changes**  
**Change ID:** **CR-POST-R8-B-AUDIT-159**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R8_B_WITH_BLOCKERS**

**Authority:** Read-only verification after [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) against [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **Do not** implement R8-C+, production healthcare, live PSP/money/carriers, PACS, LIS/HIS, or radiologist workflow under this CR.

**Canonical inputs:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [157](157_POST_R8_A_AUDIT.md) · [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [00](00_MASTER_INDEX.md)

**Repo truth:** `apps/api/src/radiology/*` · `apps/web-customer/src/imaging-*` · `apps/mobile/src/imaging-api.ts` · `apps/web-radiology/src/imaging-bookings-panel.tsx` · `packages/database/prisma` · regression runs executed 28 Aug 2026 (this CR).

---

## 0. Executive summary

R8-B **backend scope is substantially complete**: `ImagingBooking` aggregate, customer/staff APIs, sandbox `PaymentIntent` via `payImagingBooking`, RLS, idempotency, referral/prep/location gates, and comprehensive e2e coverage. R0–R7 regression remains green. R8-C acquisition domain is **not started** (no `ImagingStudy`, DICOM, technician APIs).

**Material blockers** prevent a green R8-B verdict:

| ID | Blocker | Severity |
|----|---------|----------|
| **B-01** | Customer **RN** lacks sandbox **payment retry** on bookings list/detail after `PAYMENT_FAILED` (web has retry on `/radiology/bookings/[id]`) | UI completeness / functional parity |
| **B-02** | Customer **RN** lacks **interactive location and slot pickers** — auto-selects first location/slot only (web has `<select>` pickers) | UI completeness (C-M-04/05) |
| **B-03** | Customer **RN** booking detail does not fetch **preparation** API (`GET .../preparation`); web detail does | UI completeness (C-M-11) |

API, security, payment kernel, migration, and customer **web** surfaces pass. Book 158 overstates RN parity.

| Gate | Result |
|------|--------|
| R8-B API + data model | **PASS** |
| R8-B customer web UI | **PASS** |
| R8-B customer RN UI | **FAIL** (B-01–B-03) |
| R8-C boundary | **PASS** (not started) |
| Security / RLS / regression | **PASS** |
| Test determinism | **PASS** (this audit run) |

**R8-C readiness:** **R8_C_READY** for a separate `CR-R8-C-IMPL-*` authorization on the **acquisition** domain (backend booking spine exists; no premature acquisition tables). Customer RN blockers are R8-B debt and do not block R8-C API/schema work, but should be closed before declaring R8-B green.

---

## 1. Source-of-truth cross-check (Book 158 vs repo)

| Claim (Book 158) | Repo truth |
|------------------|------------|
| Migration `20260828220000_r8b_imaging_booking_sandbox_pay` | **Present** — applied on `worldpharma_test` (59/59 migrations) |
| Customer `/me/imaging/*` endpoints | **Present** — `customer-imaging-booking.controller.ts` |
| Staff `/radiology/bookings` read-only | **Present** — `imaging-bookings.controller.ts` |
| `payImagingBooking` sandbox | **Present** — `payment.service.ts` |
| `creates_order: false` | **Confirmed** — e2e + `presentCustomer.boundary` |
| Customer web C-W-01…15 (except C-W-12–14 deferred) | **Present** — combined wizard on `/radiology/[slug]` mirrors lab pattern |
| Customer RN C-M-01…10 parity | **PARTIAL** — see blockers B-01–B-03 |
| No duplicate payment/catalog kernels | **Confirmed** |
| R8-C not started | **Confirmed** |

---

## 2. R8-C boundary (verified NOT STARTED)

| Capability | Evidence |
|------------|----------|
| `ImagingStudy` / acquisition aggregates | **Absent** — schema has only `ImagingBooking`, lines, history, referrals |
| DICOM / PACS tables or APIs | **Absent** — only boundary copy in UI strings |
| Technician workflow / acquisition actions | **Absent** |
| `web-radiologist` app | **Absent** |
| Imaging report publication | **Absent** |
| Schedule tab (`web-radiology`) | **DEFERRED** — `LaterPhaseState` for R8-C+ scheduling |

Live DB (`worldpharma_test`): imaging tables = `imaging_bookings`, `imaging_booking_lines`, `imaging_booking_status_history`, `imaging_referrals` only.

---

## 3. Data model (`20260828220000_r8b_imaging_booking_sandbox_pay`)

| Item | Status |
|------|--------|
| `LocationKind.IMAGING` | **PASS** — additive enum value |
| `ImagingBookingStatus` enum | **PASS** — BOOKED, CONFIRMED, CANCELLED, EXPIRED, PAYMENT_FAILED |
| Tables | **PASS** — 4 tables, minimal commercial spine |
| FKs | **PASS** — country, person, org, location, catalog offer/variant |
| `payment_intents.imaging_booking_id` + three-way CHECK | **PASS** |
| Idempotency unique on `imaging_bookings.idempotency_key` | **PASS** |
| Slot conflict index | **PASS** |
| RLS on all 4 tables | **PASS** — no `USING(true)` on imaging policies |
| History append-only | **PASS** — INSERT-only via `transition()`; no UPDATE path on history |
| Speculative R8-C/D/E/F tables | **None** |

**Note:** `EXPIRED` status exists in enum but has no R8-B transition path (acceptable deferral; not a security issue).

---

## 4. Booking state machine

| Transition | Guard | Status |
|------------|-------|--------|
| → BOOKED | create + eligibility/location/offer validation | **PASS** |
| BOOKED → CONFIRMED | `confirmFromPayment` — only BOOKED or PAYMENT_FAILED | **PASS** |
| BOOKED → PAYMENT_FAILED | `markPaymentFailed` — only from BOOKED | **PASS** |
| BOOKED/PAYMENT_FAILED → CANCELLED | `cancelCustomerBooking` | **PASS** |
| Illegal pay on CANCELLED | 409 `IMAGING_BOOKING_NOT_PAYABLE` | **PASS** (e2e) |
| Duplicate booking idempotency | Same `Idempotency-Key` returns same booking | **PASS** (e2e) |
| Slot double-book | 409 `IMAGING_SLOT_UNAVAILABLE` | **PASS** (e2e) |
| Generic `transition()` | No from-status matrix (mirrors lab) — guards at entry points | **ACCEPTABLE** (same as R7-B) |

---

## 5. Catalog consumption

| Check | Status |
|-------|--------|
| Uses shared catalog kernel (items/variants/offers) | **PASS** |
| `IMAGING_STUDY` + `IMAGING_OWNED` + `IMAGING_CENTER` seller | **PASS** |
| Booking ≠ Order | **PASS** — `boundary.creates_order: false` |
| Pack gate `imaging_center` | **PASS** — fail-closed browse |
| Capability `booking_enabled` when ELIGIBLE | **PASS** |
| No duplicate catalog kernel | **PASS** |

---

## 6. Location (ED-R8B-02 — CENTER-only)

| Check | Status |
|-------|--------|
| `imaging_location_id` required | **PASS** — server validation |
| `LocationKind.IMAGING` enforced | **PASS** |
| Org ownership validated | **PASS** — wrong org location → 403 (e2e) |
| Country match validated | **PASS** |
| Worker country scope for location reads | **PASS** — `workerTenantContext` + `companyScope: country` |
| No HOME collection mode | **PASS** — not in API schema |

---

## 7. Referral / eligibility (ED-R8B-01)

| Check | Status |
|-------|--------|
| Default pack: referral NOT required | **PASS** — e2e `referral_required: false` |
| Pack `imaging_referral_required` → fail closed | **PASS** — e2e blocks booking without reference |
| Server-side eligibility at booking | **PASS** — `checkEligibility` + create guards |
| No invented universal referral | **PASS** |

---

## 8. Preparation ack (ED-R8B-03)

| Check | Status |
|-------|--------|
| Zod `prep_acknowledged: z.literal(true)` | **PASS** — client cannot send `false` |
| Service rejects missing ack | **PASS** — `Errors.validation` |
| Stored on booking | **PASS** |

---

## 9. Sandbox payment

| Check | Status |
|-------|--------|
| Reuses `PaymentService` / `PaymentIntent` | **PASS** |
| Sandbox only (`sandbox: true`) | **PASS** |
| Success → CONFIRMED | **PASS** (e2e) |
| Failure → PAYMENT_FAILED | **PASS** (e2e) |
| Idempotent pay | **PASS** — PaymentIntent kernel |
| No Order created | **PASS** — e2e `orders.count === 0` |
| No live PSP paths introduced | **PASS** |

---

## 10. Customer web UI

| Screen | Route | API | States | Verdict |
|--------|-------|-----|--------|---------|
| C-W-01 Catalog | `/radiology` | `GET /me/imaging/catalog` | loading, empty, disabled pack, network, 401, 403, session expired | **PASS** |
| C-W-02–07 Detail/wizard | `/radiology/[slug]` | catalog, eligibility, locations, slots, book, pay | all above + validation, success, pay failure | **PASS** |
| C-W-08 Confirmation | redirect to `/radiology/bookings/[id]` | booking GET | **PASS** |
| C-W-09 List | `/radiology/bookings` | `GET /me/imaging/bookings` | loading, empty, cancel | **PASS** |
| C-W-10/11/15 Detail | `/radiology/bookings/[id]` | booking, preparation, progress, pay retry, cancel | **PASS** |
| C-W-12–14 Reports | — | **DEFERRED** (R8-E/F) | N/A |

Nav: Customer shell links **Radiology** + **Imaging bookings**. No fake data; real API throughout.

**Plan delta (non-blocking):** Book 155 lists separate wizard routes (`/radiology/book/location`, etc.); implementation uses combined detail page (same pattern as R7-B lab). Functionally equivalent on web.

---

## 11. Customer RN UI

| Surface | Status | Notes |
|---------|--------|-------|
| C-M-01 Browse | **PASS** | `ImagingBrowseScreen`, real API |
| C-M-02–03 Detail + eligibility | **PASS** | inline in browse screen |
| C-M-04 Location | **FAIL** | B-02 — displays first location only; no picker |
| C-M-05 Slot | **FAIL** | B-02 — displays first slot only; no picker |
| C-M-06–07 Review + pay | **PARTIAL** | pay on create only; no retry on existing booking |
| C-M-08 Confirmation | **PASS** | redirects to bookings on success |
| C-M-09 Bookings list | **PASS** | cancel on list |
| C-M-10/11 Detail | **FAIL** | B-03 — no preparation fetch; B-01 — no pay retry/cancel on detail |
| Session/network/401/403 | **PASS** | via `FeatureStates` + `app-root` session handling |

Shared Android/iOS kernel — no separate radiology app. **Parity with web is incomplete.**

---

## 12. web-radiology staff

| Check | Status |
|-------|--------|
| Bookings tab real API | **PASS** — `ImagingBookingsPanel` → `GET /radiology/bookings` |
| Read-only (no acquisition actions) | **PASS** |
| Minimized customer identifiers | **PASS** — `presentImagingStaff` |
| Org isolation | **PASS** — e2e cross-org 403 |
| Schedule tab | **DEFERRED** — R8-C+ EmptyState |

---

## 13. Admin

| Check | Status |
|-------|--------|
| R8-A imaging accept/block (unchanged) | **PASS** — `partners-admin.tsx` |
| No clinical/acquisition admin | **PASS** |
| A-W-01 dedicated imaging list | **DEFERRED** (from R8-A audit; non-blocking) |

---

## 14. Security / RLS (live DB `worldpharma_test`)

| Check | Result |
|-------|--------|
| `worldpharma_app` NOSUPERUSER | **f** (false) ✓ |
| `worldpharma_app` NOBYPASSRLS | **f** (false) ✓ |
| `USING(true)` policies (public) | **0** |
| Applied migrations | **59/59** |
| Customer A ↛ Customer B | **PASS** (e2e) |
| Imaging Org A ↛ Org B staff bookings | **PASS** (e2e) |
| Wrong location / country fail-closed | **PASS** (e2e) |
| Tenant context server-built | **PASS** — `TenantContextInterceptor` |

**Note:** `worldpharma` dev database (non-test) reports 59 pending migrations per `prisma migrate status`; e2e/audit DB `worldpharma_test` is fully migrated. CI/local test path is authoritative.

---

## 15. PHI / data minimization

| Surface | Status |
|---------|--------|
| API DTOs | **PASS** — commercial fields only; `boundary.acquisition/report: false` |
| e2e PHI exclusion regex | **PASS** — no diagnosis/dicom in list payloads |
| Outbox/security events | **PASS** — opaque IDs, status, org refs only |
| Payment metadata | **PASS** — sandbox messaging; no clinical content |
| URLs | **PASS** — opaque booking UUIDs |

---

## 16. Notifications / events

| Event | Kernel | Status |
|-------|--------|--------|
| `IMAGING_BOOKING_CREATED` | Outbox + security | **PASS** |
| `IMAGING_BOOKING_CONFIRMED` | Outbox + security | **PASS** |
| `IMAGING_BOOKING_CANCELLED` | Outbox + security | **PASS** |
| `IMAGING_BOOKING_PAYMENT_FAILED` | Outbox + security | **PASS** |

No diagnostic content in payloads.

---

## 17. Regression R0–R7

| Suite | Result (this audit) |
|-------|-------------------|
| R8-B e2e | **1/1** |
| R8-A e2e | **1/1** |
| RLS tenancy | **11/11** |
| R3 isolation | **13/13** |
| R5 (rx/refill/dispensing) | **6/6** |
| R6 vendor | **6/6** |
| R7 lab A–F | **8/8** |
| Full API run 1 | **70/70** suites · **165/165** tests |
| Full API run 2 | **70/70** suites · **165/165** tests |
| Full API run 3 | **70/70** suites · **165/165** tests |
| Workspace `nx run-many -t test` | **11/11** projects |
| Typecheck | **22/22** projects |
| Web builds | **10/10** apps |
| Mobile tests | **2/2** suites · **4/4** tests |

No deterministic failures observed in this audit session.

---

## 18. File hygiene

| Check | Status |
|-------|--------|
| Duplicate payment/catalog/booking kernels | **None** |
| Speculative R8-C+ source | **None** (boundary strings only) |
| Temp/backup files in R8-B scope | **None** in `apps/api`, `apps/web-customer`, `apps/mobile` source |

---

## 19. Production boundary

**OFF:** live PSP · real money · bank payouts · real carriers · production healthcare · production LiveKit · recording · LIS/HIS · production PACS · live e-Rx · automatic refill · R8-C+ · R9+.

---

## 20. Global scorecard

| Domain | Status |
|--------|--------|
| R8-A | **PASS** |
| R8-B booking (API) | **PASS** |
| Catalog | **PASS** |
| Eligibility | **PASS** |
| Referral | **PASS** |
| Preparation | **PASS** |
| Location | **PASS** |
| Slots | **PASS** |
| Cancellation | **PASS** |
| Sandbox payment | **PASS** |
| Idempotency | **PASS** |
| Customer web | **PASS** |
| Customer RN | **FAIL** (B-01–B-03) |
| Radiology staff | **PASS** |
| Admin | **PASS** |
| RLS | **PASS** |
| PHI | **PASS** |
| Notifications | **PASS** |
| Regression | **PASS** |
| Test determinism | **PASS** |
| Migration | **PASS** (test DB) |
| Production boundary | **PASS** |

---

## 21. R8-C readiness

**R8_C_READY** — acquisition domain prerequisites are met on the API/schema side (`ImagingBooking` commercial spine, no premature acquisition tables, staff booking visibility). R8-C requires a **separate** implementation authorization: **`CR-R8-C-IMPL-*`**.

R8-B customer RN blockers (B-01–B-03) should be resolved in a focused R8-B fix CR before declaring **R8_B_GREEN**, but they do not block R8-C backend/schema planning.

---

## 22. Required remediation (document only — do not fix in this CR)

1. **B-01:** Add RN payment retry on `ImagingBookingsScreen` and/or `ImagingBookingDetailScreen` for `BOOKED`/`PAYMENT_FAILED` (mirror web).
2. **B-02:** Add RN location and slot pickers when multiple options exist (mirror web `<select>`).
3. **B-03:** Fetch and display `GET /me/imaging/bookings/:id/preparation` on RN booking detail.

---

## Final declaration

**FINAL VERDICT: R8_B_WITH_BLOCKERS**

**R8-C NOT STARTED. R8-D NOT STARTED. R8-E NOT STARTED. R8-F NOT STARTED. R9+ NOT STARTED.**

**STOP.**
