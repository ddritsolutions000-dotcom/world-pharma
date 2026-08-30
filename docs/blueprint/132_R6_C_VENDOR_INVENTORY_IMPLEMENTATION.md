# 132 — R6-C Vendor inventory operations implementation

**Status:** Implemented (R6-C only)  
**Change ID:** **CR-R6-C-IMPL-132**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_C_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [131](131_POST_R6_B_AUDIT.md) (**R6_B_GREEN_R6_C_READY**) · [130](130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md)

**Authority:** Vendor inventory **ops UX** + mutation-path seller hardening only. **R6-D/E/F NOT STARTED.** No live money/carriers/payouts/LiveKit/auto-refill/live e-Rx. No vendor mobile / Partner App / second inventory kernel. **No Prisma migration** (schema sufficient).

---

## 1. Scope delivered

| Item | Result |
|------|--------|
| Inventory overview | Lots table: SKU, lot, location, on-hand, available, expiry, status |
| Warehouse locations | List + create **VENDOR_WAREHOUSE** only (Store kind rejected) |
| GRN receive/post | Create → receive → post with confirmation |
| Adjustments | Qty delta + reason + confirmation; auditable |
| Transfers | Same-seller-org reserve → dispatch → receive |
| Movement history | Snake_case movements list (commercial/fulfillment only) |
| Isolation | Vendor A ↛ B locations/lots/movements/GRN/adjust/transfer lifecycle |
| Store vs Vendor | Vendor cannot create Store locations or GRN to STORE; cannot use pharmacy org as owner |

---

## 2. Current-state check (pre-impl)

| Surface | Finding |
|---------|---------|
| `/vendor/inventory/*` | Locations, lots, movements, GRN, adjustments, transfers **already existed** |
| `InventoryService` | Shared 1B kernel — reused; no duplicate tables |
| UI | Read-only lots panel — **gap closed** |
| Auth gap | GRN receive/post, adjust, transfer lifecycle lacked `assertVendorSellerAccess` at controller (membership-only via service) — **fixed** |
| Schema | Sufficient — **no migration** |

---

## 3. Files changed

### API
| File | Change |
|------|--------|
| `apps/api/src/inventory/vendor.controller.ts` | Seller access on all mutations; force `VENDOR_WAREHOUSE`; reject STORE GRN; snake_case movements/transfers/receipts; `GET grn` |
| `apps/api/src/inventory/r6c.vendor.e2e.spec.ts` | **New** R6-C isolation/mutation/PHI/audit e2e |
| `apps/api/src/logistics/logistics.e2e.spec.ts` | `jest.setTimeout(120_000)` — suite-growth determinism (same pattern as R5 clinical) |

### Web
| File | Change |
|------|--------|
| `apps/web-vendor/src/vendor-api.ts` | Inventory mutation + list clients |
| `apps/web-vendor/src/vendor-inventory-panel.tsx` | Full R6-C UX (overview/receive/adjust/transfer/history) |

### Docs
| File | Change |
|------|--------|
| `docs/blueprint/132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md` | This document |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 132 |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R6-C implemented |
| `docs/blueprint/126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md` | Sequencing note |

---

## 4. API changes

| Endpoint | Change |
|----------|--------|
| `POST /vendor/inventory/locations` | Always `VENDOR_WAREHOUSE`; rejects other kinds; snake_case response |
| `GET /vendor/inventory/grn?owner_org_id=` | **New** receipt list (snake_case) |
| `GET /vendor/inventory/movements` | Snake_case presenter; optional `lot_id` |
| `GET /vendor/inventory/transfers` | Snake_case list wrapper |
| `POST …/grn`, `…/grn/:id/receive|post` | `assertVendorSellerAccess`; STORE location GRN rejected |
| `POST …/adjustments` | Load lot → `assertVendorSellerAccess` (RLS may yield 404 cross-tenant) |
| `POST …/transfers*` | Create + lifecycle gated by seller access |

Client-supplied `organization_id` / `owner_org_id` / `location_id` are **not** authorization — membership + VENDOR kind required.

---

## 5. Database / migrations

| Item | Result |
|------|--------|
| Migrations | **None** |
| Historical rewrite | **None** |
| Second inventory tables | **None** |

---

## 6. Inventory semantics

| Rule | Behavior |
|------|----------|
| Kernel | Existing `InventoryLot` / balance / movements / GRN / transfer |
| Stock changes | Explicit GRN post or adjustment only — no silent consume |
| Expiry | Existing `expires_on` on lots; shown in UI |
| Accounting | Unchanged FEFO/reservation rules in service |

---

## 7. UI (`web-vendor`)

| Area | Result |
|------|--------|
| Shell tab | Existing Inventory tab → write ops panel |
| States | Loading (medicine-contextual), empty, form error, 401/403 via shell `onError` |
| Confirmations | `window.confirm` on GRN post, adjust, transfer |
| Store impersonation | Copy + API reject Store location create / Store GRN |
| Dev bypass | **None** |
| i18n | Architecture only (English copy) — same as R6-A/B |

---

## 8. Security / RLS

| Check | Status |
|-------|--------|
| `assertVendorSellerAccess` on reads + mutations | Yes |
| Cross-vendor steal (lots/GRN/adjust/transfer) | Denied (403 or RLS 404) |
| Pharmacy org as vendor owner | Forbidden |
| FORCE RLS / NOSUPERUSER | Unchanged (not weakened) |

---

## 9. Audit / events

| Event | Path |
|-------|------|
| `INVENTORY_RECEIVED` | Existing outbox on GRN post |
| `INVENTORY_ADJUSTED` | Existing outbox on adjust |
| Transfer events | Existing kernel |
| PHI in payloads | **None** — qty/reason/ids only |

No Kafka. No second bus.

---

## 10. PHI review

Vendor inventory DTOs/UI/events contain **no** diagnosis, clinical notes, prescription instructions, or patient PHI. R5 clinical modules untouched.

---

## 11. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **55** suites / **55**; **139** tests / **139**; exit **0** |
| Includes RLS, R3, R5-A…E, R6-A, R6-B, **R6-C** | Green |
| Typecheck | **18 / 18** projects |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — all Successfully ran |
| Mobile typecheck | Included in 18 — green |
| Migrations | **0** created |

---

## 12. Production boundaries (still OFF)

Live PSP · live DHL/carriers · vendor/affiliate payouts · production LiveKit · recording · automatic refill execution · live e-Rx — **OFF**.

---

## 13. Remaining R6 work (NOT STARTED)

| Phase | Focus |
|-------|-------|
| **R6-D** | Order detail + fulfillment + Rx-safe presenters |
| **R6-E** | Settlements detail + support/notifications + admin polish |
| **R6-F** | Isolation/RLS attestation + pack gates + acceptance |

---

## 14. Legal / human

### Engineering
**None** blocking R6-C green.

### Product
| ID | Topic |
|----|-------|
| PD-R6C-01 | Fine-grained warehouse staff roles vs org_admin (deferred) |
| PD-R6D-01 | Order fulfillment UX depth |

### Human governance
Authorize **CR-R6-D-*** before order/fulfillment coding.

### Legal / compliance (OPEN — do not invent)
MoR · seller contracts · pharmacy-as-vendor · tax/refunds · payout KYC — unchanged.

---

## 15. Explicit non-starts

- R6-D / R6-E / R6-F  
- Vendor mobile / Partner App  
- Lab / CMS / CRM / care-nav  
- Live PSP / carriers / payouts / LiveKit / recording / auto-refill / live e-Rx  
- Second identity or inventory kernel  

---

## Final declaration

**FINAL STATUS: R6_C_IMPLEMENTED**

**R6-D/E/F: NOT STARTED.**

**STOP.**
