# R13-H R13 closure / regression

**CR:** `CR-R13-H-IMPL-239`  
**Verdict:** `R13_H_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-H-AUDIT-240`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [238](238_POST_R13_G_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-H closes the R13 program with **combined R13-A…G regression (35/35 PASS)**, **R12 preservation (32/32 PASS)**, live RLS verification on R13 tables via `r13h.closure.e2e`, typecheck/build across API and R13-facing apps, and closure fixes for **TD-REG-R13C-01** and **TD-REG-R13G-01**. **No new R13 feature scope.** Clinical search remains **legally disabled** (`clinical_search_enabled` default `false`). R14+, R10-E/F, and live PSP/payout remain unauthorized.

---

## 1. R13 scope closure

| Phase | Book | Status |
|-------|------|--------|
| R13-A | [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md) | **CLOSED** |
| R13-B | [227](227_R13_B_DISCOVERY_IMPLEMENTATION.md) | **CLOSED** |
| R13-C | [229](229_R13_C_PROVIDER_DISCOVERY_IMPLEMENTATION.md) | **CLOSED** |
| R13-D | [231](231_R13_D_DETERMINISTIC_RECOMMENDATIONS_IMPLEMENTATION.md) | **CLOSED** |
| R13-E | [233](233_R13_E_ANALYTICS_FOUNDATION_IMPLEMENTATION.md) | **CLOSED** |
| R13-F | [235](235_R13_F_ANALYTICS_BI_IMPLEMENTATION.md) | **CLOSED** |
| R13-G | [237](237_R13_G_CLINICAL_SEARCH_IMPLEMENTATION.md) | **CLOSED** (infrastructure-ready; **operationally disabled**) |
| **R13-H** | this book | **IMPLEMENTED** |

**Explicitly not started:** R14+, R10-E/F, live PSP/payout/carriers, external search SaaS, ML/clinical decision-support, symptom-to-drug recommendations, clinical search enablement.

---

## 2. Phase matrix A–G (deliverables)

| Phase | Kernel | API / UI | E2E |
|-------|--------|----------|-----|
| A | `SearchIndexJobService` + catalog/CMS indexes | admin reindex | `r13a` 1 test |
| B | `DiscoverySearchService` | public discovery + suggest | `r13b` 1 test |
| C | `ProviderSearchService` | provider types in discovery | `r13c` 1 test |
| D | `RecommendationsService` + co-occurrence pairs | related/personalized APIs | `r13d` 4 tests |
| E | `AnalyticsReadService` + rollups | admin analytics read APIs | `r13e` 7 tests |
| F | web-admin analytics shell | `/analytics/*` | `r13f` 8 tests |
| G | `ClinicalSearchIndexService` + legal gate | `GET /clinical/search` (doctor only) | `r13g` 7 tests |
| H | combined regression + RLS closure | — | `r13h` 6 tests |

**Single search-index kernel:** `SearchIndexJobService` handles `CATALOG`, provider kinds, and `CLINICAL` — no duplicate indexer.

---

## 3. Test counts

### 3.1 R13 combined (audit re-run)

| Suite | Tests | Result |
|-------|-------|--------|
| `r13a.search-indexing.e2e` | 1 | **PASS** |
| `r13b.discovery.e2e` | 1 | **PASS** |
| `r13c.provider-search.e2e` | 1 | **PASS** |
| `r13d.recommendations.e2e` | 4 | **PASS** |
| `r13e.analytics.e2e` | 7 | **PASS** |
| `r13f.analytics-admin.e2e` | 8 | **PASS** |
| `r13g.clinical-search.e2e` | 7 | **PASS** |
| `r13h.closure.e2e` | 6 | **PASS** |
| **Total** | **35** | **35/35 PASS** |

Run: `npx jest --config apps/api/jest.config.cts --testPathPatterns="r13a|r13b|r13c|r13d|r13e|r13f|r13g|r13h" --runInBand --no-cache`

### 3.2 R12 preservation

| Suite | Tests | Result |
|-------|-------|--------|
| `r12a` … `r12g` | 32 | **32/32 PASS** |

Run: `npx jest --config apps/api/jest.config.cts --testPathPatterns="r12a|r12b|r12c|r12d|r12e|r12f|r12g" --runInBand --no-cache`

---

## 4. Regression closure fixes (R13-H only)

| ID | Fix | Evidence |
|----|-----|----------|
| **TD-REG-R13G-01** | `nextPolicyPackVersion()` helper — monotonic `(country_id, version)` for e2e policy packs | Used in `publish-lab-health-artifact.ts` + `r13g.clinical-search.e2e`; combined R13 **35/35 PASS** |
| **TD-REG-R13C-01** | Suffix-scoped provider fixtures + unified discovery query uses `testSuffix` instead of generic `R13C` | Combined R13 **35/35 PASS** (was failing with doctor-only pollution) |

Files changed (closure only):
- `apps/api/src/test/next-policy-pack-version.ts` (new)
- `apps/api/src/test/publish-lab-health-artifact.ts`
- `apps/api/src/search/r13g.clinical-search.e2e.spec.ts`
- `apps/api/src/search/r13h.closure.e2e.spec.ts` (new)
- `apps/api/src/discovery/r13c.provider-search.e2e.spec.ts`

---

## 5. R13-G legal gate (verified, not enabled)

| Check | Result |
|-------|--------|
| `emptyPolicyDocument().healthcare.clinical_search_enabled` | **`false`** — `r13h.closure.e2e` |
| `PolicyResolver.isClinicalSearchEnabled` | Fail-closed (`=== true` required) |
| Gate-off clinical search | **403** — `r13h.closure.e2e` smoke |
| Static/repo enablement | **None** |
| Enablement during R13-H | **No** |

**Production classification:** Infrastructure-ready, **operationally disabled** (OD-R13-04).

---

## 6. RLS / security results

**Live:** Docker `world-pharma-postgres` → `worldpharma_test` (e2e harness DB)

| Control | Result |
|---------|--------|
| R13 tables present | **PASS** — `r13h.closure.e2e` schema check |
| FORCE RLS on R13 tables | **PASS** — 11 tables verified |
| `USING(true)` permissive policies | **0** — live query |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** |
| Worker/platform write vs user SELECT | **PASS** — per R13-A…G migration SQL |

**Tables verified (sample):** `search_index_jobs`, `catalog_search_documents`, `cms_content_search_documents`, `provider_*_search_documents`, `analytics_order_item_pairs`, `analytics_daily_*`, `clinical_search_documents`

**Main dev DB (`worldpharma`):** **100 migrations**; `clinical_search_documents` **absent** — behind test DB. E2e harness deploys to `worldpharma_test` (130 migrations). Ops should run `prisma migrate deploy` on main when convenient; not an R13-H implementation blocker.

---

## 7. Architecture / boundary verification

| Gate | Result |
|------|--------|
| No duplicate search kernel | **PASS** — single `SearchIndexJobService` |
| No duplicate analytics kernel | **PASS** — `AnalyticsReadService` only |
| No duplicate recommendations kernel | **PASS** — `RecommendationsService` only |
| Clinical not in discovery types | **PASS** — `DISCOVERY_TYPES` excludes clinical |
| Outbox/BullMQ reused | **PASS** — R13-A job queue unchanged |
| No ML / external vendor / PSP | **PASS** — grep + phase boundaries |
| R10-E/F untouched | **PASS** |
| R14+ untouched | **PASS** |

---

## 8. Typecheck / build

| Target | Result | Notes |
|--------|--------|-------|
| `api:typecheck` | **PASS** | |
| `api:build` | **PASS** | |
| `web-admin:typecheck` | **PASS** | |
| `web-admin:build` | **PASS** | |
| `web-affiliate:typecheck` | **PASS** | |
| `mobile:typecheck` | **PASS** | |
| `web-customer:typecheck` | **FAIL** | **TD-WEB-TC-01** — inherited; unrelated to R13-H |

---

## 9. Runtime evidence

| Check | Result |
|-------|--------|
| R13 e2e combined | **35/35 PASS** |
| R12 e2e preservation | **32/32 PASS** |
| `/health/ready` | **200** — `{"status":"ready","postgres":"up","redis":"up","bullmq":"up"}` |
| Live RLS (`worldpharma_test`) | **VERIFIED** — via `r13h.closure.e2e` |
| Live RLS (main `worldpharma`) | **Not verified** — DB behind |
| Browser verification | **Not performed** |
| Mobile/emulator verification | **Not performed** |

---

## 10. Known debt (carried forward)

| ID | Status | R13-H impact |
|----|--------|--------------|
| TD-WEB-TC-01 | Inherited | None — zero `web-customer` R13-H edits |
| TD-R13E-01 | Inherited | Analytics worker not on outbox registry |
| TD-R13D-01/02/03 | Deferred | Mobile PDP carousel, home alias, weekly co-occurrence rebuild |
| TD-REG-R13C-01 | **Closed** | Suffix-scoped unified discovery |
| TD-REG-R13G-01 | **Closed** | Monotonic policy-pack versions |

---

## 11. Final boundary

| Phase | Required status | Actual |
|-------|-----------------|--------|
| R12-A–H | COMPLETE | **COMPLETE** |
| R13-A–F | COMPLETE | **COMPLETE** |
| R13-G | COMPLETE / operationally disabled | **COMPLETE / disabled** |
| R13-H | IMPLEMENTED | **IMPLEMENTED** |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R14+ | NOT STARTED | **NOT STARTED** |

---

## 12. Verdict

All **blocker-class** R13-H closure gates pass. Inherited `TD-WEB-TC-01` and `TD-R13E-01` are documented and do not block post-R13-H audit authorization.

**`R13_H_IMPLEMENTED`**

**Next authorization:** `CR-POST-R13-H-AUDIT-240` — post-R13-H audit only. Target closure verdict per Book 223: **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`**.
