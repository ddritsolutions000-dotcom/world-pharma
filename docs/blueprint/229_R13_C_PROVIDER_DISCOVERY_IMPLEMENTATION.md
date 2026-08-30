# R13-C Provider discovery indexes + unified discovery extension

**CR:** `CR-R13-C-IMPL-229`  
**Verdict:** `R13_C_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-C-AUDIT-230`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [228](228_POST_R13_B_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-C delivers **provider discovery indexes** (doctor, lab, test, pharmacy), extends the R13-B unified discovery API with `types[]=doctor|lab|test|pharmacy`, reuses the R13-A indexing kernel, and adds customer UI provider type chips. **No clinical/PHI search, no external vendor, no duplicate discovery kernel.**

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `provider_doctor_search_documents` | **DONE** |
| `provider_lab_search_documents` | **DONE** |
| `provider_test_search_documents` | **DONE** |
| `provider_pharmacy_search_documents` | **DONE** |
| `ProviderSearchService` + worker-context reindex | **DONE** |
| `SearchIndexKind` provider extensions + job runner | **DONE** |
| `DOCTOR_PROFILE_UPDATED` → doctor reindex dispatch | **DONE** |
| Catalog `LAB_TEST` invalidate → provider test reindex | **DONE** |
| `GET /discovery/search` + `/suggest` type extension | **DONE** |
| Filters: `specialty`, `city`, `lab_org_id`, `category` | **DONE** |
| Admin `POST /admin/search/reindex` provider kinds | **DONE** |
| Web provider discovery chips (`store-home.tsx`) | **DONE** |
| Mobile unified search provider types | **DONE** |
| `r13c.provider-search.e2e` | **DONE** |
| R13-A/B + R12 regression | **DONE** |

**Not started:** R13-D+ recommendations, analytics, clinical search, R13-H closure.

---

## 2. Architecture

```
GET /api/v1/discovery/search?suggest
        │
        ▼
DiscoverySearchService (R13-B kernel — extended, not duplicated)
   ├── CatalogSearchService        → commerce (R13-A)
   ├── CmsSearchService            → help (R11)
   └── ProviderSearchService       → doctor|lab|test|pharmacy (R13-C)
            ▲
            │ worker-context upsert
SearchIndexJobService + outbox dispatch
   ├── DOCTOR_PROFILE_UPDATED
   └── SEARCH_INDEX_INVALIDATE (LAB_TEST → provider test)
```

**Publication rules (public metadata only):**

| Index | Published when |
|-------|----------------|
| Doctor | Partner ACTIVE + appointments + doctor_public_visibility |
| Lab | Org LAB ACTIVE + lab capability ELIGIBLE + lab services pack |
| Test | LAB_TEST published + LAB_OWNED offer + eligible lab org |
| Pharmacy | PHARMACY_OWNED ACTIVE + STORE/COLLECTION_POINT active + pharmacy service |

---

## 3. Migrations (117 total)

| Migration | Purpose |
|-----------|---------|
| `20260829270000_r13c_provider_search_schema` | 4 provider index tables + `SearchIndexKind` enum values |
| `20260829270100_r13c_provider_search_rls` | FORCE RLS, deny-by-default, published-only SELECT |
| `20260829270200_r13c_provider_search_grants` | `worldpharma_app` grants |

**No `USING(true)`** policies introduced.

---

## 4. API

### Customer (public)

`GET /api/v1/discovery/search` — extended `types`:

- `doctor` | `lab` | `test` | `pharmacy` (in addition to `commerce` | `help`)
- New filters: `specialty`, `city`, `lab_org_id`
- Default types unchanged: `commerce` + `help` (backward compatible)

### Admin (`search:admin`)

`POST /api/v1/admin/search/reindex`:

- `index_kind`: `provider_doctors` | `provider_labs` | `provider_tests` | `provider_pharmacies` | `providers` (all)
- Targeted: `profile_id`, `organization_id`, `item_id`, `location_id`

---

## 5. Security / PHI

| Control | Result |
|---------|--------|
| Public metadata only | **PASS** — no credentials, PHI, clinical tokens |
| Worker-context indexing writes | **PASS** |
| Published-only SELECT RLS | **PASS** |
| Country/service gates per type | **PASS** |
| Blocklist (R13-B) | **PASS** — inherited |
| No symptom-to-drug / ML / clinical search | **PASS** |
| No external search vendor | **PASS** |

---

## 6. Test counts

| Suite | Tests | Result |
|-------|-------|--------|
| `r13c.provider-search.e2e` | 1 | **PASS** |
| `r13b.discovery.e2e` | 1 | **PASS** |
| `r13a.search-indexing.e2e` | 1 | **PASS** |
| `catalog.e2e` | 1 | **PASS** |
| R12 (`r12a`–`r12g`) | 32 | **32/32 PASS** |
| **Gate total** | **36** | **36/36 PASS** |

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
| E2E HTTP (Jest) | **Yes** — 36/36 |
| Live DB migrations | **Yes** — 117 applied |
| `/health/ready` | **No** |
| Browser verification | **No** |
| Mobile emulator | **No** |

---

## 9. Technical debt

| ID | Item | Severity |
|----|------|----------|
| TD-R13C-01 | Doctor href is `/doctors` directory, not per-profile deep link | Non-blocker |
| TD-R13C-02 | Slot capacity hint indexing deferred (plan low-frequency worker) | Non-blocker |
| TD-R13C-03 | Pharmacy href points to `/search` — no dedicated store-locator page | Non-blocker |

---

## 10. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| **R13-C** | **IMPLEMENTED** |
| R13-D/E/F/G/H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

---

## 11. Next authorization

**`CR-POST-R13-C-AUDIT-230`**
