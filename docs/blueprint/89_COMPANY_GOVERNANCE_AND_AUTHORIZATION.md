# 89 — Company governance and authorization

**Status:** Foundation (hierarchy + server enforcement; not a finished ERP)  
**Authorization:** topology + governance hardening only  
**Does not start:** Rx, lab, CRM, live PSP, live DHL, real payouts, production telemedicine

Company management belongs to the **company**. Partners receive only the operational permissions required for their role. Partners never receive unrestricted company-level administration.

**OPEN HUMAN DECISION:** legal entity names, MoR, tax registrations, regional operating model.  
**LEGAL/COMPLIANCE REVIEW REQUIRED:** employment authority, clinical licensing, finance approvals, break-glass.

---

## 1. Company control plane

```
Global Company
  → Region
    → Country
      → Legal Entity
        → Business Unit          (configuration table; not a membership scope yet)
          → Organization
            → Location
```

| Level | Who | Scope | Typical roles (existing codes) |
| --- | --- | --- | --- |
| Global company | Company staff | `platform` | `super_admin`, `global_admin`, `company_admin` |
| Regional operations | Company staff | `region` | `company_operations` (+ region membership) |
| Country operations | Company staff | `country` | `company_operations` (+ country membership) |
| Legal entity finance | Company staff | `legal_entity` | `company_finance` |
| Business unit manager | Company staff | *not bound yet* | planned; do not invent a parallel IAM |
| Organization admin | Partner or owned-org staff | `organization` | `org_owner`, `org_admin` |
| Location operator | Partner or owned-org staff | `location` | `org_staff` / store operator (planned client) |

Code: `companyGovernanceLevel()` in `apps/api/src/identity/authority.ts`.  
MNC scope asserts: country, region, legal entity, organization (`scope.ts`).

Admin/ERP (`apps/web-admin`) is the company control plane. Navigation now includes Identity, Organizations, Countries, Regions, Legal entities, Business units, Audit as **architecture placeholders** gated by company permissions. Those pages are not product modules.

**CR-ECO-92 (PLANNED, not built):** workforce, maker-checker approvals, feature flags, data-residency operations, BC/DR runbooks, CMS/support/analytics shells remain **company-controlled**. Partners never receive unrestricted company administration. See [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md).

---

## 2. Admin / ERP capability map (architecture only)

Admin must **eventually** manage: identity, organizations, countries, regions, legal entities, business units, catalog, inventory, warehouses, orders, payments, logistics, finance, doctors, labs, compliance, CRM, partners, affiliates, audit, configuration.

**Built now:** catalog/inventory/orders/payments/logistics/finance/doctors/appointments shells that already existed, plus governance nav placeholders.

**Not built now:** CRM, labs, Rx, live PSP, live DHL, payouts, full identity admin UX.

---

## 3. Partner boundary

| Participant | May | Must not |
| --- | --- | --- |
| Vendor | own catalog, inventory, orders, shipments, own settlements | other vendors; company finance/admin |
| Store | assigned location operations | global finance; other stores |
| Doctor | own panel + consenting relationships | other doctors; vendor catalog; company admin |
| Lab | own lab workflow | other labs; doctor records without relationship/consent |
| Pathologist | assigned cases | unrelated cases |
| Delivery partner | assigned jobs | clinical reports; company admin |
| Affiliate | own attribution/earnings | other affiliates; company finance admin |

Join/org-admin cannot grant `COMPANY_ROLE_CODES`. Dual control remains for `super_admin` / `global_admin`. Break-glass is time-bounded and audited.

---

## 4. Shared identity

One Person. Applications differ by JWT audience and membership, not by separate user tables.

Issuance:

- `admin` only if the person already has a company role at verify time
- `doctor` may be requested for the doctor workspace (clinical authorization still requires profile/membership/consent)
- `partner_applicant` for join
- default `customer` for customer, vendor, store, affiliate, delivery clients

---

## 5. Company-sensitive audit

Durable `SecurityEvent` types already include permission/role/org/policy/finance-adjacent and clinical-access events, plus:

- `COMPANY_MEMBERSHIP_GRANTED`
- `PRIVILEGE_GRANT_REQUESTED`
- `PRIVILEGE_ESCALATION_DENIED`
- `DUAL_CONTROL_REJECTED`
- `BREAK_GLASS_OPENED`
- `APP_AUDIENCE_DENIED` (this task)

Never log secrets, OTP, PAN, tokens, or clinical payload.

---

## 6. Configuration / policy

Country packs, region, legal entity, organization, feature flags, and capabilities stay in policy/configuration layers. Runtime product code must not `if (country == IN)`, `if (currency == INR)`, or `if (carrier == DHL)` except inside an explicitly scoped adapter.

---

## 7. Proof (tests)

- Platform company admin can read global finance dashboard
- Country `company_operations` cannot
- Vendor/doctor/lab/affiliate cannot grant company admin or hit admin finance
- Vendor A cannot read vendor B settlements or offers
- Doctor JWT cannot call vendor catalog
- Customer JWT cannot call doctor appointments
- Audience denials write `APP_AUDIENCE_DENIED`

---

## 8. Remaining gaps

- Business unit is not a membership scope
- Regional/country operator UX is membership-scoped API, not a finished admin console
- No claim of multinational production readiness from this book
