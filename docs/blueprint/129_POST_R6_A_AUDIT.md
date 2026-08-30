# 129 — Post-R6-A regression & R6-B readiness audit

**Status:** Audit only — **no R6-B coding**  
**Change ID:** **CR-POST-R6-A-AUDIT-129**  
**Date:** 27 August 2026  
**Canonical implementation:** [128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md) (**R6_A_IMPLEMENTED**)  
**Plan / gate:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [127](127_PRE_R6_A_IMPLEMENTATION_GATE.md)

**Authority:** Verify repository after R6-A. **Do not** implement R6-B/C/D/E/F. **Do not** add features or cleanup-only refactors. Migrations only if a real regression requires them (**none required**).

---

## FINAL STATUS

### **R6_A_GREEN_R6_B_READY**

R6-A deliverables verified. Full API regression green. Live money/clinical execution remain OFF. R6-B (catalog write UX + commercial rule visibility) can be authorized via a separate **CR-R6-B-*** — **not started by this audit**.

**Engineering blockers for R6-B:** **none.**

---

## 1. R6-A verification (code vs Book 128)

| Deliverable | Classification | Evidence |
|-------------|----------------|----------|
| Vendor IA (nav / layout) | **PASS** | `apps/web-vendor/src/vendor-shell.tsx` — Sidebar + section tabs; Book 126 areas present |
| Live read panels | **PASS** | Dashboard, organization/locations, profile, catalog, inventory, orders, shipments, settlements, security |
| Honest later-phase placeholders | **PASS** | Pricing → R6-B; support/notifications → R6-E; audit → R6-E/F (`LaterPhaseState`) |
| Catalog DTO `{ data: [...] }` | **PASS** | `CatalogService.vendorOffers` returns `{ data: presentVendorOffer[] }` |
| Snake_case vendor offer fields | **PASS** | `seller_org_id`, `country_code`, `sell_minor`, `variant_id`, … — no camelCase leak in presenter |
| `OrganizationKind.VENDOR` org list | **PASS** | `vendor-profile.controller.ts` filters `kind: VENDOR` |
| Seller-scoped vendor reads + VENDOR kind | **PASS** | `assertVendorSellerAccess` on offers list, orders, shipments, settlements, inventory org paths |
| Customer `seller_display_name` | **PASS** | Public `toPublicItem` + `product-detail.tsx` |
| Fake / dev auth bypass in vendor UI | **PASS** (absent) | Real `signInWithOtp(..., 'customer')` only |

**No R6-A FAIL items.**

---

## 2. Vendor tenancy / RLS

| Check | Result |
|-------|--------|
| Vendor A ↛ Vendor B offers/settlements/lots (read) | **PASS** — `r6a.vendor.e2e`, `app-isolation.e2e`, catalog/inventory/finance e2e |
| Vendor A ↛ Vendor B offer **publish** (mutate) | **PASS** — `catalog.e2e` steal publish → 403 |
| Wrong org / non-VENDOR as seller_org | **PASS** — R6-A e2e clinic org → 403 on vendor catalog list |
| Location scope deny | **PARTIAL** — `assertInventoryOwner` location membership exists; dedicated cross-location e2e expansion remains R6-F debt |
| Inventory/fulfill **mutate** cross-vendor e2e | **PARTIAL** — service guards present; dedicated steal-POST e2e still R6-F (Book 126 §21) — **not** an R6-A fail |
| Company finance via vendor token | **PASS** — vendor → admin finance dashboard ≥400 |
| Company role grants from vendor | **PASS** — no vendor grant API |
| Client tenant headers non-authoritative | **PASS** — `rls.tenancy.e2e` |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** — live DB `rolsuper=f`, `rolbypassrls=f` |
| ENABLE + FORCE on key tables | **PASS** — `catalog_offers`, `orders`, `vendor_payables`, `settlement_lines`, `inventory_lots`, `organizations`, `prescriptions`, `memberships` all `relrowsecurity=t` + `relforcerowsecurity=t` |

---

## 3. R0–R5 regression (exact)

Executed this audit (**no retry-to-pass**):

| Suite | Result |
|-------|--------|
| Full `nx test api` | **53** suites passed / **53**; **137** tests passed / **137**; exit **0** |
| Includes R0/R1 foundation, R2/R3, R4 sandbox video topology, R5-A…E, RLS tenancy, vendor isolation, R6-A e2e | Green inside the 137 |

---

## 4. Rx / PHI safety

| Claim | Result |
|-------|--------|
| R6-A added clinical joins to vendor DTOs | **No** |
| Vendor order `INCLUDE` loads Prescription / Encounter / notes | **No** |
| Opaque commerce fields only | `prescription_id`, `dispensing_case_id`, `dispense_event_id`, `rx_inventory_consumed_at_dispense` |
| Diagnosis / clinical notes / Rx instructions / doctor private | **Not exposed** |
| Public catalog `seller_display_name` | Commercial org display name only |

Dedicated Rx-safe vendor presenter remains **R6-D** (planned), not required to call R6-A green.

---

## 5. Commerce integrity

| Kernel | Status after R6-A |
|--------|-------------------|
| Catalog / Offer / CommercialRule | Single kernel; presenter additive only |
| Inventory / Cart / Quote / PaymentIntent / Order / Shipment / Finance | Unbroken in full suite |
| Historical freeze (`takeBpsFrozen`) | Still asserted in `finance.e2e` |
| Duplicate catalog/pricing/payment/order | **None** |

---

## 6. MNC governance

Hierarchy Region → Country → Legal Entity → Business Unit → Organization → Location preserved. Vendor remains **organization-scoped** (`OrganizationKind.VENDOR`). Company admin remains separate control plane. BU membership wiring remains R15 deferred — **not** an R6-A or R6-B kernel break.

---

## 7. UI / frontend (`web-vendor`)

| Area | Result |
|------|--------|
| Auth / session | Real OTP; expire → `SessionExpiredState`; 401 → expire; 403 → `PermissionDeniedState` |
| Loading / empty / network | ui-kit states; medicine-contextual loading labels on dashboard/catalog/orgs |
| Responsive | Sidebar + tab row; sidebar hidden &lt;860px |
| Accessibility | ui-kit foundations (roles/labels on nav/controls) |
| i18n | **PARTIAL** — `shell-core` i18n architecture available; vendor copy still hardcoded English (acceptable for R6-A; not an R6-B start blocker) |
| Dev-access bypass | **None** found |

---

## 8. Buffering UX

Locked rule preserved: unavoidable loads use healthcare/medicine-contextual labels (`Checking medicine catalog…`, `Loading medicine catalog offers…`). Errors use network/permission states — **not** masked as loading.

---

## 9. API contract / consumers

| Consumer | Result |
|----------|--------|
| Vendor catalog list | Expects `{ data }` snake_case — aligned |
| Customer PDP | Additive `seller_display_name` — builds green |
| Store / doctor / admin / mobile | No breaking catalog list shape change for public browse; typecheck + web builds green |
| Admin catalog create/publish | Unchanged paths; R5 pharmacy vendor-publish fallback still works (regression green) |

---

## 10. Security / audit / events

Tenant interceptor + GUCs, RBAC, RLS, existing outbox — unchanged. No Kafka / second event bus / vendor security bypass introduced in R6-A.

---

## 11. Production boundaries (unchanged OFF)

| Boundary | Status |
|----------|--------|
| Live PSP | **OFF** |
| Live carrier / DHL | **OFF** (mock) |
| Vendor / affiliate payouts | **OFF** (`live_payout: false`) |
| Production LiveKit | **OFF** (mock default) |
| Recording | **OFF** |
| Automatic refill execution | **OFF** |
| Live e-Rx | Pack-gated / not production-enabled by R6-A |

---

## 12. R6-B readiness

| Question | Answer |
|----------|--------|
| What is R6-B (Book 126 §28)? | **Catalog write UX** on Vendor Web + **commercial rule visibility** |
| APIs already exist? | **Yes** — `POST /vendor/catalog/items|offers|publish|prices` |
| Engineering blockers? | **None** |
| Classification | **READY** |

Do **not** implement R6-B from this audit. Requires **CR-R6-B-AUTH/IMPL**.

Known non-blocking debt for later phases: inventory mutate isolation e2e (R6-F), Rx-safe order presenter (R6-D), support/notifications UX (R6-E), vendor i18n catalogs.

---

## 13. Quality gates (exact)

| Check | Result |
|-------|--------|
| API tests | **137 / 137** |
| RLS / R3 isolation / R5 / vendor | Included — green |
| Typecheck | **18 / 18** projects |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — all Successfully ran (admin re-run after one transient parallel-build failure) |
| Mobile | Typecheck included in 18 (store/doctor/delivery/mobile) — green; EAS/store builds not claimed |
| Migrations | **None** created; test DB **0** pending |
| Code/docs changes in this CR | **Docs only** |

---

## 14. Human / legal separation

### Engineering blockers
**None** for R6-A green or R6-B start.

### Product decisions
| ID | Topic |
|----|-------|
| PD-R6B-01 | Depth of commercial-rule UI (read-only effective rules vs seller-editable under pack) |
| PD-R6B-02 | Whether create-item UX is in-vendor or admin-assisted for first marketplace countries |

### Human governance
Authorize **CR-R6-B-*** before coding. MoR / marketplace go-live remains human.

### Legal / compliance (OPEN — do not invent)
Marketplace operator/MoR · seller contracts · pharmacy-as-vendor · tax/refunds/consumer protection · payout KYC — unchanged OPEN where previously OPEN.

---

## Document control

| Action | Status |
|--------|--------|
| Create `docs/blueprint/129_POST_R6_A_AUDIT.md` | **This document** |
| Update master index / roadmap | Companion only |
| Production code / migrations | **NONE** |

---

## Final declaration

**FINAL STATUS: R6_A_GREEN_R6_B_READY**

**R6-B: NOT STARTED.**  
**R6-C/D/E/F: NOT STARTED.**

**STOP.**
