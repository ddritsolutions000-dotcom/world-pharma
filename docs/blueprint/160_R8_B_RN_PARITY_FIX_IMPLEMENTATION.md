# 160 — R8-B customer RN parity fix

**Status:** Implementation — R8-B debt only  
**Change ID:** **CR-R8-B-FIX-160**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R8_B_BLOCKERS_CLOSED**

**Authority:** Closes Book [159](159_POST_R8_B_AUDIT.md) blockers B-01–B-04. **Do not** implement R8-C+, acquisition, DICOM, PACS, radiologist workflow, or live money/PSP.

**Canonical inputs:** [159](159_POST_R8_B_AUDIT.md) · [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) · [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md)

---

## 0. Executive summary

Customer React Native imaging flow now achieves functional parity with the R8-B customer web flow for payment retry, interactive location/slot selection, and booking-detail preparation fetch. No duplicate payment kernel; existing `payImagingBooking` and `fetchImagingPreparation` APIs reused.

| Blocker | Fix |
|---------|-----|
| **B-01** Sandbox payment retry | `ImagingBookingsScreen` + `ImagingBookingDetailScreen` — retry pay for `BOOKED`/`PAYMENT_FAILED` via `payImagingBooking` + idempotency keys |
| **B-02** Interactive location picker | `ImagingBrowseScreen` — explicit location buttons; no auto-select first |
| **B-03** Interactive slot picker | `ImagingBrowseScreen` — explicit slot buttons; no auto-select first |
| **B-04** Preparation API on detail | `ImagingBookingDetailScreen` — `fetchImagingPreparation` with loading/error/network/403 states |

---

## 1. Files changed

| File | Change |
|------|--------|
| `apps/mobile/src/imaging-api.ts` | `fetchImagingPreparation`, `imagingPaymentRetryable`, `imagingBookingDraftError` |
| `apps/mobile/src/customer-features.tsx` | RN browse/bookings/detail parity |
| `apps/mobile/src/imaging-parity.spec.ts` | Focused unit tests for helpers |
| `apps/api/src/radiology/r8b.imaging-booking.e2e.spec.ts` | Prep isolation, pay idempotency, confirmed-booking pay guard |

---

## 2. B-01 — Sandbox payment retry

- List and detail show **Payment failed** copy when `status === PAYMENT_FAILED`.
- **Pay (sandbox success)** and **Simulate payment failure** call existing `POST /me/imaging/bookings/:id/pay` with fresh `Idempotency-Key` per attempt.
- Loading (`NativeLoadingState`), success reload, failure message, 403 → `NativePermissionDeniedState`, 401 → session handler.
- No duplicate booking created; no Order (`creates_order: false` unchanged).

---

## 3. B-02 / B-03 — Interactive location and slot pickers

- Opening study detail **does not** pre-select location or slot.
- Locations and slots render as selectable `NativeButton` rows (primary when selected, secondary otherwise).
- Selected location/slot shown in confirmation text before review/pay.
- `imagingBookingDraftError` blocks book until explicit selections + prep ack.
- Location/slot APIs: loading, empty, forbidden, network retry via `reloadLocationsAndSlots`.
- Server-side validation unchanged (wrong org/country/location → 403; slot conflict → 409).

---

## 4. B-04 — Preparation on booking detail

- `GET /me/imaging/bookings/:id/preparation` on detail load.
- Displays `study_title`, `instructions`, `note` only (API-safe commercial prep).
- States: loading, forbidden, unavailable (404), network retry, generic error.

---

## 5. Security / R8-C boundary

- No RLS or tenancy changes.
- No acquisition/DICOM/PACS code added.
- R8-C remains **NOT STARTED**.

---

## 6. Test matrix (this CR)

| Suite | Result |
|-------|--------|
| R8-B e2e (`r8b.imaging-booking`) | **1/1** |
| R8-A e2e | **1/1** |
| RLS tenancy | **11/11** |
| R3 isolation | **13/13** |
| R5 (rx/refill/dispensing/handoff) | **6/6** |
| R6 vendor | **6/6** |
| R7 lab A–F | **8/8** |
| Full API run 1 | **69/70** suites · **164/165** tests — **flaky** `company-authority.e2e` (test isolation debt) |
| Full API run 2 | **70/70** · **165/165** |
| Full API run 3 | **70/70** · **165/165** |
| Workspace `nx run-many -t test` | **11/11** projects |
| Mobile (incl. `imaging-parity`) | **3/3** suites · **8/8** tests |
| Typecheck | **22/22** projects |
| Web builds | **10/10** apps |

---

## 7. Re-audit recommendation

Book [159](159_POST_R8_B_AUDIT.md) blockers B-01–B-04 are closed. A follow-up **`CR-POST-R8-B-REAUDIT-*`** may declare **`R8_B_GREEN_R8_C_READY`** after spot-checking RN on device.

---

## Final declaration

**FINAL VERDICT: R8_B_BLOCKERS_CLOSED**

**R8-C NOT STARTED. R8-D NOT STARTED. R8-E NOT STARTED. R8-F NOT STARTED. R9+ NOT STARTED.**

**STOP.**
