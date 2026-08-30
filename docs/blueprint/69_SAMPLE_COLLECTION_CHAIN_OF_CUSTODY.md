# 69 — Sample collection and chain of custody

**Status:** Blueprint — not implemented  
**Related:** [10](10_PHLEBOTOMIST_PLATFORM.md) · [11](11_LOGISTICS_PLATFORM.md) · [68](68_LAB_ECOSYSTEM.md)

Custody is **not** parcel delivery. Logistics moves a **sealed container**; diagnostics owns **sample identity**.

**LEGAL/COMPLIANCE REVIEW REQUIRED** for specimen transport.

---

## 1. Phlebotomist app (APP-PHE)

Join/KYC, availability, offer/accept/reject, navigation, customer verification, **collection OTP**, barcode, specimen checklist, timestamps, optional temperature, handover, failed collection, reschedule, earnings.

Minimum necessary PII. **Never** unrelated clinical history.

---

## 2. Immutable CoC states

Happy path:

```
ASSIGNED → ACCEPTED → ARRIVED → VERIFIED → COLLECTED → SEALED
  → HANDED_OVER → IN_TRANSIT → LAB_RECEIVED → ACCEPTED_BY_LAB → PROCESSING
```

Exceptions (terminal or branch):

`REJECTED` · `DAMAGED` · `LOST` · `TEMPERATURE_EXCEPTION` · `INSUFFICIENT_SAMPLE` · `WRONG_SAMPLE` · `RECOLLECTION_REQUIRED`

Each transition: actor, timestamp, geo if pack allows, photo refs **without** embedding clinical values, previous hash optional (hash chain **OD-P2-COC-01**).

---

## 3. Aggregates

Sample, SampleContainer (barcode), ChainOfCustodyEvent (append-only), CollectionSlot, CollectionAttempt.

LogisticsJob `SAMPLE_COLLECTION` / `SAMPLE_TRANSPORT` reference `sample_id`. Job status ≠ custody status.

---

## 4. Duplicate prevention

One active collection attempt per booking line unless recollection case. Barcode unique. Relabel = new event, not overwrite.

---

## 5. Privacy

Telemetry: exception codes, durations — **no** analyte values, names in logs.
