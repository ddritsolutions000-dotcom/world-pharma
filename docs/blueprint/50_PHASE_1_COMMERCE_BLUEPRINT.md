# 50 — Phase 1 Commerce / Store Blueprint

**Status:** Design only — **not an implementation authorization**  
**Date:** 26 August 2026  
**Canonical parents:** [05](05_CUSTOMER_PLATFORM.md), [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md), [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md), [14](14_AFFILIATE_PLATFORM.md), [18](18_GLOBALIZATION.md), [20](20_DATABASE_ARCHITECTURE.md), [21](21_API_ARCHITECTURE.md), [22](22_EVENT_ARCHITECTURE.md), [24](24_SEARCH_ARCHITECTURE.md), [33](33_DEVELOPMENT_ROADMAP.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)  
**Prerequisite:** [49](49_PHASE_0_FINAL_AUDIT.md) human sign-off. This book does **not** start coding.

**Out of this document:** NestJS modules, Prisma migrations, Next/RN screens, PSP contracts, DHL account setup, take-rate numbers.

---

## 0. How this book relates to the locked roadmap

[33](33_DEVELOPMENT_ROADMAP.md) already splits commerce:

| Locked roadmap | This book’s slices | Live money? |
| --- | --- | --- |
| **Phase 1** — catalog + owned pharmacy **unpaid** | **1A** catalog/pricing, **1B** inventory/warehouse **foundation** | No |
| **Phase 2** — orders + **payment kernel** + **ledger** + allocate + delivery jobs | **1C–1G** cart, pay, order, ship, settlement | Yes (after 1D) |
| **Phase 3** | Vendor **public** marketplace at scale | After 2 |

This document designs the **full commerce kernel** so 1A does not paint the team into a corner. **Implementation must still follow 33:** do not take real customer money in locked Phase 1. Enabling 1C–1G in production requires Phase 2 exit criteria (ledger + PSP adapter + pack).

**Lock reminders (do not weaken):**

- Modular monolith; `catalog`, `inventory`, `order`, `payment`, `ledger`, `logistics` stay kernel modules ([04](04_APPLICATION_ARCHITECTURE.md), [43](43_ECOSYSTEM_BASELINE_LOCK.md)).
- Goods **Order** has exactly one selling Organization in v1 ([05] A-CUS-02, [06] A-PHARM-02, [07] A-VEND-01). Cart of two sellers → `CART_SELLER_CONFLICT` until a **CR** opens multi-seller.
- `CheckoutSession` is the only money umbrella; doctor/lab stay **Booking**, not Order lines.
- Money = `BIGINT` minor units + ISO 4217. Never float.
- Country Policy Pack fail-closed. No hardcoded IN / INR / GST / UPI / “India warehouse”.
- Events: existing outbox → BullMQ → inbox. **No second bus, no Kafka for v1.**
- Search is a **read model** (OpenSearch). No clinical notes, Rx images, or chat in the index ([24](24_SEARCH_ARCHITECTURE.md)).

**OPEN DECISIONS** stay open: launch country, brand, MoR, PSP, tax vendor, DHL contract, take-rate numbers, warehouse ship-to-customer (OD-PHARM-01), vendor settlement calendar.

---

## 1. Commerce architecture (store model)

### 1.1 What “the store” is

The store is **not** a separate app backend. It is the customer-visible composition of:

`catalog` (what exists) → `offer` (who sells it, where, for how much) → `inventory` (what can be promised) → `cart` / `checkout` → `order` → `fulfillment` / `logistics` → `payment` + `ledger`.

Three **inventory ownership classes** (financial, not UI):

| Class | Selling Organization | Stock owner | Typical fulfillment | v1 |
| --- | --- | --- | --- | --- |
| **PLATFORM_OWNED** | `PHARMACY_OWNED` org | Platform/legal entity | Store (default) or warehouse if pack + OD-PHARM-01 | **Yes** (1A–1B, unpaid) |
| **VENDOR_OWNED** | `VENDOR` org (ACTIVE partner) | Vendor | Vendor location / 3PL | **Listings scaffold** until Phase 3 go-live; model exists in 1A |
| **MARKETPLACE** | Same as vendor-owned for goods | Vendor | Same | Alias of vendor-owned; **not** a third stock ledger |

There is **no fourth “ambiguous” owner**. Every `Offer` has exactly one `seller_org_id`. Every `InventoryLot` has exactly one `owner_org_id` + `location_id`.

**Pharmacy products** are `CatalogItem`s with `regulated_class` from the pack (OTC / Rx / controlled / device / grocery). They are not a separate product database.

### 1.2 Object stack

```
Brand (global)
Category / Subcategory (global tree + country visibility)
        │
CatalogItem  (identity of the good: molecule/form or marketplace SPU)
        │
CatalogVariant  (pack size, flavour, strength presentation)
        │
Sku  (stock-keeping: barcode, pack qty, storage class)
        │
Offer  (seller_org + country + location + currency + price version + Rx flags)
        │
InventoryLot  (qty, batch, expiry, status) at Location
```

**Platform storefront** = published Offers in the session `country_id` that pass pack `services.pharmacy` / `marketplace` flags.

---

## 2. Catalog architecture

### 2.1 Entities

| Entity | Global vs country | Notes |
| --- | --- | --- |
| `Brand` | Global master | Name, logo asset ids; country **visibility** overlay |
| `Category` / `Subcategory` | Global tree | `parent_id`; country enablement + sort overlay |
| `CatalogItem` | Global identity | `item_kind`: MEDICINE / OTC / DEVICE / CONSUMABLE / BUNDLE (care/lab products are **not** cart lines in v1) |
| `CatalogVariant` | Global | Strength, pack size, UOM |
| `Sku` | Global | GTIN/barcode optional; `base_uom`; `pack_qty` |
| `ItemCountry` | **Country** | Legal name, Rx class, importability, max qty, age gate, `ship_domestic`, `ship_cross_border` |
| `ItemI18n` | Locale | Title, description, slug; **not** a second SKU |
| `ItemAsset` | Global + country override | Images, leaflets; PHI never stored here |
| `ItemIngredient` | Global | Structured ingredients **where pack allows** public display; not a clinical record |
| `AttributeDef` / `ItemAttribute` | Global keys, country values | e.g. storage, route — pack-controlled visibility |
| `Offer` | **Country + seller + location** | The only priced, sellable row |
| `PriceVersion` | Country + offer | Immutable versioned amounts (see §4) |

### 2.2 Medicine vs marketplace listing

- **Company / pharmacy SKU:** catalog ops create `CatalogItem` + `Sku`; owned org publishes `Offer`.
- **Vendor listing:** vendor attaches to an existing `CatalogItem` **or** proposes a new item (ops approve). Vendor never owns the global item id; they own the **Offer** and their **lots**.

### 2.3 Prescription and restriction

| Flag (on `ItemCountry` + copied onto Offer snapshot) | Meaning |
| --- | --- |
| `rx_required` | Checkout blocked until verified Rx (pack + pharmacist desk — paid path is 1E/P2) |
| `controlled` | Pack extra controls; default fail-closed |
| `cold_chain` | Inventory + carrier capability |
| `max_qty_per_order` | Integer |
| `age_min` | Policy, not guessed |

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country sets these true. Empty XX pack keeps regulated sale **off**.

### 2.4 Localization

- **Global:** ids, brand, category keys, variant science fields, GTIN.
- **Country:** legal display name, Rx class, tax code **id** (not GST hardcoded), ship flags, seller assortment.
- **Locale:** copy and media. Fallback: pack default locale → `en` technical keys. Never invent translations as law.

---

## 3. Product ownership (financial)

**Invariant:** one SKU may be **sold** by many Offers; each Offer has one seller; each lot has one owner. Platform margin is a **rule application**, not a second owner of stock.

| Question | Answer |
| --- | --- |
| Who is paid for the goods? | `Offer.seller_org_id` |
| Who owns the physical units? | `InventoryLot.owner_org_id` (equals seller in v1) |
| Who is Merchant of Record? | **OD-PAY / OD-MOR — OPEN** (pack + legal entity, not a column default of “platform”) |
| Warehouse holding stock for a vendor | Still `owner_org_id = vendor`; location may be `3PL` / platform warehouse under **contract** (consignment is a **future CR**, not v1 default) |

**Never** allow an Offer with `seller_org_id` A to decrement lots of org B without an explicit transfer document.

---

## 4. Pricing engine

Central service: `pricing` (lives with `catalog` module in the monolith; not a microservice).

### 4.1 Money

- `amount_minor: BIGINT` + `currency: CHAR(3)` + `exponent` from currency table.
- **No** `float` / `double` / JS `number` for money in domain or DB ([20](20_DATABASE_ARCHITECTURE.md) §2).
- Original transaction currency is retained on Order and Payment ([12](12_PAYMENT_PLATFORM.md) §4).

### 4.2 Inputs

`PriceVersion` (immutable when referenced by an order snapshot):

- `cost_minor` (seller COGS or vendor supply price) — **optional** on marketplace if vendor withholds; platform still needs a **contract cost** for take-rate
- `list_minor` (MSRP/reference — **omit if pack forbids**)
- `sell_minor` (customer price before tax)
- `currency`
- `valid_from` / `valid_to`
- `rule_set_id` (link to commercial rules, §5)

### 4.3 Quote vs commit

1. **Quote:** cart/checkout calls `PriceQuote` (offer + qty + country + customer segments + promo ids). Result is ephemeral.
2. **Revalidate:** immediately before payment authorization (1C/1D).
3. **Snapshot:** on `ORDER_CREATED` / payment auth, copy quote into `OrderEconomics` (immutable). **Never** reprice history with today’s rules.

### 4.4 Tax and shipping in the quote

Tax engine (adapter) and shipping quote are **components** of `PriceQuote`, not hidden UI math. Customer-paid shipping vs subsidy: see §14.

---

## 5. Commercial rules / take rate (mandatory)

Configurable **CommercialRule** table — **not** a global hardcoded %.

Dimensions (AND matching, most specific wins; tie-break: product > vendor contract > category > country default):

- `country_id`
- `seller_org_id` (vendor-specific contract)
- `category_id` / `item_id` / `sku_id`
- `channel` (OWNED_PHARMACY / MARKETPLACE)
- `valid_from` / `valid_to`
- `priority`

**Outputs (all integer minor or basis points):**

| Component | Who typically bears | Notes |
| --- | --- | --- |
| Vendor/supply cost | Seller | From offer cost or PO |
| Customer sell price | Customer | From PriceVersion |
| Platform take / commission | Platform | bps or flat; **OPEN** actual numbers |
| Payment fee estimate | Platform or customer (pack) | Replaced by actual PSP fee on recon |
| Shipping quote | Customer / platform subsidy | See §14 |
| Affiliate commission accrual | Platform expense / seller (pack) | Clinical cats default **OFF** ([14](14_AFFILIATE_PLATFORM.md)) |
| Promo subsidy | Company-funded vs vendor-funded | Must not silently hit the other party |
| Fulfillment cost estimate | Platform ops | Optional; refine on pick complete |
| Tax | Per tax adapter | Snapshot |

**Net contribution (platform)** at order time:

`customer_paid - taxes_collected_as_agent(if any) - vendor_payable - affiliate_payable - psp_fee - carrier_cost_actual(when known) - promo_company_funded - fulfillment_actual - refunds`

Vendor payable uses **frozen** rule_set_id on the order. Changing a contract tomorrow does not rewrite last week’s payable.

---

## 6. Financial snapshot

`OrderEconomics` (1 row per Order) + `OrderLineEconomics` (per line):

Copied at payment authorization (or COD confirm per pack):

- offer_id, price_version_id, rule_set_id, pack_version
- sell, cost, tax, discount, shipping_quote, affiliate_bps, platform_take
- currency, fx_snapshot_id if any
- `shipping_actual_minor` nullable until carrier invoice
- `psp_fee_actual_minor` nullable until recon

Ledger ([13](13_LEDGER_SETTLEMENT.md)) posts from these snapshots + payment events. **Journal is immutable;** economics corrections = reversing entries, not UPDATE.

---

## 7. Inventory architecture

`inventory` module is system of record for **quantity**. Search/catalog availability is a **projection**.

### 7.1 Lot states

`AVAILABLE` · `RESERVED` · `DAMAGED` · `EXPIRED` · `QUARANTINE` · `RETURNED` · `IN_TRANSIT` (transfer) · `DESTROYED`

Operations:

- `StockAdjustment` (reason code, actor, SoD)
- `Reservation` (checkout hold, TTL)
- `Allocation` (order confirm)
- `Release` (cancel)
- `FEFO` pick hint when pack `fefo_required` (medicines: **LEGAL** + ops)

### 7.2 Multi-warehouse / country

- Every lot: `country_id`, `location_id`, `owner_org_id`.
- No silent transfer across countries.
- Future: multi-warehouse routing (OD-PHARM-01 / OD-PHARM-02). **v1 default:** one fulfilling location per Order ([06] A-PHARM-05).

---

## 8. Warehouse architecture

Locations already exist in party (`STORE` / `WAREHOUSE`). Commerce adds **WMS-lite** (not a second ERP):

| Entity | Role |
| --- | --- |
| `Warehouse` | Location subtype |
| `Zone` / `Bin` | Optional in 1B; required before high-volume pick |
| `InventoryLot` | Batch/lot/expiry |
| `Inbound` / `GRN` | Receive |
| `Transfer` | Warehouse ↔ store |
| `Reservation` | Checkout |
| `PickWave` / `PickTask` | 1E |
| `Pack` | 1E |
| `Outbound` | Handoff to logistics/carrier |

**Do not hardcode an origin country.** Network design is pack + org config.

---

## 9. Order lifecycle

Goods **Order** (one `seller_org_id`):

`DRAFT` → `PENDING_PAYMENT` → `PAID` / `COD_CONFIRMED` → `CONFIRMED` → `ALLOCATED` → `PICKING` → `PACKED` → `SHIPMENT_CREATED` → `IN_TRANSIT` → `DELIVERED` → (`RETURN_REQUESTED` …)  

Also: `CANCELLED`, `REFUND_PENDING`, `REFUNDED`, `PARTIALLY_REFUNDED`.

**CheckoutSession** may wrap one Order (v1 goods) and later Bookings. **Split fulfillment across sellers** = multiple Orders, not one Order with mixed `seller_org_id` (lock). Split **locations** inside one owned org is OD-PHARM-02 (default: no).

---

## 10. Cart

- One active cart per customer per `country_id`.
- Lines point at `offer_id` + qty.
- **v1:** all lines same `seller_org_id` or `CART_SELLER_CONFLICT`.
- Reprice on read; stale price → `PRICE_CHANGED` (customer must acknowledge).
- Rx items: `rx_required` lines cannot checkout without an attached prescription case (paid flow 1C+).
- Cart ≠ one shipment: `FulfillmentPlan` is computed at checkout (ship groups). v1: one group.

Promo codes and shipping estimates are **quotes** until checkout revalidation.

---

## 11. Checkout

```
Cart → validate (country, Rx, stock, seller)
    → address / pickup
    → eligibility (pack: can_sell, can_ship)
    → shipping quote (carrier adapter)
    → tax quote
    → promo apply
    → affiliate attribution freeze
    → PriceQuote revalidate
    → PaymentIntent
    → Order + economics snapshot
```

Idempotency-Key on all money POSTs ([05](05_CUSTOMER_PLATFORM.md), [12](12_PAYMENT_PLATFORM.md)). Pharmacy staff never enter PAN.

---

## 12. Payments (kernel — locked Phase 2)

Adapter port `PaymentGatewayPort` ([12](12_PAYMENT_PLATFORM.md)). Multiple PSPs via config: country, currency, method, amount, risk. Fallback + retry + webhook signature verify.

- No PAN/CVV storage.
- Refunds and partial refunds as first-class intents.
- Reconciliation file → actual PSP fee on economics.
- **MoR / facilitator: OPEN.** Invoice adapter selected by pack, not hardcoded platform-as-seller worldwide.

**Do not choose PSP names as architecture.** Examples in runbooks only.

---

## 13. Shipping engine

Logistics job `MEDICINE_DELIVERY` ([11](11_LOGISTICS_PLATFORM.md)) **or** `CarrierShipment` when a parcel network is used.

`CarrierPort`:

`quote` · `create_shipment` · `label` · `pickup` · `track` · `cancel` · `webhook` · `invoice_cost`

**DHL is the first planned adapter, not the domain model.** FedEx, UPS, regional, 3PL = more adapters.

Internal riders remain the job engine; DHL is one **execution mode** (`fulfillment_mode = PLATFORM_FLEET | CARRIER`).

---

## 14. DHL / actual carrier cost

| Amount | When | Stored on |
| --- | --- | --- |
| Customer shipping charge | Checkout quote | `OrderEconomics.shipping_charged_minor` |
| Estimated carrier cost | Quote | `shipping_quote_cost_minor` |
| Company subsidy | `charged - quote_cost` or explicit rule | `shipping_subsidy_minor` |
| **Actual DHL (or other) cost** | Carrier invoice / webhook | `shipping_actual_minor` (immutable once posted) |
| Variance | After invoice | Ledger P&L `FREIGHT_VARIANCE` (not UPDATE of snapshot quote) |

Historical orders **keep** recorded actuals. Requoting DHL tomorrow must not rewrite them.

---

## 15. Global shipping

Pack keys (names illustrative): `shipping.domestic`, `shipping.cross_border`, `shipping.carriers[]`, `customs.duties_mode` (`UNKNOWN` until legal).

`ItemCountry.ship_cross_border = false` by default for medicines.

**LEGAL REVIEW** for export/import. Engineering fail-closed.

---

## 16. Promo / coupon

`PromoCampaign` + `PromoCode` + `PromoRedemption`.

Types: percent, fixed minor, min basket, first-order, auto vs code. Eligibility: country, category, sku, customer segment, vendor.

Funding: `FUND_PLATFORM` | `FUND_VENDOR` | `FUND_SPLIT` (must sum to 10000 bps).

Caps: global, per customer, per day. Promo **cost** is a snapshot line on `OrderEconomics`.

**Do not hardcode** “first order 10%”.

---

## 17. Affiliate integration

Existing affiliate module ([14](14_AFFILIATE_PLATFORM.md)):

`click/code` → `Attribution` on CheckoutSession → commission **pending** on `ORDER_PAID` → approve/reverse on delivery/refund windows → `AP_AFFILIATE` via ledger.

Clinical categories **default OFF**. Commerce only wires events; it does not invent inducement law.

Settlement schedule: **OPEN**.

---

## 18. Tax

`TaxPort` (provider TBD — **OPEN**). Input: country, region, ship-to, item tax category id, amounts.

Output: tax lines in quote + snapshot. **No GST/HST/VAT class names in core.**

Historical tax = snapshot. Rate table changes are prospective.

---

## 19. Returns / refunds

Policy-driven: `ReturnPolicy` by item class + country. Medicines often **non-returnable** except error/recall (pack).

Flow: `ReturnRequest` → eligibility → receive → inventory state (`RETURNED` / `QUARANTINE` / `DESTROY`) → `RefundIntent` → PSP → ledger reverse vendor/affiliate/take as rules dictate.

Failed refund: ops queue; do not silently mark Order `REFUNDED`.

---

## 20. Settlement and profitability

```
PSP capture → platform cash (payment module)
            → ledger split from OrderEconomics
                 vendor AP / owned pharmacy revenue
                 platform take
                 tax payable
                 affiliate AP
                 freight expense (actual when known)
```

Reconciliation: PSP payout vs journal vs carrier invoices. Merchant-of-record vs marketplace facilitator remains **OPEN**.

Company contribution = §5 net, using **actuals** when present, estimates until then, with explicit `actual_vs_quote` flags.

---

## 21. Search

OpenSearch catalog index ([24](24_SEARCH_ARCHITECTURE.md)): item, brand, category, sku, country, locale, **availability projection**, not live qty SoT.

**Do not index** clinical notes, Rx images, lab analytes, chat.

Price/eligibility always re-checked in catalog service.

---

## 22. Domain events (outbox)

Existing envelope + SCREAMING_SNAKE ([22](22_EVENT_ARCHITECTURE.md)):

`CATALOG_ITEM_PUBLISHED` · `OFFER_CHANGED` · `PRICE_VERSION_PUBLISHED` · `INVENTORY_ADJUSTED` · `INVENTORY_RESERVED` · `ORDER_CREATED` · `ORDER_PAID` · `ORDER_CONFIRMED` · `ORDER_CANCELLED` · `FULFILLMENT_PACKED` · `SHIPMENT_CREATED` · `SHIPMENT_DELIVERED` · `CARRIER_COST_RECORDED` · `REFUND_CREATED` · `REFUND_COMPLETED` · `VENDOR_SETTLEMENT_CREATED` · `PROMO_REDEEMED`

Consumers: search indexer, CRM projector (later), notification, ledger, affiliate.

---

## 23. CRM (consume later)

Do **not** build CRM in these slices. Project:

`product_viewed` · `cart_updated` · `cart_abandoned` · `order_created` · `order_delivered` · `refund_completed`

PII minimization; no Rx payloads in CRM.

---

## 24. Security boundaries

| Data | Class | Control |
| --- | --- | --- |
| Catalog public fields | Public | Pack publish |
| Vendor cost / take rules | Restricted | Seller org + finance admin |
| Customer address / phone | PII | Order RBAC, RLS |
| Rx image / status | Health | `prescription` + consent; **not** in search |
| PAN/CVV | Forbidden | PSP only |
| Journal | Financial SoT | Finance roles, immutable |
| Offer draft | Seller | Org isolation |

Admin finance ≠ pharmacist Rx. Packer does not see Rx image by default ([06](06_PHARMACY_PLATFORM.md)).

---

## 25. Database (conceptual — no migrations)

Extends [20](20_DATABASE_ARCHITECTURE.md). New/emphasized tables (logical):

`brands`, `categories`, `catalog_items`, `catalog_variants`, `skus`, `item_countries`, `item_i18n`, `item_assets`, `offers`, `price_versions`, `commercial_rules`, `inventory_lots`, `stock_movements`, `reservations`, `bins`, `inbound_receipts`, `transfers`, `carts`, `cart_lines`, `checkout_sessions`, `orders`, `order_lines`, `order_economics`, `order_line_economics`, `fulfillments`, `carrier_shipments`, `promo_campaigns`, `promo_redemptions`, `return_requests`, `tax_quotes` (or embed in economics), `attributions` (affiliate).

Rules: UUID v7, `country_id`, RLS, integer money, economics **append-only**.

---

## 26. API boundaries (design, not implementation)

| Surface | Module | Examples |
| --- | --- | --- |
| Catalog read | `catalog` | `GET /v1/catalog/items`, `GET /v1/offers/:id` |
| Catalog write | `catalog` | Admin/pharmacy/vendor listing APIs |
| Price quote | `catalog`/`pricing` | `POST /v1/pricing/quote` |
| Inventory | `inventory` | Adjust, transfer, availability |
| Cart | `order` | `POST /v1/cart/lines` |
| Checkout | `order` + `payment` | `POST /v1/checkout/sessions` |
| Orders | `order` | Customer + seller + admin |
| Shipments | `logistics` + carrier | Track, label (staff) |
| Promo | `order` or `growth` | Validate code |
| Settlement | `settlement` | Vendor statements (after 1G) |

Problem+JSON, idempotency on money, JWT `aud` isolation. No BFF ([43](43_ECOSYSTEM_BASELINE_LOCK.md)).

---

## 27. UI information architecture (no screens)

**Customer:** Home · Categories · Search · PDP · Cart · Checkout · Orders · Tracking  

**Vendor:** Catalog · Products/Offers · Inventory · Orders · Settlement  

**Pharmacy:** Catalog · Stock/lots · Rx desk (later paid) · Pick/pack · Transfers  

**Admin:** Catalog publish · Pricing/rules · Vendors · Inventory · Warehouses · Orders · Shipments · Promos · Finance  

Use existing empty shells ([48](48_APPLICATION_SHELL_IMPLEMENTATION_NOTES.md)). No product UI in this task.

---

## 28. Performance strategy

Stay on the monolith ([28](28_PERFORMANCE_ARCHITECTURE.md), [43](43_ECOSYSTEM_BASELINE_LOCK.md)):

- CDN + image variants for assets  
- Redis cache for published catalog fragments (never cache authz or Rx)  
- Cursor pagination; virtualize long admin tables  
- OpenSearch for typeahead; PG for checkout  
- SSR/streaming for SEO category/PDP  
- Async: index, notifications, carrier webhooks  
- Idempotency keys; DB indexes on (`country_id`, `seller_org_id`, `offer_id`), lots `(location_id, sku_id, status)`  
- **No** microservices extraction as a Phase 1 plan  

---

## 29. Globalization

Forbidden in code: India, INR, GST, UPI, “DHL-only core”, single language, single warehouse country.

All of the above = Country Policy Pack + adapters. XX pack: commerce services **false** until legal.

---

## 30. Slices 1A–1G (implementation when **authorized**)

### 1A — Catalog + product + pricing

**Depends on:** Phase 0 (identity, packs, shells, outbox).  
**DB:** brands, categories, items, variants, skus, item_countries, i18n, assets, offers, price_versions.  
**API:** catalog read/write, quote (no pay).  
**UI:** admin/pharmacy listing; customer browse/PDP **unpaid**.  
**Tests:** pack fail-closed, i18n fallback, Rx flag does not sell if pack off.  
**Security:** org isolation on drafts.  
**Perf:** publish projection, pagination.  
**Accept:** browse country-scoped catalog; **no checkout**.

### 1B — Inventory + warehouse foundation

**Depends on:** 1A.  
**DB:** lots, movements, locations bins (optional), adjustments.  
**API:** availability, adjust, transfer.  
**UI:** pharmacy stock; no customer pay.  
**Tests:** cannot oversell AVAILABLE; expiry not AVAILABLE.  
**Accept:** staff can see FEFO-capable lots; customer sees in-stock projection.

### 1C — Cart + checkout (still may be unpaid in locked P1)

**Depends on:** 1A–1B, addresses.  
**DB:** carts, lines, checkout_sessions, quotes.  
**API:** cart, validate, quote shipping/tax stubs.  
**UI:** cart; checkout **blocked for live money** until 1D authorized.  
**Tests:** `CART_SELLER_CONFLICT`; price-change; Rx gate.  
**Accept:** valid cart + address + eligibility; **no PSP**.

### 1D — Payments (**locked Phase 2**)

**Depends on:** 1C, PSP **OPEN**, MoR **OPEN**, ledger posting path.  
**DB:** payment_intents, webhook inbox (payment module).  
**API:** create/confirm intent, refunds.  
**UI:** pay sheet.  
**Tests:** idempotency, webhook replay, no PAN in logs.  
**Accept:** sandbox capture + `/health/ready` still green.

### 1E — Orders + fulfillment

**Depends on:** 1D (or COD pack — still ledger).  
**DB:** orders, lines, economics freeze, fulfillments, picks.  
**API:** order state machine.  
**UI:** pharmacy pick/pack; customer order list.  
**Tests:** allocate then cancel releases stock; one location v1.

### 1F — Shipping / DHL adapter

**Depends on:** 1E, carrier account **OPEN**.  
**DB:** carrier_shipments, tracking events, actual cost.  
**API:** quote/create/track.  
**UI:** tracking; staff labels.  
**Tests:** adapter timeout fail-closed; actual cost does not erase quote.  
**Accept:** sandbox label + track; economics `shipping_actual` when invoice simulated.

### 1G — Settlement + profitability

**Depends on:** 1D–1F, [13](13_LEDGER_SETTLEMENT.md).  
**DB:** journal from snapshots; vendor statements.  
**API:** settlement read models.  
**UI:** admin/vendor finance **read**.  
**Tests:** journal balances; historical take-rate frozen.  
**Accept:** one sandbox order produces balancing journal + contribution report.

**Authorization rule:** 1A–1B may be the first **coding** authorization after Phase 0 human sign-off. 1C–1G require Phase 2 authorization per [33](33_DEVELOPMENT_ROADMAP.md) unless a **CR** explicitly changes the lock.

---

## 31. Open decisions (do not invent)

| ID / topic | Why blocked |
| --- | --- |
| OD-COUNTRY-01 | Launch country |
| OD-BRAND-01 | Legal brand / entity |
| MoR / marketplace facilitator | Who is seller on the invoice |
| PSP selection | Adapter yes; vendor no |
| Tax engine vendor | TaxPort only |
| DHL (or other) contract | Adapter yes; account no |
| Take-rate / bps | Rules engine yes; numbers no |
| OD-PHARM-01 | Warehouse ship-to-customer |
| OD-PHARM-02 | Split locations in one order |
| Vendor settlement calendar | Settlement yes; T+N no |
| Multi-seller cart | Locked **off** in v1 |
| Consignment in platform WH | Future CR |
| OD-OBS-01 | OTel/Sentry vendor |

---

## 32. Risks

| Risk | Mitigation |
| --- | --- |
| Implementing 1D before ledger | Forbidden by 33/43 |
| Mixing two sellers in one Order | `CART_SELLER_CONFLICT` |
| Float money | BIGINT only |
| Catalog as SoT for stock | Lots are SoT |
| Search as SoT for price | Requote at checkout |
| DHL in domain tables | `CarrierPort` |
| GST/UPI in core | Pack + adapters |
| Promo silently funded by vendor | `funding` field required |
| Clinical affiliate | Default OFF |
| PHI in OpenSearch | Index allowlist |
| Painting 1A as “store live” | Unpaid until 1D |

---

## 33. Explicit non-delivery of this task

- No production TypeScript/Java/SQL beyond this markdown  
- No Prisma migrations  
- No UI  
- No HTTP handlers  
- No DHL SDK  
- No Phase 1 implementation start  

---

## Related

[00](00_MASTER_INDEX.md) · [33](33_DEVELOPMENT_ROADMAP.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md) · [49](49_PHASE_0_FINAL_AUDIT.md)
