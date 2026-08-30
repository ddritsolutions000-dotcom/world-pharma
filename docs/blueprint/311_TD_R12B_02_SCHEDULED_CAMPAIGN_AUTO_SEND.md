# 311 — TD-R12B-02 scheduled campaign auto-send

**CR:** `CR-311-TD-R12B-02-SCHEDULED-CAMPAIGN-AUTO-SEND`  
**Date:** 30 August 2026  
**Verdict:** **`CAMPAIGN_SCHEDULED_AUTO_SEND_COMPLETE`**

---

## REAL_MISSING_FEATURE

Scheduled CRM campaigns (`status: SCHEDULED`, `scheduled_at` due) had no production worker — sending required manual `POST /admin/marketing/campaigns/:id/send`.

---

## Fix

Opt-in scheduler (fail-closed default):

- Env: `CRM_CAMPAIGN_SEND_SCHEDULER_ENABLED=true` (default **OFF**)
- Optional: `CRM_CAMPAIGN_SEND_SCHEDULER_POLL_MS` (default 1h)
- Outbox: `CRM_CAMPAIGN_SCHEDULED_SEND_SCAN`
- Pattern: `CampaignSendSchedulerService.tickOnce()` → outbox → worker → scan due campaigns → `SendPipelineService.sendCampaignScheduled()`
- Atomic claim: `SCHEDULED → SENDING` via `updateMany` (concurrency-safe)
- Deterministic batch key: `scheduler:${campaignId}` (replay-safe per recipient)
- Manual admin send path preserved via `sendCampaign()`

---

## Verification

| Check | Result |
|-------|--------|
| `campaign-send-scheduler.e2e` | **7/7 PASS** |
| `r12b.marketing.e2e` | **7/7 PASS** |
| `crm-automation-scheduler.e2e` | **6/6 PASS** |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

**Next:** Abandoned-cart CRM wiring (TD-R12B-01) — rank by fresh audit.
