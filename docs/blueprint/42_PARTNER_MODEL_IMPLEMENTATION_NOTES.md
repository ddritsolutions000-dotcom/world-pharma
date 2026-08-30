# 42 — Partner / Organization Dark Model

**Status:** Phase 0 Task 4 — implemented, remains DARK  
**Canonical:** [03](03_USER_ROLES_AND_PERMISSIONS.md), [20](20_DATABASE_ARCHITECTURE.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

This note records what shipped. It is not a second partner product.

---

## Model

```
Person (identity)
  → Partner (country + PartnerType, optional Organization)
      → PartnerApplication (state machine)
      → PartnerStatusHistory (immutable)
      → KycCase → PartnerDocument (object-store key only)
  → Membership (existing RBAC, now org-scoped)
Organization → Location
PartnerInvitation (hashed token)
```

No `DoctorUser` / `VendorUser` tables. Type-specific profiles are later and must FK to `Partner`.

Unique: one Partner per `(personId, partnerTypeCode, countryId)` (OD-PTR-02).

---

## State machine

Application/partner status follows [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §9:

`DRAFT → REGISTERED → PROFILE_INCOMPLETE → DOCUMENTS_REQUIRED → DOCUMENTS_SUBMITTED → UNDER_REVIEW → ADDITIONAL_INFORMATION_REQUIRED → VERIFIED → APPROVED → ACTIVE`

Control states: `REJECTED`, `SUSPENDED`, `BLOCKED`, `DEACTIVATED`, `REACTIVATION_REQUESTED`.

`DRAFT → ACTIVE` is forbidden. `ACTIVE` also requires the country pack `partner_types.{CODE}.enabled === true`. Empty pack has all types disabled, so go-live fails closed.

---

## KYC

One `KycCase` per partner (nested, not a second identity). Documents store `object_key` + checksum + content type. Bytes live in `PrivateObjectStore` (local private disk in Phase 0). No public URLs. Downloads are audited. Retention: **LEGAL/COMPLIANCE REVIEW REQUIRED**.

Document requirements come from pack `partner_types.{CODE}.required_documents` (empty in the XX pack).

---

## Organization and invitations

Organizations are optional. Membership uses existing `Membership` + org roles (`org_owner` … `org_operations`). Duplicate `(person, org, role)` is rejected.

Invitations: ADMIN / ORGANIZATION / STAFF / REFERRAL. `PUBLIC_LINK` is rejected. Tokens hashed, single-use, expirable, revocable. Raw token returned once.

---

## Dark mode and policy

- No `POST /join/*`
- `source=PUBLIC` requires `join_public` (false on XX)
- Admin/internal APIs: JWT + `partner:manage` / `kyc:review`
- Unauthenticated document GET is 401 (`kyc:document_read` required)
- KYC upload/view is owner or `kyc:review` / `kyc:document_read` — the previous always-allow reviewer stub is removed
- Nested KYC has no separate `REQUIRED` case state; pack `required_documents` plus application `DOCUMENTS_REQUIRED` cover that
- Identity-document numbers are not stored (LEGAL/COMPLIANCE REVIEW REQUIRED before adding)
- Document retention: LEGAL/COMPLIANCE REVIEW REQUIRED
- Malware scan is a no-op integration point (`AllowAllMalwareScanner`)

---

## Deferred

- Real object storage / malware scan / signed cloud URLs
- Legal document lists
- Dual-control reviewer SoD in workflow UI
- Type-specific profiles
- Outbox bus (Task 5)
- Public Join
- Identity-document numbers (LEGAL/COMPLIANCE REVIEW REQUIRED)
- Nested KYC `REQUIRED` state (task prompt vs [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §9.3) — **CR required to add**; pack `required_documents` + application `DOCUMENTS_REQUIRED` used instead
- Renaming `Person`→`User`, `Membership`→`OrganizationMembership`, `Location`→`OrganizationLocation` — **CR required**; identity kernel / [20](20_DATABASE_ARCHITECTURE.md) names kept
- Task-prompt status aliases (`PROFILE_INCOMPLETE`, `DOCUMENTS_REQUIRED`, `DOCUMENTS_SUBMITTED`, `REACTIVATION_REQUESTED`) vs locked [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) names — **CR required to rename**; implementation follows [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

**Next:** Phase 0 Task 5 — Outbox / event foundation. Not started.
