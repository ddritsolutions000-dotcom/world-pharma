# 158 — R8-B Customer imaging booking + sandbox payment

**Status:** Implementation  
**Change ID:** **CR-R8-B-IMPL-158**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R8_B_IMPLEMENTED**

**Authority:** R8-B only per [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **R8-C/D/E/F NOT STARTED. R9+ NOT STARTED.**

**Sources:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [157](157_POST_R8_A_AUDIT.md) · [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| `ImagingBooking` aggregate + lines + status history + optional `ImagingReferral` | `ImagingStudy` acquisition |
| Customer catalog browse/detail (CENTER-only) | Technician workflow |
| Eligibility / referral gate (pack-driven) | DICOM/PACS |
| Location + slot validation (server) | Radiologist worklist |
| Sandbox `PaymentIntent` via `payImagingBooking` | Interpretation / imaging reports |
| Customer web + RN parity | Physical report delivery |
| `web-radiology` read-only bookings tab | Live PSP / real money |
| R8-B notifications (outbox + security events) | Order creation (`creates_order: false`) |

**ED-R8B-01:** `imaging_referral_required` is **off** in default sandbox packs; referral gate is fail-closed only when pack enables `imaging_referral_required`.  
**ED-R8B-02:** Imaging booking is **CENTER-only** (`LocationKind.IMAGING`); no HOME collection mode.  
**ED-R8B-03:** Preparation acknowledgement (`prep_acknowledged: true`) required before booking create.

---

## 1. Kernels reused (no duplicates)

Identity · Catalog/Pricing · Policy packs · `PaymentService` / `PaymentIntent` · Outbox/events · Security events · RLS/tenant context · ui-kit / shell-web / shell-core.

No duplicate payment, catalog, booking (outside radiology BC), or policy kernels.

---

## 2. Schema / migration

| Migration | Purpose |
|-----------|---------|
| `20260828220000_r8b_imaging_booking_sandbox_pay` | `LocationKind.IMAGING` · `ImagingBookingStatus` · `imaging_bookings` · `imaging_booking_lines` · `imaging_booking_status_history` · `imaging_referrals` · `payment_intents.imaging_booking_id` · three-way `payment_intents_exactly_one_payable` CHECK · RLS policies |

**Enums:** `ImagingBookingStatus` (`BOOKED`, `CONFIRMED`, `CANCELLED`, `EXPIRED`, `PAYMENT_FAILED`); `LocationKind.IMAGING`.  
**Indexes:** org/location/slot, customer, idempotency, payment intent.  
**RLS:** `imaging_bookings_access`, `imaging_booking_lines_access`, `imaging_booking_status_history_access`, `imaging_referrals_access` — worker/platform/customer-person/imaging-org scoped; **no `USING(true)`**.

---

## 3. API surface

### Customer (`/api/v1/me/imaging`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/catalog` | Pack-gated browse (`country` required) |
| GET | `/catalog/:slug` | Study detail |
| POST | `/eligibility` | Referral gate when pack requires |
| GET | `/locations` | IMAGING centers for org (`imaging_org_id`, `country`) |
| GET | `/slots` | Commercial slot windows |
| GET | `/bookings` | Customer list |
| GET | `/bookings/:id` | Customer detail |
| POST | `/bookings` | Create (`Idempotency-Key`, `prep_acknowledged`) |
| POST | `/bookings/:id/pay` | Sandbox pay (`payImagingBooking`) |
| GET | `/bookings/:id/preparation` | Prep instructions |
| GET | `/bookings/:id/progress` | Schedule-only progress |
| POST | `/bookings/:id/cancel` | Customer cancel (BOOKED / PAYMENT_FAILED) |

### Imaging staff (`/api/v1/radiology/bookings`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Read-only list (`imaging_org_id`) |
| GET | `/:id` | Read-only detail |

No acquisition, interpretation, or report endpoints.

---

## 4. Customer web (`apps/web-customer`)

| Screen ID | Route | Implementation |
|-----------|-------|----------------|
| C-W-01 | `/radiology` | `ImagingBrowseScreen` |
| C-W-02 | `/radiology/[slug]` | `ImagingDetailScreen` (study detail) |
| C-W-03 | `/radiology/[slug]` (eligibility section) | Inline eligibility check |
| C-W-04 | `/radiology/[slug]` (location section) | Center location picker |
| C-W-05 | `/radiology/[slug]` (slot section) | Slot picker |
| C-W-06 | `/radiology/[slug]` (review section) | Prep ack + review |
| C-W-07 | `/radiology/[slug]` | Book + sandbox pay actions |
| C-W-08 | `/radiology/bookings/[id]` | Post-pay redirect / confirmation |
| C-W-09 | `/radiology/bookings` | `ImagingBookingsScreen` |
| C-W-10 | `/radiology/bookings/[id]` | Detail + progress |
| C-W-11 | `/radiology/bookings/[id]` | Preparation block |
| C-W-15 | `/radiology/bookings/[id]` | Cancel + retry pay |

**DEFERRED (R8-E/F):** C-W-12 report status · C-W-13 report view · C-W-14 physical report.

Nav: Customer shell links **Radiology** + **Imaging bookings**.

---

## 5. Customer mobile (`apps/mobile`)

Shared Android/iOS RN kernel — screens map to Book 155 C-M IDs:

| Screen ID | RN surface | Parity |
|-----------|------------|--------|
| C-M-01 | `ImagingBrowseScreen` (catalog) | C-W-01 |
| C-M-02–07 | `ImagingBrowseScreen` (detail wizard) | C-W-02–07 |
| C-M-08 | Redirect to bookings on pay success | C-W-08 |
| C-M-09 | `ImagingBookingsScreen` | C-W-09 |
| C-M-10 | `ImagingBookingDetailScreen` | C-W-10, C-W-11, C-W-15 |

**DEFERRED:** C-M-10 report/physical states (R8-E/F).

Routes: `imaging`, `imaging-bookings`, `imaging-booking-detail` in `navigation.ts` / `app-root.tsx`.

---

## 6. web-radiology staff

| Screen | Tab | API |
|--------|-----|-----|
| Bookings (read-only) | `#bookings` | `GET /radiology/bookings?imaging_org_id=` |

Schedule tab remains **DEFERRED (R8-C+)** EmptyState.

---

## 7. Payment (sandbox only)

- `PaymentService.payImagingBooking` mirrors `payLabBooking`.
- `payment_intents.imaging_booking_id` exclusive with checkout/lab payable.
- Idempotent pay + duplicate protection.
- **No Order** created (`boundary.creates_order: false`).
- Clinical report access does **not** depend on payment.

---

## 8. Security / RLS

- Customer A ↛ Customer B bookings (e2e).
- Imaging org A staff ↛ Imaging org B bookings (e2e).
- Wrong location / wrong country fail-closed (e2e).
- Server-side location validation via worker country scope (no client-trusted tenant IDs).
- `worldpharma_app` NOSUPERUSER / NOBYPASSRLS unchanged.

---

## 9. Tests / regression (this CR)

| Suite | Result |
|-------|--------|
| `r8b.imaging-booking.e2e` | **1/1** |
| `r8a.radiology.e2e` | **1/1** (in focused run) |
| Focused RLS + R3 + R5 + R6 + R7 + R8-A/B | **45/45** (18 suites) |
| Full API run 1 | **70/70** suites · **165/165** tests |
| Full API run 2 | **70/70** suites · **165/165** tests |
| Full API run 3 | **70/70** suites · **165/165** tests |
| Workspace `nx run-many -t test` | **11/11** projects (API **165** tests) |
| Typecheck | **22/22** projects |
| Web builds | **10/10** (customer, admin, vendor, store, doctor, join, lab, radiology, pathologist, ds-web) |

---

## 10. Production boundary

**OFF:** live PSP · real money · bank payouts · real carriers · production healthcare · production LiveKit · recording · LIS/HIS · production PACS · acquisition · interpretation · report publication.

---

## 11. Explicit non-starts

**R8-C NOT STARTED** — acquisition, technician workflow, `ImagingStudy`.  
**R8-D NOT STARTED** — radiologist worklist, interpretation.  
**R8-E NOT STARTED** — digital imaging report publication.  
**R8-F NOT STARTED** — physical report + sandbox finance extension.  
**R9+ NOT STARTED.**

---

## Final declaration

**FINAL STATUS: R8_B_IMPLEMENTED**

**STOP.**
