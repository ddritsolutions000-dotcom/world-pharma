# 148 — R7-E audit blockers fix

**Status:** Implementation  
**Change ID:** **CR-R7-E-FIX-148**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_E_BLOCKERS_CLOSED**

**Authority:** Close blockers from [147](147_POST_R7_E_PATHOLOGY_DIGITAL_REPORT_AUDIT.md) only. **R7-F NOT STARTED. R8+ NOT STARTED.**

**Sources:** [147](147_POST_R7_E_PATHOLOGY_DIGITAL_REPORT_AUDIT.md) · [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md)

---

## 0. Scope

| Blocker | Fix |
|---------|-----|
| B-01 | `catalogDetail` exact slug lookup |
| B-02 | Real web-lab result-entry form |
| B-03 | Customer report error-state mapping |

---

## 1. B-01 — R7-B catalog detail regression

**Root cause:** `LabBookingService.catalogDetail` called `browseCatalog(country, { limit: 50 })` without slug filter, then searched the first 50 catalog items by `id` order. In a populated test database, the target slug was often outside that page → **404** even though browse-with-`q` returned the item.

**Fix:** `catalogDetail` now queries `catalogItem` by **exact `slug`** with the same publish/eligibility filters as browse. Shared helpers extracted: `catalogBrowseWhere`, `catalogItemInclude`, `formatCatalogItems`.

**File:** `apps/api/src/lab/lab-booking.service.ts`

**R7-B e2e (3 consecutive runs):** **3/3 PASS** (`r7b.lab-booking.e2e.spec.ts` 1/1 each)

---

## 2. B-02 — web-lab result entry

**Root cause:** `lab-pathology-panel.tsx` one-click button submitted hardcoded `{ Glucose: 95 }`.

**Fix:** Replaced with a real result-entry form:
- Fields: summary (optional), analyte code, analyte name, value, unit (optional)
- Client required-field validation
- Submit loading, success, forbidden (403), network, API error states
- 401 delegated to shell via `onError` / `LabApiError`
- Calls existing `enterLabReportResults` + `submitLabReportVerify` APIs

**File:** `apps/web-lab/src/lab-pathology-panel.tsx`

---

## 3. B-03 — customer report errors

**Root cause:** `LabBookingDetailScreen` mapped all `fetchLabReport` failures to booking-level `generic` error.

**Fix:** Separate `reportError` state:
- **401** → `expire()` (session)
- **403** → `PermissionDeniedState`
- **404** → report unavailable `EmptyState`
- **0** → `NetworkErrorState` with retry
- **other** → generic `EmptyState`

Booking load errors remain unchanged. Report fetch does not expose diagnostic content on error.

**File:** `apps/web-customer/src/lab-bookings-page.tsx`

---

## 4. Regression (28 Aug 2026)

### API suite — three consecutive runs (`nx test api --skip-nx-cache`)

| Run | Suites | Tests |
|-----|--------|-------|
| 1 | **64/66 PASS** (2 failed) | **151/157 PASS** (6 failed) |
| 2 | **66/66 PASS** | **157/157 PASS** |
| 3 | **66/66 PASS** | **157/157 PASS** |

Run 1 failures were **intermittent** and **not R7-B/R7-E** (observed `inventory.e2e.spec.ts` in separate probes). R7-B fix verified deterministic **3/3** in isolation.

### Focused gates

| Gate | Result |
|------|--------|
| R7-A | PASS (`r7a.lab.e2e.spec.ts`) |
| R7-B | PASS (`r7b.lab-booking.e2e.spec.ts`) |
| R7-C | PASS (`r7c.sample-collection.e2e.spec.ts`) |
| R7-D | PASS (`r7d.transport-accession-processing.e2e.spec.ts`) |
| R7-E | PASS (`r7e.pathology-digital-report.e2e.spec.ts`) |
| RLS | PASS (`rls.tenancy.e2e.spec.ts`) |
| R3 | PASS (`r3.isolation.e2e.spec.ts`) |
| R5/R6 | PASS **9/9** suites · **11/11** tests |
| R7-A–E combined | PASS **7/7** suites · **28/28** tests |
| Workspace (excl. flaky api run) | web/mobile packages **6/6** · **49/49** tests |
| Web tests | **7/7** projects · **49/49** tests |
| Mobile tests | **2/2** suites · **4/4** tests |
| Typecheck | **21/21** PASS |
| Web builds | web-customer, web-lab, web-pathologist **PASS** |

### Remaining observation (out of scope)

Intermittent `inventory.e2e.spec.ts` failure under parallel/cold full-suite runs — pre-existing, not introduced by B-01/B-02/B-03. Not an audit blocker.

---

## 5. UI re-check

| Screen | Result |
|--------|--------|
| web-lab result entry | **PASS** — real form, validation, API, states |
| customer report errors | **PASS** — 401/403/404/network/generic distinguished |
| R7-B catalog detail | **PASS** — slug detail returns 200 with offers |

---

## Final declaration

**FINAL STATUS: R7_E_BLOCKERS_CLOSED**

Audit blockers **B-01**, **B-02**, **B-03** are resolved.

**R7-F NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No physical report delivery.**  
**No production healthcare enablement.**

**STOP.**
