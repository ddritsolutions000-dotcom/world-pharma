# 175 — R9-C Consent scope enforcement implementation

**CR:** CR-R9-C-IMPL-175  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_C_IMPLEMENTED**  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [174](174_POST_R9_B_AUDIT.md) (**R9_B_GREEN_R9_C_READY**)

---

## Scope

R9-C consent-scope enforcement for protected clinical payload reads:

- Extend existing `ConsentService` / `ClinicalAccessService` (no duplicate consent kernel)
- `HealthAccessService.assertCanReadArtifactPayload()` on all payload paths
- Doctor payload API (minimal — e2e/testing only, not R9-D UI)
- Customer consent grant UI: purpose + scope chips (web + mobile)
- Health UI consent-related error states (web + mobile)
- Access audit + security events on allow/deny (metadata only, no PHI)

**Explicit non-starts:** R9-D doctor Health UI, R9-E prescription projection, R9-F admin/break-glass, R10+, new payment/logistics.

---

## Consent model (extended)

| Field / rule | Behavior |
|--------------|----------|
| **Purposes (grant)** | `consultation`, `telemedicine`, `treatment`, `break_glass` (grant allowlist) |
| **Purposes (artifact read)** | `consultation`, `treatment` only (**ED-R9-05**) |
| **Scope** | `LAB_REPORT`, `IMAGING_REPORT` (**R9 v1**); empty/missing → both types (**ED-R9-06**) |
| **Grant** | Idempotent: duplicate ACTIVE tuple returns existing grant |
| **Revoke** | Idempotent; status `REVOKED`, `revoked_at` set |
| **Expiration** | `expires_at` enforced on read; in-memory `EXPIRED` when past due |
| **Patient self-read** | `purpose=patient_self` internally; no consent required |

Implementation: `apps/api/src/clinical/consent-scope.ts`, `consent.service.ts`, `clinical-access.service.ts`.

---

## Purpose → artifact mapping (R9 v1)

| Consent scope value | Health artifact type |
|--------------------|----------------------|
| `LAB_REPORT` | `HealthArtifactType.LAB_REPORT` |
| `IMAGING_REPORT` | `HealthArtifactType.IMAGING_REPORT` |

Doctor read purpose `consultation` or `treatment` must match grant purpose. Telemedicine consent does **not** authorize health artifact payload reads in R9-C (video path unchanged).

---

## Authorization matrix (doctor payload read)

All must pass (fail-closed):

1. JWT audience `doctor`
2. Active doctor partner in request country
3. Health timeline enabled in country pack
4. Purpose ∈ `{ consultation, treatment }`
5. ACTIVE clinical relationship (patient + doctor + country)
6. ACTIVE consent grant (matching purpose, not revoked, not expired)
7. Consent `country_id` matches request country
8. Organization match when both relationship and consent carry `organization_id`
9. Consent scope includes artifact type
10. Artifact published (`published_at` set)

Patient path: ownership via `person_id` + country; `patient_self` bypasses consent.

---

## API contract (denials)

| Condition | HTTP | Detail (representative) |
|-----------|------|-------------------------|
| No consent | 403 | Active consent is required… |
| Revoked consent | 403 | Consent … has been revoked |
| Expired consent | 403 | Consent … has expired |
| Scope mismatch | 403 | This consent does not cover the requested health record type |
| Wrong purpose (query) | 400 | purpose must be one of: consultation, treatment |
| Malformed grant purpose/scope | 400 | validation message |
| No relationship | 403 | No active clinical relationship… |
| Wrong doctor / not doctor | 403 | You cannot access this health record |
| Country mismatch | 403 | not available in the requested country |
| Unpublished artifact | 404 | Report is not published yet |
| Unauthenticated | 401 | — |

Clinical payload is **never** returned with an authorization error.

### Routes

| Method | Path | Audience | Notes |
|--------|------|----------|-------|
| GET | `/api/v1/health/artifacts/:id/payload` | customer | Patient self-read |
| GET | `/api/v1/health/patients/:patientPersonId/artifacts/:id/payload` | doctor | `country_code`, `purpose` required |

---

## Revoke semantics

1. Patient revokes via existing `POST /api/v1/consent/grants/:id/revoke`
2. Grant status → `REVOKED` (committed)
3. **Next** doctor payload read evaluates consent → **403**, no PHI
4. `health_artifact_access_audits` row: `allowed=false`, `reason=consent_revoked`
5. `HEALTH_ARTIFACT_READ` security event: `outcome=failure`
6. New grant after revoke restores access when scope/purpose/relationship valid

Access audits persist on deny via **fresh tenant transaction** (request transaction rollback no longer drops denied-read audits).

---

## Security / RLS

- No new permissive RLS policies; doctor artifact metadata/payload loads use **patient tenant context** (`authTenantContext(patientPersonId)`) only after route validation, while consent/relationship checks run in doctor context.
- `health_artifact_access_audits`: INSERT allowed for actor; SELECT for patient/actor/platform.
- `payload_available` metadata now `Boolean(publishedAt)` (Book 172/174 debt closed).

---

## Backend modules

| Module | Role |
|--------|------|
| `consent-scope.ts` | Scope/purpose validation, denial messages |
| `consent.service.ts` | Grant/revoke validation, normalized scope in responses |
| `clinical-access.service.ts` | `evaluateForArtifactRead()` |
| `health-artifact.service.ts` | `HealthAccessService`, patient/doctor payload paths |
| `health-doctor.controller.ts` | Doctor payload route (R9-C test hook) |
| `publish-lab-health-artifact.ts` | E2E fixture helper |

---

## Customer UI (R9-C)

### Web + mobile consent grant

- `CONSENT_PURPOSES`: added `treatment`
- `CONSENT_SCOPES`: `LAB_REPORT`, `IMAGING_REPORT` toggle chips
- Grant POST includes `scope` array

### Web + mobile health artifact

- `classifyHealthApiFailure`: `consent_revoked`, `consent_expired`, `consent_required`
- Artifact detail screens show dedicated empty states for consent-related forbidden messages

---

## Tests

| `consent-scope.spec.ts` | 3 unit | PASS |
| `r9c.consent-scope-enforcement.e2e.spec.ts` | 3 e2e | PASS |
| `r9a.health-record-kernel.e2e.spec.ts` | 1 e2e | PASS (regression) |
| Focused regression batch (R9, RLS, R7-E, R8-E, R3, R5, R6-A) | 37 tests / 8 suites | PASS |
| `web-customer` tests | 24 | PASS |
| `mobile` tests | 10 | PASS |
| Typecheck (api, web-customer, mobile) | — | PASS |
| `web-customer` production build | — | PASS |

E2E covers: grant → read → revoke → 403 (no PHI) → re-grant → read; scope/expired/wrong doctor/malformed scope/purpose; patient self-read without doctor consent.

---

## Known debt

| Item | Classification |
|------|----------------|
| `r8c.imaging-acquisition.e2e` policyPack unique constraint | Prior test-isolation debt |
| iOS interactive runtime | `IOS_RUNTIME_NOT_VERIFIED` |
| API live runtime in this CR | Build/test verified; interactive smoke optional |
| R9-D doctor timeline/metadata APIs | Out of scope (R9-D) |
| Break-glass / admin consent audit UI | R9-F |

---

## Next step

**CR-POST-R9-C-AUDIT-176** — documentation audit only. R9-D must not start until audit returns **R9_C_GREEN_R9_D_READY**.
