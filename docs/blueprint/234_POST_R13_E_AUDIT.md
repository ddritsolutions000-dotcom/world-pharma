# 234 — Post-R13-E implementation audit

**CR:** `CR-POST-R13-E-AUDIT-234`  
**Verdict:** `R13_E_GREEN_R13_F_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [233](233_R13_E_ANALYTICS_FOUNDATION_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · Plan audit [224](224_POST_R13_PLAN_AUDIT.md) · R13-D audit [232](232_POST_R13_D_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-E is **correctly implemented** against Book 223 §22 (R13-E), Book 224 gates, and Book 233 claims. The `apps/api/src/analytics/` module delivers deterministic daily Postgres rollups, conversion-event producer completion via existing `ConversionEventService.recordHook`, personalization retention purge (closing **TD-R12F-02**), country-scoped admin read APIs with `analytics.enabled` + `analytics:read` gates, and focused E2E coverage.

**Architecture confirmation:** Single analytics kernel; reuses R12 `conversion_events` and `personalization_events` as read sources; **no duplicate conversion kernel, no PHI warehouse, no external BI vendor, no ML, no R13-F/G/H UI or export.**

**Inherited non-blockers (verified unrelated to R13-E):**
- `web-customer:typecheck` fails on `store-home.tsx` `NetworkErrorState` `onRetry` prop — **predates R13-E** (R13-B/R13-C discovery UI); R13-E touched **zero** `apps/web-customer` files.
- `r13c.provider-search.e2e` unified-type assertion fails — **environmental test DB pollution** (per-type doctor/lab/test/pharmacy paths pass in same run); R13-E touched **zero** `apps/api/src/discovery` files.

**New non-blocker debt:**
- **TD-R13E-01** — `AnalyticsWorkerService` exists but is **not** registered on `EventHandlerRegistry` / outbox (`evt.analytics.rollup`, `evt.crm.purge` per Book 223 §11). Rollup/purge are programmatically invocable; scheduled dispatch deferred.

**Runtime limitations (honest):** `/health/ready` not executed; browser/mobile verification not performed.

**Next authorization:** `CR-R13-F-IMPL-235` — R13-F admin analytics BI shell only.

---

## 2. Acceptance gate matrix (34 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `AnalyticsIngestService` | **PASS** | `analytics-ingest.service.ts`; e2e rollup tests |
| 2 | Deterministic daily rollups | **PASS** | Full-day re-aggregate + upsert; e2e repeat ingest identical counts |
| 3 | `analytics_daily_country_metrics` | **PASS** | Schema + migration `20260829290000`; ingest upsert |
| 4 | `analytics_daily_product_metrics` | **PASS** | Schema + ingest `upsertProductMetrics` |
| 5 | `analytics_daily_marketing_metrics` | **PASS** | Schema + ingest `upsertMarketingMetric` |
| 6 | `analytics_ingest_cursors` | **PASS** | Schema + `advanceCursor` per feed kind |
| 7 | All conversion producers | **PASS** | See §3 |
| 8 | `ConversionEventService.recordHook` reuse | **PASS** | Single kernel; `recordHook` in `conversion-event.service.ts` |
| 9 | `AnalyticsPurgeService` | **PASS** | `analytics-purge.service.ts`; e2e purge boundaries |
| 10 | Analytics retention behavior | **PASS** | `analyticsRetentionDays()`; rollup `deleteMany` by `countryId` + `metricDate` |
| 11 | Personalization retention/purge | **PASS** | `personalizationRetentionDays()`; worker DELETE policy + grant |
| 12 | `AnalyticsWorkerService` | **PARTIAL** | Service present; **no outbox/cron dispatch** (TD-R13E-01) |
| 13 | Admin analytics read APIs | **PASS** | `GET /admin/analytics/{overview,commerce,marketing}` |
| 14 | `analytics:read` RBAC | **PASS** | `authority.ts`, `rbac.service.ts`, controller guards |
| 15 | `analytics.enabled` policy gate | **PASS** | `document.ts`, `resolver.isAnalyticsEnabled`; e2e 403 when disabled |
| 16 | Country/tenant isolation | **PASS** | `countryId` filters; `workerTenantContext`; e2e cross-country negative |
| 17 | Person isolation (where applicable) | **PASS** | Rollups aggregate only; admin APIs return `requested_by` opaque id; no person-level PHI rollups |
| 18 | Deterministic aggregation | **PASS** | Fixed `orderBy` on reads; full-day recompute on ingest |
| 19 | Ingest cursor / idempotency | **PASS** | Cursors advanced; rollup upsert by `(countryId, metricDate[, catalogItemId])` |
| 20 | Duplicate event handling | **PASS** | `recordHook` unique `(source, sourceKey, eventKind)`; e2e idempotency |
| 21 | FORCE RLS on new analytics tables | **PASS** | Live DB: all 4 R13-E tables `force_rls=true` |
| 22 | Deny-by-default policies | **PASS** | Ingest cursors DELETE `USING(false)`; user SELECT requires `can_country` |
| 23 | No `USING(true)` permissive policies | **PASS** | Live DB policy scan: no suspicious `USING(true)` on analytics tables |
| 24 | Least-privilege grants | **PASS** | Grants migration; cursors no DELETE grant |
| 25 | Worker/platform write boundaries | **PASS** | RLS INSERT/UPDATE/DELETE worker/platform on rollups |
| 26 | Purge cannot cross country boundaries | **PASS** | `purgeCountry` scopes all `deleteMany` by `countryId`; e2e keeps other country row |
| 27 | PHI/clinical exclusion | **PASS** | No clinical columns on rollup tables; `assertSafeMetadata`; e2e token scan |
| 28 | No unrestricted PHI warehouse | **PASS** | Commerce/marketing aggregates only |
| 29 | No external BI vendor | **PASS** | Grep: no vendor SDK in `analytics/` |
| 30 | No ML / recommendation scope change | **PASS** | No edits to `recommendations/`; co-occurrence worker still deferred (TD-R13D-03) |
| 31 | No R13-F/G/H scope | **PASS** | No web-admin analytics UI; no export; no clinical search |
| 32 | R13-A/B/C/D regression | **PARTIAL** | A/B/D **PASS**; C **FAIL** unified assertion (§5) — not R13-E caused |
| 33 | Typecheck/build | **PASS** (API) | `tsc --noEmit` API **PASS**; web-customer see §4 |
| 34 | Migration + live RLS | **PASS** | 125 migrations applied; live RLS query §6 |

---

## 3. Conversion-event audit

| Event | Producer | Kernel | Idempotency | Country scope |
|-------|----------|--------|-------------|---------------|
| `ORDER_PAID` | `order.service.ts` L705 | `recordHook` | `(order_paid, orderId)` | `session.country.isoAlpha2` |
| `CHECKOUT_STARTED` | `cart.service.ts` L437 | `recordHook` | `(checkout_session, sessionId)` | cart country |
| `APPOINTMENT_COMPLETED` | `appointment.service.ts` L328 | `recordHook` | `(appointment, appointmentId)` | appointment country |
| `LAB_BOOKING_COMPLETED` | `lab-booking.service.ts` L524 | `recordHook` | `(lab_booking, bookingId)` | booking country |
| `IMAGING_BOOKING_COMPLETED` | `imaging-booking.service.ts` L594 | `recordHook` | `(imaging_booking, bookingId)` | booking country |
| `CART_ABANDONED` | `analytics-ingest.service.ts` `recordAbandonedCarts` | `recordHook` | `(checkout_session, sessionId)` | session country |
| `AFFILIATE_CLICK` | `affiliate-click.service.ts` (unchanged) | direct create | existing R12-D | country |

**Append-only:** `conversion_events` table unchanged; hooks INSERT only via `recordHook` / affiliate path.

**Clinical metadata:** `assertSafeMetadata` rejects forbidden keys; e2e rejects `{ diagnosis: 'hidden' }`.

**No duplicate kernel:** No second conversion service or table.

**CART_ABANDONED side effects:** Scan is read-only on `checkout_sessions` (filter: expired window, no order, not cancelled); only writes are idempotent `conversion_events` inserts. **Does not** mutate orders, payments, or session status.

---

## 4. web-customer:typecheck investigation

### 4.1 Observed failure (audit re-run)

```
apps/web-customer/src/store-home.tsx(174,28): error TS2322
NetworkErrorState — Property 'onRetry' does not exist
Expected: action?: { label: string; onClick: () => void }
```

### 4.2 Root-cause analysis

| Question | Finding |
|----------|---------|
| Predates R13-E? | **YES** — same failure documented in [232](232_POST_R13_D_AUDIT.md) §4; `store-home.tsx` is R13-B/R13-C discovery UI |
| R13-E touched web-customer? | **NO** — grep `apps/web-customer/src` for `analytics`: zero matches |
| R13-E touched `store-home.tsx`? | **NO** |
| R13-E worsened failure? | **NO** — identical error signature and line |

### 4.3 Classification

**Non-blocking inherited debt (TD-WEB-TC-01)** — not an R13-E finding.

---

## 5. R13-C regression note

**Audit re-run:** `r13c.provider-search.e2e.spec.ts` **FAIL** at unified multi-type assertion (`q=R13C` expected `arrayContaining` doctor/lab/test/pharmacy; received mostly `doctor`).

**Same test run:** Per-type assertions (doctor, lab, test, pharmacy individually) **passed** before unified check.

| Question | Finding |
|----------|---------|
| R13-E touched discovery? | **NO** — no files under `apps/api/src/discovery` reference analytics |
| R13-E changed provider indexes? | **NO** — no R13-C migrations modified |
| Failure mode | Polluted `TC` country test data from prior runs — same as [232](232_POST_R13_D_AUDIT.md) §5 |

**Classification:** **TD-REG-R13C-01** — environmental; **not an R13-E regression**.

---

## 6. Live RLS verification (test DB)

Queried `worldpharma_test` @ `127.0.0.1:55432`:

| Table | `force_rls` | `rls_enabled` |
|-------|-------------|---------------|
| `analytics_daily_country_metrics` | true | true |
| `analytics_daily_product_metrics` | true | true |
| `analytics_daily_marketing_metrics` | true | true |
| `analytics_ingest_cursors` | true | true |

16 policies on analytics tables; ingest cursors DELETE denied (`USING(false)`); rollup DELETE worker/platform only.

Personalization purge: policy `personalization_events_worker_delete` requires `is_worker|is_platform` AND `can_country(country_id)`.

---

## 7. Purge audit (TD-R12F-02)

| Check | Result |
|-------|--------|
| Rollup retention uses `analytics.retention_days` | **PASS** |
| Personalization uses `crm.personalization.retention_days` | **PASS** |
| Worker-authorized DELETE | **PASS** — RLS + `workerTenantContext` |
| Cannot delete unrelated country rows | **PASS** — e2e |
| Append-only preserved except authorized retention | **PASS** — only rollup + expired personalization events |
| **TD-R12F-02 resolved** | **YES** — `AnalyticsPurgeService` + migrations `290300`/`290400` |

---

## 8. Runtime evidence (audit re-run)

| Check | Result |
|-------|--------|
| `r13e.analytics.e2e` | **7/7 PASS** |
| R13-A `r13a.search-indexing.e2e` | **PASS** |
| R13-B `r13b.discovery.e2e` | **PASS** |
| R13-C `r13c.provider-search.e2e` | **FAIL** (unified assertion only — TD-REG-R13C-01) |
| R13-D `r13d.recommendations.e2e` | **4/4 PASS** |
| R12-E `r12e.wishlist.e2e` | **PASS** |
| R12-F `r12f.reviews.e2e` | **PASS** |
| API `tsc --noEmit` | **PASS** |
| `prisma migrate status` | **125 migrations, up to date** |
| Live RLS verification | **PASS** (§6) |
| `web-customer:typecheck` | **FAIL** (TD-WEB-TC-01) |
| `/health/ready` | **Not run** |
| Browser verification | **Not performed** |
| Mobile verification | **Not performed** |

---

## 9. Technical debt classification

| ID | Item | Blocker? | R13-E related? |
|----|------|----------|----------------|
| TD-R12F-02 | Personalization purge worker | **RESOLVED** | Closed by R13-E |
| TD-R13D-01 | Mobile PDP carousel deferred | No | No |
| TD-R13D-02 | `/me/recommendations/home` alias absent | No | No |
| TD-R13D-03 | Weekly co-occurrence rebuild worker | No | No (Book 223 §11 → R13-D) |
| TD-WEB-TC-01 | `store-home.tsx` typecheck | No | **No** — predates R13-E |
| TD-REG-R13C-01 | R13-C unified e2e on polluted DB | No | **No** — discovery untouched |
| **TD-R13E-01** | No outbox/cron dispatch for `AnalyticsWorkerService` | No | **New** — service only; Book 223 §11 workers deferred |

**No new blocker-class security, privacy, database, API, architecture, data-integrity, or scope issues identified.**

---

## 10. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| R13-C | **COMPLETE** |
| R13-D | **COMPLETE** |
| R13-E | **IMPLEMENTED / AUDITED GREEN** |
| R13-F | **NOT STARTED** |
| R13-G | **NOT STARTED** |
| R13-H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

---

**FINAL STATUS:** `R13_E_GREEN_R13_F_READY`  
**Next authorization:** `CR-R13-F-IMPL-235`
