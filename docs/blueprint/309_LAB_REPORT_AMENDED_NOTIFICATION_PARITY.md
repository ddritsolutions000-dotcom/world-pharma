# 309 — LAB_REPORT_AMENDED notification parity

**CR:** `CR-309-LAB-REPORT-AMENDED-NOTIFICATION-PARITY`  
**Date:** 30 August 2026  
**Verdict:** **`LAB_REPORT_AMENDED_NOTIFICATION_PARITY_COMPLETE`**

---

## REAL_DEFECT

Lab report amendment emitted a security event only; no `LAB_REPORT_AMENDED` outbox event and no customer in-app notification. Imaging amendment already had full parity via `IMAGING_REPORT_AMENDED` outbox + `NotificationDispatchService`.

---

## Fix

- `pathology.service.ts` `amendReport()` — enqueue `LAB_REPORT_AMENDED` outbox inside tenant-scoped transaction (mirrors imaging).
- `notification-dispatch.service.ts` — register `LAB_REPORT_AMENDED` title mapping.
- `r7e.pathology-digital-report.e2e.spec.ts` — outbox, notification, isolation, replay idempotency assertions.

**Payload (no PHI):** `lab_report_id`, `lab_booking_id`, `lab_org_id`, `customer_person_id`, `version_number`, `sandbox`.

---

## Verification

| Check | Result |
|-------|--------|
| `r7e.pathology-digital-report.e2e` | **2/2 PASS** |
| `r8e.imaging-digital-report.e2e` | **4/4 PASS** (unchanged) |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

**Next:** CRM automation scheduler (TD-R12G-02) or lab publish `customer_person_id` notification gap — rank by fresh audit.
