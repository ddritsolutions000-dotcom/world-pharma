# 134 — R6-D Vendor order detail & fulfillment implementation

**Status:** Implemented (R6-D only)  
**Change ID:** **CR-R6-D-IMPL-134**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_D_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [133](133_POST_R6_C_CODEBASE_HYGIENE_AND_R6_D_READINESS.md) (**R6_C_GREEN_R6_D_READY**) · [132](132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md)

**Authority:** Vendor order **detail** + **fulfillment UX** + **Rx-safe vendor presenter** only. **R6-E/F NOT STARTED.** No live money/carriers/payouts/LiveKit/auto-refill/live e-Rx. No vendor mobile / Partner App / second order kernel. **No Prisma migration.**

---

## 1. Scope delivered

| Item | Result |
|------|--------|
| Vendor order list (seller-scoped) | Snake_case summary via `presentVendor` |
| Vendor order detail | Lines, ship-to, economics (frozen), history, shipments, exceptions |
| Fulfillment UX | Pick start/complete → pack start/complete → ready (existing state machine) |
| Rx-safe presenter | Dedicated `presentVendor` — does **not** alter customer/admin `present()` |
| Isolation | Vendor A ↛ B detail/mutations; VENDOR seller access on fulfill path |
| Store / Delivery boundary | Copy + actions limited to seller pick/pack/ready; no Store Rx / POD |

---

## 2. Current-state (pre-impl)

| Surface | Finding |
|---------|---------|
| `/vendor/orders` list/get/pick/pack/ready | **Existed** |
| Shared `present()` | Exposed payment/pricing/fulfillment raw + Rx linkage fields — **too wide for vendor** |
| `web-vendor` orders panel | List-only — **gap closed** |
| Schema | Sufficient — **no migration** |

---

## 3. Files changed

### API
| File | Change |
|------|--------|
| `apps/api/src/orders/order.service.ts` | `presentVendor`; `*ForVendor` fulfill wrappers; `assertVendorCanFulfill` (RLS-safe) |
| `apps/api/src/orders/vendor.controller.ts` | Wire vendor fulfill methods |
| `apps/api/src/orders/r6d.vendor.e2e.spec.ts` | **New** R6-D e2e |

### Web
| File | Change |
|------|--------|
| `apps/web-vendor/src/vendor-api.ts` | Order detail + fulfill clients |
| `apps/web-vendor/src/vendor-orders-panel.tsx` | Detail + fulfillment actions + confirmations |

### Docs
| File | Change |
|------|--------|
| `docs/blueprint/134_R6_D_VENDOR_ORDER_FULFILLMENT_IMPLEMENTATION.md` | This document |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 134 |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R6-D implemented |
| `docs/blueprint/126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md` | Sequencing note |

---

## 4. API / presenter

| Endpoint | Behavior |
|----------|----------|
| `GET /vendor/orders?seller_org_id=` | `presentVendor` list |
| `GET /vendor/orders/:id` | `presentVendor` detail + seller access |
| `POST …/pick/start\|complete`, `pack/start\|complete`, `ready` | `assertVendorCanFulfill` then existing transitions; response = `presentVendor` |

### `presentVendor` includes
Order id/number/status · commercial minors · items (sku/qty/amounts) · ship-to snapshot · frozen economics (payable/paid/tax/shipping) · status history · pick/pack task status · shipment id/status/tracking · returns id/reason · `rx_origin` + opaque `prescription_id` · exceptions flags.

### `presentVendor` excludes
`payment` · `pricing` payload/fingerprint · `promo` · `affiliate` · `dispensing_case_id` / `dispense_event_id` · `customer_person_id` · diagnosis / clinical notes / Rx instructions · raw clinical JSON.

Shared customer/admin `present()` **unchanged**.

---

## 5. Database

| Item | Result |
|------|--------|
| Migrations | **None** |
| Duplicate order tables | **None** |

---

## 6. Security / RLS / PHI

| Check | Status |
|-------|--------|
| `assertVendorSellerAccess` on list/get | Yes |
| Vendor fulfill uses `assertVendorCanFulfill` (findUnique → forbid if RLS-hidden) | Yes |
| Cross-vendor steal detail/pick | Denied (403) |
| PHI leak tests | R6-D e2e |
| Customer order view after fulfill | Still works |

---

## 7. UI (`web-vendor`)

| Area | Result |
|------|--------|
| List + open detail | Live |
| Fulfillment buttons by status | Allocated→pick→pack→ready |
| Confirmations | `window.confirm` before mutations |
| Loading | Medicine-contextual labels |
| Empty / not-found / form error | ui-kit + shell `onError` for 401/403 |
| Dev bypass | **None** |

---

## 8. Audit / events

Existing `ORDER_*` outbox on transitions reused. Payload = status from/to/reason/sandbox only — **no clinical PHI**.

---

## 9. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **56** suites / **56**; **140** tests / **140**; exit **0** |
| Includes RLS, R3, R5-A…E, R6-A…**D** | Green |
| Typecheck | **18 / 18** |
| Web builds | **6 / 6** (vendor, customer, admin, store, doctor, join) |
| Migrations | **0** |

---

## 10. Production boundaries (still OFF)

Live PSP · live DHL/carriers · vendor/affiliate payouts · production LiveKit · recording · automatic refill · live e-Rx — **OFF**.

---

## 11. Remaining R6 (NOT STARTED)

| Phase | Focus |
|-------|-------|
| **R6-E** | Settlements detail + support/notifications + admin polish |
| **R6-F** | Isolation/RLS attestation + pack gates + acceptance |

---

## 12. Legal / human

| Bucket | Notes |
|--------|-------|
| Engineering | **None** blocking |
| Product | PD-R6E-01 settlement detail depth |
| Human | Authorize **CR-R6-E-*** before settlements/support coding |
| Legal | MoR / pharmacy-as-vendor / e-Rx seller visibility — OPEN where previously OPEN |

---

## 13. Explicit non-starts

R6-E/F · vendor mobile · Partner App · lab/CMS/CRM · live PSP/carriers/payouts/LiveKit/recording/auto-refill/live e-Rx · second order kernel.

---

## Final declaration

**FINAL STATUS: R6_D_IMPLEMENTED**

**R6-E/F: NOT STARTED.**

**STOP.**
