# 178 — Post-R9-D audit

**CR:** CR-POST-R9-D-AUDIT-178  
**Verdict:** **R9_D_GREEN_R9_E_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [177](177_R9_D_DOCTOR_HEALTH_IMPLEMENTATION.md)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [176](176_POST_R9_C_AUDIT.md) (**R9_C_GREEN_R9_D_READY**)

---

## Executive summary

Repository inspection and automated verification confirm **R9-D Doctor Health workflow is implemented within Book 170 R9-D scope**. Doctor patient discovery, timeline (metadata-only), artifact metadata, and artifact payload access reuse the **single R9-C consent/authorization kernel** (`ConsentService`, `ClinicalAccessService`, `HealthAccessService`) — **no duplicate consent system**.

The **critical revoke sequence** (grant → authorized payload → revoke → immediate 403 without PHI → denied audit persisted → re-grant → authorized) is covered by `r9d.doctor-health.e2e.spec.ts` and **PASS** in this audit session.

**No product-level security or functional blockers** were identified for R9-D acceptance.

**Automated verification (this session):** R9-D e2e **3/3**, R9-C e2e **3/3**, R9-A e2e **1/1**, consent-scope unit **3/3**, focused API regression **40/40** (11 suites), **full API regression 182/182** (78 suites), web-doctor **10/10**, web-customer health **16/16**, mobile-doctor **11/11**. Migrations **70/70 applied**, zero pending. Typechecks and `web-doctor` production build **PASS**.

**Runtime:** API `/health/ready` **API_NOT_RUNNING**; browser doctor flow **WEB_NOT_RUNNING**; Android **ANDROID_RUNTIME_NOT_VERIFIED**; iOS **IOS_RUNTIME_NOT_VERIFIED** (Windows host).

---

## Audit scope

Documentation-only audit of CR-R9-D-IMPL-177 against Books [170](170_R9_IMPLEMENTATION_PLAN.md)–[177](177_R9_D_DOCTOR_HEALTH_IMPLEMENTATION.md) and repository source. **No code, schema, migration, test, or configuration changes** (except this book and index/roadmap updates).

---

## 1. R9-D implementation verification (Book 177 claims)

| Claim | Status | Evidence |
|-------|--------|----------|
| Doctor patient discovery API | **VERIFIED** | `doctor.controller.ts` L99–112 `GET me/health-patients`; `doctor.service.ts` L433–461 `listHealthPatients()` |
| Doctor timeline API | **VERIFIED** | `health-doctor.controller.ts` L23–48; `health-artifact.service.ts` L194–229 `getTimelineForDoctor()` |
| Artifact metadata API | **VERIFIED** | `health-doctor.controller.ts` L50–72; `getMetadataForDoctor()` L166–192 |
| Artifact payload API | **VERIFIED** | `health-doctor.controller.ts` L74–96; `getPayloadForDoctor()` (R9-C path unchanged) |
| `evaluateForPatientHealthRead()` | **VERIFIED** | `clinical-access.service.ts` L138–154 |
| `assertCanAccessPatientHealth()` | **VERIFIED** | `health-artifact.service.ts` L74–96 |
| Consent scope filter on timeline | **VERIFIED** | `getTimelineForDoctor()` L222–227 filters by `decision.consentScope` |
| Patient tenant for doctor reads | **VERIFIED** | `asPatientTenant()` + `authTenantContext(patientPersonId)` on artifact/timeline loads |
| Fresh-transaction denied audits | **VERIFIED** | `recordAccess()` `runWithTenant(..., { fresh: true })` L38–56 |
| No duplicate consent kernel | **VERIFIED** | Single `ConsentService` / `ClinicalAccessService`; scope rules in `consent-scope.ts` only |
| Zero new migrations | **VERIFIED** | 70 migration folders; `prisma migrate` reports 70 applied, 0 pending; no R9-D migration folder |
| web-doctor health UI | **VERIFIED** | `app/patients/**`, `patient-picker-panel.tsx`, `patient-health-page.tsx`, `patient-health-artifact-page.tsx` |
| mobile-doctor health UI | **VERIFIED** | `health-features.tsx`, `navigation.ts` patients tab, `app-root.tsx` health screens |
| R9-E not started | **VERIFIED** | No `PRESCRIPTION_STRUCTURED` health projection; comment-only in `consent-scope.ts` L5 |
| R9-F not started | **VERIFIED** | No admin health audit UI; no clinical break-glass bridge in health module |

---

## 2. Doctor patient discovery

**Route:** `GET /api/v1/doctor/me/health-patients?country_code=XX`

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Relationship-scoped only | **PASS** | `clinicalRelationship.findMany` where `doctorPartnerId`, `countryId`, `status: ACTIVE` |
| No unrelated patients | **PASS** (code) | Query scoped to doctor partner + country |
| Metadata only in list | **PASS** | Returns `patient_person_id`, `relationship_id`, `kind`, `status`, `organization_id` — no clinical text |
| Cross-country exclusion | **PASS** (code) | `partner.countryId !== country.id` → 403 `Doctor is not registered in this country` |
| Doctor audience required | **PASS** (code) | `assertDoctorAudience()` on `doctor.controller.ts` |
| No auto-select (UI) | **PASS** (code + test) | `selectedId` initial `''`; web test `does not auto-select a patient`; mobile `disabled={!selectedId}` |

**Coverage debt:** Customer calling `health-patients` not explicitly asserted in `r9d` e2e (code path verified).

---

## 3. Doctor timeline

**Route:** `GET /api/v1/health/patients/:patientPersonId/timeline`

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Relationship authorization | **PASS** | `evaluateDoctorHealthAccess` requires ACTIVE relationship |
| Consent authorization | **PASS** | Same path requires ACTIVE non-expired consent; r9d L98–101 timeline 403 before grant |
| Metadata-only response | **PASS** | `HealthTimelineService.present()` L97–120 — type, title, timestamps, status; no findings/body |
| Consent scope filtering | **PASS** | Post-fetch filter by `consentScope` L222–227 |
| LAB_REPORT support | **PASS** | Fixture + e2e timeline after LAB consent |
| IMAGING_REPORT support | **PASS** (code) | `HealthArtifactType.IMAGING_REPORT` in scope; delegate exists; **no positive e2e** |
| Health pack gate | **PASS** (code) | `assertHealthTimelineEnabled()` on controller |
| No PHI in timeline JSON | **PASS** | r9d L118 `not.toMatch(/Hemoglobin|"14"/)` |

**Note:** Timeline authorization denials do **not** write `health_artifact_access_audits` (only metadata/payload paths audit via `assertCanReadArtifactPayload`). Book 170 §14 audit focus is payload reads — **not a blocker**.

---

## 4. Artifact metadata

**Route:** `GET /api/v1/health/patients/:patientPersonId/artifacts/:id`

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Doctor JWT + audience | **PASS** | `@RequireAudiences('doctor')` on `HealthDoctorController` |
| Full R9-C auth before metadata | **PASS** | `getMetadataForDoctor()` calls `assertCanReadArtifactPayload()` L180–190 |
| `payload_available` flag | **PASS** | `presentMetadata()` L366 |
| No clinical body in metadata | **PASS** | Metadata fields are id, type, title, published_at, status, source pointers |
| Foreign artifact denied | **PASS** | r9d foreign patient test `[403, 404]`; no PHI in body |

---

## 5. Artifact payload & revoke sequence

**Route:** `GET /api/v1/health/patients/:patientPersonId/artifacts/:id/payload`

Continues through `assertCanReadArtifactPayload()` → `evaluateForArtifactRead()` → `evaluateDoctorHealthAccess()` with per-artifact scope.

### Critical revoke sequence

| Step | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| 1 | Valid relationship | **PASS** | `ensureClinicalRelationship` in fixture |
| 2 | Valid consent | **PASS** | Grant POST before payload read |
| 3 | Doctor read → 200 | **PASS** | r9d L127–132 |
| 4 | Patient revokes | **PASS** | r9d L142–144 |
| 5 | Same doctor re-read | **PASS** | r9d L146–148 |
| 6 | → 403 | **PASS** | |
| 7 | No PHI | **PASS** | `not.toMatch(/Hemoglobin|"14"/)` |
| 8 | Denied audit persisted | **PASS** | `allowed: false`, `reason: 'consent_revoked'` L152–158 |
| 9 | Re-grant | **PASS** | r9d L160–167 |
| 10 | Doctor read → 200 | **PASS** | r9d L169–172 |

**Server-side enforcement:** Each read re-queries consent via `activeGrant()` — no client-side cache in API path.

---

## 6. Positive E2E flow

`r9d.doctor-health.e2e.spec.ts` test 1 covers steps 1–15 for **LAB_REPORT** only.

| Step | Covered |
|------|---------|
| Patient/doctor/relationship/consent/artifact | **YES** (fixture) |
| Doctor discovers patient | **YES** L92–96 |
| Timeline (403 then 200) | **YES** L98–117 |
| Metadata + payload | **YES** L120–132 |
| Allowed audit | **YES** L134–140 |
| Revoke → deny → no PHI | **YES** L142–150 |
| Denied audit | **YES** L152–158 |
| Re-grant → 200 | **YES** L160–172 |

**IMAGING_REPORT positive path:** **NOT covered** in R9-D e2e — **coverage debt**, not a product blocker (imaging delegation code exists; scope-mismatch denial tested in R9-C/R9-D negative matrix).

---

## 7. Negative authorization matrix

| Case | Implementation | Automated test | Notes |
|------|----------------|----------------|-------|
| Unauthenticated | **PASS** | r9d L182–183 | 401 |
| Non-doctor (customer on doctor route) | **PASS** | r9d L185–188 | 403 on payload |
| Wrong doctor | **PASS** | r9d L211–214 | 403 |
| No relationship | **PASS** (code) | Implicit via wrong doctor / ended rel | |
| Inactive/ended relationship | **PASS** | r9d L233–244 `ENDED` | 403 |
| No consent | **PASS** | r9d timeline L98–101; r9c payload before grant | 403 |
| Revoked consent | **PASS** | r9d revoke flow | 403 + audit |
| Expired consent | **PASS** | r9d L223–231 | 403, detail matches `/expired/i` |
| Wrong purpose | **PASS** | r9d L216–221 | 400 telemedicine |
| Scope mismatch | **PASS** | r9d L190–200 IMAGING consent on LAB artifact | 403, no PHI |
| Wrong patient (foreign) | **PASS** | r9d L251–255 | 403/404 |
| Wrong organization | **PASS** (code) | `organization_mismatch` in `evaluateDoctorHealthAccess` | **No dedicated e2e** — coverage debt |
| Wrong country | **PASS** (code) | `country_mismatch` doctor vs request country; discovery 403 | **No dedicated e2e** — coverage debt |
| Disabled health pack | **PASS** (code) | `assertHealthTimelineEnabled` / `health_timeline_disabled` | **No dedicated r9d e2e** — coverage debt |
| Foreign artifact | **PASS** | r9d L251–255 | |
| Malformed patient ID | **PASS** (partial) | r9d L257–260 HTTP ≥400 | Unhandled DB error logged — **coverage/UX debt**, not auth bypass |
| Malformed artifact ID | **PASS** (code) | Would hit UUID parse similarly | **Not in r9d e2e** — coverage debt |

All tested denials: **no clinical payload in error bodies**.

---

## 8. Patient self-access regression (R9-B)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Patient timeline | **PASS** | R9-A e2e; web-customer health tests 16/16 |
| Patient artifact metadata/payload | **PASS** | r9d test 3 L281–285 after doctor revoke |
| No doctor consent for self-read | **PASS** | `evaluateForArtifactRead` patient_self bypass L129–131 |
| Doctor revoke does not break patient | **PASS** | r9d L263–286 |

---

## 9. Customer / doctor separation

| Rule | Status | Evidence |
|------|--------|----------|
| Customer ↛ doctor patient routes | **PASS** (code) | `@RequireAudiences('doctor')`; customer payload on doctor URL → 403 (r9d) |
| Customer ↛ another patient's data | **PASS** | R9-A ownership checks; RLS |
| Doctor ↛ unrelated patients | **PASS** | Relationship + consent matrix |
| Doctor ↛ without consent | **PASS** | Timeline/payload 403 before grant |

---

## 10. Web-doctor UI

| Surface | Status | Evidence |
|---------|--------|----------|
| Explicit patient picker | **VERIFIED** | `/patients`, `DoctorPatientPickerPanel` |
| No auto-select | **VERIFIED** | `selectedId` default `''`; unit test |
| Real API | **VERIFIED** | `health-api.ts` `apiCall` to doctor endpoints |
| Timeline + artifact + payload | **VERIFIED** | Routes under `app/patients/[id]/health/**` |
| Consent required/revoked/expired | **VERIFIED** | `classifyDoctorHealthFailure` + `EmptyState` branches |
| Forbidden / disabled / network / empty / loading | **VERIFIED** | `patient-health-page.tsx`, `patient-health-artifact-page.tsx` |
| No hardcoded clinical data | **VERIFIED** | No mock patients in production components |

**Runtime:** Static/source + unit tests only — **WEB_NOT_RUNNING**.

---

## 11. Mobile-doctor UI

| Surface | Status | Evidence |
|---------|--------|----------|
| Patients tab | **VERIFIED** | `navigation.ts` `patients` tab |
| Explicit selection | **VERIFIED** | `DoctorHealthPatientPicker` `selectedId` + disabled button |
| Timeline / artifact / payload | **VERIFIED** | `DoctorHealthTimelineScreen`, `DoctorHealthArtifactScreen` |
| Consent + error states | **VERIFIED** | `HealthErrorState` in `health-features.tsx` |
| Android/iOS parity | **VERIFIED** (source) | Shared RN single implementation |

| Runtime | Status |
|---------|--------|
| Source/static | **VERIFIED** |
| Automated tests | **11/11 PASS** |
| Android emulator | **ANDROID_RUNTIME_NOT_VERIFIED** |
| iOS | **IOS_RUNTIME_NOT_VERIFIED** |

---

## 12. PHI safety

| Layer | Status | Evidence |
|-------|--------|----------|
| Timeline metadata-only | **PASS** | `HealthTimelineService.present()` |
| Metadata no clinical body | **PASS** | `presentMetadata()` |
| Payload after auth only | **PASS** | `assertCanReadArtifactPayload` gate |
| Errors without PHI | **PASS** | e2e `not.toMatch(/Hemoglobin|"14"/)` on denials |
| Security events opaque | **PASS** | `recordAccess` metadata: artifact_id, reason, audit_id only |

---

## 13. Access audits

| Case | Status | Evidence |
|------|--------|----------|
| Allowed payload read | **PASS** | r9d allowed audit L134–140 |
| Denied revoke read | **PASS** | r9d denied audit `consent_revoked` |
| Expired denial | **PASS** (code + r9c/r9d) | `consent_expired` reason path |
| Scope denial | **PASS** (r9c/r9d) | scope_mismatch |
| Survives rollback | **PASS** | `{ fresh: true }` on audit insert |
| No PHI in audit rows | **PASS** | Schema: purpose, reason, IDs only |

---

## 14. RLS / tenancy

| Check | Status | Evidence |
|-------|--------|----------|
| FORCE RLS on health tables | **PASS** | `20260829160000_r9a_health_record_kernel` |
| No `USING(true)` in R9 migrations | **PASS** | Grep: 0 matches in R9-A/R9-C migration SQL |
| Doctor cross-patient isolation | **PASS** (code + e2e) | Relationship + patient tenant context |
| RLS e2e suite | **PASS** | `rls.tenancy.e2e.spec.ts` in focused regression |

`worldpharma_app` NOSUPERUSER / NOBYPASSRLS: inherited from prior RLS repair migrations (unchanged by R9-D).

---

## 15. Database / migrations

| Claim | Verified |
|-------|----------|
| Zero R9-D migrations | **YES** — latest health migrations remain R9-A (`20260829160000`, `20260829160100`) |
| 70 applied, 0 pending | **YES** — prisma migrate output this session |
| R9-A/R9-C schema intact | **YES** — no R9-D schema edits |

---

## 16. Regression results (this session)

### R9-focused

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| `r9a.health-record-kernel.e2e` | 1 | 1 | 0 |
| `r9c.consent-scope-enforcement.e2e` | 3 | 3 | 0 |
| `r9d.doctor-health.e2e` | 3 | 3 | 0 |
| `consent-scope.spec` | 3 | 3 | 0 |

### Expanded API (R9 + RLS + R7a + R8a + R3 + R5 + R6a)

| Suites | Tests | Pass | Fail |
|--------|-------|------|------|
| 11 | 40 | 40 | 0 |

### Full API regression

| Suites | Tests | Pass | Fail |
|--------|-------|------|------|
| 78 | 182 | 182 | 0 |

### UI

| App | Suites | Tests | Pass | Fail |
|-----|--------|-------|------|------|
| web-doctor | 3 | 10 | 10 | 0 |
| web-customer health | 3 | 16 | 16 | 0 |
| mobile-doctor | 3 | 11 | 11 | 0 |

**Failures:** none.

### Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `web-doctor:typecheck` | PASS |
| `mobile-doctor:typecheck` | PASS |
| `web-doctor:build` | PASS |

---

## 17. Runtime status

| Surface | Result |
|---------|--------|
| API `/health/ready` | **API_NOT_RUNNING** |
| Doctor auth + discovery + timeline + payload (interactive) | **NOT RUN** |
| web-doctor browser | **WEB_NOT_RUNNING** |
| mobile-doctor Android | **ANDROID_RUNTIME_NOT_VERIFIED** |
| mobile-doctor iOS | **IOS_RUNTIME_NOT_VERIFIED** |

Automated e2e provides authorization and revoke evidence; build/typecheck provide static UI verification only.

---

## 18. R9-E / R9-F boundary scan

| Item | Status |
|------|--------|
| `PRESCRIPTION_STRUCTURED` HealthArtifact projection | **NOT STARTED** — comment only in `consent-scope.ts` |
| Prescription timeline in health module | **NOT STARTED** — no matches in `apps/api/src/health` |
| R9-F break-glass clinical bridge | **NOT STARTED** — `break_glass` is consent grant purpose only; admin `company-authority/break-glass` is pre-existing identity slice, not R9-F health UI |
| Admin health audit UI | **NOT STARTED** |

---

## 19. Defects, debt, and classification

### Product blockers

**None identified.**

### Coverage debt (non-blocking)

| Item | Classification |
|------|----------------|
| IMAGING_REPORT positive doctor e2e | Coverage debt |
| Wrong-country dedicated r9d e2e | Coverage debt (code enforces) |
| Disabled health pack dedicated r9d e2e | Coverage debt (code enforces) |
| Wrong-organization dedicated e2e | Coverage debt (code enforces) |
| Malformed artifact ID e2e | Coverage debt |
| Customer on `health-patients` e2e | Coverage debt (code enforces) |
| Timeline denial audits | Observation — not required for R9-D payload audit acceptance |

### Infrastructure / UX debt (non-blocking)

| Item | Classification |
|------|----------------|
| Malformed patient ID → unhandled_exception log + HTTP ≥400 | UX/observability debt; denial is fail-closed |
| Interactive runtime not exercised | Runtime limitation |

---

## 20. Final verdict

**R9_D_GREEN_R9_E_READY**

R9-D Doctor Health workflow meets Book 170 acceptance for:

- Relationship-scoped patient discovery with explicit UI selection
- Consent-gated doctor timeline (metadata-only) and artifact access
- R9-C authorization reuse with server-side revoke enforcement
- web-doctor and mobile-doctor surfaces with real API integration
- PHI boundaries and access auditing on protected payload/metadata reads
- R9-A / R9-B / R9-C regression green

**Next authorized implementation:** **CR-R9-E-IMPL-179** — prescription → `HealthArtifact` projection per Book 170 R9-E scope only.

**HARD STOP** — do not implement R9-E during this audit.
