# 52 — Phase 1B Inventory + Warehouse foundation (implementation plan)

**Status:** Implemented — see [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md)  
**Date:** 26 August 2026  
**Authorization:** Phase 1B inventory/warehouse foundation **only**  
**Forbidden in 1B:** cart, checkout, payment, order, refund, DHL/carrier, settlement, procurement/PO, doctor, lab, CRM, promo/affiliate expansion  

Canonical: [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §7–8, [20](20_DATABASE_ARCHITECTURE.md) §5.9/5.14, [06](06_PHARMACY_PLATFORM.md), [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

This document is the pre-code audit and build contract for 1B. **No migrations or UI in this task.**

---

## 0. 1A dependency verification

Phase 1A tables exist and are safe to **reference** (additive FKs only; do not alter 1A columns):

| 1B needs | 1A actual | Notes |
| --- | --- | --- |
| Catalog item | `CatalogItem` / `catalog_items` | Global identity; country overlay is `CatalogItemCountry` |
| Variant | `CatalogVariant` | Pack/strength |
| SKU | `CatalogVariant.skuCode` (unique) | **No separate `Sku` table** — 1B FKs `variant_id` |
| Offer | `CatalogOffer` | Unique `(variantId, sellerOrgId, countryId)` |
| Seller | `CatalogOffer.sellerOrgId` → `Organization` | Same org model as partners |
| Country | `countryId` on offer/item-country | ISO via `Country.isoAlpha2` |
| Price version | `PriceVersion` | Append-only; 1B must **not** mutate sell/cost |

**Ownership does not conflict** if 1B uses a **physical** owner, not a second commercial owner:

| Concept | Field | Meaning |
| --- | --- | --- |
| Who may sell | `CatalogOffer.sellerOrgId` + `ownership` | Commercial (1A) |
| Who owns the units | `InventoryLot.ownerOrgId` | Physical (1B) |
| Where it sits | `locationId` → existing `Location` | Store / warehouse / vendor warehouse |

**Invariant (v1):** `owner_org_id` **equals** the offer’s `seller_org_id` for sellable stock. A warehouse is a **location of that org**, not a second vendor identity. Consignment (platform WH holding vendor units with `owner_org_id = vendor`) is a **future CR**, not 1B default.

**Offer.locationId** (optional in 1A) is an assortment hint, not stock. Availability for customers = projection of 1B balances, never search-as-SoT.

---

## 1. Inventory architecture

Kernel module `inventory` (monolith). PostgreSQL is the **only** quantity system of record.

### 1.1 Ownership classes

Reuse 1A `OfferOwnership`. Inventory does **not** invent a fourth owner.

| Class | `owner_org_id` | Typical `Location.kind` | Notes |
| --- | --- | --- | --- |
| `PLATFORM_OWNED` | `PLATFORM` or `PHARMACY_OWNED` org | `STORE` or `WAREHOUSE` | Platform/pharmacy stock |
| `VENDOR_OWNED` | `VENDOR` org | `VENDOR_WAREHOUSE` or `WAREHOUSE` | Vendor stock |
| `MARKETPLACE` | Same as vendor | Same | **Alias** of vendor-owned lots; no third ledger |
| Store stock | Same owner org | `STORE` | Last-mile default (OD-PHARM-01) |
| Warehouse stock | Same owner org | `WAREHOUSE` | Replenishes stores by default |

**Warehouse is never the financial owner.** `Location` has `organizationId`; staff authorization is membership on that org + optional location scope.

### 1.2 Stock buckets

Per **lot** (or lot-less bucket when pack `lot_required=false` — OD-VEND-04, default **lots required** for `RX`/`CONTROLLED`):

| Quantity | Definition | Mutated by |
| --- | --- | --- |
| `on_hand` | Physical units at location | RECEIPT, ADJUSTMENT, SHIP, TRANSFER_*, RETURN, DAMAGE, EXPIRY (net) |
| `reserved` | Held for a reservation (not yet picked) | RESERVATION / RELEASE |
| `damaged` | Not sellable | DAMAGE / reverse adj |
| `expired` | Past expiry or expired write-off | EXPIRY |
| `quarantined` | Held pending QC | QUARANTINE / UNQUARANTINE |
| `returned` | Received from customer/store, not yet available | RETURN |
| `in_transit` | On an open transfer (from-side shipped, to-side not received) | TRANSFER_OUT / TRANSFER_IN |

**Sellable available (implementation formula, integer):**

```
available = on_hand - reserved - damaged - expired - quarantined - returned - in_transit_out
```

All terms `>= 0`. **`available <= on_hand`**. Application + CHECK: no bucket negative. Reservations consume `available` only (`SELECT … FOR UPDATE` on the lot row).

`in_transit` is modeled as **from-lot** `on_hand` decreased + transfer line `qty_in_transit` (not double-counted as available at destination until TRANSFER_IN).

---

## 2. Lot / batch / expiry

`InventoryLot` is the physical identity:

- `variant_id` (SKU)
- `location_id`
- `owner_org_id`
- `country_id` (must match location.countryId)
- `lot_code` (nullable only if pack `lot_required=false`)
- `expires_on` DATE nullable (required if pack `expiry_required` or `regulated_class` in `RX`/`CONTROLLED`)
- `manufactured_on` DATE optional
- `status`: `ACTIVE` | `QUARANTINE` | `EXPIRED` | `CLOSED`

**Do not invent statute.** Country Policy Pack keys (names illustrative, empty until legal):

- `inventory.lot_required`
- `inventory.expiry_required`
- `inventory.fefo_required` (FEFO pick **hint**, not a silent legal claim)
- `inventory.negative_forbidden` (default true)

**FEFO:** when reserving/picking, prefer earliest `expires_on` among `ACTIVE` lots with `available > 0`. If pack does not set `fefo_required`, order is unspecified (still no oversell). **LEGAL/COMPLIANCE REVIEW REQUIRED** before treating FEFO as a country mandate.

No PHI, Rx images, or patient ids on lots.

---

## 3. Warehouse architecture

**Do not create a second location master.** Extend existing `Location` (`STORE`, `WAREHOUSE`, `VENDOR_WAREHOUSE`, …).

| Entity | 1B | Role |
| --- | --- | --- |
| `Location` | Exists (Phase 0) | Site: country, org, kind, address, timezone (add timezone if missing — data, not “IST”) |
| `WarehouseProfile` | New, 1:1 optional on `Location` where kind is warehouse | Capacity flags, fulfillment **capability** flags — **not** OD-PHARM-01 answer |
| `WarehouseZone` / `WarehouseBin` | **Optional** tables | OD-PHARM-07: v1 **flat lot qty**; bins not required for 1B exit |
| `InventoryLot` | New | Stock at location |
| `InventoryBalance` | New | Cached buckets (projection of movements) |
| `InventoryMovement` | New | Immutable ledger |
| `InventoryReservation` | New | TTL holds |
| `GoodsReceipt` / `GoodsReceiptLine` | New | GRN inbound foundation (no PO) |
| `StockTransfer` / `StockTransferLine` | New | WH ↔ store / WH ↔ WH same country |

**Multi-warehouse:** N locations per org per country. No hardcoded single warehouse, no India origin.

**OD-PHARM-01:** both `STORE` and `WAREHOUSE` may have `fulfillment_capable` boolean. **Default operating mode remains stores dispatch / warehouse replenishes.** 1B must not implement customer ship-from-warehouse routing. Config flag only.

---

## 4. Stock movements (immutable)

Every quantity change is an `InventoryMovement` row. **Never UPDATE historical movements.** Corrections = reversing movement + new movement.

| `type` | Effect (from → to) |
| --- | --- |
| `RECEIPT` | +on_hand (GRN) |
| `ADJUSTMENT` | ±on_hand (reason required) |
| `RESERVATION` | +reserved (available↓) |
| `RELEASE` | −reserved |
| `PICK` | reserved → picked (optional 1B: skip if no pick UI; can defer to 1E) |
| `PACK` | picked → packed (defer UI; type reserved) |
| `SHIP` | −on_hand, −reserved (defer live ship; type reserved, **no DHL**) |
| `TRANSFER_OUT` | −on_hand, +in_transit on transfer |
| `TRANSFER_IN` | −in_transit, +on_hand at dest |
| `RETURN` | +returned (or +on_hand if pack allows immediate restock) |
| `DAMAGE` | on_hand → damaged |
| `EXPIRY` | on_hand → expired |
| `QUARANTINE` | on_hand → quarantined |
| `UNQUARANTINE` | quarantined → on_hand |

1B **must implement** RECEIPT, ADJUSTMENT, RESERVATION, RELEASE, TRANSFER_OUT/IN, DAMAGE, EXPIRY, QUARANTINE, UNQUARANTINE. PICK/PACK/SHIP types exist in enum but **must not** call carriers or create orders.

Each movement: `id` UUID v7, `lot_id`, `qty` (>0), `reason_code`, `actor_person_id`, `idempotency_key` unique, `correlation_id`, `occurred_at`.

Balance update in the **same DB transaction** as the movement (`UPDATE … WHERE available >= qty`).

---

## 5. GRN / inbound (no procurement)

`GoodsReceipt`: `id`, `location_id`, `owner_org_id`, `country_id`, `status` (`DRAFT`/`POSTED`/`CANCELLED`), `received_at`, `actor_id`.

`GoodsReceiptLine`: `variant_id`, `lot_code`, `expires_on`, `qty`, `qty_accepted`, `qty_rejected`.

`POSTED` writes `RECEIPT` movements and creates/updates lots. Rejected qty → `QUARANTINE` or `DAMAGE` per reason. **No supplier PO, no AP invoice.**

---

## 6. Transfers

`StockTransfer`: `from_location_id`, `to_location_id`, `owner_org_id`, `country_id`, `status`.

States: `DRAFT` → `RESERVED` → `DISPATCHED` → `IN_TRANSIT` → `RECEIVED` / `CANCELLED`.

Rules: same `country_id` on both locations (1B). Cross-border = **out of scope**. Both locations same `organization_id` in v1 (no vendor→platform stock gift). OD-PHARM-06 (auto-approve) **not implemented** — all transfers explicit.

---

## 7. Reservations (no checkout)

`InventoryReservation`: `id`, `variant_id`, `lot_id` (nullable until allocated), `location_id`, `owner_org_id`, `qty`, `status` (`OPEN`/`RELEASED`/`EXPIRED`/`CONSUMED`), `expires_at` (TTL), `idempotency_key`, `purpose` (`MANUAL` | `CHECKOUT` — **CHECKOUT unused in 1B**).

Allocate FEFO lots under row lock. Double reserve of the same idempotency key is a no-op. TTL job (BullMQ delayed) emits `INVENTORY_RELEASED`.

---

## 8. Search / catalog projection

PostgreSQL lots/balances = SoT. Optionally extend `CatalogSearchDocument` with `available: boolean` (any `available > 0` for published offers in country). **Never** store qty in OpenSearch as truth. Reindex on movement events (same pattern as 1A).

Customer UI: in-stock / unavailable only. **No inventory admin on customer app.**

---

## 9. Security / RLS / audit

- Same RLS pattern as 1A (enable RLS + app policies) **plus** service checks:
  - Vendor membership → `owner_org_id = membership.organizationId` only
  - Platform/country membership → country-scoped
  - Location-scoped membership → those `location_id`s only
- Permissions (add to RBAC catalog): `inventory:read`, `inventory:adjust`, `inventory:receive`, `inventory:transfer`, `inventory:admin`
- Every ADJUSTMENT/RECEIPT/TRANSFER: `SecurityEvent` or inventory audit actor on the movement row
- No clinical payload on inventory

---

## 10. Events (existing outbox + BullMQ only)

`INVENTORY_RECEIVED` · `INVENTORY_ADJUSTED` · `INVENTORY_RESERVED` · `INVENTORY_RELEASED` · `INVENTORY_TRANSFERRED` · `INVENTORY_QUARANTINED` · `INVENTORY_EXPIRED`

Envelope as [44](44_EVENT_IMPLEMENTATION_NOTES.md). Idempotent consumers. **No Kafka.**

---

## 11. Performance

- Unique `(location_id, variant_id, lot_code)` (lot_code `''` if lot-less)
- Indexes: `(location_id, variant_id)`, `(owner_org_id, country_id)`, `(expires_on)` where not null
- `UPDATE inventory_balances SET … WHERE id = $1 AND available >= $qty` in txn with movement insert
- Reservation TTL via BullMQ delayed job
- Idempotency keys on receive/adjust/reserve/transfer
- Cursor pagination on movements
- Redis: optional availability cache + lock coordination; **not** SoT
- Monolith only

---

## 12. Logical schema (no migration yet)

Additive tables (names may match Prisma):

`warehouse_profiles`, `warehouse_zones` (optional), `warehouse_bins` (optional), `inventory_lots`, `inventory_balances`, `inventory_movements`, `inventory_reservations`, `goods_receipts`, `goods_receipt_lines`, `stock_transfers`, `stock_transfer_lines`.

FKs: `variant_id` → `catalog_variants`, `location_id` → `locations`, `owner_org_id` → `organizations`, `country_id` → `countries`.

**Do not** add `InventoryItem` as a second SKU. SKU = variant.

Compatibility: 1A `CatalogOffer.locationId` remains optional; 1B does not require filling it.

---

## 13. API plan (1B)

| Surface | Examples | Auth |
| --- | --- | --- |
| Admin | warehouses/locations, lots, balances, movements, GRN post, transfers, reservations | `inventory:admin` / adjust/receive/transfer |
| Vendor | own lots, own adjustments (if permitted), own receipts | org membership + `inventory:adjust` |
| Customer | **none** for inventory CRUD; catalog already shows derived availability |

No checkout reserve endpoint in 1B (internal/service + admin/test only).

---

## 14. UI plan (1B implementation, not this audit)

**Admin:** warehouses, locations, inventory list, lot detail, movement history, GRN, transfers.  
**Vendor:** own inventory, lot/qty update where permitted.  
**Customer:** no new screens; catalog “available / unavailable” only.

---

## 15. Globalization

No India / INR / GST / single warehouse / single timezone in code. `Location` country + IANA timezone + address fields. Cross-country transfer **rejected** in 1B.

---

## 16. Acceptance criteria (for the later implementation task)

1. `available` and `on_hand` never negative; `available <= on_hand`  
2. Concurrent reservations cannot oversell (transaction + row lock / conditional update)  
3. Lot + expiry on regulated SKUs when pack requires  
4. Quarantine and expired stock not reservable  
5. Movements immutable; reverse via new rows  
6. Vendor A cannot read/write vendor B lots  
7. Location/org isolation for warehouse staff  
8. Transfer lifecycle DRAFT→…→RECEIVED without customs  
9. GRN POSTED creates lots + RECEIPT movements  
10. RLS enabled on new tables  
11. Audit actor on adjustments  
12. Outbox events listed in §10  
13. Tests: isolation, oversell, FEFO hint, TTL release, transfer, GRN, country match  
14. **No** cart/checkout/payment/order/DHL/settlement modules  

---

## 17. Open decisions (unchanged)

| ID | Topic | 1B stance |
| --- | --- | --- |
| **OD-PHARM-01** | Warehouse ship-to-customer | Default stores dispatch; capability flag only |
| **OD-PHARM-02** | Split locations on one order | Default no; model supports many locations |
| **OD-PHARM-06** | Transfer auto-approve | Not implemented |
| **OD-PHARM-07** | Bin-level WMS | Flat lot qty; bins optional |
| **OD-VEND-04** | Lot-less non-Rx | Pack `lot_required`; default lots on |
| Launch country, legal Rx/FEFO mandate, warehouse operating model | Human | Do not invent |

---

## 18. Out of 1B

Cart, checkout, payment, PSP, ledger settlement, DHL, pick/pack/ship execution, PO/procurement, customs, microservices, second identity, clinical data on lots.

---

## Related

[51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) · [06](06_PHARMACY_PLATFORM.md) · [20](20_DATABASE_ARCHITECTURE.md) · [33](33_DEVELOPMENT_ROADMAP.md) · [35](35_OPEN_DECISIONS.md)
