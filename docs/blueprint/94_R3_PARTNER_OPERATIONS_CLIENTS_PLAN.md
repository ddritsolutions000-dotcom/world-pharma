# 94 — R3 Partner operations clients (plan only)

**Status:** Implementation **plan**. Not a coding authorization.  
**Change ID:** **CR-R3-94**  
**Wave:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) **R3**  
**Date:** 27 August 2026  

**Does not implement:** production code, migrations, APIs, UI, live PSP, live DHL, real payouts, telemedicine, LiveKit, prescription, pharmacy clinical dispensing, lab, pathology, radiology, care navigation, diagnosis, auto-Rx, or production healthcare.

R3 is the **first partner-facing operations layer** on kernels that already exist (R0–R2). It does not add a second identity, ledger, notification engine, CMS, or support product.

**LEGAL/COMPLIANCE REVIEW REQUIRED** for KYC document *lists*, pharmacy staff seeing order PII, rider contact with customers, and Join public enablement. Do not invent document types or medical/tax law.  
**OPEN HUMAN DECISIONS:** see §12.

---

## 0. Change control

| Field | Value |
| --- | --- |
| Problem | R1 jobs and inventory exist as APIs; Store, Delivery, and Join **clients** are missing ([88](88_GLOBAL_APPLICATION_TOPOLOGY.md)). |
| Decision | **ACCEPT plan.** Coding requires a **later explicit authorization**. |
| Architecture | Modular monolith; clients in `apps/web-store`, `apps/mobile-store`, `apps/mobile-delivery`, `apps/web-join`. |
| Identity | One Person. Store/Delivery: `customer` JWT + org/location membership (same as vendor APIs today). Join: `partner_applicant`. Company review: `admin`. Optional dedicated `partner_ops` audience = **OD-R3-AUD** (not required to start). |
| Isolation | Organization + location RLS. Company roles never granted via Join. |

**Out of R3 (explicit):** R4–R16 items in [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md). Vendor **web marketplace console** is **R6**, not R3 (Join may *apply* as VENDOR). Affiliate ops console is **R6/R12**; Join may *apply* as AFFILIATE.

---

## 1. Current kernels to reuse (do not rebuild)

| Kernel | Evidence | R3 use |
| --- | --- | --- |
| Identity / Person / Account | R0 | Login, OTP, sessions |
| Partner + `PartnerApplication` | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md), R0 | Join + KYC |
| Org / Location / Membership | R0, [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) | Store/rider scope |
| Catalog + InventoryLot + GoodsReceipt | R1B | Store stock |
| Order + fulfillment | R1E | Store queue |
| Shipment, DeliveryAttempt, ProofOfDelivery, LogisticsJob (`MEDICINE_DELIVERY`) | R1F | Rider jobs; mock carrier |
| Notifications | [23](23_NOTIFICATION_ARCHITECTURE.md) | Templates; no second bus |
| Support slot | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) | **Entry points only** to one helpdesk; no new support engine |
| UI kit | [26](26_DESIGN_SYSTEM_SPEC.md) | Tokens, a11y, theme |

MNC path on every write: Company → Region → Country → Legal Entity → Business Unit (if bound) → Organization → Location.

---

## 2. Application topology (R3)

| App | Path | Users | Status after R3* |
| --- | --- | --- | --- |
| Store Web | `apps/web-store` | Pharmacy/store staff | FOUNDATION (if built) |
| Store Mobile | `apps/mobile-store` | Floor staff | FOUNDATION |
| Delivery Mobile | `apps/mobile-delivery` | Riders | FOUNDATION |
| Partner Join Web | `apps/web-join` | Applicants | FOUNDATION |
| Customer M/W | existing | Deepen: Join CTA, order tracking already R1 | FOUNDATION+ |
| Admin/ERP | `apps/web-admin` | Company reviewers | FOUNDATION+ |
| Doctor M/W | existing | **No R3 feature work** | unchanged |

\*Status only after a **future coding** task. This plan does not ship apps.

**Do not create:** generic Partner App; Affiliate mobile; Vendor mobile; country-forked apps.

---

## 3. Store Web + Store Mobile

### 3.1 Purpose
Scoped **organization + location** operations for **owned or partner pharmacy/store**. Not company ERP. Not vendor marketplace HQ (R6). Not clinical dispensing of new Rx artifacts (R5).

### 3.2 Identity and access
- Person login; membership `PHARMACY` (or pack-equivalent store org) + **location** scope.
- JWT: `customer` (or `partner_ops` if OD-R3-AUD). Never `admin`.
- Permissions (illustrative): `inventory:read|adjust|receive`, `order:fulfill`, `shipment:handoff`, `return:receive`. **No** `finance:company`, `rbac:grant_company`, `policy:publish`.
- Multi-location users: **location switcher**; default last location; all queries include `location_id` server-side.

### 3.3 Navigation

| Mobile | Web |
| --- | --- |
| Queue · Pick · Inventory · More (returns, support, profile) | Dashboard · Orders · Inventory · GRN · Shipments · Returns · Team (org_admin) · Support |

Location chip always visible. Pack-disabled modules hidden.

### 3.4 Major screens (all: loading / empty / error / 403)

| Screen | Notes |
| --- | --- |
| Sign-in / session expired | Same OTP kernel |
| Location select | If >1 location |
| Dashboard | Queue counts, expiring lots (count only), SLA breaches — no company P&L |
| Order queue | Assigned to this location; filters: new / picking / packed / exception |
| Order detail | Lines, lots to pick, customer **minimum** (name/phone last-4 or masked per pack) |
| Pick / pack | Scan; FEFO; short-pick exception |
| Ready to ship | Handoff to logistics job; mock carrier status |
| Inventory list | On-hand by SKU/lot; expiry windows |
| Lot detail | Batch, expiry, quarantine |
| GRN | Draft → received (existing GoodsReceipt) |
| Adjustment | Reason codes; dual control if pack `inventory.adjust.maker_checker` |
| Reservations | Read of allocations for open orders |
| Returns / exceptions | RTO receive at store if job type says; no refund capture (R14) |
| Performance | Location fill-rate, pick time — **not** group finance |
| Notifications inbox | Kernel inbox |
| Support | Deep link ticket `category=store_ops`, `order_id` / `lot_id` |
| Audit view | Own actions if permitted; not company-wide audit export |

### 3.5 Data domains
InventoryLot, GoodsReceipt, Order, Fulfillment, Shipment (seller org + location), Membership. **No** Encounter, Rx image (R5), lab results.

### 3.6 APIs (expected — additive facades, not new servers)
Prefer `/api/v1/store/...` as **aliases** of existing vendor/inventory + orders scoped to **location**, or extend vendor routes with `location_id` + permission. Do not create a second inventory service.

Likely **additive** DTOs: location-scoped queue, pack complete, handoff. Existing: `vendor/inventory`, `vendor/orders`, `vendor/shipments`.

### 3.7 DB
Mostly **no new aggregates**. Possible additive: `StoreStaffPreference` (last location), audit metadata. Maker-checker: reuse privilege-grant pattern or pack-flagged adjustment approval table **only if** dual control is in-scope for R3 (default: reason-coded adjust + audit; dual control **OD-R3-SOH**).

---

## 4. Delivery / Rider mobile

### 4.1 Purpose
Assigned **MEDICINE_DELIVERY** (and later job types **not** in R3: sample, report) field work. Mock carrier. No clinical payload.

### 4.2 Identity
- Person + Partner `DELIVERY_PARTNER` (or fleet org staff).
- JWT: `customer` + membership. Never admin, never doctor.
- Rider sees **assigned** `LogisticsJob` only (`assigneeId` = person or via org dispatch).

### 4.3 Minimum necessary customer data
Allowed (pack): drop-off **area**, unit/building as needed for delivery, **masked** phone, OTP challenge, parcel constraints (cold chain flag **boolean**, not Rx).  
Forbidden: full order line clinical names if pack `logistics.mask_sku`; health records; other addresses; wallet; other jobs.

### 4.4 Screens
Onboarding status (KYC from Join) · Go online/offline · Job list · Job detail · Navigate (OS maps **handoff**, **OD-UX-05**) · Arrive · Pickup confirm · OTP/POD · Delivered · Failed (reason codes) · RTO start · Earnings **placeholder** (no real payout) · Support (`category=delivery`) · Incident (photo + geo, no PHI) · Profile/sessions.

### 4.5 State (reuse R1F)
Shipment + DeliveryAttempt + ProofOfDelivery + LogisticsJob + LogisticsJobEvent. RTO via ReturnShipment / existing return model — **no live carrier**.

### 4.6 APIs
`/api/v1/delivery/jobs`, `.../accept`, `.../arrive`, `.../pod`, `.../fail`. Server enforces assignee. Availability: additive `RiderPresence` (person_id, org_id, online, geo **coarse**).

### 4.7 Earnings
**Placeholder UI** on sandbox contribution facts if any; **R14** for real payout. Copy: “Not a bank balance.”

---

## 5. Partner Join web (`apps/web-join`)

### 5.1 Purpose
Public + authenticated **onboarding only**. Not an operations console. After ACTIVE, deep-link to the **type app** (store, doctor, vendor web, etc.).

### 5.2 Types (pack-enabled subset of [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md))

| UI label | Catalog code | Org? | After ACTIVE |
| --- | --- | --- | --- |
| Vendor | `VENDOR` | Yes | Vendor web (R6) |
| Store / Pharmacy | `PHARMACY` | Yes | Store apps (R3) |
| Doctor | `DOCTOR` | Optional | Doctor apps (exists) |
| Lab | `LAB` | Yes | Lab web (R7) |
| Pathologist | `PATHOLOGIST` | Lab link | Pathologist web (R7) |
| Phlebotomist | `PHLEBOTOMIST` | Optional | Phlebotomist (R7) |
| Delivery partner | `DELIVERY_PARTNER` | Optional fleet | Delivery (R3) |
| Affiliate | `AFFILIATE` | Optional | Affiliate web (R12) |
| Clinic | `CLINIC` | Yes | Clinic admin later |
| Hospital | `HOSPITAL` | Yes | **OD-PTR-04** |
| Healthcare business | `HEALTHCARE_BUSINESS` | Yes | Pack widgets |

Unavailable types: not listed. **No invented KYC documents** — pack `document_types[]` codes/labels only.

### 5.3 Flow (reuse Person → Partner → Application)
Landing (public) → country → type → register/link Person (`partner_applicant`) → profile → documents → consents/terms versions → submit → status (`DRAFT`…`UNDER_REVIEW` → `APPROVED`/`REJECTED`/`RESUBMIT`) → activation gate (membership created by **company** workflow, not self-grant).

Public join remains **dark** until pack `join.public = true` ([38](38_PHASE_0_DECISION_BOARD.md)).

### 5.4 Screens
Type/country, wizard steps, document upload (object-store refs, not DB blobs), status tracker, rejection reasons (safe codes), resubmit, support (`category=onboarding`), session.

### 5.5 APIs
Existing/extend: public partner-types, application CRUD, document upload, status. **Company** review stays `/admin/partners` ([partner admin controller](apps/api/src/partner/admin.controller.ts)).

---

## 6. Company Admin deepening (R3)

Admin remains **one** `apps/web-admin` with permission shells.

| Queue | Permission (illustrative) | Dual control |
| --- | --- | --- |
| Partner applications | `partner:review` | Optional second reviewer for `HOSPITAL` / pack |
| KYC document view | `kyc:document_read` (already company-only) | View audited |
| Approve → membership | `partner:activate` + **cannot** assign `COMPANY_ROLE_CODES` | Maker-checker **OD-R3-MC** for activate |
| Scope stamp | country, region, legal entity, BU, org | Required on activate |
| Audit | `identity:audit_read` | Immutable |

Screens: application list/filters, application detail, document viewer (watermark, no download unless permitted), reject with reason codes, activate with org/location, **never** company role picker for partners.

---

## 7. Customer deepening (R3 only)

- Footer / account **Join us** → Join web (if pack public).
- Order tracking already R1; ensure store pack/ship and rider POD statuses **surface** on existing tracking (no new customer app).
- No care-nav, Rx, lab.

---

## 8. UX / UI kit

Reuse `@world-pharma/ui-kit` (or current package name) only. Light default; dark if tokens exist (**OD-UX-06**). WCAG 2.2 AA targets [26](26_DESIGN_SYSTEM_SPEC.md). i18n keys; locale from profile + pack. RTL if pack.

Every screen: skeleton, empty, error+retry, permission denied, offline banner (field: queue POD with idempotency; **no offline pay**).

Notifications: in-app inbox + OS push if token registered; **no PHI in body**. Support: one “Get help” → centralized support (stub queue OK if helpdesk product is R11).

---

## 9. Security

| Control | R3 rule |
| --- | --- |
| JWT | Join `partner_applicant`; store/rider `customer`+membership; admin `admin` |
| RBAC | Org roles only for partners; company catalog [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md) |
| RLS | `organization_id` / `location_id` / `assignee_id` on queries |
| Isolation tests | Store A ↛ store B; rider ↛ unassigned job; applicant ↛ admin |
| Redaction | Rider payload; logs; events ([22](22_EVENT_ARCHITECTURE.md) strip) |
| Sessions | Refresh rotation; mobile device bind; logout-all; step-up for KYC submit |
| Break-glass | Company only; not in store/rider apps |

Audit events: login, location switch, inventory adjust, pack complete, POD, KYC submit/view, approve/reject, membership activate.

---

## 10. Support (one system)

Do not build Zendesk-per-app. R3 adds **entry + category + resource id** into the reserved support kernel (R11 may flesh the desk). Categories: `store_ops`, `delivery`, `onboarding`.

---

## 11. Test plan (when coding is authorized)

| ID | Proof |
| --- | --- |
| T-ORG | Store org A cannot list org B inventory/orders |
| T-LOC | Location 1 staff cannot pack location 2 |
| T-CO | Partner token cannot hit `/admin/*` company finance/RBAC |
| T-RID | Unassigned job 404/403; payload has no health record |
| T-INV | GRN/adjust only with inventory perms; audit row |
| T-JOIN | State machine; cannot self-activate; pack hides type |
| T-KYC | Document bytes not in JSON/events |
| T-AUD | Approve/reject/POD/adjust emit security events |
| T-SES | Stolen rider refresh reuse detected |
| T-PACK | `join.public=false` → public landing 404/disabled |
| T-REG | R0–R2 suites still pass (identity, catalog, cart, pay sandbox, order, logistics mock, ledger mock, doctor, appointments, company authority, MNC scope) |

No live PSP/DHL tests.

---

## 12. Human decisions (do not close here)

| ID | Question |
| --- | --- |
| **OD-R3-AUD** | New JWT audience `partner_ops` vs continue `customer`+membership |
| **OD-R3-SOH** | Inventory adjust maker-checker in R3 vs audit-only |
| **OD-R3-MC** | Dual control on partner activate |
| **OD-PTR-01** | Join mobile listing vs web-only (recommend web-only) |
| **OD-PTR-04** | HOSPITAL vs CLINIC |
| **OD-UX-05** | In-app map vs OS handoff for riders |
| Join public | Still pack `join.public` (Phase 0 default false) |
| KYC document lists | Legal per country — empty until reviewed |

---

## 13. Compliance gates

- Public Join enablement per country.
- KYC document taxonomy filled by legal, not engineers.
- Rider–customer contact and data minimization.
- Store staff PII on orders.
- Pharmacy **clinical** Rx still **R5** — R3 must not open Rx image by default.

---

## 14. Expected change surface (when authorized later)

| Layer | Expected |
| --- | --- |
| DB | Additive: rider presence; maybe store prefs / adjustment-approval. **No** new user tables. **No** migrate reset. |
| API | Store/delivery facades; Join public+applicant; admin review already exists — extend activate/scope stamp |
| UI | Four new app shells + admin queues + customer Join link |
| Events | Existing logistics/inventory/partner events; new `RIDER_PRESENCE` / `STORE_PACKED` if not present |
| Flags | Pack keys for join types, mask_sku, adjust dual control |

---

## 15. What R3 will implement (after a future coding auth)

Store web+mobile on location-scoped inventory/orders/shipments; Delivery mobile on assigned MEDICINE_DELIVERY jobs with POD/RTO; Join web for pack-enabled partner types; Admin review/activate without company-role grant; Customer Join CTA + tracking status continuity.

**Apps affected:** web-store, mobile-store, mobile-delivery, web-join, web-admin, web-customer/mobile (links only). Doctor unchanged.

**Dependencies:** R0–R1 kernels; R2 not required except not breaking it. Mock logistics remain.

**Out of scope:** live PSP/DHL/payouts; video/LiveKit; Rx dispensing; lab/pathology/radiology; care-nav; vendor/affiliate **ops** consoles; generic Partner App.

---

## 16. Confirmation

This task is **plan documentation only**. Index updated. **STOP.**
