# 103 — Pre-R4 engineering blockers implementation

**Status:** Implemented  
**Change ID:** **CR-R4-PREP-103**  
**Date:** 27 August 2026  
**Basis:** CR-PRE-R4-GATE-102 (NOT_READY_FOR_R4 — engineering blockers only)

**Authorization:** Close genuine pre-R4 engineering gaps only. **R4 telemedicine product, Rx, lab, radiology, CMS, CRM, live PSP/DHL/payouts NOT started.**

---

## 1. Scope delivered

| # | Area | Status |
|---|------|--------|
| 1 | Customer consent management UX | **Done** |
| 2 | Doctor consent/access visibility in encounter | **Done** |
| 3 | Customer privacy & security hub | **Done** |
| 4 | Doctor credentials UI | **Done** |
| 5 | Residual production `shell-dev-access` guards removed | **Done** |
| 6 | Store Web GRN catalog picker parity | **Done** |

---

## 2. API changes (no schema migrations)

| Change | Purpose |
|--------|---------|
| `GET /care/doctors` includes `partner_id` | Customer consent grant target selection |
| `GET /consent/grants` includes `recipient_display_name` | Consent list doctor labeling |
| `GET /doctor/me` includes `country_code` | Doctor clinical access evaluation UX |

---

## 3. New / updated surfaces

| App | Routes / panels |
|-----|-----------------|
| web-customer | `/account/consent`, `/account/privacy` |
| web-doctor | `/credentials` panel, encounter clinical access banner |
| web-store | GRN tab uses catalog offer picker (no manual variant UUID) |

---

## 4. Dev-access audit

Removed `shell-dev-access` guards from **11 production component files** (8 admin panels, 3 customer care pages). Test-only path in `packages/shell-web/src/session-context.tsx` (`NODE_ENV === 'test'`) retained.

---

## 5. Test results (post-103)

| Suite | Result |
|-------|--------|
| API regression | **124/124 PASS** |
| RLS (`rls.tenancy.e2e.spec.ts`) | **8/8 PASS** |
| R3 isolation (`r3.isolation.e2e.spec.ts`) | **13/13 PASS** |
| Typecheck (18 projects) | **18/18 PASS** |
| web-customer tests | **7/8 PASS** (1 pre-existing `customer-shell.spec.tsx` network banner assertion) |
| web-doctor tests | **2/2 PASS** |
| web-admin tests | **10/10 PASS** |
| Builds: customer, doctor, admin, store, join, vendor | **PASS** |

---

## 6. Remaining gaps (explicit)

- Legal telehealth/recording gates — human/legal review (not engineering)
- Explicit R4 coding authorization CR — not issued
- Customer mobile consent/privacy parity — web only in this CR
- `customer-shell.spec.tsx` stale network-error assertion — pre-existing from 101 shell changes
- Full i18n / approved legal copy — policy placeholders used where copy not approved

---

## 7. R4 gate

R4 remains **separately unauthorized**. Engineering blockers from gate 102 are addressed; legal and R4 authorization gates unchanged.

**STOP. R4 not started.**
