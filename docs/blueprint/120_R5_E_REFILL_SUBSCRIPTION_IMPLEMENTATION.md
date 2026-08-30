# 120 — R5-E refill / subscription implementation

**Status:** Implemented (R5-E only)  
**Change ID:** **CR-R5-E-IMPL-120**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_E_IMPLEMENTED**

**Sources:** [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) · [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authorization boundary:** **R5-E only.** No R6. No live e-Rx (R5-F). No live PSP / DHL / payouts. No dedicated pharmacist app. No second commerce/notification kernel. No India/INR/GST hardcoding. **OD-RX-REFILL remains unresolved as law** — engineering default **ED-R5E-01** only.

---

## 0. Confirmations (explicit)

| Item | Status |
|------|--------|
| R5-E refill request / re-auth | **IMPLEMENTED** |
| ED-R5E-01 fail-closed + request/re-auth | **YES** |
| Automatic recurring refill / subscription execution | **OFF** (default; pack `rx_subscription_auto_execute` must be explicitly true and still no scheduler executes payments) |
| Mutate sealed PrescriptionVersion / old Order | **NO** |
| Auto-diagnosis / auto-Rx / silent substitution | **NO** |
| Live PSP / DHL / payouts | **NO** |
| R6 | **NOT STARTED** |

---

## 1. Engineering defaults taken

| ID | Choice |
|----|--------|
| **ED-R5E-01** | Fail-closed pack gate (`rx_refill_enabled`); customer request → `PENDING_REAUTH` → doctor approve → new `DispensingCase` |
| **ED-R5E-02** | New dispense event per refill (`enqueue:refill:{requestId}`); never reuse prior consume |
| **ED-R5E-03** | `RxSubscription` foundation with `autoExecuteEnabled=false`; `tryExecuteDueSubscriptions()` always skips |

**Not silently resolved:** OD-RX-REFILL, OD-DOC-10, E-R5B-01, OD-PHARM-04, OD-PHARM-09, OD-R5E-01…05 legal/product rows.

---

## 2. Migrations / DB

| Migration | Purpose |
|-----------|---------|
| `20260827194000_r5e_refill_subscription` | `refill_requests`, `refill_request_history`, `rx_subscriptions` + enums + base RLS |
| `20260827194100_r5e_refill_doctor_rls` | Prescribing doctor SELECT/UPDATE for re-auth |

**Models:** `RefillRequest`, `RefillRequestHistory`, `RxSubscription`  
**Enums:** `RefillRequestStatus`, `RxSubscriptionStatus`

---

## 3. Policy pack flags (fail-closed)

| Flag | Default |
|------|---------|
| `healthcare.rx_refill_enabled` | `false` |
| `healthcare.rx_refill_require_doctor_reauth` | `true` |
| `healthcare.rx_subscription_enabled` | `false` |
| `healthcare.rx_subscription_auto_execute` | `false` |

---

## 4. APIs

| Method | Path |
|--------|------|
| GET | `/api/v1/customer/prescriptions/:id/refill-eligibility` |
| POST | `/api/v1/customer/refill-requests` |
| GET | `/api/v1/customer/refill-requests` |
| POST | `/api/v1/customer/refill-requests/:id/cancel` |
| GET | `/api/v1/customer/prescriptions/:id/subscription` |
| POST | `/api/v1/customer/prescriptions/:id/subscription/pause\|cancel` |
| GET | `/api/v1/doctor/refill-requests` |
| POST | `/api/v1/doctor/refill-requests/:id/approve\|reject` |
| GET | `/api/v1/admin/refill-requests` |

Commercial handoff after new DISPENSED case: **reuse R5-D** (`/customer/rx-handoff` → 1C–1G).

---

## 5. Refill lifecycle

```
Prior DISPENSED
  → eligibility (pack + ownership + relationship + restrictions + prior dispense)
  → RefillRequest PENDING_REAUTH
  → Doctor APPROVE
  → enqueueForRefill → NEW DispensingCase
  → Store map/complete → NEW DispenseEvent COMPLETE + NEW inventory PICK
  → Patient R5-D handoff → NEW quote → NEW PaymentIntent → NEW Order
```

Sealed versions and prior Orders remain immutable.

---

## 6. Subscription behavior

- Row may exist with status `DISABLED` / `PAUSED` / `CANCELLED`.
- `auto_execute_enabled` defaults **false**; present API advertises auto-refill **OFF**.
- `tryExecuteDueSubscriptions()` returns `{ executed: 0, skipped: 'auto_execute_disabled_ed_r5e_01' }` — **no recurring payment/dispense**.

---

## 7. Payment / idempotency

- Refill request: unique `idempotency_key`.
- Approve/reject: occurrence keys include Idempotency-Key.
- Dispense enqueue: `enqueue:refill:{refillRequestId}` unique.
- Commerce: existing 1D/1E uniqueness (`paymentIntentId`, `dispenseEventId`).

---

## 8. Inventory consume-once proof

E2E: first complete → 1× `rx_dispense` PICK; refill complete → 2× PICK; `onHand` decreases by authorized qty again; prior event not reused.

---

## 9. UI surfaces

| Surface | Behavior |
|---------|----------|
| web-customer / mobile | Eligibility, request/cancel, history, subscription UNAVAILABLE/OFF |
| web-doctor / mobile-doctor | Pending list Approve/Reject |
| web-admin | Refill request id/status list |
| web-store / mobile-store | Optional “Refill cycle” note when `refill_request_id` in case meta |

---

## 10. Security / RLS

Customer own requests; prescribing doctor via doctor_profiles join; platform/worker; subscription customer-owned. Client tenant headers non-authoritative.

---

## 11. Events / notifications

`REFILL_REQUESTED`, `REFILL_APPROVED`, `REFILL_REJECTED` (+ envelope / inbox titles). Reuses outbox kernel.

---

## 12. Finance / logistics

Reuse 1G / 1F on **new** Order only. NULL = UNKNOWN. Mock carrier only.

---

## 13. Tests / quality

See completion report for exact suite counts after full workspace run.

---

## 14. Open / legal gates

OD-RX-REFILL unresolved; auto-refill not assumed legal; country packs control enablement; no prescription auto-renewal.

---

## 15. Explicit non-starts

- **R6 was NOT started.**
- **Live PSP / DHL / FedEx / UPS / bank payouts were NOT started.**
- **Automatic refill remains OFF unless explicitly configured (and still no auto executor in this CR).**
