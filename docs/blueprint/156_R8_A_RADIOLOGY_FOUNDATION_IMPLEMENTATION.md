# 156 — R8-A Radiology foundation + imaging partner gate

**Status:** Implementation  
**Change ID:** **CR-R8-A-IMPL-156**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R8_A_IMPLEMENTED**

**Authority:** R8-A only per [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **R8-B/C/D/E/F NOT STARTED. R9+ NOT STARTED.**

**Sources:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) · [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| Nest `RadiologyModule` + `RadiologyCapabilityService` | Customer imaging booking |
| `IMAGING_CENTER` org kind + membership access | Sandbox imaging payment |
| `IMAGING_STUDY` + `IMAGING_OWNED` catalog extension | Acquisition / technician workflow |
| Pack fail-closed (`imaging_center` + `IMAGING_CENTER`) | Radiologist interpretation / worklist |
| Attestation `RADIOLOGY_PARTNER_SANDBOX_V1` | Imaging report publication |
| `apps/web-radiology` foundation shell | Physical report delivery |
| Admin imaging accept/block (partners UI) | DICOM/PACS / LIS/HIS |
| Security events (`IMAGING_PARTNER_*`) | Live PSP / carriers / payouts |

`booking_enabled: false` always in R8-A eligibility responses.

---

## 1. Kernels reused (no duplicates)

Identity · Partner/Join · Organization/Location · Catalog/Pricing · Policy packs · Redis eligibility pattern (mirror lab/marketplace) · Security events · RLS/tenant context · ui-kit / shell-web.

**No** second identity, catalog, payment, order, logistics, notification, or PACS kernels.

---

## 2. Schema / migration

| Migration | Purpose |
|-----------|---------|
| `20260828210000_r8a_radiology_foundation` | `OrganizationKind.IMAGING_CENTER` · `CatalogItemKind.IMAGING_STUDY` · `OfferOwnership.IMAGING_OWNED` (additive enums only) |

**Tables added/changed:** none (enum-only).  
**RLS policies added:** none — existing catalog offer RLS (`can_org(seller_org_id)`) covers imaging sellers.  
**Indexes/constraints:** none.

No `ImagingBooking`, `ImagingStudy`, `ImagingReport`, acquisition, or interpretation tables.

---

## 3. API surface

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/radiology/organizations` | IMAGING_CENTER memberships only |
| GET | `/api/v1/radiology/capabilities/eligibility` | Pack + attestation; `booking_enabled: false` |
| POST | `/api/v1/radiology/capabilities/attest` | Sandbox product ack (`RADIOLOGY_PARTNER_SANDBOX_V1`) |
| GET | `/api/v1/radiology/capabilities/activity` | Sanitized security events |
| GET | `/api/v1/radiology/catalog/offers` | IMAGING_OWNED offers for org |
| POST | `/api/v1/radiology/catalog/items` | `IMAGING_STUDY` item when ELIGIBLE |
| POST | `/api/v1/radiology/catalog/items/:id/variants` | Variant create |
| POST | `/api/v1/radiology/catalog/offers` | `IMAGING_OWNED` offer |
| POST | `/api/v1/radiology/catalog/offers/:id/publish` | Publish offer |
| POST | `/api/v1/radiology/catalog/offers/:id/prices` | Price replace |
| GET | `/api/v1/admin/imaging/eligibility` | Company governance |
| POST | `/api/v1/admin/imaging/acceptance` | accept / block / reset |

No booking, payment, acquisition, radiologist, or DICOM endpoints (404 / not registered).

---

## 4. Apps / UI

| App | Change |
|-----|--------|
| `apps/web-radiology` | **Created** — OTP, org picker, dashboard, organization, capabilities, catalog, activity; schedule/bookings/settings as R8-B+ EmptyStates |
| `apps/web-admin` | Imaging capability accept/block beside lab |
| Topology `APP-RAD-W` | `FOUNDATION` · `currentPath: apps/web-radiology` |

### web-radiology routes (R8-A implemented)

| Screen | Route / nav | API |
|--------|-------------|-----|
| Sign-in | `/` (unauthenticated) | OTP via shell-web |
| Dashboard | `/` `#dashboard` | `GET /radiology/catalog/offers` (count) |
| Organization | `#organization` | `GET /radiology/organizations` |
| Capabilities | `#capabilities` | eligibility + attest |
| Catalog | `#catalog` | catalog CRUD |
| Activity | `#activity` | `GET /radiology/capabilities/activity` |
| Schedule | `#schedule` | EmptyState (R8-B) |
| Bookings | `#bookings` | EmptyState (R8-B) |
| Settings | `#settings` | EmptyState (later) |

### web-admin (R8-A)

Partners detail → **Imaging capability (sandbox)**: load eligibility, accept, block.

---

## 5. Security

- `assertImagingOrganization` / `assertImagingOrgAccess` — membership + `OrganizationKind.IMAGING_CENTER`
- Imaging A ↛ Imaging B (e2e)
- Lab org ↛ `/radiology/*`; vendor ↛ imaging catalog writes (e2e)
- Empty / disabled pack fail-closed
- Attestation is product eligibility acknowledgement — **not** legal certification
- Admin acceptance separate from partner self-attestation
- No PHI in imaging DTOs/events (`booking_enabled`/`live_payout` flags only)
- `worldpharma_app` remains NOSUPERUSER / NOBYPASSRLS (unchanged; no new `USING(true)`)

---

## 6. Tests / regression (this CR)

| Suite | Result |
|-------|--------|
| `r8a.radiology.e2e` | **1/1** |
| Focused RLS + R3 + R5 + R6 + R7 + R8-A | **36/36** (11 suites) |
| Full API `jest --runInBand` run 1 | **69/69** suites · **164/164** tests |
| Full API `jest --runInBand` run 2 | **69/69** suites · **164/164** tests |
| Full API `jest --runInBand` run 3 | **69/69** suites · **164/164** tests |
| Workspace `nx run-many -t test` | **11/11** projects (API 164 tests) |
| Typecheck | **22/22** projects |
| Web builds | **10/10** (customer, admin, vendor, store, doctor, join, lab, **radiology**, pathologist, ds-web) |

---

## 7. Production boundary

**OFF:** live PSP · real payouts · live carriers · production LiveKit · recording · live e-Rx · automatic refill · LIS/HIS · PACS production · production healthcare traffic.

R8-A is **foundation/sandbox only**.

---

## 8. Explicit non-starts

**R8-B NOT STARTED** — customer booking, sandbox pay, schedule slots.  
**R8-C NOT STARTED** — acquisition, technician workflow, `ImagingStudy`.  
**R8-D NOT STARTED** — radiologist worklist, interpretation, `web-radiologist`.  
**R8-E NOT STARTED** — digital imaging report publication.  
**R8-F NOT STARTED** — physical report + sandbox finance.  
**R9+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No PACS production.**

---

## Final declaration

**FINAL STATUS: R8_A_IMPLEMENTED**

**STOP.**
