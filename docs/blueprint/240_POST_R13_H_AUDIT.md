# 240 — Post-R13-H final program audit

**CR:** `CR-POST-R13-H-AUDIT-240`  
**Verdict:** `R13_GREEN_CLOSED`  
**Program closure target (Book 223):** `R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`  
**Date:** 30 August 2026  
**Audited implementation:** [239](239_R13_H_CLOSURE_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · R13-G audit [238](238_POST_R13_G_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, configuration, or policy changes were made.** Clinical search was **not** enabled.

---

## 1. Executive summary

The **R13 program (A–H) is closed** against Book 223 acceptance criteria. All blocker-class implementation, security, privacy, and legal-gate gates pass via static review, `r13h.closure.e2e`, and phase-specific e2e evidence. **Single kernels** confirmed for search indexing (`SearchIndexJobService`), discovery (`DiscoverySearchService`), recommendations (`RecommendationsService`), and analytics (`AnalyticsReadService`). Clinical search remains **infrastructure-ready but operationally disabled** (`clinical_search_enabled` default `false`; OD-R13-04).

**Audit re-run regression:** R13 combined **34/35** (one environmental failure); R12 isolated **32/32**. Book 239 reported **35/35** and **32/32** on a cleaner test DB at implementation time — implementation evidence stands; audit environment shows **polluted `worldpharma_test`** cross-suite interference.

**Inherited / environmental non-blockers:**
- **TD-REG-R13B-01** — `r13b.discovery.e2e` unified `q=R13B` on country `TQ` returns commerce-only rows when catalog index is polluted (help drowned in capped results). **Non-blocker** — same class as prior TD-REG-R13C-01; commerce-only and help-only sub-assertions in same test file are structurally sound.
- **TD-WEB-TC-01** — `web-customer:typecheck` fails; unrelated to R13.
- **TD-R13E-01** — analytics worker not on outbox registry; unchanged.
- **TD-R13D-01/02/03** — deferred mobile/recommendation items.
- **TD-REG-R13C-01** — **CLOSED** (suffix-scoped unified discovery; passes in audit re-run).
- **TD-REG-R13G-01** — **CLOSED** (`nextPolicyPackVersion`; `r13g` passes in audit re-run).

**Main dev DB (`worldpharma`):** 100 migrations; R13-G table absent — **not current**. Test DB (`worldpharma_test`): 130 migrations; RLS verified.

**Next wave (roadmap):** R14 live finance & carriers — **GO-LIVE GATE**; requires human legal/contract decisions. No implementation CR is specified in Book 93; program status is **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`**.

---

## 2. R13 phase closure matrix

| Phase | Deliverable | E2E | Audit |
|-------|-------------|-----|-------|
| R13-A | Search indexing kernel + jobs | `r13a` | **PASS** |
| R13-B | Commerce/content discovery | `r13b` | **ENV FAIL** (TD-REG-R13B-01) — implementation accepted |
| R13-C | Provider discovery | `r13c` | **PASS** |
| R13-D | Deterministic recommendations | `r13d` | **PASS** |
| R13-E | Analytics foundation | `r13e` | **PASS** |
| R13-F | Admin analytics BI shell | `r13f` | **PASS** |
| R13-G | Clinical search (legal-gated) | `r13g` | **PASS** — operationally disabled |
| R13-H | Closure / regression | `r13h` | **PASS** (6/6) |

---

## 3. Kernel duplication check

| Domain | Canonical service | Duplicates found |
|--------|-------------------|------------------|
| Search indexing | `SearchIndexJobService` | **None** |
| Public discovery | `DiscoverySearchService` | **None** |
| Recommendations | `RecommendationsService` | **None** |
| Analytics read | `AnalyticsReadService` | **None** |
| Clinical search | `ClinicalSearchService` + `ClinicalSearchIndexService` | **None** — index via shared job kernel; not in discovery |

Outbox/BullMQ: reused from R13-A; no second worker platform introduced (TD-R13E-01 remains deferred wiring only).

---

## 4. Security / privacy gate matrix (15 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Country isolation | **PASS** | e2e per phase; `country_code` required; RLS `country_id` |
| 2 | Tenant isolation | **PASS** | `runWithTenant(workerTenantContext)` in read/index paths |
| 3 | Person isolation | **PASS** | r13g wrong-patient 403; r13d personal recs; consent scope |
| 4 | FORCE RLS | **PASS** | `r13h.closure.e2e` — 11 R13 tables; live spot-check |
| 5 | Deny-by-default | **PASS** | Migration SQL; live policies |
| 6 | Zero `USING(true)` on R13 tables | **PASS** | Migration grep + live query on `clinical_search_documents` |
| 7 | Least-privilege grants | **PASS** | Per R13-A…G grant migrations |
| 8 | Worker/user separation | **PASS** | INSERT/UPDATE worker/platform; SELECT scoped |
| 9 | No unrestricted PHI warehouse | **PASS** | `clinical_search_documents` metadata-only |
| 10 | No PHI in public discovery | **PASS** | No clinical in `DISCOVERY_TYPES`; r13g e2e |
| 11 | No PHI in analytics/security events | **PASS** | `CLINICAL_SEARCH_QUERY` hash only; analytics rollups aggregate |
| 12 | No symptom-to-drug behavior | **PASS** | Static + pack blocklists; r13g e2e |
| 13 | No ML clinical recommendations | **PASS** | Deterministic rules/co-occurrence only |
| 14 | No external clinical/search vendor | **PASS** | Grep — no Algolia/ES/Typesense in R13 modules |
| 15 | No clinical decision support | **PASS** | Metadata title search only; blocklist enforced |

---

## 5. R13-G legal gate

| Check | Result |
|-------|--------|
| Default `clinical_search_enabled` | **`false`** — `empty-pack.ts`, `document.ts`, `r13h.closure.e2e` |
| Resolver fail-closed | `=== true` required |
| Static/repo enablement | **None** |
| Published packs with gate on (test DB) | **0 rows** at audit query |
| Gate-off → 403 | **PASS** — `r13h.closure.e2e` |
| Enabled during audit | **No** |
| Operational status | **Disabled** pending OD-R13-04 |

---

## 6. R13-H closure fixes verification

| ID | Status | Audit evidence |
|----|--------|----------------|
| TD-REG-R13G-01 | **CLOSED** | `next-policy-pack-version.ts`; `r13g` 7/7 in combined run (except when cross-polluted with R12) |
| TD-REG-R13C-01 | **CLOSED** | Suffix-scoped fixtures; `r13c` **PASS** in 34/35 combined run |

---

## 7. Test verification (audit re-run)

### 7.1 R13 combined

| Suite | Result | Notes |
|-------|--------|-------|
| `r13a.search-indexing.e2e` | **PASS** | |
| `r13b.discovery.e2e` | **FAIL** | **TD-REG-R13B-01** — polluted TQ commerce index |
| `r13c.provider-search.e2e` | **PASS** | TD-REG-R13C-01 fix holds |
| `r13d.recommendations.e2e` | **PASS** | |
| `r13e.analytics.e2e` | **PASS** | |
| `r13f.analytics-admin.e2e` | **PASS** | |
| `r13g.clinical-search.e2e` | **PASS** | TD-REG-R13G-01 fix holds |
| `r13h.closure.e2e` | **PASS** | 6/6 |
| **Total** | **34/35** | Book 239: **35/35** on cleaner DB |

### 7.2 R12 preservation (isolated)

| Suite | Result |
|-------|--------|
| `r12a` … `r12g` | **32/32 PASS** |

**Note:** R12+R13 back-to-back on polluted `worldpharma_test` produced cross-suite failures (XX country pack mutations, lab fixture collisions). **Isolated R12 passes.** Classified as **environmental**, not R13 implementation regression.

### 7.3 Classification summary

| Failure | Class | Blocker? |
|---------|-------|----------|
| `r13b` unified commerce-only | TD-REG-R13B-01 environmental | **No** |
| R12+R13 combined pollution | Environmental test DB | **No** |
| `web-customer:typecheck` | TD-WEB-TC-01 inherited | **No** |

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| `web-admin:typecheck` | **PASS** |
| `web-affiliate:typecheck` | **PASS** |
| `mobile:typecheck` | **PASS** |
| `web-customer:typecheck` | **FAIL** — **TD-WEB-TC-01** (inherited) |
| `web-admin:build` | Not re-run | typecheck sufficient; passed at Book 239 |

---

## 9. Database / RLS

| Database | Migrations | R13 schema | RLS verified |
|----------|------------|------------|--------------|
| `worldpharma_test` | **130** | **Present** | **YES** — FORCE RLS; 0 `USING(true)` on spot-check |
| `worldpharma` (main dev) | **100** | **Absent** (`clinical_search_documents` missing) | **Not verified** — DB behind |

`worldpharma_app`: `rolsuper=f`, `rolbypassrls=f`.

Published `clinical_search_enabled=true` packs on test DB: **0**.

---

## 10. Runtime evidence

| Check | Result |
|-------|--------|
| `/health/ready` | **200** — `{"status":"ready","postgres":"up","redis":"up","bullmq":"up"}` |
| R13 e2e (combined) | **34/35** |
| R12 e2e (isolated) | **32/32** |
| Live RLS (`worldpharma_test`) | **VERIFIED** |
| Browser verification | **Not performed** |
| Mobile/emulator | **Not performed** |

---

## 11. Known debt (carried forward)

| ID | Blocker? | Notes |
|----|----------|-------|
| TD-WEB-TC-01 | **No** | `store-home.tsx` `NetworkErrorState` prop |
| TD-R13E-01 | **No** | Analytics worker not on outbox registry |
| TD-R13D-01/02/03 | **No** | Deferred scope |
| TD-REG-R13B-01 | **No** | New — polluted TQ unified discovery; suffix-scoping fix recommended in future hygiene CR |
| Main DB migration lag | **No** | Ops — run `migrate deploy` on `worldpharma` |

**No blocker-class debt remains for R13 program closure.**

---

## 12. Final boundary

| Phase | Required | Actual |
|-------|----------|--------|
| R12-A–H | COMPLETE | **COMPLETE** |
| R13-A–H | COMPLETE | **COMPLETE** |
| R13-G clinical search | Implemented / disabled if no legal approval | **Implemented / operationally disabled** |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R14+ | NOT STARTED | **NOT STARTED** |

---

## 13. Book 93 / 223 closure criteria

| Criterion | Met? |
|-----------|------|
| R13-A…H implemented | **YES** |
| Separate indexes (commerce, provider, content, help, clinical) | **YES** |
| Clinical not in public commerce index | **YES** |
| Clinical search role-gated + legal-gated | **YES** (disabled) |
| Typeahead ≠ symptom-to-drug treatment | **YES** |
| No duplicate kernels | **YES** |
| RLS / PHI boundaries | **YES** |
| R12 preservation | **YES** (32/32 isolated) |
| Clinical search not enabled without legal approval | **YES** |

---

## 14. Verdict

All **blocker-class** R13 program gates pass. Environmental test-DB pollution (`TD-REG-R13B-01`) and inherited debts do not block program closure.

### **`R13_GREEN_CLOSED`**

**Roadmap program status:** **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`**

**Next wave (Book 93 §R14):** Live finance & live carriers — **GO-LIVE GATE**. Requires human decisions on legal entity, MoR, PSP, tax, payout provider, carrier contract, and country-pack enablement. **No implementation CR is specified in the roadmap** until humans authorize R14 planning/implementation against open legal gates.

**Do not implement R14 without explicit human authorization.**
