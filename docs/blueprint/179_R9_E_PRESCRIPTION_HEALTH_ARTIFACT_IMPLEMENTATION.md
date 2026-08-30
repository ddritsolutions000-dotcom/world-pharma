# 179 — R9-E Prescription health artifact projection implementation

**CR:** CR-R9-E-IMPL-179  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_E_IMPLEMENTED**  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [178](178_POST_R9_D_AUDIT.md) (**R9_D_GREEN_R9_E_READY**)

---

## Scope

R9-E projects issued/amended R5 prescriptions into the existing R9-A `HealthArtifact` kernel:

- `HealthArtifactType.PRESCRIPTION_STRUCTURED` enum + prescription FK linkage
- Deterministic, idempotent projection on `PrescriptionService.issue()` / `amend()`
- Payload delegation via `PrescriptionService.customerPrescriptionForHealth()` (no duplicate clinical storage)
- Customer timeline + artifact APIs surface prescription entries (metadata-only timeline)
- Doctor access via existing R9-C/R9-D path with `PRESCRIPTION_STRUCTURED` in consent scope
- Customer/doctor/mobile UI rendering for prescription payload (no new screens)

**Explicit non-starts:** R9-F break-glass bridge / admin health governance, R10+, uploads, new payment/logistics, CRM clinical payloads.

---

## Database / migrations (74 total)

| Migration | Purpose |
|-----------|---------|
| `20260829170000_r9e_prescription_health_artifact` | `PRESCRIPTION_STRUCTURED` enum (separate txn for PG enum safety) |
| `20260829170100_r9e_prescription_health_artifact_schema` | `prescription_id`, `prescription_version_id` FKs; unique index on version; type CHECK; RLS for prescription paths |
| `20260829170200_r9e_prescription_health_artifact_rls_fix` | RLS aligned with `doctor_profiles` (matches R5-A prescription policies) |
| `20260829170300_r9e_health_artifacts_update_grant` | `GRANT UPDATE` on `health_artifacts` for amend supersede lifecycle |

`worldpharma_app`: NOSUPERUSER + NOBYPASSRLS. No `USING(true)` on protected health data. FORCE RLS unchanged on health tables.

---

## Projection architecture

| Component | Path |
|-----------|------|
| Projection service | `apps/api/src/health/health-prescription-projection.service.ts` |
| Issue/amend hooks | `apps/api/src/clinical/prescription.service.ts` |
| Payload delegate | `apps/api/src/health/health-artifact.service.ts` → `customerPrescriptionForHealth()` |
| Consent scope | `apps/api/src/clinical/consent-scope.ts` — `PRESCRIPTION_STRUCTURED` in `HEALTH_CONSENT_ARTIFACT_TYPES` |

### Lifecycle

| Event | Behavior |
|-------|----------|
| Draft Rx | No projection |
| Issue (seal v1) | Create `ACTIVE` artifact + `ARTIFACT_PUBLISHED` timeline event (`source_module: clinical`, `source_id: prescription_version_id`) |
| Re-issue same version | Idempotent — unique `prescription_version_id` returns existing artifact |
| Amend (v2+) | Prior artifact → `SUPERSEDED`; prior timeline event → `SUPERSEDED`; new artifact for new version |

Projection runs inside the prescription DB transaction under `workerTenantContext` (same pattern as R7-E/R8-E lab/imaging publication). Skipped when `health_timeline_enabled` is false in country pack.

---

## APIs (unchanged routes)

| Method | Route | R9-E behavior |
|--------|-------|---------------|
| GET | `/api/v1/health/timeline` | Includes `PRESCRIPTION_STRUCTURED` metadata entries |
| GET | `/api/v1/health/artifacts/:id` | `source_module: clinical`, `source_id: prescription_version_id` |
| GET | `/api/v1/health/artifacts/:id/payload` | Delegates structured prescription lines after patient self-auth |
| GET | `/api/v1/health/patients/:id/artifacts/:id/payload` | Doctor path — R9-C consent + `PRESCRIPTION_STRUCTURED` scope |

---

## Authorization

- Patient self-access: ownership + RLS (`app.can_person`)
- Doctor reads: `ClinicalAccessService` + `assertCanReadArtifactPayload()` — relationship, purpose, consent scope, country isolation
- Revoked consent → immediate **403** on next payload read; no PHI in denial body

---

## PHI handling

| Surface | Rule |
|---------|------|
| Timeline | Metadata only — no medication text |
| Artifact metadata | Title, type, timestamps, source linkage |
| Payload | Structured lines only after successful authorization |
| Outbox / security events | Opaque IDs — no clinical body |
| Access audits | Reason codes only |

---

## UI (timeline integration only)

| App | Files |
|-----|-------|
| web-customer | `health-utils.ts`, `health-report-content.tsx`, `health-api.ts` |
| web-doctor | `health-utils.ts`, `health-report-content.tsx`, `health-api.ts` |
| mobile | `health-utils.ts`, `health-features.tsx`, `health-api.ts` |
| mobile-doctor | `health-utils.ts`, `health-features.tsx`, `health-api.ts` |

---

## Tests

| Suite | Result |
|-------|--------|
| `r9e.prescription-health-artifact-projection.e2e.spec.ts` | **4/4 PASS** |
| `r9a.health-record-kernel.e2e.spec.ts` | **PASS** |
| `r9c.consent-scope-enforcement.e2e.spec.ts` | **PASS** |
| `r9d.doctor-health.e2e.spec.ts` | **PASS** |
| `consent-scope.spec.ts` | **PASS** |
| `prescription.e2e.spec.ts` | **PASS** |
| Full API regression | **79 suites, 186 tests — 185 PASS, 1 FAIL** (`doctor.e2e.spec.ts` policy-pack pollution under shared DB; **PASS in isolation**) |

---

## Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `web-customer:typecheck` | **PASS** |
| `web-doctor:typecheck` | **PASS** |
| `web-doctor:build` | **PASS** |
| `mobile:typecheck` | **PASS** |
| `mobile-doctor:typecheck` | **PASS** |

---

## Runtime verification

| Environment | Status |
|-------------|--------|
| API `/health/ready` | **API_NOT_RUNNING** (no long-lived server in CI session) |
| Browser (web-customer / web-doctor) | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Mobile emulator | **MOBILE_RUNTIME_NOT_VERIFIED** |
| iOS | **IOS_RUNTIME_NOT_VERIFIED** |

E2E tests exercise projection, timeline, payload, doctor consent, amend supersede, and cross-patient denial.

---

## R9-F boundary scan

| Item | Status |
|------|--------|
| Break-glass health bridge | **NOT STARTED** |
| Admin health governance UI | **NOT STARTED** |
| `/admin/health/*` routes | **NOT STARTED** |
| R10+ | **NOT STARTED** |

---

## Known debt

- Shared-DB `policyPack` pollution can flake full-suite `doctor.e2e.spec.ts` (pre-existing; rerun in isolation)
- `BROWSER_RUNTIME_NOT_VERIFIED` / `MOBILE_RUNTIME_NOT_VERIFIED` — unchanged from R9-D baseline

---

## Production boundaries (remain OFF)

Live PSP, real carriers, production PACS/LIS/HIS, live e-Rx, automatic refill, production LiveKit, PHI in notifications/search/CRM.

---

**HARD STOP.** Do not start R9-F. Next step: **CR-POST-R9-E-AUDIT-180**.
