# 68 — Lab ecosystem (catalog, booking, processing)

**Status:** Blueprint — not implemented  
**Related:** [09](09_LAB_PLATFORM.md) · [10](10_PHLEBOTOMIST_PLATFORM.md) · [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) · [70](70_PATHOLOGY_REPORTING.md)

**LEGAL/COMPLIANCE REVIEW REQUIRED** for diagnostic marketplace, home collection, official e-reports.

World Pharma is **not** a hospital LIS/HIS.

---

## 1. Onboarding

Partner types `LAB`, `PATHOLOGIST`, `PHLEBOTOMIST`. KYC via [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). LabCredential: licenses, locations, pack-defined accreditations (no invented marks).

---

## 2. Catalog (lab-owned, country-scoped)

| Object | Fields (logical) |
| --- | --- |
| LabTest | code, specimen_type, preparation, TAT, home_collection flag, location, country |
| LabPanel | included tests; incomplete panel **blocked** (OD-CUS-10) |
| LabPriceVersion | BIGINT + currency; freeze on booking |
| Slot | home vs center; capacity |

No hardcoded medical fasting rules in code — **content** from lab + pack warnings.

---

## 3. Booking state machine

```
DRAFT → QUOTED → PAYMENT_PENDING → CONFIRMED
  → COLLECTION_ASSIGNED → COLLECTED → IN_TRANSIT → LAB_RECEIVED
  → PROCESSING → RESULT_ENTERED → VERIFIED → REPORT_PUBLISHED
  → (optional) PHYSICAL_DISPATCH → DELIVERED
```

Exceptions: PAYMENT_FAILED, CANCELLED, RECOLLECTION_REQUIRED, REJECTED.

Idempotency: `Idempotency-Key` on pay/book. Unique `(payment_intent_id)` / `(booking_id, collection_attempt)`.

---

## 4. Customer flow (logical)

Select test → address → slot → **PaymentPort** → booking → assign phlebotomist → collection → sample IDs → transport job → lab receipt → processing → pathologist → notify → digital report → optional physical delivery job.

---

## 5. Apps

APP-LAB-W (ops, catalog, accession), APP-LAB-S (floor), APP-PATH (sign), APP-PHE (collection), APP-CUS (book/track), APP-DEL (transport/report parcel), APP-ADM (KYC/incidents).

---

## 6. Isolation

Lab A never sees Lab B cases. Pathologist only assigned worklist. Rider never gets PDF. Phlebotomist: name, address, phone, specimen checklist — **not** full EHR.

---

## 7. Open

OD-LAB-01 home vs center first; official digital report; pathologist e-sign; TAT SLA legal meaning.
