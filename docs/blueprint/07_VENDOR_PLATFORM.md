# 07 — Vendor Platform (Marketplace)

**Status:** Blueprint  
**Audience:** Marketplace product, vendor-app engineering, finance, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Apps](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger & Settlement](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [Admin ERP](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [CRM](15_CRM_PLATFORM.md)

**Requirement IDs:** REQ-VEND, REQ-ORD, REQ-PAY, REQ-LED, REQ-LOG

**Onboarding** (register, KYC, approval) is the shared engine in [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) with `PartnerType=VENDOR`. This book owns **post-ACTIVE** selling.

This document is **third-party marketplace sellers**: `organization_type = VENDOR`. Owned stores are [Pharmacy Platform](06_PHARMACY_PLATFORM.md). Vendors fulfill **Order** objects when the selling Organization is the vendor. They **must not** see other vendors’ orders, stock, pricing internals, or settlements.

---

## 1. Purpose and scope

The Vendor Platform lets a seller **register, pass KYC, list CatalogItems as Offers, hold inventory, price, promote, accept/fulfill Orders, handle returns, and view commission/settlement**. Customers discover vendors via [Customer](05_CUSTOMER_PLATFORM.md). Money movement is [Payment](12_PAYMENT_PLATFORM.md) + [Ledger](13_LEDGER_SETTLEMENT.md). Physical delivery is [Logistics](11_LOGISTICS_PLATFORM.md) job type **MEDICINE_DELIVERY** (or a pack-defined goods job if non-medicine — still one logistics engine).

**ASSUMPTION (A-VEND-01 / A-BIZ-01):** v1 **no multi-vendor split** in one goods Order. If the customer’s cart already has seller A, adding seller B’s Offer returns `CART_SELLER_CONFLICT`.

**ASSUMPTION (A-VEND-02):** Merchant-of-record vs vendor-as-seller is an **OPEN** commercial/legal question (business architecture). Engineering: Order always has `seller_org_id`; invoice/tax adapters switch on Country Policy Pack. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

**ASSUMPTION (A-VEND-03):** Vendors do not receive raw card data. Payouts are settlement batches, not checkout captures.

---

## 2. Apps

| ID | Client | Jobs |
| --- | --- | --- |
| APP-VEND (RN) | React Native | Order alerts, accept/reject, pack, dispatch, stock quick-adjust |
| APP-VEND (Web) | Next.js partner portal | KYC, listings, bulk inventory, offers, analytics, settlement statements |

JWT `aud` = vendor/partner family; membership `vendor` or `vendor_staff`. **Organization isolation is mandatory** on every query (`org_id` from membership, never from client body alone).

**ASSUMPTION (A-VEND-04):** One RN flavor + web for dense work. Separate store listing from customer app.

---

## 3. Roles and isolation

| Role | Scope | Purpose |
| --- | --- | --- |
| `vendor` | organization | Owner/admin: KYC, payout profile, staff, listings, orders, returns |
| `vendor_staff` | location or organization | Granted subset: listings, inventory, packing |

**Isolation rules:**

1. Vendor A cannot `catalog:read` unpublished drafts of vendor B, nor B’s cost, stock, or `settlement:read`.
2. Public storefront is a **published projection** only (name, logo, Offers).
3. Country admin / ops may see across vendors for KYC and incidents — not via vendor APIs.
4. A Person who is also a customer uses the **customer** app for shopping (OD-RBAC-04 concurrent doctor+vendor is separate).

Permissions (typical): `catalog:write` own, `inventory:adjust` own, `order:read` own, pack/dispatch own. No `prescription:verify` unless the vendor is a licensed pharmacy **and** pack grants it — **LEGAL REVIEW**. **OPEN DECISION (OD-VEND-01):** Can a marketplace vendor verify Rx, or must Rx Orders route only to `PHARMACY_OWNED`? Recommendation: pack flag `marketplace.rx_fulfillment`; default **owned pharmacy only** until legal says otherwise.

---

## 4. Core objects

| Object | Vendor use |
| --- | --- |
| **Person** | Vendor admin/staff |
| **Organization** | Vendor company |
| **Location** | Warehouse/store the vendor ships from |
| **CatalogItem** | Global/country item; vendor **proposes** or links |
| **Offer** | Vendor’s sellable price + availability + location + country |
| **Cart / Order** | Customer goods; `seller_org_id` = this vendor |
| **CheckoutSession** | Customer payment envelope; vendor never owns it |
| **LogisticsJob** | `MEDICINE_DELIVERY` (or goods delivery) after dispatch |
| **KYC case** | [Compliance](19_COMPLIANCE_FRAMEWORK.md) |

IDs: UUID v7. Money: integer minor units + ISO currency (country pack). Soft delete `deleted_at` on listings, locations, staff; **not** on settlement/ledger lines.

---

## 5. Vendor lifecycle

```
REGISTERED → KYC_PENDING → KYC_IN_REVIEW → APPROVED
                              ↘ KYC_REJECTED (resubmit)
APPROVED → SUSPENDED ⇄ APPROVED
         → CLOSED
```

| State | Can list? | Can receive Orders? |
| --- | --- | --- |
| `REGISTERED` | No | No |
| `KYC_PENDING` / `IN_REVIEW` | Draft only | No |
| `KYC_REJECTED` | No | No |
| `APPROVED` | Submit for product approval | Yes, if Offer published |
| `SUSPENDED` | Frozen | No new; finish or cancel open per policy |
| `CLOSED` | No | No |

SoD: submitter ≠ KYC approver ([Roles](03_USER_ROLES_AND_PERMISSIONS.md)).

---

## 6. Order machine (vendor seller)

Reuse owned-pharmacy names so customer UX is one timeline ([Pharmacy](06_PHARMACY_PLATFORM.md) §6):

`DRAFT → PENDING_PAYMENT → PAID → RX_REVIEW? → ACCEPTED → PACKING → DISPATCHED → OUT_FOR_DELIVERY → DELIVERED`  
plus `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, `REFUNDED`.

**Vendor-specific guards:**

| Topic | Rule |
| --- | --- |
| Accept SLA | After `PAID` (and Rx if any), vendor must reach `ACCEPTED` before `vendor.accept_sla_seconds`. Else **auto-cancel** → refund (J03). |
| Reject | Vendor may reject with reason **before** ACCEPTED; triggers cancel + refund |
| RX_REVIEW | Only if OD-VEND-01 allows; else Rx goods never assign to vendor |
| Split | Forbidden across vendors; also **ASSUMPTION (A-VEND-05):** v1 no split across vendor Locations either |

```
PAID ──(timer)──► CANCELLED  [SLA timeout, event vendor.accept.timeout]
PAID ──reject──► CANCELLED
```

---

## 7. Commission and settlement

### 7.1 Commission (configurable)

Commission is **not hardcoded**. A Country Policy Pack (and optional category overlay) defines:

| Dimension | Example keys |
| --- | --- |
| Country | `marketplace.commission.default_bps` |
| Catalog category | `marketplace.commission.by_category[category_id]` |
| Vendor contract | Optional override table `vendor_commission_override` (bps or flat_minor) |
| Order | Snapshot **at CheckoutSession quote**; later rule changes do not mutate PAID orders |

`bps` = integer basis points (150 = 1.50%). **Never float.** Flat fees: `flat_minor` + currency.

```
vendor_payable_minor = item_total_minor + funded_fees_minor
                      - commission_minor - platform_fees_minor - tax_withheld_minor
                      - refunds_minor ± adjustments_minor
```

Who funds delivery: **OPEN DECISION (OD-VEND-02)** pack: customer fee vs vendor-funded vs split.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Marketplace facilitator vs operator, medicine commission, inducement.

### 7.2 Settlement depends on ledger

This platform **does not** pay vendors from the vendor app. It emits commercial facts:

- `order.delivered` / return window elapsed
- refunds, chargebacks
- commission snapshot

[Ledger & Settlement](13_LEDGER_SETTLEMENT.md) owns: journal, vendor payable account, **settlement batch**, payout adapter, hold for KYC/chargeback.

Vendor UI: **statements** (read models). Buttons “request payout” only if pack allows; finance still executes.

**ASSUMPTION (A-VEND-06):** Settlement eligibility = `DELIVERED` + `return.window_hours` elapsed − open disputes, unless pack `settle_on_dispatch` (not recommended).

Chargebacks: hold/clawback via ledger; vendor sees `HOLD` lines, not customer PAN.

---

## 8. Module architecture

### 8.1 Vendor registration (`M-VEND-REG`)

| | |
| --- | --- |
| **Purpose** | Create Organization `VENDOR` + first Person membership `vendor`. |
| **Screens** | Country, legal name, contact, tax ids **as pack fields**, accept marketplace T&C |
| **Dependencies** | `party`, `identity`, `compliance` |
| **APIs** | `VendorReg.Start`, `VendorReg.Complete` |
| **Events** | out: `vendor.registered` |
| **Empty / loading / error** | Duplicate tax id: manual review, no silent merge |
| **Country hooks** | `vendor.registration.fields[]`, `vendor.allowed` (marketplace on/off) |

Professionals use email+password + MFA ([Roles](03_USER_ROLES_AND_PERMISSIONS.md)). No social login.

### 8.2 KYC (`M-VEND-KYC`)

| | |
| --- | --- |
| **Purpose** | Collect documents/UBO/payout account for a KYC case. |
| **Screens** | Upload, status, resubmit |
| **Dependencies** | `compliance`, object storage, optional KYC vendor adapter |
| **APIs** | `VendorKyc.Get`, `VendorKyc.Submit`, `VendorKyc.Attach` |
| **Events** | out: `kyc.submitted`; in: `kyc.updated` |
| **Empty / loading / error** | File type/size; virus reject. Timeout: stay pending |
| **Country hooks** | `kyc.vendor.documents[]`, `kyc.payout_account_types[]` **LEGAL REVIEW** |

Vendor cannot self-approve.

### 8.3 Verification (`M-VEND-VER`)

| | |
| --- | --- |
| **Purpose** | Track automated checks (list match, duplicate orgs) before human review. |
| **Screens** | Checklist progress (non-secret) |
| **Dependencies** | `compliance` |
| **APIs** | `VendorVerification.Get` |
| **Events** | `vendor.verification.updated` |
| **Empty / loading / error** | Adapter down: hold IN_REVIEW |
| **Country hooks** | `kyc.vendor.auto_checks[]` |

### 8.4 Approval (`M-VEND-APPR`)

| | |
| --- | --- |
| **Purpose** | Country admin approval to `APPROVED`. Vendor sees outcome only. |
| **Screens** | “Under review” / approved / rejected reasons |
| **Dependencies** | `compliance`, admin |
| **APIs** | `VendorStatus.Get` (vendor); approve APIs are **admin** |
| **Events** | in: `vendor.approved`, `vendor.rejected`, `vendor.suspended` |
| **Empty / loading / error** | Reject: reason codes, resubmit path |
| **Country hooks** | `kyc.approve.dual_control` (OD-RBAC-01 analog for vendors) |

### 8.5 Store profile (`M-VEND-PROF`)

| | |
| --- | --- |
| **Purpose** | Public + private profile: display name, logo, locations, hours, support contact. |
| **Screens** | Profile editor, preview of customer storefront |
| **Dependencies** | `party`, `cms` |
| **APIs** | `VendorProfile.Get`, `VendorProfile.Update` |
| **Events** | `vendor.profile.updated` |
| **Empty / loading / error** | Unpublished until APPROVED. Invalid hours: inline |
| **Country hooks** | `vendor.storefront.fields[]`, license display **LEGAL REVIEW** |

### 8.6 Product listing (`M-VEND-LIST`)

| | |
| --- | --- |
| **Purpose** | Link to existing CatalogItem or propose a new item (draft). |
| **Screens** | Search master, create proposal, attributes, images |
| **Dependencies** | `catalog` |
| **APIs** | `Listing.SearchMaster`, `Listing.Create`, `Listing.Update`, `Listing.Archive` |
| **Events** | `listing.draft.saved` |
| **Empty / loading / error** | Duplicate GTIN/SKU: suggest existing item. Unmapped Rx: block if marketplace Rx off |
| **Country hooks** | `marketplace.vendor_create_item`, `catalog.rx_vendor_allowed` |

Soft delete listings; historical Order lines keep snapshots.

### 8.7 Product approval (`M-VEND-PAPPR`)

| | |
| --- | --- |
| **Purpose** | Country catalog publish queue for vendor-proposed items and Offers that need review. |
| **Screens** | Vendor: status. Admin: approve (not this app) |
| **Dependencies** | `catalog`, `compliance` |
| **APIs** | `Listing.SubmitForApproval`, `Listing.GetApprovalStatus` |
| **Events** | out: `catalog.publish.requested`; in: `catalog.item.published`, `listing.rejected` |
| **Empty / loading / error** | Rejected: comments; cannot sell |
| **Country hooks** | `catalog.publish.vendor_otc_auto` |

**OPEN DECISION (OD-VEND-03):** Auto-publish OTC vs always queue. Recommendation: **always queue** for first N listings per vendor, then pack may auto-OTC.

`catalog:publish` is country_admin, not vendor.

### 8.8 Inventory (`M-VEND-INV`)

| | |
| --- | --- |
| **Purpose** | Vendor stock at vendor Locations. Batch/expiry **required** for medicines if pack `inventory.lot_required`. |
| **Screens** | Qty, batch, FEFO list, adjust |
| **Dependencies** | `inventory` |
| **APIs** | `VendorStock.List`, `VendorStock.Adjust`, `VendorStock.UpsertBatch` |
| **Events** | `inventory.availability.changed` |
| **Empty / loading / error** | Negative forbidden. Expired lots not sellable |
| **Country hooks** | `inventory.lot_required`, `inventory.dispense_min_remaining_days` |

FEFO allocation at vendor ACCEPTED, same spirit as owned pharmacy. Platform may **not** see only a “qty” for Rx medicines if pack requires lots.

**OPEN DECISION (OD-VEND-04):** Non-medicine SKUs: simple qty without lots. Recommendation: yes if pack `inventory.lot_required=false` for that category.

### 8.9 Pricing (`M-VEND-PRICE`)

| | |
| --- | --- |
| **Purpose** | Vendor Offer price in country currency, tax class, min qty. |
| **Screens** | Price editor, bulk CSV (web) |
| **Dependencies** | `catalog` |
| **APIs** | `VendorOffer.Upsert` |
| **Events** | `offer.updated` |
| **Empty / loading / error** | Price 0 / float rejected. Below map price if pack `pricing.floor_enforced` |
| **Country hooks** | `pricing.vendor_floor`, price-control **LEGAL REVIEW** |

Commission is **not** shown as a customer price component unless pack requires.

### 8.10 Offers (`M-VEND-OFFER`)

| | |
| --- | --- |
| **Purpose** | Time-bound promotions on vendor Offers (not platform CMS home rails). |
| **Screens** | Promo % or amount_minor, window, inventory cap |
| **Dependencies** | `catalog`, `order` |
| **APIs** | `VendorPromo.Create`, `VendorPromo.End` |
| **Events** | `discount.published` |
| **Empty / loading / error** | Overlap: server stacking rules |
| **Country hooks** | `promotions.vendor_allowed`, medicine ads **LEGAL REVIEW** |

### 8.11 Orders (`M-VEND-ORD`)

| | |
| --- | --- |
| **Purpose** | Vendor queue: only `seller_org_id = me`. |
| **Screens** | SLA countdown, accept, reject, print pick list |
| **Dependencies** | `order`, `inventory` |
| **APIs** | `VendorOrder.List`, `VendorOrder.Get`, `VendorOrder.Accept`, `VendorOrder.Reject` |
| **Events in** | `checkout.session.paid` (filtered) |
| **Events out** | `order.accepted`, `order.rejected.vendor` |
| **Empty / loading / error** | Empty OK. Poll + push. Missing stock at accept: reject or F-OOS |
| **Country hooks** | `vendor.accept_sla_seconds` |

Customer PII: shipping fields only. No other customers. No Rx image unless OD-VEND-01.

### 8.12 Returns (`M-VEND-RET`)

| | |
| --- | --- |
| **Purpose** | Respond to RETURN_REQUESTED: approve, deny (policy), receive QC. |
| **Screens** | Return queue, QC, restock |
| **Dependencies** | `order`, `inventory`, `logistics` |
| **APIs** | `VendorReturn.List`, `VendorReturn.Decide`, `VendorReturn.Receive` |
| **Events** | `return.received` |
| **Empty / loading / error** | Window closed: read-only. Dispute: ops ticket |
| **Country hooks** | `return.window_hours`, `return.vendor_must_accept` |

Settlement hold until return window: §7.2.

### 8.13 Commission (`M-VEND-COMM`)

| | |
| --- | --- |
| **Purpose** | Explain projected vs finalized commission per Order (read-only). |
| **Screens** | Per-order breakdown, category rule label (not other vendors’) |
| **Dependencies** | snapshot on Order; [Ledger](13_LEDGER_SETTLEMENT.md) |
| **APIs** | `VendorCommission.GetForOrder`, `VendorCommission.ListRules` (own/country published rules only) |
| **Events** | in: `order.state.changed` |
| **Empty / loading / error** | Before PAID: no row. Never show platform margin of owned pharmacy |
| **Country hooks** | `marketplace.commission.*` |

### 8.14 Settlement (`M-VEND-SETL`)

| | |
| --- | --- |
| **Purpose** | Statements, payout status, holds. **No** execute payout. |
| **Screens** | Period statement, download, payout account (encrypted via payment adapter) |
| **Dependencies** | [13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md) |
| **APIs** | `VendorSettlement.ListBatches`, `VendorSettlement.GetStatement`, `VendorPayoutProfile.Upsert` |
| **Events** | in: `settlement.batch.updated`, `payout.updated` |
| **Empty / loading / error** | No batch yet: explain cycle. KYC missing: cannot payout |
| **Country hooks** | `settlement.cycle`, `settlement.minimum_payout_minor` |

### 8.15 Analytics (`M-VEND-ANL`)

| | |
| --- | --- |
| **Purpose** | Vendor-scoped GMV, fill rate, SLA breaches, return rate. No clinical payloads. No competitor data. |
| **Screens** | Dashboard, date range |
| **Dependencies** | analytics projections |
| **APIs** | `VendorAnalytics.Summary`, `VendorAnalytics.TopItems` |
| **Events** | — |
| **Empty / loading / error** | New vendor: empty charts |
| **Country hooks** | `analytics.vendor_retention_days` |

### 8.16 Vendor support (`M-VEND-SUP`)

| | |
| --- | --- |
| **Purpose** | Tickets for KYC, orders, payouts. Not customer-facing chat impersonation. |
| **Screens** | Create ticket linked to order_id, list |
| **Dependencies** | [CRM](15_CRM_PLATFORM.md) |
| **APIs** | `VendorTicket.Create`, `VendorTicket.List`, `VendorTicket.Reply` |
| **Events** | `ticket.created` |
| **Empty / loading / error** | Empty: FAQ. Cannot open ticket on another vendor’s order |
| **Country hooks** | `support.vendor.channels[]` |

---

## 9. SLA timeout auto-cancel

```
on order.PAID (vendor seller):
  schedule job AcceptSlaTimer(order_id) at now + pack.vendor.accept_sla_seconds

on ACCEPTED or CANCELLED: cancel timer

on timer fire:
  if still PAID or RX_REVIEW (waiting vendor):
    transition CANCELLED reason=VENDOR_SLA_TIMEOUT
    release stock holds
    Refund.Request (full, minus policy)
    notify customer + vendor
```

**OPEN DECISION (OD-VEND-05):** Default SLA seconds. Recommendation: pack; engineering default **15 minutes** for demo packs only, not as a legal promise.

**OPEN DECISION (OD-VEND-06):** Second-chance SLA after NEEDS_INFO Rx. Recommendation: timer pauses in `NEEDS_INFO` if vendor is the verifier (usually not).

Customer copy: J03 “seller did not accept”.

---

## 10. Logistics

Same pattern as pharmacy dispatch:

- Vendor completes PACKING → `Logistics.CreateJob` with type **MEDICINE_DELIVERY** (or pack `logistics.vendor_goods_job_type`).
- Vendor may be **self-delivery** if pack `vendor.self_logistics` — **OPEN DECISION (OD-VEND-07)**. Recommendation: v1 **platform logistics only**.
- Order not DISPATCHED without `job_id`.
- Vendor tracking view: job status without rider home address.

---

## 11. Failure cases

| ID | Failure | Result |
| --- | --- | --- |
| F-SLA | Accept timeout | Auto CANCELLED + refund |
| F-REJ | Vendor reject | CANCELLED + refund; reason required |
| F-OOS | OOS at accept/pack | Reject or cancel; refund; availability event |
| F-KYC | Payout KYC fail | Fulfillment may continue; payout held |
| F-DISP | Dispatch/job fail | Stay packed; retry; SLA on dispatch **OD-VEND-08** |
| F-RET | Return QC fail | Dispute ticket; settlement hold |
| F-CHB | Chargeback | Ledger hold; ops; vendor notified |

**RISK:** Vendor enumerating other vendors via search of internal APIs. Mitigation: org filter in service layer + tests.

**RISK:** Vendor listing controlled medicines without license. Mitigation: category gates + publish queue + OD-VEND-01.

---

## 12. Events

| Event | Dir |
| --- | --- |
| `vendor.registered` / `vendor.approved` / `vendor.suspended` | out / in |
| `kyc.submitted` / `kyc.updated` | both |
| `listing.draft.saved` / `catalog.publish.requested` | out |
| `offer.updated` | out |
| `checkout.session.paid` | in |
| `order.accepted` / `order.rejected.vendor` / `vendor.accept.timeout` | out |
| `inventory.availability.changed` | out |
| `logistics.job.requested` | out |
| `refund.requested` | out (system) |
| `settlement.batch.updated` | in |

---

## 13. Country Policy Pack hooks

| Hook | Module |
| --- | --- |
| `marketplace.enabled` | All |
| `vendor.registration.fields[]` | Registration |
| `kyc.vendor.*` | KYC |
| `marketplace.rx_fulfillment` | Orders / Rx |
| `marketplace.commission.default_bps` / `by_category` | Commission |
| `vendor.accept_sla_seconds` | SLA |
| `vendor.self_logistics` | Dispatch |
| `settlement.cycle` | Settlement |
| `catalog.publish.vendor_otc_auto` | Product approval |

Do not assume a single tax or KYC statute. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

## 14. Implementation notes

- Nest modules: `party`, `compliance`, `catalog`, `inventory`, `order`, `logistics` client, settlement **read** API.
- Every vendor query: `WHERE org_id = membership.org_id`.
- Idempotency: Accept, Reject, Dispatch, KYC submit.
- Redis: SLA timers (BullMQ). Postgres: source of truth.
- Customer CheckoutSession and PaymentIntent are not writable by vendor.

---

## 15. Open decisions

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-VEND-01 | Vendor Rx fulfillment / verify? | Default owned pharmacy only |
| OD-VEND-02 | Who funds delivery fee? | Pack; default customer delivery fee |
| OD-VEND-03 | Auto-publish OTC listings? | Queue first N, then optional auto |
| OD-VEND-04 | Lot-less inventory for non-Rx? | Yes per category pack |
| OD-VEND-05 | Default accept SLA | Pack; 15m only for empty technical packs |
| OD-VEND-06 | SLA pause on Rx NEEDS_INFO | Pause if vendor waits on customer |
| OD-VEND-07 | Vendor self-delivery v1 | No; platform logistics |
| OD-VEND-08 | Dispatch SLA auto-cancel | Pack; default cancel + refund if not dispatched in N hours |

---

## 16. Assumptions and legal index

| ID | Statement |
| --- | --- |
| A-VEND-01 | No multi-vendor Order (A-BIZ-01) |
| A-VEND-02 | Seller-of-record is pack/legal, not hardcoded |
| A-VEND-03 | No card acquiring in vendor app |
| A-VEND-04 | RN + Web |
| A-VEND-05 | No split ship across vendor locations v1 |
| A-VEND-06 | Settle after deliver + return window |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Marketplace licensing, medicine sales by third parties, commission, ads, KYC/AML, tax invoices, payouts, Rx.

See also merchant-of-record **OPEN DECISION** in [Business Architecture](02_BUSINESS_ARCHITECTURE.md) §5.2.
