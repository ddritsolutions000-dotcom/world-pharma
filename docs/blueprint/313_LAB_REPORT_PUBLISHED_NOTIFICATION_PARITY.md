# CR-313 — LAB_REPORT_PUBLISHED Notification Payload Parity

**Status:** `LAB_REPORT_PUBLISHED_NOTIFICATION_PARITY_COMPLETE`  
**Verdict:** Publish outbox payload now includes `customer_person_id` matching imaging/amend parity.

## Pre-audit summary

| Question | Answer |
|----------|--------|
| A. Outbox enqueued? | Yes — `pathology.service.ts` `publishReport()` |
| B. `customer_person_id` in payload? | **No (before CR-313)** |
| C. Available from booking? | Yes — `booking.customerPersonId` already loaded |
| D. Required by dispatch? | Yes — `NotificationDispatchService.resolveRecipients()` |
| E. Who received notification? | **Nobody** — no recipient fields in publish payload |
| F. Reproducible in e2e? | Yes — extended r7e publish test |
| G. Smallest fix | Add one field to existing payload |
| H. Migration? | **No** |
| I. Security preserved? | Yes — canonical booking relation, tenant boundary unchanged |
| J. Publish behavior preserved? | Yes — transaction, artifact, timeline, security event unchanged |
| K. REAL_DEFECT? | **Yes** — customer notification silently dropped on publish |

## Parity reference

- `IMAGING_REPORT_PUBLISHED` — includes `customer_person_id` (interpretation.service.ts)
- `LAB_REPORT_AMENDED` — includes `customer_person_id` (CR-309)
- `LAB_REPORT_PUBLISHED` — was missing field (defect)

## Files changed

- `apps/api/src/lab/pathology.service.ts`
- `apps/api/src/lab/r7e.pathology-digital-report.e2e.spec.ts`

## Next genuine gap

Logistics async queue zero producers (low urgency).

**Next action:** Audit logistics job enqueue producers for sample transport async path.
