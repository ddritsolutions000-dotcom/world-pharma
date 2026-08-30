# 166 — R8-E Imaging digital report publication implementation

**CR:** CR-R8-E-IMPL-166  
**Verdict:** **R8_E_IMPLEMENTED**  
**Date:** 2026-08-29  
**Canonical plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md)  
**Depends:** R8-D [164](164_R8_D_RADIOLOGIST_INTERPRETATION_IMPLEMENTATION.md); audit [165](165_POST_R8_D_AUDIT.md) (**R8_D_GREEN_R8_E_READY**)

---

## 1. Scope delivered (R8-E only)

| Area | Status |
|------|--------|
| `HealthArtifactType.IMAGING_REPORT` | Added (distinct from `LAB_REPORT`) |
| Publication workflow `VERIFIED` → `PUBLISHED` | Server-authoritative, SoD, idempotent |
| Customer report status + published report APIs | Implemented |
| Report versioning + amendment lineage | Immutable published versions; amend → new DRAFT → re-verify → re-publish |
| DB immutability triggers (published versions/lines) | Migrated |
| Notifications / outbox (`IMAGING_REPORT_PUBLISHED`, `IMAGING_REPORT_AMENDED`) | PHI-safe payloads |
| Security events | `IMAGING_REPORT_PUBLISHED`, `IMAGING_REPORT_AMENDED`, `IMAGING_REPORT_CUSTOMER_VIEW` |
| `web-customer` imaging report UI | Real APIs, unavailable-before-publish |
| `mobile` imaging report UI | Parity with web |
| `web-radiologist` publish + amend | Real APIs |
| `admin` imaging report governance metadata | `GET /admin/imaging/reports` |
| E2E suite `r8e.imaging-digital-report.e2e.spec.ts` | 4 tests covering CR scenarios |

## 2. Hard stops respected

| Not started / OFF | Status |
|-------------------|--------|
| R8-F physical report delivery | **NOT STARTED** |
| R9+ | **NOT STARTED** |
| Production PACS / DICOM / image viewer | **OFF** |
| Live money / PSP / carriers | **OFF** |
| LIS/HIS, live e-Rx, automatic refill | **OFF** |
| Production LiveKit / recording | **OFF** |

**R8-E / R8-F boundary:** Digital publication only. No `REPORT_DELIVERY`, physical report request, or delivery finance.

---

## 3. Migrations

| Migration | Purpose |
|-----------|---------|
| `20260829140000_r8e_imaging_report_publication` | `IMAGING_REPORT` enum value (separate transaction) |
| `20260829140100_r8e_imaging_report_publication_body` | `health_artifacts` imaging columns; CHECK; RLS; immutability triggers |
| `20260829140200_r8e_imaging_report_customer_rls` | Customer read RLS for published imaging reports (mirror R7-E) |

---

## 4. APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/radiologist/reports/:id/publish` | Publish verified report (SoD; idempotent) |
| POST | `/api/v1/radiologist/reports/:id/amend` | Start amendment from published version |
| GET | `/api/v1/me/imaging/bookings/:id/report/status` | Customer report availability (no findings when unavailable) |
| GET | `/api/v1/me/imaging/bookings/:id/report` | Customer published report (404 before publish) |
| GET | `/api/v1/admin/imaging/reports?imaging_org_id=` | Admin governance metadata only |

**R8-D unchanged:** worklist, assign, findings, submit, verify remain on existing routes.

---

## 5. Apps / surfaces

### `apps/web-customer`

- `imaging-api.ts`: `fetchImagingReportStatus`, `fetchImagingReport`
- `imaging-bookings-page.tsx` detail: report status, view final report, error states (401/403/404/network/generic)

### `apps/mobile`

- `imaging-api.ts`: report status + report fetch
- `ImagingBookingDetailScreen`: parity with web

### `apps/web-radiologist`

- Publish (VERIFIED), amend (PUBLISHED), boundary display

### `apps/web-radiology`

- No clinical findings exposure (ops metadata unchanged from R8-D)

---

## 6. Security

- **RLS:** `health_artifacts` extended for imaging bookings; published rows guarded by DB triggers
- **Tenancy:** org/country scope on all writes via `runWithTenant`
- **SoD:** enterer ≠ publisher; verifier ≠ enterer on verify; amendment re-enters R8-D verify path
- **PHI:** notifications and security-event metadata exclude findings/report text
- **Customer isolation:** booking ownership enforced; progress endpoint does not leak findings

---

## 7. Tests

| Suite | File | Tests |
|-------|------|-------|
| R8-E | `apps/api/src/radiology/r8e.imaging-digital-report.e2e.spec.ts` | 4 |

Scenarios: publish from verified, pre-publish 404, SoD/unauthorized, customer isolation, idempotent publish, immutability, amendment lineage, cancelled study blocked, PHI-safe outbox/security events, progress boundary.

---

## 8. Regression

Run with test DB (`worldpharma_test`) and `REDIS_URL` set:

- R8-E, R8-D, R8-C, R8-B, R8-A, R7, R6, R5, R3, RLS (per CR-166 authorization)

---

## 9. Verdict

**R8_E_IMPLEMENTED** — sandbox digital imaging report publication complete. **R8-F NOT STARTED.**
