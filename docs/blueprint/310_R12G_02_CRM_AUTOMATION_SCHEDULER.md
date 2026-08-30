# 310 — TD-R12G-02 CRM automation production scheduler

**CR:** `CR-310-R12G-02-CRM-AUTOMATION-SCHEDULER`  
**Date:** 30 August 2026  
**Verdict:** **`CRM_AUTOMATION_SCHEDULER_COMPLETE`**

---

## REAL_MISSING_FEATURE

TD-R12G-02: `RefillMarketingService.evaluateCountry()` had **zero production scheduler callers** — only manual `POST /admin/crm/automation/evaluate`.

---

## Fix

Opt-in scheduler (fail-closed default):

- Env: `CRM_AUTOMATION_SCHEDULER_ENABLED=true` (default **OFF**)
- Optional: `CRM_AUTOMATION_SCHEDULER_POLL_MS` (default 1h, min 60s)
- Outbox event: `CRM_AUTOMATION_DAILY_EVALUATE`
- Pattern: `CrmAutomationSchedulerService.tickOnce()` → outbox → `EventWorkerService` → `RefillMarketingService.evaluateCountryScheduled()` per ACTIVE country with automation policy enabled
- Manual admin path unchanged via `evaluateCountry(principal, ...)`

---

## Verification

| Check | Result |
|-------|--------|
| `crm-automation-scheduler.e2e` | **6/6 PASS** |
| `r12g.refill-hooks.e2e` | **10/10 PASS** |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

**Next:** Campaign auto-send worker (TD-R12B-02) or abandoned-cart CRM wiring (TD-R12B-01) — rank by fresh audit.
