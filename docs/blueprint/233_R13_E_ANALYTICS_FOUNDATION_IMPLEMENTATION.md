# R13-E Analytics foundation

**CR:** `CR-R13-E-IMPL-233`  
**Verdict:** `R13_E_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-E-AUDIT-234`  
**Authority:** [223](223_R13_IMPLEMENTATION_PLAN.md) · [232](232_POST_R13_D_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R13-E delivers the **Postgres analytics/BI foundation**: deterministic daily rollups, conversion-event producer completion, personalization retention purge, country-scoped admin read APIs, and policy/RBAC gates. **No PHI warehouse, no ML, no external BI vendor, no admin dashboard UI (R13-F).**

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| `analytics_daily_country_metrics` | **DONE** |
| `analytics_daily_product_metrics` | **DONE** |
| `analytics_daily_marketing_metrics` | **DONE** |
| `analytics_ingest_cursors` | **DONE** |
| `AnalyticsIngestService` — deterministic daily rollup | **DONE** |
| `AnalyticsPurgeService` — rollup + personalization retention | **DONE** |
| `AnalyticsWorkerService` — nightly rollup + purge orchestration | **DONE** |
| `ConversionEventService.recordHook()` | **DONE** |
| Conversion hooks: `ORDER_PAID`, `CHECKOUT_STARTED`, `APPOINTMENT_COMPLETED`, `LAB_BOOKING_COMPLETED`, `IMAGING_BOOKING_COMPLETED`, `CART_ABANDONED` (ingest scan) | **DONE** |
| `AFFILIATE_CLICK` (pre-existing) | **DONE** (unchanged) |
| Policy keys `analytics.enabled`, `analytics.retention_days` | **DONE** |
| RBAC `analytics:read` | **DONE** |
| `GET /api/v1/admin/analytics/overview` | **DONE** |
| `GET /api/v1/admin/analytics/commerce` | **DONE** |
| `GET /api/v1/admin/analytics/marketing` | **DONE** |
| Personalization purge RLS + DELETE grant (closes **TD-R12F-02**) | **DONE** |
| `r13e.analytics.e2e` | **DONE** (7/7) |

**Explicitly not in R13-E (per Book 223 §11):** weekly `CooccurrenceRebuildWorker` — assigned to **R13-D**, not R13-E (**TD-R13D-03** carries forward).

**Not started:** R13-F admin BI shell, R13-G clinical/PHI search, R13-H closure, `analytics:export`, external warehouse.

---

## 2. Architecture

```
conversion_events (R12)     ──┐
personalization_events      ──┼──► AnalyticsIngestService.ingestCountryDay()
crm campaign sends          ──┤         │
marketing_preferences       ──┘         ▼
                              analytics_daily_* rollups
                              analytics_ingest_cursors

AnalyticsPurgeService ──► expired rollups (analytics.retention_days)
                       └──► expired personalization_events (crm.personalization.retention_days)

GET /admin/analytics/* ──► AnalyticsReadService (analytics.enabled + analytics:read)
```

**Ingest rule version:** `rollup_v1` (`ANALYTICS_INGEST_VERSION`).

**Feeds:** `conversion_events`, `personalization_events`, `marketing` (campaign sends + opt-in snapshot).

---

## 3. Conversion event hooks (Book 223 §7.3)

| Event | Producer | Idempotency key |
|-------|----------|-----------------|
| `ORDER_PAID` | `order.service.ts` on payment commit | `source=order_paid`, `sourceKey=orderId` |
| `CHECKOUT_STARTED` | `cart.service.ts` `startCheckout` | `source=checkout_session`, `sourceKey=sessionId` |
| `APPOINTMENT_COMPLETED` | `appointment.service.ts` `complete` | `source=appointment`, `sourceKey=appointmentId` |
| `LAB_BOOKING_COMPLETED` | `lab-booking.service.ts` `confirmFromPayment` | `source=lab_booking`, `sourceKey=bookingId` |
| `IMAGING_BOOKING_COMPLETED` | `imaging-booking.service.ts` `confirmFromPayment` | `source=imaging_booking`, `sourceKey=bookingId` |
| `CART_ABANDONED` | `AnalyticsIngestService` stale-session scan | `source=checkout_session`, `sourceKey=sessionId` |
| `AFFILIATE_CLICK` | `affiliate-click.service.ts` (R12-D) | unchanged |

All hooks reuse **`ConversionEventService`** — no second conversion kernel. Metadata guarded by `assertSafeMetadata()` (same clinical-key denylist as R12).

---

## 4. Migrations (125 total)

| Migration | Purpose |
|-----------|---------|
| `20260829290000_r13e_analytics_schema` | Rollup tables + ingest cursors |
| `20260829290100_r13e_analytics_rls` | FORCE RLS, worker/platform writes, country-scoped SELECT |
| `20260829290200_r13e_analytics_grants` | `worldpharma_app` grants |
| `20260829290300_r13e_personalization_purge_rls` | Worker-scoped DELETE on `personalization_events` |
| `20260829290400_r13e_personalization_purge_grants` | `GRANT DELETE` on `personalization_events` |

**No `USING(true)`** policies introduced.

---

## 5. Policy / RBAC

| Key / permission | Default | Behavior |
|------------------|---------|----------|
| `analytics.enabled` | `false` | Fail-closed — 403 on all analytics read APIs |
| `analytics.retention_days` | `365` | Rollup purge cutoff |
| `crm.personalization.retention_days` | `90` (existing) | Personalization event purge |
| `analytics:read` | `company_operations` | Admin analytics GET endpoints |

`ANALYTICS_QUERY` security events emitted on dashboard loads (metadata only — no result payload).

---

## 6. Runtime evidence

| Check | Result |
|-------|--------|
| `r13e.analytics.e2e` | **7/7 PASS** |
| R13-A regression | **PASS** |
| R13-B regression | **PASS** |
| R13-C regression | **FAIL** — polluted test DB (`TD-REG-R13C-01`, pre-existing) |
| R13-D regression | **4/4 PASS** |
| R12-E regression | **PASS** |
| R12-F regression | **PASS** |
| API `tsc --noEmit` | **PASS** |
| `prisma migrate deploy` | **125 migrations applied** |
| `prisma generate` | **EPERM** on Windows file lock (non-blocking; client already usable) |
| `web-customer:typecheck` | **Not run** — inherited **TD-WEB-TC-01** |
| `/health/ready` | **Not run** |
| Browser / mobile | **Not run** |

---

## 7. Known debt (carried forward)

| ID | Item | Resolved by R13-E? |
|----|------|-------------------|
| TD-R13D-01 | Mobile PDP carousel deferred | **No** |
| TD-R13D-02 | `/me/recommendations/home` alias absent | **No** |
| TD-R13D-03 | Weekly co-occurrence rebuild worker | **No** — Book 223 §11 assigns to R13-D |
| TD-WEB-TC-01 | `store-home.tsx` typecheck (`onRetry` prop) | **No** |
| TD-REG-R13C-01 | R13-C unified assertion on polluted DB | **No** |
| TD-R12F-02 | Personalization purge worker missing | **YES** — `AnalyticsPurgeService` + worker RLS/grants |

---

## 8. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A–H | **COMPLETE** |
| R13-A | **COMPLETE** |
| R13-B | **COMPLETE** |
| R13-C | **COMPLETE** |
| R13-D | **COMPLETE** |
| R13-E | **IMPLEMENTED** |
| R13-F | **NOT STARTED** |
| R13-G | **NOT STARTED** |
| R13-H | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| R14+ | **NOT STARTED** |

---

**FINAL STATUS:** `R13_E_IMPLEMENTED`  
**Next authorization:** `CR-POST-R13-E-AUDIT-234`
