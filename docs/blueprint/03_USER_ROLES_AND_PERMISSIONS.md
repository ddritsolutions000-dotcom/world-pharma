# 03 — User Roles and Permissions

**Status:** Blueprint  
**Related:** [Security](27_SECURITY_ARCHITECTURE.md) · [Admin ERP](17_ADMIN_ERP.md) · [API](21_API_ARCHITECTURE.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

---

## 1. Model

The platform uses **RBAC + resource-action permissions + scopes**. ABAC-style conditions (country, own-patient, consent) attach to permissions without a separate productized ABAC engine in Phase 0.

```
User (Person)
  └── Membership(s): role + organization_id? + country_id? + location_id?
        └── Role → Permission[]  (permission = resource:action)
              └── Grant constraint: scope + conditions
```

**Permission string:** `{resource}:{action}`  
Examples: `order:read`, `sample:collect`, `report:sign`, `ledger:read`.

**Scope values:**

| Scope | Meaning |
| --- | --- |
| `platform` | All countries |
| `country` | One country |
| `organization` | One org (pharmacy chain, lab, vendor) |
| `location` | One store/lab/warehouse |
| `self` | Only records tied to the user |
| `consented` | Health artifacts with a valid Consent Grant |

A request is authorized if **any** membership grants the permission on the resource **and** scope matches **and** health-data conditions pass.

---

## 2. Identity vs role

| Concept | Description |
| --- | --- |
| Person | Human; one `user_id` |
| Account | Login credentials, MFA, status |
| Role binding | Role at a scope |
| Customer profile | Commerce/care profile for the person as patient/shopper |
| Professional profile | Doctor / pharmacist / etc. metadata |

A doctor shopping for their family uses the **customer** profile. Audit actor is still the same `user_id` with the active membership context.

**RISK:** Privilege confusion if admin APIs accept customer tokens. Mitigation: audience (`aud`) per client family + explicit membership selection.

---

## 3. Role catalog

### 3.0 Company-owned vs partner-owned (mandatory)

**Platform/company management authority is exclusively company-controlled. Partner organization administration is organization-scoped and cannot escalate to platform authority.**

| Label | Meaning | Examples |
| --- | --- | --- |
| PLATFORM_ADMIN / COMPANY_ADMIN | Company-controlled platform roles | `super_admin`, `global_admin`, `company_admin`, `company_finance`, `company_compliance`, `company_security` |
| ORG_ADMIN | Partner org administration | `org_owner`, `org_admin` — one organization only |
| STAFF | Org-scoped operational staff | `org_staff`, `org_manager`, `org_operations` |
| PARTNER | Partner-type actors | doctor, vendor, lab, pharmacy, affiliate — never company admin by default |

Company roles are never created by Join, partner onboarding, or org invite. See [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md).

### 3.1 Platform / admin

| Role | Typical scope | Purpose |
| --- | --- | --- |
| `super_admin` | platform | Break-glass, policy packs, global config. Dual control for destructive ops. |
| `global_admin` | platform | Day-to-day global ops without secret/key rotation |
| `country_admin` | country | Operate one country: KYC queues, catalog, incidents |
| `finance` | country or platform | Ledger, settlements, refunds approval, recon |
| `operations` | country | Orders, logistics, lab ops, capacity |
| `support` | country | Tickets, limited order actions, PII minimization |
| `compliance_officer` | country or platform | Holds, retention, audit export |
| `analyst` | country | Read-only analytics (no clinical payload by default) |
| `cms_editor` | country | Content, banners, help |

### 3.2 Pharmacy (owned)

| Role | Scope | Purpose |
| --- | --- | --- |
| `pharmacy_owner` | organization | All stores in org |
| `pharmacy_manager` | location | Store ops, staff, local inventory |
| `pharmacist` | location | Rx verification, counselling flags, dispense |
| `pharmacy_packer` | location | Pick/pack, no Rx approve |
| `pharmacy_buyer` | organization | Purchase orders, suppliers |

### 3.3 Vendor marketplace

| Role | Scope | Purpose |
| --- | --- | --- |
| `vendor` | organization | Owner/admin of vendor org |
| `vendor_staff` | location or org | Listings, orders, inventory as granted |

### 3.4 Care

| Role | Scope | Purpose |
| --- | --- | --- |
| `doctor` | self (+ clinic org optional) | Consult, Rx, consented records |
| `clinic_admin` | organization | Rosters, fees, staff doctors |
| `medical_reviewer` | country | Optional second review queue (policy) |

### 3.5 Lab

| Role | Scope | Purpose |
| --- | --- | --- |
| `lab_owner` | organization | Lab network |
| `lab_manager` | location | Capacity, staff, QC |
| `lab_staff` | location | Accession, processing, result entry |
| `pathologist` | organization or location | Review, approve, sign |
| `phlebotomist` | self (jobs assigned) | Collection field work |

### 3.6 Logistics and growth

| Role | Scope | Purpose |
| --- | --- | --- |
| `delivery_partner` | self | Jobs, earnings |
| `fleet_dispatcher` | organization | Assignment override |
| `affiliate` | self or affiliate org | Links, commissions |
| `customer` | self | Super app |
| `clinic_owner` / hospital analog | organization | Clinic/hospital org onboarding ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)) |
| `partner_reviewer` | country | KYC/document review only (`partner_application:review`) |
| `partner_approver` | country | `partner_application:approve` — SoD vs reviewer if pack dual-control |

### 3.7 Organization staff templates (inside a partner org)

Not new Person types. Templates: `owner`, `admin`, `manager`, `staff`, `finance`, `operations`, `custom` (subset of parent). See [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §13.

---

## 4. Permission catalog (representative)

Not exhaustive; implementation uses this taxonomy. New features add permissions; they do not bypass scope.

### 4.1 Identity & party

| Permission | Who typically |
| --- | --- |
| `user:read` | support (masked), self |
| `user:impersonate` | super_admin only, audited, time-boxed |
| `kyc:review` | country_admin, operations |
| `kyc:approve` | country_admin (dual control for doctors/labs **OPEN DECISION**) |
| `partner_application:read` | applicant self; org admin; country reviewer |
| `partner_application:submit` | applicant |
| `partner_application:review` | partner_reviewer, operations, country_admin |
| `partner_application:approve` | partner_approver / country_admin (≠ submitter) |
| `partner_document:download` | reviewer with reason; never support by default |
| `partner_staff:invite` | org owner/admin |

### 4.2 Catalog & inventory

| Permission | Who |
| --- | --- |
| `catalog:read` | public/customer (published only) |
| `catalog:write` | cms, pharmacist, vendor (own), lab |
| `catalog:publish` | country_admin (marketplace listings) |
| `inventory:adjust` | pharmacy_manager, vendor_staff |
| `inventory:transfer` | pharmacy_manager, buyer |

### 4.3 Orders & Rx

| Permission | Who |
| --- | --- |
| `order:create` | customer |
| `order:read` | customer self; pharmacy location; support masked |
| `order:cancel` | customer (policy); operations; pharmacy (pre-dispatch) |
| `prescription:verify` | pharmacist |
| `prescription:reject` | pharmacist |

### 4.4 Care

| Permission | Who |
| --- | --- |
| `doctor_profile:write` | doctor self; clinic_admin limited |
| `appointment:manage` | doctor, clinic_admin, customer self |
| `encounter:write` | doctor on that encounter |
| `video:join` | participants of session |
| `recording:enable` | never by default; policy + consent |

### 4.5 Diagnostics

| Permission | Who |
| --- | --- |
| `lab_booking:create` | customer |
| `sample:collect` | assigned phlebotomist |
| `sample:accession` | lab_staff |
| `result:enter` | lab_staff |
| `report:sign` | pathologist |
| `report:release` | system after sign; lab_manager override audited |

### 4.6 Logistics

| Permission | Who |
| --- | --- |
| `job:accept` | assigned or offered partner |
| `job:track` | customer (own), dispatcher, operations |
| `job:pod` | delivery_partner |

### 4.7 Money

| Permission | Who |
| --- | --- |
| `payment:refund` | finance; system policy engine |
| `wallet:credit` | system; finance (manual, dual control) |
| `ledger:read` | finance |
| `settlement:execute` | finance + system |
| `payout:approve` | finance |

### 4.8 Health record

| Permission | Who |
| --- | --- |
| `health_artifact:read` | customer self; doctor **only with consent grant**; never support full payload by default |
| `consent:grant` | customer |
| `consent:revoke` | customer |

### 4.9 CRM / admin

| Permission | Who |
| --- | --- |
| `ticket:handle` | support |
| `campaign:send` | crm role (to be added) / country_admin |
| `audit:read` | compliance_officer, super_admin |

---

## 5. Role × capability matrix (high level)

| Role | PII | Clinical | Money write | Config |
| --- | --- | --- | --- | --- |
| customer | self | self | pay/refund request | prefs |
| doctor | consented patients | encounter | none (payout profile) | own calendar |
| pharmacist | order+Rx images | Rx only | none | none |
| phlebotomist | job identity verify | collection notes | none | none |
| pathologist | sample IDs + results | reports | none | none |
| delivery_partner | name+phone+address of job | none | COD collect | none |
| support | masked | no payload | limited cancel | none |
| finance | settlement IDs | none | refund/payout | none |
| country_admin | yes | no unless break-glass | no ledger post | country pack (limited) |
| super_admin | yes | break-glass | dual control | yes |

Clinical payload access by non-clinicians is **deny by default**.

---

## 6. Scoping rules

1. **Country isolation:** A `country_admin` of Country A cannot read Country B operational data.
2. **Organization isolation:** Vendors cannot read other vendors’ costs or stock.
3. **Location isolation:** Default for store staff; managers may be multi-location.
4. **Patient isolation:** Doctors see health artifacts only with `ConsentGrant` status `ACTIVE` and purpose matching (`treatment`, `second_opinion`, etc.).
5. **Support:** Tokenized views; reveal-PII is a separate permission with reason code.
6. **Break-glass:** `super_admin` clinical access requires reason, ticket ID, time box, and post-review.

---

## 7. Authentication by persona (product)

| Persona | Primary auth | MFA | Social login |
| --- | --- | --- | --- |
| Customer | Phone OTP and/or email OTP | Step-up for wallet/refund | Optional, country-gated **OPEN DECISION** |
| Professional (doctor, lab, pharmacy) | Email + password | **Required** | No |
| Riders / phlebotomists | Phone OTP + device bind | PIN/biometric on device | No |
| Admins | Email + password | **Required** (TOTP/WebAuthn) | No |

Details: [27_SECURITY_ARCHITECTURE.md](27_SECURITY_ARCHITECTURE.md).

---

## 8. API authorization contract

- JWT contains `sub`, `aud`, `country_id` (selected), `membership_id`, `roles[]`, `session_id`.
- Server **never** trusts role lists alone for health data; it re-loads grants and consent.
- Fine-grained checks in domain services, not only API gateway.
- Idempotent admin actions require `X-Reason` for high-risk permissions.

---

## 9. Seed roles vs custom roles

Phase 0 ships **system roles** above.  
Phase 8+ may allow org-defined custom roles as **subsets** of a parent system role (cannot exceed parent).

**OPEN DECISION:** Whether clinic_admin can create custom receptionist roles in Phase 4.

---

## 10. SoD (segregation of duties)

| Pair | Rule |
| --- | --- |
| KYC submit vs KYC approve | Cannot be same user |
| Result enter vs report sign | Pathologist independent where policy requires |
| Refund vs payout approve | Dual control above threshold |
| Catalog publish of Rx drugs | Pharmacist/country rules |
| Settlement execute vs ledger period close | finance dual control |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Local SoD for pharmacies and labs.

---

## 11. Mapping to applications

| App | Allowed roles (typical) |
| --- | --- |
| Customer mobile/web | customer |
| Join us web | partner_applicant (after register); public before |
| Pharmacy app | pharmacy_* |
| Vendor app | vendor, vendor_staff |
| Doctor app | doctor, clinic_admin (web-heavy) |
| Lab portal | lab_owner, lab_manager, lab_staff |
| Pathologist portal | pathologist |
| Phlebotomist app | phlebotomist |
| Delivery app | delivery_partner |
| Admin suite | platform/admin roles; shells hide modules by permission |

---

## 12. Open decisions

| ID | Question |
| --- | --- |
| OD-RBAC-01 | Dual control required for doctor KYC? |
| OD-RBAC-02 | Support may ever see Rx images? Default no |
| OD-RBAC-03 | Caregiver accounts (family) legal model per country |
| OD-RBAC-04 | Whether a user may be doctor and vendor concurrently in production |
