# 228 — Post-R13-B implementation audit

**CR:** `CR-POST-R13-B-AUDIT-228`  
**Verdict:** `R13_B_GREEN_R13_C_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [227](227_R13_B_DISCOVERY_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · Plan audit [224](224_POST_R13_PLAN_AUDIT.md) · R13-A [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md) · Post-R13-A [226](226_POST_R13_A_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-B is **correctly implemented** against Book 223 §22 (R13-B), Book 224 plan audit gates, and Book 227 claims. The unified customer discovery API (`GET /api/v1/discovery/search`, `GET /api/v1/discovery/suggest`), commerce index reuse via `CatalogSearchService`, CMS help reuse via `CmsSearchService` (worker tenant context), policy-driven blocklist and `discovery_enabled` flag, and web/mobile client alignment (PD-R13-01) are present and verified in repository state and E2E HTTP tests.

**PD-R13-01 resolution (Book 224 / 227):** Confirmed closed for **search**. Web browse continues `/catalog/items`; mobile browse continues catalog browse; **all query-based search** routes through `/discovery/search` (web `fetchDiscoverySearch`, mobile `searchDiscovery`; legacy `searchCatalog()` delegates to discovery commerce slice). Mobile no longer calls raw `/catalog/search` as its primary search path.

**TD-R13A-03 resolution:** Confirmed. `r13a.search-indexing.e2e` resets `XX` policy pack before country-isolation assertion — deterministic in combined 35-suite run.

**No R13-C+ scope** (provider indexes, recommendations, analytics, clinical search, external vendor) was found in `apps/api/src/discovery/` or new migrations.

**Runtime limitations (honest):** `/health/ready` not executed (API server not running); browser verification not performed; mobile emulator verification not performed. Live test DB (`worldpharma_test` @ `127.0.0.1:55432`) used for migrations and RLS policy inspection.

**Next authorization:** `CR-R13-C-IMPL-229` — R13-C provider discovery only.

---

## 2. Acceptance gate matrix (26 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `GET /api/v1/discovery/search` | **PASS** | `discovery-customer.controller.ts` L39–56; `r13b.discovery.e2e` unified/commerce/help assertions |
| 2 | `GET /api/v1/discovery/suggest` | **PASS** | `discovery-customer.controller.ts` L58–72; e2e short-query empty + suggest results ≤10 |
| 3 | Unified commerce + CMS search behavior | **PASS** | `DiscoverySearchService.search()` merges commerce + help; e2e `types=commerce&types=help` returns both discriminators |
| 4 | R13-A `catalog_search_documents` index reuse | **PASS** | `discovery-search.service.ts` L152 → `CatalogSearchService.search()`; no new commerce index table |
| 5 | Existing `CmsSearchService` reuse | **PASS** | `discovery-search.service.ts` L176–178 → `cmsSearch.search()` in `workerTenantContext` |
| 6 | No duplicate search/index/worker kernel | **PASS** | `discovery.module.ts` imports only Catalog/Cms/Policy; no `EventHandlerRegistry`, BullMQ, or `SearchIndex*` providers |
| 7 | Web customer search integration | **PASS** | `store-home.tsx` L60 `fetchDiscoverySearch`; `discovery-api.ts`; `store-home.spec.tsx` mocks discovery |
| 8 | Mobile customer search integration | **PASS** | `app-root.tsx` L213 `searchDiscovery`; `commerce-api.ts` `searchCatalog` → `searchDiscovery` commerce-only |
| 9 | PD-R13-01 resolution + canonical search alignment | **PASS** | See §3 |
| 10 | Browse-vs-search behavior | **PASS** | Web/mobile browse: `fetchCatalog` → `/catalog/items`; search: discovery API only when `q` non-empty (`store-home.tsx` L50–55) |
| 11 | Country isolation | **PASS** | `DiscoverySearchService` uses `catalog.resolveCountry` + `storefrontFlags`; e2e `country=XX` → `country_enabled: false`, empty `data` |
| 12 | Locale validation/scoping | **PASS** | `resolveLocale()` validates against pack `i18n.locales`, falls back to `default_locale`; passed to both index kernels |
| 13 | Published-only CMS content | **PASS** | `CmsSearchService.search()` `published: true` (L79); discovery maps public fields only (no `body`) |
| 14 | Query validation and maximum query length | **PASS** | `DISCOVERY_MAX_QUERY_LEN=200`; Zod + service validation; e2e 201-char → 400 |
| 15 | Suggest minimum query length and result limits | **PASS** | `SUGGEST_MIN_QUERY_LEN=2`, `SUGGEST_MAX_LIMIT=10`; e2e `q=z` empty, `q=R1` returns results ≤10 |
| 16 | Search blocklist policy behavior | **PASS** | `PolicyResolver.isQueryBlocked()`; e2e blocklist term `symptom` → 403 |
| 17 | Empty results and safe error handling | **PASS** | Empty query → empty `data`; disabled discovery → `discovery_enabled: false`; invalid country → 400; web handles network/validation/forbidden states |
| 18 | Unauthorized/forbidden behavior | **PASS** | Customer discovery is **public by design** (Book 223 §8); blocklist → 403; validation → 400; no auth required for search read |
| 19 | Cross-country/cross-tenant isolation | **PASS** | Country resolved server-side from `country` param against DB; `XX` disabled pack cannot see `TQ` indexed content; index queries scoped by `countryId` |
| 20 | PHI/clinical-token/internal CMS metadata protection | **PASS** | `assertNoSensitivePayload` in e2e; discovery response fields exclude `body`, internal notes, clinical tokens; CMS select omits body in API mapping |
| 21 | R13-A indexing regression | **PASS** | `r13a.search-indexing.e2e` 1/1 PASS in combined run |
| 22 | R12-A–G regression preservation | **PASS** | 32/32 PASS |
| 23 | TD-R13A-03 test-order dependency resolution | **PASS** | `r13a.search-indexing.e2e` L311–317 `XX` policy reset before assertion |
| 24 | Typecheck/build | **PASS** | `nx run api:typecheck`, `nx run api:build` |
| 25 | Migration status / schema status | **PASS** | **114 migrations**, 0 pending; **no R13-B migrations** (discovery is API-only) |
| 26 | Runtime evidence | **PASS (E2E only)** | See §5 — 35/35 E2E; live DB RLS inspected; health/browser/mobile **not** performed |

---

## 3. PD-R13-01 deep audit

Book 224 flagged mobile using `/catalog/search` while web used browse-only. R13-B closes the **search** divergence.

| Client | Browse (no query) | Search (with query) | Audit |
|--------|-------------------|---------------------|-------|
| Web `store-home` | `fetchCatalog` → `/catalog/items` | `fetchDiscoverySearch` → `/discovery/search` | **CONFIRMED** |
| Web `searchCatalog()` (deprecated) | — | Delegates to `/discovery/search?types=commerce` | **CONFIRMED** |
| Mobile home | `fetchCatalog` | — | **CONFIRMED** |
| Mobile search screen | — | `searchDiscovery(COUNTRY, q, 'en', ['commerce', 'help'])` | **CONFIRMED** |
| Mobile `searchCatalog()` | — | Wraps `searchDiscovery` commerce-only | **CONFIRMED** |

**Legacy `/catalog/search`:** Retained as commerce-only alias with `locale` param; e2e confirms 200 + `country_enabled`. Not used as mobile primary search path.

**Residual (non-blocker TD-R13B-01):** Empty-query browse remains dual-path (`/catalog/items` vs discovery empty response). By design per Book 223 §5.7 / R13-B scope.

**PD-R13-01 status:** **CLOSED** for search canonicalization.

---

## 4. Security verification

| Control | Status | Evidence |
|---------|--------|----------|
| No `USING(true)` introduced | **PASS** | No R13-B migrations; live DB policy inspection on `catalog_search_documents`, `cms_content_search_documents`, `search_index_jobs` — no permissive `qual = true` policies (substring `true` matches are `published = true` predicates only) |
| Existing RLS boundaries intact | **PASS** | 12 policies unchanged from R13-A; SELECT requires `published=true` + country for user paths; worker/platform bypass for indexing |
| Country cannot be forged by client | **PASS** | `country` param resolves to DB `Country` record; storefront flags and policy pack loaded from resolved country — not from client-supplied tenant context |
| Locale cannot be forged beyond pack | **PASS** | `resolveLocale()` clamps to pack locales or default; invalid locale falls back — does not cross into unauthorized locale index rows |
| Unpublished CMS cannot become public | **PASS** | `CmsSearchService` filters `published: true`; unpublish sets `published: false` on index row |
| Internal CMS metadata not exposed | **PASS** | Discovery maps `title`, `slug`, `content_type`, `category_slug`, `href` only — not `body`, review state, or admin fields |
| Clinical/PHI data not searchable | **PASS** | No clinical index in discovery union; e2e token scan negative |
| No symptom-to-drug search | **PASS** | No symptom engine; blocklist can reject symptom terms as policy control — not a treatment recommender |
| No ML/recommendation behavior | **PASS** | No recommendation module, scoring model, or personalization rank in discovery service |
| No external search vendor | **PASS** | Grep: no elasticsearch/opensearch/algolia/typesense/meilisearch in `apps/api/src/discovery/` |

### 4.1 Live RLS policy snapshot (test DB)

Policies on search-related tables (30 Aug 2026):

| Table | SELECT rule (summary) |
|-------|----------------------|
| `catalog_search_documents` | worker/platform OR (`published=true` AND auth) OR (`published=true` AND user AND `can_country`) |
| `cms_content_search_documents` | (`published=true` AND `can_country`) OR worker OR platform |
| `search_index_jobs` | worker OR platform OR `can_country(country_id)` |

DELETE denied on all three (`USING(false)` / `qual: false`).

---

## 5. Runtime evidence (honest)

### 5.1 E2E HTTP tests (performed)

**Command (audit re-run 30 Aug 2026):**

```
npx jest --config apps/api/jest.config.cts \
  --testPathPatterns="r13b.discovery|r13a.search-indexing|catalog.e2e|r12a.crm-kernel|r12b.marketing|r12c.promo|r12d.affiliate|r12e.wishlist|r12f.reviews|r12g.refill-hooks" \
  --runInBand --no-cache --forceExit
```

| Suite | Tests | Result |
|-------|-------|--------|
| `r13b.discovery.e2e` | 1 | **PASS** |
| `r13a.search-indexing.e2e` | 1 | **PASS** |
| `catalog.e2e` | 1 | **PASS** |
| R12 (`r12a`–`r12g`) | 32 | **32/32 PASS** |
| **Gate total** | **35** | **35/35 PASS** |

**r13b controls exercised:** unified commerce+help search; type filters; brand facet; pagination cursor; suggest min length; max query 400; invalid country 400; blocklist 403; `discovery_enabled: false`; PHI token scan; `/catalog/search` alias; `XX` country isolation.

### 5.2 Live Docker/database checks (performed)

| Check | Result |
|-------|--------|
| DB reachable | **PASS** — `worldpharma_test` @ `127.0.0.1:55432` |
| Migrations | **PASS** — 114 applied, schema up to date |
| RLS policies on search tables | **PASS** — inspected via Prisma `$queryRaw`; matches R13-A migrations |
| No new R13-B schema | **PASS** — migration count unchanged |

### 5.3 `/health/ready` (not performed)

API server was not started during this audit. **Not claimed as verified.**

### 5.4 Browser verification (not performed)

No manual web-customer browser testing. **Not claimed as verified.** Unit test `store-home.spec.tsx` mocks discovery API only.

### 5.5 Mobile/emulator verification (not performed)

No device or emulator run. **Not claimed as verified.** Mobile alignment verified by source inspection + API E2E.

---

## 6. Build / typecheck

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 7. Scope boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| **R13-B** | **IMPLEMENTED** (audit green) |
| R13-C/D/E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

**R13-C readiness:** Plan [223](223_R13_IMPLEMENTATION_PLAN.md) §22 R13-C prerequisites (R13-B unified discovery API) are satisfied. Provider indexes remain unimplemented — correct for R13-C scope.

---

## 8. Book 227 vs repository discrepancies

| Claim | Audit |
|-------|-------|
| 35/35 PASS | **CONFIRMED** — audit re-run |
| No new migrations | **CONFIRMED** — 114 total |
| TD-R13A-03 resolved | **CONFIRMED** |
| PD-R13-01 closed for search | **CONFIRMED** |
| `/health/ready`, browser, mobile emulator | **CONFIRMED not performed** (honest in Book 227 §8) |

**No material discrepancies identified.**

---

## 9. Technical debt

| ID | Item | Class | Blocker? |
|----|------|-------|----------|
| **TD-R13A-03** | r13a XX assertion order-dependent | **RESOLVED** in CR-R13-B-IMPL-227 | **NO** |
| **TD-R13B-01** | Browse (`/catalog/items`) vs discovery empty-query dual path | UX consistency | **NO** |
| **TD-R13B-02** | Ranking: in-stock + title sort; full facet index fields deferred | Enhancement | **NO** |
| **PD-R13-01** | Mobile vs web search path | **CLOSED** for search | **NO** |

**No blocker-class debt identified.**

---

## 10. Verdict and next authorization

**`R13_B_GREEN_R13_C_READY`**

R13-B implementation is sound. Unified discovery API reuses R13-A and existing CMS search kernels without duplicating workers. Country/locale isolation, published-only filtering, blocklist policy, query limits, and PHI protection are verified. Web and mobile clients align on canonical discovery for search. R13-A and R12 regressions remain green. TD-R13A-03 is resolved.

**Next authorization:** **`CR-R13-C-IMPL-229`** — R13-C provider discovery only. **Do not implement R13-D+ without further authorization.**
