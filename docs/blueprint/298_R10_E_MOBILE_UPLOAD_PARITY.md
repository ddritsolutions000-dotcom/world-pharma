# 298 — R10-E mobile customer health document upload parity (CR-298)

**CR:** `CR-R10-E-MOBILE-UPLOAD-PARITY-298`  
**Verdict:** **`R10_E_MOBILE_UPLOAD_PARITY_COMPLETE`**  
**Date:** 30 August 2026  
**Type:** Engineering implementation  
**Authorization:** Explicit CR-R10-E-MOBILE-UPLOAD-PARITY-298 user charter  
**Predecessor:** [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) (backend kernel + web-customer upload)

**Boundaries respected:**

- No backend upload kernel duplication (reuses CR-297 `POST /api/v1/health/uploads`)
- No R3 / R14-A / R14-B reopen
- No live PSP / production payment paths
- No R10-F consult-note projection
- No caregiver/proxy uploads (OD-EHR-05 blocked)

---

## A. Roadmap selection

| Source | Conclusion |
|--------|------------|
| [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) §J | Mobile customer upload UI classified **REAL_MISSING_FEATURE**; recommended CR-298 |
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §12 | R10-E mobile parity listed as next optional expansion after CR-297 |
| [183](183_R10_IMPLEMENTATION_PLAN.md) §12.3 | Book 183 requires upload on customer Health tab for web **and** mobile |
| User charter CR-298 | **Authorized** mobile upload parity only |

**Selected gap:** Mobile customer Health document upload entry point — **REAL_MISSING_FEATURE** (confirmed absent in source at pre-audit).

---

## B. Pre-implementation source audit

| Component | Pre-CR state | Classification |
|-----------|--------------|----------------|
| `HealthHomeScreen` / `health-home` route | Active in `app-root.tsx`, `navigation.ts` | **ACTIVE_SURFACE** |
| `HealthArtifactDetailScreen` | Active; read metadata + payload | **ALREADY_COMPLETE** (read path) |
| `fetchHealthTimeline` / `fetchHealthArtifact*` | Present in `health-api.ts` | **ALREADY_COMPLETE** |
| `uploadHealthDocument` / `POST /health/uploads` (mobile) | Absent | **REAL_MISSING_FEATURE** |
| Upload button / DocumentPicker flow | Absent | **REAL_MISSING_FEATURE** |
| CR-297 `HealthUploadService` + migrations 143–144 | Present | **ALREADY_COMPLETE** (reused) |
| web-customer upload UI | Present (CR-297) | **ALREADY_COMPLETE** (reference parity) |
| Duplicate mobile upload backend | Absent | **N/A** (correct — must not add) |

**Pre-audit verdict:** Gap confirmed. Mobile Health surface is live and read-only; upload was the only missing R10-E customer parity slice.

---

## C. Implementation summary

| Area | Change |
|------|--------|
| API client | `health-api.ts` — `uploadHealthDocument()`, `HealthUploadResponse`, `HealthUploadPayload` types |
| Upload flow | `health-upload-flow.ts` — `performHealthDocumentUpload()` wraps existing API with client validation + safe error mapping |
| Upload utils | `health-upload-utils.ts` — MIME/size validation, request body builder, idempotency key, timeline preview helpers, sensitive-field guard |
| Health UI | `health-features.tsx` — upload button on `HealthHomeScreen`; `expo-document-picker` (dynamic import); loading/success/error states; timeline prepend + refresh; upload payload display in `HealthReportBody` |
| Labels | `health-utils.ts` — `DOCUMENT` / `PRESCRIPTION_UPLOAD` / `upload` source module labels |
| Types | `react-shim.d.ts` — `SetStateAction` for functional `setState`; ambient `expo-document-picker` declaration |
| Dependency | `package.json` — `expo-document-picker ~13.1.6` |
| Tests | `health-upload-parity.spec.ts` — 8 focused cases |

**Call path:** `HealthHomeScreen.onUploadDocument` → `performHealthDocumentUpload` → `uploadHealthDocument` → `POST api/v1/health/uploads` → existing `HealthUploadService` (CR-297).

**Client validation (parity with web):** PDF/JPEG/PNG · 10 MB · idempotency key `{name}-{size}`.

**No backend or migration changes.**

---

## D. Post-implementation audit

| Check | Result |
|-------|--------|
| Mobile → existing `POST /health/uploads` (no duplicate kernel) | **PASS** |
| Customer JWT via `apiCall` + `onUnauthorized` | **PASS** |
| Patient ownership / RLS (server-enforced; no mobile bypass) | **PASS** (unchanged backend) |
| Consent scope (DOCUMENT / PRESCRIPTION_UPLOAD) | **PASS** (unchanged backend) |
| MIME/size validation server-enforced | **PASS** (client pre-check + backend) |
| Idempotency key forwarded | **PASS** |
| Object key / storage metadata not in upload response | **PASS** (`assertUploadResponseSafe`) |
| Upload payload detail view omits `content_base64` / keys | **PASS** |
| R10-F not introduced | **PASS** |
| R14-A / R3 paths untouched | **PASS** |
| Care-nav modules unchanged | **PASS** |

---

## E. Defects found / fixed

| ID | Finding | Fix |
|----|---------|-----|
| TD-TS-R10E-MOB-01 | Duplicate `HealthTimelineItem` import in `health-features.tsx` | Removed redundant import |
| TD-TS-R10E-MOB-02 | `useState` shim lacked `SetStateAction` — functional `setItems` failed typecheck | Extended `react-shim.d.ts` |
| TD-TEST-R10E-MOB-01 | Parity spec imported `health-features` → Jest loaded `react-native` ESM | Import label from `health-upload-utils` instead |
| TD-TEST-R10E-MOB-02 | Spec accessed `result.data` without narrowing | Added explicit `if (!result.ok)` guard |
| TD-TEST-R10E-MOB-03 | Wrong base64 fixture (`cGRf` vs `cGRm`) | Corrected test expectation |

---

## F. Security / auth / consent

| Control | Status |
|---------|--------|
| Authentication | Bearer token on `apiCall`; 401 → `onUnauthorized` (existing mobile pattern) |
| Audience | Enforced server-side (`@RequireAudiences('customer')` on upload route — CR-297) |
| Authorization | Patient-only upload; mobile sends `country_code` only |
| Sensitive data | Upload response stripped of object keys; payload GET shows metadata only (no base64 in detail card) |
| Consent | Existing health consent gates unchanged; upload artifact types in consent scope (CR-297) |

---

## G. Test results

### Focused (mobile R10-E parity)

| Suite | Result |
|-------|--------|
| `health-upload-parity.spec.ts` | **8/8 PASS** |
| `health-parity.spec.ts` | **2/2 PASS** |

### Regressions

| Suite | Result |
|-------|--------|
| `r10e.health-upload.e2e.spec.ts` | **4/4 PASS** |
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** |
| `mobile:typecheck` | **PASS** |
| `api:typecheck` | **PASS** (unchanged) |

---

## H. Migration / runtime

| Database | Head | Pending |
|----------|------|---------|
| Test / Dev | **144** | **0** |

No new migrations in CR-298.

| Runtime | Result |
|---------|--------|
| `GET /health/ready` | **HTTP 200** |

---

## I. Remaining REAL gaps (R10-E / R10-F)

| Gap | Classification | Notes |
|-----|----------------|-------|
| R10-F consult-note projection | **REAL_MISSING_FEATURE** | Book 183 §R10-F; requires separate IMPL authorization |
| Upload supersede / amendment flow | **FUTURE** | Not in v1 slice |
| Signed PUT URL upload flow | **FUTURE** | Base64 JSON used (KYC parity) |
| Production AV integration | **HUMAN_BLOCKED** | OD / vendor decision |
| Caregiver/proxy upload | **HUMAN_BLOCKED** | OD-EHR-05 |

**R10-E customer upload parity (web + mobile + backend) is now complete.**

---

## J. Exactly ONE next CR

**`CR-R10-F-IMPL-*`** — encounter consult-note projection to `CONSULT_NOTE` health artifacts (Book 183 §R10-F), **only when explicitly authorized**. No other authorized unblocked engineering gap remains on the R10-E upload track.

If R10-F is not authorized, default posture returns to **`ROADMAP_ENGINEERING_PAUSE`** per [296](296_NEXT_AUTHORIZED_ENGINEERING_WAVE.md) until the next human-authorized wave.

---

## K. Verdict

**`R10_E_MOBILE_UPLOAD_PARITY_COMPLETE`**

Mobile customer Health upload parity is implemented, wired to the existing CR-297 upload kernel, regression-green, and documented. R10-F consult-note projection is the next real expansion when authorized.
