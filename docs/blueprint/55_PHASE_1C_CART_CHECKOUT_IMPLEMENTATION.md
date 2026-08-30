# 55 — Phase 1C Cart + Checkout implementation

**Status:** Implemented (26 August 2026)  
**Authorization:** Phase 1C cart + checkout only  
**Not implemented:** PSP, capture, wallet, COD processing, Order, DHL/carriers, settlement, affiliate payout, P&L, doctor, lab, CRM

Canonical: [54](54_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION_PLAN.md), [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md), [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

**R5-D note:** Order-from-Rx reuses this frozen-quote kernel with `skipInventoryHold` — [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**).  
**R5-E note:** Each refill cycle must create a **new** frozen quote — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**; coding not authorized).

---

## Database

Migration `20260826230000_cart_checkout` (additive).

Tables: `carts`, `cart_items`, `cart_quotes`, `customer_addresses`, `checkout_sessions`, `checkout_quotes`, `promo_campaigns`, `promo_applications`, `affiliate_attribution_snapshots`, `idempotency_records`.

- UUID v7 application ids  
- Money BIGINT minor units  
- Unique active cart `(customer_person_id, country_id)`  
- Unique checkout `idempotency_key`  
- RLS enabled (same app-role pattern as 1A/1B); customer isolation is enforced in the service layer  

No `orders` / payment-capture tables.

---

## Cart

One cart per Person + country. Lines are `offer_id` + qty. First line sets `seller_org_id`. Another seller → **409 `CART_SELLER_CONFLICT`**. No add-to-cart inventory hold. Server reloads offer, publication, pack, stock, and qty caps. Client prices are ignored.

---

## Checkout

States used: `VALIDATING`, `QUOTED`, `REVALIDATION_REQUIRED`, `READY_FOR_PAYMENT`, `EXPIRED`, `CANCELLED`, `FAILED`.  
**Not entered:** `PAYMENT_PENDING`, `PAID`, `COMPLETED`.

Quote is an immutable `checkout_quotes` row (fingerprint, price versions, promo, tax/shipping stubs, expiry). Stale fingerprint → `PRICE_CHANGED` / `QUOTE_STALE`.

---

## Inventory reservation

`purpose=CHECKOUT` is enabled from checkout quote only. TTL 15 minutes. Revalidate releases previous holds. 1B TTL worker still expires OPEN rows. Reservations are never consumed/shipped in 1C.

---

## Promo / affiliate / tax / shipping

- Promo applied on quote only (`PERCENT` / `FIXED`, min basket, funding flag). Not settled.  
- Affiliate code frozen on session; preview commission stored; **not payable**. Clinical/Rx lines force `clinical_blocked`.  
- `ShippingPort` stub: `UNAVAILABLE` (not free).  
- `TaxPort` stub: `UNKNOWN` (no invented GST/VAT).

---

## APIs

Customer JWT:

| Method | Path |
| --- | --- |
| GET | `/api/v1/me/cart?country=` |
| POST/PATCH/DELETE | `/api/v1/me/cart/items` |
| GET/POST | `/api/v1/me/addresses` |
| POST | `/api/v1/me/checkout/sessions` |
| POST | `.../fulfillment`, `/promo`, `/quote`, `/validate`, `/revalidate` |
| POST | `.../pay` → **409 `PAYMENTS_DISABLED`** |

Mutations require `Idempotency-Key`.

---

## UI

Customer: `/cart`, `/checkout`, PDP Add to cart. Payment copy: **“Payment is not available in this phase.”** ui-kit only.

---

## Events

Outbox + BullMQ: `CART_CREATED`, `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CHECKOUT_STARTED`, `CHECKOUT_REVALIDATED`, `CHECKOUT_EXPIRED`.  
**Not emitted:** `PAYMENT_CAPTURED`, `ORDER_PAID`, `ORDER_CREATED`.

---

## Security

JWT required. Cart/session scoped to `customer_person_id`. Vendor cannot list customer carts. Idempotency stored per person. Redis cart cache is optional and never an authz source.

---

## Tests / limitations

API e2e: seller conflict, customer isolation, no reserve on add, reserve on quote, pay disabled, no paid events. Guest cannot mutate cart. Admin/vendor inventory UIs unchanged.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before selling RX/CONTROLLED. Shipping/tax are stubs. No Order.

---

## Open decisions (unchanged)

Launch country, brand, MoR, PSP, tax vendor, DHL, OD-PHARM-01/02, multi-seller cart (off), promo funding amounts, affiliate clinical legality.

---

## Related

[54](54_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION_PLAN.md) · [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md)
