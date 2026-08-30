# 143 — R7-B Customer lab booking + sandbox payment

**Status:** Implementation  
**Change ID:** **CR-R7-B-IMPL-143**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_B_IMPLEMENTED**

**Authority:** R7-B only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-C/D/E/F NOT STARTED. R8+ NOT STARTED.**  
Live money NOT enabled. No LIS/HIS. No production healthcare enablement. No SAMPLE_COLLECTION / CoC / pathology.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) · [142](142_POST_R7_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| Customer lab catalog browse/detail (`LAB_TEST` / `LAB_OWNED`) | Phlebotomist / SAMPLE_COLLECTION |
| LabBooking + lines + status history | Chain of custody / specimen / accession |
| HOME / CENTER collection modes (pack-gated) | Pathology / digital report / physical delivery |
| Sandbox PaymentIntent payable on booking (no Order) | Live PSP / COD for diagnostics |
| Customer web + mobile booking UX | Radiology / EHR / CMS / CRM |
| web-lab booking visibility only | LIS/HIS, live e-Rx, auto-refill |
| Notifications + security events (no PHI) | R7-C+ and R8+ |

---

## 1. Kernels reused (no duplicates)

Identity · Policy packs · Catalog/Pricing · Payment sandbox (mock PSP) · Outbox / notification dispatch · Security events · Customer addresses · Organization / Location · RLS / server-built tenant context · ui-kit / shell.

**No** second identity, catalog, cart/checkout fork for lab, payment engine, order system, notification service, or clinical consent invention.

**Booking ≠ Order:** confirmed lab bookings do **not** create `Order` rows. Medicine cart → checkout → order path unchanged.

---

## 2. Location model (Book 142 PARTIAL gap)

| Mode | Server-side source of truth | Client headers / body as auth |
|------|-----------------------------|-------------------------------|
| CENTER | `locations` row: `organization_id = lab_org_id`, `kind = LAB`, `is_active`, same `country_id` | **Rejected** as authorization |
| HOME | `customer_addresses` owned by `customer_person_id` + matching country | **Rejected** as authorization |

Wrong-location (Lab B location with Lab A org) → **403**. Membership `location_id` is **not** used as booking authorization. Additive location capability: none required beyond existing `LocationKind.LAB` + address ownership checks.

---

## 3. Schema / migration

| Migration | Purpose |
|-----------|---------|
| `20260828010000_r7b_lab_booking_sandbox_pay` | `lab_bookings`, `lab_booking_lines`, `lab_booking_status_history`; `payment_intents.lab_booking_id`; checkout FKs nullable with exactly-one-payable CHECK; FORCE RLS policies (customer + `can_org(lab_org_id)`) |

Enums: `LabCollectionMode` (`HOME`\|`CENTER`), `LabBookingStatus` (`BOOKED`\|`CONFIRMED`\|`CANCELLED`\|`EXPIRED`\|`PAYMENT_FAILED`).

---

## 4. API surface

| Method | Path | Role |
|--------|------|------|
| GET | `/me/lab/catalog` | Customer discovery (pack fail-closed) |
| GET | `/me/lab/catalog/:slug` | Detail |
| GET | `/me/lab/slots` | Commercial slot windows |
| GET | `/me/lab/locations` | Active LAB locations for CENTER |
| POST | `/me/lab/bookings` | Idempotent create (`Idempotency-Key`) |
| GET | `/me/lab/bookings` · `/:id` | Customer ownership |
| POST | `/me/lab/bookings/:id/pay` | Sandbox pay (idempotent) |
| POST | `/me/lab/bookings/:id/cancel` | Unpaid cancel |
| GET | `/lab/bookings` · `/:id` | Lab org visibility (membership) |

`LabCapabilityService.booking_enabled = true` when state `ELIGIBLE` (R7-B).

---

## 5. Apps

| App | Change |
|-----|--------|
| `web-customer` | `/lab`, `/lab/[slug]`, `/lab/bookings`, `/lab/bookings/[id]` + shell nav |
| `mobile` | Lab browse / book / bookings / detail screens (same RN foundation) |
| `web-lab` | Bookings tab → real list (visibility only) |
| `web-admin` | No unrestricted booking mutation (R7-A acceptance unchanged) |

---

## 6. Notifications / audit

Outbox + inbox (no PHI): `LAB_BOOKING_CREATED`, `LAB_BOOKING_CONFIRMED`, `LAB_BOOKING_CANCELLED`, `LAB_BOOKING_PAYMENT_FAILED`.  
Security events with booking/org ids only — no clinical payloads, no PAN, no address body dumps in lab staff presenters.

---

## 7. Tests

`apps/api/src/lab/r7b.lab-booking.e2e.spec.ts` — discovery, pack empty/disabled fail-closed, wrong-location 403, Customer A↛B, Lab A↛B, booking idempotency, sandbox pay success/failure paths, no Order on capture, PHI exclusion checks.

R7-A e2e updated: `booking_enabled` true when ELIGIBLE.

### Regression (28 Aug 2026)

| Gate | Result |
|------|--------|
| `nx test api` | **60/60** suites · **144/144** tests — **PASS** |
| `nx test mobile` | **2/2** suites · **4/4** tests — **PASS** |
| `nx run-many -t typecheck --all` | **19/19** — **PASS** |
| `web-customer` + `web-lab` build | **PASS** |

### R7-B fixes applied (CR-R7-B-IMPL-143)

- Catalog browse: `workerTenantContext({ countryId })` so `catalog_offers` RLS (`can_country`) resolves under worker reads.
- Booking create/present: customer-safe includes + async lab display name via worker (no `labOrg` join under customer tenant).
- Sandbox pay: map API `scenario: failed` → mock `failure`.
- Mobile typecheck: `NativeText` / `NativeLoadingState` prop fixes.

---

## 8. Production boundary (remain OFF)

Live PSP · real money · real carrier · production healthcare · LIS/HIS · live e-Rx · automatic refill · production LiveKit / recording · CoC / pathology.

---

## 9. Non-starts

**R7-C/D/E/F NOT STARTED. R8+ NOT STARTED.**

---

**FINAL STATUS: R7_B_IMPLEMENTED**
