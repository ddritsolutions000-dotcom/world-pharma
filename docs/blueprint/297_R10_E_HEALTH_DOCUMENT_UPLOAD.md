# 297 — R10-E customer health document upload (CR-297)

**CR:** `CR-R10-E-IMPL-AUTHORIZED-WAVE-297`  
**Verdict:** **`R10_E_IMPLEMENTATION_COMPLETE`** (kernel + web; mobile upload UI deferred)  
**Date:** 30 August 2026  
**Type:** Engineering implementation  
**Authorization:** Explicit CR-R10-E-IMPL-AUTHORIZED-WAVE-297 user charter

**Boundaries respected:**

- No R3 / R14-A / R14-B reopen
- No live PSP / production payment paths
- No R10-F consult-note projection
- No caregiver/proxy uploads (OD-EHR-05 blocked)
- No OCR-as-authoritative or production AV vendor

---

## A. Roadmap selection

| Source | Conclusion |
|--------|------------|
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) | R10-A…D **CLOSED**; R10-E/F **NOT STARTED** — separate IMPL CR |
| [192](192_POST_R10_D_AUDIT.md) | Confirmed absent: document uploads |
| [183](183_R10_IMPLEMENTATION_PLAN.md) §R10-E | `DOCUMENT` / `PRESCRIPTION_UPLOAD`; `HealthUploadService`; `POST /health/uploads` |
| User charter CR-297 | **Authorized** R10-E document uploads |

**Selected gap:** Patient health document upload kernel — **REAL_MISSING_FEATURE** (confirmed absent in source).

---

## B. Pre-implementation source audit

| Component | Pre-CR state | Classification |
|-----------|--------------|----------------|
| `HealthArtifactType` enum | LAB / IMAGING / PRESCRIPTION only | **REAL_MISSING_FEATURE** |
| `health_artifact_uploads` table | Absent | **REAL_MISSING_FEATURE** |
| `HealthUploadService` | Absent | **REAL_MISSING_FEATURE** |
| `POST /health/uploads` | Absent | **REAL_MISSING_FEATURE** |
| `GET /health/artifacts/:id/payload` upload delegate | Absent | **REAL_MISSING_FEATURE** |
| `PrivateObjectStore` (KYC/CMS pattern) | Present | **ALREADY_COMPLETE** (reused) |
| `HEALTH_CONSENT_ARTIFACT_TYPES` | 3 types only | **PARTIAL** |
| Care-nav modules | No upload hooks | **N/A** (R10-E is health-record expansion, not care-nav) |
| web-customer Health tab | Read-only timeline | **PARTIAL** |

---

## C. Real gap implemented

**Smallest production-quality R10-E slice:**

1. Schema: `DOCUMENT`, `PRESCRIPTION_UPLOAD`, `ARTIFACT_UPLOADED`, `health_artifact_uploads`
2. `HealthUploadService` — patient upload, MIME/size validation, malware stub, idempotency, object store, timeline projection
3. `POST /api/v1/health/uploads` — customer JWT only
4. Payload delegate on existing `GET /health/artifacts/:id/payload`
5. Consent scope extended for upload artifact types
6. RLS: patient self-upload on artifacts/uploads/timeline insert
7. web-customer Health tab file upload (PDF/JPEG/PNG, 10 MB)
8. Focused e2e `r10e.health-upload.e2e.spec.ts` (4/4)

**Out of scope (this CR):** mobile upload UI, signed PUT URLs, production AV, OCR, caregiver proxy, upload supersede/amendment UX.

---

## D. Implementation summary

| Area | Change |
|------|--------|
| Migrations | `20260830220000_r10e_health_document_upload` (enums), `20260830220100_r10e_health_document_upload_schema` (table + RLS) |
| API | `health-upload.service.ts`, `health-upload.constants.ts`, `health.controller.ts` POST, `health-artifact.service.ts` delegate, `health-timeline.service.ts` `projectArtifactUploaded`, `consent-scope.ts`, `health.module.ts`, `security-events.service.ts` |
| Web | `health-api.ts`, `health-page.tsx`, `health-report-content.tsx`, `health-utils.ts` |
| Tests | `r10e.health-upload.e2e.spec.ts`; r9a wrong-country flake fix (dynamic missing ISO) |

**Storage:** `var/private-objects/health-uploads/{personId}/…` via existing `LocalPrivateObjectStore`. Object keys never exposed in API responses.

**Defaults (ED-R10-03):** PDF/JPEG/PNG · 10 MB · `STANDARD_HEALTH` classification.

---

## E. Post-implementation audit

| Check | Result |
|-------|--------|
| Happy path upload → timeline → metadata → payload | **PASS** (e2e) |
| Idempotency replay | **PASS** (same artifact_id) |
| Unsupported MIME | **PASS** (400) |
| Cross-patient metadata/payload | **PASS** (404) |
| Unauthenticated upload | **PASS** (401) |
| Object key not in JSON | **PASS** (e2e assertion) |
| Patient self payload read audit | **PASS** (uses existing `HealthAccessService`) |
| RLS patient write path | **PASS** (migration policies) |
| Care-nav unchanged | **PASS** (no care-nav edits) |
| R14-A paths untouched | **PASS** |

---

## F. Defects found / fixed

| ID | Finding | Fix |
|----|---------|-----|
| TD-MIG-R10E-01 | Enum + CHECK in one migration failed (PG 55P04) | Split into two migrations |
| TD-TYPE-R10E-01 | `HEALTH_DOCUMENT_UPLOADED` missing from `SecurityEventType` | Added to union |
| TD-REG-R9A-YY-01 | r9a used static `YY` — polluted DB returned 403 not 404 | Dynamic nonexistent country code in test |

---

## G. Security / RLS / RBAC

| Control | Status |
|---------|--------|
| Authentication | JWT + `@RequireAudiences('customer')` on upload route |
| Authorization | Patient-only upload (`personId` from principal) |
| Payload read | Existing consent + `patient_self` / doctor consent paths |
| RLS artifacts | Patient self-insert for DOCUMENT/PRESCRIPTION_UPLOAD |
| RLS uploads | `app.person_id() = person_id` on INSERT |
| RLS timeline | `ARTIFACT_UPLOADED` + `app.person_id() = person_id` |
| Sensitive data | Payload via authorized GET only; no public object URLs |
| Malware | Stub scanner (sandbox — same as KYC) |

---

## H. Test results

### Focused (R10-E)

| Suite | Result |
|-------|--------|
| `r10e.health-upload.e2e.spec.ts` | **4/4 PASS** |

### Regressions

| Suite | Result |
|-------|--------|
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** (after flake fix) |
| `r9e.prescription-health-artifact-projection.e2e.spec.ts` | **PASS** (combined run) |
| `r10a.care-nav-kernel.e2e.spec.ts` | **PASS** (combined run) |
| `api:typecheck` | **PASS** |
| `web-customer:typecheck` | **PASS** |
| `api:build` | **PASS** |

---

## I. Migration / runtime

| Database | Head | Pending |
|----------|------|---------|
| Test | **144** (`20260830220100_r10e_health_document_upload_schema`) | **0** |
| Dev | **144** | **0** |

| Runtime | Result |
|---------|--------|
| `GET /health/ready` | **HTTP 200** |

---

## J. Remaining REAL gaps (R10-E / R10-F)

| Gap | Classification | Notes |
|-----|----------------|-------|
| Mobile customer upload UI | **REAL_MISSING_FEATURE** | Book 183 §R10-E — deferred |
| Upload supersede / amendment flow | **FUTURE** | Book 183 amendment pattern not in v1 slice |
| Signed PUT URL upload flow | **FUTURE** | Book mentions; base64 JSON used (KYC parity) |
| Production AV integration | **HUMAN_BLOCKED** | OD / vendor decision |
| Caregiver/proxy upload | **HUMAN_BLOCKED** | OD-EHR-05 |
| R10-F consult-note projection | **REAL_MISSING_FEATURE** | Separate authorized CR |

---

## K. Exactly ONE next CR

**`CR-R10-E-MOBILE-UPLOAD-PARITY-298`** — wire `apps/mobile` Health tab to `POST /health/uploads` (parity with web-customer), only if mobile health timeline surface exists and is in use. **Otherwise:** **`CR-R10-F-IMPL-*`** when humans authorize consult-note projection.

---

## L. Verdict

**`R10_E_IMPLEMENTATION_COMPLETE`**

R10-E document upload kernel is implemented, secured, regression-green, and documented. R10-F and mobile upload parity remain the next authorized expansions.
