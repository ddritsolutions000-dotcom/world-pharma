# 86 — Company-owned management and admin authority

**Status:** Implemented (security/architecture amendment)  
**Does not add a product module.** This records a locked authority boundary already implied by [03](03_USER_ROLES_AND_PERMISSIONS.md), [17](17_ADMIN_ERP.md), and [27](27_SECURITY_ARCHITECTURE.md).  
**Related:** [00](00_MASTER_INDEX.md) · [04](04_APPLICATION_ARCHITECTURE.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md)

---

## Architectural rule

**Platform/company management authority is exclusively company-controlled.**  
**Partner organization administration is organization-scoped and cannot escalate to platform authority.**

Frontend hiding is not security. The same rule is enforced in JWT audience, RBAC, organization membership, resource ownership, RLS, and service-layer checks.

---

## 1. Two authority planes

| Plane | Who | Scope |
| --- | --- | --- |
| **Company / platform** | Legal entity that owns the platform | Global/country operations, policy packs, settlement, security, partner KYC review |
| **Partner / org** | Vendor, doctor, lab, pharmacy, clinic, hospital, affiliate, logistics, healthcare business | Own org, locations, and legally authorized operational records only |

### Company roles (platform-scoped memberships only)

`super_admin`, `global_admin`, `company_admin`, `company_finance`, `company_compliance`, `company_security`, `company_operations`, `company_support`

These may be labeled PLATFORM_OWNER / COMPANY_* in product copy. Codes stay explicit; there is no `if role == admin then allow everything`.

### Organization roles (organization-scoped only)

`org_owner`, `org_admin`, `org_manager`, `org_staff`, `org_finance`, `org_operations`, `clinic_doctor`, `hospital_doctor`, `independent_doctor`

Vendor A `org_admin` can manage Vendor A. They cannot manage Vendor B, cannot grant platform permissions, and cannot become `super_admin` through Join, partner onboarding, or org staff APIs.

---

## 2. How company admins are created

- Not by public Join.
- Not by partner onboarding.
- Not by org admin inviting staff.
- Only through the company-controlled `CompanyAuthorityService` (`/api/v1/admin/company-authority/*`), which requires `rbac:grant_company`.
- Granting `super_admin` / `global_admin` is dual-controlled: requester cannot approve their own request.

---

## 3. Permission split (fail-closed)

Company-only permissions include (non-exhaustive): `policy:publish`, `partner:manage`, `kyc:review`, `kyc:document_read`, `payment:admin`, `finance:approve`, `finance:settle`, `finance:admin`, `rbac:grant_company`, `security:break_glass`, `clinical:access:evaluate`, `video:manage`.

Org roles never receive those bindings. Even if a company role is mistakenly attached to an organization-scoped membership, `RbacService.permissionsForPerson` ignores it.

`company_admin` does **not** automatically receive clinical payload or KYC document permissions (`kyc:document_read`, `clinical:access:evaluate`, `consent:manage`, `video:manage`) or `finance:admin` / `finance:approve` / `finance:settle`. Those stay on dedicated company roles (`company_compliance`, `company_finance`, `super_admin` / `global_admin` as cataloged).

---

## 4. Dual control and break-glass

| Operation | Rule |
| --- | --- |
| Settlement approval / payout approval | Existing finance dual-control when enabled; creator ≠ approver |
| Country policy publish (when `dual_control` is requested) | Publisher ≠ draft creator |
| `super_admin` / `global_admin` grant | Pending grant + second company authority |
| Break-glass | `security:break_glass`, explicit reason, TTL ≤ 4 hours, not permanent, fully audited |

MFA for break-glass is **required in production** via company security policy / Country Policy Pack. This kernel stores reason, actor, target, permissions, and expiry.

---

## 5. One company admin application

There is **one** company-controlled Admin/ERP app (`apps/web-admin`). Shells (Operations, Finance, Security, Compliance, Catalog, Inventory, Warehouse, Logistics, Partners/KYC, Healthcare operations, CRM, Support, Platform configuration) are permission filters, not separate products.

Partners use their own scoped portals. They do not receive the company admin app as a privilege of org ownership.

---

## 6. Audit

Privileged grant, denial, dual-control rejection, break-glass, policy publish, and finance approvals write `security_events` (append-only). There is no ordinary-admin update/delete API for those rows.

---

## 7. Clinical and financial boundaries

Company operational visibility is still permission-scoped. Clinical notes, prescriptions, lab results, health records, video/audio, and KYC documents require the existing relationship/consent evaluators and dedicated permissions. Finance power is split: `finance:read`, `finance:post`, `finance:approve`, `finance:settle`, `finance:reconcile`, `finance:admin`.

---

**LEGAL/COMPLIANCE REVIEW REQUIRED** for country-specific employment of dual-control, break-glass, and clinical access by company staff.
