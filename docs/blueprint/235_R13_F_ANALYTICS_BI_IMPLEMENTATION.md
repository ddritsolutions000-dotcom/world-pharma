# R13-F Admin analytics / BI shell

**CR:** `CR-R13-F-IMPL-235`  
**Verdict:** `R13_F_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-F-AUDIT-236`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [234](234_POST_R13_E_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-F delivers the **web-admin analytics shell** consuming existing R13-E read APIs. **No new schema, no second analytics kernel, no PHI/clinical analytics, no export (`analytics:export`), no R13-G/H.**

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `/analytics` overview KPI shell | **DONE** |
| `/analytics/commerce` product funnel view | **DONE** |
| `/analytics/marketing` campaign rollup view | **DONE** |
| `analytics-api.ts` client for R13-E endpoints | **DONE** |
| Country + date scope controls | **DONE** |
| Loading / empty / forbidden / error + retry states | **DONE** |
| `ADMIN_NAV` entry gated by `analytics:read` | **DONE** |
| Reuse `AnalyticsReadService` + R13-E rollups | **DONE** (no API kernel duplication) |
| `analytics.enabled` server gate (403) | **DONE** (inherited R13-E) |
| `ANALYTICS_QUERY` security events on read | **DONE** (inherited R13-E controller) |
| `r13f.analytics-admin.e2e` | **DONE** |
| `analytics.spec.tsx` (web-admin) | **DONE** |

**Explicitly not in R13-F:** `analytics:export`, external BI, ML, PHI dashboards, customer/mobile analytics UI, R13-G clinical search, R13-H closure.

---

## 2. UI routes

| Route | Component | API |
|-------|-----------|-----|
| `/analytics` | `AnalyticsOverview` | `GET /api/v1/admin/analytics/overview` |
| `/analytics/commerce` | `AnalyticsCommerce` | `GET /api/v1/admin/analytics/commerce` |
| `/analytics/marketing` | `AnalyticsMarketingView` | `GET /api/v1/admin/analytics/marketing` |

All pages wrap `AdminShell` and share `AnalyticsScopeBar` (country code, UTC date range, sub-nav, refresh).

---

## 3. Security

| Control | Implementation |
|---------|----------------|
| JWT authentication | Inherited API guards |
| Admin audience | `@RequireAudiences('admin')` |
| `analytics:read` | Controller + nav permission; `company_operations` has read; `company_support` denied |
| `analytics.enabled` | `AnalyticsReadService.requireEnabled()` → 403 |
| Country isolation | Server-authoritative `country_code`; RLS via tenant context |
| Non-clinical payloads | Aggregate counts only; e2e denylist assertions |
| Privileged access audit | `ANALYTICS_QUERY` via `SecurityEventsService` (R13-E) |

---

## 4. Files added / changed

**web-admin**

- `src/analytics-api.ts`
- `src/analytics-format.ts`
- `src/analytics-scope.tsx`
- `src/analytics-overview.tsx`
- `src/analytics-commerce.tsx`
- `src/analytics-marketing-view.tsx`
- `src/analytics.spec.tsx`
- `app/analytics/page.tsx`
- `app/analytics/commerce/page.tsx`
- `app/analytics/marketing/page.tsx`
- `src/nav.ts` — Analytics nav item

**api**

- `src/analytics/r13f.analytics-admin.e2e.spec.ts`
- `src/analytics/admin-analytics.controller.ts` — safe query validation (400 on malformed scope)

**No schema migrations.**

---

## 5. Tests (runtime evidence)

| `r13f.analytics-admin.e2e` | **8/8 PASS** |
| `analytics.spec.tsx` | **8/8 PASS** |
| R13-E regression (`r13e.analytics.e2e`) | **7/7 PASS** |
| R13-A/B/D regression | **6/6 PASS** |
| web-admin typecheck | **PASS** |
| API typecheck | **PASS** |
| R13-C (`r13c.provider-search.e2e`) | **FAIL** — inherited **TD-REG-R13C-01** (polluted test DB unified discovery assertion) |
| `/health/ready` | Not run |
| Browser verification | Not performed |

---

## 6. Known debt (carried forward)

| ID | Status |
|----|--------|
| TD-R13D-01 | mobile PDP carousel deferred |
| TD-R13D-02 | recommendations home alias absent |
| TD-R13D-03 | weekly co-occurrence rebuild deferred |
| TD-WEB-TC-01 | inherited `store-home.tsx` typecheck issue |
| TD-REG-R13C-01 | polluted test DB unified discovery assertion |
| TD-R13E-01 | analytics worker not wired to EventHandlerRegistry/outbox |

**Not resolved by R13-F** — no changes to those areas.

---

## 7. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | COMPLETE |
| R13-A | COMPLETE |
| R13-B | COMPLETE |
| R13-C | COMPLETE |
| R13-D | COMPLETE |
| R13-E | COMPLETE |
| **R13-F** | **IMPLEMENTED** |
| R13-G | NOT STARTED |
| R13-H | NOT STARTED |
| R10-E/F | NOT STARTED |
| R14+ | NOT STARTED |

---

## 8. Next step

**`CR-POST-R13-F-AUDIT-236`** — post-R13-F audit only.
