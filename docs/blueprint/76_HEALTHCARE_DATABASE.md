# 76 — Healthcare database (logical)

**Status:** Blueprint — **no migration in this task**  
**Related:** [20](20_DATABASE_ARCHITECTURE.md) · [64](64_PHASE_2_MASTER_PLAN.md)

When coded: **additive** Prisma only. UUID v7. BIGINT money. `country_id` on operational rows. RLS.

---

## 1. Logical entities

Doctor, DoctorCredential, Clinic, Hospital, Lab, LabCredential, Pathologist, Phlebotomist, Appointment, Encounter, VideoSession, ConsentGrant, Prescription, PrescriptionItem, LabTest, LabPanel, LabBooking, CollectionSlot, Sample, SampleContainer, ChainOfCustodyEvent, LabResult, Report, ReportVersion, ReportDelivery, HealthRecord, ClinicalDocument, ClinicalAccessGrant.

Plus: CareOffer, Slot, EarningLine (ref to ledger), CollectionAttempt.

---

## 2. Principles

- Clinical tables **not** mixed into `orders` / `carts` except FK `order_id` / `payment_intent_id` where payment occurred.
- Report bytes in object storage; DB stores hash, class, version.
- Search documents: non-PHI fields only.
- CoC events **append-only**.
- ReportVersion **insert-only** after PUBLISHED.

---

## 3. Indexes (directional)

Appointment (doctor_id, start_at); Slot unique (offer_id, start_at); Booking (patient_id, created_at); Sample barcode unique; CoC (sample_id, seq); Consent (patient_id, grantee_id, scope).

---

## 4. Residency

`data_residency_mode` on country ([18](18_GLOBALIZATION.md)). Cross-border media/storage **OD-VID-01**, **OD-EHR-04**.

---

## 5. Forbidden

`migrate reset`; dropping commerce tables; PHI in `catalog_search_documents`.
