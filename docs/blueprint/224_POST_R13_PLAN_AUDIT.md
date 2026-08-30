# 224 — Post-R13 plan audit

**CR:** `CR-POST-R13-PLAN-AUDIT-224`  
**Verdict:** `R13_PLAN_GREEN_R13_A_READY`  
**Date:** 29 August 2026  
**Audited plan:** [223](223_R13_IMPLEMENTATION_PLAN.md)  
**Baseline:** [222](222_POST_R12_H_AUDIT.md) (**R12_GREEN_CLOSED_R13_READY_FOR_PLANNING**)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. No source, schema, migration, API, UI, test, or configuration changes were made.

---

## Executive summary

Independent audit confirms **Book 223 is a sound, internally consistent R13 implementation plan** aligned with Book 93 §R13 (search, recommendations, analytics/BI), Books [24](24_SEARCH_ARCHITECTURE.md), [15](15_CRM_PLATFORM.md), [17](17_ADMIN_ERP.md), [205](205_R12_IMPLEMENTATION_PLAN.md) §17 (R13 boundary), and repository truth verified 29 Aug 2026.

**No product, security, database, or architecture blockers** prevent authorization of **CR-R13-A-IMPL-225**.

**Planning/documentation debt (non-blocking):**
- **PD-R13-01:** Book 223 §2.1/§5.7 states customer UI uses `/catalog/items` browse only — **correct for web-customer** (`store-home.tsx` → `fetchCatalog`), but **mobile uses `/catalog/search`** via `searchCatalog()` (`apps/mobile/src/commerce-api.ts`). Plan should note dual-client divergence in R13-B.
- **PD-R13-02:** R13-G note allows program closure at R13-F while R13-H targets full closure verdict — Book 93 clinical/PHI index acceptance may require R13-G **or** explicit human deferral at R13-H; document in closure CR, not a plan blocker.
- **PD-R13-03:** `catalog_search_documents` RLS is not country-scoped on SELECT today — plan correctly assigns tighten to R13-A; current state confirmed.

**No R13 implementation code exists** in the repository. R10-E/F, R12 expansion, and R14 remain excluded.

---

## 1. Book 223 vs Book 93 verification

| Check | Result |
|-------|--------|
| R13 = Search + Recommendations + Analytics/BI only | **PASS** — Book 223 §1, §3.1 |
| Split indexes (commerce, provider, content/help, clinical/PHI) | **PASS** — §5.2, §22 |
| Clinical never in public commerce index | **PASS** — §5.1, §13.4 |
| Clinical search role-gated | **PASS** — R13-G; not in public discovery |
| PHI analytics IAM | **PASS** — legal gate; §7.7, OD-ANL-01 |
| Typeahead ≠ symptom-to-drug treatment | **PASS** — §5.5 blocklist; §6.2 forbidden |
| Depends R1 catalog, R11 content, R9 for PHI | **PASS** — §2, §22 prerequisites |
| R10-E/F excluded | **PASS** — §0, §3.3, §21 |
| Caregiver proxy excluded | **PASS** — OD-CRM-01 |
| Live PSP/payout excluded | **PASS** — R14 |
| Clinical automation / auto-refill excluded | **PASS** — §0, §3.3 |
| ML excluded unless separate authorization | **PASS** — OD-CRM-07; rules v1 only |
| External vendor gated (OD-R13-01) | **PASS** — Postgres v1 default; not assumed |
| No unrelated platform rewrites | **PASS** — extend kernels |

**Scope alignment:** **PASS** — Book 223 matches Book 93 authorized domains without unauthorized creep.

---

## 2. Book 223 vs repository verification

### 2.1 Search infrastructure

| Book 223 claim | Audit | Evidence |
|----------------|-------|----------|
| `CatalogSearchDocument` COMPLETE | **CONFIRMED** | `schema.prisma` L1398; migrations `20260826200000`, `20260826220000` |
| `CatalogSearchService` COMPLETE | **CONFIRMED** | `apps/api/src/catalog/search.service.ts` |
| `GET /catalog/search` COMPLETE | **CONFIRMED** | `catalog/customer.controller.ts` |
| `GET /catalog/items` browse COMPLETE | **CONFIRMED** | `catalog.service.ts`; web `store-api.ts` `fetchCatalog` |
| web-customer uses browse not index | **CONFIRMED** | `store-home.tsx` → `fetchCatalog` → `/catalog/items` |
| `searchCatalog()` unused | **PARTIAL** — web unused; **mobile uses it** | `store-api.ts` L36 (dead in web); `mobile/commerce-api.ts` L47 + `app-root.tsx` |
| `CmsContentSearchDocument` COMPLETE | **CONFIRMED** | `schema.prisma` L5110; migration `20260829190100` |
| `CmsSearchService` COMPLETE | **CONFIRMED** | `apps/api/src/cms/cms-search.service.ts` |
| `GET /help/search` + UI COMPLETE | **CONFIRMED** | `help-center.controller.ts`; `web-customer` help search pages |
| Async indexing MISSING | **CONFIRMED** | Inline reindex in `catalog.service.ts`, `cms-content.service.ts` only |
| Outbox search consumer MISSING | **CONFIRMED** | No `apps/api/src/search/`; no `evt.search` handler |
| Inventory reindex MISSING | **CONFIRMED** | No inventory→search hook in codebase |
| Unified discovery MISSING | **CONFIRMED** | No `/discovery/search` |
| Provider indexes MISSING | **CONFIRMED** | No `provider_*_search_documents` models |
| External engine MISSING | **CONFIRMED** | No OpenSearch/Elasticsearch client |
| Clinical/PHI index MISSING | **CONFIRMED** | No clinical search module |

### 2.2 Recommendations / personalization

| Book 223 claim | Audit | Evidence |
|----------------|-------|----------|
| `personalization_events` COMPLETE | **CONFIRMED** | `schema.prisma` L5710; `PersonalizationService` |
| Hooks (cart, wishlist, order, review, PDP) COMPLETE | **CONFIRMED** | `cart.service.ts`, `wishlist.service.ts`, `order.service.ts`, `reviews.service.ts`, `commerce-api.ts` |
| Retention policy PARTIAL | **CONFIRMED** | `crm.personalization.retention_days` in `policy/document.ts`; no purge worker |
| Commerce recommendations MISSING | **CONFIRMED** | No `recommendations` module |
| Care-nav match REUSABLE KERNEL | **CONFIRMED** | `care-match.service.ts` — separate from commerce |
| ML OUT OF SCOPE | **CONFIRMED** | No ML code |

### 2.3 Analytics / BI

| Book 223 claim | Audit | Evidence |
|----------------|-------|----------|
| `conversion_events` PARTIAL | **CONFIRMED** | Table + `ConversionEventService`; admin API |
| Only `AFFILIATE_CLICK` auto-written | **CONFIRMED** | `affiliate-click.service.ts` L128; no `conversionEvent` in `order.service.ts` |
| `CHECKOUT_STARTED` → outbox only | **CONFIRMED** | `cart.service.ts` L418, L562 → outbox; not `conversion_events` |
| Analytics warehouse MISSING | **CONFIRMED** | No `apps/api/src/analytics/` |
| `analytics.retention_days` MISSING | **CONFIRMED** | Not in `policy/document.ts` |
| Admin analytics UI MISSING | **CONFIRMED** | No `/analytics` in `web-admin` |
| Outbox kernel REUSABLE | **CONFIRMED** | `apps/api/src/events/outbox.service.ts`, BullMQ dispatcher |

### 2.4 R12 / prior waves

| Claim | Audit |
|-------|-------|
| R12 closed (222) | **CONFIRMED** — `apps/api/src/crm/` complete; 32/32 per Book 222 |
| R12 tables RLS 20/20 | **CONFIRMED** per Book 222 (not re-run; authoritative) |
| R11 CMS/help COMPLETE | **CONFIRMED** — `apps/api/src/cms/` |
| No R13 code | **CONFIRMED** — no `search/`, `analytics/`, `recommendations/` modules |

### 2.5 Reuse classification summary

| Kernel | Classification |
|--------|----------------|
| `CatalogSearchService` | **COMPLETE** — reuse |
| `CmsSearchService` | **COMPLETE** — reuse |
| `ConversionEventService` | **PARTIAL** — reuse; hooks incomplete |
| `PersonalizationService` | **COMPLETE** — read-only consumer |
| `OutboxService` / BullMQ worker | **COMPLETE** — reuse |
| Analytics warehouse | **MISSING** — R13-E |
| Provider search | **MISSING** — R13-C |
| Recommendations engine | **MISSING** — R13-D |
| External search vendor | **DEFERRED** — OD-R13-01 |
| PHI clinical index | **DEFERRED** — R13-G legal gate |

**Discrepancies documented (not blockers):** PD-R13-01 (mobile vs web search path), PD-R13-03 (catalog search RLS gap — plan addresses in R13-A).

---

## 3. Search architecture audit

| Control | Plan | Audit |
|---------|------|-------|
| Postgres-first v1 | §5.1 | **PASS** — consistent with repo; no vendor assumed |
| Reuse catalog/CMS indexes | §5.2 | **PASS** |
| Async outbox indexing | §5.4 | **PASS** — extends existing `OutboxService` |
| Provider indexes (new tables) | §5.2, R13-C | **PASS** |
| Deterministic ranking | §5.5 | **PASS** — pack weights, stable tie-break |
| Filters/facets | §5.5 | **PASS** |
| Country/locale isolation | §5.6 | **PASS** — query mandatory filters |
| Eventually consistent (≤5 min) | §4 | **PASS** — documented |
| Stale index preferred over wrong-country | §4 | **PASS** |
| Rebuild/backfill CLI | §5.4, §15 | **PASS** |
| Failure recovery (retry/DLQ) | §11, §12 | **PASS** |
| Idempotent upsert keys | §14 | **PASS** |
| Auth boundaries | §5.6, §13 | **PASS** |
| OD-R13-01 external engine gated | §5.8 | **PASS** — not silently assumed |

**Search audit:** **PASS**

---

## 4. Recommendations audit

| Control | Audit |
|---------|-------|
| Deterministic only (rules v1) | **PASS** — §6.2 |
| Reads `personalization_events` | **PASS** — §6.4 |
| No ML | **PASS** — §6.5 |
| No symptom-to-drug | **PASS** — §6.2 forbidden list |
| No clinical inference / PHI | **PASS** — §6.1 does not consume health record |
| No autonomous clinical decisions | **PASS** |
| Commerce vs care-nav separation | **PASS** — §21 |
| Country/person scoped inputs | **PASS** — §6.3 APIs use country context; person for `/me/recommendations` |
| No duplicate personalization writer | **PASS** — read-only consumer |

**Recommendations audit:** **PASS**

---

## 5. Analytics / BI audit

| Control | Audit |
|---------|-------|
| Postgres rollups consistent with architecture | **PASS** — no external warehouse assumed v1 |
| `conversion_events` reuse correct | **PASS** — append-only; existing service |
| Missing hooks correctly identified | **PASS** — verified `order.service.ts` has no conversion writes; `cart.service.ts` outbox only |
| R13-E completes hooks — supported | **PASS** — plan lists concrete hook points; repository has `ConversionEventService.record()` ready |
| Personalization feeds analytics without PHI | **PASS** — commerce event kinds only; metadata rules |
| Retention defined | **PASS** — `analytics.retention_days` proposed; personalization purge TD-R12F-02 |
| RBAC/IAM defined | **PASS** — `analytics:read`, `analytics:export`; `analytics.enabled` gate |
| Country/org boundaries | **PASS** — rollup by `country_id` |
| Replay/backfill | **PASS** — §7.8, §15.2 `analytics:backfill` |
| Not unrestricted PHI warehouse | **PASS** — §7.4, §7.7 explicit prohibitions |

**Analytics audit:** **PASS**

---

## 6. Phase sequencing audit

| Phase | Prerequisites valid? | Depends on later phase? | Audit |
|-------|---------------------|-------------------------|-------|
| R13-A | R12 closed + plan audit | No | **PASS** |
| R13-B | R13-A | No | **PASS** |
| R13-C | R13-B | No | **PASS** |
| R13-D | R13-A; pairs need R13-E partial | No hard reverse dependency | **PASS** — §23 allows parallel start after A; co-occurrence can use order lines before full rollups |
| R13-E | R13-A workers | No | **PASS** — parallel with R13-B after A |
| R13-F | R13-E | No | **PASS** |
| R13-G | R13-A + legal | Not required for A–F | **PASS** — optional |
| R13-H | All implemented phases | No | **PASS** |

**Sequencing:** **PASS** — no phase requires a later phase for its core deliverables. R13-D/R13-E parallelization is explicitly documented.

**Note (PD-R13-02):** R13-H closure verdict vs optional R13-G deferral should be resolved in closure CR against Book 93 acceptance criteria.

---

## 7. R13-G clinical/PHI boundary audit

| Control | Audit |
|---------|-------|
| Genuinely optional/legal-gated | **PASS** — §22 R13-G note; OD-R13-04 LEGAL before IMPL |
| Not required for R13-A–F | **PASS** — no earlier phase references clinical index |
| No clinical payload in A–F | **PASS** |
| No health-data authorization weakened | **PASS** — R9 middleware required for G only |
| No public symptom-to-drug | **PASS** — §22 exclusions |
| Explicit future authorization for clinical IMPL | **PASS** |
| Book 93 authorizes planning clinical/PHI index | **PASS** — Book 93 §R13 lists clinical/PHI as separate index with R9 dependency; **IMPL is gated**, not automatic |

**R13-G classification:** **Planning scope with LEGAL gate** — not a blocker for R13-A authorization.

---

## 8. Security / RLS / privacy audit

| Control | Plan coverage | Audit |
|---------|---------------|-------|
| JWT/authentication | §13.1 | **PASS** |
| RBAC new permissions | §13.2 | **PASS** |
| Country isolation | §5.6, §13.3 | **PASS** |
| Org isolation (analytics) | §7.6 | **PASS** |
| Person isolation (clinical) | §13.3 | **PASS** |
| FORCE RLS on new tables | §8, §13.3 | **PASS** |
| Deny-by-default; no `USING(true)` | §8 | **PASS** |
| PHI classification matrix | §13.4 | **PASS** |
| Data minimization | §7.4, §13.4 | **PASS** |
| Retention/deletion | §7.5, R13-E purge | **PASS** |
| Audit events | §13.5 | **PASS** |
| Idempotency | §14 | **PASS** |
| Concurrency (version check) | §14 | **PASS** |
| Fail-safe (empty results, 403 gates) | §13.6 | **PASS** |
| R12 RLS preservation | §20 | **PASS** — new tables only |

**Security audit:** **PASS**

---

## 9. Existing-kernel reuse audit

| Kernel | Duplicate proposed? | Audit |
|--------|---------------------|-------|
| Notification/outbox | No — reuse `OutboxService` | **PASS** |
| CMS | No — reuse `CmsSearchService` | **PASS** |
| Support | No changes to ticket kernel | **PASS** |
| Commerce/cart | No duplicate cart | **PASS** |
| Affiliate liability | Analytics read only | **PASS** |
| Personalization logging | Read-only consumer | **PASS** |
| Catalog search | Extend, not replace | **PASS** |

**No duplicate kernel architecture blockers identified.**

---

## 10. API / database / UI planning audit

| Area | Plan | Repository fit | Audit |
|------|------|----------------|-------|
| `search_index_jobs` + provider tables | §8.1 | New migrations — standard pattern | **PASS** |
| `analytics_*` rollup tables | §8.2 | No conflict | **PASS** |
| `/discovery/search` | §9.1 | New routes under `api/v1` | **PASS** |
| Admin `/analytics` | §10.2 | `web-admin` exists; nav extension | **PASS** |
| Workers on BullMQ | §11 | `events/worker.service.ts` exists | **PASS** |
| `web-customer` `/search` | §10.1 | Route exists (`app/search/page.tsx`) | **PASS** |
| `web-affiliate` | Not in R13 scope | Correct — no spurious UI | **PASS** |

**Missing dependency noted:** R13-C provider projections require existing doctor/lab catalog kernels (R2/R7) — **present** in repository.

**API/DB/UI audit:** **PASS**

---

## 11. R12 preservation audit

| Control | Audit |
|---------|-------|
| R12-A…H remain closed | **PASS** — no R13 dep reopens R12 |
| No R12 feature expansion in plan | **PASS** |
| Consent/marketing suppression intact | **PASS** — §20 |
| Affiliate clinical block intact | **PASS** — not in R13 scope |
| Review moderation intact | **PASS** — optional approved-only index |
| Wishlist/loyalty boundaries | **PASS** |
| Refill hooks not duplicated | **PASS** — §20 |
| R13 does not bypass R12 kernels | **PASS** |

**R12 preservation:** **PASS**

---

## 12. Acceptance gates audit

| Gate | Per-phase tests proposed | Audit |
|------|--------------------------|-------|
| Focused e2e (`r13a`…`r13h`) | §17.1 | **PASS** |
| Auth negatives | §17.3 matrix | **PASS** |
| RLS negatives | §17.3 | **PASS** |
| Cross-country isolation | §17.3 | **PASS** |
| Idempotency/concurrency | §14, §17.3 | **PASS** |
| PHI leakage tests | §17.3 | **PASS** |
| R12 32/32 preservation | §17.2, §25 | **PASS** |
| Typecheck/build | §25 | **PASS** |
| Backfill/rebuild verification | §15, R13-A tests | **PASS** |
| Closure target `R13_GREEN_CLOSED_R14_READY_FOR_PLANNING` | §22 R13-H | **PASS** — matches Book 223; Book 93 R14 sequencing |

**Acceptance gates:** **PASS**

---

## 13. Open decisions classification

| ID | Classification | Blocker? |
|----|----------------|----------|
| **OD-R13-01** External search engine | Product + eng + infra | **NO** |
| **OD-R13-02** `pg_trgm` | Engineering | **NO** |
| **OD-R13-03** Unified discovery API shape | Product | **NO** |
| **OD-R13-04** Clinical search scope | **Legal/security gate** | **NO** for R13-A; **YES** for R13-G IMPL |
| **OD-R13-05** Export formats | Product | **NO** |
| **OD-R13-06** Co-occurrence window | Product | **NO** |
| **OD-ANL-01** Analytics vendor | Eng + product | **NO** |
| **OD-SRCH-01** Own-pharmacy boost | Product | **NO** |
| **OD-SRCH-08** Index split | Engineering | **NO** |
| **OD-CRM-07** ML recs | Product | **NO** |

---

## 14. Technical debt classification

| ID | Classification | Blocker? |
|----|----------------|----------|
| TD-R12F-02 Personalization purge | Operational — R13-E closes | **NO** |
| TD-R12F-01 Review idempotency stub | Test infra | **NO** |
| TD-R12C/D promo/affiliate gaps | Analytics under-count risk | **NO** |
| Catalog dual search path | Architecture/UX — R13-B closes | **NO** |
| Inventory index staleness | Operational — R13-A closes | **NO** |
| Conversion feed incomplete | Feed gap — R13-E closes | **NO** for R13-A |
| **PD-R13-01** Mobile vs web search path | Planning documentation | **NO** |
| **PD-R13-02** R13-G deferral vs closure verdict | Planning documentation | **NO** |
| **PD-R13-03** Catalog search RLS gap | Security debt — R13-A closes | **NO** |

**No blocker-class debt identified.**

---

## 15. Blocker classification

**No blockers identified.**

All recorded items are planning documentation, deferred legal gates (R13-G), open product decisions, or operational debt scheduled for specific R13 phases.

---

## 16. Documentation

| Artifact | Status |
|----------|--------|
| `docs/blueprint/224_POST_R13_PLAN_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

No source/schema/API/UI/test/config changes.

---

## 17. Audit verdict

### **`R13_PLAN_GREEN_R13_A_READY`**

---

## 18. Next authorization

**`CR-R13-A-IMPL-225`** — R13-A search indexing kernel + async pipeline (migrations, RLS, outbox-driven reindex worker, `search_index_jobs`, inventory invalidation, catalog RLS tighten, backfill CLI, focused `r13a` e2e only).

**HARD STOP:** Do not implement R13-B/C/D/E/F/G/H, R10-E/F, R12 expansion, or R14 without separate IMPL CRs after each phase audit green.
