# 114 — R5-B prescribing UX implementation

**Status:** Implemented (R5-B only)  
**Change ID:** **CR-R5-B-IMPL-114**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_B_IMPLEMENTED**

**Sources:** [113](113_R5_B_PRESCRIBING_UX_PLAN.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authorization boundary:** **R5-B only.** No R5-C dispensing, no Order-from-Rx, no inventory reservation, no payment, no shipment, no refill, no live e-Rx, no country/production healthcare enablement, no live PSP/DHL/payouts.

---

## 0. Confirmations (explicit)

| Item | Status |
|------|--------|
| Pharmacy dispensing (R5-C) | **NOT STARTED** (`NoopDispensingBoundary` reason `r5b_dispensing_not_implemented`) |
| Order creation from prescription | **NO** |
| Inventory reservation / lot consume | **NO** |
| Payment / shipment | **NO** |
| Live e-Rx | **NO** (`NullERxAdapter`) |
| Refill / OD-RX-REFILL | **NOT RESOLVED / NOT IMPLEMENTED** |
| Live PSP / DHL / payout | **NO** |
| Production healthcare | **NO** |
| Duplicate identity/catalog/payment/order kernels | **NO** |

---

## 1. Explicit open decisions resolved in R5-B

| ID | Decision |
|----|----------|
| **OD-R5B-01** | **Hide DRAFT** from customer list/get (404 if draft). Issued/cancelled only. |
| **OD-R5B-02** | **DEFERRED** — no `PATCH …/draft-lines`. Compose locally → create draft (+ optional save-only) → review → issue; recreate draft to change unissued lines. Response note on prescription-context: `od_r5b_02_draft_lines_patch: "deferred"`. |

Unresolved (unchanged): **OD-RX-REFILL**, L-RX-*, OD-PHARM-04, OD-DOC-10 (R5-D), E-R5B-01 catalog hint picker (clinical-concept-only v1).

---

## 2. Migrations

**None.** Reuses R5-A migration `20260827181500_r5a_prescription_foundation`.

---

## 3. API surface (delta vs R5-A)

| Method | Path | Notes |
|--------|------|-------|
| **GET** | `/doctor/encounters/:id/prescription-context` | **NEW** — min encounter/patient/pack/access projection for prescribe chrome |
| GET/POST | `/doctor/prescriptions` (+ issue/amend/cancel) | Unchanged contracts; UX consumers |
| GET | `/customer/prescriptions`, `/:id` | **Behavior:** exclude DRAFT (OD-R5B-01) |
| GET | `/admin/prescriptions`, `/:id` | Unchanged metadata-only |
| PATCH | `/doctor/prescriptions/:id/draft-lines` | **Not implemented** (404) — OD-R5B-02 deferred |

### Store preview contract (preparation only)

`PrescriptionService.storePreviewContractFields()` returns future R5-C field names. **No store routes or dispensing UI.**

### Security / RLS

Existing Person → DoctorProfile → Encounter → Relationship → Consent → Policy → RLS chain remains authoritative. Customer cannot mutate. Admin has no medication-line payload. Cross-doctor encounter context → 404. No company/partner scope bypass. No PHI dumps in logs/events beyond existing audit patterns.

---

## 4. UI surfaces

### Doctor web (`apps/web-doctor`)

| Surface | Behavior |
|---------|----------|
| Encounter panel | **Prescribe** CTA → `sessionStorage` encounter id → `/prescriptions` |
| Prescriptions panel | Wizard: list → select encounter → compose lines → **review + confirm** → create+issue; detail issue/amend/cancel confirms; policy/403/network states |

### Doctor mobile (`apps/mobile-doctor`)

| Surface | Behavior |
|---------|----------|
| Appointment detail | **Prescribe** when encounter exists |
| Prescriptions tab | Encounter picker + context load; compose → review → issue; save draft only; amend/cancel confirms on detail |

### Customer web (`apps/web-customer`)

| Surface | Behavior |
|---------|----------|
| Prescriptions | Read-only list/detail; DRAFT hidden; version “N of M”; prior versions expandable; privacy copy |

### Customer mobile (`apps/mobile`)

| Surface | Behavior |
|---------|----------|
| Prescriptions list/detail | Parity with web: drafts hidden server-side; version history toggle |

### Admin web (`apps/web-admin`)

| Surface | Behavior |
|---------|----------|
| Prescriptions | Metadata + status audit trail; **no** dosage/line dumps |

Shared: `@world-pharma/ui-kit` + shell session states (loading/empty/error/403/session/network/policy).

---

## 5. Notifications / support

Reuse existing outbox contracts from R5-A (generic patient messages; no drug names). Support may reference `prescription` id only — no clinical JSON in tickets. No second notification/support kernel.

---

## 6. Tests & quality gates

| Gate | Result |
|------|--------|
| Typecheck | **18/18** projects green |
| Production web builds | **6/6** (`web-customer`, `web-doctor`, `web-admin`, `web-store`, `web-vendor`, `web-join`) |
| Full `nx run-many -t test` | **11/11** projects; **api 129/129** (+1 R5-B e2e vs R5-A 128) |
| Prescription e2e | R5-A lifecycle + R5-B context/DRAFT-hide/store-contract/no-commerce |
| Customer DRAFT isolation | Asserted |
| Encounter context ownership | Asserted (cross-doctor 404) |
| OD-R5B-02 absent route | 404 |
| Zero order/payment/inventory/shipment deltas | Asserted on R5-A and R5-B paths |

---

## 7. Legal / compliance gates (unchanged)

Do **not** invent prescribing, dosage, licensing, telemedicine, or pharmacy law. Country packs remain fail-closed unless separately enabled. e-Rx validity and refill remain legal ODs. R5-B does **not** enable production healthcare.

---

## 8. Stop line

**R5_B_IMPLEMENTED.** Do **not** start R5-C without a separate authorization CR. R5-C plan (not coding): [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md).

---

**FINAL STATUS: R5_B_IMPLEMENTED**
