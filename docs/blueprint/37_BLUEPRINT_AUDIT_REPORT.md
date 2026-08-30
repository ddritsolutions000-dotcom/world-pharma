# 37 — Blueprint Audit Report

**Status:** Second-pass architecture audit (documentation only)  
**Date:** 2026-08-26  
**Scope:** Entire `docs/blueprint/` set. No production code, UI, APIs, or migrations were created.

---

## 1. Documents reviewed

All files `00`–`35` plus this report. Entry point [00_MASTER_INDEX.md](00_MASTER_INDEX.md). Domain books were read for KYC, org, lab print, payments, events, notifications, security, testing, risks, and open decisions — not the index alone.

**Count after audit:** 38 markdown files (`00`–`37`).

---

## 2. Changes made

| Area | Change |
| --- | --- |
| **New** | [36_PARTNER_ONBOARDING_ECOSYSTEM.md](36_PARTNER_ONBOARDING_ECOSYSTEM.md) — central Join / Partner Onboarding Engine |
| **New** | This audit report |
| Index / traceability | APP-JOIN-W, `partner` module, J22, REQ-PTR-001–009, REQ-LAB-001, REQ-PAY-001/002, docs 36–37 |
| Apps / IAM | Join surface; `partner_reviewer` / `partner_approver`; org staff templates |
| Admin ERP | Unified **Partner applications** queue; type modules stay post-ACTIVE |
| Packs / KYC | `partner_types` keys; KycCase nested under PartnerApplication |
| Data / API / events / notify | Partner entities, `/partner/*` + `/admin/partner-applications`, `PARTNER_*` events, templates |
| UX / security / tests / risks / ODs / roadmap | Join IA, KYC ACL, J22 tests, R-PTR-*, OD-PTR-*, P1 scaffold |
| Domain books | Pointers so 06–11, 14 do not own a second signup |
| Customer travel | Explicit country switch; no silent GPS service enable; wallets/carts not merged |
| Payments / lab print | Audit confirmation: multi-PSP already specified; physical report OTP/POD already specified |

---

## 3. Missing requirements found (and disposition)

| Gap | Disposition |
| --- | --- |
| Central Join / Become a partner (not N type-specific signups) | **Added** 36; types remain pack catalog |
| Clinic / hospital / healthcare business as first-class join types | **Added** PartnerTypes; HOSPITAL vs CLINIC = OD-PTR-04 |
| Unified application state machine | **Added** 36 §9 (KycCase remains nested) |
| Invitations (admin, org, staff, referral, public link) | **Added** 36 §11 |
| Org staff roles owner/admin/manager/staff/finance/ops/custom | **Added** 03 + 36 §13 |
| Admin single verification queue | **Added** 17 `M-ADM-PTR` |
| Pack-driven required fields/docs | **Added** 18 `partner_types` |
| Physical report: print → pack → job → OTP | **Already present** 09 §12 + 11 `REPORT_DELIVERY`; labeled REQ-LAB-001 |
| Multi-gateway / FX / refund / settlement / partner payouts | **Already present** 12–13; labeled REQ-PAY-001/002 |
| Customer travel with same identity | **Strengthened** 05 settings + 18 (wallets do not merge) |
| Duplicate KYC machines per type | **Resolved** by orchestration: one PartnerApplication + one KycCase machine |
| Conflicting filenames in related links (`04_APPLICATION_*` vs `04_APPLICATION_*`) | Historical aliasing inside books; **canonical filenames** are those on disk (`04_APPLICATION_ARCHITECTURE.md`, `20_DATABASE_ARCHITECTURE.md`, …) |

---

## 4. New partner architecture (summary)

```
Person + Account
  → Partner (country + PartnerType ± Organization)
  → PartnerApplication (DRAFT … ACTIVE + control states)
  → PartnerDocument[] + nested KycCase
  → Membership/Role
  → Type dashboard after ACTIVE
```

Types: Doctor, Pharmacy, Vendor, Lab, Delivery partner, Phlebotomist, Pathologist, Clinic, Hospital, Affiliate, Healthcare business, future rows.

**Not** a second identity stack. **Not** hardcoded country document lists.

---

## 5. New entities

`PartnerType`, `Partner`, `PartnerApplication`, `PartnerStatusHistory`, `PartnerDocument`, `PartnerInvitation`, `PartnerRiskFlag`.

Reuse: Person, Account, Organization, Location, Membership, Role, Permission, KycCase.

---

## 6. New API domains

Public: `GET /public/partner-types`.  
Applicant: `/partner/applications`, documents, invitations, org members.  
Admin: `/admin/partner-applications` (verify, approve, reject, request-info, suspend).

`aud=partner_applicant` until ACTIVE membership exists.

---

## 7. New events

`PARTNER_REGISTERED`, `PARTNER_APPLICATION_SUBMITTED`, `PARTNER_DOCUMENT_UPLOADED`, `PARTNER_DOCUMENT_REJECTED`, `PARTNER_REVIEW_STARTED`, `PARTNER_INFORMATION_REQUESTED`, `PARTNER_VERIFIED`, `PARTNER_APPROVED`, `PARTNER_REJECTED`, `PARTNER_SUSPENDED`, `PARTNER_REACTIVATED`, `PARTNER_DOCUMENT_EXPIRING`, `PARTNER_ACTIVATED`, `PARTNER_INVITE_SENT`, `PARTNER_INVITE_ACCEPTED`.

`KYC_STATUS_CHANGED` remains nested. `DOCTOR_ACTIVATED` / `VENDOR_APPROVED` are type aliases of `PARTNER_ACTIVATED` where search needs them — do not double-publish two “approved” facts for one action.

---

## 8. New workflows

- Public Join discovery and registration (J22)
- Pack-driven profile + KYC
- Review / additional information / resubmit
- Approve / reject / suspend / reactivate
- Org and staff invitations
- Document expiry
- Physical report (existing, restated)
- Country switch while travelling (same Person)

---

## 9. New risks

`R-PTR-01`–`R-PTR-07`: fake partners, document fraud, professional credential fraud, account takeover, insider KYC access, pack mismatch, expired licenses, partner/rider/vendor abuse.

---

## 10. New open decisions

| ID | Gate |
| --- | --- |
| OD-PTR-01 | Can defer mobile Join listing; Join **web** before first public partner |
| OD-PTR-02 | Before vendor/doctor go-live |
| OD-PTR-03 | Before first partner go-live |
| OD-PTR-04 | Can defer until clinic/hospital launch |
| OD-PTR-05 | When suspend ships |
| OD-PTR-06 | Pharmacy partner launch |

**None are Phase 0 blockers** for empty-pack scaffolding.

---

## 11. Remaining gaps (accepted)

| Gap | Why accepted |
| --- | --- |
| Legal document lists per country | Intentionally empty until counsel fills packs |
| FHIR, hospital HIS, insurance core | Still out of product scope |
| Dedicated affiliate native app | A-UX-01: web + customer referral |
| Perfect synonym cleanup of every historical event alias | Alias map in 22; new work uses SCREAMING_SNAKE |
| Exact e-sign statute for pathologists | OD-LAB-08 + LEGAL REVIEW |
| Merchant of record | OD-PAY-01 still required before live money |

---

## 12. Recommendation for Phase 0

Unchanged sequencing: **do not start production UI/API/migrations yet**.

Phase 0 still: monorepo, identity kernel, empty Country Policy Pack **including `partner_types` keys with `join_public: false`**, design tokens, CI, observability.

Phase 1: scaffold `partner` module + APP-JOIN-W **behind flags**; first-party pharmacy staff via **invite**, not public marketplace join.

Public doctor/vendor/lab Join waits for legal pack content and Phase 2 money kernel where payouts apply.

---

## 13. Consistency rules locked by this audit

1. One Person, many Memberships; Partner is participation, not a login table.  
2. One PartnerApplication machine; KycCase is nested.  
3. Country Policy Pack supplies fields/documents/services.  
4. Admin KYC is one queue filtered by type.  
5. Type books own **post-ACTIVE** operations only.  
6. Physical reports = PrintRequest + `REPORT_DELIVERY` + OTP; no PDF on rider device.  
7. Payments stay adapter-routed, original currency retained.  
8. Markers: `ASSUMPTION`, `OPEN DECISION`, `LEGAL/COMPLIANCE REVIEW REQUIRED`, `RISK`.
