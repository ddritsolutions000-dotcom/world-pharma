# 131 — Post-R6-B regression & R6-C readiness audit

**Status:** Audit only — **no R6-C coding**  
**Change ID:** **CR-POST-R6-B-AUDIT-131**  
**Date:** 27 August 2026  
**Canonical implementation:** [130](130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md) (**R6_B_IMPLEMENTED**)  
**Prior gates:** [129](129_POST_R6_A_AUDIT.md) · [128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md) · plan [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md)

**Authority:** Verify repository after R6-B. **Do not** implement R6-C/D/E/F. **Do not** add features or cleanup-only refactors. Migrations only if a verified regression requires them (**none required**).

---

## FINAL STATUS

### **R6_B_GREEN_R6_C_READY**

R6-B deliverables verified. Full API regression green. Live money/clinical execution remain OFF. R6-C (inventory ops UX) can be authorized via a separate **CR-R6-C-*** — **not started by this audit**.

**Engineering blockers for R6-C:** **none.**

---

## 1. R6-B verification (code vs Book 130)

| Requirement | Classification | Evidence |
|-------------|----------------|----------|
| Create catalog item | **PASS** | `POST /vendor/catalog/items` + UI create flow; `assertVendorSellerAccess` |
| Create variant | **PASS** | `POST .../items/:id/variants` wired in UI |
| Create offer | **PASS** | `POST /vendor/catalog/offers` + VENDOR ownership; seller access asserted |
| Draft publish | **PASS** | Publish on create path + draft-offer Publish actions |
| Price version replacement | **PASS** | `POST .../offers/:id/prices` → `pricing.createVersion` (new version; prior rows retained) |
| Commercial-rule read-only visibility | **PASS** | `GET /vendor/catalog/commercial-rules` + `VendorPricingPanel` |
| Seller-safe filtering | **PASS** | Own `seller_org_id` **or** null+MARKETPLACE/country; never other sellers’ private rules |
| `assertVendorSellerAccess` | **PASS** | create item/offer, offers list, commercial-rules |
| No second catalog/pricing kernel | **PASS** | Reuses `CatalogService` / `PricingService` / `CommercialRule` |
| Fake/dev auth bypass | **PASS** (absent) | Real OTP only |

**No R6-B FAIL items.**

**PARTIAL (non-blocking polish):** Publish/price use inline success/error text rather than a dedicated confirmation modal; acceptable for R6-B completeness.

---

## 2. Vendor isolation

| Check | Result |
|-------|--------|
| A cannot create item/offer for B’s org | **PASS** — R6-B e2e → 403 |
| A cannot publish/price B’s offer | **PASS** — R6-B e2e → 403 |
| A cannot read B’s commercial rules (as B’s seller_org_id) | **PASS** — 403 |
| A cannot see B’s seller-specific take rule in A’s list | **PASS** — `take_bps !== 999` filter |
| A ↛ B offers/settlements/lots (reads) | **PASS** — R6-A / isolation / inventory e2e |
| Client org id non-authoritative | **PASS** — membership + VENDOR kind server checks; tenant GUCs server-built |
| Location mutate steal e2e | **PARTIAL** — guards exist; dedicated POST steal e2e remains R6-F debt (not R6-B fail) |

---

## 3. RLS / security

| Check | Result |
|-------|--------|
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** — live DB `f` / `f` |
| ENABLE + FORCE on catalog/offers/prices/rules/orders/payables/lots/orgs | **PASS** |
| RLS tenancy + R3 isolation + vendor isolation | Included in API suite — **green** |
| Vendor cannot grant company roles / see company finance | **PASS** |

---

## 4. Catalog integrity

| Claim | Result |
|-------|--------|
| Item → Variant → Offer → PriceVersion chain | Single catalog kernel |
| Price replace creates new version | `PricingService.createVersion` — history not rewritten |
| Draft vs published | OfferStatus DRAFT/PUBLISHED; publish gated by membership |
| Unauthorized mutations denied server-side | R6-B e2e |

---

## 5. Commercial rule safety

| Claim | Result |
|-------|--------|
| Own seller rules visible | Yes |
| Marketplace/country defaults (null seller, MARKETPLACE/null channel) visible | Yes |
| Other seller private rules hidden | Yes |
| Company finance / admin dashboard via vendor token | Denied |
| Rules invent MoR/tax law | **No** — read configured rows only |

---

## 6. Rx / PHI regression

R6-B DTOs are catalog/commercial only. No diagnosis/clinical notes/Rx instructions/patient PHI added. R5-D/E remain in full suite (**green**). Opaque Rx order fields unchanged from prior audits.

---

## 7. Customer regression

`seller_display_name` + `{ data }` snake_case vendor list preserved. Customer/store/admin/vendor web builds green. Public browse unchanged except additive display field from R6-A.

---

## 8. MNC governance

Hierarchy preserved. Vendor remains organization-scoped beneath company control. BU membership still R15 deferred — **not** an R6-B/C kernel break.

---

## 9. UI audit (`web-vendor`)

| Area | Result |
|------|--------|
| Auth / 401 / 403 / session expired / network | Shell + ui-kit states |
| Catalog write + pricing panels | Live (R6-B) |
| Loading | Medicine-contextual labels |
| Responsive / a11y foundations | ui-kit |
| i18n | **PARTIAL** — architecture via shell-core; copy still English (same as R6-A) |
| Dev bypass | **None** |

---

## 10. Full regression (exact)

Executed this audit (**no retry-to-pass**):

| Check | Result |
|-------|--------|
| `nx test api` | **54** suites / **54**; **138** tests / **138**; exit **0** |
| Includes RLS, R3 isolation, R5-A…E, R6-A, R6-B | Green |
| Typecheck | **18 / 18** projects |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — all Successfully ran |
| Mobile | Typecheck in 18 — green; EAS builds not claimed |
| Migrations | **None** created; **0** pending on test DB |
| Code changes in this CR | **Docs only** |

---

## 11. Production boundaries (still OFF)

Live PSP · live DHL/carriers · vendor/affiliate payouts · production LiveKit · recording · automatic refill execution · live e-Rx — **OFF** (`live_payout: false` and prior gates unchanged).

---

## 12. R6-C readiness

| Question | Answer |
|----------|--------|
| Book 126 R6-C scope | **Inventory ops UX** (lots/expiry/movements/GRN/adjust/transfers on Vendor Web) |
| APIs already exist? | **Yes** — `/vendor/inventory/*` (locations, lots, GRN, adjustments, transfers) with VENDOR guards from R6-A |
| Current UI | Read-only lots panel — write UX is the R6-C gap |
| Engineering blockers? | **None** |
| Classification | **READY** |

Do **not** implement R6-C from this audit. Requires **CR-R6-C-AUTH/IMPL**.

Non-blocking later debt: inventory mutate steal e2e (R6-F), Rx-safe order presenter (R6-D), support/notifications (R6-E).

---

## 13. Legal / human separation

### Engineering blockers
**None** for R6-B green or R6-C start.

### Product decisions
| ID | Topic |
|----|-------|
| PD-R6C-01 | Which inventory mutations vendors may perform vs warehouse staff roles |
| PD-R6C-02 | Location create UX depth in R6-C vs read-only + API |

### Human governance
Authorize **CR-R6-C-*** before coding.

### Legal / compliance (OPEN — do not invent)
MoR · seller contracts · pharmacy-as-vendor · tax/refunds · payout KYC — unchanged OPEN where previously OPEN.

---

## Document control

| Action | Status |
|--------|--------|
| Create `docs/blueprint/131_POST_R6_B_AUDIT.md` | **This document** |
| Update master index / roadmap | Companion only |
| Production code / migrations | **NONE** |

---

## Final declaration

**FINAL STATUS: R6_B_GREEN_R6_C_READY**

**R6-C/D/E/F: NOT STARTED.**

**STOP.**
