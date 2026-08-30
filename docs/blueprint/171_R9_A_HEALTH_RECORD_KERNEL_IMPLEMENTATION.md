# 171 — R9-A Health record kernel implementation

**CR:** CR-R9-A-IMPL-171  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_A_IMPLEMENTED**  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)

---

## Scope

R9-A backend foundation only:

- `health_timeline_events` + `health_artifact_access_audits` schema and RLS
- `HealthModule` (timeline, artifact access, patient APIs)
- LAB / IMAGING timeline projection hooks on publish (R7-E / R8-E)
- Policy gate `healthcare.health_timeline_enabled`
- Focused e2e + regression

**Explicit non-starts:** R9-B UI, R9-C consent enforcement UI, R9-D doctor UI, R9-E prescription projection, R9-F admin/break-glass, R10+.

---

## Database / migrations (70 total)

| Migration | Purpose |
|-----------|---------|
| `20260829160000_r9a_health_record_kernel` | Enums, `health_timeline_events`, `health_artifact_access_audits`, `health_artifacts` columns (`country_id`, `title`, `status`) |
| `20260829160100_r9a_health_timeline_rls_fix` | Timeline RLS aligned with worker/org publication paths |

`worldpharma_app`: NOSUPERUSER + NOBYPASSRLS. No `USING(true)` on new tables. FORCE RLS on both new tables.

---

## Backend

| Component | Path |
|-----------|------|
| Module | `apps/api/src/health/health.module.ts` |
| Timeline service | `health-timeline.service.ts` |
| Artifact + access | `health-artifact.service.ts` |
| Patient controller | `health.controller.ts` |
| R7 hook | `pathology.service.ts` — projection on publish |
| R8 hook | `interpretation.service.ts` — projection on publish |
| Policy | `health_timeline_enabled` in pack + `PolicyResolver.isHealthTimelineEnabled` |
| Security event | `HEALTH_ARTIFACT_READ` |

---

## APIs (patient only)

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/v1/health/timeline?country_code=` | Metadata-only feed; cursor pagination |
| GET | `/api/v1/health/artifacts/:id?country_code=` | Metadata only |
| GET | `/api/v1/health/artifacts/:id/payload?country_code=` | Delegates to lab/imaging customer report services; access audit |

Requires `customer` audience JWT + `health_timeline_enabled` pack gate.

---

## PHI / audit

- Timeline/list: no findings, analytes, or report bodies
- Payload: delegated PHI via existing R7/R8 customer report paths
- `health_artifact_access_audits`: append-only; reason codes only
- `HEALTH_ARTIFACT_READ` security event: `{artifact_id, artifact_type, allowed, reason}` — no clinical body

Consent-gated doctor reads: **deferred to R9-C/D** (not implemented in R9-A).

---

## Tests (audit session)

| Suite | Result |
|-------|--------|
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** |
| `rls.tenancy.e2e.spec.ts` | **PASS** |
| `r7e.pathology-digital-report.e2e.spec.ts` | **PASS** |
| `r8e.imaging-digital-report.e2e.spec.ts` | **PASS** |
| `r7f` + `r8f` + `r3` + `prescription.e2e` | **18/18 PASS** |
| `health.e2e.spec.ts` | **PASS** |

API `tsc --noEmit`: **PASS**

---

## Runtime verification

| Surface | Status |
|---------|--------|
| API `/health/ready` | **RUNTIME_PASS** (via `health.e2e.spec.ts`) |
| R9-A routes registered | **RUNTIME_PASS** (e2e supertest) |
| Browser | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Mobile | **MOBILE_RUNTIME_NOT_VERIFIED** |

---

## Production boundaries

Unchanged: live PSP, live money, carriers, production healthcare, PACS/DICOM, LIS/HIS, live e-Rx, automatic refill, production LiveKit, recording — all **OFF**.

---

## Known debt

- Shared-DB test isolation (Book 169) — not addressed in R9-A
- Pre-R9-A published artifacts lack timeline rows (no backfill migration; new publishes project events)
- `health_artifacts` remains INSERT-only for `worldpharma_app` (title/country set at create)

---

## Recommended next step

**CR-POST-R9-A-AUDIT** before **CR-R9-B-IMPL-172** (customer Health tab UI).
