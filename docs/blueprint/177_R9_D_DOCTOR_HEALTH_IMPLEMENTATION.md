# 177 — R9-D Doctor Health workflow implementation

**CR:** CR-R9-D-IMPL-177  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_D_IMPLEMENTED**  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [176](176_POST_R9_C_AUDIT.md) (**R9_C_GREEN_R9_D_READY**)

---

## Scope

R9-D doctor-facing Health workflow on top of the R9-A health record kernel and R9-C consent-scope authorization:

- Doctor Health APIs (timeline metadata, artifact metadata, authorized payload)
- Relationship-scoped patient discovery (explicit selection — no auto-select)
- `web-doctor` patient picker + timeline + artifact screens
- `mobile-doctor` parity (Android/iOS shared RN)
- E2E positive flow + negative authorization matrix subset
- Patient self-access regression after doctor consent revoke

**Explicit non-starts:** R9-E prescription projection, R9-F admin health audit UI / break-glass, R10+, new payment/logistics, PACS/DICOM, LIS/HIS, live PSP/money.

**No new migrations.** Reuses R9-A/R9-C schema and services.

---

## Authorization (reuse R9-C kernel)

All doctor clinical access continues through existing services — **no duplicate consent or authorization system**.

| Layer | Responsibility |
|-------|----------------|
| `ConsentService` | Grant lookup, purpose/scope validation |
| `ClinicalAccessService` | Relationship + consent matrix |
| `ClinicalAccessService.evaluateForPatientHealthRead()` | Timeline list (relationship + consent + purpose; filters by consent scope) |
| `ClinicalAccessService.evaluateForArtifactRead()` | Metadata + payload (adds per-artifact scope check) |
| `HealthAccessService.assertCanAccessPatientHealth()` | Timeline gate + audit |
| `HealthAccessService.assertCanReadArtifactPayload()` | Payload/metadata gate + audit (fresh transaction on deny) |

### Doctor timeline vs artifact reads

| Endpoint | Auth method | Scope check |
|----------|-------------|-------------|
| `GET …/timeline` | `evaluateForPatientHealthRead` | Events filtered to types in consent scope |
| `GET …/artifacts/:id` | `assertCanReadArtifactPayload` (metadata path) | Per-artifact type must be in scope |
| `GET …/artifacts/:id/payload` | `assertCanReadArtifactPayload` | Full R9-C matrix |

Default doctor purpose: `treatment`.

---

## API contracts

### Patient discovery

`GET /api/v1/doctor/me/health-patients?country_code=XX`

- **Auth:** doctor JWT
- **Returns:** ACTIVE `clinical_relationships` for authenticated doctor in country (metadata only)
- **Does not** expose patients outside relationship scope

### Patient health timeline

`GET /api/v1/health/patients/:patientPersonId/timeline?country_code=XX&purpose=treatment&cursor=&limit=&types=`

- **Auth:** doctor JWT + relationship + consent
- **Response:** metadata-only timeline items (no findings/diagnosis/report body)
- **403** when consent missing/revoked/expired or relationship invalid

### Artifact metadata

`GET /api/v1/health/patients/:patientPersonId/artifacts/:id?country_code=XX&purpose=treatment`

- Full R9-C authorization before metadata
- `payload_available: boolean` from `published_at`

### Artifact payload

`GET /api/v1/health/patients/:patientPersonId/artifacts/:id/payload?country_code=XX&purpose=treatment`

- Unchanged R9-C path; delegates to R7 lab / R8 imaging report services
- Revoke → next read **403**, no PHI, denied audit persisted

---

## Web doctor UI (`apps/web-doctor`)

| Route | Component | States |
|-------|-----------|--------|
| `/patients` | `DoctorPatientPickerPanel` | loading, empty, forbidden, network/retry, explicit select |
| `/patients/[patientPersonId]/health` | `DoctorPatientHealthPanel` | consent required/revoked/expired, forbidden, disabled pack, empty, load more |
| `/patients/[patientPersonId]/health/artifacts/[id]` | `DoctorPatientHealthArtifactPanel` | metadata + authorized payload, all consent/error states |

Real API only — no hardcoded patients or clinical data.

---

## Mobile doctor UI (`apps/mobile-doctor`)

| Screen | Feature module | Parity |
|--------|----------------|--------|
| `patients` tab | `DoctorHealthPatientPicker` | Explicit patient select (no auto-select first) |
| `patient-health` | `DoctorHealthTimelineScreen` | Metadata timeline |
| `health-artifact` | `DoctorHealthArtifactScreen` | Metadata + payload |

Shared RN implementation for Android and iOS.

---

## PHI boundaries

- Timeline/list responses: artifact type, title, timestamps, status — **no clinical text**
- Payload: PHI only after successful authorization
- Errors and audits: metadata-only (`health_artifact_access_audits`, security events)

---

## RLS / tenancy

- Doctor artifact reads use **patient tenant context** (`authTenantContext(patientPersonId)`) for RLS on `health_artifacts`
- FORCE RLS unchanged; no `USING(true)` policies added
- Migrations: **70 applied**, **0 pending**

---

## Tests (this session)

| Suite | Result |
|-------|--------|
| `r9d.doctor-health.e2e.spec.ts` | **3/3 PASS** |
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** |
| `r9c.consent-scope-enforcement.e2e.spec.ts` | **3/3 PASS** |
| `consent-scope.spec.ts` | **3/3 PASS** |
| Expanded API (R9 + RLS + R7a + R8a + R3 + R5 rx/refill) | **36/36 PASS** (9 suites) |
| `web-doctor` health UI tests | **10/10 PASS** |
| `web-customer` health regression | **16/16 PASS** |
| `mobile-doctor` navigation + health utils | **11/11 PASS** |

### E2E coverage highlights

**Positive:** discover patient → timeline (403 without consent) → grant → timeline/metadata/payload → audit → revoke → 403 no PHI → re-grant → 200; patient self-access after revoke.

**Negative (subset):** unauthenticated, customer on doctor route, scope mismatch, wrong doctor, wrong purpose, expired consent, ended relationship, foreign patient, malformed patient ID.

### Known test / coverage debt

| Item | Classification |
|------|----------------|
| Wrong country / disabled health pack on doctor routes | Not dedicated in `r9d` e2e (covered by R9-C matrix patterns) |
| IMAGING_REPORT positive doctor path | Fixture is LAB-only; imaging denial covered via scope mismatch |
| Malformed patient ID | Returns unhandled DB error in logs; HTTP ≥400 (acceptable for v1) |
| Interactive browser/mobile runtime | **Not verified** this session |

---

## Typecheck / builds

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `web-doctor:typecheck` | PASS |
| `mobile-doctor:typecheck` | PASS |
| `web-doctor:build` (production) | PASS |

---

## Runtime status

| Surface | Status |
|---------|--------|
| API `/health/ready` (interactive) | **NOT RUN** |
| Doctor auth + patient selection (interactive) | **NOT RUN** |
| Automated e2e | **PASS** (see above) |
| Production build `web-doctor` | **PASS** (static/build verification only) |

---

## Files (primary)

| Area | Path |
|------|------|
| Doctor health controller | `apps/api/src/health/health-doctor.controller.ts` |
| Artifact / timeline service | `apps/api/src/health/health-artifact.service.ts` |
| Clinical access | `apps/api/src/clinical/clinical-access.service.ts` |
| Patient list | `apps/api/src/clinical/doctor.service.ts`, `doctor.controller.ts` |
| R9-D e2e | `apps/api/src/health/r9d.doctor-health.e2e.spec.ts` |
| Web doctor health | `apps/web-doctor/src/health-*.ts(x)`, `patient-*-*.tsx`, `app/patients/**` |
| Mobile doctor health | `apps/mobile-doctor/src/health-*.ts(x)`, `navigation.ts`, `app-root.tsx` |

---

## Next step

**HARD STOP.** Do not start R9-E or R9-F.

Next authorized step: **CR-POST-R9-D-AUDIT-178** → target verdict `R9_D_GREEN_R9_E_READY`.
