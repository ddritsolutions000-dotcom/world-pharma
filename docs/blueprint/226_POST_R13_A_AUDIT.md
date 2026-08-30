# 226 — Post-R13-A implementation audit

**CR:** `CR-POST-R13-A-AUDIT-226`  
**Verdict:** `R13_A_GREEN_R13_B_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · Plan audit [224](224_POST_R13_PLAN_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-A is **correctly implemented** against Book 223 §22 (R13-A) and Book 225 claims. The search indexing kernel, `search_index_jobs` persistence, outbox-driven invalidation pipeline, admin reindex API, backfill CLI, PD-R13-03 catalog SELECT RLS tightening, and worker-context indexing write path are present and verified in repository state and live test-database RLS inspection.

**PD-R13-03 resolution (Book 225):** Confirmed. Tightened SELECT blocked Prisma `upsert` RETURNING for user actors on unpublished rows. `CatalogSearchService.reindexItem` now elevates to `workerTenantContext({ countryId })` for all indexing writes. User-facing catalog publish/offer flows remain functional (`catalog.e2e` **PASS**). SELECT tightening remains effective; no `USING(true)` policies were introduced.

**No R13-B+ scope** (discovery API, recommendations, analytics, provider indexes, clinical search, external vendor) was found in `apps/api/src/search/` or new migrations.

**One non-blocking test debt (TD-R13A-03):** `r13a.search-indexing.e2e` country-isolation assertion on `XX` is order-dependent — fails when run alone or after R12 suites that re-enable `XX` pharmacy, passes when preceded by `catalog.e2e` (which disables `XX`). Country isolation itself is verified by `catalog.e2e`. **Not an implementation blocker.**

**Runtime limitations (honest):** `/health/ready` not executed (API server not running); browser/device verification not performed; live dev DB (`worldpharma`) not inspected — test DB (`worldpharma_test` @ `127.0.0.1:55432`) used for migrations and RLS.

**Next authorization:** `CR-R13-B-IMPL-227` — R13-B commerce + content discovery API only.

---

## 2. Acceptance gate matrix (22 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `search_index_jobs` schema, indexes, uniqueness, lifecycle | **PASS** | `schema.prisma` L5742–5768; migration `260000`; statuses PENDING/RUNNING/SUCCEEDED/FAILED; unique `idempotency_key`; indexes on `(country_id, status, created_at)` and `(source_type, source_id, created_at)` |
| 2 | R13-A migrations + ordering | **PASS** | 5 migrations `20260829260000`→`260400` in sequence; **114 applied, 0 pending** |
| 3 | FORCE RLS + deny-by-default | **PASS** | Live DB: both `search_index_jobs` and `catalog_search_documents` `force_rls=true`, 4 policies each; DELETE denied via `USING(false)` |
| 4 | Country/tenant isolation | **PASS** | `can_country(country_id)` on job SELECT/INSERT/UPDATE; catalog SELECT requires `published=true` + `can_country` for users; `catalog.e2e` disables `XX` and asserts `country_enabled=false` |
| 5 | PD-R13-03 catalog SELECT tighten | **PASS** | Policy `catalog_search_documents_select` requires `published=true` for auth/user; worker/platform bypass for indexing |
| 6 | Worker-context indexing writes | **PASS** | `search.service.ts` L14–15 `runWithTenant(workerTenantContext({ countryId }), …)` |
| 7 | Publish/offer/price indexing triggers | **PASS** | `catalog.service.ts` L221, L255, L352, L386, L425 → `searchIndex.reindexItem` |
| 8 | Inventory outbox invalidation | **PASS** | `search-index-dispatch.service.ts` registers 8 inventory events + `SEARCH_INDEX_INVALIDATE`; resolver maps lot/receipt → item |
| 9 | Registry → dispatch → resolver → job → reindex | **PASS** | `EventHandlerRegistry` → `SearchIndexDispatchService.handle` → `SearchIndexResolverService` → `SearchIndexJobService.scheduleCatalogReindex` → `CatalogSearchService.reindexItem` |
| 10 | Outbox/BullMQ kernel reuse | **PASS** | No duplicate worker module; handlers registered on existing `EventHandlerRegistry` / `EventWorkerService` |
| 11 | Idempotent scheduling | **PASS** | `search-index-job.service.ts` L34–64; e2e duplicate returns SUCCEEDED |
| 12 | Retry/failure behavior | **PASS** (code) | FAILED jobs re-run on reschedule (L44–45); attempts incremented; `lastError` stored — **no dedicated FAILED e2e** |
| 13 | Backfill/reindex CLI | **PASS** | `search-reindex.cli.ts` with `--country` / `--locale`; uses worker tenant |
| 14 | `search:admin` RBAC | **PASS** | `authority.ts` L281; `admin-search.controller.ts`; e2e 401/403 negatives |
| 15 | PHI/clinical-token protection | **PASS** | `assertNoClinicalPayload` in r13a e2e; index fields are catalog metadata only |
| 16 | No R13-B+ / forbidden scope | **PASS** | No discovery/recommendations/analytics/provider/clinical search modules; no external search client |
| 17 | Catalog regression post-RLS | **PASS** | `catalog.e2e` 1/1 |
| 18 | R12-A–H regression | **PASS** | 32/32 |
| 19 | Typecheck/build | **PASS** | `nx run api:typecheck`, `nx run api:build` |
| 20 | Migration status | **PASS** | `prisma migrate status` — up to date |
| 21 | R13-A e2e + regression | **PASS with debt** | See §4 — combined 34-suite run: **33/34** when r13a runs after R12 re-enables `XX`; **34/34** when `catalog.e2e` precedes r13a |
| 22 | PD-R13-03 worker fix audit | **PASS** | See §5 |

---

## 3. PD-R13-03 / worker-context deep audit

### 3.1 Root cause (confirmed)

Book 225 correctly documents: after SELECT tightening, Prisma `catalogSearchDocument.upsert` fails for **user** actors because INSERT succeeds but **RETURNING** requires SELECT visibility on the new row, and unpublished rows are not visible to user SELECT policy.

Live reproduction during R13-A impl (not re-run in this audit): raw SQL INSERT as user succeeded; Prisma create failed with RLS `42501`.

### 3.2 Fix (confirmed in code)

```14:16:apps/api/src/catalog/search.service.ts
  async reindexItem(itemId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () => this.reindexItemInWorkerContext(itemId, countryId, locale));
  }
```

- Indexing writes execute as `actor_kind=worker` with country scope.
- User HTTP requests still use normal tenant context for catalog CRUD; only the indexing side-effect elevates.
- `SearchIndexJobService.runJob` delegates to `reindexItem` (no double-wrap needed).

### 3.3 SELECT tightening still effective

Live policies on `catalog_search_documents` (test DB):

| Policy | Rule |
|--------|------|
| SELECT | worker/platform OR (`published=true` AND auth) OR (`published=true` AND user AND `can_country`) |
| INSERT | platform OR worker OR user/worker actor |
| UPDATE | platform OR worker OR user |
| DELETE | `false` |

**`USING(true)` count: 0** (live query).

User INSERT/UPDATE policies remain for legacy multi-tenant catalog pattern but **catalog indexing does not rely on user write path** — it uses worker context. This is **not** a broad SELECT bypass.

### 3.4 User-facing publish behavior

`catalog.e2e` creates item, variant, offer, publishes — all **PASS** after R13-A RLS. Vendor offer create triggers inline `reindexItem` which elevates to worker. **No catalog publish regression.**

---

## 4. Test evidence

### 4.1 E2E verification (performed)

**Command (audit re-run 30 Aug 2026):**

```
npx jest --config apps/api/jest.config.cts \
  --testPathPatterns="r13a.search-indexing|catalog.e2e|r12a.crm-kernel|r12b.marketing|r12c.promo|r12d.affiliate|r12e.wishlist|r12f.reviews|r12g.refill-hooks" \
  --runInBand --no-cache --forceExit
```

| Suite | Tests | Result |
|-------|-------|--------|
| `r13a.search-indexing.e2e` | 1 | **FAIL** (combined order) / **PASS** (after `catalog.e2e`) |
| `catalog.e2e` | 1 | **PASS** |
| `r12a.crm-kernel.e2e` | 6 | **PASS** |
| `r12b.marketing.e2e` | 7 | **PASS** |
| `r12c.promo.e2e` | 6 | **PASS** |
| `r12d.affiliate.e2e` | 1 | **PASS** |
| `r12e.wishlist.e2e` | 1 | **PASS** |
| `r12f.reviews.e2e` | 1 | **PASS** |
| `r12g.refill-hooks.e2e` | 10 | **PASS** |
| **R12 subtotal** | **32** | **32/32 PASS** |
| **Combined (first run)** | **34** | **33/34** |

**r13a failure detail:** `GET /catalog/search?country=XX` expects `country_enabled=false` but receives `true` when R12 suites (e.g. `r12c` `enablePharmacyPack` on `XX`) run between `catalog.e2e` and `r13a` in the same Jest invocation. **Implementation is correct; test lacks `XX` policy reset in `beforeAll`.**

**r13a controls exercised when PASS:** 401/403 admin reindex; SUCCEEDED job; idempotency; job list; inventory → job; clinical token scan; `SEARCH_INDEX_INVALIDATE` handler registration.

### 4.2 Live Docker/database verification (performed)

| Check | Result |
|-------|--------|
| DB reachable | **PASS** — `worldpharma_test` @ `127.0.0.1:55432` |
| Migrations | **PASS** — 114 applied |
| FORCE RLS on `search_index_jobs` | **PASS** |
| FORCE RLS on `catalog_search_documents` | **PASS** |
| Policy text matches migrations | **PASS** |
| `USING(true)` on R13-A tables | **PASS** — 0 rows |

### 4.3 Manual `/health/ready` (not performed)

API server was not started during this audit. **Not claimed as verified.**

### 4.4 Browser/device verification (not performed)

No manual UI or mobile device testing. **Not claimed as verified.**

---

## 5. Build / typecheck

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 6. Scope boundary verification

| Phase | Status |
|-------|--------|
| R12-A…H | **COMPLETE** |
| **R13-A** | **IMPLEMENTED** |
| R13-B/C/D/E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

**R13-B readiness:** Plan [223](223_R13_IMPLEMENTATION_PLAN.md) §22 R13-B prerequisites (R13-A indexing kernel) are satisfied. PD-R13-01 (mobile `/catalog/search` vs web browse) remains planning input for R13-B.

---

## 7. Security / PHI assessment

| Control | Status |
|---------|--------|
| Country isolation | **PASS** |
| Org/person isolation (jobs) | **PASS** — platform/worker/country-scoped |
| FORCE RLS | **PASS** |
| Deny-by-default | **PASS** |
| No `USING(true)` | **PASS** (live verified) |
| No PHI in index payload | **PASS** |
| No symptom-to-drug / ML / recommendations | **PASS** |
| No external search vendor | **PASS** |
| R9/R10/R11/R12 boundaries | **PASS** — no clinical tables indexed |

---

## 8. Technical debt

| ID | Item | Class | Blocker? |
|----|------|-------|----------|
| **TD-R13A-01** | Inline catalog reindex remains synchronous on publish/offer paths (async path is additive) | Non-blocker | **NO** |
| **TD-R13A-02** | Prisma RETURNING requires worker context for indexing writes | **RESOLVED** in R13-A | **NO** |
| **TD-R13A-03** | `r13a.search-indexing.e2e` `XX` country assertion order-dependent; fails after R12 suites enable `XX` pharmacy | Test hygiene | **NO** — fix recommended at start of CR-R13-B-IMPL-227 |
| **PD-R13-01** | Mobile vs web search path divergence | Planning | **NO** — R13-B scope |
| **PD-R13-02** | R13-G clinical search optional vs closure | Planning | **NO** |

**No blocker-class debt identified.**

---

## 9. Book 225 vs repository discrepancies

| Claim | Audit |
|-------|-------|
| 34/34 PASS | **PARTIAL** — true when r13a runs after `catalog.e2e`; **33/34** in single combined invocation with R12 suites between catalog and r13a |
| All other Book 225 claims | **CONFIRMED** |

---

## 10. Verdict and next authorization

**`R13_A_GREEN_R13_B_READY`**

R13-A implementation is sound. PD-R13-03 is closed. Worker-context indexing is the correct pattern — not an RLS bypass. Catalog publish and R12 regressions are green. TD-R13A-03 should be fixed as test hygiene before or at the start of R13-B implementation.

**Next authorization:** **`CR-R13-B-IMPL-227`** — R13-B commerce + content discovery API + customer UI alignment only. **Do not implement R13-C+ without further authorization.**
