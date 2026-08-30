# 17 — Admin ERP

**Status:** Blueprint  
**Audience:** Product, architecture, admin/ops/finance engineering, operations, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health Record](16_HEALTH_RECORD.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md)

**Requirement IDs:** REQ-ADM, REQ-RBAC, REQ-ANL, REQ-SUP, REQ-CMP, REQ-LED, REQ-CRM

---

## 1. Purpose

The Admin ERP is the **country-aware operations, finance, CMS, compliance, and analytics control plane** for World Pharma. It is not a second backend. It is **one Next.js application** (`APP-ADM` / `apps/web-admin`) with **permission-based shells**. Navigation, home dashboards, and data scopes change by membership — not by deploying five codebases.

**Company-owned:** only company-controlled memberships (`super_admin`, `global_admin`, `company_*`) may use this application for platform configuration. Partner `org_admin` uses partner portals, never platform-admin privilege. See [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md).

From [Application Architecture](04_APPLICATION_ARCHITECTURE.md) §3: APP-ADM-S, APP-ADM-C, APP-OPS, APP-FIN, and APP-CRM are **experience shells of one app**, not five repositories.

**ASSUMPTION (A-ADM-01):** All admin surfaces share the same NestJS modular monolith, design system, auth session, and Country Policy Pack. Shells never invent a second identity, ledger, or order store.

**RISK:** Privilege confusion if a customer JWT is accepted by admin APIs. Mitigation: JWT `aud` for the admin client family; membership selection required; customer tokens rejected. See [Roles](03_USER_ROLES_AND_PERMISSIONS.md) §2.

---

## 2. One app, permission-based shells

### 2.1 Decision

| Option | Verdict |
| --- | --- |
| Five Next.js apps (super, country, ops, finance, CRM) | **Rejected.** Duplicate auth, nav, design, and release cost. |
| Role-specific micro-frontends | Rejected for Phase 0. Optional later if a shell’s team/scale requires it. |
| **One Next.js admin app + route groups + permission gates** | **Selected.** |

```
apps/web-admin
  /app
    /(shell)                 ← shared chrome: country switcher, search, actor
      /dashboard
      /customers
      /orders
      /finance/...
      /compliance/...
  /modules                   ← feature UI; imported only if permission allows
```

Route existence is **not** authorization. Every mutation goes through the API with `membership_id` + permission + scope. Hidden nav is UX, not security.

### 2.2 Shell composition

A **shell** is:

1. **Home dashboard** widgets allowed for the active membership
2. **Nav tree** filtered by `resource:action` (see [Roles](03_USER_ROLES_AND_PERMISSIONS.md) §4)
3. **Scope chrome:** platform vs country vs organization (read-only org drill-down for platform roles)
4. **Default country:** `super_admin` / `global_admin` may pick a working `country_id`; `country_admin` is pinned
5. **Break-glass banner** when impersonation or clinical override is active

| Shell id | Typical roles | Default landing |
| --- | --- | --- |
| `SHELL_PLATFORM` | `super_admin`, `global_admin` | Global health + country list |
| `SHELL_COUNTRY` | `country_admin` | Country ops queues |
| `SHELL_FINANCE` | `finance` | Ledger, settlements, refunds |
| `SHELL_OPS` | `operations` | Orders, logistics, lab, capacity |
| `SHELL_SUPPORT` | `support` | Tickets + masked customer 360 |
| `SHELL_COMPLIANCE` | `compliance_officer` | Holds, KYC, audit export |
| `SHELL_CMS` | `cms_editor` | Banners, help, legal docs |
| `SHELL_ANALYST` | `analyst` | Read-only analytics |

A user with multiple memberships **selects one membership** per session (JWT `membership_id`). Switching membership reloads shell and country.

**OPEN DECISION (OD-ADM-01):** Whether a single person may hold `finance` and `operations` in the same country. Recommendation: **allowed as separate memberships**, not a combined role; SoD still blocks the same user from KYC-submit **and** KYC-approve, and from refund-execute **and** payout-approve above threshold ([Roles](03_USER_ROLES_AND_PERMISSIONS.md) §10).

### 2.3 Client contract

| Topic | Contract |
| --- | --- |
| App | Next.js App Router, admin design system |
| Auth | Email + password + **MFA required** (TOTP/WebAuthn). No social login. |
| JWT `aud` | `admin` (admin client family) |
| Country | Working `country_id` in JWT; `super_admin`/`global_admin` may switch (audited) |
| Reason header | High-risk actions require `X-Reason` and optional ticket id |
| Impersonation | `user:impersonate` — `super_admin` only, time-boxed, audited |
| PII | Support views are **masked** until `user:reveal_pii` + reason |
| Clinical payload | **Deny by default.** Not in CRM 360. Break-glass only per [Health Record](16_HEALTH_RECORD.md) |

---

## 3. Actor model in admin

Admin never creates a parallel user table. It binds to:

| Object | Use in admin |
| --- | --- |
| **Person** | Human actor and subject |
| **Account** | Login, MFA, lock, status |
| **Membership** | Role + `organization_id?` + `country_id?` + `location_id?` |
| **Organization** | PLATFORM, PHARMACY_OWNED, VENDOR, CLINIC, LAB, LOGISTICS_FLEET, AFFILIATE_ORG |
| **Location** | Store, warehouse, lab site, clinic |
| **Country** + **PolicyPack** | Working country and feature gates |

Staff using personal customer accounts for production test orders is a **RISK** (A-BIZ / [Business Architecture](02_BUSINESS_ARCHITECTURE.md) §8). Control via environment separation and policy.

---

## 4. Information architecture

### 4.1 Global chrome (all shells)

- Actor name, active role, working country
- Global search: customers (masked), orders, bookings, jobs, tickets, orgs — **never** clinical payload in typeahead
- Queue badges: KYC, Rx desk (ops), refunds, settlements, tickets — filtered by permission
- Legal-hold / incident banner when country is in restricted mode

### 4.2 Module catalog (product modules)

The following modules **must** exist as first-class admin surfaces (IA), even if some are Phase-gated by Policy Pack. Feature flags hide modules; they do not fork the app.

| Module | Purpose (admin) | Kernel modules | Primary docs |
| --- | --- | --- | --- |
| **Dashboard** | Role-specific KPIs and work queues | analytics projections | this doc, [30 later] |
| **Customers** | Customer 360 operational view; account actions | `party`, `crm` | [15](15_CRM_PLATFORM.md) |
| **Partner applications** | **Unified** join/KYC/approval for all PartnerTypes | `partner`, `compliance` | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| **Vendors** | Marketplace seller lifecycle, listings queue (post-ACTIVE) | `party`, `catalog`, `compliance` | [07](07_VENDOR_PLATFORM.md) |
| **Pharmacies** | Owned org/store directory, license fields from pack | `party` | [06](06_PHARMACY_PLATFORM.md) |
| **Stores** | Location ops: hours, catchment, enable/disable fulfillment | `party`, `logistics` | [06](06_PHARMACY_PLATFORM.md) |
| **Doctors** | Professional KYC/license queues, publish, suspend | `care`, `compliance` | [08](08_DOCTOR_PLATFORM.md) |
| **Labs** | Lab org/location KYC, accreditation evidence, capacity | `diagnostics`, `compliance` | [09](09_LAB_PLATFORM.md) |
| **Pathologists** | Signer roster, SoD vs result-enter | `diagnostics`, `iam` | [09](09_LAB_PLATFORM.md) |
| **Phlebotomists** | Network/org collectors, cert expiry, capability flags | `party`, `logistics` | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **Delivery partners** | Rider KYC, capabilities, presence, fraud holds | `logistics`, `compliance` | [11](11_LOGISTICS_PLATFORM.md) |
| **Affiliates** | Partner KYC, campaigns, commission review, fraud | `affiliate` | [14](14_AFFILIATE_PLATFORM.md) |
| **Products** | Non-medicine catalog, vendor proposals, CMS claims | `catalog` | [05](05_CUSTOMER_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| **Medicines** | Medicine master, Rx flags, substitutes, publish | `catalog`, `compliance` | [06](06_PHARMACY_PLATFORM.md) |
| **Inventory** | Cross-location stock, FEFO, recalls (ops view) | `inventory` | [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| **Orders** | Goods order ops: SLA, cancel, substitute, exceptions | `order` | [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| **Appointments** | Doctor booking ops, no-show, doctor cancel | `care` | [08](08_DOCTOR_PLATFORM.md) |
| **Tests** | Lab test catalog publish, restrictions, TAT | `diagnostics`, `catalog` | [09](09_LAB_PLATFORM.md) |
| **Samples** | Exception queues, lost/damaged, recollection (no CoC internals for support) | `diagnostics` | [09](09_LAB_PLATFORM.md) |
| **Reports** | Release incidents, amendment flags, print jobs — **not** result values for support | `diagnostics`, `health` | [09](09_LAB_PLATFORM.md), [16](16_HEALTH_RECORD.md) |
| **Payments** | Intent/refund ops, gateway health, COD exceptions | `payment` | [12](12_PAYMENT_PLATFORM.md) |
| **Refunds** | Approval queues, dual control, destination | `payment`, `ledger` | [12](12_PAYMENT_PLATFORM.md) |
| **Wallet** | Country-gated stored value: holds, manual credit (dual control) | `wallet` | [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md) |
| **Ledger** | Journal read, period status, recon breaks | `ledger` | [13](13_LEDGER_SETTLEMENT.md) |
| **Settlements** | Batch preview/approve/execute (finance) | `settlement` | [13](13_LEDGER_SETTLEMENT.md) |
| **CRM** | Segments, campaigns, automations, customer 360 | `crm` | [15](15_CRM_PLATFORM.md) |
| **Marketing** | Campaigns, coupons, suppressions | `crm`, `cms` | [15](15_CRM_PLATFORM.md) |
| **Support** | Tickets, macros, SLA | `support` | [15](15_CRM_PLATFORM.md) |
| **Analytics** | Country-scoped BI; no clinical payload by default | analytics | this doc |
| **CMS** | Home rails, banners, help, legal document versions | `cms` | [05](05_CUSTOMER_PLATFORM.md) |
| **Compliance** | Policy packs, nested KYC cases, holds, retention jobs, restrictions | `compliance` | [19](19_COMPLIANCE_FRAMEWORK.md) |
| **Audit** | Audit log search, exports | `compliance` | [19](19_COMPLIANCE_FRAMEWORK.md), [20](20_DATABASE_ARCHITECTURE.md) |
| **Configuration** | Country pack editor, feature flags, tax profile **ids**, gateways | `compliance`, `cms` | [18](18_GLOBALIZATION.md) |

**ASSUMPTION (A-ADM-02):** Pharmacy staff dense ERP (PO, GRN, pack station) remains in **pharmacy web** ([06](06_PHARMACY_PLATFORM.md)), not a clone inside admin. Admin **Pharmacies / Stores / Inventory / Orders** are **oversight and exception** surfaces, plus country-level catalog publish.

**OPEN DECISION (OD-ADM-02):** How deep owned-pharmacy buying (PO/GRN) appears in admin vs pharmacy portal. Recommendation: **pharmacy portal owns buying**; admin sees read-only stock health and recall orchestration.

---

## 5. Role × module matrix

Scope always applies: `platform` vs `country`. A `country_admin` of A cannot open Country B. `finance` may be country- or platform-scoped per membership.

Legend: **F** full (read+permitted writes) · **R** read · **Q** queue/work · **M** masked · **—** hidden · **BG** break-glass only.

| Module | super_admin | global_admin | country_admin | finance | operations | support |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | F | F | F country | F finance | F ops | F tickets |
| Customers | F | F | F | R ids | F | M |
| Vendors | F | F | Q KYC/publish | R settlement | Q SLA | M tickets |
| Pharmacies | F | F | F | R | F | R hours only |
| Stores | F | F | F | — | F | R |
| Doctors | F | F | Q KYC/license | R payout ids | Q incidents | M appt only |
| Labs | F | F | Q KYC | R | F capacity | M booking |
| Pathologists | F | F | F roster | — | R SoD | — |
| Phlebotomists | F | F | F | R earnings | F | M job |
| Delivery partners | F | F | F | R earnings | F | M job |
| Affiliates | F | F | Q | R commission | Q fraud | — |
| Products | F | F | F publish | — | R | — |
| Medicines | F | F | F publish | — | R | — |
| Inventory | F | R | R/F recall | — | F | — |
| Orders | F | F | F | R amounts | F | M + limited cancel request |
| Appointments | F | F | F | R | F | M |
| Tests | F | F | F publish | — | R | — |
| Samples | F | R | F exceptions | — | F | R status **no barcode** |
| Reports | BG payload | — | incident flags | — | incident | **no payload** |
| Payments | F | R | R | F | R COD | R status |
| Refunds | dual | — | request | **F execute** | request | request |
| Wallet | dual credit | — | R | F dual credit | — | R |
| Ledger | R | R | — | **F read** (no silent post) | — | — |
| Settlements | dual execute | — | — | **F** | — | — |
| CRM | F | F | F | — | R | R 360 masked |
| Marketing | F | F | F | — | — | — |
| Support | F | F | F | — | R | **F tickets** |
| Analytics | F | F | F | F finance | F ops | R own SLA |
| CMS | F | F | F / editor | — | — | R help |
| Compliance | F packs | limited flags | country flags | — | — | — |
| Audit | F | R | R country | R finance events | R ops | — |
| Configuration | **F packs** | global flags minus secrets | limited country | tax profile **id** read | serviceability | — |

**Notes:**

1. `super_admin` has platform scope and **dual control** for destructive/config/secret operations. Day-to-day KYC is `country_admin`, not break-glass.
2. `global_admin` is day-to-day global ops **without** secret/key rotation and without default clinical payload ([Roles](03_USER_ROLES_AND_PERMISSIONS.md) §3.1).
3. `support` never receives `health_artifact:read` payload ([15](15_CRM_PLATFORM.md) OD-CRM-04, [Roles](03) OD-RBAC-02).
4. `finance` cannot post arbitrary journal lines from UI in v1; posting is event-driven. UI is read + settlement execute + refund/payout approvals.
5. `compliance_officer` (not in the six-column matrix but a system role) owns legal hold, retention, and audit export. **OPEN DECISION (OD-ADM-03):** Whether `compliance_officer` is a required distinct membership in every launch country or may be combined with `country_admin` in tiny launches. Recommendation: **distinct** in production.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Local SoD for pharmacy and lab staff vs admin approvers.

---

## 6. Module specifications

Each module below is an **admin product module**: purpose, screens, permissions, APIs (logical), events, empty/error, country hooks. HTTP contracts: [API](21_API_ARCHITECTURE.md).

Shared UX:

- Country filter is **mandatory** except on true platform objects (Policy Pack list, legal entities).
- Empty queues are OK; do not fake demo rows in production.
- Errors show reason codes, not stack traces.
- Exports are jobs + download links, not unbounded browser CSV of PII.

---

### 6.1 Dashboard (`M-ADM-HOME`)

| | |
| --- | --- |
| **Purpose** | Role-native launchpad: SLA breaches, KYC aging, payment recon breaks, ticket SLA, country service flags. |
| **Screens** | Widget grid from CMS + pack `admin.dashboard.widgets[]` |
| **Permissions** | `analytics:read` at scope; queues need their own permissions to deep-link |
| **APIs** | `AdminHome.GetLayout`, `OpsQueue.Counts` |
| **Events** | in: domain events via projections |
| **Empty / error** | New country: empty KPIs + setup checklist. Partial source fail: widget error, rest render. |
| **Country hooks** | `admin.dashboard.widgets[]`, service enablement tiles hidden when pack disables |

**ASSUMPTION (A-ADM-03):** Dashboards are **projections**, not live scans of clinical tables.

---

### 6.2 Customers (`M-ADM-CUST`)

| | |
| --- | --- |
| **Purpose** | Find and act on customer accounts: status, devices, addresses, orders/bookings **pointers**, wallet **amount**, tickets. |
| **Screens** | Search, 360 (CRM projection), account disable, export/delete **request** |
| **Permissions** | `user:read` (masked for support); `user:reveal_pii`; `account:disable` |
| **APIs** | `CustomerAdmin.Search`, `CustomerAdmin.Get360`, `Account.Disable`, `Account.RequestDelete` |
| **Forbidden** | Clinical payload; ledger posting; silent wallet credit |
| **Country hooks** | `privacy.deletion_process`, reveal-PII reason codes |

See [CRM](15_CRM_PLATFORM.md) §3–4.

---

### 6.2b Partner applications (`M-ADM-PTR`) — canonical KYC queue

| | |
| --- | --- |
| **Purpose** | Single worklist for **all** PartnerTypes: applications, document review, KYC, approve/reject, resubmission, suspend, reactivation, risk flags, audit history. Type-specific modules (Vendors, Doctors, Labs, …) remain for **post-ACTIVE** operations. |
| **Screens** | Worklist (type, country, state, SLA, missing docs); application detail; document viewer (watermark); nested KYC; approval/reject with reason; resubmission timeline; risk flags; status history |
| **Permissions** | `partner_application:review`, `partner_application:approve` (SoD), `partner_document:download` + reason |
| **APIs** | `/admin/partner-applications` ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §17) |
| **Visible fields** | Application status, missing documents, verification history, reviewer, review timestamps, rejection reasons, previous submissions |
| **Forbidden** | Using this viewer as EHR; support seeing KYC by default |

Detail: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §18.

---

### 6.3 Vendors (`M-ADM-VEND`)

| | |
| --- | --- |
| **Purpose** | **Post-ACTIVE** marketplace seller ops: listing publish queue, SLA, suspend. Join/KYC is `M-ADM-PTR`. |
| **Screens** | Vendor list, listing approval, suspend |
| **Permissions** | `kyc:review`, `kyc:approve` (not same user as submitter), `catalog:publish` |
| **APIs** | `VendorAdmin.List`, `Kyc.Get`, `Kyc.Approve`, `VendorAdmin.Suspend`, `Listing.Publish` |
| **Country hooks** | `marketplace.enabled`, `kyc.vendor.*`, `marketplace.rx_fulfillment` |

Vendor cannot self-approve. Isolation: admin APIs are the only cross-vendor view.

---

### 6.4 Pharmacies (`M-ADM-PHARM`)

| | |
| --- | --- |
| **Purpose** | Owned `PHARMACY_OWNED` orgs: license field schema from pack, enable country operation. |
| **Screens** | Org list, license fields (pack-defined — **do not invent license schemes**), status |
| **Permissions** | `party:write` country; `compliance` view |
| **APIs** | `PharmacyOrgAdmin.List`, `PharmacyOrgAdmin.Update` |
| **Country hooks** | `pharmacy.license_fields[]` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Display and storage of pharmacy license identifiers.

---

### 6.5 Stores (`M-ADM-STORE`)

| | |
| --- | --- |
| **Purpose** | Location `STORE` / `WAREHOUSE`: hours, catchment, fulfillment on/off, routing eligibility. |
| **Screens** | Store map, catchment, close-store |
| **Permissions** | `location:write` |
| **APIs** | `LocationAdmin.List`, `LocationAdmin.Update` |
| **Events** | `location.updated` |
| **Country hooks** | `pharmacy.hours_format`, `pharmacy.warehouse_direct_ship` (OD-PHARM-01) |

---

### 6.6 Doctors (`M-ADM-DOC`)

| | |
| --- | --- |
| **Purpose** | Doctor onboarding queues: KYC, qualification, license, publish to discovery, suspend, license expiry. |
| **Screens** | Worklist, document viewer (KYC — not EHR), reason codes |
| **Permissions** | `kyc:review` / `kyc:approve`; dual control **OD-RBAC-01 / OD-DOC-03** |
| **APIs** | `DoctorAdmin.List`, `DoctorKyc.Approve`, `DoctorAdmin.Suspend` |
| **Country hooks** | `telemedicine.enabled`, `kyc.doctor.*`, issuer codes from pack |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** License wording, advertising of clinical services. Do not claim government endorsement.

---

### 6.7 Labs (`M-ADM-LAB`)

| | |
| --- | --- |
| **Purpose** | Lab org KYC, accreditation **evidence** (platform does not confer accreditation), location catchment, catalog publish. |
| **Screens** | Lab list, evidence, suspend |
| **Permissions** | `kyc:*`, `catalog:publish` |
| **APIs** | `LabAdmin.List`, `LabAdmin.SetStatus` |
| **Country hooks** | `labs.enabled`, accreditation field schema from pack |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may operate a diagnostic laboratory on a marketplace.

---

### 6.8 Pathologists (`M-ADM-PATH`)

| | |
| --- | --- |
| **Purpose** | Roster of `pathologist` memberships; SoD vs `result:enter`; capacity. |
| **Screens** | Roster, SoD conflicts |
| **Permissions** | `iam:assign` at lab org |
| **Country hooks** | `lab.sod.signer_separate` (OD-LAB-17) |

Admin does **not** sign reports.

---

### 6.9 Phlebotomists (`M-ADM-PHE`)

| | |
| --- | --- |
| **Purpose** | Collector network: KYC, certifications (pack types only), capabilities, cert expiry, suspend. |
| **Screens** | Roster, cert calendar, incident |
| **Permissions** | `kyc:*`, `logistics.partner:write` |
| **Country hooks** | `lab.home_collection.enabled`, certification type enum from pack |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may collect venous/capillary samples.

---

### 6.10 Delivery partners (`M-ADM-DEL`)

| | |
| --- | --- |
| **Purpose** | Rider/fleet KYC, vehicle fields **if pack requires**, capabilities (`PARCEL`, `BIO_SPECIMEN`, `COLD_CHAIN`, `COD_CASH`), fraud hold. |
| **Screens** | Roster, job incident, fake-POD queue |
| **Permissions** | `kyc:*`, `job:track` ops |
| **Country hooks** | `kyc.rider.*`, courier licensing placeholders |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Courier licensing, specimen transport, COD cash handling.

---

### 6.11 Affiliates (`M-ADM-AFF`)

| | |
| --- | --- |
| **Purpose** | Affiliate approval, campaign enablement, commission approve/void/fraud, clinical category **default OFF**. |
| **Screens** | Partners, campaigns, commission review |
| **Permissions** | `kyc:*`, `affiliate.commission:review` |
| **Forbidden** | Enabling clinical earn categories without legal sign-off recorded on the pack |
| **Country hooks** | `affiliate.eligible_services[]` default clinical **OFF** |

See [Affiliate](14_AFFILIATE_PLATFORM.md). **LEGAL/COMPLIANCE REVIEW REQUIRED:** Inducement, kickbacks, medicine advertising.

---

### 6.12 Products (`M-ADM-PROD`)

| | |
| --- | --- |
| **Purpose** | Non-medicine CatalogItems, vendor proposals, health-claim review. |
| **Screens** | Master, proposal queue, publish |
| **Permissions** | `catalog:write`, `catalog:publish` |
| **Country hooks** | `catalog.health_claim_review` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Health claims and advertising.

---

### 6.13 Medicines (`M-ADM-MED`)

| | |
| --- | --- |
| **Purpose** | Medicine master: Rx required flag, controlled **visibility** flag (not invented scheduling law), substitutes, country formulary publish. |
| **Screens** | Medicine master, Rx class from **pack enum**, substitute map |
| **Permissions** | `catalog:publish` for Rx drugs may require pharmacist/country rules |
| **Country hooks** | `catalog.rx_required_rules`, `catalog.controlled_substance_visible` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Controlled medicines, substitution, price controls. **Do not invent** a country’s drug schedule.

---

### 6.14 Inventory (`M-ADM-INV`)

| | |
| --- | --- |
| **Purpose** | Ops oversight: sellable qty, near-expiry, recall orchestration across owned + vendor lots. |
| **Screens** | Stock health, recall blast, quarantine |
| **Permissions** | `inventory:adjust` is **not** default for country_admin on vendor stock; recall flag is compliance/ops |
| **APIs** | `InventoryAdmin.List`, `Batch.Recall` |
| **Country hooks** | `inventory.dispense_min_remaining_days` |

Adjustments in owned stores remain pharmacy app primary. Recall is **platform-wide**.

---

### 6.15 Orders (`M-ADM-ORD`)

| | |
| --- | --- |
| **Purpose** | Goods Order exceptions: SLA, vendor timeout, OOS after pay, cancel after policy, substitute offer (OD-CUS-14). |
| **Screens** | Order search, timeline, actions |
| **Permissions** | `order:read` country; `order:cancel` ops; support = request only |
| **APIs** | `OrderAdmin.List`, `OrderAdmin.Get`, `OrderAdmin.Cancel`, `OrderAdmin.RequestSubstitute` |
| **Country hooks** | `order.cancel_until_states[]`, `vendor.accept_sla_seconds` |

Does not skip illegal state transitions ([06](06_PHARMACY_PLATFORM.md) §6).

---

### 6.16 Appointments (`M-ADM-APPT`)

| | |
| --- | --- |
| **Purpose** | Doctor Booking ops: doctor cancelled, system cancel (license lapse), no-show review — **no automatic financial penalty until pack filled** (OD-DOC-02). |
| **Screens** | Calendar incidents, refund request |
| **Permissions** | `appointment:manage` ops; no encounter note payload |
| **Country hooks** | `appointment.cancel_hours`, `telemedicine.enabled` |

---

### 6.17 Tests (`M-ADM-TEST`)

| | |
| --- | --- |
| **Purpose** | Lab test/package publish, age/sex restriction **data**, TAT targets, home-collection eligibility. |
| **Screens** | Test master, package inclusions (v1 no split across labs — OD-LAB-15) |
| **Permissions** | `catalog:publish` |
| **Country hooks** | `labs.enabled`, `lab.packages.enabled` |

---

### 6.18 Samples (`M-ADM-SAMP`)

| | |
| --- | --- |
| **Purpose** | Exception worklist: lost, damaged, barcode mismatch, recollection. Support sees **status**, not chain-of-custody internals or barcodes. |
| **Screens** | Exception queue, ops CoC (operations + lab — not support) |
| **Permissions** | `sample:read` ops; support `lab_booking:read` status only |
| **Country hooks** | `lab.sample_tracking.customer_granularity` (customer); admin CoC is fuller for ops |

**RISK:** Admin screenshot of CoC leaking into tickets. Mitigation: ticket linker stores ids only.

---

### 6.19 Reports (`M-ADM-REP`)

| | |
| --- | --- |
| **Purpose** | Release incidents, amendment notification, physical print jobs. **Default no result values** in admin except break-glass / pathologist tools (pathologist portal). |
| **Screens** | Incident, print job list |
| **Permissions** | `report:release` override audited; support no payload |
| **Country hooks** | `report.physical.enabled`, panic-value display **LEGAL REVIEW** |

---

### 6.20 Payments (`M-ADM-PAY`)

| | |
| --- | --- |
| **Purpose** | PaymentIntent search, gateway health, COD exceptions, dispute flags. No PAN. |
| **Screens** | Intent detail, recon status |
| **Permissions** | `payment:read`; refund is separate |
| **Country hooks** | `payments.methods[]`, `payments.gateways[]` |

---

### 6.21 Refunds (`M-ADM-REF`)

| | |
| --- | --- |
| **Purpose** | Dual-control refund approval above threshold; destination original vs wallet. |
| **Screens** | Queue, approve/deny, amount_minor ≤ refundable |
| **Permissions** | `payment:refund` finance; ops/support **request** |
| **Idempotency** | Required |
| **Country hooks** | `refund.destinations[]`, dual-control threshold |

Customer cannot post ledger. See J16.

---

### 6.22 Wallet (`M-ADM-WAL`)

| | |
| --- | --- |
| **Purpose** | Inspect balances/holds; manual credit **dual control**; freeze. |
| **Screens** | Customer wallet (country), credit request |
| **Permissions** | `wallet:credit` finance + second actor |
| **Country hooks** | `wallet.enabled`, max balance, KYC thresholds |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Stored-value licensing. Default pack: wallet **off**.

---

### 6.23 Ledger (`M-ADM-LED`)

| | |
| --- | --- |
| **Purpose** | Journal search, balances, recon breaks. **No line edit. No delete.** |
| **Screens** | Entry detail, period close status |
| **Permissions** | `ledger:read` |
| **Country hooks** | `ledger.legal_entity_id` |

See [Ledger](13_LEDGER_SETTLEMENT.md). Journal is immutable.

---

### 6.24 Settlements (`M-ADM-SETL`)

| | |
| --- | --- |
| **Purpose** | SettlementBatch preview → approve → execute. Dual control above threshold. |
| **Screens** | Batches by participant type, payout failures |
| **Permissions** | `settlement:execute`, `payout:approve` |
| **Country hooks** | `settlement.cycle`, `settlement.minimum_payout_minor` |

KYC incomplete → payout held, not silently skipped without visibility.

---

### 6.25 CRM (`M-ADM-CRM`)

| | |
| --- | --- |
| **Purpose** | Customer 360, segments, leads, lifecycle. Admin shell of CRM — not a SaaS clone. |
| **Screens** | 360, segments, lead queue |
| **Permissions** | `user:read` masked; `campaign:send` not implied |
| **Country hooks** | `crm.*` |

See [CRM](15_CRM_PLATFORM.md). **ASSUMPTION (A-CRM-01):** CRM is this app.

---

### 6.26 Marketing (`M-ADM-MKT`)

| | |
| --- | --- |
| **Purpose** | Campaigns, coupons, suppressions, quiet hours. |
| **Screens** | Campaign builder, coupon rules |
| **Permissions** | `campaign:send` |
| **Forbidden** | Segmenting on lab **result values** or diagnoses |
| **Country hooks** | `ads.allowed`, `coupons.clinical_services_allowed`, medicine advertising |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine advertising and unsolicited electronic communications.

---

### 6.27 Support (`M-ADM-SUP`)

| | |
| --- | --- |
| **Purpose** | Ticket handle, macros, SLA, PII reveal with reason. Order actions are **requests**. |
| **Screens** | Ticket inbox, 360 masked |
| **Permissions** | `ticket:handle` |
| **Country hooks** | `ticket.categories[]`, `ticket.sla_hours` |

State machine: [CRM](15_CRM_PLATFORM.md) §9.

---

### 6.28 Analytics (`M-ADM-ANL`)

| | |
| --- | --- |
| **Purpose** | Country BI: GMV, fill rate, Rx TAT, video join success, sample rejection rate. **No clinical payload.** |
| **Screens** | Dashboards, export jobs |
| **Permissions** | `analytics:read` |
| **Country hooks** | `analytics.retention_days` |

`analyst` role: read-only, no ticket PII reveal.

---

### 6.29 CMS (`M-ADM-CMS`)

| | |
| --- | --- |
| **Purpose** | Home modules, banners, help articles, legal document versions (terms/privacy). |
| **Screens** | Editor, publish, preview by country/locale |
| **Permissions** | `cms:write`, `cms:publish` (may split editor vs publisher — **OD-ADM-04**) |
| **Country hooks** | `home.modules[]`, `i18n.locales[]` |

Legal docs are versioned; customer acceptances store `notice_version`.

---

### 6.30 Compliance (`M-ADM-CMP`)

| | |
| --- | --- |
| **Purpose** | KYC queues, legal holds, retention jobs, country restrictions, Policy Pack **values** (not invented statutes). |
| **Screens** | See [19](19_COMPLIANCE_FRAMEWORK.md) |
| **Permissions** | `kyc:*`, `audit:read`, `hold:write` |
| **Country hooks** | entire pack |

`super_admin` edits pack schema/keys; filling **legal** values is a compliance+legal workflow, not an engineering guess.

---

### 6.31 Audit (`M-ADM-AUD`)

| | |
| --- | --- |
| **Purpose** | Search AuditLog, export for authorities **after** legal request workflow. |
| **Screens** | Query builder, export job |
| **Permissions** | `audit:read`; export may require dual control **OD-ADM-05** |
| **Country hooks** | `audit.export.legal_process` |

Payload reads of health artifacts are themselves audited ([16](16_HEALTH_RECORD.md)).

---

### 6.32 Configuration (`M-ADM-CFG`)

| | |
| --- | --- |
| **Purpose** | Country Policy Pack editor, feature flags, payment method enablement, tax **profile id**, data residency mode, service availability. |
| **Screens** | Pack JSON (structured UI, not raw dump for country_admin), diff, publish |
| **Permissions** | `policy_pack:write` super/global (limited); country_admin **limited** keys only |
| **Country hooks** | self |

**RISK:** Country admin turning on `video.recording.allowed` or clinical affiliate earn. Mitigation: sensitive keys require `super_admin` + legal checklist + dual control. See [18](18_GLOBALIZATION.md) sensitivity classes.

**OPEN DECISION (OD-ADM-06):** Policy Pack publish: git-like versioning in DB vs config repo. Recommendation: **versioned rows in Postgres** with promote-to-prod workflow; optional export to git for review.

---

## 7. Cross-cutting admin behaviors

### 7.1 Country switcher

| Actor | Behavior |
| --- | --- |
| `super_admin`, `global_admin` | Select working country; all subsequent queries add `country_id`. Cross-country comparison dashboards are **aggregates**, not row-level unions of PII. |
| `country_admin` and below | Pinned; switcher hidden |
| Mix-up | If GPS/IP suggests another country, **do not** silently switch. Confirm. |

### 7.2 Search and PII

Admin search indexes **operational** fields. Rx images, report PDFs, and consult notes are **not** in OpenSearch global admin index.

### 7.3 Impersonation and break-glass

| Mode | Who | Rules |
| --- | --- | --- |
| Customer impersonation | `super_admin` + `user:impersonate` | Time box, ticket id, reason; watermark; no wallet top-up while impersonating **ASSUMPTION (A-ADM-04)** |
| Clinical break-glass | `super_admin` (+ OD-EHR-06) | Creates audited grant purpose `break_glass`; patient notify if pack requires |

### 7.4 Idempotency and money

Admin refunds, wallet credits, settlement execute, payout retry: `Idempotency-Key` required ([12](12_PAYMENT_PLATFORM.md), [21](21_API_ARCHITECTURE.md)).

### 7.5 Soft delete vs finance/health

Admin “delete customer” is a **request** queued to compliance. Ledger lines are **never** deleted. Health artifacts follow `retention_status` ([16](16_HEALTH_RECORD.md), [20](20_DATABASE_ARCHITECTURE.md)).

---

## 8. Events (admin-relevant)

| Event | Direction |
| --- | --- |
| `kyc.updated` / `vendor.approved` / `doctor.profile.published` | consume + produce from admin actions |
| `policy_pack.published` | out — clients and API reload |
| `account.disabled` | out |
| `legal_hold.set` / `legal_hold.released` | out |
| `audit.export.requested` | out |
| `settlement.batch.updated` | in/out |
| `ticket.updated` | in |

No admin microservice. Outbox in the modular monolith.

---

## 9. Country Policy Pack keys (admin)

| Key | Use |
| --- | --- |
| `admin.dashboard.widgets[]` | Home |
| `admin.country_admin.editable_keys[]` | Configuration SoD |
| `admin.impersonation.enabled` | Default false in prod until process exists |
| `admin.dual_control.refund_minor` | Refunds |
| `admin.dual_control.payout_minor` | Settlements |
| `support.reveal_pii.reasons[]` | Support |

Sensitive keys (recording, clinical affiliate, data residency): not in `editable_keys` for country_admin.

---

## 10. Implementation notes

1. Nest modules consumed: `identity`, `iam`, `party`, `catalog`, `inventory`, `order`, `prescription` (queue counts), `care`, `diagnostics`, `logistics`, `payment`, `wallet`, `ledger`, `settlement`, `affiliate`, `crm`, `support`, `health` (metadata), `compliance`, `cms`, `analytics`.
2. Postgres + RLS `country_id`; admin roles with `platform` scope use a **bypass policy that is still audited** — **OPEN DECISION (OD-ADM-07 / OD-DB-*)** see [20](20_DATABASE_ARCHITECTURE.md).
3. UUID v7; money integer minor units; no float.
4. Do not hardcode a launch country or a single payment method.
5. Pharmacy/vendor/doctor **portals** stay separate apps; admin is oversight.

Phase sequencing: [Development Roadmap](33_DEVELOPMENT_ROADMAP.md) when present.

---

## 11. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-ADM-01 | ASSUMPTION | One Next.js admin app; one API |
| A-ADM-02 | ASSUMPTION | Dense pharmacy ERP stays in pharmacy portal |
| A-ADM-03 | ASSUMPTION | Dashboards are projections |
| A-ADM-04 | ASSUMPTION | Impersonation cannot move money |
| | RISK | Customer JWT on admin APIs |
| | RISK | Country admin enabling recording or clinical commissions |
| | RISK | Support as shadow EHR |
| | LEGAL | Licensing displays, ads, SoD, stored value, audit export process |

---

## 12. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-ADM-01 | Same person finance + operations? | Separate memberships; SoD pairs still enforced |
| OD-ADM-02 | PO/GRN in admin vs pharmacy portal | Pharmacy portal owns buying |
| OD-ADM-03 | Distinct `compliance_officer` in every country? | Yes in production |
| OD-ADM-04 | CMS editor vs publisher split | Split when dual control needed; one role OK in staging |
| OD-ADM-05 | Audit export dual control | Yes for bulk PII/clinical metadata export |
| OD-ADM-06 | Pack storage: DB versions vs git | Versioned PG rows + optional git export |
| OD-ADM-07 | How platform-scope roles bypass RLS | Explicit `SET` of session var + audit; never disable RLS globally |
| OD-ADM-08 | Admin live chat vs tickets | Tickets first (OD-CRM-08) |
| OD-ADM-09 | Whether `global_admin` may publish Policy Packs | No; `super_admin` + legal checklist |
| OD-ADM-10 | Multi-country analyst rollup grain | Aggregates only; no cross-country patient lists |
