# 36 — Partner Onboarding Ecosystem

**Status:** Blueprint (canonical for all supply-side join flows)  
**Audience:** Product, architecture, identity, compliance, operations, partner apps  
**Requirement IDs:** REQ-PTR-001 … REQ-PTR-009  
**Related:** [Index](00_MASTER_INDEX.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Apps](04_APPLICATION_ARCHITECTURE.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [Admin](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Events](22_EVENT_ARCHITECTURE.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md)

This document is the **single Partner Onboarding Engine**. Type-specific books (07–11, 14) own **operating** workflows after `ACTIVE`. They must not invent a second registration/KYC product.

**Do not invent country document lists, licenses, or professional titles.** Required fields and documents come from the **Country Policy Pack** (`partner_types.{code}.*`).

---

## 1. Problem this engine solves

Without a central engine, each partner type grows its own signup, KYC queue, and admin queue. That forks identity, duplicates fraud controls, and makes a new partner type (clinic, hospital, future types) a rewrite.

The platform therefore has one **Join us / Become a partner** ecosystem:

```
Join discovery
  → Account (same Person as customer, different Membership)
  → Partner + PartnerType
  → PartnerApplication (this state machine)
  → Profile + documents (pack-driven)
  → KycCase (subprocess, [19](19_COMPLIANCE_FRAMEWORK.md))
  → Verification + approval
  → Organization / Location (when the type is an org)
  → Membership + Role
  → Type-specific dashboard (gated until ACTIVE)
```

---

## 2. Canonical model (do not duplicate)

| Term | Meaning | Not |
| --- | --- | --- |
| **Person** | Human; one `person_id` | A second login per app |
| **Account** | Credentials, MFA, devices | Partner-specific password store |
| **CustomerProfile** | Demand-side (shopper/patient) | Partner |
| **Partner** | Supply-side participation of a Person in a **country + PartnerType** (and optional Organization) | A separate user table |
| **PartnerType** | Catalog row (`DOCTOR`, `VENDOR`, …) plus pack overlay | Hardcoded if/else products |
| **PartnerApplication** | One onboarding case (this machine) | Per-type KYC micro-apps |
| **KycCase** | Identity/business/professional **document verification subprocess** | The whole onboarding machine |
| **Organization** | Legal/operating entity | A Person |
| **Location** | Branch, store, lab site, warehouse, clinic site | Organization |
| **Membership** | Person + Role + scope (org/location/self/country) | PartnerType |
| **Staff member** | Person with Membership on an Organization | A PartnerType by itself |

### 2.1 Examples

**Independent doctor**

```
Person → Account
      → Partner (type=DOCTOR, country=C)
      → PartnerApplication
      → DoctorProfile (type-specific)
      → Membership role=doctor scope=self
```

**Pharmacy business (marketplace or owned ops)**

```
Owner Person → Partner (type=PHARMACY)
            → Organization (type=PHARMACY)
            → Location[] (branches)
            → Membership owner
            → Staff via PartnerInvitation → Membership (pharmacist, packer, …)
```

**Lab network**

```
Organization (LAB)
  → Location[]
  → Membership: lab_owner, lab_manager, lab_staff
  → invited Pathologist Partners
  → invited Phlebotomist Partners (employed or networked)
```

**Same human, two hats**

A Person may be a customer **and** a doctor. **OPEN DECISION OD-RBAC-04** whether the same Person may be `ACTIVE` as `DOCTOR` and `VENDOR` in production. Data model **allows** multiple `Partner` rows; policy pack / ops policy may forbid combinations.

---

## 3. Partner types (catalog, extensible)

Stored in `partner_types` (platform catalog) + enabled per country pack.

| Code | Typical subject | Org required? | Primary app after ACTIVE |
| --- | --- | --- | --- |
| `DOCTOR` | Person | Optional clinic | APP-DOC |
| `PHARMACY` | Organization | **Yes** | APP-PHARM |
| `VENDOR` | Organization | **Yes** | APP-VEND |
| `LAB` | Organization | **Yes** | APP-LAB-W |
| `DELIVERY_PARTNER` | Person (or fleet org) | Optional fleet | APP-DEL |
| `PHLEBOTOMIST` | Person | Optional lab/org | APP-PHE |
| `PATHOLOGIST` | Person | Lab association required to **sign** | APP-PATH |
| `CLINIC` | Organization | **Yes** | Partner web (clinic admin) |
| `HOSPITAL` | Organization | **Yes** | Partner web (hospital admin) |
| `AFFILIATE` | Person or org | Optional | Partner web / APP-CUS referral tools |
| `HEALTHCARE_BUSINESS` | Organization | **Yes** | Partner web (generic) |
| *(future)* | Pack + catalog row | Pack | Same engine |

**Adding a type** = catalog row + pack keys + type-specific profile table/JSON schema + dashboard widgets. **Not** a new identity system.

**ASSUMPTION (A-PTR-01):** Owned (first-party) pharmacies also use this engine with `application_source = INTERNAL` so KYC/audit is not a side door.

**OPEN DECISION (OD-PTR-04):** Whether `HOSPITAL` is a distinct type in v1 or a `CLINIC` subtype. Recommendation: **separate type codes**, shared org onboarding template, pack enables each independently.

---

## 4. Surfaces (Join ecosystem)

| ID | Surface | Who | Notes |
| --- | --- | --- | --- |
| **APP-JOIN-W** | Public **Join us / Become a partner** web | Anonymous → applicant | SEO, type picker, country, application wizard |
| APP-JOIN-M | Optional RN entry | Applicant | Deep link from customer app “Sell / Practise with us”; **OPEN DECISION OD-PTR-01** whether a separate store listing. Recommendation: **web-first Join**; mobile uses WebView or customer-app entry until volume justifies a listing |
| Type apps | Doctor, vendor, pharmacy, lab, pathologist, phlebotomist, delivery | After `APPROVED`/`ACTIVE` | Resume incomplete applications in-app |
| APP-ADM | Partner applications, KYC, approval | `country_admin`, `operations`, `compliance_officer` | Single queue, filterable by type |

Customers see a **Join us** footer/link on APP-CUS-W (and optional in-app). That link does not grant partner permissions.

---

## 5. Partner discovery (Join us)

Public, pack-driven. No partner JWT required.

### 5.1 Screens / steps

1. **Join us landing** — value props by type; hide types the pack sets `enabled: false`.
2. **Become a partner** — CTA; country from geo hint **or** explicit selector (never silent country swap).
3. **Partner type selection** — only types with `partner_types.{code}.join.public = true`.
4. **Country** — ISO country of **operation**, not citizenship. Bound to application; changing country starts a **new** application (documents are country-scoped).
5. **Region / city** — pack address schema; used for serviceability preview (delivery zones, lab catchment, pharmacy coverage). Not a license grant.
6. **Service availability** — read-only: which services that type may offer in that country (teleconsult, home collection, marketplace, COD, wallet payout, …) from pack. If the type is off, CTA is disabled with “Not available in this country”.

### 5.2 APIs (logical)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/public/partner-types?country_id=` | Public |
| GET | `/api/v1/public/partner-types/{code}/requirements?country_id=` | Public (field/document **codes and labels**, not internal reviewer SOPs) |
| GET | `/api/v1/public/geo/countries` | Public (joinable countries only) |

Do not return unpublished pack legalese or reviewer checklists.

---

## 6. Partner registration (account)

Uses **identity kernel** ([05](05_CUSTOMER_PLATFORM.md) auth, [27](27_SECURITY_ARCHITECTURE.md)). `aud` after login for join = `partner_applicant` until an ACTIVE membership exists.

| Step | Rule |
| --- | --- |
| Email | Required for org types and professionals (pack) |
| Phone | Required for field types (phlebotomist, delivery) and as OTP channel where pack says |
| OTP | Same OTP service as customers; rate-limited; not reusable across `aud` |
| Password | Required for professional/org (MFA required before `ACTIVE` for doctor/lab/pharmacy/admin-equivalent) |
| Account creation | Creates/links **Person + Account**. If phone/email already a **customer**, **link** — do not create a second Person. Prompt: “Continue with existing account” |

**RISK:** Account takeover of a customer to become a partner. Mitigation: step-up OTP + email verify before partner application submit; device bind for field roles.

After account: `Partner` row + `PartnerApplication` in `DRAFT` or `REGISTERED`.

---

## 7. Partner profile

### 7.1 Generic (all types)

| Group | Fields (logical) |
| --- | --- |
| Identity | Legal name / display name, DOB (person types), nationality **if pack**, photo |
| Contact | Email, phone, preferred locale, timezone |
| Geo | Country, region, city, service address / registered address |
| Ops | Languages, availability intent |
| Money | Payout instrument **reference** (no raw account secrets in app logs) |
| Consents | Platform terms, professional terms version, data processing notice |

### 7.2 Type-specific

Stored on type profile tables or pack JSON schema (`DoctorProfile`, vendor store profile, …). Engine treats them as **application steps** with `required | optional | hidden` from pack.

See §12 for per-type checklists.

`PROFILE_INCOMPLETE` while required generic or type-specific fields are empty.

---

## 8. KYC and documents (pack-driven)

KYC is **not** a hardcoded passport vs Aadhaar list.

Country pack supplies, per type:

```
partner_types.DOCTOR.kyc.document_types[]  // codes + labels + optional/required + expiry_required
partner_types.VENDOR.kyc.document_types[]
partner_types.*.kyc.field_schema            // tax id format placeholder, not a named statute
```

### 8.1 Document categories (taxonomy only)

| Category | Examples of **codes** (names filled by pack) |
| --- | --- |
| Identity | `IDENTITY_PRIMARY`, `IDENTITY_SELFIE` |
| Business | `BUSINESS_REGISTRATION`, `OWNERSHIP` |
| Professional | `PROFESSIONAL_REGISTRATION`, `QUALIFICATION` |
| License | `LICENSE`, `FACILITY_LICENSE` |
| Certification | `TRAINING_CERT`, `QUALITY_CERT` |
| Tax | `TAX_IDENTIFIER` |
| Payment | `PAYOUT_ACCOUNT_PROOF` |
| Address | `ADDRESS_PROOF` |

**LEGAL/COMPLIANCE REVIEW REQUIRED** before a country pack lists any real document. Empty list ⇒ application **cannot** reach `DOCUMENTS_SUBMITTED` for regulated types; type stays `join.public=false`.

### 8.2 `PartnerDocument` model

| Field | Purpose |
| --- | --- |
| `id` | UUID v7 |
| `application_id` / `partner_id` | Owner |
| `document_type_code` | Pack code |
| `issuing_country_id` | May differ from operating country |
| `expires_on` | Date; null if pack `expiry_required=false` |
| `verification_status` | `UPLOADED` / `IN_REVIEW` / `ACCEPTED` / `REJECTED` / `EXPIRED` |
| `object_id` | Encrypted object store |
| `version` | Monotonic; reject creates new version on resubmit |
| `reviewer_id`, `reviewed_at` | Reviewer Person |
| `rejection_reason_code`, `rejection_note` | Structured + optional free text |
| `sha256` | Integrity |
| `kyc_case_id` | Link to `KycCase` |

Expiry job: `PARTNER_DOCUMENT_EXPIRING` at pack `kyc.expiry_warn_days`; on expiry → document `EXPIRED`; may move Partner to `SUSPENDED` or `DOCUMENTS_REQUIRED` per pack `kyc.expiry_action`.

KYC blobs are **not** HealthArtifacts ([16](16_HEALTH_RECORD.md), [19](19_COMPLIANCE_FRAMEWORK.md)).

---

## 9. PartnerApplication state machine

Canonical states:

```
DRAFT
  → REGISTERED
  → PROFILE_INCOMPLETE
  → DOCUMENTS_REQUIRED
  → DOCUMENTS_SUBMITTED
  → UNDER_REVIEW
  → ADDITIONAL_INFORMATION_REQUIRED
  → VERIFIED
  → APPROVED
  → ACTIVE
```

Exception / control states (from several parents):

`REJECTED` · `SUSPENDED` · `BLOCKED` · `DEACTIVATED` · `REACTIVATION_REQUESTED`

```
DRAFT ──register──► REGISTERED
REGISTERED ──► PROFILE_INCOMPLETE ──► DOCUMENTS_REQUIRED
PROFILE_INCOMPLETE ⇄ DOCUMENTS_REQUIRED   (parallel checklists)
DOCUMENTS_REQUIRED ──submit pack-complete──► DOCUMENTS_SUBMITTED
DOCUMENTS_SUBMITTED ──assign reviewer──► UNDER_REVIEW
UNDER_REVIEW ──► ADDITIONAL_INFORMATION_REQUIRED ──resubmit──► DOCUMENTS_SUBMITTED | UNDER_REVIEW
UNDER_REVIEW ──kyc+professional pass──► VERIFIED
VERIFIED ──ops/country approve──► APPROVED
APPROVED ──go-live gates──► ACTIVE

UNDER_REVIEW / ADDITIONAL_INFORMATION_REQUIRED / DOCUMENTS_SUBMITTED ──► REJECTED
ACTIVE / APPROVED / VERIFIED ──► SUSPENDED | DEACTIVATED | BLOCKED
SUSPENDED / DEACTIVATED ──► REACTIVATION_REQUESTED ──► UNDER_REVIEW | ACTIVE (pack)
```

### 9.1 State definitions

| State | Meaning |
| --- | --- |
| `DRAFT` | Wizard started; account may not be fully verified |
| `REGISTERED` | Person+Account verified enough to continue (OTP/email) |
| `PROFILE_INCOMPLETE` | Required profile fields missing |
| `DOCUMENTS_REQUIRED` | Pack requires documents not yet uploaded/accepted |
| `DOCUMENTS_SUBMITTED` | Applicant submitted a complete packet; locked for self-approve |
| `UNDER_REVIEW` | Assigned reviewer(s); automated checks may run |
| `ADDITIONAL_INFORMATION_REQUIRED` | Reviewer requested fields/docs; applicant can edit |
| `VERIFIED` | Identity/professional/business checks passed; **not** yet allowed to trade |
| `APPROVED` | Country ops/admin approved to operate; marketplace/care publish may still wait for `ACTIVE` |
| `ACTIVE` | Can receive demand (jobs, bookings, orders) per enabled services |
| `REJECTED` | This application refused; reason required; new application policy per pack |
| `SUSPENDED` | Temporary halt (risk, expiry, ops); data retained |
| `BLOCKED` | Hard stop (fraud/sanctions); payouts frozen; **LEGAL** process |
| `DEACTIVATED` | Partner or admin ended operations; not deleted |
| `REACTIVATION_REQUESTED` | Partner asked to return; re-enters review |

### 9.2 Who may transition

| From | To | Actor | Guards |
| --- | --- | --- | --- |
| — | `DRAFT` | applicant / invite accept | type enabled in pack; country joinable |
| `DRAFT` | `REGISTERED` | identity | email/phone verified per pack |
| `REGISTERED` | `PROFILE_INCOMPLETE` | system | required fields incomplete |
| `REGISTERED` | `DOCUMENTS_REQUIRED` | system | profile complete, docs missing |
| `PROFILE_INCOMPLETE` | `DOCUMENTS_REQUIRED` | system | profile complete |
| `DOCUMENTS_REQUIRED` | `DOCUMENTS_SUBMITTED` | applicant | all required docs `UPLOADED`; virus scan OK; payout instrument if pack `payout_required_at_submit` |
| `DOCUMENTS_SUBMITTED` | `UNDER_REVIEW` | system / ops | case assigned; SoD: submitter ≠ reviewer |
| `UNDER_REVIEW` | `ADDITIONAL_INFORMATION_REQUIRED` | reviewer | reason codes; not submitter |
| `ADDITIONAL_INFORMATION_REQUIRED` | `DOCUMENTS_SUBMITTED` or `UNDER_REVIEW` | applicant | new versions uploaded |
| `UNDER_REVIEW` | `VERIFIED` | system after KYC `APPROVED` + type professional gates | dual control if pack |
| `VERIFIED` | `APPROVED` | `country_admin` / designated approver | ≠ KYC submitter; ≠ first reviewer if dual_control on **approval** (pack) |
| `APPROVED` | `ACTIVE` | system or partner “go live” | go-live gates §9.4 |
| `*` review states | `REJECTED` | approver | reason; notify; no silent reject |
| `ACTIVE`/`APPROVED` | `SUSPENDED` | `country_admin`, `compliance_officer`, system (expiry) | reason; pause listings/jobs |
| `ACTIVE` | `DEACTIVATED` | partner (self) or admin | in-flight orders policy |
| any serious fraud | `BLOCKED` | `compliance_officer` | hold + payout freeze |
| `SUSPENDED`/`DEACTIVATED` | `REACTIVATION_REQUESTED` | partner | |
| `REACTIVATION_REQUESTED` | `UNDER_REVIEW` or `ACTIVE` | admin | pack: full re-KYC vs light review **OD-PTR-05** |

**Forbidden:** `DRAFT`→`ACTIVE`; self-approve; skip documents when pack list is non-empty; `VERIFIED`→`ACTIVE` skipping `APPROVED` unless pack `auto_approve_after_verify=true` (still records an approval actor = `system:pack`).

### 9.3 Nested KycCase

`KycCase` ([19](19_COMPLIANCE_FRAMEWORK.md) §5) remains the **document verification** machine (`DRAFT`…`APPROVED`/`REJECTED`).

Mapping:

| Application | KYC |
| --- | --- |
| `DOCUMENTS_SUBMITTED` | KycCase `SUBMITTED` |
| `UNDER_REVIEW` | `IN_REVIEW` |
| `ADDITIONAL_INFORMATION_REQUIRED` | `NEEDS_RESUBMISSION` |
| `VERIFIED` (identity portion) | KycCase `APPROVED` |

Professional license review for doctors/pathologists may be a **second** checklist on the same application (not a second Person).

### 9.4 Go-live gates (`APPROVED` → `ACTIVE`)

Pack flags, examples (not law):

- Payout profile verified
- At least one Location `FULFILLING` (org types)
- Doctor: calendar + fee schedule + teleconsult pack
- Pathologist: lab Membership + signing credential
- Delivery: device bind + zone
- Affiliate: `affiliate.clinical_categories` still **default OFF** ([14](14_AFFILIATE_PLATFORM.md))

**OPEN DECISION (OD-PTR-03):** Auto `ACTIVE` on `APPROVED` vs partner taps “Go live”. Recommendation: **system auto-ACTIVE** when gates pass; partner can `DEACTIVATED` (pause).

### 9.5 Resubmission

- `ADDITIONAL_INFORMATION_REQUIRED` and `REJECTED` (if pack `allow_new_application_after_reject`) create **new document versions**, never overwrite accepted blobs.
- Prior submissions remain visible to reviewers (audit).
- `REJECTED` with `resubmit_allowed=false` → only a **new** `PartnerApplication` after cooldown (pack).

### 9.6 Notifications and audit

Every transition: `PartnerStatusHistory` + `AuditLog` (actor, membership, reason, request_id) + event §16.

Notifications: [23](23_NOTIFICATION_ARCHITECTURE.md) templates `partner.*` (§15).

---

## 10. Country-aware onboarding

```
Country
  → Policy Pack
    → partner_types.{TYPE}
         required_fields[]
         required_documents[]
         verification_rules[]      // dual_control, liveness, expiry
         allowed_services[]
         approval_workflow         // auto | single | dual
         join.public
         staff.invite_roles[]
```

Application logic evaluates **pack JSON**, not `if country == "IN"`.

Service availability for customers still uses the same pack (`services.teleconsult`, `labs.home_collection`, …). A partner `ACTIVE` in country A does not enable country B.

---

## 11. Invitations

`PartnerInvitation`

| Field | |
| --- | --- |
| `id`, `token_hash` | Token shown once |
| `country_id`, `partner_type_code` | |
| `organization_id` | Nullable (admin/public type invites may omit) |
| `inviter_person_id` | |
| `invitee_email` / `phone` | |
| `intended_role_id` | Membership to grant on accept |
| `source` | `ADMIN` / `ORGANIZATION` / `STAFF` / `REFERRAL` / `PUBLIC_LINK` |
| `status` | `SENT` / `ACCEPTED` / `EXPIRED` / `REVOKED` |
| `expires_at` | |

### 11.1 Patterns

| Example | Type | Result |
| --- | --- | --- |
| Lab owner invites pathologist | `ORGANIZATION` + `PATHOLOGIST` | Person Partner + Membership on lab; pathologist application may be **pre-linked** (`PROFILE` shorter if org already KYC’d) |
| Pharmacy owner invites pharmacist | `STAFF` | Membership only if invitee is not a new Partner type; pharmacists are **staff of PHARMACY**, not a separate PartnerType unless pack says independent professional |
| Vendor owner invites staff | `STAFF` | `vendor_staff` Membership |
| Clinic invites doctor | `ORGANIZATION` + `DOCTOR` | Doctor Partner linked to clinic org; doctor still needs own license steps |
| Admin invitation | `ADMIN` | Pre-approved fast path **still** records KYC; cannot skip pack documents |
| Public join link | `PUBLIC_LINK` | Campaign/UTM; still full machine |
| Referral | `REFERRAL` | Affiliate or partner-brings-partner; **no** clinical inducement ([14](14_AFFILIATE_PLATFORM.md)) |

Accept: if invitee exists, link Person; else register §6 then attach.

---

## 12. Type-specific onboarding (checklists)

Each subsection is a **step group** on `PartnerApplication`. Fields exist only if pack shows them. **No invented licenses.**

### 12.1 Doctor — REQ-PTR type overlay

Personal information → qualification → specialization → professional registration/license (**pack**) → experience → languages → consult configuration (modes, fee **intent**) → availability → payout → verification → approval.

Operating details after `ACTIVE`: [08](08_DOCTOR_PLATFORM.md).

### 12.2 Pharmacy

Business → store → branches (Locations) → responsible pharmacist (Membership, pack) → documents → inventory capability flags → delivery capability → payout/settlement.

Owned vs marketplace: same engine; `Organization.type` distinguishes. Rx verification rights only after pharmacist Membership + pack.

### 12.3 Vendor

Business → store/warehouse Locations → product category **intents** (not live SKUs) → documents → tax fields (pack) → banking → inventory capability → settlement/commission **acknowledgement** of schedule (not a side contract store).

Live listings: [07](07_VENDOR_PLATFORM.md) after `ACTIVE`.

### 12.4 Lab

Business → laboratory Locations → test catalogue **intent** / capability codes → equipment/capability flags → staff invites → pathologist association → home collection flag → sample logistics capability → report workflow (digital required; physical optional pack).

Accreditation: **evidence upload**, platform does not confer accreditation ([09](09_LAB_PLATFORM.md)).

### 12.5 Delivery partner

Personal → country/city → identity verification → vehicle **fields if pack** → driving/transport documents **if pack** → availability → banking → delivery zones (polygons).

Capabilities: `PARCEL`, `BIO_SPECIMEN`, `COLD_CHAIN`, `COD_CASH` as flags — enablement is pack + ops, not self-asserted for bio-specimen.

### 12.6 Phlebotomist

Personal → training/certification **if pack** → lab association (invite or network) → collection capability → service area → availability → verification.

Identity mismatch at collection remains a **hard stop** ([10](10_PHLEBOTOMIST_PLATFORM.md)).

### 12.7 Pathologist

Professional information → qualification → registration/license **pack** → lab association → report approval permission (`report:sign`) → digital signing configuration (**OD-LAB-08**, mechanism from pack; no invented e-sign law).

SoD: result-enter vs sign ([03](03_USER_ROLES_AND_PERMISSIONS.md)).

### 12.8 Clinic / Hospital

Extensible **organization onboarding**: legal entity → facilities (Locations) → departments (optional later) → invite doctors/staff → services offered (OPD, diagnostics **flag only**) → payout.

Not a hospital HIS ([01](01_PRODUCT_VISION.md) out of scope).

### 12.9 Affiliate

Profile → KYC **where pack requires** → referral configuration → commission schedule acknowledgement → payout.

Clinical categories **default OFF**. [14](14_AFFILIATE_PLATFORM.md).

### 12.10 Healthcare business / future

Generic org template: legal + KYC + payout + staff. Extra steps only via pack schema.

---

## 13. Organization, staff, roles

### 13.1 Distinction

| | User (Person) | Partner | Organization | Branch (Location) | Role | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| What | Human | Supply-side case + type | Legal/ops entity | Site | Permission set | Person+Membership |

### 13.2 Org-internal roles (fine-grained)

System templates (subset of [03](03_USER_ROLES_AND_PERMISSIONS.md)):

| Org role template | Typical permissions |
| --- | --- |
| `owner` | All org partner settings, invites, payout view, cannot exceed type parent |
| `admin` | Staff, locations, listings; no payout dest change without step-up |
| `manager` | Location ops |
| `staff` | Assigned tasks only |
| `finance` | Settlements read, invoices; no KYC approve |
| `operations` | Jobs/orders queues |
| `custom` | Subset of parent system role (**OD-RBAC-05**, Phase 4+) |

Permissions: `partner_application:read`, `partner_document:upload`, `partner_staff:invite`, `partner_payout:update`, plus domain perms (`inventory:adjust`, …).

Isolation: org A cannot read org B applications or documents.

---

## 14. Partner dashboards (after ACTIVE)

Role-specific; empty/permission states per [25](25_UI_UX_ARCHITECTURE.md). Onboarding wizard is **not** the dashboard.

| Type | Dashboard (minimum) |
| --- | --- |
| Doctor | Today’s queue, calendar, earnings, KYC/license expiry, reviews |
| Pharmacy | Orders, Rx desk, stock/expiry, branches |
| Vendor | Orders SLA, listings, inventory, settlement |
| Lab | Accessions, TAT, QC, print queue, pathologist backlog |
| Delivery | Online toggle, job offers, earnings, COD due |
| Phlebotomist | Job list, navigation, CoC, earnings |
| Pathologist | Sign queue, panic, amendments |
| Affiliate | Links, conversions, pending/approved commission |
| Clinic/Hospital | Roster, locations, invited doctors, appointments (if enabled) |

Admin impersonation of partner dashboards: **forbidden** without break-glass + ticket ([03](03_USER_ROLES_AND_PERMISSIONS.md)). Support uses masked ops views.

---

## 15. Partner communication

All sends go through the notification kernel ([23](23_NOTIFICATION_ARCHITECTURE.md)). Locale = partner preferred locale.

| Trigger | Template key | Class |
| --- | --- | --- |
| Registration / OTP | `partner.otp` / `partner.registered` | Tx |
| Documents required | `partner.documents_required` | Tx |
| Document rejected | `partner.document_rejected` | Tx |
| Additional information | `partner.info_required` | Tx |
| Under review | `partner.under_review` | Tx |
| Approved | `partner.approved` | Tx |
| Rejected | `partner.rejected` | Tx |
| Suspended | `partner.suspended` | Tx |
| Reactivated | `partner.reactivated` | Tx |
| Document expiry | `partner.document_expiring` | Tx |
| Invitation | `partner.invited` | Tx |

SMS/email: **no** full document images; no license numbers in SMS if pack forbids. In-app inbox is source of record.

---

## 16. Events (canonical SCREAMING_SNAKE)

Producer: `party` (partner module). Envelope per [22](22_EVENT_ARCHITECTURE.md).

| Event | When |
| --- | --- |
| `PARTNER_REGISTERED` | REGISTERED |
| `PARTNER_APPLICATION_SUBMITTED` | DOCUMENTS_SUBMITTED |
| `PARTNER_DOCUMENT_UPLOADED` | New version stored |
| `PARTNER_DOCUMENT_REJECTED` | Reviewer reject |
| `PARTNER_REVIEW_STARTED` | UNDER_REVIEW |
| `PARTNER_INFORMATION_REQUESTED` | ADDITIONAL_INFORMATION_REQUIRED |
| `PARTNER_VERIFIED` | VERIFIED |
| `PARTNER_APPROVED` | APPROVED |
| `PARTNER_REJECTED` | REJECTED |
| `PARTNER_SUSPENDED` | SUSPENDED |
| `PARTNER_REACTIVATED` | Back to ACTIVE (or APPROVED) |
| `PARTNER_DOCUMENT_EXPIRING` | Warn job |
| `PARTNER_INVITE_SENT` / `PARTNER_INVITE_ACCEPTED` | Invitations |
| `PARTNER_ACTIVATED` | ACTIVE (search publish consumer) |

`KYC_STATUS_CHANGED` remains for the nested case. Do not emit two “approved” facts: `PARTNER_APPROVED` is the business approval; KYC is nested.

Idempotency: `event_id` + aggregate `PartnerApplication`.

---

## 17. APIs (logical)

Base: `/api/v1`. Applicant `aud=partner_applicant` or type app `aud`. Admin: `aud=admin`.

| Method | Path | Authz |
| --- | --- | --- |
| GET | `/public/partner-types` | Public |
| POST | `/partner/applications` | Applicant; idempotent |
| GET/PATCH | `/partner/applications/{id}` | Self or org admin |
| POST | `/partner/applications/{id}/submit` | Self; SoD later |
| POST | `/partner/applications/{id}/documents` | Presign + confirm |
| GET | `/partner/applications/{id}/status` | Self |
| POST | `/partner/invitations` | `partner_staff:invite` |
| POST | `/partner/invitations/{token}/accept` | Identity |
| GET/PATCH | `/partner/organizations/{id}` | Org scope |
| GET | `/partner/organizations/{id}/members` | Org |
| POST | `/partner/organizations/{id}/members` | Invite accept side-effect |
| GET/PUT | `/partner/organizations/{id}/roles` | owner/admin |
| GET | `/admin/partner-applications` | `partner_application:review` |
| POST | `/admin/partner-applications/{id}/verify` | reviewer |
| POST | `/admin/partner-applications/{id}/approve` | approver |
| POST | `/admin/partner-applications/{id}/reject` | approver |
| POST | `/admin/partner-applications/{id}/request-info` | reviewer |
| POST | `/admin/partner-applications/{id}/suspend` | country_admin/compliance |
| POST | `/admin/partner-applications/{id}/reactivate` | same |

Idempotency-Key on submit/approve/reject/suspend.

Errors: `TYPE_DISABLED_IN_COUNTRY`, `PACK_DOCUMENTS_EMPTY` (regulated type), `SOD_VIOLATION`, `APPLICATION_STATE`, `INVITE_EXPIRED`.

---

## 18. Admin ERP — partner management

One module **Partner applications** (not nine queues that cannot share reviewers). Filters: type, country, state, SLA age, risk flags.

| Screen | Purpose |
| --- | --- |
| Applications worklist | SLA, missing docs count, type |
| Application detail | Profile, docs, versions, nested KYC, reviewer, timestamps |
| Document viewer | KYC viewer; watermark; no bulk zip without `kyc:export` |
| KYC review | Nested case actions |
| Approve / reject / request info | Reason codes mandatory |
| Resubmission history | All versions |
| Suspension / reactivation | |
| Risk flags | Duplicate payout, device, velocity, sanctions hold |
| Audit history | Status history + document access log |

Reviewer **cannot** download KYC to personal device without `kyc:download` + reason ([27](27_SECURITY_ARCHITECTURE.md)).

---

## 19. Security

| Control | Rule |
| --- | --- |
| Least privilege | Reviewers see KYC of **assigned country + assigned types** |
| Org isolation | RLS `organization_id` |
| Staff | See only permissions; staff cannot read owner payout account numbers in full |
| Admin verification | `kyc:review` ≠ `partner_application:approve` if pack dual control |
| Audit | Every document GET logged (`kyc_payload_read`) |
| Storage | Separate key from catalog images; signed URLs TTL minutes |
| Applicant | Sees own docs; cannot see reviewer internal notes if pack `hide_internal_notes` |

---

## 20. Testing (partner engine)

See [31](31_TESTING_STRATEGY.md). Minimum:

Registration, verification, rejection, resubmission, approval, suspension, document expiry, org invitations, role permissions, pack-required vs empty pack (cannot activate regulated type).

---

## 21. Traceability

| Req | Maps to |
| --- | --- |
| REQ-PTR-001 | This engine, module `party`/`partner` |
| REQ-PTR-002 | Type catalog + Join UI |
| REQ-PTR-003 | Documents + KycCase |
| REQ-PTR-004 | VERIFIED |
| REQ-PTR-005 | APPROVED/REJECTED |
| REQ-PTR-006 | §14 dashboards |
| REQ-PTR-007 | Org/staff §13 |
| REQ-PTR-008 | Invitations §11 |
| REQ-PTR-009 | Pack §10 |

Full matrix: [00](00_MASTER_INDEX.md) §14.

---

## 22. Open decisions (this book)

| ID | Question | Phase gate | Recommendation |
| --- | --- | --- | --- |
| OD-PTR-01 | Separate Join mobile listing vs web-first | Phase 1 (Join web) | **Web-first Join** |
| OD-PTR-02 | Multiple ACTIVE Partners same type+country | Phase 3 | **One ACTIVE per type+country**; extra orgs via Membership |
| OD-PTR-03 | Auto ACTIVE after APPROVED | Phase 3 | Auto when gates pass |
| OD-PTR-04 | HOSPITAL vs CLINIC subtype | Phase 4+ | Separate codes |
| OD-PTR-05 | Reactivation = full re-KYC | When suspend ships | Pack; default re-KYC if docs expired |
| OD-PTR-06 | Independent pharmacist as PartnerType | Pharmacy launch | Staff of PHARMACY unless pack requires independent professional |

Existing: OD-RBAC-01 dual KYC, OD-RBAC-04 dual hats, OD-CMP-03/05 KYC signatures.

---

## 23. What domain books must stop doing

Do **not** specify a second signup OTP, a second KYC state machine, or a second document blob store. Replace with: “Onboarding: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md); this book owns post-ACTIVE operations and type-specific profile fields.”
