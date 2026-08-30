# 238 — Post-R13-G implementation audit

**CR:** `CR-POST-R13-G-AUDIT-238`  
**Verdict:** `R13_G_GREEN_R13_H_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [237](237_R13_G_CLINICAL_SEARCH_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · R13-F audit [236](236_POST_R13_F_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, configuration, or policy changes were made.** Clinical search legal gate was **not** enabled.

---

## 1. Executive summary

R13-G is **correctly implemented** against Book 223 §R13-G, Book 237 claims, and Book 93 clinical-search acceptance criteria. The repo delivers legal-gated, metadata-only clinical/PHI search via `GET /api/v1/clinical/search`, reusing the R13-A search-index job kernel (`SearchIndexKind.CLINICAL` + `ClinicalSearchIndexService`). Clinical records are **not** unioned into public `DiscoverySearchService`.

**Legal / operational status (critical):** `healthcare.clinical_search_enabled` defaults **`false`** in policy schema (`document.ts`, `empty-pack.ts`). No static seed or published production pack in the repository enables clinical search. Live test-DB query for `clinical_search_enabled = 'true'` on `PUBLISHED` packs returned **0 rows** at audit time. E2e tests enable the gate programmatically only. **Classification: infrastructure-ready but operationally disabled** pending OD-R13-04 human legal sign-off and explicit published pack enablement.

**Inherited non-blockers (not R13-G caused):**
- **TD-WEB-TC-01** — `web-customer:typecheck` fails on `store-home.tsx` `NetworkErrorState` `onRetry` prop; R13-G touched zero `apps/web-customer` files.
- **TD-R13E-01** — `AnalyticsWorkerService` not on `EventHandlerRegistry` / outbox (unchanged from R13-E).
- **TD-R13D-01/02/03** — deferred recommendation/mobile items (unchanged).
- **TD-REG-R13G-01** — `r13g.clinical-search.e2e` intermittent `policy_packs (country_id, version)` unique violation on polluted test DB; **7/7 PASS** on immediate re-run (environmental flake).

**Environmental ops note (non-blocker):** Main dev database `worldpharma` is **behind** test DB (100 vs 130 `_prisma_migrations` records; `clinical_search_documents` absent on main). E2e harness deploys all migrations to `worldpharma_test` successfully. FORCE RLS verified live on **test** DB only.

**Runtime limitations (honest):** `/health/ready` not executed (API not running); browser/mobile verification not performed.

**Next authorization:** `CR-R13-H-IMPL-239` — R13-H closure/regression only.

---

## 2. Acceptance gate matrix (23 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `GET /api/v1/clinical/search` | **PASS** | `clinical-search.controller.ts` — `@Controller('clinical/search')`, global prefix `api/v1` |
| 2 | Doctor audience enforcement | **PASS** | `@RequireAudiences('doctor')` + `AudienceGuard`; e2e customer 403 |
| 3 | `clinical:search` RBAC | **PASS** | `@RequirePermissions('clinical:search')`; `authority.ts` grants to `clinic_doctor` / `hospital_doctor` / `independent_doctor`; e2e doctor without org role 403 |
| 4 | `ClinicalAccessService` authorization/consent | **PASS** | `evaluateForPatientHealthRead` before query; consent scope filters artifact types; e2e no-consent 403 |
| 5 | `healthcare.clinical_search_enabled` gate | **PASS** | `PolicyResolver.isClinicalSearchEnabled`; `requireEnabled()` in service |
| 6 | Gate OFF → 403 / fail closed | **PASS** | Default `false` in `empty-pack.ts` / `document.ts`; e2e gate-off 403 |
| 7 | Not in public `DiscoverySearchService` | **PASS** | `discovery-search.service.ts` unions commerce/CMS/provider only; grep no clinical refs; e2e discovery cannot find artifact id |
| 8 | Reuses search job/index kernel | **PASS** | `SearchIndexKind.CLINICAL`; `scheduleClinicalReindex`; `runJob` case delegates to `ClinicalSearchIndexService` — no duplicate kernel |
| 9 | `clinical_search_documents` metadata-only | **PASS** | Schema: `artifact_id`, `person_id`, `country_id`, `artifact_type`, `title`, `published`, `published_at`, `version` — no payload columns |
| 10 | Response allow-list (approved fields) | **PASS** | Items: `artifact_id`, `artifact_type`, `title`, `published_at` per `CLINICAL_SEARCH_RESPONSE_FIELDS`; e2e `payload` undefined |
| 11 | No unrestricted PHI in responses | **PASS** | Service `select` omits payloads; `assertNoSensitivePayload` denylist in e2e; no notes/prescriptions/lab values/imaging/diagnoses returned |
| 12 | Country/tenant/person isolation | **PASS** | Query filters `countryId` + `patientPersonId`; `runWithTenant(workerTenantContext)`; e2e wrong-patient 403 |
| 13 | FORCE RLS + deny-by-default | **PASS** | Migration `20260829300100`: `ENABLE` + `FORCE ROW LEVEL SECURITY`; live test DB confirms `relforcerowsecurity = t` |
| 14 | No `USING(true)` | **PASS** | Migration grep: none; live policies use `app.is_worker()`, `app.is_platform()`, `app.can_person`, or `false` |
| 15 | Worker/platform write vs user SELECT separation | **PASS** | INSERT/UPDATE: `app.is_platform() OR app.is_worker()`; SELECT: worker/platform OR `published AND can_person(person_id)` |
| 16 | Static + pack blocklists | **PASS** | `CLINICAL_SEARCH_STATIC_BLOCKLIST` + `PolicyResolver.isQueryBlocked` / `search.blocklist_terms`; e2e symptom query 403 |
| 17 | No symptom-to-drug / treatment / diagnosis recommendation | **PASS** | Blocklist rejects symptom/treatment/diagnosis patterns; no clinical recommendation engine; `DiscoverySearchService` unchanged |
| 18 | `CLINICAL_SEARCH_QUERY` audit — no PHI in query | **PASS** | `metadata.query_hash` only (SHA-256 truncated); e2e asserts raw query text absent from event JSON |
| 19 | No PHI leakage to logs/outbox/analytics/discovery | **PASS** | Grep: clinical search scoped to `clinical/` + `search/` modules; analytics unchanged; discovery union excludes clinical |
| 20 | No external clinical search vendor | **PASS** | Grep clinical module: no Algolia/Elasticsearch/Typesense/OpenAI/clinical vendor |
| 21 | No ML / clinical decision-support engine | **PASS** | Metadata title `contains` search only; no ML imports in R13-G files |
| 22 | R13-A through R13-F intact | **PASS** | Regression e2e re-run — see §5 |
| 23 | R13-H, R14+, R10-E/F untouched | **PASS** | No `r13h` specs/files; no R14/R10-E/F implementation artifacts |

---

## 3. Legal gate verification

| Check | Result |
|-------|--------|
| Default in policy schema | `clinical_search_enabled: false` (`document.ts` L130–151, `empty-pack.ts` L156) |
| Resolver fail-closed | `=== true` required (`resolver.ts` L210–212) |
| Repository static enablement | **None** — grep limited to impl docs, policy defaults, e2e helper |
| Published pack enablement (test DB) | **0 rows** with `clinical_search_enabled = 'true'` at audit query time |
| Audit action | Gate **not** enabled during this CR |

**Production classification:** **Infrastructure-ready, operationally disabled.** Implementation readiness ≠ legal approval (OD-R13-04).

---

## 4. Security audit

| Control | Mechanism | Verified |
|---------|-----------|----------|
| Authentication | `JwtAuthGuard` | Controller class guard |
| Doctor audience | `@RequireAudiences('doctor')` | e2e customer 403 |
| `clinical:search` | `@RequirePermissions` + `PermissionsGuard` | e2e doctor without role 403 |
| Policy gate | `isClinicalSearchEnabled` | e2e gate-off 403 |
| R9 consent | `ClinicalAccessService.evaluateForPatientHealthRead` | e2e no-consent 403; scope filters artifact types |
| Query blocklist | Static + pack terms | e2e `symptom fever drug` 403 |
| Tenant context | `runWithTenant(workerTenantContext({ countryId }))` | Service read path |
| Audit event | `CLINICAL_SEARCH_QUERY` | Hash only for query text; includes opaque `patient_person_id` + `purpose` for correlation (no clinical payload) |
| PHI exclusion | Metadata-only index + response `select` | e2e `assertNoSensitivePayload` |

**Audit metadata note:** Event includes `patient_person_id` (UUID) and `purpose` for access correlation — not clinical note/prescription/lab payload. Raw search string is **not** logged (hash only), satisfying gate #18.

---

## 5. Test verification (audit re-run)

| Suite | Result | Notes |
|-------|--------|-------|
| `r13g.clinical-search.e2e` | **7/7 PASS** | Re-run after 6/7 flake (TD-REG-R13G-01) |
| `r13a.search-indexing.e2e` | **PASS** | Bundled with B/D/E/F |
| `r13b.discovery.e2e` | **PASS** | |
| `r13c.provider-search.e2e` | **PASS** | Isolated run (passed this audit; may flake on polluted DB per TD-REG-R13C-01) |
| `r13d.recommendations.e2e` | **PASS** | |
| `r13e.analytics.e2e` | **PASS** | Bundled with A/B/D/F |
| `r13f.analytics-admin.e2e` | **PASS** | |
| `r12e.wishlist.e2e` | **PASS** | Sample R12 regression |
| `r12f.reviews.e2e` | **PASS** | Sample R12 regression |
| `api:typecheck` | **PASS** | |
| `web-customer:typecheck` | **FAIL** | **TD-WEB-TC-01** (inherited) |
| `/health/ready` | Not run | API not listening on :4000 |
| Live RLS (main `worldpharma`) | Not verified | Table absent — DB behind migrations |
| Live RLS (`worldpharma_test`) | **VERIFIED** | FORCE RLS + 4 policies; see §6 |
| Browser / device | Not performed | |

### 5.1 Scenario classification (r13g)

| Scenario | Class | Result |
|----------|-------|--------|
| Gate disabled | Blocker gate | **PASS** — 403 |
| Unauthorized role (customer / no `clinical:search`) | Blocker gate | **PASS** — 403 |
| Missing/invalid consent | Blocker gate | **PASS** — 403 |
| Wrong country/person | Blocker gate | **PASS** — wrong patient 403 |
| Public discovery cannot access clinical records | Blocker gate | **PASS** |
| PHI field leakage | Blocker gate | **PASS** — `assertNoSensitivePayload` |
| Symptom-to-drug query rejection | Blocker gate | **PASS** — 403 |
| Audit-event privacy (no raw query) | Blocker gate | **PASS** — hash only |

---

## 6. Schema / migration / RLS status

### 6.1 Migrations (repo)

| Migration | Purpose |
|-----------|---------|
| `20260829300000_r13g_clinical_search_schema` | Table + `SearchIndexKind.CLINICAL` |
| `20260829300100_r13g_clinical_search_rls` | FORCE RLS; worker/platform + patient SELECT |
| `20260829300200_r13g_clinical_search_grants` | `SELECT, INSERT, UPDATE` to `worldpharma_app` |

### 6.2 Live database evidence

| Database | Migrations | `clinical_search_documents` | FORCE RLS |
|----------|------------|----------------------------|-----------|
| `worldpharma_test` (e2e) | 130 | Present | **Verified** — `relrowsecurity=t`, `relforcerowsecurity=t` |
| `worldpharma` (main dev) | 100 | **Absent** | Not verified — DB behind; ops should `migrate deploy` |

**Live RLS policies (`worldpharma_test`):**

| Policy | Command | USING |
|--------|---------|-------|
| `clinical_search_documents_select` | SELECT | `app.is_worker() OR app.is_platform() OR (published AND app.can_person(person_id))` |
| `clinical_search_documents_insert` | INSERT | WITH CHECK: platform/worker |
| `clinical_search_documents_update` | UPDATE | platform/worker |
| `clinical_search_documents_no_delete` | DELETE | `false` |

**Role check:** `worldpharma_app` — `rolsuper=f`, `rolbypassrls=f`.

**No `USING(true)`** on `clinical_search_documents` (migration + live query).

---

## 7. Architecture confirmation

```
HealthArtifact (metadata) ──► ClinicalSearchIndexService ──► clinical_search_documents
                                                              │
GET /clinical/search ──► ClinicalSearchService ◄──────────────┘
         │                      │
         │                      ├── PolicyResolver.isClinicalSearchEnabled (fail-closed)
         │                      ├── ClinicalAccessService (R9 consent)
         │                      └── worker tenant context reads
         └── SecurityEventsService (CLINICAL_SEARCH_QUERY, query_hash)
```

`ClinicalModule` registers controller/service; `ClinicalSearchIndexService` lives in `SearchModule` (avoids circular Clinical → Search → Lab → Health → Clinical). Reindex jobs flow through existing `SearchIndexJobService`.

---

## 8. Known debt (carried forward)

| ID | Status | R13-G impact |
|----|--------|--------------|
| TD-R13D-01/02/03 | Deferred | None |
| TD-WEB-TC-01 | Inherited | None |
| TD-R13E-01 | Inherited | None |
| TD-REG-R13C-01 | Inherited | None — passed this audit run |
| TD-REG-R13G-01 | **New (non-blocker)** | Intermittent policy-pack version collision on polluted test DB |

**Not resolved by R13-G.**

---

## 9. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | COMPLETE |
| R13-A | COMPLETE |
| R13-B | COMPLETE |
| R13-C | COMPLETE |
| R13-D | COMPLETE |
| R13-E | COMPLETE |
| R13-F | COMPLETE |
| **R13-G** | **IMPLEMENTED / audited** |
| R13-H | NOT STARTED |
| R10-E/F | NOT STARTED |
| R14+ | NOT STARTED |

---

## 10. Verdict

All **blocker-class** R13-G gates pass. Clinical search remains **legally disabled** in default/production configuration. Inherited environmental and pre-existing debts are documented and do not block R13-H technical authorization.

**`R13_G_GREEN_R13_H_READY`**

**Next authorization:** `CR-R13-H-IMPL-239` — R13-H closure/regression only. Do **not** enable `clinical_search_enabled` without OD-R13-04 legal sign-off.
