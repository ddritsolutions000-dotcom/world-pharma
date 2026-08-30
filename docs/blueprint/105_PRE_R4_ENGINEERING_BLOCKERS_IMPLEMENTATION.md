# 105 — Pre-R4 final engineering blockers implementation

**Status:** Implemented  
**Change ID:** **CR-PRE-R4-FIX-105**  
**Date:** 27 August 2026  
**Basis:** CR-PRE-R4-FINAL-104 (NOT_READY_FOR_R4_ENGINEERING — three engineering blockers only)

**Authorization:** Close the three engineering blockers from gate 104 only. **R4 telemedicine product, Rx, lab, radiology, CMS, CRM, live PSP/DHL/payouts NOT started.**

---

## 1. Scope delivered

| # | Blocker | Status |
|---|---------|--------|
| 1 | Customer mobile foundation parity vs web-customer | **Done** |
| 2 | Clinical/profile JSON DOM hygiene (doctor web + mobile) | **Done** |
| 3 | Stale tests (`customer-shell`, mobile `navigation`) | **Done** |

---

## 2. Migrations

**None.**

---

## 3. Customer mobile features completed

Using existing APIs (`account-api`, `consent-api`, `care-api`, `shell-core` `apiCall`) and `ui-kit/native`:

- Consent list / grant / revoke
- Privacy & security hub + logout all sessions
- Editable notification preferences
- Support ticket list + create
- Address CRUD
- Doctor directory, slot selection, booking
- Appointment list, detail, cancel, reschedule
- Profile editing
- Account hub navigation
- Loading / network / forbidden / empty states via shared `FeatureStates` + `applyApiResult`

---

## 4. Clinical JSON / DOM exposure fixed

Removed raw payload rendering (`JSON.stringify` and untyped dumps) from:

| File | Fix |
|------|-----|
| `apps/web-doctor/src/profile-panel.tsx` | Typed display fields only |
| `apps/web-doctor/src/availability-panel.tsx` | Weekday window list |
| `apps/web-doctor/src/encounter-panel.tsx` | Video ref fallback text only |
| `apps/mobile-doctor/src/app-root.tsx` | `formatAvailabilitySummary()` + safe video ref fallback |
| `apps/mobile-doctor/src/doctor-api.ts` | Typed `DoctorProfile`, `AvailabilityData`, formatter |

Server-side clinical access evaluator and consent enforcement unchanged.

---

## 5. Test cleanup

| Test | Fix |
|------|-----|
| `apps/web-customer/src/customer-shell.spec.tsx` | Authenticate via `SessionProvider` before network-error assertion; synchronous test hydration in shell-web |
| `apps/mobile/src/navigation.spec.ts` | Expect canonical `home` screen (not `workspace`) |

Supporting fix: `packages/shell-web/src/session-context.tsx` hydrates `initialAudience` synchronously in Jest (`JEST_WORKER_ID`); `apps/web-admin/src/test/setup.ts` mocks `fetch` for authenticated admin panel tests.

---

## 6. Regression results (post-105)

| Suite | Result |
|-------|--------|
| API regression | **124/124 PASS** |
| RLS (`rls.tenancy.e2e.spec.ts`) | **8/8 PASS** (included in API suite) |
| R3 isolation (`r3.isolation.e2e.spec.ts`) | **13/13 PASS** (included in API suite) |
| Typecheck (18 projects) | **18/18 PASS** |
| web-customer tests | **8/8 PASS** |
| web-doctor tests | **2/2 PASS** |
| web-admin tests | **10/10 PASS** |
| mobile tests | **3/3 PASS** |
| shell-web tests | **1/1 PASS** |
| Builds: customer, doctor, admin, store, join, vendor | **PASS** |

---

## 7. Remaining engineering blockers

**None** from CR-PRE-R4-FINAL-104.

---

## 8. Remaining legal / human gates (unchanged)

- Telehealth licensing and jurisdiction review
- Recording / retention policy sign-off
- Cross-border clinical policy
- Explicit R4 coding authorization CR (not issued)
- Approved legal copy / full i18n (policy placeholders remain where copy not approved)

---

## 9. R4 gate

**FINAL STATUS: READY_FOR_R4_ENGINEERING**

Engineering preconditions from gate 104 are satisfied. R4 product work remains **separately unauthorized** until legal/human gates and an explicit R4 CR are issued.

**STOP. R4 not started.**
