# 117 — R5-D Order-from-Rx / pharmacy commercial handoff plan

**Status:** Plan complete — **implemented by [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md)**  
**Change ID:** **CR-R5-D-AUTH-117** (plan) → **CR-R5-D-IMPL-118** (code)  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_D_PLAN_READY** (historical) · implementation status **R5_D_IMPLEMENTED** in Book 118

**Sources of truth:**  
[111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**R5_C_IMPLEMENTED**) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) · [35](35_OPEN_DECISIONS.md) (**OD-DOC-10**, **OD-RX-REFILL**, **OD-PHARM-04**, **OD-PHARM-09**) · [06](06_PHARMACY_PLATFORM.md) · [25](25_UI_UX_ARCHITECTURE.md) · [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md)

**Prerequisite:** R5-A/B/C live; 1C–1G sandbox commerce kernels live.

**Authority boundary (this Book 117 CR):** Originally **PLAN ONLY.** Production coding for R5-D was authorized and completed under **CR-R5-D-IMPL-118**. Do **not** start R5-E under this document.

---

## 0. Purpose and non-goals

### Purpose

Define the complete **R5-D commercial handoff** engineering contract so a future **CR-R5-D-IMPL-*** can take an authorized, completed pharmacy dispense into the existing **1C → 1D → 1E → 1F → 1G** chain **without** duplicating kernels, double-consuming inventory, or collapsing Prescription / DispensingCase / Order into one object.

### Layer separation (must stay distinct)

| Layer | Kernel | Truth |
|-------|--------|-------|
| **Prescription** (+ immutable version/lines) | R5-A | Clinical authorization artifact |
| **DispensingCase / DispenseEvent** | R5-C | Pharmacy workflow + dispense facts (incl. catalog/lot mapping) |
| **Cart / CheckoutQuote** | 1C | Frozen commercial offer |
| **PaymentIntent** | 1D | Server payment fact |
| **Order / FulfillmentGroup** | 1E | Commercial fulfillment SoT |
| **Shipment** | 1F | Logistics (mock only today) |
| **FinancialFact / Journal** | 1G | Sandbox ledger facts |

```
DISPENSED DispenseEvent (clinical + lot mapping)
  → patient commercial intent (OD-DOC-10 default: patient-driven)
      → Cart lines from mapped catalog variants (1C)
          → CheckoutSession + immutable CheckoutQuote
              → PaymentIntent (1D)
                  → Order (1E) only on CAPTURED | permitted AUTHORIZED_COD
                      → pick/pack/READY_TO_SHIP (ops) → mock book (1F)
                          → finance facts (1G)
```

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations | Plan only |
| Auto-Order on prescribe or dispense alone | Boundary lock |
| R5-E refill / OD-RX-REFILL product | Separate phase + legal |
| Live e-Rx / NullERx override | R5-F + legal |
| Live PSP / DHL / bank transfer / vendor or affiliate payout | Separate production CRs |
| Second cart/payment/order/shipment/ledger/notification kernel | Ecosystem lock |
| Silent clinical→SKU reprice or PrescriptionVersion rewrite | Clinical immutability |
| Invented GST/VAT/COD/pharmacy law | Legal/pack |
| Dedicated pharmacist app | Topology lock |

---

## 1. Current-state audit (implemented vs planned)

### 1.1 Commerce kernels (1C–1G) — **IMPLEMENTED (sandbox)**

| Phase | Status | What exists today | Still open / stub |
|-------|--------|-------------------|-------------------|
| **1C** | Done | Cart; `CheckoutSession`; append-only `CheckoutQuote`; server pricing; soft `CHECKOUT` reservation (TTL ~15m); promo/affiliate snapshots; Idempotency-Key | Tax `UNKNOWN`/0 stub; shipping `UNAVAILABLE`/0 stub; no Rx-dispense → cart builder |
| **1D** | Done | `PaymentIntent` SM; amount from frozen quote; Mock gateway; 3DS redirect ≠ success | Live PSP CR; present() copy drift (“no order”) vs CAPTURED auto-order |
| **1E** | Done | Order from CAPTURED / AUTHORIZED_COD; unique `paymentIntentId`; consume checkout reservations → PICK; FulfillmentGroup; pick/pack → READY_TO_SHIP | No `dispensingCaseId` / `dispenseEventId` link; `OrderItem.rxRequired` not populated from assortment in create path |
| **1F** | Done | Draft shipment at order create; mock book on READY; carrier cost NULL≠0 | Live carrier CR |
| **1G** | Done | Facts/journals/contribution on order/payment/carrier; NULL = UNKNOWN; mock payout | Real tax; affiliate payable when clinical rules allow; live payout |

**Happy path (non-Rx today):**  
`Cart → quote (+ soft holds) → PaymentIntent → Order (ALLOCATED, holds CONSUMED) → pick/pack → READY_TO_SHIP → mock shipment → finance facts`.

**Key runtime anchors:**

- Cart/checkout: `apps/api/src/cart/cart.service.ts`
- Payment: `apps/api/src/payment/payment.service.ts` + `state-machine.ts`
- Order: `apps/api/src/orders/order.service.ts` (`insertFromPayment`, `assertEligiblePayment`)
- Inventory: `reserveForCheckout` / `consumeCheckoutReservations` / `consumeForDispense` in `apps/api/src/inventory/inventory.service.ts`
- Logistics: `apps/api/src/logistics/logistics.service.ts` (MockCarrierAdapter)
- Finance: `apps/api/src/finance/finance.service.ts`

### 1.2 R5 clinical layers — **IMPLEMENTED through R5-C**

| Layer | Status | Boundary held |
|-------|--------|---------------|
| **R5-A** | Done | Prescription / versions / lines / RLS / pack gates |
| **R5-B** | Done | Doctor prescribe UX; customer read; no commerce |
| **R5-C** | Done | DispensingCase workflow; hard consume on complete; **no** Order/Payment/Shipment |

Cart already has optional `prescription_case_id` and quote gate `RX_REQUIRED` when assortment requires Rx — this is a **stub hook**, not R5-D handoff.

### 1.3 Explicit R5-C ↔ commerce conflict (inventory)

| Event | Inventory effect today |
|-------|------------------------|
| R5-C `complete` | **Hard PICK** `refType=DispenseEvent`, `onHand−` (`consumeForDispense`); **no** checkout reservation |
| 1E Order create | Consumes OPEN `CHECKOUT` reservations → **PICK** `refType=Order`, `reserved−` + `onHand−` |

**Conflict:** After R5-C complete, sellable `available` is already reduced. A naive R5-D that reuses vanilla checkout reserve → Order consume will either:

1. fail soft-reserve (`Insufficient available quantity`), or  
2. double-consume if stock is topped up / bypassed.

**There is no inventory handoff contract in code today** — only `commerce.r5d_handoff: false` and an enqueue-only `DispensingBoundaryPort`.

This plan introduces **ED-R5D-01** (engineering decision) to resolve consume ownership **before** any IMPL CR writes code. See §7.

---

## 2. Order-from-Rx boundary

### 2.1 Object identity

| Object | May create Order? |
|--------|-------------------|
| Draft Prescription | **No** |
| Issued Prescription alone | **No** |
| Cancelled / expired Prescription | **No** |
| DispensingCase `QUEUED` / `VALIDATING` / `AUTHORIZED_TO_DISPENSE` / `DISPENSING` / `FAILED` / `REJECTED` / `SUPERSEDED` | **No** |
| DispenseEvent **COMPLETE** + case `DISPENSED` | **Eligible to start commercial handoff** (not auto-Order) |
| Client redirect / browser return | **No** |
| UNKNOWN / FAILED / PROCESSING payment | **No** |
| CAPTURED prepaid or permitted AUTHORIZED_COD | **Yes** (existing 1D/1E) |

**Prescription ≠ DispensingCase ≠ Order.** Linking is referential only.

### 2.2 Eligibility gate (server)

Commercial handoff may start only when **all** hold:

1. Prescription status dispensable and not cancelled/expired; version is current sealed version  
2. DispensingCase status = `DISPENSED`  
3. Completing DispenseEvent exists; line mappings cover full authorized qty (OD-R5C-01 already enforced at complete)  
4. Patient principal owns the prescription subject  
5. Country pack enables pharmacy + commerce paths used  
6. Mapped catalog variants still commercially offerable in country (price/offer live at quote time — clinical lines remain immutable)  
7. No existing successful Order already bound to this handoff key (§6)

**AUTHORIZED_TO_DISPENSE alone is insufficient** — incomplete dispensing must not enter checkout (user requirement: no Order on incomplete dispensing).

### 2.3 Who initiates (OD-DOC-10)

| ID | Status | Plan default until decided |
|----|--------|----------------------------|
| **OD-DOC-10** | **OPEN** | **Patient-driven** “Order medicines” from eligible DISPENSED case — **not** auto-add to cart on dispense complete |

Pharmacy-assisted checkout (P-RX-01) remains a product OD; v1 plan assumes **customer app initiates** cart seed from eligible dispense.

### 2.4 Pickup vs delivery

Commercial ownership still requires an **Order** even for store pickup (Book 115 §7.2). Delivery uses existing 1F mock path after READY_TO_SHIP. Store last-mile default remains **OD-PHARM-01** (stores dispatch).

---

## 3. Quote / price (1C reuse)

### 3.1 How an Rx-derived purchase obtains a frozen quote

1. Customer selects eligible `DISPENSED` case → server builds **commercial line candidates** from `DispenseLineMapping` (catalog_item / variant / qty) — **not** from rewriting clinical concept text  
2. Lines enter **Cart** (same seller/org as dispensing location’s pharmacy org) with linkage fields (planned): `dispensing_case_id`, `dispense_event_id`, `prescription_id`, `prescription_version_id`, optional `prescription_line_id`  
3. Existing `startCheckout` → `quoteSession` creates append-only **CheckoutQuote**  
4. Soft `CHECKOUT` reservation behavior is subject to **ED-R5D-01** (§7) — do not assume vanilla reserve works after R5-C hard consume  

### 3.2 Snapshot matrix (at quote freeze)

| Snapshot | Source | Rule |
|----------|--------|------|
| Product / catalog mapping | DispenseLineMapping → CatalogVariant / Offer | Must match dispensed SKU; **no silent re-substitution** at quote (OD-PHARM-09). If offer missing → fail closed |
| Price | `PricingService.quote` / price_version_id | Server-only; client amounts ignored (`AMOUNT_TAMPER`) |
| Tax | Existing stub `taxStatus=UNKNOWN` | Do **not** invent GST/VAT; pack port later |
| Promo | Existing promo applications on session | Applied preview; not settled until 1G |
| Affiliate | Existing attribution snapshot | Clinical-blocked / payable=false rules preserved unless pack later allows |
| Shipping | Existing shipping stub / fulfillment address | Address on session; shippingMinor may remain UNAVAILABLE until pack |
| Address | CheckoutSession.addressId | Customer own address only |
| Economics | Deferred to Order economics snapshot (1E) | No fake profit |

### 3.3 Clinical immutability

- Do **not** modify `PrescriptionVersion` / lines  
- Do **not** reprice “clinical facts” — only commercial offer prices  
- Dosage / clinical labels are not quote inputs  

---

## 4. Customer checkout journey

```
Rx list/detail (clinical)
  → dispensing_status = DISPENSED (safe commercial CTA appears)
      → “Order medicines” (OD-DOC-10 patient-driven)
          → review eligible mapped SKUs (commercial labels only)
              → Cart seeded
                  → CheckoutSession + frozen CheckoutQuote
                      → PaymentIntent (1D sandbox)
                          → Order (1E) on CAPTURED | AUTHORIZED_COD
                              → fulfillment / tracking
```

**Reuse only:** existing cart, checkout, pay, orders APIs.  
**No** second cart/payment/order system.  
**Separate** clinical panels from commercial panels in UI (§10).

---

## 5. Payment boundary (1D — preserve)

| Intent status | Creates Order? |
|---------------|----------------|
| `CAPTURED` | **Yes** |
| `AUTHORIZED_COD` + COD method + country COD allowed | **Yes** |
| `AUTHORIZED` (card hold) | **No** until capture → CAPTURED |
| `CREATED`, `REQUIRES_ACTION`, `PROCESSING`, `UNKNOWN`, `FAILED` | **No** |
| Browser redirect / client claim alone | **No** |

Amount/currency **only** from frozen CheckoutQuote. Failover pre-submit only; timeout → UNKNOWN (no auto second gateway).

---

## 6. Idempotency

### 6.1 Preserve existing

| Mechanism | Role |
|-----------|------|
| `Order.paymentIntentId` `@unique` | One Order per payment intent |
| Checkout / money `Idempotency-Key` + `idempotency_records` | Retry-safe POSTs |
| PaymentIntent id uniqueness | Money SoT |
| Concurrent create convergence | `FOR UPDATE` + P2002 fallback in Order create |

### 6.2 New R5-D handoff key (planned)

Introduce a **server-owned handoff idempotency key**, conceptual form:

```
rx_handoff:{dispensing_case_id}:{dispense_event_id}
```

Rules:

- Seeding cart / starting checkout from a dispense must converge on the same handoff record  
- Completing payment → Order must not create a second Order for the same `dispense_event_id`  
- Retries, webhooks, double POSTs, and concurrent customers must not duplicate Orders  
- Key is **orthogonal** to `payment_intent_id` uniqueness (both required)

**ED-R5D-02:** Persist handoff as dedicated row vs opaque idempotency_records entry — engineering choice in IMPL CR.

---

## 7. Inventory — avoid double consumption (**critical**)

### 7.1 Problem statement

R5-C **already hard-consumes** on dispense complete (**OD-R5C-02**).  
1E **also hard-consumes** at Order create via checkout reservation consume.

**Do not silently consume twice.**

### 7.2 Engineering decision (must resolve in IMPL CR — not silently in product law)

| ID | Decision | Owner |
|----|----------|-------|
| **ED-R5D-01** | Who owns the final sellable PICK for Rx-commerce units? | engineering (+ ops review) |

#### Options (no silent pick in this plan CR)

| Option | Summary | Implication |
|--------|---------|-------------|
| **A. Defer consume to Order** | Reverse/soften R5-C hard consume; soft-hold at desk; PICK only in 1E | Aligns Book 111 §9; requires R5-C behavior CR + migration of existing DispenseEvent PICKs |
| **B. Consume at dispense; Order skips stock PICK** | Keep R5-C PICK as stock truth; Order create links to `DispenseEvent` / lot mappings; mark allocated **without** second `onHand−` | Preserves Book 116; requires Order-path branch for Rx handoff |
| **C. Soft-reserve at authorize/map; single consume** | New `InventoryReservation` purpose `RX_DISPENSE`; convert once on pay or complete | Not built; needs TTL/SLA policy |
| **D. Split clinical vs commercial stock** | Two ledgers | Rejected for v1 — dual truth risk |
| **E. Pay/allocate before clinical complete** | Flip sequence | Breaks Books 115/116 handoff; product/legal OD |

### 7.3 Plan recommendation (explicit, reversible)

**Recommended default for IMPL design: Option B**, because R5-C is already **R5_C_IMPLEMENTED** with hard consume and e2e guards against commerce side effects. IMPL must:

1. Detect Rx-handoff checkout (dispense_event_id present)  
2. **Skip** `reserveForCheckout` / `consumeCheckoutReservations` for those units **or** use a no-op consume that verifies DispenseEvent PICK already exists (same lot/qty)  
3. Still create Order + FulfillmentGroup + PickTask for **ops state machine** (pick UI may be “confirm already dispensed” rather than second inventory PICK)  
4. Keep consume-once: movement owner is `DispenseEvent` **xor** `Order` — never both for the same units  

If humans prefer Option A, issue a **joint R5-C amendment CR** before R5-D IMPL.

**This recommendation is an engineering default, not a legal claim.**

---

## 8. Order / fulfillment (1E reuse)

| Step | Behavior |
|------|----------|
| Create | Existing `insertFromPayment` preconditions + Rx eligibility + handoff idempotency |
| Linkage | Persist `dispensing_case_id`, `dispense_event_id`, `prescription_id`, `prescription_version_id` on Order (and/or OrderItem) |
| `rxRequired` | Populate from assortment / dispense mapping |
| State | ALLOCATED → pick/pack → READY_TO_SHIP (existing) |
| Inventory | Per **ED-R5D-01** |
| Split ship | Still **No** v1 (OD-PHARM-02) |

**No new fulfillment kernel.**

---

## 9. Finance (1G reuse)

### 9.1 When facts may generate

| Event | Facts |
|-------|-------|
| Order create after eligible payment | Existing `finance.syncOrder` path: CAPTURE (via payment), TAX stub, SHIPPING_*, PROMO_*, COGS or VENDOR_PAYABLE, AFFILIATE if gates allow |
| Refund | REFUND |
| Carrier cost add | CARRIER_QUOTED / CARRIER_ACTUAL |

### 9.2 Rules

- Prescribe / dispense alone → **no** revenue/payable/COGS/tax/profit facts (already held by R5-C)  
- FAILED / UNKNOWN payment → **no** commercial revenue path  
- **NULL remains UNKNOWN** — do not coerce to 0  
- Do not invent GST/VAT or fake contribution  
- Affiliate remains clinical-blocked / payable=false unless pack + product later allow  

---

## 10. Customer UI (web + mobile RN/Expo)

| Step | Clinical vs commercial |
|------|------------------------|
| Prescription list/detail | Clinical (existing R5-B) |
| Dispense status | Safe status string only |
| Eligible purchase CTA | Commercial — only when DISPENSED + pack allows |
| SKU review | Commercial labels/pack size; no internal lot codes unless required for pickup proof |
| Quote / checkout / pay | Existing commerce UX |
| Order / fulfillment / tracking | Existing order UX |

**Buffering:** healthcare/medicine contextual loading; never hide errors behind loading ([25](25_UI_UX_ARCHITECTURE.md)).

Android + iOS share one RN/Expo customer app architecture.

---

## 11. Store UI (web + mobile)

After handoff, Store sees:

| Visible | Hidden |
|---------|--------|
| Order id, status, fulfillment tasks | Full clinical dosage dumps beyond desk need |
| Payment reference (opaque / last-4 pattern per existing) | Other patients’ carts |
| Link to dispensing case id | Unrestricted PHI browse |
| Ops pick/pack confirm | Ability to edit payment/order money facts |

No dedicated pharmacist app — Store Web + Store Mobile only.

---

## 12. Doctor UI

- Read-only: dispensing status + optional commercial order status (“ordered / paid / fulfilled”) when linked  
- **Cannot** modify Order, PaymentIntent, shipments, or finance facts  
- No cart CTAs in doctor app for patient purchase (OD-DOC-10 patient-driven)

---

## 13. Admin UI

Company-controlled trace (minimum necessary):

`prescription_id → dispensing_case_id → dispense_event_id → checkout_quote_id → payment_intent_id → order_id → shipment_id → finance fact refs`

+ audit trail. **No** unrestricted PHI / dosage line dumps (reuse R5-A/B/C admin posture).

---

## 14. Support

Reuse existing support kernel. Correlate ids only:

`prescription → dispensing case → order → payment → shipment`

Do **not** copy clinical JSON into generic tickets (OD-CRM-04 / OD-RBAC-02 alignment).

---

## 15. Notifications (outbox only)

Plan events (names indicative; IMPL finalizes):

| Event | When |
|-------|------|
| `RX_HANDOFF_ELIGIBLE` | Case DISPENSED and commercially eligible (optional; may be UI-poll only) |
| `RX_CHECKOUT_STARTED` | Handoff checkout session created |
| `ORDER_CREATED` / existing payment/order events | Reuse 1D/1E |
| `SHIPMENT_*` | Reuse 1F |

No second notification system. No PHI in push bodies.

---

## 16. MNC / tenancy

Preserve: global company → region → country → legal entity → business unit → organization → location.

- Pharmacy org / location from claimed DispensingCase must match Order seller/location  
- Customer own-record isolation  
- RLS + service authorization mandatory  
- No client-supplied tenant authority  
- No India/INR/GST hardcoding; country packs fail-closed  

---

## 17. Security audit checklist (IMPL)

| Actor | Rule |
|-------|------|
| Customer | Own prescription/dispense/order/payment only |
| Doctor | Relationship/consent/policy; read-only commerce status |
| Store | Org/location; desk clinical min-necessary; no foreign orgs |
| Vendor | Marketplace isolation unchanged; Rx-owned pharmacy path is PHARMACY_OWNED |
| Admin | Role-gated metadata; finance separate permissions |
| Finance | Existing finance roles only |
| All | No PHI in logs/events beyond ids; audit handoff + order mutations |

---

## 18. Mobile / web parity

| Surface | Parity requirement |
|---------|-------------------|
| Customer web + mobile | Full Rx → commerce journey |
| Store web + mobile | Post-handoff order/fulfillment visibility |
| Doctor web (+ mobile if status shown) | Read-only |
| Admin web | Trace console |

Shared RN/Expo for Android + iOS. No dedicated pharmacist app.

---

## 19. Buffering UX

Preserve locked World Pharma rule: unavoidable loading uses healthcare/medicine contextual treatment; errors must surface (not infinite spinners). Applies to quote, pay confirm, order create, tracking.

---

## 20. Legal / human / engineering decisions

### 20.1 Do **not** silently resolve

| ID | Topic | R5-D stance |
|----|-------|-------------|
| **OD-RX-REFILL** | Auto-refill vs re-auth | **Out of scope for R5-D** — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**) |
| **OD-DOC-10** | Auto-cart vs patient-driven | Plan default **patient-driven**; still OPEN |
| **E-R5B-01** | Catalog hint picker | Unchanged; handoff uses **dispensed mapping**, not doctor hint alone |
| **OD-PHARM-04** | Still verify | Already implemented in R5-C; R5-D does not skip desk |
| **OD-PHARM-09** | Substitution accept | No silent substitution at quote/order; dispensed mapping is SoT |

### 20.2 New R5-D decisions

| ID | Type | Question | Plan default until decided |
|----|------|----------|----------------------------|
| **OD-DOC-10** | product | Auto-route vs patient CTA | Patient-driven |
| **ED-R5D-01** | engineering | Inventory consume owner (A/B/C…) | Recommend **B** (dispense PICK; Order skip second consume) |
| **ED-R5D-02** | engineering | Handoff persistence shape | Dedicated handoff row vs idempotency_records |
| **OD-R5D-01** | product | Allow checkout before DISPENSED? | **No** (complete only) |
| **OD-R5D-02** | product | Pharmacy-assisted checkout (P-RX-01) | Customer-initiated v1 |
| **OD-R5D-03** | product/ops | Post-dispense pick task semantics | Confirm-dispensed vs warehouse re-pick |
| **L-R5D-01** | legal | Whether paid Order is required before goods leave pharmacy for Rx | Pack/legal — do not invent; Order boundary still required for commercial ownership in platform model |

Separate **product / engineering / legal** owners; IMPL CR must list chosen ED-R5D-01 explicitly.

---

## 21. Test plan (future IMPL CR)

| ID | Scenario |
|----|----------|
| T-D-01 | Draft/cancelled/expired Rx cannot hand off |
| T-D-02 | Incomplete case statuses cannot hand off |
| T-D-03 | DISPENSED + eligible → cart seed / quote |
| T-D-04 | Quote freezes price/tax/promo/affiliate/shipping/address snapshots |
| T-D-05 | Clinical version unchanged after quote/order |
| T-D-06 | CAPTURED → exactly one Order |
| T-D-07 | AUTHORIZED_COD path when pack allows |
| T-D-08 | UNKNOWN/FAILED/PROCESSING/redirect → zero Order |
| T-D-09 | Duplicate handoff key → same Order / no second Order |
| T-D-10 | Concurrent Order create converges (payment intent + handoff) |
| T-D-11 | One Order per payment intent |
| T-D-12 | Inventory consume-once (no double PICK) |
| T-D-13 | Insufficient stock / missing offer fail closed |
| T-D-14 | No silent substitution at handoff |
| T-D-15 | Fulfillment SM pick/pack/READY |
| T-D-16 | Mock shipment book only |
| T-D-17 | Finance facts only after eligible payment/order |
| T-D-18 | NULL economics remain UNKNOWN |
| T-D-19 | RLS: customer/store/doctor/vendor/admin isolation |
| T-D-20 | Audit events on handoff + order |
| T-D-21 | Retry/replay safe |
| T-D-22 | Prescribe/dispense alone still zero Order/Payment/Shipment |
| T-D-23 | Web/mobile customer + store parity smoke |
| T-D-24 | Zero duplicate Order under webhook storm |

Regression: full R0–R4 + R5-A/B/C suites remain green.

---

## 22. Proposed IMPL API surface (indicative — not authorized)

| Method | Path (draft) | Notes |
|--------|--------------|-------|
| GET | `/customer/prescriptions/:id/commerce-eligibility` | Safe flags only |
| POST | `/customer/rx-handoff` | Seed cart from `dispensing_case_id` + Idempotency-Key |
| (existing) | `/me/cart`, `/me/checkout/*`, `/me/pay`, `/me/orders` | Unchanged contracts + linkage fields |

Store/doctor/admin: read models + admin trace only.

---

## 23. Documentation / CR sequencing

| Artifact | Role |
|----------|------|
| This book **117** | Plan SoT — **R5_D_PLAN_READY** |
| Future **CR-R5-D-IMPL-*** | Coding authorization; must close **ED-R5D-01** |
| R5-E / R5-F | Separate CRs; not started here |

---

## 24. Stop line

**R5_D_PLAN_READY.**

Do **not** implement R5-D under this CR.  
Do **not** start R5-E.  
Do **not** enable live PSP, DHL, bank transfer, vendor payout, or affiliate payout.  
Do **not** invent medical, pharmacy, tax, payment, COD, or country law.

Next human step: review **ED-R5D-01** / **OD-DOC-10** → issue **CR-R5-D-IMPL-*** when ready.

---

**FINAL STATUS: R5_D_PLAN_READY**
