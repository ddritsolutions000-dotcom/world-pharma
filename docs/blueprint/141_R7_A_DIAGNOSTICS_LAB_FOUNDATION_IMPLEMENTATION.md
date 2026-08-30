# 141 — R7-A Diagnostics foundation + Lab partner

**Status:** Implementation  
**Change ID:** **CR-R7-A-IMPL-141**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R7_A_IMPLEMENTED**

**Authority:** R7-A only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-B/C/D/E/F NOT STARTED. R8+ NOT STARTED.**

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [09](09_LAB_PLATFORM.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| Nest `LabModule` + capability gates | Customer booking / sandbox lab pay |
| LAB org picker + membership access | Phlebotomist / CoC / SAMPLE_* workflows |
| `LAB_TEST` + `LAB_OWNED` catalog extension | Accession / processing / pathology |
| Pack fail-closed (`lab_home` \| `lab_center` + `LAB`) | Physical report delivery |
| `apps/web-lab` foundation shell | Lab/Pathologist/Phlebotomist mobile |
| Admin lab accept/block (partners UI) | LIS/HIS, radiology, EHR UX, care-nav, CMS/CRM |
| Attestation `LAB_PARTNER_SANDBOX_V1` | Live PSP / carriers / payouts / e-Rx / auto-refill |

---

## 1. Kernels reused (no duplicates)

Identity · Partner/Join · Organization/Location · Catalog/Pricing · Policy packs · Redis eligibility pattern (mirror marketplace) · Security events · RLS/tenant context · ui-kit / shell-web.

**No** second identity, catalog, payment, order, logistics, support, or notification kernels.

---

## 2. Schema / migration

| Migration | Purpose |
|-----------|---------|
| `20260827230000_r7a_catalog_lab_test_kind` | `CatalogItemKind.LAB_TEST` + `OfferOwnership.LAB_OWNED` (additive enums only) |

No booking/sample/report tables. No new RLS tables (enum-only). Existing catalog offer RLS (`can_org(seller_org_id)`) covers lab sellers.

---

## 3. API surface

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/lab/organizations` | LAB-kind memberships only |
| GET | `/api/v1/lab/capabilities/eligibility` | Pack + attestation state; `booking_enabled: false` |
| POST | `/api/v1/lab/capabilities/attest` | Sandbox product ack |
| GET | `/api/v1/lab/capabilities/activity` | Sanitized security events |
| GET/POST | `/api/v1/lab/catalog/*` | LAB_TEST / LAB_OWNED writes when ELIGIBLE |
| GET/POST | `/api/v1/admin/lab/eligibility` · `/acceptance` | Company governance |

Customer browse may show published `LAB_OWNED` offers when pack enables lab services — **no booking endpoints**.

---

## 4. Apps

| App | Change |
|-----|--------|
| `apps/web-lab` | **Created** — OTP, org picker, capabilities, catalog, later-phase EmptyStates |
| `apps/web-admin` | Lab capability accept/block beside marketplace |
| Topology `APP-LAB-W` | `FOUNDATION` · `currentPath: apps/web-lab` |

---

## 5. Security

- `assertLabOrgAccess` — membership + `OrganizationKind.LAB`
- Lab A ↛ Lab B (e2e)
- Vendor org cannot use `/lab/*`
- Partner cannot obtain `company_*` via activation (`LAB` → `org_admin`)
- Headers non-authoritative; empty pack fail-closed
- No PHI in lab DTOs/events (`booking_enabled`/`live_payout` flags only)

---

## 6. Tests / regression (this CR)

| Suite | Result |
|-------|--------|
| `r7a.lab.e2e` | **1/1** · **1/1** |
| Focused R3 + RLS + R5 + R6-F + R7-A | **25/25** |
| Full `nx test api` | **59/59** suites · **143/143** tests |
| Typecheck | **19/19** (includes `web-lab`) |
| Web builds | **7/7** (customer, admin, vendor, store, doctor, join, **lab**) |

Also hardened `r3.isolation.e2e` to enable PHARMACY on the **resolved** published pack (`publishedPolicyPackId`), matching PolicyResolver behavior from R6-F.

---

## 7. Production boundary

**OFF:** live PSP · real payouts · live carriers · production LiveKit · recording · live e-Rx · automatic refill · LIS/HIS · production healthcare traffic.

R7-A is **foundation/sandbox only**.

---

## 8. Explicit non-starts

**R7-B/C/D/E/F NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No production healthcare enablement.**

---

## Final declaration

**FINAL STATUS: R7_A_IMPLEMENTED**

**STOP.**
