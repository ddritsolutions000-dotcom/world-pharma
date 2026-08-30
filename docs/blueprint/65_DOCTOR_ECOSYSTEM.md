# 65 — Doctor ecosystem (clinic, hospital, consult)

**Status:** Blueprint — not implemented  
**Related:** [64](64_PHASE_2_MASTER_PLAN.md) · [08](08_DOCTOR_PLATFORM.md) · [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · [66](66_TELEMEDICINE_VIDEO.md) · [67](67_PRESCRIPTION_ECOSYSTEM.md) · **R5 plan** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md)

**LEGAL/COMPLIANCE REVIEW REQUIRED** before enabling telemedicine, advertising, fee-splitting, or cross-border consults in any pack.

---

## 1. Purpose

Operating model for **licensed professionals and care organizations** on the shared partner kernel. World Pharma is **not** a hospital HIS.

Partner types (locked catalog): `DOCTOR`, `CLINIC`, `HOSPITAL`. **OD-PTR-04** keeps HOSPITAL and CLINIC as separate codes.

---

## 2. Join / KYC

Reuse [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md): applicant → KYC → credentials → ACTIVE.

Doctor profile (post-ACTIVE, type-specific — **not** a second User):

| Field class | Examples | Notes |
| --- | --- | --- |
| Identity | Person, memberships | Kernel identity |
| Credentials | License number, issuer, expiry, country | Verified; pack-defined document types |
| Practice | Specialties, years, languages | Search **non-PHI** |
| Commercial | Consult products, fee, currency | Money BIGINT + currency |
| Availability | Calendar rules, slots | Optimistic lock |

Clinic/hospital: Organization + Locations + roster of doctors. Hospital = facility partner, **not** inpatient EMR.

---

## 3. Apps

| App | Jobs |
| --- | --- |
| APP-DOC | Queue, join call, notes, Rx, earnings, notifications |
| APP-DOC-W | Calendar density, roster, reports, KYC upload |
| APP-CUS-* | Discovery, book, waiting room, consult, Rx |
| APP-ADM | KYC queue, incidents, policy flags |

Doctor token `aud` must not grant customer commerce admin. A doctor using the customer app does **not** inherit `encounter:write`.

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| DoctorProfile | Professional overlay on Person + Partner |
| DoctorCredential | License/qualification artifacts (KYC docs, not logs) |
| Clinic / Hospital | Org + locations |
| CareOffer | Video/audio/chat SKU, fee, duration, pack flags |
| Calendar / Slot | Availability generation |
| Appointment | Booked slot, parties, status |
| Encounter | Clinical session; notes encrypted |
| ConsentGrant | Scope for this relationship |
| EarningLine | Amount → ledger (1G) |

---

## 5. Appointment state machine

```
DRAFT → HELD → CONFIRMED → WAITING → IN_PROGRESS → COMPLETED
                              ↓
                         NO_SHOW / CANCELLED → REFUND_PENDING (payment kernel)
```

Illegal jumps = 409. Completion is **server-side** (doctor/system complete), **not** browser redirect ([66](66_TELEMEDICINE_VIDEO.md)).

Concurrency: slot unique; double-book prevented by DB constraint.

---

## 6. Access

Doctor sees a patient **only if**:

1. Active Appointment/Encounter with that patient, **and**
2. Valid ConsentGrant for required scopes, **or**
3. Pack-defined emergency **break-glass** with reason + audit (**LEGAL REVIEW**)

No global patient search of clinical records. Discovery search = professional directory only (name, specialty, languages, fee band — pack).

---

## 7. Earnings / settlement

Consultation capture → financial facts ([73](73_HEALTHCARE_PAYMENTS_SETTLEMENT.md)). Doctor payable is **not** vendor marketplace payable. Configurable split — **no hardcoded %**. Mock payout until live rail authorized.

Cancellation / no-show / refund: pack policy; payment kernel refunds; ledger reversing facts. **Do not invent** cancellation fees.

---

## 8. Audit

All encounter open, note save, Rx issue, consent, break-glass: audit. Never log note body, Rx items, or video tokens in plaintext logs.

---

## 9. Open

OD-DOC-01 queue vs slots; OD-DOC-04 take-rate vs SaaS; OD-DOC-11 employed vs independent; cross-border consult; e-sign legal validity ([81](81_PHASE_2_OPEN_DECISIONS.md)).
