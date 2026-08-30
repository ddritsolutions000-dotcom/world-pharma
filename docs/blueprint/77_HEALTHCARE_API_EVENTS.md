# 77 — Healthcare API and events

**Status:** Blueprint — not implemented  
**Related:** [21](21_API_ARCHITECTURE.md) · [22](22_EVENT_ARCHITECTURE.md) · [44](44_EVENT_IMPLEMENTATION_NOTES.md)

Same `/api/v1` modular monolith. Problem+JSON. Idempotency-Key on money and booking POSTs.

**No Kafka in P2-HC.** Outbox + BullMQ only.

---

## 1. API surfaces (illustrative)

| Audience | Prefix |
| --- | --- |
| Customer | `/me/appointments`, `/me/consults`, `/me/prescriptions`, `/me/lab-bookings`, `/me/reports`, `/me/consents` |
| Doctor | `/doctor/calendar`, `/doctor/queue`, `/doctor/encounters`, `/doctor/prescriptions` |
| Lab | `/lab/catalog`, `/lab/bookings`, `/lab/samples`, `/lab/reports` |
| Pathologist | `/pathologist/queue`, `/pathologist/reports` |
| Phlebotomist | `/phlebotomist/jobs`, `/phlebotomist/samples` |
| Admin | `/admin/care/*`, `/admin/diagnostics/*` |
| Webhooks | existing payment/carrier; optional SFU hooks **signed** |

Exact paths follow existing `me` / `vendor` / `admin` conventions.

---

## 2. Events (canonical SCREAMING_SNAKE)

`DOCTOR_VERIFIED` · `APPOINTMENT_CREATED` · `CONSULTATION_STARTED` · `CONSULTATION_COMPLETED` · `PRESCRIPTION_ISSUED` · `LAB_BOOKING_CREATED` · `COLLECTION_ASSIGNED` · `SAMPLE_COLLECTED` · `SAMPLE_RECEIVED` · `SAMPLE_PROCESSING` · `REPORT_DRAFTED` · `REPORT_VERIFIED` · `REPORT_PUBLISHED` · `REPORT_AMENDED` · `REPORT_DELIVERY_CREATED` · `REPORT_DELIVERED` · `CONSENT_GRANTED` · `CONSENT_REVOKED`

Envelope: event_id (UUIDv7), occurred_at, country_id, producer, aggregate, **no PHI in payload** (ids + status only).

Idempotency: unique occurrence_key. Consumers: inbox.

---

## 3. Consumers

Notifications (generic copy), ledger facts, CRM flags, search **metadata**, pharmacy Rx queue (id + patient id).

---

## 4. Open

Webhook from SFU; SMS content minimization.
