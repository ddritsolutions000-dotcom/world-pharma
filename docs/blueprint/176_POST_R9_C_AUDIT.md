# 176 — Post-R9-C audit

**CR:** CR-POST-R9-C-AUDIT-176  
**Verdict:** **R9_C_GREEN_R9_D_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [175](175_R9_C_CONSENT_SCOPE_IMPLEMENTATION.md)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [174](174_POST_R9_B_AUDIT.md) (**R9_B_GREEN_R9_C_READY**)

---

## Executive summary

Repository inspection and automated verification confirm **R9-C consent-scope enforcement is implemented within Book 170 R9-C scope**. The existing `ConsentService` / `ClinicalAccessService` kernel was extended — **no duplicate consent kernel**. Protected clinical payload reads for doctors are authorized server-side via `evaluateForArtifactRead()` and `HealthAccessService.assertCanReadArtifactPayload()`. The **critical acceptance sequence** (grant → authorized read → revoke → immediate 403 without PHI → denied audit persisted → re-grant → authorized read) is covered by dedicated e2e tests and **PASS** in this audit session.

**No product-level security or functional blockers** were identified for R9-C acceptance.

**Automated verification (this session):** R9-C e2e **3/3**, consent-scope unit **3/3**, R9-A e2e **1/1**, expanded API regression **52/52** (22 suites), web-customer **24/24**, mobile **10/10**. Migrations **70/70 applied**, zero pending.

**Runtime:** API, web, Android, and iOS **interactive runtime not executed** (`API_NOT_RUNNING`, `WEB_NOT_RUNNING`, `ANDROID_RUNTIME_NOT_VERIFIED`, `IOS_RUNTIME_NOT_VERIFIED`).

---

## Audit scope

Documentation-only audit of CR-R9-C-IMPL-175 against Books [170](170_R9_IMPLEMENTATION_PLAN.md)–[175](175_R9_C_CONSENT_SCOPE_IMPLEMENTATION.md) and repository source. **No code, schema, migration, test, or configuration changes** (except this book and index/roadmap updates).

---

## 1. R9-C implementation verification (Book 175 claims)

| Claim | Status | Evidence |
|-------|--------|----------|
| `consent-scope.ts` | **VERIFIED** | `apps/api/src/clinical/consent-scope.ts` — purposes, scope parse/normalize, denial messages |
| `ConsentService` extensions | **VERIFIED** | `consent.service.ts` — `assertAllowedConsentPurpose`, `normalizeConsentScopeInput`, idempotent grant/revoke |
| `evaluateForArtifactRead()` | **VERIFIED** | `clinical-access.service.ts` L117–225 — full doctor matrix |
| `assertCanReadArtifactPayload()` | **VERIFIED** | `health-artifact.service.ts` `HealthAccessService` L73–117 |
| Doctor payload route | **VERIFIED** | `health-doctor.controller.ts` — `GET health/patients/:patientPersonId/artifacts/:id/payload` (`@RequireAudiences('doctor')`) |
| Customer consent UI scope chips | **VERIFIED** | `consent-page.tsx`, `customer-features.tsx` `ConsentScreen` — `CONSENT_SCOPES`, grant POST `scope` |
| Health consent error states | **VERIFIED** | `health-utils.ts` (web + mobile) — `consent_revoked`, `consent_expired`, `consent_required`; artifact screens render dedicated empty states |
| `payload_available = Boolean(publishedAt)` | **VERIFIED** | `health-artifact.service.ts` L286 `presentMetadata()` |
| No duplicate consent kernel | **VERIFIED** | Single `ConsentService`; scope rules in shared `consent-scope.ts` module only |
| Fresh-transaction denied audits | **VERIFIED** | `recordAccess()` uses `runWithTenant(..., { fresh: true })` L37–55 |
| Patient tenant for doctor artifact load | **VERIFIED** | `asPatientTenant()` + `authTenantContext(patientPersonId)` L183–202 |

---

## 2. Critical security acceptance (revoke blocks next access)

| Step | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| 1 | Valid patient artifact | **PASS** | `publishLabHealthArtifactFixture` publishes LAB_REPORT |
| 2 | Valid doctor relationship | **PASS** | `ensureClinicalRelationship` ACTIVE CARE |
| 3 | Valid consent | **PASS** | `POST /consent/grants` purpose `treatment`, scope `LAB_REPORT` |
| 4 | Doctor reads payload → 200 | **PASS** | r9c e2e L92–97 |
| 5 | Patient revokes | **PASS** | `POST .../revoke` → 200 |
| 6 | Same doctor immediate re-read | **PASS** | Same URL, same tokens |
| 7 | Denied with canonical auth error | **PASS** | **403** Forbidden |
| 8 | No clinical payload / PHI | **PASS** | `JSON.stringify(body)` does not match `/Hemoglobin|"14"/` |
| 9 | Denied audit persisted | **PASS** | `health_artifact_access_audits` row `allowed=false`, `reason=consent_revoked` (queried with patient tenant context) |
| 10 | Security event | **PASS** (code) | `HEALTH_ARTIFACT_READ` `outcome=failure` with `artifact_id`, `reason`, `audit_id` only — no PHI in metadata |
| 11 | Re-grant valid consent | **PASS** | New grant POST after revoke |
| 12 | Doctor can read again | **PASS** | 200 + payload value `14` |

**Authorization is server-side:** each payload read calls `activeGrant()` against DB; no client-side consent cache in API path.

---

## 3. Consent matrix

### Valid paths (code + tests)

| Case | Code | Automated test |
|------|------|----------------|
| Active consent + relationship + purpose + scope + country | `evaluateForArtifactRead` allow branch | r9c grant→read |
| Empty scope defaults to LAB+IMAGING | `parseConsentScope` / ED-R9-06 | `consent-scope.spec.ts` |
| Re-grant after revoke | `ConsentService.grant` creates new ACTIVE row | r9c re-grant test |

### Invalid / denied paths

| Case | Expected | Code path | Automated test | PHI-safe on deny |
|------|----------|-----------|----------------|------------------|
| No consent | 403 `consent_missing_or_inactive` | L171–199 | r9c deniedBeforeGrant | **YES** |
| Revoked consent | 403 `consent_revoked` | L180–186, L201–202 | r9c revoke flow | **YES** |
| Expired consent | 403 `consent_expired` | L188–197, L207–208 | r9c expired test | **YES** |
| Wrong purpose (query) | 400 validation | `health-doctor.controller` L37–38 | telemedicine → 400 | **YES** |
| Unsupported grant purpose | 400 validation | `assertAllowedConsentPurpose` | invalid-purpose → 400 | **YES** |
| Artifact outside scope | 403 `scope_mismatch` | L216–217 | IMAGING-only grant + LAB artifact | **YES** |
| Wrong doctor | 403 | `not_a_doctor` / no relationship / no consent | otherDoctor token | **YES** |
| No relationship | 403 `no_relationship` | L160–161 | deniedBeforeGrant (no grant; also no consent) | **YES** |
| Inactive relationship | 403 `no_relationship` | ACTIVE filter L157 | **Not dedicated e2e** | Code only |
| Wrong patient (doctor route) | 404 artifact not found | `loadPatientArtifact` ownership check | **Not dedicated e2e** | **YES** (404, no body) |
| Wrong organization | 403 `organization_mismatch` | L163–164, L213–214 | **Not dedicated e2e** | Code only |
| Wrong country | 403 `country_mismatch` | L139–140, L210–211 | **Not dedicated e2e** | Code only |
| Disabled health pack | 403 | controller + `health_timeline_disabled` | r9a (patient routes) | **YES** |
| Unauthenticated | 401 | `JwtAuthGuard` | **Implicit** (guard) | **YES** |
| Malformed scope | 400 | `parseConsentScope` | NOT_A_REAL_TYPE → 400 | **YES** |
| Malformed purpose (grant) | 400 | `assertAllowedConsentPurpose` | **PASS** | **YES** |

**Error messages** use generic consent/denial copy — no clinical findings, diagnosis, or report text in Problem `detail` fields.

---

## 4. Patient self-access

| Check | Status | Evidence |
|-------|--------|----------|
| Patient reads own artifact without doctor consent | **PASS** | r9c e2e third test; `patient_self` short-circuit L127–128 |
| Patient cannot read another patient's artifact | **PASS** | r9a `foreignMeta`/`foreignPayload` → 404, no PHI |
| Revoked doctor consent does not block patient self-read | **PASS** (architectural) | `patient_self` bypasses consent evaluation; revoke affects doctor path only |
| Patient self-read after revoke in same fixture | **Not explicit e2e** | Non-blocking; logic path verified in code |

---

## 5. Scope / purpose rules (Book 170 / ED-R9-05, ED-R9-06)

| Rule | Status |
|------|--------|
| R9 v1 types only: `LAB_REPORT`, `IMAGING_REPORT` | **PASS** — `HEALTH_CONSENT_ARTIFACT_TYPES` |
| Fail-closed invalid scope values | **PASS** — `parseConsentScope` throws 400 on grant; `scope_mismatch` on read |
| Empty/null scope → both types | **PASS** — unit test + `normalizeConsentScopeInput` |
| Telemedicine consent does not authorize artifact read | **PASS** — `ARTIFACT_READ_PURPOSES` excludes telemedicine; query rejected 400 |
| No `PRESCRIPTION_STRUCTURED` projection | **PASS** — not in scope enum; R9-E not started |

---

## 6. Revoke semantics

| Risk | Status | Notes |
|------|--------|-------|
| Stale consent cache | **NONE FOUND** | `activeGrant()` queries DB each request |
| Token-only authorization | **NOT PRESENT** | JWT provides identity; consent evaluated per read |
| Frontend-only enforcement | **NOT PRESENT** | Doctor UI not built; customer health UI calls server `/payload` |
| Race revoke vs read | **ACCEPTABLE** | Revoke commits in own transaction; next read sees `REVOKED` status |
| Request rollback drops deny audit | **FIXED** | `recordAccess` fresh transaction (Book 175) |

---

## 7. Access audit

| Check | Status | Evidence |
|-------|--------|----------|
| Allowed reads audited | **PASS** | r9a audits `allowed=true` on patient payload |
| Denied reads persisted | **PASS** | r9c `consent_revoked` audit after 403 |
| Denied audit survives rollback | **PASS** | fresh transaction pattern |
| Audit fields metadata-only | **PASS** | schema: IDs, purpose, reason, allowed — no report body columns |
| `HEALTH_ARTIFACT_READ` events PHI-safe | **PASS** | metadata: `artifact_id`, `artifact_type`, `allowed`, `reason`, `audit_id` |

---

## 8. RLS / tenancy

| Check | Status | Evidence |
|-------|--------|----------|
| FORCE RLS on health tables | **PASS** | r9a migration; rls e2e table checks |
| `worldpharma_app` NOSUPERUSER | **PASS** | `rls.tenancy.e2e.spec.ts` |
| `worldpharma_app` NOBYPASSRLS | **PASS** | same |
| `USING(true)` count = 0 (live DB) | **PASS** | `rls.tenancy.e2e` B-RLS-01 test in regression batch |
| Patient A ↛ patient B | **PASS** | r9a foreign timeline/meta/payload |
| Doctor A ↛ patient B (without relationship/consent) | **PASS** | r9c wrongDoctor → 403 |
| Org / country isolation | **PASS** (RLS + code) | r3.isolation + rls cross-tenant tests in batch |
| No R9-C weakening of R9-A/R7/R8 policies | **PASS** | No new R9-C migrations; patient tenant pattern only |

---

## 9. Regression (audit session)

| Suite group | Suites | Tests | Result |
|-------------|--------|-------|--------|
| R9-A (`r9a.health-record-kernel`) | 1 | 1 | **PASS** |
| R9-C (`r9c.consent-scope-enforcement` + `consent-scope.spec`) | 2 | 6 | **PASS** |
| RLS (`rls.tenancy`) | 1 | (in batch) | **PASS** |
| R7 (`r7a`–`r7f`) | 6 | (in batch) | **PASS** |
| R8 (`r8a`–`r8f`) | 6 | (in batch) | **PASS** |
| R3 (`r3.isolation`) | 1 | (in batch) | **PASS** |
| R5 (`prescription`) | 1 | (in batch) | **PASS** |
| R6 (`r6a`–`r6e`) | 5 | (in batch) | **PASS** |
| **Expanded API batch total** | **22** | **52** | **PASS** |
| `r8c.imaging-acquisition` (isolated) | 1 | 1 | **PASS** (this session; historically flaky — isolation debt) |
| web-customer | 8 | 24 | **PASS** |
| mobile | 4 | 10 | **PASS** |

**Not run:** full API suite (46 e2e files). Focused batch covers R9, RLS, R7, R8, R3, R5, R6 as required.

**Failure classification:** No failures in this audit session.

---

## 10. R9-C security test coverage

| Required case | Covered |
|---------------|---------|
| Grant → authorized read | **YES** |
| Revoke → immediate denial | **YES** |
| Expired → denial | **YES** |
| Scope mismatch → denial | **YES** |
| Purpose mismatch → denial | **YES** (query + grant validation) |
| Re-grant → authorized read | **YES** |
| Wrong actor | **YES** (wrong doctor) |
| Cross-tenant isolation | **PARTIAL** — r9a patient isolation + r3/rls batch; doctor wrong-patient/org/country not dedicated |
| PHI leakage prevention | **YES** — grep assertions on deny bodies |
| Unit tests for decision logic | **YES** — `consent-scope.spec.ts` (3 tests) |

---

## 11. UI audit (customer web + mobile)

| State | Web | Mobile (shared RN) |
|-------|-----|-------------------|
| Consent required | **PASS** — `consent_required` empty state | **PASS** |
| Consent revoked | **PASS** | **PASS** |
| Consent expired | **PASS** | **PASS** |
| Forbidden | **PASS** — `PermissionDeniedState` | **PASS** |
| Unavailable / not found | **PASS** | **PASS** |
| Disabled health pack | **PASS** | **PASS** |
| Network retry | **PASS** (web) | **PASS** (payload network) |
| No fabricated clinical data | **PASS** — payload only from API response | **PASS** |
| Server authoritative | **PASS** — no client-side consent bypass for reads | **PASS** |

Consent grant UI sends `scope` to server; does not pre-authorize payload display.

---

## 12. Mobile parity

| Check | Status |
|-------|--------|
| Shared RN implementation | **PASS** — `health-features.tsx`, `customer-features.tsx`, `health-utils.ts`, `consent-api.ts` |
| Automated tests | **PASS** — 10/10 |
| Typecheck | **PASS** |
| Android runtime | **NOT VERIFIED** |
| iOS runtime | **NOT VERIFIED** (`IOS_RUNTIME_NOT_VERIFIED`) |

---

## 13. Migrations

| Check | Result |
|-------|--------|
| Migration count | **70** |
| Pending migrations | **0** (`prisma migrate status` — database schema is up to date) |
| R9-C additive migrations | **None** — R9-C used application-layer enforcement only |
| Destructive changes | **None** in R9-C |
| RLS enabled/forced on health tables | **Unchanged from R9-A** |

---

## 14. Runtime

| Check | Result |
|-------|--------|
| API `/health/ready` | **NOT VERIFIED** — API not running on localhost:3001 |
| Live consent grant/revoke/payload | **NOT VERIFIED** — supertest e2e provides automated substitute |
| Web interactive `/health` | **NOT VERIFIED** |
| Android / iOS interactive | **NOT VERIFIED** |

Build/typecheck/e2e constitute **automated verification** only.

---

## 15. R9-D boundary scan

| Item | Status |
|------|--------|
| Doctor health timeline API/UI | **NOT STARTED** — no `GET /health/patients/.../timeline` |
| web-doctor health routes | **NOT STARTED** — no matches in `apps/web-doctor/src` |
| mobile-doctor health screens | **NOT STARTED** |
| Prescription artifact projection (R9-E) | **NOT STARTED** |
| Admin consent audit UI (R9-F) | **NOT STARTED** |
| Break-glass clinical bridge for health reads | **NOT STARTED** — existing `security:break_glass` is platform authority only, not health payload bridge |

**In-scope R9-C artifact:** `HealthDoctorController` exposes **payload only** for e2e/consent kernel verification — not R9-D product UI.

---

## 16. Known debt status

| Debt (Book 175 / prior) | Status |
|-------------------------|--------|
| `payload_available` always true (Books 172/174) | **CLOSED** — `Boolean(publishedAt)` |
| Consent scope enforcement not implemented (Book 174) | **CLOSED** — R9-C complete |
| shared-DB policyPack isolation (`r8c`) | **Intermittent** — **PASS** this session; classified **infrastructure/test-isolation debt**, not R9-C blocker |
| iOS runtime not verified | **OPEN** — non-blocking |
| R9-D not implemented | **Expected** — next authorized CR |
| Mobile Health screen-level tests thin (Book 174) | **OPEN** — non-blocking |
| R9-C negative matrix gaps (inactive relationship, org/country doctor path) | **OPEN** — test coverage debt; code paths exist |

---

## 17. Verdict breakdown

### PRODUCT BLOCKERS

**None identified.**

### NON-BLOCKING TECHNICAL DEBT

1. R9-C e2e does not exhaust every negative matrix row (inactive relationship, doctor org/country mismatch, unauthenticated doctor payload) — logic implemented, tests partial.
2. Patient self-read immediately after revoke not in single e2e flow (architecturally safe).
3. iOS / Android / web / API interactive runtime not verified in audit session.
4. Mobile Health screen-level integration tests remain thin (inherited from R9-B).
5. `r8c` policyPack isolation may flake under parallel load (historical).

### INFRASTRUCTURE / RUNTIME LIMITATIONS

- `API_NOT_RUNNING`, `WEB_NOT_RUNNING`, `ANDROID_RUNTIME_NOT_VERIFIED`, `IOS_RUNTIME_NOT_VERIFIED`

---

## 18. Final verdict

**R9_C_GREEN_R9_D_READY**

R9-C product and security acceptance criteria are met. Consent-scope enforcement is server-authoritative; revoke blocks the next protected clinical payload read without PHI leakage; audits and security events remain metadata-only.

**Next authorized step:** `CR-R9-D-IMPL-177` (Doctor Health workflow per Book 170). **Do not start R9-D until explicitly authorized.**

---

## 19. Hard stop

This audit CR is complete. No implementation work performed.
