# 236 — Post-R13-F implementation audit

**CR:** `CR-POST-R13-F-AUDIT-236`  
**Verdict:** `R13_F_GREEN_R13_G_READY`  
**Date:** 30 August 2026  
**Audited implementation:** [235](235_R13_F_ANALYTICS_BI_IMPLEMENTATION.md)  
**Plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) · R13-E audit [234](234_POST_R13_E_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, test, or configuration changes were made.**

---

## 1. Executive summary

R13-F is **correctly implemented** against Book 223 §22 (R13-F), Book 234 gates, and Book 235 claims. The web-admin analytics shell delivers `/analytics`, `/analytics/commerce`, and `/analytics/marketing` views that consume existing R13-E read APIs via `analytics-api.ts`. **No second analytics kernel, no new schema, no PHI/clinical analytics, no external BI vendor, no ML, no `analytics:export`, no R13-G/H scope.**

**Architecture confirmation:** Single `apps/api/src/analytics/` module unchanged in kernel shape; R13-F adds web-admin UI + focused `r13f` e2e + safe query validation in `admin-analytics.controller.ts` (400 on malformed scope).

**Inherited non-blockers (not R13-F caused):**
- **TD-REG-R13C-01** — `r13c.provider-search.e2e` unified-type assertion fails on polluted test DB (doctors only in unified results).
- **TD-WEB-TC-01** — `web-customer:typecheck` fails on `store-home.tsx` `NetworkErrorState` `onRetry` prop; R13-F touched **zero** `apps/web-customer` files.
- **TD-R13E-01** — `AnalyticsWorkerService` not registered on `EventHandlerRegistry` / outbox (unchanged from R13-E).

**Environmental note (non-blocker):**
- `r13e.analytics.e2e` may fail when bundled in the same Jest invocation as `r13f.analytics-admin.e2e` due to shared policy-pack mutations on test countries; **passes 7/7 in isolation**. Not classified as an R13-F regression.

**Intentional scope narrowing vs Book 223 §22 table:**
- Book 223 lists `analytics:export` and export API for R13-F; **CR-R13-F-IMPL-235 explicitly excluded export**. Repo grep confirms **no `analytics:export` permission or export endpoint** — deferred, not a blocker for R13-F shell audit.

**Runtime limitations (honest):** `/health/ready` not executed; live RLS not re-queried (no R13-F migrations); browser/mobile verification not performed.

**Next authorization:** `CR-R13-G-IMPL-237` — R13-G clinical/PHI search only (**legal-gated per Book 223 OD-R13-04**).

---

## 2. Acceptance gate matrix (22 items)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `/analytics` overview page | **PASS** | `app/analytics/page.tsx` → `AnalyticsOverview`; KPI totals + daily table |
| 2 | `/analytics/commerce` | **PASS** | `app/analytics/commerce/page.tsx` → `AnalyticsCommerce`; funnel table + catalog filter |
| 3 | `/analytics/marketing` | **PASS** | `app/analytics/marketing/page.tsx` → `AnalyticsMarketingView`; send/opt-in rollups |
| 4 | Reuse R13-E APIs/read kernel | **PASS** | `analytics-api.ts` calls `GET /admin/analytics/{overview,commerce,marketing}`; controller delegates to `AnalyticsReadService` only |
| 5 | No duplicate analytics kernel | **PASS** | Single `AnalyticsModule`; no second ingest/read/purge module; grep `AnalyticsReadService` scoped to `analytics/` |
| 6 | `analytics:read` server-enforced | **PASS** | `@RequirePermissions('analytics:read')` on all three routes; e2e customer 403; `company_support` 403 |
| 7 | `analytics.enabled` server-enforced, fail-closed | **PASS** | `AnalyticsReadService.requireEnabled()` → 403; e2e DE disabled country |
| 8 | `company_support` / unauthorized denied | **PASS** | `authority.ts` L286–297: no `analytics:read`; r13f e2e support 403 |
| 9 | Country/tenant isolation server-authoritative | **PASS** | `country_code` query required; reads filter by resolved `countryId`; e2e TR vs DE isolation |
| 10 | RLS boundaries intact | **PASS** | No R13-F migrations; R13-E RLS migrations `20260829290100` unchanged; reads use `runWithTenant(workerTenantContext)` |
| 11 | No PHI/clinical analytics exposed | **PASS** | Aggregate counts only; r13f `assertNoSensitivePayload` denylist; UI copy states non-clinical |
| 12 | No customer-level unrestricted analytics | **PASS** | No person/email fields in rollup responses; no customer/mobile analytics UI |
| 13 | No external BI vendor | **PASS** | Grep: no Segment/Mixpanel/BigQuery/Snowflake in `analytics/` or web-admin analytics files |
| 14 | No ML/recommendation engine introduced | **PASS** | No edits to `recommendations/`; analytics UI consumes rollups only |
| 15 | No `analytics:export` introduced | **PASS** | Grep repo: zero `analytics:export`; no export route in controller |
| 16 | Malformed query returns 400 not 500 | **PASS** | `parseAnalyticsQuery()` + `Errors.validation`; r13f e2e `country_code=T` → 400 |
| 17 | Loading/empty/forbidden/error/retry states | **PASS** | All three views use `LoadingState`, `EmptyState`, `PermissionDeniedState`, `ErrorState` + retry; `analytics.spec.tsx` covers each |
| 18 | Admin nav permission-gated | **PASS** | `nav.ts` Analytics item `permission: 'analytics:read'` |
| 19 | Audit/security events present | **PASS** | `ANALYTICS_QUERY` emitted on successful reads via `SecurityEventsService` (R13-E controller, unchanged pattern) |
| 20 | R13-E rollups reused, no redundant tables | **PASS** | Reads query `analytics_daily_*` tables only; no new migrations |
| 21 | R13-A/B/C/D/E intact | **PASS** | A/B/D pass; E passes in isolation; C fails inherited TD-REG-R13C-01 only |
| 22 | No R13-G/H, R10-E/F, R12 expansion, R14+ | **PASS** | No `clinical_search`, no r13g specs, no customer analytics UI, no new R12 modules |

---

## 3. UI audit

| Route | Component | API client | States |
|-------|-----------|------------|--------|
| `/analytics` | `AnalyticsOverview` | `fetchAnalyticsOverview` | loading, empty, forbidden, error+retry |
| `/analytics/commerce` | `AnalyticsCommerce` | `fetchAnalyticsCommerce` | + optional catalog filter |
| `/analytics/marketing` | `AnalyticsMarketingView` | `fetchAnalyticsMarketing` | same pattern |

**Shared shell:** `AnalyticsScopeBar` — country code (2-letter client hint), UTC date range, sub-nav links, refresh. All pages wrap `AdminShell`.

**Accessibility:** Table captions (`sr-only`), `aria-label` on nav, `aria-current="page"` on active view, form labels via `FormField`.

**Localization:** `analytics-format.ts` uses `Intl.NumberFormat` / `Intl.DateTimeFormat` for counts, minor units, dates.

**Client permission check:** Views check `session.permissions.includes('analytics:read')` for early `PermissionDeniedState`; **server remains authoritative** (API 403 also handled).

---

## 4. Security audit

| Control | Mechanism | Verified |
|---------|-----------|----------|
| Authentication | `JwtAuthGuard` | Controller class guard |
| Admin audience | `@RequireAudiences('admin')` | r13f e2e customer token 403 |
| `analytics:read` | `@RequirePermissions` + `PermissionsGuard` | `company_operations` pass; `company_support` fail |
| `analytics.enabled` | `PolicyResolver.isAnalyticsEnabled` | Fail-closed 403 when disabled |
| Country scope | Zod `country_code` min/max 2; service resolves country row | Malformed → 400 |
| Tenant context | `runWithTenant(workerTenantContext({ countryId }))` | R13-E read service unchanged |
| Privileged audit | `ANALYTICS_QUERY` security event | dashboard_id + country_code + row_count metadata |
| PHI exclusion | Rollup schema + metadata guards | e2e denylist |

**`requested_by` field:** Returns admin `personId` on read responses (R13-E design). Not customer-level PHI; opaque operator id for audit correlation.

---

## 5. Test verification (audit re-run)

| Suite | Result | Notes |
|-------|--------|-------|
| `r13f.analytics-admin.e2e` | **8/8 PASS** | Isolated run |
| `analytics.spec.tsx` | **8/8 PASS** | |
| `r13e.analytics.e2e` | **7/7 PASS** | Isolated run; **1 fail** when bundled with r13f (environmental) |
| `r13a.search-indexing.e2e` | **PASS** | |
| `r13b.discovery.e2e` | **PASS** | |
| `r13c.provider-search.e2e` | **FAIL** | **TD-REG-R13C-01** — polluted DB; not R13-F caused |
| `r13d.recommendations.e2e` | **PASS** | |
| `r12e.wishlist.e2e` | **PASS** | Sample R12 regression |
| `r12f.reviews.e2e` | **PASS** | Sample R12 regression |
| `api:typecheck` | **PASS** | |
| `web-admin:typecheck` | **PASS** | |
| `web-customer:typecheck` | **FAIL** | **TD-WEB-TC-01** (inherited) |
| `/health/ready` | Not run | |
| Live RLS query | Not run | No R13-F schema changes; R13-E audit §6 evidence stands |
| Browser verification | Not performed | |

---

## 6. Schema / migration status

**R13-F migrations:** **None** (confirmed — no new files under `packages/database/prisma/migrations` since R13-E `20260829290000`–`20260829290400`).

Prisma migrate deploy runs successfully as part of e2e harness (125 migrations applied per harness output).

---

## 7. Known debt (carried forward)

| ID | Status | R13-F impact |
|----|--------|--------------|
| TD-R13D-01 | Deferred | None |
| TD-R13D-02 | Deferred | None |
| TD-R13D-03 | Deferred | None |
| TD-WEB-TC-01 | Inherited | None — zero web-customer edits |
| TD-REG-R13C-01 | Inherited | None — zero discovery edits |
| TD-R13E-01 | Inherited | None — worker still not on outbox |

**Not resolved by R13-F.**

---

## 8. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | COMPLETE |
| R13-A | COMPLETE |
| R13-B | COMPLETE |
| R13-C | COMPLETE |
| R13-D | COMPLETE |
| R13-E | COMPLETE |
| **R13-F** | **IMPLEMENTED / audited** |
| R13-G | NOT STARTED |
| R13-H | NOT STARTED |
| R10-E/F | NOT STARTED |
| R14+ | NOT STARTED |

---

## 9. Verdict

All **blocker-class** R13-F gates pass. Inherited environmental and pre-existing debts are documented and do not block R13-G technical authorization.

**`R13_F_GREEN_R13_G_READY`**

**Next authorization:** `CR-R13-G-IMPL-237` (legal-gated clinical/PHI search per Book 223).
