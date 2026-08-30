# 133 — Post-R6-C codebase hygiene & R6-D readiness audit

**Status:** Audit only — **no R6-D coding** · **no deletions** · **no migrations**  
**Change ID:** **CR-POST-R6-C-FILE-HYGIENE-133**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_C_GREEN_R6_D_READY**

**Canonical inputs:** [132](132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md) · [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [131](131_POST_R6_B_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority:** Verify repository after R6-C. Inventory R6-A/B/C files. Identify unnecessary/duplicate candidates for a **future explicit cleanup CR**. Classify R6-D readiness. **Do not** implement R6-D/E/F. **Do not** delete files. **Do not** create migrations or application source.

---

## 0. Verdict

R6-A/B/C **did not** introduce parallel identity, catalog, inventory, payment, order, logistics, finance, notification, or support kernels. Live vendor work correctly reuses existing Nest modules via thin `/vendor/*` controllers and `apps/web-vendor` panels.

Optional hygiene debt exists (orphaned **web-admin** vendor panels superseded by `web-vendor`; local `tsconfig.tsbuildinfo`; stale shell copy). These are **not** engineering blockers for R6-D and were **not** deleted in this CR.

**Engineering blockers for R6-D:** **none.**

---

## 1. R6-A/B/C source inventory (actual)

### 1.1 Canonical live surface — `apps/web-vendor`

| PATH | Phase | Usage | Rec |
|------|-------|-------|-----|
| `src/vendor-shell.tsx` | R6-A (+B/C wire) | IA / tabs; imports all panels | **KEEP** |
| `src/vendor-api.ts` | R6-A/B/C | Single vendor HTTP client | **KEEP** |
| `src/vendor-catalog-panel.tsx` | R6-A→B | Catalog list + write | **KEEP** |
| `src/vendor-pricing-panel.tsx` | R6-B | Commercial rules read | **KEEP** |
| `src/vendor-inventory-panel.tsx` | R6-A→C | Inventory ops UX | **KEEP** |
| `src/vendor-orders-panel.tsx` | R6-A | List-only (R6-D extends) | **KEEP** |
| `src/vendor-shipments-panel.tsx` | R6-A | List-only | **KEEP** |
| `src/vendor-settlements-panel.tsx` | R6-A | List-only (R6-E depth) | **KEEP** |
| `src/providers.tsx` | foundation | Session | **KEEP** |
| `app/page.tsx`, `layout.tsx`, `globals.css` | R6-A | Mount / shell | **KEEP** |

**Imports:** `page` → `vendor-shell` → panels → `vendor-api` only. No orphan panels inside `web-vendor`.

### 1.2 API extensions (not new modules)

| PATH | Phase | Usage | Rec |
|------|-------|-------|-----|
| `catalog/access.ts` | R6-A | `assertVendorOrganization`, `assertVendorSellerAccess` | **KEEP** |
| `catalog/vendor-profile.controller.ts` | R6-A | VENDOR org list | **KEEP** |
| `catalog/vendor.controller.ts` | pre + R6-B | Catalog writes + commercial-rules | **KEEP** |
| `catalog/catalog.service.ts` | R6-A/B | `vendorOffers`, `vendorCommercialRules`, seller display | **KEEP** |
| `catalog/r6a.vendor.e2e.spec.ts` | R6-A | e2e | **KEEP** |
| `catalog/r6b.vendor.e2e.spec.ts` | R6-B | e2e | **KEEP** |
| `inventory/vendor.controller.ts` | pre + R6-A/C | Inventory HTTP + seller guards | **KEEP** |
| `inventory/r6c.vendor.e2e.spec.ts` | R6-C | e2e | **KEEP** |
| `orders|logistics|finance` vendor controllers + seller asserts | R6-A | Existing kernels | **KEEP** |
| `logistics/logistics.e2e.spec.ts` | R6-C touch | Timeout only | **KEEP** |

### 1.3 Customer touchpoints (R6-A)

| PATH | Usage | Rec |
|------|-------|-----|
| `web-customer/src/product-detail.tsx` | `seller_display_name` | **KEEP** |
| `web-customer/src/store-api.ts` | Type | **KEEP** |

### 1.4 `packages/`

**No** R6-A/B/C packages added. **No** second shared vendor client package.

### 1.5 Prisma / schema / configs

**No** R6 migrations. Schema unchanged for R6-C (Book 132). No duplicate inventory/catalog tables.

### 1.6 `AppModule`

Imports remain: Identity, Partner, Catalog, Inventory, Cart, Payment, Order, Logistics, Finance, Clinical, Store, Delivery, Governance, Platform, Events — **no** `VendorModule` / `MarketplaceModule`.

---

## 2. Unnecessary / duplicate suspects (no deletion performed)

| PATH | CLASSIFICATION | REFERENCES / IMPORTS | ACTUAL USAGE | Rec | REASON | RISK |
|------|----------------|----------------------|--------------|-----|--------|------|
| `web-admin/src/vendor-orders.tsx` | Orphan UI | **None** | Dead | **DELETE** (future CR) | Routes use `VendorSupersededNotice` | Low |
| `web-admin/src/vendor-shipments.tsx` | Orphan UI | **None** | Dead | **DELETE** (future CR) | Same | Low |
| `web-admin/src/vendor-settlements.tsx` | Orphan UI | **None** | Dead | **DELETE** (future CR) | Same | Low |
| `web-admin/src/vendor-catalog.tsx` | Orphan UI | Only `vendor-catalog.spec.tsx` | Dead panel | **DELETE** (future CR) | Superseded by `web-vendor` | Low (lose smoke tests) |
| `web-admin/src/vendor-catalog.spec.tsx` | Spec for dead UI | Jest | Spec-only | **DELETE** with panel | Same | Low |
| `web-admin/src/vendor-inventory.tsx` | Orphan UI + inline fetch | Only `vendor-inventory.spec.tsx` | Dead; duplicate client pattern | **DELETE** (future CR) | Same | Low |
| `web-admin/src/vendor-inventory.spec.tsx` | Spec for dead UI | Jest | Spec-only | **DELETE** with panel | Same | Low |
| `web-admin/src/vendor-superseded-notice.tsx` | Compatibility stub | `app/vendor/**/page.tsx` | Live notice | **KEEP** | Intentional cutover | — |
| `web-admin/app/vendor/**` | Route stubs | Next | Notice only | **KEEP** (or later remove nav) | Compatibility | Low if removed with notice |
| `apps/*/tsconfig.tsbuildinfo` | Local TS emit | N/A | Build artifact | **DELETE** / gitignore (future) | Not ignored today (`.gitignore` has `.next` only) | Low |
| `apps/*/.next/**` | Build output | N/A | Local | **OK** | Already gitignored | — |

**Parallel kernels:** **None** found under `apps/` or `packages/`.

**Duplicate API clients (live):** **None.** Canonical = `web-vendor/src/vendor-api.ts`. Admin orphans had inline `fetch` — removed only if panels deleted in a future CR.

**Stale copy (not delete):** `vendor-shell.tsx` still has some “later R6” wording — polish in R6-D or small hygiene CR.

### Future cleanup CR checklist (explicit approval required)

1. Delete orphaned `web-admin/src/vendor-{catalog,inventory,orders,shipments,settlements}*` (+ specs).  
2. Keep `VendorSupersededNotice` + routes unless nav removal is authorized.  
3. Add `*.tsbuildinfo` to `.gitignore`; remove local emit files.  
4. Soft-update `vendor-shell` copy (R6-B/C done).

**If no unnecessary/duplicate executable files exist on the live R6 path:** **Correct** — live R6 path is clean. Orphans are **admin legacy only**, not executable on vendor product paths.

---

## 3. Canonical kernel check

| Kernel | R6 reuse | Duplicate created? |
|--------|----------|-------------------|
| Identity / JWT / audiences | Existing | **No** |
| Partner / Organization | Existing | **No** |
| Tenant / RLS | Existing interceptor + GUCs | **No** |
| Catalog / CommercialRule / PriceVersion | `CatalogService` | **No** |
| Inventory | `InventoryService` | **No** |
| Cart / Quote / Payment | Untouched for vendor back-office | **No** |
| Order / fulfillment | `OrderService` | **No** |
| Logistics | Existing vendor shipments | **No** |
| Finance / settlements | Existing | **No** |
| Notification / Support | Placeholders → R6-E | **No** second bus |
| Audit / outbox / events | Existing | **No** Kafka |

---

## 4. R6-C verification

| Requirement | Result |
|-------------|--------|
| Inventory overview (lots / on-hand / available / expiry / status) | **PASS** — `vendor-inventory-panel` |
| VENDOR_WAREHOUSE create; Store kind rejected | **PASS** — controller + UI |
| GRN receive/post + confirmation | **PASS** |
| Adjustments + reason + confirmation + audit outbox | **PASS** |
| Same-org transfer lifecycle | **PASS** |
| Movement history (snake_case) | **PASS** |
| `assertVendorSellerAccess` on mutations | **PASS** |
| Store vs Vendor boundary | **PASS** — no Store GRN; pharmacy org denied |
| PHI hygiene | **PASS** — e2e asserts no diagnosis/clinical/PHI strings |
| Focused tests | **PASS** — r6a + r6b + r6c e2e (3/3) |

---

## 5. Security

| Check | Result |
|-------|--------|
| `worldpharma_app` NOSUPERUSER | **PASS** (`rolsuper=false`) |
| `worldpharma_app` NOBYPASSRLS | **PASS** (`rolbypassrls=false`) |
| FORCE RLS on offers, prices, rules, lots, movements, GRN, transfers, orders, orgs, memberships | **PASS** (`rls=true`, `force_rls=true`) |
| Vendor A ↛ B | **PASS** — R6-A/B/C + inventory isolation e2e |
| Vendor cannot become company admin | **PASS** — no company role grant path in R6 |
| Tenant headers non-authoritative | **PASS** — `buildUserTenantContext`; tenancy e2e forbids `x-organization-id` as auth |
| Dev-access bypass in web-vendor | **None** |

---

## 6. Full regression (exact; no retry-to-pass)

| Check | Result |
|-------|--------|
| `nx test api` | **55** suites / **55**; **139** tests / **139**; exit **0** |
| Includes RLS, R3 isolation, R5-A…E, R6-A, R6-B, R6-C | Green |
| Focused R6-A/B/C | **3** suites / **3** tests |
| Typecheck | **18 / 18** |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — Successfully ran |
| Mobile typecheck | Included in 18 — green |
| Migrations this CR | **None** |
| Application/source files this CR | **None** (docs only) |

---

## 7. Production boundaries (still OFF)

| Boundary | Evidence |
|----------|----------|
| Live PSP | Sandbox payment kernel; R14 not started |
| Live DHL/carriers | Mock logistics |
| Vendor / affiliate payouts | `live_payout: false` in finance present |
| Production LiveKit | Provider ports force `recordingEnabled: false`; sandbox path |
| Recording | Default **false** |
| Automatic refill execution | `auto_refill: false` / `auto_execute_enabled: false` (R5-E) |
| Live e-Rx | Clinical sandbox / legal ODs open |

---

## 8. R6-D readiness (Book 126 §28)

**Exact R6-D scope:** Order detail + fulfillment actions + Rx-safe presenters.

| Prerequisite | Classification | Notes |
|--------------|----------------|-------|
| R6-A/B/C foundation | **READY** | 128 / 130 / 132 |
| Vendor order list/detail APIs | **READY** | `OrderVendorController` + `assertVendorSellerAccess` |
| Pick / pack / ready APIs | **READY** | Existing POSTs; covered in `order.e2e` |
| web-vendor order list panel | **READY** (extend) | List exists; detail/actions are R6-D work |
| Fulfillment UI wiring | **PARTIAL** | Gap = UI + `vendor-api` clients — *is* R6-D |
| Vendor Rx-safe presenter | **PARTIAL** | Shared `present()` has opaque Rx ids; dedicated vendor min-necessary + leak tests = R6-D |
| Live money / carrier | N/A | Must remain OFF |

**Overall R6-D:** **READY** to authorize **CR-R6-D-*** (UI + presenter hardening). No blocked engineering prerequisites.

---

## 9. Cleanup decision

**This CR deleted nothing.**

Live R6 executable path: **clean** (no duplicate kernels; no unused `web-vendor` panels).

Future optional cleanup list: §2 table (admin orphans + tsbuildinfo + shell copy).

---

## 10. Legal / human

| Bucket | Items |
|--------|-------|
| Engineering | **None** blocking R6-D |
| Product | PD-R6D-01 fulfillment UX depth; PD-R6D-02 Rx field visibility for marketplace sellers |
| Human governance | Authorize **CR-R6-D-*** before coding |
| Legal/compliance | MoR, seller contracts, pharmacy-as-vendor, e-Rx seller visibility — **OPEN** where previously OPEN; do not invent |

---

## 11. Explicit non-starts

- R6-D / R6-E / R6-F production code  
- File deletion / cleanup CR execution  
- Migrations  
- Live PSP / carriers / payouts / LiveKit / recording / auto-refill / live e-Rx  

---

## Final declaration

**FINAL STATUS: R6_C_GREEN_R6_D_READY**

**R6-D/E/F: NOT STARTED.**

**STOP.**
