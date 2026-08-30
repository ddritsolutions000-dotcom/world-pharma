# 116 — R5-C pharmacy dispensing implementation

**Status:** Implemented (R5-C only)  
**Change ID:** **CR-R5-C-IMPL-116**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_C_IMPLEMENTED**

**Sources:** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [06](06_PHARMACY_PLATFORM.md) · [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md)

**Authorization boundary:** **R5-C only.** No R5-D Order-from-Rx / payment / shipment side effects. No refill. No live e-Rx. No dedicated pharmacist app. No second identity / Partner App / payment / carrier / finance / notification kernel. No India/INR/GST hardcoding. No invented pharmacy or controlled-medicine law.

---

## 0. Confirmations (explicit)

| Item | Status |
|------|--------|
| Pharmacy dispensing (R5-C) | **IMPLEMENTED** (`DispensingService` as `DISPENSING_BOUNDARY`) |
| Order creation from dispense | **NO** |
| Payment / shipment from dispense | **NO** |
| Inventory consume on complete | **YES** (1B PICK / `consumeForDispense`; OD-R5C-02 hard consume) |
| Soft allocate / checkout reservation | **NO** (OD-R5C-02 soft eligibility only) |
| Partial dispense | **NO** (OD-R5C-01 `full_line_only`) |
| Silent substitution | **NO** (fail-closed / explicit confirm only when line allows) |
| Live e-Rx | **NO** |
| Refill / OD-RX-REFILL | **NOT RESOLVED / NOT IMPLEMENTED** — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**) |
| R5-D commercial handoff | **IMPLEMENTED** — see [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) |
| Live PSP / DHL / payout | **NO** |
| Duplicate identity/catalog/payment/order kernels | **NO** |

---

## 1. Explicit open-decision defaults taken in R5-C

| ID | Choice (Book 115) |
|----|-------------------|
| **OD-R5C-01** | **full_line_only** — quantity must equal authorized; no partial |
| **OD-R5C-02** | Soft eligibility before complete; **hard consume on complete** (no checkout reservation) |
| **OD-R5C-03** | **Supersede** open cases on amend; enqueue for new version |
| **OD-R5C-04** | **enqueue_on_issue** — `QUEUED` case (often null org/location); store **claims** |
| **OD-PHARM-04** | **still_verify** — validate → authorize before map/complete |

**Unresolved (not silently resolved):** OD-RX-REFILL, OD-DOC-10 (R5-D), E-R5B-01, OD-PHARM-09 path fail-closed when substitution not allowed / not confirmed.

---

## 2. Migrations / DB

| Migration | Purpose |
|-----------|---------|
| `20260827190000_r5c_pharmacy_dispensing` | `dispensing_cases`, `dispense_events`, `dispense_line_mappings` + enums + base RLS |
| `20260827190100_r5c_dispensing_rls_enqueue` | WITH CHECK allow doctor enqueue with null org (OD-R5C-04) |
| `20260827190200_r5c_dispensing_rls_queue_visibility` | Same-country `PHARMACY_OWNED` members can **read** unassigned `QUEUED` cases |

**Models:** `DispensingCase`, `DispenseEvent`, `DispenseLineMapping`  
**Enums:** `DispensingCaseStatus`, `DispenseEventKind`  
**RLS:** store `can_org` after claim; queue visibility for unassigned QUEUED; patient/doctor via prescription join; platform/worker.

---

## 3. API surface

### Store (pharmacy desk)

| Method | Path |
|--------|------|
| GET | `/api/v1/store/dispensing-cases` |
| GET | `/api/v1/store/dispensing-cases/:id` (claimed only; clinical lines) |
| POST | `/api/v1/store/dispensing-cases/:id/claim` |
| POST | `/api/v1/store/dispensing-cases/:id/validate` |
| POST | `/api/v1/store/dispensing-cases/:id/reject` |
| POST | `/api/v1/store/dispensing-cases/:id/authorize` |
| POST | `/api/v1/store/dispensing-cases/:id/map-lines` |
| POST | `/api/v1/store/dispensing-cases/:id/complete` |
| GET | `/api/v1/store/dispensing-lots?variant_id=` |

### Admin

| Method | Path |
|--------|------|
| GET | `/api/v1/admin/dispensing-cases` | Operational metadata only (no dosage/lines) |

### Prescription presenters (R5-A/B reuse)

Doctor/customer prescription payloads expose safe `dispensing_status` / case id references. No pharmacy lot/inventory internals.

### Workflow

`ISSUE` → enqueue `QUEUED` → store **claim** → validate → authorize → map lines (catalog + lot + qty) → **complete** (inventory consume + `FULLY_DISPENSED`) | reject | fail.

Amend: supersede open cases + enqueue new version (OD-R5C-03).

---

## 4. Inventory (1B reuse)

`InventoryService.consumeForDispense`:

- Lot lock / concurrency
- Expiry + ACTIVE status guards (quarantine/damaged blocked)
- Quantity / no-negative stock
- Consume-once via PICK movement `refType: DispenseEvent`
- FEFO remains UI/hint ordering only — not a legal claim

---

## 5. UI surfaces

| Surface | Behavior |
|---------|----------|
| **Store web** (`apps/web-store`) | **Rx desk** tab: queue, claim, validate, authorize, map lots, complete, reject, history; loading/empty/error/403/session/network |
| **Store mobile** (`apps/mobile-store`) | Equivalent Rx desk on shared RN/Expo Android+iOS |
| **Customer web** | Safe `dispensing_status` read-only; cannot edit Rx/dispense |
| **Doctor web** | Dispense status read-only; no dispense mutation |
| **Admin web** | Dispensing case list (metadata/audit); no medication lines |

No dedicated pharmacist app. Store Web + Store Mobile only.

---

## 6. Security / tenancy

- Server-side assert store org/location + pharmacy-owned kind + pack `rx_dispense_enabled`
- Claimed case hard org/location isolation; unclaimed clinical detail withheld until claim
- Clinical prescription/version reads for pharmacy desk via controlled worker elevation after ACL (prescription RLS remains patient/doctor-centric)
- Prescription `FULLY_DISPENSED` update on complete under worker elevation on same tx
- Tenant interceptor keeps ALS `ctx` aligned with GUCs (prevents nested `runWithTenant` restore wipe)
- Packer SoD cannot verify/dispense
- Admin: metadata only
- No PHI in outbox payloads beyond ids; audit security events on mutations
- Country packs fail-closed

---

## 7. Notifications / support

Reuse existing outbox (`DISPENSING_CASE_QUEUED`, `DISPENSING_COMPLETED`, `DISPENSING_REJECTED`). No second notification system. Support: minimum-necessary case/prescription id references only — no clinical copy into generic tickets.

---

## 8. R5-D handoff contract (non-start)

R5-C completion boundary: **DispenseEvent COMPLETE + inventory consume + Rx status**. Responses include explicit `commerce: { order: false, payment: false, shipment: false }`. **No** Order/Payment/Shipment side effects. **R5-D coding NOT STARTED.**

Canonical R5-D plan (authorization for design only): [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) (**CR-R5-D-AUTH-117**, **R5_D_PLAN_READY**). Critical follow-on: inventory consume-once reconciliation (**ED-R5D-01**) before any IMPL.

---

## 9. Tests & quality gates

| Gate | Result |
|------|--------|
| `dispensing.e2e.spec.ts` | 1/1 — claim→complete; isolation; no silent substitution; zero order/payment/shipment; admin no dosage |
| Full `nx run-many -t test` | **11/11** projects; **api 130/130** (+1 R5-C e2e vs R5-B 129) |
| Typecheck | **18/18** projects green |
| Production web builds | **6/6** (`web-customer`, `web-doctor`, `web-admin`, `web-store`, `web-vendor`, `web-join`) |
| Mobile typecheck | `mobile`, `mobile-store`, `mobile-doctor`, `mobile-delivery` |

R0–R4 prior suites remain green within the full workspace run.

---

## 10. Legal / compliance gates (unchanged)

Do **not** invent pharmacy, controlled-drug, tax, or country dispensing law. Validity fail-closed when window unset. Substitution never silent. Refill and e-Rx remain separate legal ODs. Production healthcare enablement remains separate.

---

## 11. Stop line

**R5_C_IMPLEMENTED.** Do **not** start R5-D without a separate authorization CR.

---

**FINAL STATUS: R5_C_IMPLEMENTED**
