# 130 — R6-B Vendor catalog & commercial UX implementation

**Status:** Implemented (R6-B only)  
**Change ID:** **CR-R6-B-IMPL-130**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_B_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [129](129_POST_R6_A_AUDIT.md) (**R6_A_GREEN_R6_B_READY**) · [128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md)

**Authority:** Catalog **write UX** + commercial-rule **visibility** only. **R6-C/D/E/F NOT STARTED.** No live money/carriers/payouts/LiveKit/auto-refill. No vendor mobile / Partner App / second catalog or pricing kernel. **No Prisma migration** (schema sufficient).

---

## 1. Scope delivered

| Item | Result |
|------|--------|
| Vendor catalog write UX | Create item → variant → offer → publish; draft publish; price version replace |
| Commercial rule visibility | Read-only seller-safe rules list (own seller rules + marketplace/country defaults) |
| Isolation | Vendor A cannot create/list/mutate against Vendor B; cannot see B’s seller-specific rules |
| Hardcoded take/tax/currency/country | **Avoided** — currency/country from org/input; take from `CommercialRule` |

---

## 2. Files changed

### API
| File | Change |
|------|--------|
| `apps/api/src/catalog/catalog.service.ts` | `vendorCommercialRules()` presenter |
| `apps/api/src/catalog/vendor.controller.ts` | `GET commercial-rules`; `assertVendorSellerAccess` on create item/offer |
| `apps/api/src/catalog/r6b.vendor.e2e.spec.ts` | **New** R6-B e2e |

### Web
| File | Change |
|------|--------|
| `apps/web-vendor/src/vendor-api.ts` | Write + commercial-rules clients |
| `apps/web-vendor/src/vendor-catalog-panel.tsx` | Write UX (create/publish/price) |
| `apps/web-vendor/src/vendor-pricing-panel.tsx` | **New** read-only rules panel |
| `apps/web-vendor/src/vendor-shell.tsx` | Wire pricing panel; catalog gets `countryCode` |

### Docs
| File | Change |
|------|--------|
| `docs/blueprint/130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md` | This document |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 130 |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R6-B implemented |
| `docs/blueprint/126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md` | Sequencing note |

---

## 3. APIs

| Endpoint | Role |
|----------|------|
| Existing `POST /vendor/catalog/items\|variants\|offers\|publish\|prices` | Wired in UI; create item/offer now require VENDOR seller access at controller |
| **New** `GET /vendor/catalog/commercial-rules?seller_org_id=` | Seller-visible rules only (`seller_org_id` null+marketplace/country **or** own org). Snake_case `{ data }` |

Admin `createRule` remains company-only. Vendors cannot mutate CommercialRule.

---

## 4. Database

| Item | Result |
|------|--------|
| Migrations | **None** |
| Historical rewrite | **None** |

---

## 5. Security / RLS / PHI

| Check | Status |
|-------|--------|
| `assertVendorSellerAccess` on create item/offer + rules list | Yes |
| Cross-vendor create/publish/price deny | Covered in R6-B e2e |
| Other vendor’s seller-specific take rule hidden | Covered |
| Company finance via vendor token | Denied (e2e) |
| RLS role / FORCE | Unchanged |
| Clinical PHI in R6-B DTOs | None (`commercial-rules` / catalog offers only) |

---

## 6. UI

- Catalog tab: create/publish/price forms + offer table + draft publish actions
- Pricing tab: commercial rules table (replaces R6-B placeholder)
- Medicine-contextual loading; validation/error/success; 401/403 via shell handler
- No second design system; no fake auth

---

## 7. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **54** suites / **54**; **138** tests / **138**; exit **0** |
| Includes R0–R5, R6-A, R6-B, RLS, R3 isolation | Green |
| Typecheck | **18 / 18** |
| Web builds | **6 / 6** (vendor, customer, admin, store, doctor, join) |
| Retry-to-pass | **Not used** |
| Migrations pending | **None** |

---

## 8. Production boundaries (still OFF)

Live PSP · live DHL/carriers · vendor/affiliate payouts · production LiveKit · recording · automatic refill · live e-Rx — **OFF**.

---

## 9. Remaining R6-C+ (NOT started)

| Phase | Focus |
|-------|-------|
| R6-C | Inventory ops UX |
| R6-D | Order detail + fulfillment + Rx-safe presenters |
| R6-E | Settlements detail + support/notifications + admin moderation |
| R6-F | Isolation/RLS attestation campaign + pack gates + full accept |

---

## 10. Explicit non-starts

**R6-C, R6-D, R6-E, R6-F were NOT started.**  
Vendor mobile / Partner App / Lab / Radiology / CMS / CRM / Care-nav / live money — **NOT started**.

---

## Final declaration

**FINAL STATUS: R6_B_IMPLEMENTED**

**STOP.**
