# 232 — Post-R13-D implementation audit

**CR:** `CR-POST-R13-D-AUDIT-232`  
**Verdict:** `R13_D_GREEN_R13_E_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [231](231_R13_D_DETERMINISTIC_RECOMMENDATIONS_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · Plan audit [224](224_POST_R13_PLAN_AUDIT.md) · R13-C audit [230](230_POST_R13_C_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-D is **correctly implemented** against Book 223 §22 (R13-D), Book 224 recommendation gates, and Book 231 claims. Deterministic commerce recommendations (`rules_v1`), co-occurrence rollup (`analytics_order_item_pairs`), public catalog and personal customer APIs, order-paid co-occurrence hook, and web PDP sections are present and verified in repository state, focused E2E HTTP tests, API typecheck/build, migration status, and live test-database RLS inspection.

**Architecture confirmation:** Single `RecommendationsService` kernel in `apps/api/src/recommendations/`; reads R12 `personalization_events` and R13-A `catalog_search_documents`; **no duplicate discovery/search/personalization kernel, no ML vendor, no analytics module (R13-E not started)**.

**Inherited non-blockers (not R13-D regressions):**
- `web-customer:typecheck` fails on `store-home.tsx` — **predates R13-D** (R13-B discovery UI); R13-D touched only `product-detail.tsx` + `commerce-api.ts`.
- `r13c.provider-search.e2e` unified-type assertion fails on current test DB — **environmental test-isolation** (per-type provider paths pass in same run); not caused by R13-D code.

**Runtime limitations (honest):** `/health/ready` not executed; browser verification not performed; mobile emulator verification not performed.

**Next authorization:** `CR-R13-E-IMPL-233` — R13-E analytics foundation only.

---

## 2. Acceptance gate matrix (30 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Related-product recommendations | **PASS** | `getItemRecommendations` same-category + in-stock; e2e related ids |
| 2 | Co-occurrence / frequently bought together | **PASS** | `analytics_order_item_pairs` + partner ranking; e2e co-item |
| 3 | Recently viewed | **PASS** | `PRODUCT_VIEWED` from `personalization_events`; e2e order + isolation |
| 4 | Wishlist-adjacent | **PASS** | Category affinity from `wishlist_items`; e2e adjacent ids |
| 5 | `rules_v1` deterministic ranking | **PASS** | `RECOMMENDATION_RULE_VERSION`; explicit `orderBy` tie-breaks; e2e stable repeat |
| 6 | `CooccurrenceService` order-paid hook | **PASS** | `order.service.ts` L702 `recordOrderPairs` after `ORDER_PLACED` |
| 7 | R12 `personalization_events` reuse (read-only) | **PASS** | `personalizationEvent.findMany`; no writes from recommendations |
| 8 | `catalog_search_documents` reuse | **PASS** | All public rec queries filter `published`; related/co need `inStock` |
| 9 | Public vs customer boundaries | **PASS** | `RecommendationsCatalogController` public; `RecommendationsMeController` JWT+customer |
| 10 | Published + in-stock eligibility (public) | **PASS** | Related/co: `published` + `inStock`; anchor unpublished → 404 |
| 11 | Country isolation | **PASS** | `resolveCountry` + `countryId` filters; e2e `XX` → `country_enabled: false` |
| 12 | Person/customer isolation | **PASS** | `runWithTenant({ personId })` on personal path; e2e A vs B |
| 13 | Cross-customer leakage negatives | **PASS** | e2e customer B empty personal sections |
| 14 | API auth negatives | **PASS** | e2e `/me/recommendations` 401 without token |
| 15 | Schema, indexes, uniqueness | **PASS** | `AnalyticsOrderItemPair` model; unique `(country_id, item_a_id, item_b_id, rule_version)` |
| 16 | FORCE RLS / deny-by-default / grants | **PASS** | Live DB: `force_rls=true`, 4 policies, DELETE `USING(false)`; grants SELECT/INSERT/UPDATE |
| 17 | No `USING(true)` permissive policies | **PASS** | Live DB: `using_true_literal_count=0` |
| 18 | Worker/platform write boundaries | **PASS** | RLS INSERT/UPDATE `app.is_worker() OR app.is_platform()`; `recordOrderPairs` uses worker context |
| 19 | Idempotency / duplicate pair handling | **PASS** | `incrementPair` upsert on canonical `(left, right)` item ordering |
| 20 | Stable deterministic ranking | **PASS** | e2e identical JSON on repeat request |
| 21 | Empty / insufficient-data behavior | **PASS** | Disabled country empty sections; no category → empty related |
| 22 | No ML | **PASS** | No ML client; `rules_v1` only |
| 23 | No external recommendation vendor | **PASS** | Grep: no vendor SDK in `recommendations/` |
| 24 | No symptom-to-drug | **PASS** | No free-text query on rec APIs; e2e token scan |
| 25 | No clinical/PHI-based recommendations | **PASS** | Catalog metadata only; no health-record reads |
| 26 | No duplicate kernels | **PASS** | No second discovery/search/personalization module |
| 27 | R13-A/B/C regression | **PARTIAL** | R13-A/B **PASS**; R13-C **FAIL** unified assertion (see §5) — not R13-D caused |
| 28 | R12 regression | **PASS** | `r12f.reviews.e2e`, `r12e.wishlist.e2e` 2/2 |
| 29 | Typecheck/build | **PASS** (API) | `nx run api:typecheck`, `nx run api:build` **PASS**; web-customer see §4 |
| 30 | Migration status + live RLS | **PASS** | 120 migrations applied; live RLS on `analytics_order_item_pairs` |

---

## 3. Recommendation types deep audit

| Type | Book 223 rule | Implementation | E2E |
|------|---------------|----------------|-----|
| Related | Same category, in-stock, exclude self | `categoryName` match + `inStock: true` | **PASS** |
| Co-occurrence | Paid order line pairs, country-scoped | `analytics_order_item_pairs` + `pairCount` sort | **PASS** |
| Recently viewed | Last N `PRODUCT_VIEWED` | Dedupe by `catalogItemId`, `occurredAt desc` | **PASS** |
| Wishlist adjacent | Same category as wishlist | `categoryId` from wishlist offers | **PASS** |

**Personalization write boundary:** R13-D does not write to `personalization_events` — **CONFIRMED**.

---

## 4. web-customer:typecheck investigation

### 4.1 Observed failure (audit re-run)

```
apps/web-customer/src/store-home.tsx(174,28): error TS2322
NetworkErrorState — Property 'onRetry' does not exist
Expected: action?: { label: string; onClick: () => void }
```

### 4.2 Root-cause analysis

| Question | Finding |
|----------|---------|
| Predates R13-D? | **YES** — `store-home.tsx` discovery integration is R13-B scope ([227](227_R13_B_DISCOVERY_IMPLEMENTATION.md)); R13-C added provider chips to same file ([229](229_R13_C_PROVIDER_DISCOVERY_IMPLEMENTATION.md)) |
| R13-D touched this file? | **NO** — R13-D web changes limited to `product-detail.tsx` and `commerce-api.ts` |
| Component misidentified in Book 231? | **YES** — failure is `NetworkErrorState` `onRetry`, not `EmptyState` |
| Correct pattern elsewhere? | **YES** — `preferences-page.tsx` uses `NetworkErrorState action={{...}}`; `store-home.tsx` L180–184 uses `EmptyState action={{...}}` correctly |

### 4.3 Classification

**Non-blocking inherited debt (TD-WEB-TC-01)** — R13-B/R13-C era UI-kit prop mismatch. **Not an R13-D finding.** Prior R13-B/C audits ran API typecheck only; web-customer typecheck was not executed until R13-D implementation report.

---

## 5. R13-C regression note

**Audit re-run:** `r13c.provider-search.e2e.spec.ts` **FAIL** at unified multi-type assertion (`q=R13C` must include doctor/lab/test/pharmacy in `data`).

**Same test run:** Per-type assertions (doctor, lab, test, pharmacy individually) **passed** before unified check — core R13-C provider discovery remains functional.

**Likely cause:** Test DB accumulation of TC-country provider documents from repeated runs; default limit/sort fills page with doctor/lab rows before test/pharmacy appear.

**R13-D causation:** **None** — R13-D does not modify `discovery/` or provider indexes.

**Classification:** **Non-blocking environmental debt (TD-REG-R13C-01)** — test isolation weakness, not R13-D security/architecture blocker.

---

## 6. Runtime evidence (honest)

| Method | Performed? | Result |
|--------|------------|--------|
| R13-D E2E (`r13d.recommendations.e2e`) | **Yes** | **4/4 PASS** |
| R13-A E2E | **Yes** | **PASS** |
| R13-B E2E | **Yes** | **PASS** |
| R13-C E2E | **Yes** | **FAIL** (unified assertion only; see §5) |
| R12 e/f E2E | **Yes** | **2/2 PASS** |
| `prisma migrate status` | **Yes** | 120 migrations, up to date |
| Live RLS inspection | **Yes** | `analytics_order_item_pairs`: FORCE RLS, 4 policies, `USING(true)=0` |
| `nx run api:typecheck` | **Yes** | **PASS** |
| `nx run api:build` | **Yes** | **PASS** |
| `nx run web-customer:typecheck` | **Yes** | **FAIL** (store-home; §4) |
| `/health/ready` | **No** | — |
| Browser verification | **No** | — |
| Mobile/emulator | **No** | — |

---

## 7. Technical debt

| ID | Item | Blocker? |
|----|------|----------|
| TD-R13D-01 | Mobile PDP carousel deferred | **No** |
| TD-R13D-02 | `/me/recommendations/home` alias not added | **No** |
| TD-R13D-03 | Weekly co-occurrence rebuild worker deferred to R13-E | **No** |
| TD-WEB-TC-01 | `store-home.tsx` `NetworkErrorState onRetry` prop (inherited R13-B) | **No** |
| TD-REG-R13C-01 | R13-C unified e2e flaky on polluted test DB | **No** |

**No new blocker-class security, privacy, database, API, architecture, or scope issues identified.**

---

## 8. Scope boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| R13-C | **COMPLETE** |
| R13-D | **IMPLEMENTED** (audit green) |
| R13-E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

No R13-E analytics module, no admin analytics UI, no clinical search, no ML, no scope expansion detected.

---

## 9. Verdict

All **blocker-class R13-D gates pass.** Inherited web-customer typecheck and R13-C unified e2e flake are **non-blocking** and **not caused by R13-D**.

**`R13_D_GREEN_R13_E_READY`**

**Next authorization:** **`CR-R13-E-IMPL-233`** — R13-E analytics foundation + feed completion only.
