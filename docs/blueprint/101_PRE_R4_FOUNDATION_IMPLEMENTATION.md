# 101 — Pre-R4 foundation hardening implementation

**Status:** Implemented  
**Change ID:** **CR-PRE-R4-FOUNDATION-101**  
**Date:** 27 August 2026  
**Basis:** [100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md)

**Authorization:** Pre-R4 foundation only. **R4 telemedicine, Rx, lab, radiology, CMS, CRM, live PSP/DHL/payouts NOT started.**

---

## 1. Scope delivered

| # | Area | Status |
|---|------|--------|
| 1 | Auth unification (OTP, no dev-token on customer mobile, doctor web/mobile) | **Done** |
| 2 | Customer account foundation (web + mobile) | **Done** |
| 3 | Admin governance read-only + audit viewer | **Done** |
| 4 | Standalone `apps/web-vendor` | **Done** |
| 5 | Doctor UX hardening + sandbox video join shell | **Done** |
| 6 | Customer mobile commerce parity | **Done** (foundation) |
| 7 | Store/delivery mobile hardening | **Done** (foundation) |
| 8 | Shared UI/shell (`apiCall`, session persistence, i18n, native states) | **Done** |
| 9 | Accessibility/i18n foundation | **Partial** — English fallback, ARIA on forms |
| 10 | Notifications + support kernel | **Done** (Redis-backed foundation) |
| 11 | Audit + security UX | **Done** (read API + consistent states) |
| 12 | App topology + docs | **Done** |

---

## 2. API additions (no schema migrations)

| Endpoint | Purpose |
|----------|---------|
| `PATCH /me/profile` | Customer profile preferences |
| `PATCH/DELETE /me/addresses/:id` | Address management |
| `GET/PATCH /me/notifications/*` | Notification preferences + inbox scaffold |
| `GET/POST /support/tickets` | Support kernel (Redis) |
| `GET /admin/governance/*` | Read-only company hierarchy |
| `GET /admin/security-events` | Audit viewer |
| `GET /vendor/organizations` | Vendor org discovery |

---

## 3. Application status (post-101)

| App | Classification |
|-----|------------------|
| web-store, mobile-store | **FUNCTIONAL** |
| web-join, mobile-delivery | **FUNCTIONAL** |
| web-vendor | **FOUNDATION** |
| web-customer, mobile, web-doctor, mobile-doctor, web-admin | **FOUNDATION** |

**Nothing is production-ready.**

---

## 4. Remaining gaps (explicit)

- Offline queue guarantees (store/delivery) — architecture only
- Push notification delivery — token registration only
- CMS/CRM/marketing — not started
- Governance write/mutation — read-only by design
- R4 video/LiveKit — shell only on doctor surfaces
- Native app store builds — not attempted
- Full i18n translations — architecture only

---

## 5. R4 gate (unchanged)

R4 remains **separately unauthorized**. See [100](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md) §12.

**STOP. R4 not started.**
