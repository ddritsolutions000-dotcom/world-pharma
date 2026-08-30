# 180 — Post-R9-E audit

**CR:** CR-POST-R9-E-AUDIT-180  
**Verdict:** **R9_E_GREEN_R9_F_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [179](179_R9_E_PRESCRIPTION_HEALTH_ARTIFACT_IMPLEMENTATION.md)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [178](178_POST_R9_D_AUDIT.md) (**R9_D_GREEN_R9_E_READY**)

---

## Executive summary

Repository inspection confirms **R9-E prescription → `PRESCRIPTION_STRUCTURED` HealthArtifact projection is implemented within Book 170 R9-E scope**. Issued prescriptions project idempotently into the existing R9-A kernel; amendments supersede prior artifacts and timeline events; payload delegates to `PrescriptionService.customerPrescriptionForHealth()` without duplicating clinical storage; doctor reads reuse the **single R9-C/R9-D authorization kernel** with `PRESCRIPTION_STRUCTURED` in consent scope.

**No product-level security or functional blockers** were identified for R9-E acceptance.

### Automated verification

| Session | Status |
|---------|--------|
| **This audit session** | **DATABASE_NOT_AVAILABLE** — Docker Desktop / Postgres at `127.0.0.1:55432` unreachable; `docker compose up` failed; Jest globalSetup and `prisma migrate status` could not connect |
| **Implementation session (Book 179)** | Last verified automated baseline — see §16 |

**This audit session (static only):** typechecks **5/5 PASS** (api, web-customer, web-doctor, mobile, mobile-doctor).

**Runtime:** API `/health/ready` **API_NOT_RUNNING**; browser **BROWSER_RUNTIME_NOT_VERIFIED**; Android **ANDROID_RUNTIME_NOT_VERIFIED**; iOS **IOS_RUNTIME_NOT_VERIFIED**.

---

## Audit scope

Documentation and static code audit of CR-R9-E-IMPL-179 against Books [170](170_R9_IMPLEMENTATION_PLAN.md), [179](179_R9_E_PRESCRIPTION_HEALTH_ARTIFACT_IMPLEMENTATION.md), and repository source. **No code, schema, migration, test, or configuration changes** (except this book and index/roadmap updates).

---

## 1. R9-E implementation verification (Book 179 claims)

| Claim | Status | Evidence |
|-------|--------|----------|
| `PRESCRIPTION_STRUCTURED` enum | **VERIFIED** | `20260829170000_r9e_prescription_health_artifact`; `schema.prisma` `HealthArtifactType` |
| Prescription FKs on `health_artifacts` | **VERIFIED** | `prescription_id`, `prescription_version_id` + FKs + unique index on version; CHECK constraint in `20260829170100` |
| Projection on issue | **VERIFIED** | `prescription.service.ts` L206–220 → `healthProjection.projectIssuedVersion()` inside issue transaction |
| Projection on amend | **VERIFIED** | `prescription.service.ts` L310–324 → `projectAmendedVersion()` |
| Idempotent issue projection | **VERIFIED** | `health-prescription-projection.service.ts` L38–43 `findUnique({ prescriptionVersionId })` |
| Amend supersede lifecycle | **VERIFIED** | L88–105: prior artifact `SUPERSEDED`; timeline event `SUPERSEDED` |
| Worker tenant for RLS insert | **VERIFIED** | `runWithTenant(workerTenantContext(...))` wraps projection (matches R7-E/R8-E pattern) |
| Payload delegate (no duplicate PHI store) | **VERIFIED** | `health-artifact.service.ts` L413–423 → `customerPrescriptionForHealth()` |
| `PRESCRIPTION_STRUCTURED` in consent scope | **VERIFIED** | `consent-scope.ts` L6–10 `HEALTH_CONSENT_ARTIFACT_TYPES` |
| No second health-artifact kernel | **VERIFIED** | Reuses `HealthArtifactService`, `HealthTimelineService`, `HealthAccessService` |
| Draft Rx not projected | **VERIFIED** | Projection only in `issue()` / `amend()` after seal |
| Health pack gate | **VERIFIED** | `projectIssuedVersion()` L33–36 `isHealthTimelineEnabled` early return |
| R9-F not started | **VERIFIED** | No `BreakGlassBridge`; no `/admin/health/*` in `apps/api` |

---

## 2. Prescription → HealthArtifact projection

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Deterministic source linkage | **PASS** | `prescription_id` + `prescription_version_id` on artifact; timeline `source_module: clinical`, `source_id: version_id` |
| One active artifact per version | **PASS** | Unique `prescription_version_id`; amend creates new version row |
| Patient ownership preserved | **PASS** | `personId: patientPersonId` on artifact |
| Country/tenant boundaries | **PASS** | `countryId` on artifact; RLS `app.can_person` / prescription paths |
| Safe to retry | **PASS** (code) | Idempotent `findUnique` before create; timeline `projectArtifactPublished` dedupes by `sourceModule+sourceId+eventType` |
| No unrelated table duplication | **PASS** | Clinical lines remain in `prescription_lines`; health reads delegate |

---

## 3. Issue projection & customer timeline

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Issue creates artifact + timeline | **PASS** (code + Book 179 e2e) | `projectIssuedVersion()` L46–71 |
| Timeline metadata-only | **PASS** | r9e e2e L258 `not.toMatch(/Paracetamol|every 6 hours/)` |
| Correct artifact type | **PASS** | r9e e2e L255–265 `PRESCRIPTION_STRUCTURED`, `source_module: clinical` |
| Chronological ordering | **PASS** (code) | Existing R9-A `occurred_at DESC` unchanged |
| Patient isolation | **PASS** | r9e cross-patient test L381–395 `[403, 404]` + no PHI |

---

## 4. Amendment supersede

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Prior artifact SUPERSEDED | **PASS** (Book 179 e2e) | r9e L295–296 |
| New artifact ACTIVE | **PASS** | r9e L296, L304–305 |
| Timeline shows one active Rx entry | **PASS** | r9e L301–305 |
| Payload reflects amended lines | **PASS** | r9e L331 `2 tablets every 8 hours` |
| Immutable history (no silent overwrite) | **PASS** | New artifact row per version; prior status SUPERSEDED |

---

## 5. Customer artifact metadata + payload

| Route | Status | Evidence |
|-------|--------|----------|
| `GET /api/v1/health/artifacts/:id` | **PASS** | r9e metadata test; `presentMetadata()` includes `clinical` source |
| `GET /api/v1/health/artifacts/:id/payload` | **PASS** | r9e payload test; patient self-access via `resolvePayload` |
| Metadata has no clinical body | **PASS** | `presentMetadata()` — type, title, timestamps, source pointers only |
| Payload after auth only | **PASS** | `loadOwnedArtifact` + ownership check |

---

## 6. Doctor artifact metadata + payload

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Reuses R9-D doctor routes | **PASS** | Unchanged `health-doctor.controller.ts` paths |
| `PRESCRIPTION_STRUCTURED` scope grant | **PASS** | r9e L350–366 grant with `scope: ['PRESCRIPTION_STRUCTURED']` |
| Denied without consent | **PASS** | r9e L342–348 → 403, no PHI |
| Authorized with consent | **PASS** | r9e L360–366 → 200 with lines |
| No second doctor auth path | **PASS** | `assertCanReadArtifactPayload()` unchanged |

---

## 7. Consent enforcement & revoke

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R9-C kernel reused | **PASS** | `ClinicalAccessService` + `HealthAccessService` |
| Revoke → immediate 403 | **PASS** | r9e L368–378 |
| No PHI on denial | **PASS** | `not.toMatch(/Paracetamol|every 6 hours/)` |
| Scope includes `PRESCRIPTION_STRUCTURED` | **PASS** | `consent-scope.ts`; `consent-scope.spec.ts` (Book 179) |
| Default scope includes all three types | **PASS** | `parseConsentScope(null)` → LAB, IMAGING, PRESCRIPTION |

**Coverage debt:** Wrong-purpose / expired-consent / wrong-organization negatives for prescription artifacts not duplicated in r9e (covered by r9c/r9d matrix for lab/imaging; prescription scope path is identical code).

---

## 8. RLS / database

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Migration count | **VERIFIED (static)** | **74** migration folders; 4 R9-E migrations (`20260829170000`–`70300`) |
| Migrations applied (live DB) | **NOT VERIFIED THIS SESSION** | `DATABASE_NOT_AVAILABLE` |
| RLS on `health_artifacts` | **VERIFIED** | Policy `health_artifacts_access` in `20260829170200`; no `USING(true)` |
| FORCE RLS on `health_artifacts` | **VERIFIED** | `20260828180000_r7e` L124 |
| FORCE RLS on `health_timeline_events` | **VERIFIED** | `20260829160000_r9a` L96 |
| `USING(true)` on health tables | **0** | Grep: no `USING(true)` in R9-E or R9-A health migrations |
| `worldpharma_app` role | **UNCHANGED** | R9-E migrations grant only `UPDATE` on `health_artifacts`; no role attribute changes |
| Prescription FK/CHECK/index | **VERIFIED** | `20260829170100` — FKs, partial unique index, type CHECK includes `PRESCRIPTION_STRUCTURED` branch |
| UPDATE grant for supersede | **VERIFIED** | `20260829170300_r9e_health_artifacts_update_grant` |

---

## 9. PHI safety

| Surface | Status | Evidence |
|---------|--------|----------|
| Timeline | **PASS** | Metadata only; r9e negative assertion |
| Artifact metadata | **PASS** | No lines/dosage in `presentMetadata()` |
| Payload | **PASS** | Delegated PHI after auth |
| Outbox `PRESCRIPTION_ISSUED` | **PASS** | `prescription_id`, `patient_person_id`, `version_id`, `status` only — no line text |
| Security events | **PASS** | `metadata: { prescription_id }` only |
| Access audits | **PASS** | Reason codes via existing `HealthAccessService.recordAccess()` |

---

## 10. LAB_REPORT / IMAGING_REPORT regression

| Area | Status | Evidence |
|------|--------|----------|
| Lab projection unchanged | **VERIFIED** | `pathology.service.ts` lab hook intact; CHECK still requires lab FKs for `LAB_REPORT` |
| Imaging projection unchanged | **VERIFIED** | `interpretation.service.ts` pattern unchanged |
| R9-A kernel | **PASS** (Book 179) | `r9a.health-record-kernel.e2e.spec.ts` |
| R9-C consent | **PASS** (Book 179) | `r9c.consent-scope-enforcement.e2e.spec.ts` |
| R9-D doctor health | **PASS** (Book 179) | `r9d.doctor-health.e2e.spec.ts` |
| R5 prescription domain | **PASS** (Book 179) | `prescription.e2e.spec.ts` |

---

## 11. UI static verification

| App | Real API | Prescription rendering | Hardcoded clinical data |
|-----|----------|------------------------|-------------------------|
| web-customer | **VERIFIED** | `health-report-content.tsx` `PRESCRIPTION_STRUCTURED` branch | **None** — pages call `fetchHealthTimeline` / `fetchHealthArtifactPayload` |
| web-doctor | **VERIFIED** | `health-report-content.tsx` prescription branch | **None** — `fetchDoctorPatientTimeline` / `fetchDoctorArtifactPayload` |
| mobile | **VERIFIED** | `health-features.tsx` + `health-api.ts` | **None** |
| mobile-doctor | **VERIFIED** | `health-features.tsx` + `health-api.ts` | **None** |

Unit tests use `jest.mock('./health-api')` for isolation — production components fetch from API.

---

## 12. Runtime status

| Surface | Result |
|---------|--------|
| API `/health/ready` | **API_NOT_RUNNING** |
| Customer Health flow (interactive) | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Doctor Health flow (interactive) | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Prescription artifact flow (interactive) | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Android | **ANDROID_RUNTIME_NOT_VERIFIED** |
| iOS | **IOS_RUNTIME_NOT_VERIFIED** |

Automated e2e (implementation session) provides projection, timeline, payload, consent, and revoke evidence.

---

## 13. R9-F / production boundary scan

| Item | Status |
|------|--------|
| `BreakGlassBridgeService` | **NOT STARTED** — no matches in `apps/api` |
| Admin health governance UI | **NOT STARTED** — no `/admin/health/*` routes |
| Break-glass health clinical bridge | **NOT STARTED** — `break_glass` remains consent purpose allowlist only; pre-existing `company-authority/break-glass` is identity authority, not R9-F health bridge |
| R10+ care navigation | **NOT STARTED** |
| Live PSP / live money | **OFF** (unchanged) |
| Production healthcare / PACS / LIS / live e-Rx | **OFF** (unchanged) |

---

## 14. Defects, debt, and classification

### Product blockers

**None identified.**

### Infrastructure (this audit session)

| Item | Classification |
|------|----------------|
| Docker/Postgres unavailable | **Audit-session limitation** — could not re-run live DB checks or Jest e2e |
| Full-suite `doctor.e2e` shared-DB flake | **Pre-existing debt** (Book 179: passes in isolation) |

### Coverage debt (non-blocking)

| Item | Classification |
|------|----------------|
| Disabled health pack dedicated r9e e2e | Coverage debt (code gate in projection service) |
| Concurrent projection stress test | Coverage debt |
| Wrong-country / wrong-org prescription artifact negatives | Coverage debt (R9-C matrix covers same auth path) |
| Direct duplicate `projectIssuedVersion` unit test | Coverage debt (idempotency covered by unique index + e2e amend flow) |

---

## 15. Regression summary

### This audit session

**NOT EXECUTED** — `DATABASE_NOT_AVAILABLE` (Postgres `127.0.0.1:55432` unreachable; Docker Desktop engine not running).

### Implementation session (Book 179) — last verified automated baseline

| Suite | Result |
|-------|--------|
| `r9e.prescription-health-artifact-projection.e2e.spec.ts` | **4/4 PASS** |
| `r9a.health-record-kernel.e2e.spec.ts` | **PASS** |
| `r9c.consent-scope-enforcement.e2e.spec.ts` | **PASS** |
| `r9d.doctor-health.e2e.spec.ts` | **PASS** |
| `consent-scope.spec.ts` | **PASS** |
| `prescription.e2e.spec.ts` | **PASS** |
| Focused R9 + prescription | **16/16 PASS** (6 suites) |
| Full API | **79 suites, 186 tests — 185 PASS, 1 FAIL** |
| Failing test | `clinical/doctor.e2e.spec.ts` › `covers identity, isolation…` › `xxDenied.status >= 400` — **shared-DB policy pollution**; **PASS in isolation** |

### This audit session — typecheck

| Target | Result |
|--------|--------|
| api, web-customer, web-doctor, mobile, mobile-doctor | **5/5 PASS** |

---

## 16. Final verdict

**R9_E_GREEN_R9_F_READY**

R9-E prescription health artifact projection meets Book 170 acceptance for:

- Deterministic, idempotent `PRESCRIPTION_STRUCTURED` projection on issue
- Amendment supersede without silent history overwrite
- Customer timeline (metadata-only) and authorized payload access
- Doctor access via existing R9-C/R9-D consent kernel with `PRESCRIPTION_STRUCTURED` scope
- Revoke → immediate 403 without PHI leakage
- Additive migrations with RLS/FORCE RLS on health tables; zero `USING(true)` on R9 health data
- PHI-safe outbox, security events, and access audits
- LAB/IMAGING and R9-A/B/C/D regression green at last verified automated run

**Next authorized implementation:** **CR-R9-F-IMPL-176** (or successor CR per roadmap) — R9-F admin audit + break-glass clinical bridge per Book 170 §R9-F only.

**HARD STOP** — do not implement R9-F during this audit.
