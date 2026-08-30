# 84 — P2-HC-2 Appointment + consultation foundation

**Status:** Implemented (foundation only)  
**Authorization:** explicit coding task for P2-HC-2  
**Related:** [80](80_PHASE_2_ROADMAP.md) · [83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md)

This slice adds **appointments, doctor availability, booking, reschedule/cancel, and a non-clinical Encounter boundary**. It does not add LiveKit/video, prescriptions, labs, reports, health-record UX, CRM, live PSP, live DHL, or payouts.

---

## 1. Architecture

Reuse P2-HC-1 and identity kernel:

`Person (customer) + DoctorProfile (DOCTOR partner) + CountryPolicy + ConsentGrant + ClinicalRelationship`

Booking does **not** create a second patient identity. Encounter does **not** store diagnosis, notes, Rx, or labs. `video_session_ref` is a reserved null column for P2-HC-3.

Payment: **not charged**. Refund law is **LEGAL/COMPLIANCE REVIEW REQUIRED**. Cancellation records actor + reason code only.

---

## 2. Files

| Area | Path |
| --- | --- |
| Schema + migration | `packages/database/prisma/schema.prisma`, `migrations/20260827100000_appointment_consultation_foundation` |
| Policy | `apps/api/src/policy/empty-pack.ts`, `document.ts`, `validator.ts`, `resolver.ts` |
| API | `apps/api/src/clinical/appointment*.ts`, `schedule.service.ts`, `timezone.ts` |
| Customer web | `apps/web-customer/src/care-api.ts`, `appointments-page.tsx`, `doctors-page.tsx` |
| Doctor web | `apps/web-doctor/src/appointments-panel.tsx`, `availability-panel.tsx` |
| Admin | `apps/web-admin/src/appointments-admin.tsx` |
| Mobile | `apps/mobile-doctor/src/app-root.tsx`, `apps/mobile/src/app-root.tsx` |

---

## 3. Database

Additive tables (UUID, RLS forced, indexes on doctor/customer/org/status + start):

- `doctor_availability_windows` (weekday + local times + IANA timezone)
- `doctor_availability_exceptions`
- `appointments`
- `appointment_status_history`
- `appointment_schedule_revisions` (original times preserved on reschedule)
- `encounters` (no clinical payload)

Overlap of occupying statuses is blocked with `tstzrange` exclusion + `SELECT … FOR UPDATE` on the doctor profile.

---

## 4. API

| Method | Path |
| --- | --- |
| GET | `/api/v1/care/doctors` |
| GET | `/api/v1/care/doctors/:id/slots` |
| POST/GET | `/api/v1/appointments` |
| POST | `/api/v1/appointments/:id/cancel` |
| POST | `/api/v1/appointments/:id/reschedule` |
| PUT/GET | `/api/v1/doctor/me/availability/windows` |
| GET | `/api/v1/doctor/appointments` |
| POST | `/api/v1/doctor/appointments/:id/{confirm,check-in,start,complete,no-show,cancel,reschedule}` |
| GET | `/api/v1/admin/appointments` |

Customer sees own rows. Doctor sees own `DoctorProfile` only. Vendor cannot use admin or doctor routes. Admin requires `appointment:read` / `appointment:manage` and admin audience.

---

## 5. Status machine

`REQUESTED → CONFIRMED → CHECKED_IN → IN_CONSULTATION → COMPLETED`  
Also: cancel, no-show, failed, reschedule. Illegal jumps return Problem+JSON conflict.

Encounter: `PENDING → STARTED → COMPLETED` (created at check-in). Start requires clinical access evaluate (relationship + consent + policy). Booking creates a CARE relationship but does **not** grant historical EHR.

---

## 6. Country policy (fail closed)

Empty pack defaults:

- `appointments_enabled: false`
- `booking_requires_consent: false` (still fail closed for appointments because appointments_enabled is false)
- online type also requires `telemedicine_eligibility`

No India or other country legal rules are populated. **LEGAL/COMPLIANCE REVIEW REQUIRED** before enabling in a real country, including cancellation/refund law.

---

## 7. Events

Outbox + BullMQ: `APPOINTMENT_CREATED|CONFIRMED|RESCHEDULED|CANCELLED|CHECKED_IN`, `ENCOUNTER_STARTED`, `ENCOUNTER_COMPLETED`. Idempotent `occurrence_key`. No clinical/KYC/payment secrets in payloads.

---

## 8. Tests

`apps/api/src/clinical/appointment.e2e.spec.ts` plus transition unit test. Run full API suite for Phase 0–P2-HC-1 regression.

---

## 9. Limitations

- No video tokens or LiveKit
- No appointment pricing / capture
- Doctor directory is authenticated and policy-gated, not a public marketplace
- Mobile remains a shell with appointment sections, not a full native calendar
- Cancellation does not compute refunds
