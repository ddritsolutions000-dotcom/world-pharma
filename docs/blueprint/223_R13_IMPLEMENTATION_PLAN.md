# 223 — R13 Search, recommendations, analytics/BI implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R13-PLAN-223**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R13_PLAN_READY**

**Prerequisite:** R12 closed — **R12_GREEN_CLOSED_R13_READY_FOR_PLANNING** ([222](222_POST_R12_H_AUDIT.md)). R10-A/B/C/D complete and closed. R10-E/F **deferred**. R14 live money **deferred**.

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [222](222_POST_R12_H_AUDIT.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [24](24_SEARCH_ARCHITECTURE.md) · [15](15_CRM_PLATFORM.md) · [17](17_ADMIN_ERP.md) · [16](16_HEALTH_RECORD.md) · [27](27_SECURITY_ARCHITECTURE.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · [22](22_EVENT_ARCHITECTURE.md) · [35](35_OPEN_DECISIONS.md) · `packages/database/prisma/schema.prisma` · `apps/api/src/*`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R13-A/B/C/D/E/F/G/H implementation. **Do not** start R10-E/F, R12 feature expansion, R14 live-money work, caregiver proxy, clinical automation, or unrelated platform rewrites.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R13** wave so future **CR-R13-*-IMPL** work can deliver Book 93 acceptance:

> **Platform discovery + warehouse.** Separate indexes: commerce, provider, content, help, **clinical/PHI** (role-gated). Typeahead medicines ≠ symptom-to-drug “treatment”; clinical search role-gated.

…without duplicating identity/RBAC, consent, health record, CMS/help/support, notification/outbox, commerce/cart, affiliate liability, or R12 personalization/conversion feed kernels; **without** absorbing R10-E/F, caregiver proxy, live PSP/payout (R14), autonomous clinical decisions, or medication-selection automation.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R13 IMPL authorization | Requires **CR-POST-R13-PLAN-AUDIT-224** green, then **CR-R13-*-IMPL-*** |
| R10-E/F implementation | Separate deferred CR scope |
| R12 feature expansion | R12 program closed |
| R14 live PSP/payout/carriers | Go-live gate |
| Caregiver/household proxy (OD-CRM-01) | Legal gate — not v1 |
| Clinical automation, autonomous diagnosis/prescribing | Never without future CR |
| Symptom-to-drug public recommendations | Safety — explicitly forbidden |
| Clinical inference from PHI for commerce recs | Forbidden |
| Doctor/lab **public ratings** as clinical quality (OD-RATE-01) | Pack-off unless humans reopen |
| WhatsApp/SMS production adapters | Country-gated; not R13 |
| ML recommendation models / churn ML (OD-CRM-07) | Rules v1 first; ML is future OD |
| External search vendor **by default** | Book 93 authorizes split indexes, not a named vendor; **OD-R13-01** gates OpenSearch/Algolia adoption |
| Duplicate CMS, notification, support, cart, affiliate kernels | Extend existing |
| PHI analytics without IAM + legal review | **OD-ANL-01**, Book 93 legal gate |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated, fail-closed — build when IMPL-authorized |
| **LEGAL** | Human/legal gate — blocks enablement, not necessarily planning |
| **PRODUCT** | Product decision — document as OD-R13-* if unresolved |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Executive summary

R13 delivers three bounded domains authorized by Book 93:

1. **Platform/search expansion** — production-grade denormalized indexes, async indexing pipeline, unified discovery APIs, deterministic ranking/faceting, country/locale isolation, and provider discovery (commerce, content/help, doctors, labs, tests, pharmacies). **v1 defaults to Postgres index tables** (extending the proven R1/R11 pattern). External engine adoption is an **explicit decision**, not an R13-A assumption.

2. **Recommendations / personalization expansion** — **deterministic commerce recommendations only** (rules v1: co-occurrence, category affinity, wishlist/cart signals). Consumes R12 `personalization_events` as read-only input. **No ML, no symptom-to-drug, no clinical inference, no PHI access.**

3. **Analytics / BI** — operational analytics warehouse in Postgres (rollup/fact tables), completion of `conversion_events` feed hooks, admin `analytics:read` dashboards, retention/aggregation, country/org isolation. **Not** an unrestricted PHI warehouse.

**Reuse:** `CatalogSearchService`, `CmsSearchService`, `ConversionEventService`, `PersonalizationService`, outbox/worker infrastructure, R9 consent boundaries, R11 CMS publish lifecycle, R12 CRM feeds.

**Proposed sub-phases:** R13-A (indexing kernel) → R13-B (commerce/content discovery) → R13-C (provider discovery) → R13-D (deterministic recommendations) → R13-E (analytics foundation) → R13-F (admin analytics UI) → R13-G (clinical/PHI search — **legal-gated**) → R13-H (closure/regression).

**Verdict target (program closure):** **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`** (or next authorized wave per humans).

---

## 2. Current repository inventory (verified 29 Aug 2026)

Classification key: **COMPLETE** · **PARTIAL** · **MISSING** · **REUSABLE KERNEL** · **DEFERRED** · **OUT OF SCOPE**

### 2.1 Search infrastructure

| Capability | State | Evidence |
|------------|-------|----------|
| Commerce search index table | **COMPLETE** | `CatalogSearchDocument` — `schema.prisma` L1398; migration `20260826200000` |
| Commerce search service | **COMPLETE** | `apps/api/src/catalog/search.service.ts` — upsert + ILIKE query + Redis browse cache |
| Commerce search API | **COMPLETE** | `GET /api/v1/catalog/search` — `catalog/customer.controller.ts` |
| Commerce browse API (live tables) | **COMPLETE** | `GET /api/v1/catalog/items?q=` — parallel path; **customer UI uses this, not `/catalog/search`** |
| CMS/help search index | **COMPLETE** | `CmsContentSearchDocument` — R11 migration `20260829190100` |
| CMS/help search service | **COMPLETE** | `apps/api/src/cms/cms-search.service.ts` |
| Help search API + UI | **COMPLETE** | `GET /api/v1/help/search`; `web-customer` `/help/search` |
| Async indexing pipeline | **MISSING** | Reindex inline in catalog/cms publish handlers only |
| Outbox-driven search reindex | **MISSING** | No `evt.search` consumer |
| Inventory-driven reindex | **MISSING** | `inStock` stale when inventory changes without catalog mutation |
| Full-text search (tsvector/GIN/pg_trgm) | **MISSING** | All search uses Prisma `contains` → `ILIKE '%q%'` |
| Unified multi-type discovery API | **MISSING** | No cross-index customer search |
| Provider indexes (doctors/labs/pharmacies) | **MISSING** | No `DoctorSearchDocument` etc. |
| Lab/imaging browse search | **PARTIAL** | `lab-booking.service.ts`, `imaging-booking.service.ts` — live ILIKE only |
| Admin CMS/support text search | **MISSING** | List filters only |
| Admin CRM customer lookup | **COMPLETE** | `GET /admin/crm/customers?q=` — exact match, not full-text |
| External search engine | **MISSING** | Book 24 specifies OpenSearch; **not implemented** |
| Clinical/PHI search index | **MISSING** | Book 93 requires role-gated; depends R9 |

### 2.2 Recommendations / personalization

| Capability | State | Evidence |
|------------|-------|----------|
| Personalization event feed | **COMPLETE** | `personalization_events` + `PersonalizationService` |
| Personalization hooks (cart, wishlist, order, review, PDP) | **COMPLETE** | R12-F — `cart.service.ts`, `wishlist.service.ts`, `order.service.ts`, `reviews.service.ts`, `commerce-api.ts` |
| Personalization retention policy key | **PARTIAL** | `crm.personalization.retention_days` = 90; **no purge worker** (TD-R12F-02) |
| Commerce product recommendations | **MISSING** | No related-products API |
| ML recommendation engine | **OUT OF SCOPE** | OD-CRM-07 — rules v1 first |
| Care-nav doctor matching | **REUSABLE KERNEL** | `care-match.service.ts` — **R10 clinical domain; not commerce recs** |
| CRM segment rules | **REUSABLE KERNEL** | `segment-rules.ts` — marketing only |

### 2.3 Analytics / BI

| Capability | State | Evidence |
|------------|-------|----------|
| Conversion event feed | **PARTIAL** | `conversion_events` table + admin API; only `AFFILIATE_CLICK` auto-written |
| Checkout/order/booking → conversion_events | **MISSING** | `CHECKOUT_STARTED` goes to outbox only |
| Analytics warehouse tables | **MISSING** | No rollup/fact tables |
| Analytics API module | **MISSING** | No `apps/api/src/analytics/` |
| Admin analytics UI | **MISSING** | Book 17 `SHELL_ANALYST` / `analytics:read` — blueprint only |
| `analytics.retention_days` policy | **MISSING** | Book 17 — not in `policy/document.ts` |
| Security events as audit trail | **REUSABLE KERNEL** | `security_events` — operational, not BI warehouse |
| PHI analytics IAM | **MISSING** | Book 93 legal gate |

### 2.4 R12 closed kernels (must preserve)

| Kernel | State | R13 relationship |
|--------|-------|------------------|
| CRM 360 metadata-only | **COMPLETE** | R13 must not expose clinical in analytics search |
| Marketing consent/suppression | **COMPLETE** | Analytics counts must not bypass consent for outreach |
| `conversion_events` / `personalization_events` | **COMPLETE** | **Feeds** — R13 consumes read-only |
| Reviews/Q&A UGC safety | **COMPLETE** | Search may index **approved** public review snippets only if pack allows |
| Promo/affiliate (no payout) | **COMPLETE** | Analytics may report attribution; no money mutation |
| RLS on all R12 tables (20/20 FORCE) | **COMPLETE** | R13 tables must match pattern |

### 2.5 Prior wave boundaries (must not regress)

| Wave | Status | R13 constraint |
|------|--------|----------------|
| R9 consent/break-glass | **CLOSED** | PHI index requires consent-scoped queries |
| R10 care navigation | **CLOSED** | Doctor **discovery** index ≠ care-nav match engine |
| R11 CMS/Help/Support | **CLOSED** | Reuse `CmsSearchService`; no second CMS |
| R12 CRM/marketing | **CLOSED** | No R12 feature expansion |

---

## 3. Canonical R13 scope (Book 93)

### 3.1 IN SCOPE

| Domain | R13 delivers |
|--------|--------------|
| **Search** | Production indexes for commerce, content/help, providers; async indexing; unified discovery API; deterministic ranking; facets/filters; country/locale isolation; rebuild/backfill |
| **Recommendations** | Deterministic commerce recommendations (related products, recently viewed, category affinity); consumes `personalization_events` |
| **Analytics/BI** | Event feed completion; rollup tables; admin dashboards; retention; country/org RBAC; auditability |

### 3.2 DEFERRED (post-R13 or separate CR)

| Item | Wave / reason |
|------|----------------|
| ML/churn models | OD-CRM-07 — after rules v1 + legal |
| External search vendor production cutover | OD-R13-01 — requires infra + residency decision |
| Real-time streaming warehouse (Kafka as SoT) | Book 93 forbids Kafka as SoT |
| Public symptom-to-drug search | Safety — never without clinical CR |
| Doctor/lab ratings as quality signals | OD-RATE-01 |
| Affiliate mobile | DEFERRED per Book 93 |
| Live PSP/payout analytics | R14 |

### 3.3 EXPLICIT EXCLUSIONS (must not enter R13)

| Exclusion | Reason |
|-----------|--------|
| R10-E/F | Deferred care-nav expansion |
| Caregiver/household proxy | OD-CRM-01 legal |
| Live PSP/payout/settlement | R14 |
| Prescription modification / auto-refill | R5-E clinical; OD-RX-REFILL |
| Clinical automation / autonomous decisions | Safety |
| Medication-selection automation | Safety |
| WhatsApp/SMS production vendors | Country/legal |
| Duplicate notification/CMS/support kernels | Architecture |
| Commerce recs from PHI/health record | Privacy |
| Unrestricted clinical paste in analytics | OD-ANL-01 |

### 3.4 Book 93 acceptance criteria (must pass R13-H)

| Criterion | R13 implementation target |
|-----------|---------------------------|
| Typeahead medicines ≠ symptom-to-drug treatment | Blocklist + no symptom→drug synonym layer |
| Clinical never in public commerce index | Separate indexes; PHI index role-gated |
| Clinical search role-gated | R13-G sub-phase with R9 IAM |
| PHI analytics IAM | Legal review + scoped roles before PHI aggregates |
| Country isolation | All indexes/queries filter `country_id` |
| Split indexes | commerce, provider, content/help, clinical/PHI (separate tables/namespaces) |

---

## 4. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Customer / Admin apps                            │
│  web-customer discovery · help search · admin analytics shell            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│ apps/api/src/search/          apps/api/src/recommendations/              │
│   indexing workers            apps/api/src/analytics/                    │
│   discovery query services    (new bounded contexts)                     │
└───────┬─────────────────┬──────────────────┬────────────────────────────┘
        │                 │                  │
        ▼                 ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────────────────────┐
│ Index tables  │ │ personalization│ │ analytics_* rollup/fact tables    │
│ (Postgres v1) │ │ _events (read) │ │ conversion_events (read)          │
│ commerce      │ │ wishlist/cart  │ │ security_events (audit cross-ref) │
│ content/help  │ │ catalog        │ │                                   │
│ provider      │ └───────────────┘ └───────────────────────────────────┘
│ clinical*     │         * R13-G legal-gated
└───────┬───────┘
        │ invalidate + fetch-by-id (Book 24 §6, OD-SRCH-09)
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Domain kernels (REUSE — do not duplicate)                              │
│ catalog · cms · care/doctor · lab · inventory · outbox · policy · R9   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Indexing consistency model (v1):** **Eventually consistent** — target lag **≤ 5 minutes** for availability/price (OD-SRCH-10). Publish path may remain synchronous for CMS/catalog; inventory/slot updates via async worker.

**Failure behavior:** Search queries **fail open to empty results** with logged error — never leak cross-country rows. Indexing failures **retry with dead-letter**; stale index preferred over wrong-country document.

---

## 5. Search architecture

### 5.1 Design principles

1. **Postgres-first v1** — extend `CatalogSearchDocument` / `CmsContentSearchDocument` pattern. Proven RLS, no new infra dependency.
2. **Split logical indexes** — separate tables per Book 93: `commerce`, `content_help`, `provider_*` — not one flat PHI-capable table.
3. **No clinical payload in public indexes** — ever.
4. **Re-validate at PDP/cart** — indexed price/availability are hints (Book 24 §5.5).
5. **Country + locale mandatory** on every query and document.
6. **Deterministic ranking** — pack-configurable weights stored in policy document, not magic constants.
7. **External engine** — **OD-R13-01** only; adapter interface may be designed in R13-A but vendor not required for green closure.

### 5.2 Index inventory (target state)

| Logical index | Postgres table (proposed) | Source kernel | Auth boundary |
|---------------|---------------------------|---------------|---------------|
| Commerce products | `catalog_search_documents` (extend) | catalog + inventory + pricing | Public published + country |
| Content/help | `cms_content_search_documents` (existing) | CMS publish | Public published + country |
| Doctors | `provider_doctor_search_documents` (new) | doctor profile + slots (metadata) | Public published + country |
| Labs | `provider_lab_search_documents` (new) | lab org/location | Public published + country |
| Tests/packages | `provider_test_search_documents` (new) | lab catalog | Public published + country |
| Pharmacies | `provider_pharmacy_search_documents` (new) | store/vendor locations | Public published + country |
| Clinical/PHI | `clinical_search_documents` (new, R13-G) | health record metadata | **R9 consent + clinical role only** |

### 5.3 Index document fields (commerce — extend existing)

Existing fields preserved. **Add (R13-B):**

| Field | Purpose |
|-------|---------|
| `item_kind` | MEDICINE/OTC/DEVICE/OTHER filter |
| `category_ids[]` or denormalized slugs | Facet |
| `rx_required` | Filter/badge |
| `price_minor_min` / `currency` | Sort/filter snapshot |
| `availability_status` | IN_STOCK / OUT_OF_STOCK / LOW_STOCK |
| `search_rank_boost` | Pack-derived own-pharmacy boost (OD-SRCH-01) |
| `version` | Idempotent upsert / stale write detection |

**Do not add:** prescription text, patient notes, diagnosis tokens, lab analytes.

### 5.4 Indexing / update pipeline

| Trigger | Mechanism | Phase |
|---------|-----------|-------|
| Catalog item publish/offer change | Existing inline + **outbox `SEARCH_INDEX_INVALIDATE`** | R13-A |
| Inventory availability change | Outbox → worker reindex | R13-A |
| CMS publish/archive | Existing + outbox for retry | R13-A |
| Doctor profile publish | Outbox → worker | R13-C |
| Lab/test publish | Outbox → worker | R13-C |
| Slot capacity hint | Scheduled worker (low frequency) | R13-C |

**Worker:** Reuse BullMQ/outbox dispatcher pattern (`apps/api/src/events/`). New queue `evt.search.index` — **fetch-by-id** projection from owning service (OD-SRCH-09).

**Backfill:** Admin/worker command `search:reindex --index=commerce --country=XX` — idempotent upsert per document key.

**Rebuild:** Truncate index partition per country+locale (or soft `published=false` sweep) then backfill — never cross-country.

### 5.5 Query / ranking / faceting

| Feature | v1 implementation |
|---------|-------------------|
| Text match | Postgres `ILIKE` + **optional `pg_trgm` GIN** (OD-R13-02) for typo tolerance — no external vendor |
| Ranking | Weighted score: text match > in-stock > own-pharmacy boost > price tie-break > `id ASC` |
| Facets | Filter params: category, brand, rx_required, price range, availability |
| Typeahead | `q` min length 2; limit 10; multi-index union in application layer |
| Unified discovery | `GET /api/v1/discovery/search?q=&types[]=commerce&types[]=help` |
| Blocklist | Pack `search.blocklist_terms` — reject query server-side |

**Explicit exclusion:** Symptom→drug synonym maps, “treatment” suggestions, clinical advice in suggester.

### 5.6 Country / locale / authorization

| Surface | Auth | Isolation |
|---------|------|-----------|
| Customer discovery | Optional auth (personalization rank only when logged in) | `country_id` from request context; `locale` param |
| Help search | Public | `CmsSearchService` RLS — published + `can_country` |
| Clinical index | **Authenticated clinical roles + R9 consent** | Person-scoped; never in public discovery union |
| Admin reindex | `search:admin` or `platform:write` | Platform actor only |

### 5.7 Migration from current state

| Gap | R13 action |
|-----|------------|
| Customer store uses `/catalog/items` not `/catalog/search` | R13-B align UI to discovery API or unify backend |
| `searchCatalog()` unused in web-customer | Wire or remove in IMPL |
| Inventory stale | R13-A inventory invalidation |
| No provider indexes | R13-C new tables + projections |
| Catalog search RLS not country-scoped | R13-A tighten RLS to `can_country(country_id)` for SELECT |

### 5.8 External vendor decision (OD-R13-01)

Book 24 assumes OpenSearch; Book 35 OD-SRCH-02 lists OpenSearch. **Book 93 does not mandate a vendor name.** R13 v1 ships on Postgres. Adapter interface (`SearchIndexPort`) may be introduced so a future CR can plug OpenSearch **without** rewriting domain projections. **No Elasticsearch/OpenSearch cluster is in scope for R13-A…F.**

---

## 6. Recommendation architecture

### 6.1 Bounded context

**Owner:** `apps/api/src/recommendations/` (new)  
**Consumes:** `personalization_events`, `catalog_search_documents`, `wishlist_items`, order line history (aggregated, non-clinical)  
**Does not consume:** health record, prescriptions, lab results, care-nav sessions, CRM 360 clinical slices

### 6.2 Recommendation types (v1 — deterministic only)

| Type | Rule | Signals |
|------|------|---------|
| Related products | Same category + in-stock; exclude current SKU | `catalog_item_id`, category |
| Recently viewed | Last N `PRODUCT_VIEWED` for person | `personalization_events` |
| Frequently bought together | Co-occurrence in paid order lines (country-scoped rollup) | `analytics_order_item_pairs` (new rollup) |
| Wishlist adjacent | Same category as wishlist items | `wishlist_items` |

**Explicitly forbidden:**

- Symptom-to-drug recommendations
- “Patients like you also took…”
- Refill suggestions (R12-G marketing hooks own that domain)
- Doctor/lab recommendations in commerce carousel
- ML model inference

### 6.3 API surfaces

| Endpoint | Auth | Response |
|----------|------|----------|
| `GET /api/v1/catalog/items/:id/recommendations` | Optional | Related products (public catalog metadata) |
| `GET /api/v1/me/recommendations/home` | Customer | Recently viewed + wishlist-adjacent |

### 6.4 Personalization event relationship

| Layer | Role |
|-------|------|
| R12 `personalization_events` | **Append-only feed** — R13 reads |
| R13 recommendation engine | **Consumer** — computes deterministic sets |
| R13 does not write back to personalization | No feedback loop in v1 |

### 6.5 Future ML boundary

ML infrastructure (feature store, model registry, batch scoring) is **OUT OF SCOPE** for R13. Document extension point: `RecommendationStrategy` interface with `RulesV1Strategy` only implementation.

---

## 7. Analytics / BI architecture

### 7.1 Bounded context

**Owner:** `apps/api/src/analytics/` (new)  
**Storage:** Postgres rollup/fact tables (not external warehouse v1)  
**Principle:** Analytics is a **read model** over operational feeds — not a bypass around RLS for PHI.

### 7.2 Event / feed architecture

```
Sources                          Ingestion                     Serving
─────────────────────────────────────────────────────────────────────────
conversion_events (R12)    ──►  analytics_ingest worker  ──►  daily rollups
personalization_events     ──►  (batch, idempotent)      ──►  admin APIs
order_paid / booking_*     ──►                            ──►  dashboards
affiliate_clicks           ──►
security_events (metadata) ──►  audit cross-reference only
outbox domain events       ──►  bridge hooks (R13-E)
```

### 7.3 Conversion event completion (R13-E)

Hook existing commerce/care flows to `ConversionEventService.record()`:

| Event kind | Source hook |
|------------|-------------|
| `ORDER_PAID` | `order.service.ts` on payment capture |
| `CHECKOUT_STARTED` | `cart.service.ts` (parallel to outbox, not replacement) |
| `BOOKING_COMPLETED` | appointment completion |
| `LAB_BOOKING_COMPLETED` | lab booking |
| `IMAGING_BOOKING_COMPLETED` | imaging booking |
| `APPOINTMENT_COMPLETED` | care module |
| `CART_ABANDONED` | scheduled job on stale carts |
| `AFFILIATE_CLICK` | **already wired** |

**Metadata rules:** Same as R12 — `assertNoClinicalMetadata()`; opaque IDs only.

### 7.4 Analytical tables (proposed)

| Table | Purpose | PHI |
|-------|---------|-----|
| `analytics_daily_country_metrics` | Orders, GMV, bookings, conversion counts | **No** |
| `analytics_daily_product_metrics` | Views, add-to-cart, purchases per SKU | **No** |
| `analytics_daily_marketing_metrics` | Campaign sends, opt-ins (from R12 tables) | **No** |
| `analytics_order_item_pairs` | Co-occurrence for recs | **No** — SKU IDs only |
| `analytics_ingest_cursors` | Idempotent ingestion watermark | **No** |

**No table** stores: diagnosis, lab values, prescription text, ticket body, chat content.

### 7.5 Aggregation / retention

| Policy key (proposed) | Default | Scope |
|-----------------------|---------|-------|
| `analytics.enabled` | `false` | Country pack |
| `analytics.retention_days` | `365` | Rollup retention (Book 17) |
| `crm.personalization.retention_days` | `90` (existing) | Raw personalization events purge |

**Workers:** Nightly rollup job; weekly purge for expired personalization events (closes TD-R12F-02).

### 7.6 RBAC / IAM

| Permission | Role | Access |
|------------|------|--------|
| `analytics:read` | `SHELL_ANALYST`, company admin | Country-scoped dashboards |
| `analytics:export` | Restricted | CSV export — audit logged |
| `analytics:phi` | **NOT IN R13-E/F** | Requires R13-G + legal — separate permission |

**Fail closed:** `analytics.enabled=false` → 403 on all analytics APIs.

### 7.7 PHI handling

| Data class | R13 analytics |
|------------|---------------|
| Commerce aggregates | **Allowed** |
| Marketing aggregates | **Allowed** |
| Support ticket text | **Forbidden** |
| Health record metadata counts | **R13-G only** with consent audit |
| Patient-identifiable analytics | **Forbidden** without legal IAM design |

### 7.8 Auditability

Emit `ANALYTICS_QUERY` security events for admin dashboard loads and exports (metadata: `dashboard_id`, `country_id`, row counts — no result payload).

---

## 8. Database plan (proposed — no migrations in this CR)

**Global RLS requirements for all new tables:**

- `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
- Deny-by-default policies — **no `USING(true)`**
- `worldpharma_app` remains `NOSUPERUSER` + `NOBYPASSRLS`
- Country scope via `app.can_country(country_id)`; person scope where applicable

### 8.1 Search index extensions

| Table | Action | Phase |
|-------|--------|-------|
| `catalog_search_documents` | Add columns + tighten RLS | R13-A/B |
| `cms_content_search_documents` | No schema change expected | — |
| `provider_doctor_search_documents` | New | R13-C |
| `provider_lab_search_documents` | New | R13-C |
| `provider_test_search_documents` | New | R13-C |
| `provider_pharmacy_search_documents` | New | R13-C |
| `clinical_search_documents` | New (metadata only) | R13-G |
| `search_index_jobs` | New — append-only job log | R13-A |

### 8.2 Analytics tables

| Table | Phase |
|-------|-------|
| `analytics_daily_country_metrics` | R13-E |
| `analytics_daily_product_metrics` | R13-E |
| `analytics_daily_marketing_metrics` | R13-E |
| `analytics_order_item_pairs` | R13-E |
| `analytics_ingest_cursors` | R13-E |

### 8.3 Recommendations (optional materialized)

| Table | Phase |
|-------|-------|
| `recommendation_cooccurrence` | R13-D — or compute from `analytics_order_item_pairs` |

---

## 9. API inventory (target)

### 9.1 New public/customer APIs

| Method | Path | Phase | Purpose |
|--------|------|-------|---------|
| GET | `/api/v1/discovery/search` | R13-B | Unified discovery |
| GET | `/api/v1/discovery/suggest` | R13-B | Typeahead |
| GET | `/api/v1/catalog/items/:id/recommendations` | R13-D | Related products |
| GET | `/api/v1/me/recommendations` | R13-D | Personalized lists |

### 9.2 Existing APIs (modify behavior only)

| Path | Change |
|------|--------|
| `/api/v1/catalog/search` | Delegate to discovery kernel or deprecate with alias |
| `/api/v1/catalog/items` | Browse remains; clarify vs search index |
| `/api/v1/help/search` | Unchanged — included in discovery union |

### 9.3 Admin APIs

| Method | Path | Phase | Permission |
|--------|------|-------|------------|
| POST | `/api/v1/admin/search/reindex` | R13-A | `search:admin` |
| GET | `/api/v1/admin/search/jobs` | R13-A | `search:admin` |
| GET | `/api/v1/admin/analytics/overview` | R13-F | `analytics:read` |
| GET | `/api/v1/admin/analytics/commerce` | R13-F | `analytics:read` |
| GET | `/api/v1/admin/analytics/marketing` | R13-F | `analytics:read` |
| GET | `/api/v1/admin/analytics/export` | R13-F | `analytics:export` |

### 9.4 Clinical search APIs (R13-G — gated)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/clinical/search` | Clinical role + R9 consent scope |

**Not in public discovery union.**

---

## 10. UI inventory (target)

### 10.1 web-customer

| Surface | Phase | Change |
|---------|-------|--------|
| `/search` store home | R13-B | Use discovery API; facets |
| Global search entry (if added) | R13-B | Multi-type results with discriminators |
| PDP related products | R13-D | Carousel from recommendations API |
| Help search | — | **No change** (already on index) |

### 10.2 web-admin

| Surface | Phase | Change |
|---------|-------|--------|
| `/analytics` shell | R13-F | KPI dashboards — `SHELL_ANALYST` |
| `/analytics/commerce` | R13-F | Product funnel |
| `/analytics/marketing` | R13-F | Campaign metrics (from R12) |
| Search reindex tools | R13-A | Platform ops — hidden behind `search:admin` |
| CMS list text search | R13-B optional | Deterministic title search |

### 10.3 mobile

| Surface | Phase | Change |
|---------|-------|--------|
| Store search | R13-B | Parity with web discovery |
| PDP recommendations | R13-D | Optional defer — document as TD-R13-* |

---

## 11. Worker / job plan

| Job | Queue | Trigger | Phase |
|-----|-------|---------|-------|
| `SearchIndexWorker` | `evt.search.index` | Outbox invalidate | R13-A |
| `SearchBackfillCommand` | CLI/cron | Manual/country | R13-A |
| `AnalyticsRollupWorker` | `evt.analytics.rollup` | Nightly cron | R13-E |
| `PersonalizationPurgeWorker` | `evt.crm.purge` | Daily | R13-E (TD-R12F-02) |
| `CooccurrenceRebuildWorker` | `evt.recommendations.rebuild` | Weekly | R13-D |
| `ConversionEventBridge` | inline + outbox | Domain events | R13-E |

**Reuse:** `OutboxService`, existing dispatcher — **no second job kernel**.

---

## 12. State machines

| Entity | States | Notes |
|--------|--------|-------|
| `search_index_jobs` | `PENDING` → `RUNNING` → `SUCCEEDED` \| `FAILED` | Retry with backoff |
| Search document | `published` boolean | Soft unpublish vs delete |
| Analytics rollup cursor | watermark timestamp | Idempotent advance |
| Recommendations | Stateless | Computed on read + optional cache |

**No new transactional state machines** for orders, prescriptions, or payments.

---

## 13. Security / RLS / PHI model

### 13.1 Authentication

All admin routes: existing JWT + membership middleware.  
Customer discovery: public with country context.  
Clinical search: R9 consent middleware + clinical role.

### 13.2 RBAC (new permissions)

| Permission | Purpose |
|------------|---------|
| `search:read` | Customer discovery (implicit public) |
| `search:admin` | Reindex, job visibility |
| `analytics:read` | Dashboard access |
| `analytics:export` | CSV export |
| `clinical:search` | R13-G only |

### 13.3 RLS pattern per index table

| Table class | SELECT policy |
|-------------|---------------|
| Public commerce/provider | `published = true AND app.can_country(country_id)` OR worker/platform |
| Content/help | Existing R11 pattern |
| Clinical | `app.can_person(person_id)` AND clinical role AND consent predicate |
| Analytics rollups | `app.can_country(country_id)` AND (`analytics:read` via app layer) |
| Ingest cursors | Worker/platform only |

### 13.4 PHI classification

| Field class | Public index | Analytics | Clinical index |
|-------------|--------------|-----------|----------------|
| Product title/SKU | ✅ | ✅ | ❌ |
| Doctor display name | ✅ | ✅ | ❌ |
| Order counts | ❌ | ✅ aggregated | ❌ |
| Diagnosis/lab/Rx text | ❌ | ❌ | Metadata tags only |
| Person health timeline | ❌ | ❌ | R9-gated |

### 13.5 Audit events (new)

| Event | When |
|-------|------|
| `SEARCH_REINDEX_REQUESTED` | Admin reindex |
| `SEARCH_QUERY_BLOCKED` | Blocklist hit |
| `ANALYTICS_DASHBOARD_VIEWED` | Admin analytics load |
| `ANALYTICS_EXPORT` | CSV export |
| `CLINICAL_SEARCH_QUERY` | R13-G query (no payload) |

### 13.6 Failure / denial behavior

| Scenario | Behavior |
|----------|----------|
| Unknown country | 400 |
| `analytics.enabled=false` | 403 |
| Blocklisted query | 400 empty + audit |
| Cross-country index row | RLS denies — never returned |
| Indexer source fetch denied | Skip document + log; do not partial-index PHI |
| Clinical search without consent | 403 |

---

## 14. Idempotency / concurrency

| Operation | Key |
|-----------|-----|
| Index upsert | `(source_type, source_id, country_id, locale)` |
| Outbox invalidate | Existing outbox idempotency |
| Conversion event | `(source, source_key, event_kind)` — existing |
| Analytics rollup | `(country_id, metric_date, metric_kind)` |
| Cooccurrence pair | `(country_id, item_a_id, item_b_id)` ordered canonical |

**Concurrency:** Index upserts use `ON CONFLICT DO UPDATE` with `version` check; stale writes discarded.

---

## 15. Migration / backfill strategy

### 15.1 Phase order

1. **R13-A:** Deploy workers + job table; backfill commerce + CMS indexes; add inventory listeners — **no customer API change required**
2. **R13-B:** Ship discovery API; migrate web-customer search — feature flag `search.discovery.enabled`
3. **R13-C:** Provider indexes backfill from doctor/lab catalogs
4. **R13-D/E:** Analytics + recs — may run parallel after R13-A
5. **R13-G:** Clinical index — **only after legal sign-off**

### 15.2 Backfill commands

```
search:reindex --index=commerce --country=XX --locale=en
search:reindex --index=content --country=XX
search:reindex --index=providers --country=XX
analytics:backfill --from=2026-01-01 --country=XX
```

### 15.3 Zero-downtime

Dual-read period: old `/catalog/items` and new `/discovery/search` both valid during R13-B; UI cutover behind pack flag.

---

## 16. Observability

| Signal | Implementation |
|--------|----------------|
| Index lag | Gauge: `search_index_lag_seconds{index,country}` |
| Query latency | Histogram on discovery endpoints |
| Blocklist hits | Counter |
| Analytics rollup duration | Worker timing |
| Failed index jobs | `search_index_jobs` FAILED count alert |

**Reuse:** existing OpenTelemetry hooks in API bootstrap — no new observability kernel.

---

## 17. Test / acceptance gates

### 17.1 Per-phase e2e suites (proposed)

| Suite | Phase | Cases |
|-------|-------|-------|
| `r13a.search-indexing.e2e` | R13-A | publish→index; inventory invalidate; reindex idempotent; RLS |
| `r13b.discovery.e2e` | R13-B | unified search; country isolation; blocklist; facets |
| `r13c.provider-search.e2e` | R13-C | doctor/lab search; no PHI fields |
| `r13d.recommendations.e2e` | R13-D | related products; no clinical tokens; deterministic |
| `r13e.analytics.e2e` | R13-E | rollup; conversion hooks; retention purge |
| `r13f.analytics-admin.e2e` | R13-F | RBAC; export audit; enabled gate |
| `r13g.clinical-search.e2e` | R13-G | consent denied 403; role gate |
| `r13h.closure` | R13-H | combined regression |

### 17.2 R12 preservation tests

Every R13 IMPL CR must run **R12 32/32** + targeted R11/R9/R10 smoke.

### 17.3 Security matrix (R13-H)

| Test | Expect |
|------|--------|
| Commerce index contains no Rx text | PASS |
| Symptom query returns no drug "treatment" | PASS |
| Cross-country discovery | Empty/denied |
| Analytics API without role | 403 |
| PHI in analytics response | Absent |
| Personalization purge | Rows older than retention deleted |

### 17.4 Closure target

**`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`** — after CR-POST-R13-H-AUDIT-*.

---

## 18. Open decisions

| ID | Question | Recommendation | Gate |
|----|----------|----------------|------|
| **OD-R13-01** | External search engine (OpenSearch per Book 24) vs Postgres-only | Postgres v1; adapter for future | eng + infra |
| **OD-R13-02** | `pg_trgm` for typo tolerance | Add in R13-B if ILIKE insufficient | eng |
| **OD-R13-03** | Unified `discovery` API vs separate endpoints | Unified with `types[]` filter | product |
| **OD-R13-04** | Clinical search index scope (metadata fields) | Plan R13-G; **LEGAL before IMPL** | legal + clinical |
| **OD-R13-05** | Analytics export formats | CSV v1 only | product |
| **OD-R13-06** | Co-occurrence pair window | 90-day rolling | product |
| **OD-ANL-01** | Product analytics vendor | Postgres warehouse v1; vendor deferred | eng + product |
| **OD-SRCH-01** | Own-pharmacy boost | Pack `search.rank.own_pharmacy_boost` | product |
| **OD-SRCH-08** | One vs five indexes | **Five Postgres tables** (matches Book 24 intent) | eng |
| **OD-CRM-07** | ML churn/recs | Rules v1 in R13-D; ML deferred | product |

**Do not silently resolve** OD-R13-04 (clinical) or OD-R13-01 (external engine).

---

## 19. Technical debt (R12 → R13 impact)

| ID | Item | R13 impact | Blocker? |
|----|------|------------|----------|
| TD-R12F-02 | Personalization purge worker missing | **R13-E closes** | **NO** |
| TD-R12F-01 | Review idempotency stub | None for R13 | NO |
| TD-R12G-01 | Ephemeral automation skips | None | NO |
| TD-R12C-01…05 | Promo gaps | Analytics may under-count redemptions | NO |
| TD-R12D-04 | Commission preview zero | Affiliate analytics partial | NO |
| Catalog dual search path | Customer UI uses browse not index | **R13-B closes** | **NO** — UX consistency |
| Inventory index staleness | **R13-A closes** | **NO** |
| Conversion feed incomplete | **R13-E closes** | **NO** for R13-A/B |
| CRM 360 doesn't read conversion_events | Optional R13 admin analytics slice | NO |

**No blocker-class debt prevents R13 plan audit.**

---

## 20. R12 preservation

| R12 kernel | R13 rule |
|------------|----------|
| `personalization_events` | Append-only; R13 reads; purge via retention worker |
| `conversion_events` | Append-only; R13 completes hooks + ingests |
| CRM 360 | Analytics must not add clinical fields to 360 |
| Marketing consent | Analytics counts ≠ send permission |
| Reviews/Q&A | Only **approved** public text indexable if pack enables |
| Refill automation | Not duplicated in recommendations |
| RLS on 20 R12 tables | Untouched — R13 adds new tables only |

---

## 21. R10 / R13 boundaries

| Concern | Owner |
|---------|-------|
| Care-nav doctor **matching** | R10 `care-match.service.ts` — clinical |
| Doctor **discovery** search | R13-C — public metadata |
| Care-nav recommendations API | R10 — not commerce |
| Triage/symptom routing | R10 — never R13 search suggester |
| R10-E/F household/caregiver | **DEFERRED** — not R13 |

---

## 22. Proposed R13 sub-phases

### R13-A — Search indexing kernel + async pipeline

| Attribute | Detail |
|-----------|--------|
| **Scope** | `search` module; outbox invalidation; `SearchIndexWorker`; `search_index_jobs`; inventory reindex; catalog RLS tighten; backfill CLI |
| **Prerequisites** | R12 closed; plan audit green |
| **DB** | `search_index_jobs`; extend `catalog_search_documents` |
| **API** | `POST /admin/search/reindex`, `GET /admin/search/jobs` |
| **UI** | Admin ops page (minimal) |
| **Security** | FORCE RLS; `search:admin` |
| **Tests** | `r13a.search-indexing.e2e` |
| **Exclusions** | External vendor; customer discovery API; provider indexes |

### R13-B — Commerce + content discovery API + customer UI

| Attribute | Detail |
|-----------|--------|
| **Scope** | `DiscoverySearchService`; unified `/discovery/search` + `/suggest`; facets/ranking; web-customer `/search` alignment |
| **Prerequisites** | R13-A |
| **DB** | Optional `pg_trgm` indexes |
| **API** | Public discovery endpoints |
| **UI** | web-customer search; mobile parity |
| **Security** | Blocklist; country isolation; no PHI |
| **Tests** | `r13b.discovery.e2e` |
| **Exclusions** | Provider indexes; recommendations; analytics |

### R13-C — Provider discovery indexes

| Attribute | Detail |
|-----------|--------|
| **Scope** | Doctor, lab, test, pharmacy index tables + projections + discovery union |
| **Prerequisites** | R13-B |
| **DB** | `provider_*_search_documents` (4 tables) |
| **API** | Extend discovery `types[]=doctor|lab|test|pharmacy` |
| **UI** | Customer care/commerce discovery chips |
| **Security** | Public metadata only; no KYC/license images |
| **Tests** | `r13c.provider-search.e2e` |
| **Exclusions** | Clinical search; ratings as quality |

### R13-D — Deterministic commerce recommendations

| Attribute | Detail |
|-----------|--------|
| **Scope** | `recommendations` module; related products; recently viewed; co-occurrence |
| **Prerequisites** | R13-A; personalization feed |
| **DB** | `analytics_order_item_pairs` or `recommendation_cooccurrence` |
| **API** | `/catalog/items/:id/recommendations`, `/me/recommendations` |
| **UI** | PDP carousel; optional home |
| **Security** | No PHI signals; no symptom rules |
| **Tests** | `r13d.recommendations.e2e` |
| **Exclusions** | ML; clinical recs; refill reminders |

### R13-E — Analytics foundation + feed completion

| Attribute | Detail |
|-----------|--------|
| **Scope** | `analytics` module; rollup tables; ingest worker; conversion hooks; personalization purge |
| **Prerequisites** | R13-A (workers) |
| **DB** | `analytics_*` tables; `analytics_ingest_cursors` |
| **API** | Internal + `GET /admin/analytics/*` (read APIs may start here) |
| **UI** | None (API only) |
| **Security** | `analytics.enabled`; country RLS; no PHI columns |
| **Tests** | `r13e.analytics.e2e` |
| **Exclusions** | Dashboards; PHI; external warehouse |

### R13-F — Admin analytics BI shell

| Attribute | Detail |
|-----------|--------|
| **Scope** | web-admin `/analytics` shell; KPI dashboards; export |
| **Prerequisites** | R13-E |
| **DB** | None |
| **API** | Consume R13-E read APIs |
| **UI** | `SHELL_ANALYST` nav; commerce + marketing views |
| **Security** | `analytics:read`, `analytics:export`; audit events |
| **Tests** | `r13f.analytics-admin.e2e` |
| **Exclusions** | PHI dashboards; real-time streaming |

### R13-G — Clinical/PHI search (legal-gated)

| Attribute | Detail |
|-----------|--------|
| **Scope** | `clinical_search_documents`; R9-consent-scoped search API |
| **Prerequisites** | R13-A; **LEGAL sign-off OD-R13-04**; R9 IAM |
| **DB** | `clinical_search_documents` |
| **API** | `GET /clinical/search` — **not** in public discovery |
| **UI** | Doctor/clinical apps only — not customer super-app |
| **Security** | `clinical:search`; consent predicate; audit every query |
| **Tests** | `r13g.clinical-search.e2e` |
| **Exclusions** | Public typeahead; symptom-to-drug; autonomous clinical use |

**Note:** R13 program may reach **R13-F closure** for commerce analytics if humans defer R13-G. Document as **OPTIONAL SUB-PHASE** with explicit authorization.

### R13-H — Closure / regression

| Attribute | Detail |
|-----------|--------|
| **Scope** | Combined `r13*.e2e`; R12 32/32; R11/R9/R10 smoke; typecheck/build; debt doc |
| **Verdict target** | **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`** |

---

## 23. Dependency graph

```
R12 CLOSED (222)
       │
       ▼
CR-POST-R13-PLAN-AUDIT-224
       │
       ▼
R13-A (indexing kernel)
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
R13-B (discovery)  R13-E (analytics)  (parallel after A)
       │              │
       ▼              ▼
R13-C (providers)  R13-F (admin UI)
       │
       ▼
R13-D (recommendations) — may start after R13-A + partial R13-E for pairs
       │
       ▼
R13-G (clinical — OPTIONAL / legal-gated)
       │
       ▼
R13-H (closure)
```

---

## 24. Production boundaries (R13)

**Remain OFF:**

- Live PSP, payouts, carriers (**R14**)
- Production healthcare changes
- WhatsApp/SMS BSP
- External search SaaS without OD-R13-01 approval
- ML models in production
- PHI analytics without IAM
- R10-E/F, caregiver proxy

R13 is **sandbox-operational** discovery and analytics on existing data.

---

## 25. Regression requirements

### 25.1 Must preserve

- R12 32/32 e2e
- R11 CMS/help/support
- R10 care-nav (no conflation with commerce recs)
- R9 consent enforcement
- R5-E refill clinical boundaries
- Payment/logistics sandbox
- 20 R12 tables RLS

### 25.2 Focused regression per IMPL CR

| Batch | Suites |
|-------|--------|
| R13 core | `r13a.*` … `r13h.*` |
| R12 | `r12a` … `r12g` |
| R11 | `r11a`, help search |
| R9/R10 | consent, care-nav smoke |

---

## 26. Verdict

**`R13_PLAN_READY`**

Repository audit confirms: commerce and CMS/help search indexes **exist** but lack async pipeline, unified discovery, provider indexes, recommendations, and analytics warehouse. R12 feeds (`conversion_events`, `personalization_events`) are **ready for consumption**. Book 93 R13 scope is clear; R10-E/F, R14, and clinical automation are excluded. **Postgres-first v1** is consistent with repository truth and the user's constraint not to assume an external search vendor without explicit Book 93 authorization.

**No product, security, or architecture blockers prevent R13 plan audit authorization.**

---

## 27. Next authorization

**`CR-POST-R13-PLAN-AUDIT-224`** — Post-plan audit of Book 223 against repository truth and Book 93 acceptance criteria. **Do not** start R13-A implementation until plan audit passes.

**HARD STOP:** Do not implement R13, R10-E/F, R12 expansion, or R14 under this CR.
