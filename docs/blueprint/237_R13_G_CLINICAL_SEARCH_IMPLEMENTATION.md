# R13-G Clinical/PHI search

**CR:** `CR-R13-G-IMPL-237`  
**Verdict:** `R13_G_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-G-AUDIT-238`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [236](236_POST_R13_F_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-G delivers **legal-gated clinical/PHI search** for doctor apps: metadata-only `clinical_search_documents` index, `GET /api/v1/clinical/search`, R9 consent + `clinical:search` enforcement, and audit events. **Not in public discovery. No PHI payloads, no symptom-to-drug, no ML, no external vendor.**

---

## 1. Legal / policy gate (OD-R13-04)

| Gate | Behavior |
|------|----------|
| `healthcare.clinical_search_enabled` | **Fail-closed** — defaults `false` in policy packs |
| OD-R13-04 | Human legal sign-off required before enabling in production packs |

Infrastructure is implemented; **feature remains disabled until a published country pack explicitly sets `clinical_search_enabled: true`.** Tests enable the gate programmatically only.

---

## 2. Scope delivered

| Item | Status |
|------|--------|
| `clinical_search_documents` table + RLS + grants | **DONE** |
| `SearchIndexKind.CLINICAL` + `ClinicalSearchIndexService` | **DONE** |
| `SearchIndexJobService.scheduleClinicalReindex` | **DONE** |
| `GET /api/v1/clinical/search` | **DONE** |
| `clinical:search` RBAC (doctor org roles) | **DONE** |
| R9 consent + relationship via `ClinicalAccessService` | **DONE** |
| Query blocklist (static + pack `search.blocklist_terms`) | **DONE** |
| `CLINICAL_SEARCH_QUERY` security events (query hash only) | **DONE** |
| Metadata-only response allow-list | **DONE** |
| Not in `DiscoverySearchService` / public discovery | **DONE** |
| `r13g.clinical-search.e2e` | **DONE** (7/7) |

**Not in R13-G:** R13-H closure, customer/mobile clinical search UI, external search vendor, PHI warehouse, symptom-to-drug, ML/recommendations.

---

## 3. API

`GET /api/v1/clinical/search`

| Param | Required | Notes |
|-------|----------|-------|
| `country_code` | yes | 2-letter ISO |
| `patient_person_id` | yes | UUID — server-scoped search |
| `q` | yes | min 2 chars; blocklist enforced |
| `purpose` | yes | `consultation` \| `treatment` \| `break_glass` |
| `limit` | no | max 25 |

**Guards:** JWT + `doctor` audience + `clinical:search` + `clinical_search_enabled` + R9 access evaluation.

**Response fields (allow-list):** `artifact_id`, `artifact_type`, `title`, `published_at` — no payloads.

---

## 4. Architecture

```
HealthArtifact (metadata) ──► ClinicalSearchIndexService ──► clinical_search_documents
                                                              │
GET /clinical/search ──► ClinicalSearchService ◄──────────────┘
         │                      │
         │                      ├── PolicyResolver.isClinicalSearchEnabled
         │                      ├── ClinicalAccessService (consent)
         │                      └── worker tenant context reads
         └── SecurityEventsService (CLINICAL_SEARCH_QUERY)
```

Reuses R13-A `SearchIndexJobService` for `CLINICAL` reindex jobs — **no second search kernel.**

---

## 5. Migrations (128 total)

| Migration | Purpose |
|-----------|---------|
| `20260829300000_r13g_clinical_search_schema` | `clinical_search_documents`, `SearchIndexKind.CLINICAL` |
| `20260829300100_r13g_clinical_search_rls` | FORCE RLS; worker/platform + patient self SELECT |
| `20260829300200_r13g_clinical_search_grants` | SELECT/INSERT/UPDATE grants |

---

## 6. Runtime evidence

| Suite | Result |
|-------|--------|
| `r13g.clinical-search.e2e` | **7/7 PASS** |
| `r13a.search-indexing.e2e` | **PASS** |
| `r13e.analytics.e2e` | **PASS** |
| `r13f.analytics-admin.e2e` | **PASS** |
| `api:typecheck` | **PASS** |
| R13-C (`r13c`) | Not re-run — **TD-REG-R13C-01** inherited |
| `/health/ready` | Not run |
| Browser/mobile verification | Not performed |
| Live RLS query | Not run (policies in migration) |

---

## 7. Known debt (unchanged)

TD-R13D-01, TD-R13D-02, TD-R13D-03, TD-WEB-TC-01, TD-REG-R13C-01, TD-R13E-01

---

## 8. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | COMPLETE |
| R13-A–F | COMPLETE |
| **R13-G** | **IMPLEMENTED** |
| R13-H | NOT STARTED |
| R10-E/F | NOT STARTED |
| R14+ | NOT STARTED |

---

## 9. Next step

**`CR-POST-R13-G-AUDIT-238`** — post-R13-G audit only.
