# CR-315 — LAB CoC / Sample Transport Notification Recipient Parity

**Status:** `LAB_COC_NOTIFICATION_RECIPIENT_PARITY_COMPLETE`  
**Verdict:** Sample CoC outbox payloads now include `customer_person_id` for NotificationDispatchService routing.

## Pre-audit summary

| Event | Outbox? | Had `customer_person_id`? | Notification handler? | Customer reached before fix? |
|-------|---------|---------------------------|----------------------|------------------------------|
| `LAB_SAMPLE_ASSIGNED` | Yes | No | Yes | No |
| `LAB_SAMPLE_COLLECTED` | Yes | No | Yes | No |
| `LAB_SAMPLE_HANDED_OVER` | Yes | No | Yes | No |
| `LAB_SAMPLE_TRANSPORT_ENQUEUED` | Yes | No | Yes | No |
| `LAB_SAMPLE_COLLECTION_FAILED` | Yes | No | Yes | No |
| `LAB_SAMPLE_COC_UPDATED` | Yes | No | Yes | No |

Contract: Book 23 requires customer notifications for `SAMPLE_COLLECTED`, `SAMPLE_REJECTED`; Book 144/145 reuse outbox/notification kernel; `lab-booking.service.ts` already uses `customer_person_id` pattern.

## Fix

Added `customer_person_id: booking.customerPersonId` (via `resolveBookingCustomerPersonId`) to all sample-collection outbox payloads registered in `NotificationDispatchService`.

Transport job creation unchanged.

## Files changed

- `apps/api/src/lab/sample-collection.service.ts`
- `apps/api/src/lab/r7c.sample-collection.e2e.spec.ts`

## Next genuine gap

LogisticsWorker BullMQ scaffolding (async shipment booking retry) — deferred; sync path works.
