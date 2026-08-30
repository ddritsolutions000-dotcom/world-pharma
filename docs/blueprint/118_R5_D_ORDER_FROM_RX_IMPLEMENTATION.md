# 118 — R5-D Order-from-Rx commercial handoff implementation

**Status:** Implemented (R5-D only)  
**Change ID:** **CR-R5-D-IMPL-118**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_D_IMPLEMENTED**

**Sources:** [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md)

**Authorization boundary:** **R5-D only.** No R5-E refill. No live e-Rx. No live PSP / DHL / FedEx / UPS. No live payouts. No dedicated pharmacist app. No second cart/payment/order/shipment/finance/notification kernel. No India/INR/GST hardcoding.

---

## 0. Confirmations (explicit)

| Item | Status |
|------|--------|
| R5-D Order-from-Rx commercial handoff | **IMPLEMENTED** |
| ED-R5D-01 | **Option B** — R5-C owns inventory hard consume; R5-D **does not** PICK again |
| OD-DOC-10 | **patient_driven** (customer starts handoff) |
| Auto-Order on prescribe / dispense alone | **NO** |
| Second catalog / payment / order / logistics / finance kernel | **NO** |
| Live PSP / DHL / bank transfer / vendor payout | **NO** |
| R5-E refill / OD-RX-REFILL | **IMPLEMENTED (request/re-auth)** — [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md); auto-refill OFF |
| R5-F live e-Rx | **NOT STARTED** |

---

## 1. Engineering decision — ED-R5D-01 Option B

| Layer | Inventory behavior |
|-------|-------------------|
| **R5-C** `complete` | `consumeForDispense` → `PICK` / `reasonCode: rx_dispense` |
| **R5-D** quote | `skipInventoryHold` → **no** `reserveForCheckout` |
| **R5-D** Order create | **no** `consumeCheckoutReservations` / **no** `order_allocate` PICK |
| **1E non-Rx** | Unchanged soft-hold → consume path |

Order flags: `rxInventoryConsumedAtDispense = true`, unique `dispenseEventId`.

---

## 2. Migrations / DB

| Migration | Purpose |
|-----------|---------|
| `20260827192000_r5d_order_from_rx` | Cart/checkout skip-hold + dispense linkage; Order Rx linkage + unique `dispense_event_id`; `rx_commerce_handoffs` + RLS |

**Models / columns**

- `Cart`: `skipInventoryHold`, `dispensingCaseId`, `dispenseEventId`
- `CheckoutSession`: same skip/linkage fields
- `Order`: `dispensingCaseId`, `dispenseEventId` (unique), `prescriptionId`, `prescriptionVersionId`, `rxInventoryConsumedAtDispense`
- `RxCommerceHandoff`: idempotent handoff key per dispense event; cart/order pointers; customer RLS

---

## 3. API surface

| Method | Path | Role |
|--------|------|------|
| GET | `/api/v1/customer/prescriptions/:id/commerce-eligibility` | Patient eligibility + commercial items |
| POST | `/api/v1/customer/rx-handoff` | Seed Rx cart (`Idempotency-Key` required) |

Handoff then reuses existing:

- `/api/v1/me/cart*` · `/api/v1/me/checkout/sessions*` · `/api/v1/me/checkout/sessions/:id/pay` · `/api/v1/me/orders`

**Eligibility rejects:** DRAFT / CANCELLED / EXPIRED Rx; non-DISPENSED cases; missing COMPLETE event; missing mappings; foreign patient; existing Order for `dispenseEventId`.

**Payment gate (1D unchanged):** only server-confirmed `CAPTURED` or permitted `AUTHORIZED_COD` creates Order. `CREATED` / `PROCESSING` / `REQUIRES_ACTION` / `UNKNOWN` / `FAILED` / client redirect → zero Order.

---

## 4. Flow

```
DISPENSED case + COMPLETE event
  → GET commerce-eligibility
  → POST rx-handoff (idempotent RxCommerceHandoff + seed cart skipInventoryHold)
  → address + quote (no soft reserve) + pay (sandbox CAPTURED)
  → Order (unique payment_intent_id + unique dispense_event_id; no second PICK)
  → 1E fulfillment → 1F mock shipment → 1G sandbox facts
```

---

## 5. Inventory consume-once proof

E2E `rx-handoff.e2e.spec.ts`:

1. After dispense: one `PICK` with `reasonCode: rx_dispense`; `onHand` reduced.
2. After Order: `onHand` **unchanged**; `order_allocate` PICK count **0**; `rx_dispense` PICK count still **1**.
3. Duplicate order create → same Order id; one row per `dispenseEventId`.

---

## 6. Events / notifications

| Type | When |
|------|------|
| `RX_CHECKOUT_STARTED` | First successful handoff seed (occurrenceKey = handoff key) |
| `RX_HANDOFF_ELIGIBLE` | Envelope contract reserved |

Reuses existing outbox + notification kernel. No second notification system.

---

## 7. UI surfaces

| Surface | Behavior |
|---------|----------|
| **web-customer** | Eligibility prefetch, SKU review, Order medicines CTA, Rx banners on cart/checkout, order Rx linkage, support correlation ids |
| **mobile** | Parity handoff + checkout Rx banner |
| **web-store / mobile-store** | Case `order_id`; Rx-origin order badge where linked |
| **web-doctor / mobile-doctor** | Read-only `dispensing_status` + `commercial_status` |
| **web-admin** | Commerce handoff section (ids only) |

No pharmacist app. No second Partner App.

---

## 8. Security / RLS

- Patient isolation on handoff + cart/checkout/order
- Store org/location scope unchanged for fulfillment
- Doctor read-only commercial status (no payment/order mutate)
- `rx_commerce_handoffs` RLS: customer own + worker/platform
- Client tenant headers remain non-authoritative

---

## 9. Finance

Reuses 1G sandbox facts from actual payment/order/shipment events only. NULL remains NULL/UNKNOWN. No invented profit / tax / freight / gateway fees. No live payout.

---

## 10. Tests

| Suite | Result |
|-------|--------|
| Full workspace `nx run-many -t test` | **11 projects** green |
| `api:test` | **51** suites / **132** tests |
| `rx-handoff.e2e.spec.ts` | **2** tests (happy path consume-once + foreign/missing rejection) |
| Prior R5-A/B/C + 1C–1G covered within api suite | Regression green |

Focused smoke also re-ran: `rx-handoff`, `dispensing.e2e`, `prescription`, `order.e2e`, `payment.e2e`, `rls`, `tenancy`, `isolation` → **8** suites / **29** tests.

---

## 11. Open decisions / legal gates

| Item | Status |
|------|--------|
| OD-RX-REFILL | Unresolved — R5-E coding not authorized; plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) |
| Live e-Rx | R5-F + legal |
| Live PSP / carrier / payout | Separate production CRs |
| Country pack enablement of pharmacy + payments | Pack-authoritative; no India hardcoding |

---

## 12. Explicit non-starts

- **R5-E was NOT started.**
- **Live PSP / DHL / FedEx / UPS / bank payouts were NOT started.**
