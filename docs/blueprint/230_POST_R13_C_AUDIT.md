# 230 — Post-R13-C implementation audit

**CR:** `CR-POST-R13-C-AUDIT-230`  
**Verdict:** `R13_C_GREEN_R13_D_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [229](229_R13_C_PROVIDER_DISCOVERY_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · Plan audit [224](224_POST_R13_PLAN_AUDIT.md) · R13-B audit [228](228_POST_R13_B_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-C is **correctly implemented** against Book 223 §22 (R13-C), Book 224 plan audit gates, and Book 229 claims. Four provider index tables (`provider_*_search_documents`), `ProviderSearchService` with worker-context reindex, extended `DiscoverySearchService` (single kernel — not duplicated), unified discovery API type extensions (`doctor|lab|test|pharmacy`), admin provider reindex, outbox dispatch hooks, and web/mobile provider discovery UI are present and verified in repository state, E2E HTTP tests, and live test-database RLS inspection.

**Architecture confirmation:** R13-A `SearchIndexJobService` + outbox dispatch extended with `PROVIDER_*` kinds; R13-B `DiscoverySearchService` extended via `ProviderSearchService` import — **no second discovery kernel, no duplicate worker module, no external search vendor**.

**R13-B backward compatibility:** Default discovery types remain `commerce` + `help`; `country_enabled` for commerce/help-only requests preserves storefront-flag semantics (r13b `XX` isolation regression **PASS** after R13-C `isCountryEnabled` fix).

**Runtime limitations (honest):** `/health/ready` not executed; browser verification not performed; mobile emulator verification not performed. Live test DB (`worldpharma_test` @ `127.0.0.1:55432`) used for migrations and RLS.

**Next authorization:** `CR-R13-D-IMPL-231` — R13-D deterministic commerce recommendations only.

---

## 2. Acceptance gate matrix (26 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Doctor/provider discovery | **PASS** | `ProviderSearchService.searchDoctors()`; `discovery-search.service.ts` `doctorResults()`; e2e `types=doctor` + profile id match |
| 2 | Lab discovery | **PASS** | `searchLabs()`; e2e `types=lab` + org id match |
| 3 | Test discovery | **PASS** | `searchTests()`; e2e `types=test` + slug + `lab_org_id` filter |
| 4 | Pharmacy discovery | **PASS** | `searchPharmacies()`; e2e `types=pharmacy` + location id + `city` filter |
| 5 | `/discovery/search` and `/discovery/suggest` provider extensions | **PASS** | `discovery-query.ts` types; `discovery-customer.controller.ts` filters; default types unchanged |
| 6 | Filters, country/locale, publication rules | **PASS** | `specialty`, `city`, `lab_org_id`, `category`; `resolveLocale()`; publication gates in `provider-search.service.ts` reindex paths |
| 7 | Web and mobile provider discovery behavior | **PASS** | `store-home.tsx` chips + sections; `app-root.tsx` + `commerce-api.ts` extended types |
| 8 | R13-A indexing kernel reuse | **PASS** | `SearchIndexJobService` extended; `SearchIndexKind` enum; worker-context writes |
| 9 | R13-B DiscoverySearchService reuse | **PASS** | Single `DiscoverySearchService`; imports `ProviderSearchService` from SearchModule |
| 10 | Outbox/indexing/reindex behavior | **PASS** | `DOCTOR_PROFILE_UPDATED` dispatch; `LAB_TEST` catalog invalidate → `PROVIDER_TEST`; admin reindex kinds |
| 11 | Provider schema, indexes, migrations | **PASS** | 4 models in `schema.prisma`; migrations `270000`–`270200`; unique keys per entity/country/locale |
| 12 | FORCE RLS / deny-by-default / grants | **PASS** | Live DB: `relforcerowsecurity=true` all 4 tables; 4 policies each; `USING_true_literal_count=0` |
| 13 | Cross-country / cross-tenant isolation | **PASS** | e2e `country=XX` → `country_enabled: false`; index queries scoped by `countryId` |
| 14 | Auth/RBAC/admin reindex | **PASS** | e2e 401 unauthenticated; 401/403 customer; `search:admin` on admin controller |
| 15 | Public metadata-only boundary | **PASS** | Discovery maps title/subtitle/slug/href only; no credential images, KYC, license numbers in API |
| 16 | PHI/clinical token leakage | **PASS** | `assertNoSensitivePayload` in r13c e2e; search selects exclude clinical fields |
| 17 | No symptom-to-drug / clinical search | **PASS** | No clinical search module; blocklist rejects symptom terms (policy control, not treatment engine) |
| 18 | No ML/recommendation engine | **PASS** | No `recommendations/` module; no ML client in discovery/search |
| 19 | No external search vendor | **PASS** | Grep: no elasticsearch/opensearch/algolia in discovery/search |
| 20 | No duplicate search/discovery kernel | **PASS** | `discovery.module.ts` has no EventHandler/BullMQ; one `DiscoverySearchService` |
| 21 | Error, empty, forbidden, limits | **PASS** | Inherited R13-B blocklist/validation; e2e 400 oversized query; limit≤1; empty `XX` |
| 22 | Idempotency/concurrency (mutations) | **PASS** | `SearchIndexJobService.scheduleJob` idempotency keys; provider upsert with `version` increment |
| 23 | Focused R13-C E2E | **PASS** | `r13c.provider-search.e2e` 1/1 |
| 24 | R13-A/B + R12 regression | **PASS** | 36/36 combined run |
| 25 | Typecheck/build | **PASS** | `nx run api:typecheck`, `nx run api:build` |
| 26 | Migration status + live RLS | **PASS** | 117 applied; live policy inspection performed |

---

## 3. Provider discovery deep audit

### 3.1 Index tables (Book 223 §5.2 / §8.1)

| Table | Source kernel | Audit |
|-------|---------------|-------|
| `provider_doctor_search_documents` | `DoctorProfile` + partner status | **CONFIRMED** |
| `provider_lab_search_documents` | LAB org + capability | **CONFIRMED** |
| `provider_test_search_documents` | LAB_TEST catalog + offer | **CONFIRMED** |
| `provider_pharmacy_search_documents` | PHARMACY_OWNED location | **CONFIRMED** |

### 3.2 Publication rules (code-verified)

| Type | Published when | Audit |
|------|----------------|-------|
| Doctor | ACTIVE DOCTOR partner + appointments + doctor_public_visibility | **CONFIRMED** — `reindexDoctorInWorkerContext` |
| Lab | LAB ACTIVE + lab services pack + capability ELIGIBLE | **CONFIRMED** |
| Test | LAB_TEST published + LAB_OWNED offer + eligible lab | **CONFIRMED** |
| Pharmacy | STORE/COLLECTION_POINT active + PHARMACY_OWNED + pharmacy service | **CONFIRMED** |

### 3.3 Discovery API union

Extended `types[]` without new routes — matches Book 223 OD-R13-03 unified discovery pattern. Default `commerce` + `help` preserved for R13-B clients.

### 3.4 Indexing pipeline

| Trigger | Mechanism | Audit |
|---------|-----------|-------|
| Doctor profile update | `DOCTOR_PROFILE_UPDATED` outbox → `PROVIDER_DOCTOR` job | **CONFIRMED** |
| Catalog LAB_TEST invalidate | `SEARCH_INDEX_INVALIDATE` → catalog + `PROVIDER_TEST` job | **CONFIRMED** |
| Admin/backfill | `POST /admin/search/reindex` provider kinds | **CONFIRMED** e2e |

**Deferred (non-blocker TD-R13C-02):** Slot capacity hint scheduled worker per Book 223 §5.4 — not in R13-C scope.

---

## 4. Security verification

| Control | Status | Evidence |
|---------|--------|----------|
| No `USING(true)` introduced | **PASS** | Live DB `USING_true_literal_count=0` on provider tables |
| FORCE RLS | **PASS** | All 4 tables `relforcerowsecurity=true` |
| Deny-by-default SELECT | **PASS** | `published=true` + auth/user country predicates |
| DELETE denied | **PASS** | `no_delete` policies `qual=false` |
| Worker-context indexing writes | **PASS** | `runWithTenant(workerTenantContext({ countryId }))` on all reindex methods |
| Country cannot be forged | **PASS** | `catalog.resolveCountry()` server-side |
| Locale clamped to pack | **PASS** | `resolveLocale()` unchanged from R13-B |
| Unpublished providers hidden | **PASS** | `published: true` filter in all search methods + RLS SELECT |
| Internal metadata not exposed | **PASS** | API maps public fields; no `body` in discovery response for providers |
| No PHI/clinical in index/API | **PASS** | e2e token scan negative |
| No symptom-to-drug search | **PASS** | No synonym/treatment maps |
| No ML/recommendations | **PASS** | R13-D not started |
| No external vendor | **PASS** | Postgres ILIKE only |
| Admin reindex RBAC | **PASS** | `search:admin` + admin audience; e2e 401/403 negatives |

### 4.1 Live RLS policy snapshot (test DB, 30 Aug 2026)

All four `provider_*_search_documents` tables share identical policy structure:

| Policy | Rule |
|--------|------|
| SELECT | worker/platform OR (`published=true` AND auth) OR (`published=true` AND user AND `can_country`) |
| INSERT | platform OR worker OR user/worker actor |
| UPDATE | platform OR worker OR user |
| DELETE | `false` |

---

## 5. Runtime evidence (honest)

### 5.1 E2E HTTP tests (performed)

**Command (audit re-run 30 Aug 2026):**

```
npx jest --config apps/api/jest.config.cts \
  --testPathPatterns="r13c.provider-search|r13b.discovery|r13a.search-indexing|catalog.e2e|r12a.crm-kernel|r12b.marketing|r12c.promo|r12d.affiliate|r12e.wishlist|r12f.reviews|r12g.refill-hooks" \
  --runInBand --no-cache --forceExit
```

| Suite | Tests | Result |
|-------|-------|--------|
| `r13c.provider-search.e2e` | 1 | **PASS** |
| `r13b.discovery.e2e` | 1 | **PASS** |
| `r13a.search-indexing.e2e` | 1 | **PASS** |
| `catalog.e2e` | 1 | **PASS** |
| R12 (`r12a`–`r12g`) | 32 | **32/32 PASS** |
| **Gate total** | **36** | **36/36 PASS** |

**r13c controls exercised:** doctor/lab/test/pharmacy type filters; unified union; `lab_org_id` + `city` facets; `XX` country isolation; admin reindex 401/403; PHI token scan; pagination limit; oversized query 400; suggest ≤10.

### 5.2 Live Docker/database verification (performed)

| Check | Result |
|-------|--------|
| DB reachable | **PASS** — `worldpharma_test` @ `127.0.0.1:55432` |
| Migrations | **PASS** — **117 applied**, schema up to date |
| FORCE RLS on provider tables | **PASS** — all 4 tables |
| Policy text matches migrations | **PASS** |
| `USING(true)` literal on provider tables | **PASS** — 0 rows |

### 5.3 `/health/ready` (not performed)

API server was not started during this audit. **Not claimed as verified.**

### 5.4 Browser verification (not performed)

No manual web-customer browser testing. **Not claimed as verified.** Unit test `store-home.spec.tsx` mocks discovery only (unchanged from R13-B).

### 5.5 Mobile/emulator verification (not performed)

No device or emulator run. **Not claimed as verified.** Mobile alignment verified by source inspection + API E2E.

---

## 6. Build / typecheck

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 7. Technical debt

| ID | Item | Class | Blocker? |
|----|------|-------|----------|
| **TD-R13C-01** | Doctor href is `/doctors` directory, not per-profile deep link | UX | **NO** |
| **TD-R13C-02** | Slot capacity hint indexing deferred (Book 223 §5.4 low-frequency worker) | Enhancement | **NO** |
| **TD-R13C-03** | Pharmacy href is `/search` — no dedicated store-locator page | UX | **NO** |
| TD-R13B-01 | Browse vs discovery dual path for empty query | UX (R13-B) | **NO** |
| TD-R13B-02 | Basic ranking; advanced facets deferred | Enhancement | **NO** |

**No newly introduced blocker-class debt identified.**

---

## 8. Book 229 vs repository discrepancies

| Claim | Audit |
|-------|-------|
| 36/36 PASS | **CONFIRMED** — audit re-run |
| 117 migrations | **CONFIRMED** |
| 3 R13-C migrations | **CONFIRMED** |
| No external vendor / clinical search | **CONFIRMED** |
| `/health/ready`, browser, mobile emulator | **CONFIRMED not performed** (honest in Book 229 §8) |

**No material discrepancies identified.**

---

## 9. Scope boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| **R13-C** | **IMPLEMENTED** (audit green) |
| R13-D | **NOT STARTED** |
| R13-E | **NOT STARTED** |
| R13-F | **NOT STARTED** |
| R13-G | **NOT STARTED** |
| R13-H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

**R13-D readiness:** Plan [223](223_R13_IMPLEMENTATION_PLAN.md) §22 R13-D prerequisites (R13-A indexing + personalization feed) are satisfied for authorization discussion. R13-C provider discovery gates are green.

---

## 10. Verdict and next authorization

**`R13_C_GREEN_R13_D_READY`**

R13-C implementation is sound. Provider indexes, unified discovery extension, worker-context indexing, RLS, country isolation, public-metadata boundary, and regression suites are verified. No blocker-class security, architecture, or scope violations found.

**Next authorization:** **`CR-R13-D-IMPL-231`** — R13-D deterministic commerce recommendations only. **Do not implement R13-E+ without further authorization.**
