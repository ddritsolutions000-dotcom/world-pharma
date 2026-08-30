# R13-B Commerce + content discovery API + customer UI

**CR:** `CR-R13-B-IMPL-227`  
**Verdict:** `R13_B_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-B-AUDIT-228`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [226](226_POST_R13_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-B delivers the **unified customer discovery API** (`/discovery/search`, `/discovery/suggest`) combining commerce index search (R13-A `CatalogSearchDocument`) and CMS help search (`CmsContentSearchDocument`), plus **web and mobile client alignment** to the canonical discovery contract (PD-R13-01). **No new search index, worker, or external vendor.**

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `DiscoverySearchService` + `DiscoveryModule` | **DONE** |
| `GET /api/v1/discovery/search` | **DONE** |
| `GET /api/v1/discovery/suggest` | **DONE** |
| Commerce via `CatalogSearchService` (R13-A index) | **DONE** |
| Help via `CmsSearchService` (worker context) | **DONE** |
| Policy `search.discovery_enabled` + `blocklist_terms` | **DONE** |
| Query validation (max 200 chars, suggest min 2) | **DONE** |
| Country/locale scoping + pagination cursor | **DONE** |
| Brand/category facet filters (commerce) | **DONE** |
| Web `discovery-api.ts` + `store-home.tsx` states | **DONE** |
| Mobile `searchDiscovery` + unified search screen | **DONE** |
| TD-R13A-03 deterministic `r13a` XX assertion | **DONE** |
| `r13b.discovery.e2e` | **DONE** |
| R12 regression 32/32 | **DONE** |

**Not started:** R13-C+ provider indexes, R13-D recommendations, R13-E/F analytics, R13-G clinical search, R13-H closure.

---

## 2. API architecture

```
GET /api/v1/discovery/search
GET /api/v1/discovery/suggest
        │
        ▼
DiscoverySearchService
   ├── CatalogSearchService.search()  → catalog_search_documents (R13-A)
   └── CmsSearchService.search()      → cms_content_search_documents (worker RLS)
```

**Parameters:** `country` (required), `locale`, `q`, `types[]=commerce|help`, `limit`, `cursor`, `brand`, `category`.

**Response:** unified `data[]` with `type` discriminator (`commerce` | `help`), public fields only, `meta.limit/total/next_cursor`.

**Legacy:** `/catalog/search` retained; uses R13-A index with `locale` param. Web/mobile `searchCatalog()` now delegates to discovery commerce slice.

---

## 3. TD-R13A-03 fix

`r13a.search-indexing.e2e` now resets `XX` policy pack to `emptyPolicyDocument()` and invalidates `PolicyCache` **before** the `country_enabled=false` assertion — same pattern as `catalog.e2e`. Test is deterministic regardless of R12 suite order. **No production policy weakening.**

---

## 4. Client changes (PD-R13-01)

| Client | Before | After |
|--------|--------|-------|
| Web home browse | `fetchCatalog` (`/catalog/items`) | Unchanged for empty query |
| Web search | `fetchCatalog` with `q` | `fetchDiscoverySearch` (`/discovery/search`) |
| Mobile home | `fetchCatalog` | Unchanged |
| Mobile search | `searchCatalog` (`/catalog/search`) | `searchDiscovery` (commerce + help) |

---

## 5. Security / PHI

| Control | Result |
|---------|--------|
| Country isolation | **PASS** — disabled country returns `country_enabled: false` |
| Locale scoping | **PASS** — validated against pack locales |
| Published-only | **PASS** — index kernels filter `published: true` |
| Blocklist | **PASS** — 403 on blocked terms |
| No PHI/clinical tokens in response | **PASS** — e2e assertion |
| CMS worker context for help reads | **PASS** — matches help center pattern |
| No duplicate search worker | **PASS** |
| FORCE RLS unchanged | **PASS** — no new migrations |

---

## 6. Test counts

| Suite | Tests | Result |
|-------|-------|--------|
| `r13b.discovery.e2e` | 1 | **PASS** |
| `r13a.search-indexing.e2e` | 1 | **PASS** |
| `catalog.e2e` | 1 | **PASS** |
| R12 (`r12a`–`r12g`) | 32 | **32/32 PASS** |
| **Gate total** | **35** | **35/35 PASS** |

---

## 7. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 8. Runtime evidence

| Method | Performed? |
|--------|------------|
| E2E HTTP (Jest) | **Yes** — 35/35 |
| Live DB migrations | **No new migrations** — 114 unchanged |
| `/health/ready` | **No** |
| Browser verification | **No** |
| Mobile emulator | **No** |

---

## 9. Technical debt

| ID | Item | Severity |
|----|------|----------|
| TD-R13A-03 | r13a XX assertion order | **RESOLVED** |
| TD-R13B-01 | Browse (`/catalog/items`) vs discovery search remain dual paths for empty query | Non-blocker |
| TD-R13B-02 | Ranking uses in-stock + title; full facet index fields deferred | Non-blocker |
| PD-R13-01 | Clients aligned on search; browse unchanged | **CLOSED** for search |

---

## 10. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| **R13-B** | **IMPLEMENTED** |
| R13-C/D/E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

---

## 11. Next authorization

**`CR-POST-R13-B-AUDIT-228`**
