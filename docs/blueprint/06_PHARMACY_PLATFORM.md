# 06 — Pharmacy Platform (Owned)

**Status:** Blueprint  
**Audience:** Pharmacy product, pharmacy-app engineering, inventory/ops, finance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Apps](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Health Record](16_HEALTH_RECORD.md) · [Admin ERP](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · **R5 plan** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md)

**Requirement IDs:** REQ-PHARM, REQ-ORD, REQ-RX, REQ-LOG, REQ-PAY

This document is **first-party (owned) pharmacy** only: `organization_type = PHARMACY_OWNED`. Third-party sellers are [Vendor Platform](07_VENDOR_PLATFORM.md). Both fulfill **Order** objects and may emit **MEDICINE_DELIVERY** jobs; inventory, Rx legal responsibility, and invoicing differ.

> **R5 execution plan:** Digital prescription → dispensing authorization → commercial handoff is specified in [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) (**CR-R5-AUTH-111**). Store web/mobile remain the pharmacist surface; no dedicated pharmacist app. **R5-C pharmacy dispensing:** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) (plan) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**CR-R5-C-IMPL-116**, **R5_C_IMPLEMENTED**). **R5-D Order-from-Rx plan:** [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) (**CR-R5-D-AUTH-117**, **R5_D_PLAN_READY** — coding not authorized).

---

## 1. Purpose and scope

Owned pharmacy is the ERP-lite for World Pharma stores and warehouses: master data, stock (batch/expiry), purchasing, pricing, Rx verification, pick/pack, dispatch into logistics, returns, and billing.

It does **not** own: customer identity, payment acquiring, ledger posting rules, rider assignment, or video. It **does** own: stock truth at Location, Rx verification cases for goods, fulfillment of owned-seller Orders.

**ASSUMPTION (A-PHARM-01):** Platform can run owned pharmacy and marketplace in the same country (A-BIZ-04), subject to licensing. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

**ASSUMPTION (A-PHARM-02 / A-BIZ-01):** A goods **Order** has exactly one selling Organization. Owned-pharmacy Orders never mix a vendor’s lines.

**ASSUMPTION (A-PHARM-03):** Customer checkout is [Customer](05_CUSTOMER_PLATFORM.md) **CheckoutSession**. Pharmacy staff never capture cards. They may record COD hand-off exceptions only via logistics POD events.

---

## 2. Apps

| ID | Client | Primary jobs |
| --- | --- | --- |
| APP-PHARM (RN) | React Native | Queue, Rx review on tablet, pick/pack, scan, dispatch, exception photos |
| APP-PHARM (Web) | Next.js (pharmacy portal) | Inventory, PO, suppliers, transfers, pricing, reports, invoices |

**ASSUMPTION (A-PHARM-04):** Shared RN workspace flavor + web for dense workflows ([Application Architecture](04_APPLICATION_ARCHITECTURE.md)). JWT `aud = pharmacy` (or partner family with membership check). Customer tokens rejected.

Realtime: fulfillment queues via poll + SSE/WebSocket on `location_id`. No LiveKit in this app.

---

## 3. Party model

| Object | Meaning |
| --- | --- |
| **Organization** | Pharmacy chain (`PHARMACY_OWNED`) |
| **Location** | `STORE` (branch) or `WAREHOUSE` (or dark-store later — **not v1**) |
| **Person** | Staff user with pharmacy role membership |

### 3.1 Stores / branches

A **store (branch)** is a Location that can: receive customer Orders in its service polygon (or be selected by routing), verify Rx, pack, and dispatch. Hours, license identifiers (pack-defined fields — **do not invent license schemes**), and catalog assortment flags live on Location + Country Policy Pack.

### 3.2 Warehouse

A **warehouse** is a Location that holds bulk stock, supplies stores via **stock transfer**, and may ship directly if routing policy says so (**OPEN DECISION OD-PHARM-01:** warehouse ship-to-customer vs store-only last mile). Default: **stores dispatch to customer**; warehouse replenishes stores.

### 3.3 Routing (which Location fulfills)

On CheckoutSession confirm for an owned-seller Order:

1. Resolve serviceable Locations for the customer address.
2. Prefer Locations with FEFO-feasible stock for all lines (or split **within the same Organization** across locations — **OPEN DECISION OD-PHARM-02**).
3. **ASSUMPTION (A-PHARM-05):** v1 **no split shipment** across Locations for one Order. One fulfilling `location_id`. If no single Location can fill, fail allocation → customer OOS path (OD-CUS-14).

---

## 4. Roles and RBAC

From [Roles](03_USER_ROLES_AND_PERMISSIONS.md):

| Role | Scope | Can | Cannot |
| --- | --- | --- | --- |
| `pharmacy_owner` | organization | All stores: config, staff, inventory, reports, pricing | Ledger execute, policy packs, other orgs |
| `pharmacy_manager` | location (multi optional) | Staff at location, inventory adjust/transfer, accept orders, exceptions | Approve Rx unless also pharmacist; country catalog publish of Rx drugs |
| `pharmacist` | location | `prescription:verify` / `reject`, counselling flags, clinical substitution propose | Pack-only complete without verify; `inventory:adjust` unless granted |
| `pharmacy_packer` | location | Pick/pack, scan, packing photos | `prescription:verify`, pricing, PO approve |
| `pharmacy_buyer` | organization | Suppliers, POs, GRN | Rx verify, customer PII beyond PO need |

Customer PII on an Order: name, phone, address as needed to fulfill. **Rx images:** pharmacist (and policy medical reviewer). Packer sees **pick list** (SKU, qty, form), not Rx image by default.

**SoD:** packer cannot verify Rx. Buyer cannot verify Rx. **LEGAL/COMPLIANCE REVIEW REQUIRED** for local pharmacy SoD.

Soft delete: Location, supplier, staff memberships use `deleted_at`. **Inventory ledger / batch movements** are immutable facts (correct via reversing adjustment), not `deleted_at`. Financial tax invoices follow [Ledger](13_LEDGER_SETTLEMENT.md) (no casual delete).

IDs: UUID v7. Money: integer minor units + ISO currency of the country pack.

---

## 5. Core objects

| Object | Owner | Notes |
| --- | --- | --- |
| **CatalogItem** | `catalog` | Shared medicine/product master; pharmacy does not fork SKUs per store |
| **Offer** | `catalog` | Item + this Organization + Location (or org-wide) + country + price/tax |
| **StockLot / Batch** | `inventory` | `lot_number`, `expiry_date`, qty, Location |
| **StockMovement** | `inventory` | Receipt, transfer, allocate, pick, reverse, expiry write-off |
| **PurchaseOrder** | `inventory` / procurement | To **Supplier** |
| **Order** | `order` | Customer goods order; seller = this org |
| **Fulfillment** | `order` | Pick/pack unit at Location |
| **PrescriptionCase** | `prescription` | Verification workflow |
| **HealthArtifact** | `health` | Rx image/PDF; pharmacist access is operational, not a ConsentGrant |
| **LogisticsJob** | `logistics` | Type `MEDICINE_DELIVERY` |
| **Invoice** | billing projection | Configurable; **LEGAL REVIEW** |

---

## 6. Order state machine (owned pharmacy)

Customer-facing projection must match these names. Vendor Orders use the same machine where applicable ([Vendor](07_VENDOR_PLATFORM.md)).

```
DRAFT
  → PENDING_PAYMENT
      → PAID
          → RX_REVIEW          [only if any line requires Rx]
          → ACCEPTED           [no Rx required, or Rx already verified]
              → PACKING
                  → DISPATCHED
                      → OUT_FOR_DELIVERY
                          → DELIVERED

Any pre-DELIVERED (policy): → CANCELLED
DELIVERED (window): → RETURN_REQUESTED → RETURNED → REFUNDED
PAID / later (policy): → REFUNDED (without physical return, e.g. Rx reject)
```

### 6.1 States

| State | Meaning | Typical actor |
| --- | --- | --- |
| `DRAFT` | Checkout building; not visible as live order to store | System |
| `PENDING_PAYMENT` | PaymentIntent open | Customer / payment |
| `PAID` | Money committed **or** COD committed (OD-CUS-02) | Payment |
| `RX_REVIEW` | Awaiting pharmacist | `pharmacist` |
| `ACCEPTED` | Store committed to fulfill; stock hard-allocated | System / manager |
| `PACKING` | Pick/pack in progress | `pharmacy_packer` |
| `DISPATCHED` | Handed to logistics (job created/accepted) | Packer/manager + logistics |
| `OUT_FOR_DELIVERY` | Rider assigned and en route | Logistics |
| `DELIVERED` | POD success | Logistics |
| `CANCELLED` | Terminal; stock released; refund if due | Policy / customer / ops / pharmacy pre-dispatch |
| `RETURN_REQUESTED` | Customer or ops initiated return | Customer / support |
| `RETURNED` | Goods received back, QC done | Store |
| `REFUNDED` | Refund instruction completed (payment/wallet) | Payment/ledger |

`REFUNDED` may overlay after `CANCELLED` or `RETURNED`. Implementation: either a terminal state **or** `order.status` + `payment_refund_status`. **OPEN DECISION (OD-PHARM-03):** single status vs orthogonal `refund_status`. Recommendation: **keep `REFUNDED` as order status** when no further fulfillment; use `refund_ids[]` always.

### 6.2 Transitions (normative)

| From | To | Guard |
| --- | --- | --- |
| DRAFT | PENDING_PAYMENT | Checkout.StartPayment |
| PENDING_PAYMENT | PAID | Payment success / COD commit |
| PENDING_PAYMENT | CANCELLED | Fail, expire, customer abandon |
| PAID | RX_REVIEW | Any line `rx_required` and no linked VERIFIED case |
| PAID | ACCEPTED | No Rx needed; FEFO allocation success |
| RX_REVIEW | ACCEPTED | Case `VERIFIED`; allocation success |
| RX_REVIEW | CANCELLED | Reject / timeout; release holds; refund policy |
| ACCEPTED | PACKING | Packer start; assignment to user |
| PACKING | DISPATCHED | Pack complete + `Logistics.CreateJob(MEDICINE_DELIVERY)` success |
| DISPATCHED | OUT_FOR_DELIVERY | Job `ASSIGNED`/`PICKED` per [Logistics](11_LOGISTICS_PLATFORM.md) |
| OUT_FOR_DELIVERY | DELIVERED | POD/OTP success |
| ACCEPTED or PACKING | CANCELLED | OOS discovered, customer cancel policy, ops |
| DISPATCHED / OFD | CANCELLED | Rare; job cancel + return-to-store |
| DELIVERED | RETURN_REQUESTED | Within `return.window_hours` |
| RETURN_REQUESTED | RETURNED | QC receive |
| RETURN_REQUESTED | DELIVERED | Return denied (reason) |
| RETURNED / CANCELLED | REFUNDED | Refund engine success |

Illegal skips (e.g. PACKING → DELIVERED) are server-rejected.

### 6.3 Rx vs OTC

| Order type | After PAID |
| --- | --- |
| All OTC / non-Rx | Skip `RX_REVIEW` |
| Mixed Rx + OTC | `RX_REVIEW` for the order; do not pack until verified |
| Digital Rx already `SIGNED` and mapped | Pack may skip `RX_REVIEW` if policy `rx.skip_review_if_platform_signed` — **OPEN DECISION (OD-PHARM-04)** default **false** (pharmacist still confirms dispense) |

---

## 7. Prescription verification machine

```
UPLOADED → INTAKE → OCR_ASSISTED (optional) → PENDING_REVIEW
    → NEEDS_INFO ⇄ PENDING_REVIEW
    → VERIFIED
    → REJECTED
    → EXPIRED
    → CANCELLED
```

| State | Meaning |
| --- | --- |
| `UPLOADED` | Files stored; virus scan |
| `INTAKE` | Linked to Person; country; optional Order |
| `OCR_ASSISTED` | Non-authoritative line suggestions |
| `PENDING_REVIEW` | In pharmacist queue (location or country Rx desk — **OD-PHARM-05**) |
| `NEEDS_INFO` | Customer must re-photo / answer |
| `VERIFIED` | Structured items signed by pharmacist; substitutions recorded |
| `REJECTED` | Reason code; customer notified |
| `EXPIRED` | TTL or Rx date invalid per **pack after legal fill** |
| `CANCELLED` | Customer withdrew |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may verify, e-Rx vs scan, controlled substances, substitution, validity period. Do **not** hardcode a country’s Rx act.

OCR never auto-transitions to `VERIFIED`.

Reason codes (illustrative, not legal advice): `UNREADABLE`, `EXPIRED_RX`, `IDENTITY_MISMATCH`, `INCOMPLETE`, `OUT_OF_SCOPE_CONTROLLED`, `NOT_A_PRESCRIPTION`, `QUANTITY_EXCEEDS`.

---

## 8. Inventory constraints (batch, expiry, FEFO)

### 8.1 Rules

1. Quantity at a Location is the **sum of non-expired, non-recalled batches** minus holds.
2. **FEFO:** allocation and pick must prefer earliest `expiry_date` (then earliest receipt). Override requires `inventory:adjust` + reason (manager).
3. Cannot allocate: `expiry_date < today+pack.dispense_min_remaining_days`, recalled, quarantined, `deleted` lots.
4. **Soft hold** at CheckoutSession DRAFT/PENDING_PAYMENT (`hold_ttl` from pack).
5. **Hard allocation** at `ACCEPTED` (after Rx if needed). OTC may hard-allocate at `PAID` if no Rx — **ASSUMPTION (A-PHARM-06):** hard allocate at `ACCEPTED` always, so Rx reject never needs de-pick of a started pack.
6. Pick must scan or enter batch; mismatch to allocated lot is a **packing error** (F-PACK).
7. Near-expiry reports do not auto-write-off; buyer/manager action.

### 8.2 Stock transfer

| Step | State |
| --- | --- |
| Draft transfer | `DRAFT` |
| Ship from source | `IN_TRANSIT` (qty leaves available at source) |
| Receive + QC | `RECEIVED` (new or same batch at dest) |
| Cancel | `CANCELLED` (before ship) |

**OPEN DECISION (OD-PHARM-06):** Auto-approve transfers below threshold. Default: manager approve all.

Transfers never change Country. Cross-country stock is forbidden without compliance (not v1).

### 8.3 Availability projection

Customer Offers read a **projection** (Redis + periodic rebuild): `sellable_qty` by Offer/Location. Search must not sell expired lots. Event: `inventory.availability.changed`.

---

## 9. Module architecture

Each module: purpose, screens, dependencies, APIs, events, UX states, country hooks.

### 9.1 Stores (`M-PHARM-STORE`)

| | |
| --- | --- |
| **Purpose** | Organization + store Locations: identity, hours, service radius, license fields (schema from pack). |
| **Screens** | Store list, store profile, enable/disable fulfillment |
| **Dependencies** | `party`, `compliance` |
| **APIs** | `PharmacyOrg.Get`, `Location.List`, `Location.Update` |
| **Events** | out: `location.updated` |
| **Empty / loading / error** | No stores: owner onboarding CTA. License field unknown: do not invent — pack schema. |
| **Country hooks** | `pharmacy.license_fields[]`, `pharmacy.hours_format` |

### 9.2 Branches (`M-PHARM-BRANCH`)

| | |
| --- | --- |
| **Purpose** | Branch operations overlay: staff assignment, local assortment, catchment. |
| **Screens** | Branch dashboard, staff, catchment map |
| **Dependencies** | `iam`, `party`, `logistics` serviceability |
| **APIs** | `Branch.GetDashboard`, `Membership.ListAtLocation` |
| **Events** | in: `order.state.changed` |
| **Empty / loading / error** | Closed branch: reject new routing |
| **Country hooks** | `pharmacy.multi_branch.enabled` |

### 9.3 Warehouse (`M-PHARM-WH`)

| | |
| --- | --- |
| **Purpose** | Bulk Location: receive GRN, FEFO storage, transfer out. |
| **Screens** | Warehouse dashboard, bin optional v1 (flat location qty OK) |
| **Dependencies** | `inventory` |
| **APIs** | `Warehouse.Get`, `Stock.ListByLocation` |
| **Events** | `stock.received` |
| **Empty / loading / error** | Empty warehouse: receiving CTA |
| **Country hooks** | `pharmacy.warehouse_direct_ship` (OD-PHARM-01) |

**OPEN DECISION (OD-PHARM-07):** Bin/bin-location WMS in v1. Recommendation: **flat qty per batch per Location** in v1.

### 9.4 Inventory (`M-PHARM-INV`)

| | |
| --- | --- |
| **Purpose** | On-hand, reserved, inbound, sellable by CatalogItem and Location. |
| **Screens** | Stock list, adjust (reason), cycle count |
| **Dependencies** | `inventory`, `catalog` |
| **APIs** | `Stock.List`, `Stock.Adjust`, `Stock.GetItem` |
| **Events** | out: `inventory.availability.changed`, `stock.adjusted` |
| **Empty / loading / error** | Zero stock: still show item. Adjust without reason: reject |
| **Country hooks** | `inventory.negative_forbidden` (default true) |

### 9.5 Batch management (`M-PHARM-BATCH`)

| | |
| --- | --- |
| **Purpose** | Lots: lot number, expiry, supplier, GRN link, recall flag. |
| **Screens** | Batch list, recall, quarantine |
| **Dependencies** | `inventory` |
| **APIs** | `Batch.List`, `Batch.Quarantine`, `Batch.Recall` |
| **Events** | `batch.recalled` |
| **Empty / loading / error** | Missing lot on GRN: block receive |
| **Country hooks** | `inventory.lot_required` (medicines default true) |

### 9.6 Expiry (`M-PHARM-EXP`)

| | |
| --- | --- |
| **Purpose** | FEFO enforcement + near-expiry worklists + write-off. |
| **Screens** | Expiry calendar, write-off with reason |
| **Dependencies** | `inventory`, `ledger` (COGS/write-off event) |
| **APIs** | `Expiry.ListSoon`, `Stock.WriteOffExpired` |
| **Events** | `stock.written_off` |
| **Empty / loading / error** | None expiring: empty OK |
| **Country hooks** | `inventory.dispense_min_remaining_days`, `inventory.near_expiry_days` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Destruction vs return-to-supplier of expired medicines.

### 9.7 Stock transfer (`M-PHARM-XFER`)

| | |
| --- | --- |
| **Purpose** | Move batches between Locations in the same Organization/country. |
| **Screens** | Create, pick, ship, receive |
| **Dependencies** | `inventory` |
| **APIs** | `Transfer.Create`, `Transfer.Ship`, `Transfer.Receive` |
| **Events** | `transfer.shipped`, `transfer.received` |
| **Empty / loading / error** | In-transit loss: exception + adjust. Duplicate receive: idempotent |
| **Country hooks** | `transfer.require_approval` (OD-PHARM-06) |

### 9.8 Purchase (`M-PHARM-PO`)

| | |
| --- | --- |
| **Purpose** | Purchase orders to suppliers; GRN against batches. |
| **Screens** | PO list, create, send, receive |
| **Dependencies** | `inventory`, `party` (supplier org or supplier record) |
| **APIs** | `PO.Create`, `PO.Submit`, `PO.Receive` |
| **Events** | `po.submitted`, `po.received` |
| **Empty / loading / error** | Partial GRN allowed; over-receive: pack policy |
| **Country hooks** | `procurement.enabled` |

Money on PO: integer minor units.

### 9.9 Supplier (`M-PHARM-SUP`)

| | |
| --- | --- |
| **Purpose** | Supplier master (not a marketplace Vendor). |
| **Screens** | Supplier list, KYC-lite fields as pack |
| **Dependencies** | `party` |
| **APIs** | `Supplier.List`, `Supplier.Create`, `Supplier.Update` |
| **Events** | `supplier.updated` |
| **Empty / loading / error** | Soft delete; cannot delete with open POs |
| **Country hooks** | `supplier.required_fields[]` **LEGAL REVIEW** |

### 9.10 Pricing (`M-PHARM-PRICE`)

| | |
| --- | --- |
| **Purpose** | Create/update **Offers** for owned org (list price, tax class — not tax legal determination). |
| **Screens** | Price list, bulk update, location overrides |
| **Dependencies** | `catalog`, tax engine interface |
| **APIs** | `Offer.Upsert`, `Offer.Retire` |
| **Events** | `offer.updated` |
| **Empty / loading / error** | Float rejected. Currency must match country pack |
| **Country hooks** | `tax.classes[]`, `pricing.location_override` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine price controls, MRP-like displays, advertising.

### 9.11 Discounts (`M-PHARM-DISC`)

| | |
| --- | --- |
| **Purpose** | Store/org promotions that flow into Offer or checkout coupons (owned seller). |
| **Screens** | Discount campaigns, stack rules |
| **Dependencies** | `catalog`, `order` |
| **APIs** | `Discount.Create`, `Discount.List` |
| **Events** | `discount.published` |
| **Empty / loading / error** | Conflict with coupon stacking: server decides |
| **Country hooks** | `promotions.medicine_allowed` **LEGAL REVIEW** |

### 9.12 Orders (`M-PHARM-ORD`)

| | |
| --- | --- |
| **Purpose** | Location queue of Orders where `seller_org_id` = this org. |
| **Screens** | Filters by state, SLA, accept/cancel (policy), notes |
| **Dependencies** | `order`, `prescription`, `inventory` |
| **APIs** | `PharmOrder.List`, `PharmOrder.Get`, `PharmOrder.Accept`, `PharmOrder.Cancel` |
| **Events in** | `checkout.session.paid`, `order.state.changed` |
| **Events out** | `order.accepted`, `order.cancel.store` |
| **Empty / loading / error** | Empty queue OK. Stale: refresh. Never show other org’s orders |
| **Country hooks** | `order.accept_sla_seconds` |

Accept may be automatic on allocation success. **OPEN DECISION (OD-PHARM-08):** explicit Accept vs auto-accept on allocation. Default: **auto ACCEPTED** after allocation; manager still sees queue.

### 9.13 Prescription verification (`M-PHARM-RX`)

| | |
| --- | --- |
| **Purpose** | Pharmacist workbench: images, OCR suggestions, structured lines, substitutions, verify/reject. |
| **Screens** | Queue, dual-pane image + lines, reason codes |
| **Dependencies** | `prescription`, `health`, `catalog` |
| **APIs** | `RxCase.List`, `RxCase.Get`, `RxCase.ProposeLines`, `RxCase.Verify`, `RxCase.Reject`, `RxCase.NeedInfo` |
| **Events** | in: `prescription.submitted`; out: `prescription.verification.updated` |
| **Empty / loading / error** | Empty queue OK. Image fail: still reject UNREADABLE. Timeout: EXPIRED |
| **Country hooks** | `rx.verify.role`, `rx.central_desk` (OD-PHARM-05), controlled workflow **LEGAL REVIEW** |

**OPEN DECISION (OD-PHARM-09):** Substitution: pharmacist-only vs customer must accept in app (ties OD-CUS-14). Recommendation: **customer accept** for material strength/molecule change; same-SKU pack size OK pharmacist-only if pack allows.

### 9.14 Packing (`M-PHARM-PACK`)

| | |
| --- | --- |
| **Purpose** | Pick list, batch scan, tote, packing photo, cold-chain flag. |
| **Screens** | Pack station, exceptions |
| **Dependencies** | `order`, `inventory` |
| **APIs** | `Fulfillment.StartPack`, `Fulfillment.Scan`, `Fulfillment.CompletePack` |
| **Events** | `fulfillment.packing.started`, `fulfillment.packed` |
| **Empty / loading / error** | Wrong batch: F-PACK. Short pick: cannot complete; route to OOS |
| **Country hooks** | `packing.photo_required`, `packing.cold_chain` |

### 9.15 Dispatch (`M-PHARM-DISP`)

| | |
| --- | --- |
| **Purpose** | Create/handover **LogisticsJob** `MEDICINE_DELIVERY`; print label/AWB if any. |
| **Screens** | Dispatch bench, handover to rider/3PL |
| **Dependencies** | [Logistics](11_LOGISTICS_PLATFORM.md) |
| **APIs** | `Dispatch.CreateJob`, `Dispatch.Handover` |
| **Events** | out: `logistics.job.requested`; in: `logistics.job.updated` |
| **Empty / loading / error** | Job create fail: stay PACKING/ready; retry. Do not mark DISPATCHED without job id |
| **Country hooks** | `logistics.medicine_job_type=MEDICINE_DELIVERY`, `dispatch.otp_at_store` |

### 9.16 Returns (`M-PHARM-RET`)

| | |
| --- | --- |
| **Purpose** | Return requests, reverse logistics, QC, restock or destroy. |
| **Screens** | Return queue, QC checklist |
| **Dependencies** | `order`, `inventory`, `logistics` |
| **APIs** | `Return.List`, `Return.Qc`, `Return.Restock` |
| **Events** | `return.received`, `stock.returned` |
| **Empty / loading / error** | Unrestorable (opened medicine): destroy path **LEGAL REVIEW** |
| **Country hooks** | `return.medicine_allowed`, `return.window_hours` |

### 9.17 Refunds (`M-PHARM-REF`)

| | |
| --- | --- |
| **Purpose** | Store-initiated refund **request** (Rx reject, OOS, packing abort). Execution is payment/ledger. |
| **Screens** | Request refund, reason, amount_minor (≤ captured) |
| **Dependencies** | `payment`, `ledger` |
| **APIs** | `PharmRefund.Request` |
| **Events** | `refund.requested` |
| **Empty / loading / error** | Duplicate request: idempotent. Staff cannot “cash refund” except COD policy |
| **Country hooks** | `refund.store_can_request`, thresholds dual-control |

### 9.18 Billing (`M-PHARM-BILL`)

| | |
| --- | --- |
| **Purpose** | Map Order to billable document for the owned pharmacy (merchant-of-record **OPEN** in business doc). |
| **Screens** | Bill preview, tax breakdown (display) |
| **Dependencies** | `order`, tax interface |
| **APIs** | `Billing.GetForOrder` |
| **Events** | `invoice.issued` |
| **Empty / loading / error** | Tax engine fail: block dispatch if pack `invoice.required_before_dispatch` |
| **Country hooks** | `billing.merchant_of_record` **LEGAL REVIEW** |

### 9.19 Invoices (`M-PHARM-INVCE`)

| | |
| --- | --- |
| **Purpose** | Issue/void/credit notes. Schema **configurable per country**. |
| **Screens** | Invoice list, PDF, credit note |
| **Dependencies** | tax adapter, [Ledger](13_LEDGER_SETTLEMENT.md) |
| **APIs** | `Invoice.Issue`, `Invoice.Get`, `Invoice.CreditNote` |
| **Events** | `invoice.issued`, `invoice.credited` |
| **Empty / loading / error** | Not issued: customer download hidden. Void after report: credit note only |
| **Country hooks** | `invoice.fields[]`, `invoice.e_invoicing_adapter`, numbering |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Tax invoices, e-invoicing, pharmacy billing, who is seller of record. **Do not invent GST/VAT rules.**

**OPEN DECISION (OD-PHARM-10):** Invoice at PAID vs at DISPATCH vs at DELIVER. Recommendation: pack-configurable; default **at ACCEPTED** for prepaid.

### 9.20 Reports (`M-PHARM-RPT`)

| | |
| --- | --- |
| **Purpose** | Operational reports: sales, FEFO, Rx TAT, fill rate — not customer lab reports. |
| **Screens** | Date range, export |
| **Dependencies** | analytics projections |
| **APIs** | `PharmReports.Sales`, `PharmReports.Expiry`, `PharmReports.RxTat` |
| **Events** | — (read) |
| **Empty / loading / error** | Empty range OK. Clinical Rx images not in exports |
| **Country hooks** | `analytics.retention_days` |

---

## 10. Logistics integration — `MEDICINE_DELIVERY`

```
PACKING complete
  → logistics.create_job
       type: MEDICINE_DELIVERY
       ref: order_id, fulfillment_id, location_id
       payload: address, OTP policy, cold_chain, customer contact policy
  → on job created: Order DISPATCHED
  → on rider start: OUT_FOR_DELIVERY
  → on POD: DELIVERED
  → on fail: reassignment or return-to-store (order may stay DISPATCHED)
```

Pharmacy app **does not** assign riders unless fleet is in-house and membership includes dispatcher (usually [Logistics](11_LOGISTICS_PLATFORM.md) / ops). Store handover: scan rider/job.

Customer tracking: [Customer](05_CUSTOMER_PLATFORM.md) §6.18.

COD: rider collects; pharmacy does not mark paid. Ledger: COD receivable until `pod.cod_collected`.

---

## 11. Failure cases (pharmacy)

| ID | Failure | Order/stock | Customer | Staff |
| --- | --- | --- | --- | --- |
| F-OOS-PAY | OOS after pay (allocation fail or short pick) | Release; CANCELLED or line cancel; `PharmRefund.Request` | OD-CUS-14 refund/substitute | Exception queue |
| F-RX | Rx reject / expire | RX_REVIEW → CANCELLED; release hold | Reason + J16 | Reason code mandatory |
| F-PACK | Wrong batch / qty / damaged in pack | Cannot DISPATCH; recapture FEFO or OOS | Delay copy | Forced rescan; manager override audited |
| F-DISP | Job create / handover fail | Remain packed; not DISPATCHED | “Preparing” | Retry; 3PL outage runbook |
| F-FEFO | Only expired lots left | Treat as OOS | Refund path | Expiry write-off worklist |
| F-HOLD | Hold TTL vs slow Rx | Hold extend once or cancel | Re-confirm | Pack flag `rx.hold_extension_seconds` |
| F-COD | Customer unpaid at door | Logistics fail codes | Reattempt | No silent DELIVERED |

**RISK:** Dispensing without VERIFIED Rx. Mitigation: state machine + permission `prescription:verify`.

**RISK:** Packer sees Rx images. Default deny.

---

## 12. Events (produced / consumed)

| Event | Direction |
| --- | --- |
| `checkout.session.paid` | in → create/confirm Order PAID |
| `prescription.submitted` | in → queue |
| `prescription.verification.updated` | out |
| `order.state.changed` | out (all transitions) |
| `inventory.availability.changed` | out |
| `logistics.job.requested` | out |
| `logistics.job.updated` | in |
| `refund.requested` | out |
| `invoice.issued` | out |

Outbox in the modular monolith; no pharmacy microservice.

---

## 13. Country Policy Pack hooks

| Hook | Use |
| --- | --- |
| `pharmacy.license_fields[]` | Store profile |
| `rx.*` | Verification, validity, controlled |
| `inventory.dispense_min_remaining_days` | FEFO |
| `order.accept_sla_seconds` | Queue SLA |
| `invoice.*`, `tax.*` | Billing **LEGAL REVIEW** |
| `return.medicine_allowed` | Returns |
| `logistics.medicine_job_type` | Must be `MEDICINE_DELIVERY` |

Launch pack may leave legal keys empty; features that require them stay disabled.

---

## 14. Implementation notes

- Nest modules: `party`, `catalog`, `inventory`, `order`, `prescription`, `logistics` (client), `payment` (refund request only).
- Postgres: orders, batches, movements; Redis: availability + queue; OpenSearch: not required for staff queue (PG + indexes).
- UUID v7; money integer; `deleted_at` on masters except movements/ledger.
- Idempotency on Accept, Pack complete, Dispatch, GRN.

---

## 15. Open decisions

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-PHARM-01 | Warehouse ships to customer? | No in v1; store last mile |
| OD-PHARM-02 | Multi-location split ship within owned org? | No in v1 (A-PHARM-05) |
| OD-PHARM-03 | `REFUNDED` as status vs orthogonal flag | Status + `refund_ids[]` |
| OD-PHARM-04 | Skip Rx desk for platform-signed digital Rx? | Default still verify |
| OD-PHARM-05 | Central country Rx desk vs location pharmacist | Location first; central optional flag |
| OD-PHARM-06 | Transfer auto-approve threshold | All transfers approved |
| OD-PHARM-07 | Bin-level WMS v1 | Flat batch qty |
| OD-PHARM-08 | Explicit Accept vs auto ACCEPTED | Auto after allocate |
| OD-PHARM-09 | Substitution needs customer accept? | Yes if molecule/strength change |
| OD-PHARM-10 | Invoice timing | Pack; default at ACCEPTED |

---

## 16. Assumptions and legal index

| ID | Statement |
| --- | --- |
| A-PHARM-01 | Owned + marketplace can coexist |
| A-PHARM-02 | One seller per Order |
| A-PHARM-03 | Staff do not acquire payments |
| A-PHARM-04 | RN + Web |
| A-PHARM-05 | No split shipment v1 |
| A-PHARM-06 | Hard allocate at ACCEPTED |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Licensing, Rx, controlled drugs, substitution, expiry destruction, tax invoices, price controls, ads.
