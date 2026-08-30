# 126 — R6 Vendor / Marketplace implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R6-AUTH-126**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_PLAN_READY**

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) · [122](122_PRE_R6_GLOBAL_READINESS_AUDIT.md) · [124](124_PRE_R6_FINAL_VERIFICATION.md) · [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) · [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) · [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md)

**Prerequisite:** Pre-R6 engineering = **PRE_R6_DETERMINISTIC** ([125](125_PRE_R6_TEST_DETERMINISM_FIX.md)). Does **not** by itself authorize R6 coding.

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, or UI under this CR. **Do not** enable live PSP/DHL/carriers/payouts, production telemedicine, or automatic refill. **Do not** invent marketplace/tax/pharmacy law. **Do not** create vendor mobile, generic Partner App, or a second identity/payment/notification kernel.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R6 Vendor / Marketplace operations** wave so seller ops on `apps/web-vendor` can be implemented later **without restructuring** identity, catalog, inventory, order, payment, logistics, finance, RLS, or R5 Rx kernels.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI | Plan only |
| R6 IMPL authorization | Requires future **CR-R6-IMPL-*** |
| Vendor mobile / generic Partner App | Topology lock |
| Second catalog / pricing / payment / notification / support kernel | Kernel lock |
| Live money / carriers / payouts | R14 + separate CRs |
| Lab / Radiology / CMS / CRM / Care-nav | R7+ / R10–R12 |
| Invented MoR / tax / refund law | Legal ODs |

### Acceptance of this plan

Humans can authorize a coding CR that implements R6 sub-phases in §27 without redesigning R0–R5 kernels.

---

## 1. R6 current-state audit (repo truth)

### 1.1 Classification

| Surface | Status | Notes |
|---------|--------|-------|
| `apps/web-vendor` | **FOUNDATION** | Single-route tab shell; read-heavy |
| Vendor API modules | **FUNCTIONAL** (sandbox) | Catalog write + inventory ops + order fulfillment + settlements list exist |
| Customer marketplace UX | **FOUNDATION** | Seller shown as UUID; no storefront branding |
| Admin vendor oversight | **FOUNDATION** | Partner review + finance admin; not full marketplace moderation |

**Do not treat the shell as R6-complete** ([121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) §3.5, §20).

### 1.2 What exists today

**Web (`apps/web-vendor`):**

| Area | Actual |
|------|--------|
| Auth | OTP audience `customer`; session expired / 403 / network states |
| Org picker | `GET /api/v1/vendor/organizations` (any active membership — **not** VENDOR-kind filtered) |
| Dashboard | Parallel count GETs |
| Catalog / inventory / orders / shipments / settlements tabs | **Read-only list** panels |
| Support | Placeholder EmptyState |
| Profile / KYC / locations / pricing / commercial rules / order detail / pick-pack UI | **Missing** |
| Response shape | Catalog UI expects snake_case; API may return camelCase — **R6 UX debt** |

**API (prefix `/api/v1`, JwtAuthGuard + AudienceGuard `customer`|`partner_applicant`):**

| Module | Capabilities already present |
|--------|------------------------------|
| Profile | List orgs |
| Catalog | List offers; create item/variant/offer; publish; prices |
| Inventory | Locations CRUD path; lots; movements; GRN receive/post; adjustments; transfers |
| Orders | List/detail; pick/pack/ready transitions |
| Shipments | List/detail (sandbox carrier) |
| Settlements | List by `seller_org_id` (own only) |

**Scope helpers:** `assertCanManageSeller` / `assertInventoryOwner` / `assertSellerMember` — membership-based. **Isolation e2e** exists (`app-isolation.e2e`: vendor A ↛ vendor B offers/settlements).

**Schema already sufficient for core marketplace:** `OrganizationKind.VENDOR`, `CatalogOffer.sellerOrgId`, `OfferOwnership`, `CommercialRule`, `VendorPayable`, settlement batch/line models, `PartnerType` `VENDOR`.

### 1.3 What R6 must add (gap summary)

| Gap | Type |
|-----|------|
| Production-quality vendor IA + write UX on existing APIs | UI |
| VENDOR-kind org filtering + clearer seller membership roles | API hardening |
| Catalog list DTO snake_case / public seller display name for customer | API + customer UX |
| Order detail + fulfillment actions wired in UI | UI |
| Settlement/payable detail (sandbox payout status read-only) | UI (+ maybe present DTO) |
| Support ticket correlation (shared kernel) | UI + thin API |
| Notification prefs / vendor event types | Platform reuse |
| Admin marketplace moderation panels | Admin UI |
| Settlement-table RLS attestation / repair if residual open policies remain | Security (verify in IMPL) |
| Rx-origin order **minimum-necessary** presentation for vendor | API presenters + UI |
| Negative isolation expansion (locations, inventory mutate, clinical deny) | Tests |
| Country pack marketplace enablement gates | Policy |

---

## 2. R6 scope and participant boundaries

### 2.1 In scope

Seller **organization-scoped** marketplace operations on **Vendor Web**: catalog offers, inventory ownership, order fulfillment for own `seller_org_id`, shipment visibility, own settlement/payable visibility (sandbox), support/notifications, account/security — under company policy packs.

### 2.2 Boundary matrix

| Actor | May | Must not |
|-------|-----|----------|
| **Vendor** | Own org catalog/inventory/orders/settlements | Company admin; store location ops for company pharmacy; delivery jobs; global finance; clinical authority |
| **Store** | Company/partner pharmacy **location** ops (R3) | Vendor marketplace listings for other sellers |
| **Customer** | Browse offers, cart, pay (sandbox), track | Vendor back-office |
| **Company Admin** | Partner KYC, moderation, settlements ops, audit | Act as vendor without membership |
| **Delivery** | Assigned logistics jobs | Vendor catalog/finance |
| **Finance (company)** | Settlement batches, mock payout approve | Grant vendor company roles |

Vendor remains a **Partner overlay on Person** + **Organization** membership. Never a second identity table.

---

## 3. Application

| Decision | Value |
|----------|-------|
| Surface | **`apps/web-vendor` only** |
| Mobile vendor | **Forbidden** |
| Generic Partner App | **Forbidden** |
| Identity | Existing OTP + JWT audiences (`customer` for ops; join remains `partner_applicant` on `web-join`) |
| API | Single NestJS modular monolith — no per-app server |

---

## 4. Vendor web information architecture

### 4.1 Navigation (target)

| Area | Screens | Permissions | Primary APIs | States |
|------|---------|-------------|--------------|--------|
| Dashboard | Ops summary + exceptions count | seller member | existing GETs + optional exceptions aggregate | loading / empty / error / 401 / 403 / expired |
| Organization / locations | Org switcher; warehouse locations list/create | seller member + location scope | `/vendor/organizations`, `/vendor/inventory/locations` | same |
| Profile | Org display, partner status (read), KYC status link to Join if needed | seller member | org + partner read | same |
| Catalog / offers | List, create item/variant/offer, publish, price versions | manage seller catalog | existing catalog POSTs + list | same |
| Pricing / commercial rules | View effective rules (read); create only if pack allows seller-editable rules | pack-gated | CommercialRule read (may need vendor-safe present) | same |
| Inventory | Lots, expiry, movements, GRN, adjust, transfers | inventory owner | existing inventory vendor APIs | same |
| Orders | List, detail, pick/pack/ready | seller member | existing order vendor APIs | same |
| Fulfillment / exceptions | Exception queue (stock fail, cancel request visibility) | seller member | order status + support link | same |
| Shipments | List/detail (sandbox tracking) | seller member | existing shipment APIs | same |
| Returns / refunds | **Visibility only** where order/refund APIs expose seller-safe DTO | pack + RBAC | refund present (additive if missing) | same |
| Settlement | Batches/lines/payables for own org; payout status **sandbox** | seller member | settlements GET + detail if added | same |
| Support | Ticket create/list correlated to order/shipment/settlement ids | seller member | shared support kernel | same |
| Notifications | Prefs + inbox stub | seller member | notification kernel | same |
| Security / account | Session, devices (reuse me APIs) | self | identity `/me` | same |
| Audit / activity | Own security events / outbox-safe activity | seller member | security events filtered | same |

### 4.2 UX quality bar

- No fake/dev auth bypass in product paths  
- Real API only  
- Shared ui-kit states: loading / empty / error / network / permission / session expired  
- Responsive web; a11y foundations; i18n architecture via existing tokens  
- Healthcare contextual loading when buffering is unavoidable; **never** mask errors as loading ([locked UX](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md) doctrine)  
- Deep-linkable routes preferred over opaque tab-only state (IMPL choice)

### 4.3 Must not expose

Company-global finance totals · other sellers · clinical notes/diagnosis · doctor internal panels · admin governance · rider PII beyond shipment need · platform take-rate configuration internals beyond frozen order facts.

---

## 5. Marketplace domain boundary

| Entity | Owner kernel | Vendor relationship |
|--------|--------------|---------------------|
| CatalogItem / Variant | Catalog (1A) | Vendor may create when pack allows |
| CatalogOffer | Catalog | `sellerOrgId` = vendor org |
| CommercialRule | Catalog/commerce | Country/seller scoped; no hardcoding take rates in UI |
| InventoryLot | Inventory (1B) | `ownerOrgId` = vendor |
| Cart / Quote / Checkout | 1C | Customer; single-seller cart already enforced |
| PaymentIntent | 1D sandbox | No vendor payment kernel |
| Order | 1E | `sellerOrgId` filter |
| Shipment | 1F sandbox | Seller-visible |
| VendorPayable / Settlement* | 1G sandbox | Own org only |
| Notification / Support | Platform | Shared kernels |

**No duplicate catalog, pricing, payment, or notification systems.**

---

## 6. Healthcare / Rx integration (R5 reuse)

R5 already owns Prescription → Dispense → Order-from-Rx → Refill. **R6 must not create a second Rx/dispensing path.**

### 6.1 Vendor visibility when order is Rx-origin

| Allowed (minimum necessary) | Forbidden |
|-----------------------------|-----------|
| Order number, status, line SKUs/titles/qty already on order | Diagnosis, clinical notes, encounter text |
| Flag `rx_origin: true` / `prescription_id` **opaque id** if needed for support correlation | Dosage instructions / clinical concept labels unless pack+legal explicitly authorize seller pharmacy workflow for that seller type |
| Dispense location id only if already on order for fulfillment | Doctor identity beyond what commerce already requires |
| Customer delivery address already on order for ship | Full health record, refill clinical history |

**Default engineering stance:** marketplace **VENDOR** sellers fulfill commercial lines; clinical dispensing remains **Store/pharmacy** (R3/R5). If a country pack later allows vendor pharmacies, that is a **legal OD + pack flag** — not assumed in R6.

### 6.2 Safe identifiers

Use `order_id` / `order_number` / `shipment_id` / optional opaque `prescription_id` for support tickets — never put Rx line clinical payloads in vendor DTOs or outbox.

---

## 7. Inventory

| Topic | Plan |
|-------|------|
| Reuse | 1B inventory APIs already under `/vendor/inventory/*` |
| Vendor scope | `owner_org_id` + optional location membership |
| Store vs Vendor | Store = company/partner pharmacy **location** ops; Vendor = seller warehouse `VENDOR_WAREHOUSE` / seller org stock |
| Isolation | Vendor A ↛ Vendor B lots/movements (RLS `can_org` + service asserts) |
| UI | Wire existing GRN/adjust/transfer endpoints; lots/expiry visibility |

Do not duplicate Store inventory screens into Vendor; do not let Vendor mutate Store locations.

---

## 8. Commercial economics

| Rule | Plan |
|------|------|
| Reuse | CommercialRule, 1C quote, 1D payment, 1E order, 1G finance |
| No hardcoding | take rate, commission, tax, currency, country, settlement terms in app code |
| Immutability | Frozen commercial facts on order/payable remain immutable; historical orders never reprice from today’s rules |
| Vendor UI | Show frozen fee/take fields on payable/settlement lines only |

---

## 9. Settlement

| Topic | Plan |
|-------|------|
| Reuse | 1G VendorPayable + settlement batches/lines |
| Vendor sees | Own payables, settlement lines, fees, status, sandbox payout state |
| Vendor never sees | Global company P&L, other sellers, approve payout for company |
| Live payout | **OFF** (R14) |
| Gap to verify in IMPL | Settlement table RLS residual risk noted historically — attest FORCE/policies before production; vendor list path already membership-gated |

---

## 10. Returns / refunds / exceptions

| Topic | Plan |
|-------|------|
| Audit first in IMPL | Existing refund/order exception APIs and seller visibility |
| Vendor | Read status; open support ticket; no unilateral statutory refund invention |
| Control | Country pack / legal OD for consumer protection and liability |

Do not invent refund law in R6.

---

## 11. Support

Reuse shared support kernel (R11 product CMS/helpdesk may deepen later — **do not** build a second helpdesk in R6).

Correlation: `vendor_org_id` + `order_id` + `shipment_id` + `settlement_id` + `person_id` — minimum necessary.

---

## 12. Notifications

Reuse outbox → BullMQ notification path.

Plan vendor notification types: `order.assigned/updated`, fulfillment exceptions, settlement status, support reply, account/security.

**No second notification system. No Kafka.** No clinical payloads in events.

---

## 13. Admin / company control

Admin/ERP remains company-controlled:

| Oversight | Notes |
|-----------|-------|
| Vendor applications / KYC | Existing Join + partner admin |
| Organizations / offers moderation | Pack-gated publish may require company approve (OD) |
| Orders / exceptions | Company ops views |
| Settlements / risk flags | Finance dual-control where configured |
| Audit | Security events |

Vendor cannot modify company governance or grant `company_*` roles (existing authority taxonomy).

---

## 14. RLS / security plan

| Invariant | Requirement |
|-----------|-------------|
| `worldpharma_app` | NOSUPERUSER + NOBYPASSRLS |
| Tenant context | Server-built GUCs; SET LOCAL; fail-closed |
| Client headers | Non-authoritative |
| Vendor scope | Organization (+ location where applicable) |
| Negative tests | A↛B read/mutate; no company-global finance; no clinical admin; cannot become company admin |

IMPL must expand isolation coverage for inventory mutate, order fulfillment, and Rx DTO leak tests.

---

## 15. MNC / country

Preserve: Global Company → Region → Country → Legal Entity → Business Unit → Organization → Location.

- No India/INR/GST hardcoding  
- Marketplace enablement via **country policy packs** (`services.marketplace`, partner type VENDOR, etc.)  
- BU membership remains R15 gap — not required to start R6 org-scoped seller ops  

---

## 16. Customer experience (R6-needed only)

| Gap | Plan |
|-----|------|
| Seller display | Public catalog/order present **seller display name** (not raw UUID) |
| Offer selection | Already single-seller cart; keep |
| Availability | Existing offer/inventory signals |
| Order source | Optional “Sold by {name}” on order detail |
| Reviews | **Out of R6** unless already authorized (R12) — do not invent |

Do not rebuild catalog/cart/checkout.

---

## 17. Mobile

| App | R6 action |
|-----|-----------|
| Vendor mobile | **Do not create** |
| Customer / Store / Delivery / Doctor | RN+Expo Android/iOS — **no unrelated changes** unless a documented R6 customer seller-name dependency requires a thin present update |

---

## 18. Buffering / loading

Preserve locked rule: unavoidable buffering uses healthcare/medicine contextual treatment in shared ui-kit when available; never hide errors behind buffering.

---

## 19. Audit / events

| Topic | Plan |
|-------|------|
| Bus | Existing outbox only |
| New events | Only if needed (e.g. `offer.published`, `seller.fulfillment.exception`) — PHI-stripped |
| Audit | Catalog publish, inventory adjust, fulfillment transitions, settlement views of sensitive finance |

No Kafka / second bus.

---

## 20. Legal / compliance gates (no invented law)

| Gate | Owner |
|------|-------|
| Marketplace operator / MoR | Legal + human |
| Seller contracts / KYC depth | Legal + product |
| Pharmacy restrictions for seller type | Legal + pack |
| Product claims / advertising | Legal (OD-CMS / marketplace) |
| Tax / invoices | Legal + finance |
| Refunds / consumer protection | Legal + pack |
| Data residency | Legal + eng config |
| Payouts / bank | Legal + R14 |
| Clinical inducement | Legal |

Separate engineering readiness from human/legal decisions.

---

## 21. Test plan (R6 IMPL matrix)

| Suite | Cases |
|-------|-------|
| Isolation | Vendor A↛B offers, inventory, orders, settlements, support |
| Scope | Org, location, country |
| Admin | Company can oversee; vendor cannot grant company roles |
| Catalog | Offer visibility by pack/country; publish gates |
| Economics | Historical pricing immutability; currency from offer/order |
| Rx-origin | Vendor DTO excludes clinical fields |
| Refund visibility | Pack-gated |
| RLS | Fail-closed; headers non-authoritative |
| Idempotency | Offer create/publish, fulfillment transitions |
| Regression | All R0–R5 suites remain green (incl. consecutive api:test hygiene from [125](125_PRE_R6_TEST_DETERMINISM_FIX.md)) |

Do not weaken existing security tests.

---

## 22. UI / frontend acceptance (`web-vendor`)

| Criterion | Bar |
|-----------|-----|
| Auth | Real OTP; no fake prod auth |
| API | Wired write+read for catalog, inventory, orders, settlements |
| States | loading/empty/error/401/403/expired on every primary screen |
| Responsive | Desktop + mobile web |
| a11y / i18n | Foundations via ui-kit |
| PHI | No clinical leakage |
| Support/notifications | Kernel-backed, not placeholders |
| Shell debt | Profile + support no longer EmptyState-only |

---

## 23. Database

| Finding | Plan |
|---------|------|
| Core marketplace schema | **Sufficient** for R6 seller ops |
| Additive only if IMPL proves need | e.g. seller public profile fields, marketplace moderation flags — **identify in IMPL ADR, do not migrate in this CR** |
| Forbidden | Historical rewrite; duplicate seller tables; second identity |

---

## 24. API plan

| Action | Detail |
|--------|--------|
| Prefer reuse | Existing `/vendor/*` modules |
| Hardening | Filter orgs to `OrganizationKind.VENDOR` (and pack-enabled); tighten DTO presenters (snake_case, seller display name) |
| Additive candidates | Settlement detail; refund visibility present; support ticket create with seller correlation; notification prefs; admin moderation endpoints if missing |
| Forbidden | New API server; vendor-specific payment service; unrestricted partner admin APIs |

---

## 25. Dependencies

| Dependency | Ready? | Notes |
|------------|--------|-------|
| R0 identity / partner / Join | Yes | |
| R1 commerce 1A–1G sandbox | Yes | Live money still OFF |
| R3 Store/Delivery | Yes | Distinct from vendor |
| RLS / MNC governance | Yes (post-[123](123_PRE_R6_BLOCKER_REPAIR_IMPLEMENTATION.md)) | Attest settlement policies in IMPL |
| R5-D / R5-E | Yes | Vendor must not fork Rx |
| Pre-R6 determinism [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) | Yes | |
| R14 live payout/carrier | **Not ready** | Correctly out of R6 |
| Legal MoR / marketplace ODs | **Human** | Mark OPEN |

If a dependency is not ready, **do not invent workarounds** (e.g. do not enable live payout inside R6).

---

## 26. Explicit out of scope

Vendor mobile · generic Partner App · Lab · Phlebotomist · Pathologist · Radiology · Care Navigation · CMS product · CRM · Marketing · Analytics warehouse · live PSP · live carrier · live payout · production telemedicine · automatic refill · second Rx/dispensing system · Kafka.

---

## 27. Measurable R6 acceptance (for future IMPL CR)

| Area | Accept |
|------|--------|
| API | Seller completes list→create offer→publish→price→stock→fulfill order→see own settlement in sandbox |
| DB | No historical rewrite; additive only if ADR-approved |
| RLS/security | A↛B all resources; NOSUPERUSER/NOBYPASSRLS; headers non-authoritative |
| UI | IA §4 complete; no placeholder support/profile; states complete |
| Tests | Matrix §21 green; R0–R5 regression green |
| Builds | web-vendor + api typecheck/build green |
| MNC | Pack-gated marketplace; no country hardcode |
| PHI | Rx-origin minimum necessary |
| Audit | Sensitive seller actions audited |
| Support/notifications | Shared kernels only |
| Money | Sandbox only |

**Book 93 accept line remains:** vendor lists offer in pack country; cannot see company finance.

---

## 28. Proposed IMPL sequencing (not authorized here)

| Sub-phase | Focus |
|-----------|-------|
| R6-A | Vendor IA + DTO hardening + VENDOR org filter + customer seller display — **implemented** ([128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md)) |
| R6-B | Catalog write UX + commercial rule visibility — **implemented** ([130](130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md)) |
| R6-C | Inventory ops UX — **implemented** ([132](132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md)) |
| R6-D | Order detail + fulfillment actions + Rx-safe presenters — **implemented** ([134](134_R6_D_VENDOR_ORDER_FULFILLMENT_IMPLEMENTATION.md)) |
| R6-E | Settlements detail + support/notifications + admin oversight polish — **implemented** ([136](136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md)) |
| R6-F | Isolation/RLS attestation + pack gates + acceptance — **implemented** ([138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md)) |

R6 vendor-marketplace sub-phases **complete**. **R7+ not authorized by Books 128–138.**

---

## Document control

| Action | Status |
|--------|--------|
| Create `docs/blueprint/126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md` | **This document** |
| Update master index / roadmap | Companion edits only |
| Production code / migrations | **NONE** |

---

## Final declaration

**FINAL STATUS: R6_PLAN_READY**

This plan **does not authorize R6 implementation**.

**R6 coding: NOT STARTED.**  
**R7+: NOT STARTED.**

**STOP.**
