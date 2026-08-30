# 88 — Global application topology

**Status:** Foundation (topology + authorization hardening; not multinational go-live)  
**Authorization:** global application topology + company governance only  
**Does not start:** prescription, lab, samples, pathology, reports, health record, CRM, live PSP, live DHL, real payouts, production telemedicine

World Pharma is **one company-controlled ecosystem**. Applications are clients of a single identity, organization, permission, audit, policy, API, outbox, finance, and logistics kernel.

This book is the canonical application map. It does **not** claim planned apps are implemented.

**OPEN HUMAN DECISION:** which clients ship first after this topology.  
**LEGAL/COMPLIANCE REVIEW REQUIRED:** app-store listings, clinical-app claims, telemedicine licensing per country.

---

## 1. Shared kernels (mandatory)

| Kernel | Rule |
| --- | --- |
| Identity | One `Person`. No `customer_users` / `doctor_users` / `vendor_users` / `affiliate_users` |
| Organization / partner | One partner/org model; partners are scoped participants |
| Scope | Region → country → legal entity → business unit (config) → organization → location |
| Permissions | Server RBAC + membership scope. UI hiding is not authorization |
| Audit | Durable security events; no secrets/PHI |
| Policy packs | Fail-closed country/region/legal-entity packs |
| API | One modular NestJS API |
| Events | One outbox + BullMQ. No Kafka. No per-app bus |
| Finance | One ledger kernel; partners see only own operational money |
| Logistics | One job/shipment kernel |
| UI | `@world-pharma/ui-kit` tokens, type, spacing, a11y, theme |

JWT audiences currently issued: `customer` | `partner_applicant` | `admin` | `doctor`.  
Vendor/store/lab/logistics/affiliate **clients** use the `customer` audience plus **organization membership**. A dedicated `partner` audience is **not** invented in this task.

---

## 2. Mobile apps

| Canonical path | Current repo path | User | Audience | Authz scope | Boundary | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/mobile` | `apps/mobile` | Customer | `customer` | self / country cart-order-appointment | customer | **FOUNDATION** |
| `apps/mobile-store` | — | Store staff | `customer` + org/location | org + location; never global finance | partner | **PLANNED** |
| `apps/mobile-delivery` | — | Rider | `customer` | assigned jobs only | partner | **PLANNED** |
| `apps/mobile-doctor` | `apps/mobile-doctor` | Doctor | `doctor` | doctor + relationship + consent + policy | partner | **FOUNDATION** |
| `apps/mobile-lab` | — | Lab staff | `customer` + lab org | assigned lab workflow | partner | **PLANNED** |
| `apps/mobile-phlebotomist` | — | Phlebotomist | `customer` | assigned collection jobs | partner | **PLANNED** |

Affiliate mobile: **DEFERRED**. Affiliate is web-first.  
Generic “Partner App”: **forbidden**. Do not create.

Code registry: `apps/api/src/identity/app-topology.ts`.

---

## 3. Web apps

| Canonical path | Current repo path | User | Audience | Authz scope | Boundary | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/web-customer` | `apps/web-customer` | Customer | `customer` | self / country | customer | **FOUNDATION** |
| `apps/web-store` | — | Store staff | `customer` + location | org + location | partner | **PLANNED** |
| `apps/web-vendor` | — | Vendor operators | `customer` + seller org | own seller org | partner | **PLANNED** (vendor **APIs** exist) |
| `apps/web-doctor` | `apps/web-doctor` | Doctor | `doctor` | doctor + consent + policy | partner | **FOUNDATION** |
| `apps/web-lab` | — | Lab operators | `customer` + lab org | own lab | partner | **PLANNED** |
| `apps/web-pathologist` | — | Pathologist | `customer` | assigned cases | partner | **PLANNED** |
| `apps/web-logistics` | — | Ops / delivery org | `admin` or org | company logistics **or** delivery org | company/partner | **PLANNED** (admin logistics shell exists) |
| `apps/web-affiliate` | — | Affiliate | `customer` | own affiliate org / own earnings | partner | **PLANNED** (`me/affiliate` API **FOUNDATION**) |
| `apps/web-admin` | `apps/web-admin` | Company staff | `admin` | company hierarchy + named permissions | company | **FOUNDATION** |
| `apps/web-join` | — | Applicants | `partner_applicant` | own application only | onboarding | **PLANNED** |

`apps/ds-web` is the design-system playground, not a product app.

**IMPLEMENTED:** none of the experience apps are production-complete. Do not treat FOUNDATION as go-live.

---

## 4. Application → authorization

| App family | Allowed JWT | Server enforcement |
| --- | --- | --- |
| Customer web/mobile, cart, `me/orders`, `me/affiliate` | `customer` | `AudienceGuard` + person-scoped data |
| Vendor APIs | `customer` or `partner_applicant` | org membership on `seller_org_id`; doctor JWT denied |
| Doctor appointments / clinical doctor workspace | `doctor` (onboarding still allows customer on `POST /doctor/applications`) | relationship + consent + policy |
| Admin / ERP | `admin`, or company membership fallback on legacy customer JWT | company permissions; partners never receive company-only perms |
| Join | `partner_applicant` | own application |

Frontend nav hiding is not sufficient. `AudienceGuard` + `PermissionsGuard` + membership scope run on the API.

---

## 5. Shared API and events

One API. Domain modules remain: identity, partner, catalog, inventory, cart, payment, order, logistics, finance, doctor, appointments.

Outbox envelope already carries `eventId` / `type` (event type), `correlationId`, `countryId`, `regionId`, `legalEntityId`, `organizationId`, `occurred` timestamps. Payloads are stripped of tokens/secrets/clinical content. **No Kafka.** No second bus.

---

## 6. Shared design system

All apps use `@world-pharma/ui-kit` tokens, typography, spacing, components, and theme. Clinical apps may differ in information architecture only. Competing per-app design systems are forbidden.

---

## 7. Data ownership (isolation)

| From | Must not reach |
| --- | --- |
| customer | vendor ops, admin, other customers’ carts |
| vendor A | vendor B, admin finance, doctor clinical panel |
| doctor | vendor catalog, other doctors’ panels, unrelated patients |
| affiliate | company finance admin, other affiliates |
| delivery | clinical reports |
| phlebotomist | unrelated patients |
| store | global finance |
| lab | other labs; doctor records without relationship/consent |
| pathologist | unrelated cases |

Proven now (API tests): customer/vendor/affiliate ↛ admin finance; doctor JWT ↛ vendor catalog; vendor ↛ doctor/me; vendor A ↛ vendor B settlements/offers; country `company_operations` ↛ finance dashboard; platform `super_admin` can read finance dashboard.

---

## 8. Gaps (honest)

- Planned clients are not shipped. No empty production shells were added.
- No `partner` JWT audience yet; vendor/store/lab/affiliate use `customer` + membership.
- `BusinessUnit` exists; memberships are not bound to it.
- Affiliate earnings listing is person-scoped to the caller’s orders, not a finished affiliate-org ledger UI.
- Lab, pathology, Rx, CRM, live PSP/DHL/payouts are unauthorized and unbuilt.
- Care navigation / clinical triage / specialist matching: **PLANNED slots** ([92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md)); not diagnosis.
- Radiology/imaging: **PLANNED bounded context**, not pathology.
- CMS/support/marketing/analytics warehouse: **PLANNED expansions** of existing kernels, not new apps.
- Radiologist client: **PLANNED** web later (**OD-RAD-01**); not a generic Partner App.

**This documentation plus guards does not make the platform multinational-ready for production.**

---

## 9. Completeness confirmation (CR-ECO-92)

Canonical **mobile:** Customer, Store, Delivery, Doctor, Lab staff, Phlebotomist.  
Canonical **web:** Customer, Store, Vendor, Doctor, Lab, Pathologist, Logistics/Ops, Affiliate, Admin/ERP, Partner Join.

Affiliate = **web only**. Vendor = **web only**. No generic Partner App. Full kernel slot list: [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md). **No implementation in CR-ECO-92.**
