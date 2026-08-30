# 58 — Phase 1E Orders + fulfillment (implementation plan)

**Status:** Plan only — **not implemented**  
**Date:** 26 August 2026  
**Authorization:** Phase 1E **planning** only  
**Forbidden in this task:** production code, Prisma migrations, production UI, DHL/carrier APIs, live PSP, settlement/P&L, vendor payout, affiliate payout, real-money flows

Canonical: [43](43_ECOSYSTEM_BASELINE_LOCK.md), [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §9 / 1E, [20](20_DATABASE_ARCHITECTURE.md) §5.17–5.18, [21](21_API_ARCHITECTURE.md) §11, [22](22_EVENT_ARCHITECTURE.md) §7.1–7.3, [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md), [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md), [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md), [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md)

1D ends at **payment facts** (`CAPTURED` / `AUTHORIZED_COD`). No `Order` row exists. This plan is the contract to create **Orders + internal fulfillment** when a later coding task is authorized. It does **not** call carriers (1F) or post settlement journals (1G).

---

## 0. Boundary

| In 1E (when coded later) | Out of 1E |
| --- | --- |
| Order aggregate + immutable commercial snapshots | Live PSP / production capture |
| One-seller goods Order from frozen 1C quote | Multi-seller split Orders |
| Convert checkout reservation → allocation | Negative stock, silent oversell |
| Fulfillment group, pick/pack **foundation** | DHL SDK, labels, live tracking |
| Internal `Shipment` + `CarrierPort` **stub** | Carrier create/track/invoice |
| Cancel / return **policy hooks** | Statutory return law |
| Refund **request** that calls 1D refund port | Vendor/affiliate **payout** |
| Customer / vendor / admin order consoles | Rider app, MEDICINE_DELIVERY job execution |
| Outbox events for CRM later | CRM product, tickets, campaigns |
| Economics **facts** snapshot | P&L, take-rate numbers, settlement batch |

**1D → 1E:** `PAYMENT_CAPTURED` or `PAYMENT_AUTHORIZED` with method COD (`AUTHORIZED_COD`) + country pack → `OrderFactory.create`.  
**1E → 1F:** `READY_TO_SHIP` + `Shipment` draft → `CarrierPort` (unimplemented).  
**1E → 1G:** frozen economics facts → journal. **1E must not post AP/AR settlement.**

---

## 1. Order boundary (when an Order exists)

Payment and Order stay **separate bounded contexts**. 1D never inserts `orders`. 1E is the only writer of Order rows.

### 1.1 Create Order (legal inputs)

| Path | Preconditions | Result |
| --- | --- | --- |
| **Prepaid** | Checkout session `READY_FOR_PAYMENT`; frozen `checkout_quotes` row unexpired; **server** PaymentIntent `CAPTURED`; amount/currency match quote; customer + country + seller match | Order `CONFIRMED` |
| **COD** | Same checkout/quote; PaymentIntent `AUTHORIZED_COD`; Country Policy `payments.methods` includes `COD`; pack allows COD for the assortment | Order `CONFIRMED` (payment method COD) |

### 1.2 Do **not** create Order from

`CREATED`, `REQUIRES_ACTION`, `PROCESSING`, `UNKNOWN`, `FAILED`, `CANCELLED`, `EXPIRED`, card `AUTHORIZED` without capture, client “success” redirects, or any client-supplied total.

### 1.3 Dual invariant

| Invariant | Enforcement |
| --- | --- |
| No Order without a commercially committed payment fact | Factory reads 1D status inside a transaction; reject otherwise |
| No second Order for one PaymentIntent | Unique `(payment_intent_id)` |
| Captured payment without Order | Ops/recon exception (`PAYMENT_CAPTURED_WITHOUT_ORDER`); retry factory (idempotent); **do not** auto-refund in 1E |
| Order without payment | Impossible if factory is the only insert path |

CheckoutSession + PaymentIntent cover the **pre-commit** window. Books [20]/[22] `DRAFT` / `PENDING_PAYMENT` on Order are **not** persisted in 1E v1; those states live on checkout/payment. **OD-EVT-03** is satisfied by emitting `ORDER_CREATED` at first persist of a commercially real Order (`CONFIRMED`).

---

## 2. Canonical state machine

Derived from [20] §5.17, [22] §7, [50] §9 — **not** a copy of a UI mock. Every transition writes `order_status_history` (from, to, actor, reason, at). Illegal skips are 409 `ILLEGAL_ORDER_TRANSITION`.

### 2.1 Happy path (v1, one location)

```
CONFIRMED
  → ON_HOLD?          (Rx / fraud / ops — optional)
  → ALLOCATED
  → PICKING → PICKED
  → PACKING → PACKED
  → READY_TO_SHIP
  → SHIPPED           (internal shipment record only)
  → OUT_FOR_DELIVERY  (placeholder until 1F tracking)
  → DELIVERED
```

`CONFIRMED` means commercially committed (prepaid captured **or** COD authorized). Pharmacy `ACCEPTED` ([22] `ORDER_ACCEPTED`) maps here when OD-PHARM-08 auto-accept-after-allocate is used; **do not close OD-PHARM-08**.

### 2.2 Failure / cancel / money overlay

| Status | Meaning |
| --- | --- |
| `CANCEL_REQUESTED` | Customer/vendor/admin asked; policy not yet applied |
| `CANCELLED` | Terminal; stock released; refund may follow |
| `ON_HOLD` | Cannot progress fulfillment |
| `RETURN_REQUESTED` | After ship/deliver; eligibility **pack** |
| `RETURNED` | Goods back / refused / failed delivery |
| `REFUND_PENDING` | 1D refund in flight |
| `REFUNDED` / `PARTIALLY_REFUNDED` | Overlay after 1D refund facts; do not invent money |
| `FAILED` | Terminal ops failure (cannot fulfill; cancel+refund path) |

There is **no** `PAYMENT_FAILED` Order status in 1E v1 (no Order is created).

### 2.3 Allowed transitions (v1)

| From | To |
| --- | --- |
| CONFIRMED | ALLOCATED, ON_HOLD, CANCEL_REQUESTED, CANCELLED, FAILED |
| ON_HOLD | CONFIRMED, ALLOCATED, CANCELLED, FAILED |
| ALLOCATED | PICKING, ON_HOLD, CANCEL_REQUESTED, CANCELLED |
| PICKING | PICKED, ON_HOLD, CANCEL_REQUESTED |
| PICKED | PACKING, ON_HOLD |
| PACKING | PACKED, ON_HOLD |
| PACKED | READY_TO_SHIP |
| READY_TO_SHIP | SHIPPED, CANCEL_REQUESTED (policy) |
| SHIPPED | OUT_FOR_DELIVERY, DELIVERED, RETURN_REQUESTED, FAILED |
| OUT_FOR_DELIVERY | DELIVERED, RETURN_REQUESTED, FAILED |
| DELIVERED | RETURN_REQUESTED, REFUND_PENDING |
| CANCEL_REQUESTED | CANCELLED, previous (deny) |
| RETURN_REQUESTED | RETURNED, CANCELLED (deny) |
| RETURNED | REFUND_PENDING |
| REFUND_PENDING | REFUNDED, PARTIALLY_REFUNDED, CONFIRMED (refund failed — stay auditable) |

Refund overlays may apply from `CONFIRMED` through `DELIVERED` **without** rewriting fulfillment history. [50] §failed refund: **do not** mark `REFUNDED` if 1D refund failed.

Rx-gated lines: if pack requires verification, CONFIRMED → `ON_HOLD` until a **case id** is linked (no PHI copy). **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

## 3. Order model (logical)

Internal PK: **UUID v7**. Public identifier: **order number** (separate).

| Entity | Role |
| --- | --- |
| `Order` | Header: customer, seller org, country, currency, status, payment_intent_id, checkout_session_id, checkout_quote_id, fulfilling_location_id, public number |
| `OrderItem` | Frozen line: offer, SKU, catalog identity, qty, unit/line minors, regulated flags, reservation ids |
| `OrderAddressSnapshot` | Ship-to (and bill-to if present) at purchase — **copy**, not FK to live address |
| `OrderPricingSnapshot` | Header + line commercial freeze (price version ids, sell, discount) |
| `OrderTaxSnapshot` | Tax quote freeze (status UNKNOWN/QUOTED, amounts, adapter ref — no GST/VAT hardcode) |
| `OrderPromoSnapshot` | Campaign, code, discount, **funding** (platform vs vendor) |
| `OrderAffiliateSnapshot` | Frozen 1C attribution; clinical still pack-gated |
| `OrderShippingSnapshot` | Charged, subsidy, tax on shipping, currency; **actual carrier cost null** |
| `OrderPaymentSnapshot` | Intent id, method, status, captured/authorized minors, currency, sandbox flag |
| `OrderEconomicsSnapshot` | Facts for 1G (see §18) — **not** a P&L |
| `OrderStatusHistory` | Immutable transition log |
| `OrderNote` | Staff/vendor notes; no secrets; no unnecessary PHI |

After create, **never** re-read cart, live PriceVersion, CommercialRule, promo eligibility, or tax adapter to explain history ([50] §4.3 / §6).

---

## 4. Order number

| Kind | Rules |
| --- | --- |
| Internal `id` | UUID v7, not shown as the primary customer number |
| `order_number` | Unique globally; **not** `serial`/`bigserial`; unguessable enough (Crockford/base32 of entropy + country code prefix from pack, e.g. `WP-{CC}-{token}`) |
| Display | Human-readable; copy-paste safe |

Do not use database sequences as public ids ([21] identifier rules). Country code in the number is a **namespace**, not an India/INR assumption.

---

## 5. Price freeze / snapshots

Copied from the **frozen 1C quote** + 1A price version ids + 1D payment row at insert time:

- unit price, qty, line subtotal, discount, promo funding split  
- tax minors + tax status  
- shipping charged / subsidy  
- customer paid (prepaid) or amount due (COD)  
- currency, seller org, offer id, SKU, catalog item/variant identity  
- `rx_required` / regulated class **flags** (not the prescription document)  
- `price_version_id`, `commercial_rule_id` as **references for audit**, not live evaluation  

Reprice APIs after Order create affect **new** carts only.

---

## 6. Company economics snapshot (facts only)

Preserve what 1G will need. **Do not** compute “profit”. **Do not** hardcode 10/15/20%. CommercialRule remains data.

| Fact | Source at 1E | Nullable until |
| --- | --- | --- |
| customer_paid_minor | 1D captured or COD due | — |
| vendor_payable_estimate_minor | Frozen rule_set + cost/sell | 1G confirmation |
| platform_take_estimate_minor | Frozen bps/flat | 1G |
| gateway_fee_estimate_minor | 1D / pack | PSP recon (1G) |
| promo_subsidy_minor + funding | 1C promo snapshot | — |
| affiliate_commission_estimate_minor | Frozen bps; 0 if pack off | 1G approval |
| tax_liability_minor | Tax snapshot | tax provider |
| shipping_charged_minor | Shipping snapshot | — |
| shipping_subsidy_minor | Shipping snapshot | — |
| shipping_actual_minor | **null** | 1F invoice |
| refund_minor | 0; updated from 1D refunds | 1D |

Ledger posting is **1G**. 1E may enqueue `ORDER_CONFIRMED` for future consumers; it must not insert settlement batches ([13]).

---

## 7. Seller / vendor

v1: **one seller Organization per Order** ([43] §8, [50] A-VEND-01). Seller id is frozen from checkout `seller_org_id`.

**`CART_SELLER_CONFLICT` (implemented 1C; [21] also `CART_SELLER_CONFLICT`):** adding a second seller to a cart is 409. That is why 1E does **not** split mixed-seller carts. Marketplace remains vendor-owned stock/offers; owned pharmacy is a different selling org.

Vendor A cannot read Vendor B orders (RLS + `seller_org_id`).

Multi-seller splitting = future **CR**, not 1E.

---

## 8. Inventory consumption

1C holds `inventory_reservations` with purpose **`CHECKOUT`**, TTL 15 minutes, OPEN. 1E must:

1. Lock reservation rows `FOR UPDATE`.  
2. If expired/released → fail Order create (`RESERVATION_EXPIRED` / `STOCK_UNAVAILABLE`); **do not** capture again.  
3. Convert OPEN CHECKOUT hold → **ORDER allocation** (consume reserved → allocated/sold per 1B movement types).  
4. Same idempotency key / `order_id` so retries do not double-consume.  
5. Never let `available` go negative ([53]).

Pipeline (logical): reservation → allocation → pick → pack → shipment. **Ship decrement** of physical lot happens at pack/ship per 1B movement rules — still no carrier.

---

## 9. Lot / expiry

Lots already have `lot_code`, `expires_on` ([53]). RX/CONTROLLED may require lot+expiry via pack flags.

- Pick **hint** FEFO when pack `inventory.fefo_required`.  
- States already include quarantine, damaged, expired.  
- Do **not** claim a legal FEFO duty. **LEGAL/COMPLIANCE REVIEW REQUIRED.**  
- If a lot expires **during** fulfillment: stop pick, `ON_HOLD` / reallocate if pack allows; else cancel path. Do not ship expired.

---

## 10. Fulfillment group

```
Order 1──N FulfillmentGroup (v1: exactly 1)
         1──1 FulfillmentLocation (Location)
         1──N FulfillmentItem
```

v1: **one** fulfilling location ([50] A-PHARM-05, OD-PHARM-02 default **no** split). Schema allows N groups later (multi-warehouse, multiple shipments) without mixed **sellers**.

Do not silently split locations.

---

## 11. Store / warehouse

`Location.kind` already includes store and warehouse ([20] §5). 1E treats them as **fulfillment locations**, not customer-facing vendor brands.

| Concept | Meaning |
| --- | --- |
| Commercial seller | `Order.seller_org_id` |
| Physical fulfill-from | `fulfilling_location_id` |

**OD-PHARM-01 OPEN:** default narrative is store dispatch / warehouse replenish. 1E must **not** decide ship-from-store vs warehouse-to-customer. Location assignment is a **policy/ops input**, not hardcoded.

`VENDOR_WAREHOUSE` is valid for marketplace seller-fulfilled stock. It is still one seller org.

---

## 12. Pick / pack (no carrier)

Fulfillment item/group statuses:

`ALLOCATED` → `PICKING` → `PICKED` → `PACKING` → `PACKED` → `READY_TO_SHIP`

Work objects: `pick_tasks` (list, lot suggestion, qty), `pack_tasks` (verify qty/lot). Exceptions: short pick, damaged, expired → `ON_HOLD` + note.

**No DHL. No label API. No tracking numbers from carriers.**

---

## 13–16. Shipment / address / shipping charge / DHL boundary

**Shipment** is an internal record: order, group, address snapshot ref, status `DRAFT` → `READY` → `HANDED_OFF` (1F). 1E may persist `DRAFT`/`READY` without calling a network.

`CarrierPort` (quote, create, label, track, cancel, webhook, invoice_cost) is **defined, not implemented**. DHL is one future adapter, not a table name ([50] §13).

**Address snapshot** fields (global, not India-shaped): country, region, city, postal_code, line1, line2, recipient_name, phone. Requiredness from Country Policy.

Shipping snapshot: charged, subsidy, shipping tax if quoted, currency. **Actual carrier cost stays null** until 1F. 1E must not invent freight P&L.

---

## 17–18. Payment integration and races

Consumer: existing outbox (`PAYMENT_CAPTURED`, `PAYMENT_AUTHORIZED` for COD). **Do not trust** client.

| Race | Behavior |
| --- | --- |
| Webhook/capture before Order | Factory creates Order; unique payment_intent_id |
| Order first then duplicate webhook | Inbox + unique key → no second Order |
| Capture OK, Order insert fails | Payment stays CAPTURED; recon queue; retry factory |
| Order OK, HTTP timeout | Client retry + same idempotency / payment id → **same** Order |
| UNKNOWN / FAILED | **Zero** Orders |
| Concurrent factory | Unique constraint + transaction; one winner |
| Double capture | Forbidden in 1D; 1E never calls capture to “fix” a missing Order |

Idempotency keys (all required in the factory): `payment_intent_id` (unique), `checkout_session_id` (at most one successful Order), customer `Idempotency-Key` on create POST.

---

## 19–21. Cancel, returns, refund, partials

**Cancel (policy-gated, not assumed):**

| Window | v1 default (until pack says otherwise) |
| --- | --- |
| Before ALLOCATED / during pick | Allow cancel → release allocation → 1D refund if prepaid |
| After PACKED / READY_TO_SHIP | Pack + ops |
| After SHIPPED / DELIVERED | Not “cancel”; **return** path |

Medicines are **not** assumed returnable. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

**Refund** is a **1D payment action** triggered by Order policy. 1E records `REFUND_PENDING` / overlay. Settlement reversal is 1G.

**Returns:** request types (wrong item, damage, refusal, failed delivery, ineligible SKU). Eligibility = Country + category pack, not a global table of “always 7 days”.

**Partials (v1):** **not supported** for shipment, cancel, or refund **unless** a later CR. Architecture keeps line-level minors so 1G/CR can add partials. Do not implement split shipments in 1E (OD-PHARM-02).

---

## 22–25. UI and logistics partner

**Customer:** confirmation, list, detail, payment status, fulfillment status, items, breakdown, shipping, address snapshot, **carrier-neutral** tracking placeholder, cancel/refund **status**, support entry. No DHL branding.

**Admin:** search, detail, history, payment ref (no secrets), seller, location, allocation, customer (need-to-know), refund/exceptions, audit. Permissions `order:read|cancel|fulfill|admin`. No extra clinical blobs.

**Vendor:** own seller queue only (new / processing / pick-pack / ready / cancel-refund). No other vendors, no platform secrets, no risk scores, no unrelated persons.

**Delivery partner:** not in 1E. Prepare outbox `ORDER_READY_TO_SHIP` / future `MEDICINE_DELIVERY` job **type**. Execution = 1F.

---

## 26–29. CRM, affiliate, promo, tax

Outbox only — no second bus. CRM **later** may subscribe to `ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_REFUNDED`.

Affiliate: copy 1C `affiliate_attribution_snapshots`; do not re-attribute; do not approve payout; clinical default off ([14]).

Promo: copy 1C application; funding required; no re-eligibility.

Tax: copy quote; adapter abstract; **no GST/HST/VAT codes in core.**

---

## 30. Events (outbox + BullMQ)

Idempotent `occurrence_key` = `{order_id}:{TYPE}` (and payment_intent_id where relevant).

`ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_PROCESSING`, `ORDER_ALLOCATED`, `ORDER_PICKING`, `ORDER_PICKED`, `ORDER_PACKING`, `ORDER_PACKED`, `ORDER_READY_TO_SHIP`, `ORDER_SHIPPED`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, `ORDER_RETURN_REQUESTED`, `ORDER_RETURNED`, `ORDER_REFUND_PENDING`, `ORDER_REFUNDED`.

Not emitted: `VENDOR_PAID`, `AFFILIATE_PAID`, `ORDER_PAID` as a second money event if `ORDER_CONFIRMED` already carries the commit (consumers dual-key payment_intent_id — [22] A-EVT-04). If `ORDER_PAID` is kept as an alias of CONFIRMED, it must share the same occurrence key family.

No `DHL_*` events in 1E.

---

## 31. Database plan (logical only — no migration)

`orders`, `order_items`, `order_addresses`, `order_pricing_snapshots`, `order_tax_snapshots`, `order_promo_snapshots`, `order_affiliate_snapshots`, `order_shipping_snapshots`, `order_payment_snapshots`, `order_economics_snapshots`, `order_status_history`, `order_notes`, `fulfillment_groups`, `fulfillment_items`, `pick_tasks`, `pack_tasks`, `shipments`.

Indexes (planned): `(customer_person_id, created_at)`, `(seller_org_id, status, created_at)`, `(country_id, status)`, unique `payment_intent_id`, unique `order_number`, `(checkout_session_id)`.

Postgres remains SoT. Redis is not an order store. No carrier HTTP inside the create transaction.

---

## 32. Security / RLS

| Actor | Sees |
| --- | --- |
| Customer | Own `customer_person_id` only |
| Vendor | Own `seller_org_id` only |
| Admin | Explicit `order:*` |
| Future courier | Assigned job only (1F) |

Never: other vendors, gateway secrets, raw risk, full payment tokens, unnecessary PHI. Prescription = **reference** to a case id. RLS `FORCE` on customer/vendor order tables, `app.bypass_rls` for workers.

---

## 33–35. Idempotency, performance, audit

Create Order: single DB transaction: verify payment + quote + convert reservations + insert snapshots + outbox. Advisory lock on `payment_intent_id`. Unique constraints as last line of defense.

Audit: status history, cancel, refund requests, admin overrides, allocation changes. **Append-only.** No UPDATE of historical events.

---

## 36–38. Globalization, healthcare, economics

No hardcoded India, INR, GST, UPI, DHL. Packs decide currency, tax, Rx, returns, shipping, COD, address.

PHI: flags + case refs, not document bytes on Order. **LEGAL/COMPLIANCE REVIEW REQUIRED** for controlled drugs and Rx-before-dispense.

1E stores facts for future: revenue, vendor cost, commission, gateway fee, promo, affiliate, shipping charged, later carrier actual, refunds, tax. **1E does not finalize** vendor/affiliate payout or company P&L.

---

## 39. Failure scenarios

| Scenario | 1E behavior |
| --- | --- |
| Capture without Order | Recon + idempotent create |
| Duplicate create / webhook / customer retry | Same Order |
| Reservation expired / stock gone | No Order; recon; do not recapture |
| Lot expired mid-pick | Hold / cancel per pack |
| Warehouse closed | Hold; no silent reroute (OD-PHARM-02) |
| Customer/vendor cancel | State machine + policy |
| 1D refund fail | Stay REFUND_PENDING; ops; not silent REFUNDED |
| Duplicate fulfillment event | occurrence_key |
| Outbox retry | Inbox / occurrence_key |

---

## 40. Test plan (when coding is authorized)

Mandatory: create; payment/order idempotency; duplicate webhook; duplicate POST; reservation consume-once; concurrent create; vendor isolation; customer isolation; allocation; lot/expiry; FEFO **hint** when pack on; cancel; refund boundary; promo/affiliate/tax/shipping/economics snapshots; transitions; RLS; admin authz; event idempotency; recovery.

**Critical:**

1. `CAPTURED` → exactly one Order  
2. Retry same payment → one Order  
3. Timeout after create → retry returns same Order  
4. `UNKNOWN` → 0 Orders  
5. `FAILED` → 0 Orders  
6. CHECKOUT reservation consumed once  
7. Two concurrent creators → one Order  
8. Vendor A cannot see Vendor B  
9. Customer A cannot see Customer B  
10. **No DHL/HTTP carrier call** in 1E  

Plus 1A–1D regression. `prisma migrate deploy` only; never reset.

---

## 41. Open decisions (remain OPEN)

OD-PHARM-01 (store vs warehouse to customer), OD-PHARM-02 (split locations), OD-PHARM-04 (Rx skip), OD-PHARM-06, OD-PHARM-07, OD-PHARM-08 (explicit accept), OD-PHARM-09 (substitution), OD-PAY-01 MoR, launch country, legal entity, tax provider, DHL contract, multi-seller cart, consignment, partial fulfillment, vendor cancel rules, returns law, COD remittance, OD-EVT-03 aliasing of `ORDER_PAID`.

Do **not** close these in 1E coding.

---

## 42. Acceptance criteria (future coding)

May start only after this plan is reviewed **and** a separate 1E coding authorization.

Required: state machine; immutable snapshots; payment/order boundary; idempotency; inventory consumption; fulfillment groups; store/warehouse as locations; lot/expiry; pick/pack foundation; shipment **abstraction**; customer/vendor/admin UIs; cancel; return **boundary**; refund **boundary**; promo/affiliate/tax/shipping/economics snapshots; RLS; audit; outbox; CRM-compatible names; indexes; security; regression.

**Explicitly absent:** DHL, live carrier API, settlement, vendor payout, affiliate payout, P&L finalization, multi-seller split.

---

## 43. Stop

After a coding task meets §42: **STOP.** Do not start 1F DHL or 1G settlement. No live PSP without its own authorization.
