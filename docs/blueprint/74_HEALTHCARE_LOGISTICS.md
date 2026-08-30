# 74 — Healthcare logistics

**Status:** Blueprint — not implemented  
**Related:** [11](11_LOGISTICS_PLATFORM.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md)

Reuse `LogisticsJob` + `CarrierPort`. **Do not** treat samples as pharmacy parcels.

---

## 1. Job types

| Type | Mover | Payload on device |
| --- | --- | --- |
| `MEDICINE_DELIVERY` | APP-DEL | Address, OTP, SKU count — no Rx image |
| `SAMPLE_COLLECTION` | APP-PHE | Slot, checklist, OTP |
| `SAMPLE_TRANSPORT` | APP-DEL or lab courier | Seal ID, from/to, temperature flag |
| `REPORT_DELIVERY` | APP-DEL | Sealed pack, OTP — **no PDF** |

---

## 2. Apps

APP-DEL: medicine + transport + report parcel. APP-PHE: collection only. APP-LOG-W: dispatch, exceptions, SLA — **ops**, not clinical viewer.

Mock carrier remains until live DHL authorized. Sample transport may be **internal fleet** vs carrier — **OD-P2-LOG-01**.

---

## 3. Privacy

Job cards: minimum PII. No lab results. No prescription. Chain events stay in diagnostics DB; logistics stores job_id + exception codes.

---

## 4. Open

Who may transport human specimens; cold-chain sensors; dual-role phlebotomist+rider (**OD-LOG-***).
