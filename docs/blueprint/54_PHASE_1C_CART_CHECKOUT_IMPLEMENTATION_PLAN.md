# 54 — Phase 1C Cart + Checkout (implementation plan)

**Status:** Implemented — see [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md)  
**Date:** 26 August 2026  
**Authorization:** Phase 1C cart + checkout (coding complete; see [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md))  
**Still forbidden:** PSP, capture, refund, Order persist, DHL, ledger settlement, vendor/affiliate payout  

Canonical: [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §10–11 / 1C, [21](21_API_ARCHITECTURE.md) §11, [20](20_DATABASE_ARCHITECTURE.md) carts/checkout, [05](05_CUSTOMER_PLATFORM.md) A-CUS-02/05, [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md), [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

This document is the pre-code contract for 1C. **No migrations or UI in this task.**

---

## 0. Boundary

| In 1C | Out of 1C |
| --- | --- |
| Customer cart (auth, country, one seller) | Payment adapter / PSP / webhooks |
| Server-side quote (price, promo, tax stub, shipping stub) | `PaymentIntent` capture / refund |
| Checkout session + revalidation | Goods **Order** row |
| Short TTL inventory reservation at quote | Consuming reservation into allocation |
| Promo **application** on the quote | Promo funding settlement |
| Affiliate **attribution freeze** + commission **preview** | Affiliate AP / payout |
| Address book + Country Policy validation | DHL / carrier create shipment |
| `TaxPort` / `ShippingPort` stubs | Tax-engine vendor, DHL account |

**1D handoff:** `CheckoutSession` status `READY_FOR_PAYMENT` + frozen `CheckoutQuote` → `PaymentPort.createIntent` (disabled).  
**1E handoff:** paid/COD-confirmed session → Order create. **1C must not insert orders.**

---

## 1. Cart architecture

### 1.1 Invariants (locked)

- **One active cart** per `customer_person_id` + `country_id` ([05] A-CUS-05, [20]).
- Cart **does not** cross customers or countries. Country switch isolates carts; no merge, no currency mix.
- **One seller per cart.** Lines share one `seller_org_id`. Mixing sellers → **409 `CART_SELLER_CONFLICT`** ([50], [21]). Do not merge. Client may *replace* the cart after explicit confirm; server never silently replaces.
- Problem `code`: `CART_SELLER_CONFLICT` (RFC 7807). Alias in some 05 copy: `CART_SELLER_CONFLICT` — **implement `CART_SELLER_CONFLICT`.**
- Lines point at **`offer_id` + qty**, not a client price. SKU = `CatalogVariant` via the offer.
- Care/lab products are **not** cart lines in v1 ([50]).
- Guest: browse OK; **account required before cart mutations** (OD-CUS-03: account before payment; 1C has no pay, still require JWT so RLS holds).

### 1.2 Entities

| Entity | Role |
| --- | --- |
| `Cart` | Active/abandoned/expired; `customer_person_id`, `country_id`, `seller_org_id` (null until first line), `status`, `expires_at` |
| `CartItem` | `offer_id`, `variant_id`, `qty`, optional `prescription_case_id`, `deleted_at` |
| `CartQuote` | Last successful server quote attached to the cart (ephemeral; may be stale) |
| `CustomerAddress` | Address book (not cart-owned exclusively) |
| `CartEligibility` | Derived: line/cart blockers (Rx, pack, stock, country) — not a second identity |

### 1.3 Lifecycle

`ACTIVE` → `ABANDONED` (TTL / country switch leftover) / `CONVERTED` (1E only) / `EXPIRED`.

Soft-delete lines (`deleted_at`). Do not soft-delete ledger/payment (N/A in 1C).

---

## 2. Checkout architecture

v1 goods checkout wraps **one future Order** for one seller. Doctor/lab Bookings are **not** children in 1C (OD-PAY-03 super-checkout remains Phase 2).

### 2.1 State machine (1C)

```
CART
  → VALIDATING          (server)
  → QUOTED              (CheckoutQuote frozen until expires_at)
  → REVALIDATION_REQUIRED
  → READY_FOR_PAYMENT   (1C terminal “success”: pay UI is a placeholder)
  → EXPIRED | CANCELLED
```

**Forbidden in 1C (states exist in the model for 1D, must not be entered):**  
`PAYMENT_PENDING`, `PAID`, `COMPLETED`, `ORDER_CREATED`.

UI copy when `READY_FOR_PAYMENT`: **“Payment unavailable in this environment/phase.”** Never imply money was collected.

### 2.2 CheckoutSession

`customer_person_id`, `country_id`, `cart_id`, `seller_org_id`, `status`, `idempotency_key` unique, `expires_at`, `address_id`, `quote_id`, `reservation_ids[]`, `correlation_id`.

`POST /me/checkout/sessions` is idempotent. Duplicate key returns the same session.

---

## 3. Add to cart (server revalidation)

Every `POST /me/cart/items` **ignores** client `price`, `currency`, `seller`, `available`. Server loads:

| Check | Fail closed |
| --- | --- |
| JWT person = cart owner | 401/403 |
| `country_id` = JWT/session country | 409 `CART_COUNTRY_CONFLICT` |
| Offer exists, `PUBLISHED`, `country_id` match | 409 `OFFER_EXPIRED` / not found |
| `CatalogItem` published + `item_countries.available` | 404/403 pack |
| Pack: `pharmacy` / `marketplace` as required by ownership | 403 `SERVICE_DISABLED` |
| `seller_org_id` = cart seller or empty cart | 409 `CART_SELLER_CONFLICT` |
| Inventory `available >= qty` (boolean path + qty at quote) | 409 `OUT_OF_STOCK` |
| Qty ≥ 1, pack `cart.max_qty_per_line` / `cart.max_lines` | 422 `QTY_MAX` |
| `rx_required` / controlled: allow **line in cart**; block **quote complete** without Rx case ([50] Rx gate). **LEGAL/COMPLIANCE REVIEW REQUIRED** | 422 `RX_REQUIRED` at checkout |
| Quantity limits from item-country `max_qty_per_order` | 422 |

Merge qty if same `offer_id` already on the cart.

---

## 4. Inventory reservation (chosen architecture)

**Do not reserve on add-to-cart.** Holding stock for an abandoned cart oversells the rest of the catalog and fights 1B TTL design.

| Moment | Inventory action |
| --- | --- |
| Add / patch qty | Read availability (`available >= qty`). No reservation. |
| `POST .../quote` | Create 1B `InventoryReservation` with `purpose=CHECKOUT`, short TTL, idempotency key = checkout session + line. |
| Revalidate | Release previous CHECKOUT holds; create new ones if still available. |
| Quote/session expiry | TTL job + lazy expiry **release** (existing 1B worker). |
| 1D/1E (later) | Consume reservation on paid/COD confirm. **Not 1C.** |

1B currently **rejects** `purpose=CHECKOUT`. 1C **enables** that purpose only from checkout services. Do not back-port CHECKOUT into 1B staff/manual reserve APIs.

TTL: pack/config, engineering default **minutes not hours** (do not invent a legal hold). Concurrent quotes: existing serializable + `FOR UPDATE` — loser `409` insufficient / conflict. **No oversell.**

PostgreSQL remains SoT. Redis must not be the reservation ledger.

---

## 5. Pricing / revalidation

Cart and checkout are **quotes**, not invoices.

Server `PriceQuote` (existing 1A `PricingService.quote`) plus:

- current `PriceVersion` (`is_current`)
- `CommercialRule` (sku > item > category > seller > country)
- seller, country, ISO 4217
- promo applications (preview)
- affiliate commission **preview** (not AP)
- shipping estimate (`ShippingPort.quote` stub)
- tax estimate (`TaxPort.quote` stub)
- inventory still available

**BIGINT minor units. Never float. Never trust client totals.**

Stale quote → `PRICE_CHANGED` / `QUOTE_STALE` 409. Customer must revalidate. **Do not charge (or imply charge of) a stale cart price.**

| Change | Cart | Checkout |
| --- | --- | --- |
| PriceVersion moved | `PRICE_CHANGED` on read/quote | `REVALIDATION_REQUIRED` |
| Commercial rule | same | same |
| Offer unpublished / country off | drop or block line | fail quote |
| Inventory 0 | line ineligible | fail quote; release holds |
| Promo expired | remove application | fail; revalidate |
| Affiliate window expired | drop preview | freeze only if still eligible |

---

## 6. Promo (foundation, not settlement)

Plan tables: `PromoCampaign`, `PromoCode`, `PromoApplication` (on quote).

Types: percent, fixed minor, min basket, automatic vs code. Eligibility: country, category, sku, customer segment, seller. Caps: global / per customer. Funding: `FUND_PLATFORM` | `FUND_VENDOR` | `FUND_SPLIT` (bps must sum 10000). **Promo cost is a separate quote line.** Do not invent “first order 10%”. Do **not** post funding to the ledger in 1C.

---

## 7. Affiliate

Existing [14](14_AFFILIATE_PLATFORM.md): click/code → `AttributionTouch` on person.

At **successful quote freeze**:

- Copy eligible attribution onto `CheckoutSession` (immutable snapshot).
- Compute commission **preview** as future liability (`pending` conceptually). **Do not** insert payable, **do not** pay, **do not** emit `ORDER_PAID`.
- Clinical categories **default OFF**. 1C does not invent inducement law. **LEGAL/COMPLIANCE REVIEW REQUIRED.**
- Cross-country attribution: default **deny**.

---

## 8. Shipping abstraction

Port `ShippingPort.quote({ country, from_location?, to_address, parcels/items })` → `amount_minor`, `currency`, `service_level`, `expires_at`.

**No DHL types, accounts, or AWB in domain tables.** 1F adds a DHL adapter. v1 fulfillment group: **one** ([50], OD-PHARM-02 default no split). OD-PHARM-01 warehouse ship-to-customer remains **open** (default stores dispatch). Quote origin follows pack/org config, not a hardcoded country.

If the stub cannot quote: `shipping_minor = 0` **must not** silently imply free shipping; surface `shipping_status: UNAVAILABLE` and block `READY_FOR_PAYMENT` unless pack allows pickup-only.

---

## 9. Tax abstraction

`TaxPort.quote({ country, region, ship_to, item tax categories, amounts })`. **No GST/HST/VAT/UPI class names in core.** Provider **OPEN**. Historical tax = snapshot on `CheckoutQuote`. Rate changes are prospective. Fail-closed if pack requires tax and port returns unknown.

---

## 10. Address

`CustomerAddress`: `person_id`, `country_id`, region/state/province, city, postal code, address lines, recipient name, phone, `is_default`. Validation **Country Policy Pack** (required fields, postal regex if pack supplies). No single-country formatter. Unserviceable address → `UNSERVICEABLE_ADDRESS` 422.

---

## 11. Regulated products

Evaluate on checkout quote, not only catalog browse:

- `regulated_class`, `rx_required`, country eligibility, pack `can_sell` / `can_ship`
- qty caps
- controlled: **LEGAL/COMPLIANCE REVIEW REQUIRED** — fail-closed if pack does not enable
- Catalog containing a SKU **does not** authorize sale

Do not invent statutes. Unresolved → block checkout with `RX_REQUIRED` / `SERVICE_DISABLED` / `COMPLIANCE_HOLD`.

---

## 12. Payment handoff (disabled)

```
CheckoutQuote (frozen)
  → PaymentPort.createIntent   // 1C: returns PAYMENTS_DISABLED
  → 1D adapter (multi-PSP, country/currency/method routing, fallback, webhooks, refunds)
```

`POST .../pay` in 1C: **403/422 `PAYMENTS_DISABLED`**. No PAN, no authorize, no capture. MoR **OPEN** (OD-PAY-01).

---

## 13. Order boundary

**No `orders` / `order_lines` inserts in 1C.** No fake PAID orders. Future: quote + payment success → Order + economics snapshot ([50] §9). `ORDER_CREATED` timing remains OD-EVT-03 (first persist of Order, not cart).

---

## 14. Idempotency

All mutating cart/checkout POSTs: `Idempotency-Key` header (existing payments pattern, [12] / [21]). Server store keyed by person + route + key. Replay returns original response. TTL pack/config (OD-PAY-14 is 24–72h for money; cart keys may be shorter). **Not** frontend-only.

Protect: double-click, retry, refresh, duplicate add (merge), duplicate checkout session create.

---

## 15. Events (outbox + BullMQ only)

| Event | When |
| --- | --- |
| `CART_CREATED` | First line on a new country cart |
| `CART_ITEM_ADDED` / `CART_UPDATED` / `CART_ITEM_REMOVED` | Line mutations (`cart.updated` alias) |
| `CHECKOUT_STARTED` | Session created |
| `CHECKOUT_REVALIDATED` | New quote |
| `CHECKOUT_EXPIRED` | TTL |

**Do not emit** `PAYMENT_CAPTURED`, `ORDER_PAID`, `CHECKOUT_SESSION_PAID`, `PAYMENT_SUCCESS`.

---

## 16. Database plan (no migration now)

Additive (names illustrative, Prisma camelCase + snake map):

`carts`, `cart_items`, `cart_quotes`, `customer_addresses`, `checkout_sessions`, `checkout_quotes`, `promo_campaigns`, `promo_codes`, `promo_applications`, `affiliate_attribution_snapshots`.

FKs to existing `persons`, `countries`, `organizations`, `catalog_offers`, `catalog_variants`, `inventory_reservations`. Unique active cart `(customer_person_id, country_id)`. Unique checkout `idempotency_key`. RLS on all customer-owned tables.

Do **not** duplicate catalog, inventory, or identity.

---

## 17. API plan

Follow [21] `/api/v1/me/...` (global prefix already `api/v1`).

| Method | Path | 1C |
| --- | --- | --- |
| GET | `/me/cart` | Yes |
| POST | `/me/cart/items` | Idempotent merge |
| PATCH | `/me/cart/items/{id}` | Qty |
| DELETE | `/me/cart/items/{id}` | |
| POST | `/me/cart/clear` | |
| POST | `/me/checkout/sessions` | Idempotent |
| POST | `/me/checkout/sessions/{id}/fulfillment` | Address |
| POST | `/me/checkout/sessions/{id}/quote` | Tax/shipping stubs + reserve |
| POST | `/me/checkout/validate` | Explicit validate (may alias quote) |
| POST | `/me/checkout/sessions/{id}/pay` | **Disabled** `PAYMENTS_DISABLED` |
| GET | `/me/addresses` CRUD | Yes |

Admin: optional read-only cart/session by id + `order:admin`-class perm — **not** vendor access to customer carts.

---

## 18. UI plan (later coding task)

Customer (ui-kit only): Cart → Address → delivery option (stub) → promo → attribution (if any) → tax/shipping lines → **final review** → payment placeholder **“Payment unavailable in this environment/phase.”**

No fake success. No vendor/admin cart editor beyond support read. Loading / empty / error / permission-denied / `CART_SELLER_CONFLICT` (replace vs keep).

---

## 19. Security / RLS

- JWT customer audience; cart `person_id` = token person.
- Customer A cannot read/write B.
- Vendor cannot read customer carts.
- Admin only with explicit permission.
- Rate limit cart/checkout POSTs (existing identity/abuse layer).
- Correlation/request ids; audit on checkout quote freeze.
- Never log PAN/OTP/tokens; no PHI on cart lines (Rx **reference id** only).

---

## 20. Performance

PostgreSQL SoT. Redis optional cache of **GET cart** keyed by person+country with short TTL; invalidate on mutation; **never** cache authz as “allow”. Batch inventory checks per quote. Paginate movement-like admin lists if added. Quote path: one transaction for revalidate+reserve.

---

## 21. Test plan (when coding is authorized)

Cart: add/update/remove; `CART_SELLER_CONFLICT`; country conflict; unpublished/unavailable.  
Pricing: version change, rule change, currency, tax stub, promo expire.  
Inventory: available/unavailable; checkout reserve; TTL release; concurrent quote oversell.  
Security: isolation, vendor denied, RLS.  
Idempotency: duplicate add, duplicate session.  
Regulated: pack-off, Rx gate.  
Events: outbox types; no paid events.  
UI: conflict, placeholder payment, no success-paid.

Regression: 1A catalog, 1B inventory.

---

## 22. Globalization

No hardcoded India / INR / GST / UPI / DHL. Country Policy, currency, locale, `TaxPort`, `ShippingPort`.

---

## 23. Open decisions (do not invent)

Launch country, legal brand, MoR (OD-PAY-01), PSP, tax vendor, DHL contract, take-rate numbers, OD-PHARM-01 warehouse ship-to-customer, OD-PHARM-02 split locations, multi-seller cart (locked **off**), promo funding splits, affiliate category legality, Rx/controlled sale, OD-CUS-03 guest (account before pay), OD-FX-02 rate lock.

---

## 24. Acceptance criteria (for a later **coding** task)

1. One cart per customer per country  
2. `CART_SELLER_CONFLICT` 409, no silent merge  
3. Server reprice; `QUOTE_STALE` / `PRICE_CHANGED`  
4. Checkout reservation TTL; no add-to-cart hold; no oversell  
5. Promo/affiliate/tax/shipping as quote lines only  
6. `POST .../pay` disabled; no Order; no paid events  
7. RLS isolation tests  
8. Idempotency on mutations  
9. Rx/pack fail-closed without inventing law  
10. Full 1A/1B regression green  

---

## Related

[53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) · [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) · [21](21_API_ARCHITECTURE.md) · [12](12_PAYMENT_PLATFORM.md) · [14](14_AFFILIATE_PLATFORM.md) · [35](35_OPEN_DECISIONS.md)
