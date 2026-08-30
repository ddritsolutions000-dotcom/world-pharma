# 53 — Phase 1B Inventory + Warehouse implementation

**Status:** Implemented (26 August 2026)  
**Authorization:** Phase 1B inventory/warehouse foundation only  
**Not implemented:** cart, checkout, payment, PSP, wallet, order, customer delivery, DHL, settlement, payouts, P&L, doctor, lab, CRM

Canonical: [52](52_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION_PLAN.md), [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

---

## Schema

Migration `20260826220000_inventory_warehouse` (additive).

Tables: `warehouse_profiles`, `inventory_lots`, `inventory_balances`, `inventory_movements`, `inventory_reservations`, `goods_receipts`, `goods_receipt_lines`, `stock_transfers`, `stock_transfer_lines`.

Additive columns only on existing tables: `locations.timezone`, `catalog_search_documents.in_stock`.

- UUID v7 application-assigned ids  
- Quantities are integers (pack counts), never money  
- `available = on_hand - reserved - damaged - expired - quarantined - returned`  
- `in_transit` is reporting-only on the source lot (already deducted from `on_hand`)  
- CHECK constraints forbid negative buckets and enforce the available formula  
- `inventory_movements` are immutable (UPDATE/DELETE trigger)  
- RLS enabled with the same application-role pattern as Phase 0/1A; vendor isolation is enforced in the service layer  

SKU remains `CatalogVariant.skuCode`. There is no second SKU or vendor identity table.

---

## Inventory calculations

Physical owner is `InventoryLot.ownerOrgId`. Commercial seller remains `CatalogOffer.sellerOrgId`. v1: they must match for sellable stock. Consignment is not implemented.

Reservations decrement `available` via `reserved`. Oversell is prevented with `SELECT … FOR UPDATE` plus a serializable transaction and a conflict when remaining quantity is insufficient.

---

## Lots / expiry / FEFO

Lots carry `lot_code`, `expires_on`, optional `manufactured_on`. RX/CONTROLLED assortment requires lot code and expiry (country pack / assortment flags — **LEGAL/COMPLIANCE REVIEW REQUIRED**). FEFO is a pick **hint** when the published pack sets `inventory.fefo_required`; it is not claimed as a legal mandate.

No PHI is stored on inventory rows.

---

## GRN

`DRAFT` → `RECEIVED` → `POSTED` (or `CANCELLED`). Posting creates/updates lots, writes `RECEIPT` (and quarantine/damage for rejects), and emits `INVENTORY_RECEIVED`. No purchase order or AP.

---

## Reservations

TTL holds with idempotency keys. Purpose `CHECKOUT` is rejected in this phase. Expired OPEN reservations are released by `InventoryTtlService` (15s interval outside tests) plus lazy expiry inside reserve.

---

## Transfers

Same organization, same country: `DRAFT` → `RESERVED` → `IN_TRANSIT` (dispatch) → `RECEIVED`. Cross-border transfers are rejected. No customs.

---

## APIs

| Surface | Prefix | Auth |
| --- | --- | --- |
| Admin | `/api/v1/admin/inventory/*` | JWT + `inventory:read\|adjust\|receive\|transfer\|admin` |
| Vendor | `/api/v1/vendor/inventory/*` | JWT + org membership |
| Customer | none for inventory CRUD | Catalog `inventory.available` boolean only |

---

## Events / audit

Outbox + BullMQ only: `INVENTORY_RECEIVED`, `INVENTORY_ADJUSTED`, `INVENTORY_RESERVED`, `INVENTORY_RELEASED`, `INVENTORY_TRANSFERRED`, `INVENTORY_QUARANTINED`, `INVENTORY_EXPIRED`. Privileged GRN/adjust/transfer also write security events. Payloads are sanitized; no secrets/PHI.

---

## UI

- Admin `/inventory` — lots, load by owner org, adjustment confirmation  
- Vendor `/vendor/inventory` — own lots only  
- Customer product page: Available / Unavailable. No quantities, lots, or warehouse addresses  

---

## Tests

API e2e covers GRN, concurrent reservation oversell, vendor isolation, transfer lifecycle, customer boolean availability, outbox types. Admin/vendor UI tests assert inventory copy without checkout/carriers/settlement.

---

## Performance

Indexes on `(location, variant)`, `(owner, country)`, `expires_on`. PostgreSQL is the quantity system of record. Redis is unused as inventory SoT.

---

## Known limitations

- PICK/PACK/SHIP exist as enum values only  
- Bin/zone WMS not built (OD-PHARM-07)  
- FEFO is optional pack hint  
- Search `in_stock` is a projection, not SoT  
- Admin/vendor UIs need a real OTP token for writes  

---

## Open decisions (unchanged)

OD-PHARM-01 store vs warehouse ship-to-customer, OD-PHARM-02 split locations, OD-PHARM-06 transfer auto-approve, OD-PHARM-07 bins, OD-VEND-04 lot-less non-Rx, launch country, legal Rx/FEFO mandate.

---

## Related

[52](52_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION_PLAN.md) · [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md)
