# 51 — Phase 1A Catalog + Pricing implementation

**Status:** Implemented (26 August 2026)  
**Authorization:** Phase 0 human sign-off + Phase 1A only  
**Not authorized:** 1B inventory, cart, checkout, payment, order, DHL, settlement

Canonical: [50](50_PHASE_1_COMMERCE_BLUEPRINT.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

---

## Schema

Migration `20260826200000_catalog_pricing` (additive).

Tables: `catalog_brands`, `catalog_categories`, `catalog_category_i18n`, `catalog_items`, `catalog_item_i18n`, `catalog_assets`, `catalog_item_countries`, `catalog_variants`, `catalog_offers`, `price_versions`, `commercial_rules`, `catalog_search_documents`.

- UUID v7 application-assigned ids  
- Money: `BIGINT` minor units + `CHAR(3)` currency  
- `seller_org_id` on every offer  
- `ownership`: `PLATFORM_OWNED` | `VENDOR_OWNED` | `MARKETPLACE`  
- `price_versions` are append-only; `is_current` moves forward, amounts are not updated  
- RLS enabled (same app-role pattern as Phase 0); vendor isolation is enforced in the service layer  

Phase 0 tables were not altered.

---

## APIs

| Surface | Prefix | Auth |
| --- | --- | --- |
| Customer read | `/api/v1/catalog/*`, `POST /api/v1/pricing/quote` | Public |
| Vendor write | `/api/v1/vendor/catalog/*` | JWT + org membership |
| Admin write | `/api/v1/admin/catalog/*` | JWT + `catalog:admin` / `pricing:admin` |

Customer list/detail is empty when Country Policy Pack has `pharmacy` and `marketplace` both false (XX default).

---

## Pricing / rules

`PricingService.quote` uses the current `PriceVersion` plus the most specific matching `CommercialRule` (sku > item > category > seller > country). Take is `take_flat_minor + sell * take_bps / 10000` in integers. No hardcoded 10/15/20%. Quote is **not** settlement.

---

## Events

Outbox types: `PRODUCT_CREATED`, `PRODUCT_PUBLISHED`, `OFFER_CREATED`, `OFFER_UPDATED`, `PRICE_CHANGED`, `CATEGORY_CHANGED`. Same BullMQ dispatcher. Search documents are reindexed in-process after writes (Postgres projection; OpenSearch adapter can replace `CatalogSearchService` later).

---

## UI

- Customer: store home, `/c/[slug]`, `/p/[slug]`, `/search` — ui-kit tokens, no cart  
- Admin: `/catalog`  
- Vendor: `/vendor` (minimum catalog copy + APIs)  

---

## Tests / limitations

API catalog e2e: vendor isolation, draft hidden, integer quote. Search is ILIKE/contains on `catalog_search_documents`, not OpenSearch. Admin/vendor screens need a real OTP access token for writes; shell demo tokens cannot call write APIs. Assets are URL/key only (no binary in Postgres).

**LEGAL/COMPLIANCE REVIEW REQUIRED** before enabling `RX` / `CONTROLLED` sale in any country pack.
