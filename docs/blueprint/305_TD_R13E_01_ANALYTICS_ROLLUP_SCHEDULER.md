# 305 — TD-R13E-01 analytics daily rollup scheduler (CR-305)

**CR:** `CR-305-TD-R13E-01-ANALYTICS-ROLLUP-SCHEDULER`  
**Date:** 30 August 2026  
**Verdict:** **`R13_E_ROLLUP_SCHEDULER_COMPLETE`**

---

## Pre-audit

| Check | Result |
|-------|--------|
| `runDailyRollups()` callers (before) | **0** — only defined in `analytics-worker.service.ts` |
| Book 234 TD-R13E-01 | Worker present; **no outbox/cron dispatch** |
| Book 223 §11 | `AnalyticsRollupWorker` / `evt.analytics.rollup` / nightly cron |
| Ingest idempotency | **Already present** — `ingestCountryDay` full-day re-aggregate + upsert |

**Gap confirmed:** REAL_MISSING_FEATURE — orchestration only; kernel complete.

---

## Implementation

| File | Change |
|------|--------|
| `analytics-rollup-scheduler.config.ts` | Env gates + outbox constants |
| `analytics-rollup-scheduler.service.ts` | Outbox `ANALYTICS_DAILY_ROLLUP` + handler → `runDailyRollups()`; opt-in interval scheduler |
| `analytics-worker.service.ts` | Structured start/complete logs |
| `analytics.module.ts` | Wire scheduler + `EventsModule` |
| `r13e.analytics-rollup-scheduler.e2e.spec.ts` | Scheduler e2e (3 tests) |

**Runtime enablement:** `ANALYTICS_ROLLUP_SCHEDULER_ENABLED=true` (fail-closed OFF by default).  
**Poll interval:** `ANALYTICS_ROLLUP_SCHEDULER_POLL_MS` (default 3_600_000 ms).

**No migration.** Reuses existing outbox + `EventWorkerService` + `AnalyticsIngestService`.

---

## Verification

| Suite | Result |
|-------|--------|
| `r13e.analytics` + `r13e.analytics-rollup-scheduler` | **10/10 PASS** |
| `r13f.analytics-admin` + `r13h.closure` | **14/14 PASS** |
| `npm run typecheck` | **PASS** (24 projects) |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

---

## Post-audit

Scheduler invokes canonical `AnalyticsWorkerService.runDailyRollups()` → `AnalyticsIngestService.ingestCountryDay()`. No duplicate aggregation engine. Human-blocked tracks untouched.

**Remaining deferred (not this CR):** `PersonalizationPurgeWorker` / `evt.crm.purge` daily dispatch (separate from TD-R13E-01 rollup scope).

**Next:** **`ROADMAP_ENGINEERING_PAUSE`** unless another authorized gap is proven.
