# 67 — Prescription ecosystem

**Status:** Blueprint — not implemented  
**Related:** [64](64_PHASE_2_MASTER_PLAN.md) · [06](06_PHARMACY_PLATFORM.md) · [08](08_DOCTOR_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · **R5 implementation plan (canonical for execution)** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · **R5-B UX** [113](113_R5_B_PRESCRIBING_UX_PLAN.md) · **R5-C dispensing** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md)

A prescription is **never globally legally valid**. Country Policy decides: Rx required, controlled class, e-Rx, refill, signature, retention.

**LEGAL/COMPLIANCE REVIEW REQUIRED.**

> **CR-R5-AUTH-111:** For R5 coding architecture (immutable versions, dispensing vs order boundary, OD-RX-REFILL, e-Rx port, app surfaces), treat [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) as the execution SoT. This book remains the domain overview; where aggregates differ (e.g. versioning vs in-place status), **111 wins for implementation**.
>
> **CR-R5-B-IMPL-114:** Prescribing UX implemented — [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) (**R5_B_IMPLEMENTED**).
>
> **CR-R5-C-AUTH-115:** Pharmacy dispensing plan — [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) (**R5_C_PLAN_READY**). Coding not authorized by book 115.
---

## 1. Aggregates

| Entity | Role |
| --- | --- |
| Prescription | Header: doctor, patient, encounter, country, status, issued_at, expires_at |
| PrescriptionItem | SKU/catalog ref **or** free-text (pack), dose, frequency, duration, quantity, instructions, refills |
| PrescriptionSignature | E-sign **abstraction** (hash, provider ref) — not a claimed legal signature |
| PrescriptionStatus | DRAFT, SIGNED, ISSUED, PARTIALLY_DISPENSED, DISPENSED, EXPIRED, CANCELLED, SUPERSEDED |

---

## 2. Medicine reference

Prefer `CatalogVariant` / SKU. If unstructured text allowed by pack, pharmacy Rx desk must still verify ([06](06_PHARMACY_PLATFORM.md)). Controlled medicines: pack `controlled_rx` — extra checks, not hardcoded schedules.

---

## 3. Flow

```
Encounter IN_PROGRESS → Rx DRAFT → SIGNED (consent + pack) → ISSUED
    → HealthArtifact (encrypted)
    → Patient can send to pharmacy
    → Pharmacy Rx queue (membership + consent)
    → Dispense / reject
```

Refills: remaining count on item; pack may forbid.

---

## 4. Pharmacy

Reuse 1E order + Rx verification. Digital Rx is an **input artifact**, not automatic dispense. Substitution: OD-PHARM-09 (customer accept).

---

## 5. Access

Doctor: only own issued Rx + current encounter. Patient: own. Pharmacy: only assigned/sent Rx. Rider/affiliate/CRM: **never** Rx payload.

---

## 6. Open

E-sign legal validity; cross-border Rx; controlled schedules; print vs digital as official.
