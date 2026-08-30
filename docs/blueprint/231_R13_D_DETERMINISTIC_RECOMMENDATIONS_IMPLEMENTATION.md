# R13-D Deterministic commerce recommendations

**CR:** `CR-R13-D-IMPL-231`  
**Verdict:** `R13_D_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-D-AUDIT-232`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [230](230_POST_R13_C_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-D delivers **deterministic, commerce-only recommendations** (related products, recently viewed, co-occurrence, wishlist-adjacent). Consumes R12 `personalization_events` read-only, reuses `CatalogSearchService` / catalog search documents, and extends order-paid flow for co-occurrence rollup. **No ML, no clinical/symptom rules, no external vendor, no duplicate search kernel.**

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `analytics_order_item_pairs` rollup table | **DONE** |
| `CooccurrenceService` — incremental on order paid + country rebuild | **DONE** |
| `RecommendationsService` — rules_v1 deterministic ranking | **DONE** |
| `GET /api/v1/catalog/items/:itemId/recommendations` | **DONE** |
| `GET /api/v1/me/recommendations` | **DONE** |
| Web PDP related + frequently-bought-together sections | **DONE** |
| `r13d.recommendations.e2e` | **DONE** (4/4) |
| R13-A/B/C + R12 e/f regression | **DONE** (9/9 targeted suites) |

**Not started:** R13-E+ analytics, R13-F admin shell, R13-G clinical search, R13-H closure, mobile PDP carousel (TD-R13D-01).

---

## 2. Architecture

```
GET /catalog/items/:id/recommendations     (public, country-scoped)
GET /me/recommendations                    (customer JWT, person-scoped)
        │
        ▼
RecommendationsService (rules_v1 — single kernel)
   ├── CatalogSearchDocument queries (R13-A index, published + in-stock)
   ├── personalization_events read (R12-F, person-isolated)
   ├── wishlist_items read (R12-E, person-isolated)
   └── analytics_order_item_pairs (co-occurrence rollup)

Order paid → CooccurrenceService.recordOrderPairs (incremental)
```

**Recommendation types (deterministic):**

| Type | Rule | Tie-break |
|------|------|-----------|
| Related | Same `categoryName`, published, in-stock, exclude self | `inStock desc`, `title asc`, `id asc` |
| Frequently bought together | Co-occurrence pairs for anchor SKU | `pairCount desc`, `itemAId asc`, `itemBId asc` |
| Recently viewed | Last N `PRODUCT_VIEWED` per person | `occurredAt desc`, `id asc`; dedupe by item |
| Wishlist adjacent | Same category as wishlist items, exclude wishlist SKUs | `categoryName asc`, `title asc`, `id asc` |

**Rule version:** `rules_v1` (explicit in API responses).

---

## 3. Migrations (120 total)

| Migration | Purpose |
|-----------|---------|
| `20260829280000_r13d_recommendations_schema` | `analytics_order_item_pairs` |
| `20260829280100_r13d_recommendations_rls` | FORCE RLS, worker/platform writes, country-scoped SELECT |
| `20260829280200_r13d_recommendations_grants` | `worldpharma_app` SELECT/INSERT/UPDATE |

**No `USING(true)`** policies introduced.

---

## 4. API

### Public catalog recommendations

`GET /api/v1/catalog/items/:itemId/recommendations?country=XX&locale=en&limit=12`

Returns `sections.related` and `sections.frequently_bought_together`. Unpublished anchor item → **404**. Disabled country → empty sections, `country_enabled: false`.

### Personal recommendations

`GET /api/v1/me/recommendations?country_code=XX&locale=en&limit=12`

Requires customer JWT. Returns `sections.recently_viewed` and `sections.wishlist_adjacent`. Person-isolated via `runWithTenant` + RLS.

---

## 5. Security boundaries

| Control | Implementation |
|---------|----------------|
| Country scope | Server resolves country; catalog docs filtered by `countryId` |
| Published/eligible only | `catalog_search_documents.published = true`; related requires `inStock` |
| Person isolation | Personal endpoints use `workerTenantContext({ countryId, personId })` |
| No PHI/clinical payloads | Public metadata only; e2e token scan |
| No symptom-to-drug | No free-text query surface on recommendation APIs |
| No ML / external vendor | Rules-only `rules_v1` |
| Co-occurrence writes | Worker context on order paid; RLS restricts INSERT/UPDATE to worker/platform |

---

## 6. Technical debt (non-blockers)

| ID | Item |
|----|------|
| TD-R13D-01 | Mobile PDP recommendations carousel deferred (Book 223 §10.3 optional) |
| TD-R13D-02 | `GET /me/recommendations/home` alias not added — canonical path is `/me/recommendations` per Book 223 §9.1 |
| TD-R13D-03 | Weekly `CooccurrenceRebuildWorker` cron deferred to R13-E worker bundle; incremental order hook ships in R13-D |

---

## 7. Tests and build

| Check | Result |
|-------|--------|
| `r13d.recommendations.e2e` | **4/4 PASS** |
| R13-A/B/C + R12 e/f targeted regression | **9/9 PASS** |
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `prisma migrate status` | **120 migrations, up to date** |
| `web-customer:typecheck` | **FAIL** — pre-existing `store-home.tsx` EmptyState `onRetry` prop (unrelated to R13-D) |

---

## 8. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| R13-C | **COMPLETE** |
| R13-D | **IMPLEMENTED** |
| R13-E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

**Next:** `CR-POST-R13-D-AUDIT-232` — post-R13-D audit only.
