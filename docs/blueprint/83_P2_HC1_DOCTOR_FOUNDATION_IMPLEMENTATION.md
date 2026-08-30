# 83 — P2-HC-1 Doctor / clinical partner foundation

**Status:** Implemented (foundation only)  
**Authorization:** explicit coding task for P2-HC-1  
**Related:** [64](64_PHASE_2_MASTER_PLAN.md) · [65](65_DOCTOR_ECOSYSTEM.md) · [71](71_HEALTH_RECORD_CONSENT.md) · [75](75_HEALTHCARE_SECURITY_COMPLIANCE.md) · [80](80_PHASE_2_ROADMAP.md)

This slice adds a **doctor partner overlay** on the existing identity and partner kernel. It does not add appointments, video, prescriptions, labs, reports, health-record UX, CRM, live PSP, live DHL, or payouts.

---

## 1. Architecture

Reuse only:

- Person / Account / JWT audiences
- Partner + PartnerApplication + KYC case (unchanged workflow)
- Organization + Membership
- Country policy packs (fail-closed)
- Outbox / BullMQ
- RBAC, RLS, audit, redaction
- UI kit + application shells

Doctor is **not** a second login identity. Flow:

`Person → Partner(DOCTOR) → PartnerApplication → KYC (existing) → DoctorProfile → credentials / memberships`

---

## 2. Files

| Area | Path |
| --- | --- |
| Schema + migration | `packages/database/prisma/schema.prisma`, `migrations/20260827000000_doctor_clinical_foundation` |
| Policy hooks | `apps/api/src/policy/empty-pack.ts`, `document.ts`, `validator.ts`, `resolver.ts` |
| API | `apps/api/src/clinical/*` |
| Admin UI | `apps/web-admin/src/doctors-admin.tsx`, `app/doctors/page.tsx` |
| Doctor web | `apps/web-doctor/**` |
| Doctor mobile | `apps/mobile-doctor/**` |

---

## 3. Database

Additive tables (UUID, `country_id`, indexes, RLS enabled + forced):

- `doctor_profiles` (1:1 partner)
- `doctor_credentials` (number stored, never returned in full)
- `doctor_service_locations`
- `consent_grants`
- `clinical_relationships`
- `clinical_access_audits` (no clinical payload)
- `doctor_verification_reviews`

Enums added: `CredentialReviewStatus`, `ConsentGrantStatus`, `ClinicalRelationshipKind`, `ClinicalRelationshipStatus`.

`JwtAudience.doctor` and `OrganizationKind.INDEPENDENT_PRACTICE` are additive.

---

## 4. API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/doctor/applications` | Policy-gated onboarding via PartnerService |
| GET/PATCH | `/api/v1/doctor/me` | Self only |
| POST/GET | `/api/v1/doctor/me/credentials` | Masked numbers |
| GET | `/api/v1/doctor/me/organizations` | Own memberships |
| GET | `/api/v1/doctor/me/availability` | Placeholder |
| GET | `/api/v1/doctor/me/settings` | Placeholder |
| GET | `/api/v1/admin/doctors` | `doctor:review` + admin audience |
| POST | `/api/v1/admin/doctors/:id/credentials/:id/review` | Metadata only |
| POST | `/api/v1/consent/grants` | Subject grants |
| POST | `/api/v1/consent/grants/:id/revoke` | Subject revokes |
| POST | `/api/v1/clinical/access/evaluate` | Relationship + consent + policy |
| POST | `/api/v1/admin/clinical/relationships` | Admin-only foundation link |

Customers and vendors cannot read doctor credentials. Doctor A cannot read Doctor B via `/doctor/me`.

---

## 5. Security

- JWT audiences: `customer`, `partner_applicant`, `admin`, `doctor`
- RBAC: `doctor:review`, `consent:manage`, `clinical:access:evaluate`
- Org roles: `clinic_doctor`, `hospital_doctor`, `independent_doctor`
- RLS on all new tables
- Credential numbers and KYC/clinical payloads stripped from outbox and logs
- Clinical access is **not** “any doctor sees any customer”
- MFA/TOTP remains the identity kernel; this slice does not add a new OTP vendor

**LEGAL/COMPLIANCE REVIEW REQUIRED** before filling `required_credential_types`, enabling telemedicine, public doctor directories, or any country-specific license rule. Empty packs keep those flags false / arrays empty.

---

## 6. Events

Outbox types (idempotent via `occurrence_key`):

- `DOCTOR_PROFILE_CREATED` / `UPDATED`
- `DOCTOR_CREDENTIAL_SUBMITTED` / `REVIEWED`
- `CONSENT_GRANTED` / `REVOKED`
- `CLINICAL_ACCESS_EVALUATED`

Payloads omit credential numbers and clinical content.

---

## 7. UI

- Doctor web (`apps/web-doctor`, port 3002): auth, profile, credentials, organizations, availability placeholder, settings
- Doctor mobile (`apps/mobile-doctor`): auth, profile, credentials, organizations, settings
- Admin: `/doctors` verification workspace (metadata, not clinical)

---

## 8. Tests

`apps/api/src/clinical/doctor.e2e.spec.ts` plus policy resolver healthcare fail-closed tests, mask unit test, doctor shell tests.

Also run existing Phase 0–1G suites (identity, partner, catalog, cart, payment, order, logistics, finance).

---

## 9. Limitations (explicit)

- No appointments, encounters, chat, LiveKit, prescriptions, labs, samples, pathology, reports, health-record UX, or CRM
- No live PSP / DHL / payout
- Credential *types* are opaque strings; packs do not invent legal license catalogs
- Clinical relationship rows are an access foundation, not a care graph product
- Public doctor visibility remains fail-closed

---

## 10. Open decisions (unchanged)

Country license rules, telemedicine law, real KYC/identity/SMS vendors, cloud, and clinical data residency remain **LEGAL/COMPLIANCE REVIEW REQUIRED** / open decisions in [81](81_PHASE_2_OPEN_DECISIONS.md). This slice does not close them.
