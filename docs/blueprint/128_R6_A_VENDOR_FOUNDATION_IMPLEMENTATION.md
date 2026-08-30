# 128 — R6-A Vendor foundation implementation

**Status:** Implemented (R6-A only)  
**Change ID:** **CR-R6-A-IMPL-128**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_A_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [127](127_PRE_R6_A_IMPLEMENTATION_GATE.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority:** Close Book 127 R6-A gaps only. **R6-B+ NOT STARTED.** No live PSP/carrier/payout/LiveKit/auto-refill. No vendor mobile / Partner App / second identity or commerce kernels. No Prisma migration (schema already sufficient).

---

## 1. R6-A gaps closed

| Gap (Book 127) | Resolution |
|----------------|------------|
| Vendor IA foundation | `apps/web-vendor` sidebar + hash/tabs IA for Book 126 areas; live read panels for dashboard/org/profile/catalog/inventory/orders/shipments/settlements/security; honest later-phase EmptyStates for pricing/support/notifications/audit |
| Catalog DTO `{ data }` + snake_case | `CatalogService.vendorOffers` → `{ data: presentVendorOffer[] }` |
| `OrganizationKind.VENDOR` filtering | `GET /vendor/organizations` filters VENDOR; `assertVendorSellerAccess` on vendor offers list + vendor orders/shipments/settlements/inventory org-scoped reads |
| Customer seller display | Public offer DTO adds `seller_display_name` from `Organization.displayName`; customer PDP shows name |

---

## 2. Files changed

### API
| File | Change |
|------|--------|
| `apps/api/src/catalog/access.ts` | `assertVendorOrganization`, `assertVendorSellerAccess` |
| `apps/api/src/catalog/vendor-profile.controller.ts` | VENDOR-kind org list filter |
| `apps/api/src/catalog/catalog.service.ts` | Vendor offer presenter; public `seller_display_name`; `itemInclude.sellerOrg` |
| `apps/api/src/orders/order.service.ts` | Vendor list/get use `assertVendorSellerAccess` |
| `apps/api/src/logistics/logistics.service.ts` | Vendor list/get use `assertVendorSellerAccess` |
| `apps/api/src/finance/finance.service.ts` | Vendor settlements use `assertVendorSellerAccess` |
| `apps/api/src/inventory/vendor.controller.ts` | VENDOR guard + locations `{ data }` snake_case present |
| `apps/api/src/catalog/r6a.vendor.e2e.spec.ts` | **New** focused R6-A e2e |

### Web
| File | Change |
|------|--------|
| `apps/web-vendor/src/vendor-shell.tsx` | Full R6-A IA |
| `apps/web-vendor/src/vendor-api.ts` | Locations client; offer title typing |
| `apps/web-vendor/src/vendor-catalog-panel.tsx` | Medicine-contextual loading; title column |
| `apps/web-vendor/app/globals.css` | Layout / responsive |
| `apps/web-customer/src/product-detail.tsx` | Seller display name |
| `apps/web-customer/src/store-api.ts` | `seller_display_name` type |

### Docs
| File | Change |
|------|--------|
| `docs/blueprint/128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md` | This document |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 128 + next step |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R6-A implemented |

---

## 3. APIs

| Endpoint | Change |
|----------|--------|
| `GET /api/v1/vendor/organizations` | Only ACTIVE memberships on `OrganizationKind.VENDOR` |
| `GET /api/v1/vendor/catalog/offers` | `{ data: [...] }` snake_case; requires VENDOR seller org + membership |
| `GET /api/v1/vendor/inventory/locations` | `{ data: [...] }` snake_case; VENDOR org required |
| `GET /api/v1/vendor/orders|shipments|settlements|inventory/lots…` | Seller/owner org must be VENDOR (membership still required) |
| `GET /api/v1/catalog/items/:slug` | Offers include `seller_display_name` |

**Unchanged on purpose:** vendor catalog **write** (create/publish/price) still uses membership + ownership rules so R5 pharmacy `PLATFORM_OWNED` publish-via-vendor paths remain green. List/picker isolation is the R6-A authority boundary.

---

## 4. Database

| Item | Result |
|------|--------|
| Migrations | **None** |
| Historical rewrite | **None** |
| New identity / vendor tables | **None** |

---

## 5. Security

| Invariant | Status |
|-----------|--------|
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | Unchanged |
| FORCE RLS | Unchanged |
| Tenant context server-built | Unchanged |
| Client org id non-authoritative | Membership + VENDOR kind server checks |
| Vendor A ↛ Vendor B | Covered (existing + R6-A e2e) |
| Company finance via vendor token | Denied (existing) |
| No company_* grants from vendor | Unchanged |
| Rx PHI expansion | **None** — public DTO adds commercial display name only |

---

## 6. UI

- Real OTP auth; shared shell + ui-kit
- States: loading (medicine-contextual labels), empty, network, 401→expire, 403, session expired
- Responsive: sidebar hidden on narrow; tab row wraps
- Later R6 slots visible but explicitly not implemented

---

## 7. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **53** suites / **53**; **137** tests / **137**; exit **0** |
| Includes RLS / R3 isolation / R5-A…E / vendor isolation / new R6-A e2e | Green |
| `nx run-many -t typecheck` | **18** projects successfully ran |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — all Successfully ran |
| Migrations pending | None |
| Retry-to-pass | **Not used** |

---

## 8. Production boundaries (still OFF)

Live PSP · live DHL/carriers · vendor/affiliate payouts · production LiveKit · recording · automatic refill execution · live e-Rx — **unchanged / OFF**.

---

## 9. Remaining R6-B+ (explicitly NOT started)

| Phase | Focus |
|-------|-------|
| R6-B | Catalog write UX + commercial rule visibility |
| R6-C | Inventory ops UX |
| R6-D | Order detail + fulfillment UI + Rx-safe presenters |
| R6-E | Settlement detail + support/notifications + admin moderation polish |
| R6-F | Isolation/RLS attestation campaign + pack gates + full R6 accept |

---

## 10. Legal / human gates (unchanged OPEN where previously OPEN)

Marketplace MoR · seller contracts · pharmacy-as-vendor restrictions · tax/refunds/consumer protection · live payout KYC — **human/legal**, not invented here. R6-A is sandbox IA/DTO hardening only.

---

## 11. Explicit confirmation

**R6-B, R6-C, R6-D, R6-E, R6-F were NOT started.**

---

## Final declaration

**FINAL STATUS: R6_A_IMPLEMENTED**

**STOP.**
