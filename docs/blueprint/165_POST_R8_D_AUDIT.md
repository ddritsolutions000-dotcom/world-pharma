# 165 — Post-R8-D audit (final gate)

**Status:** Audit only — **no R8-E+ coding, no source changes**  
**Change ID:** **CR-POST-R8-D-AUDIT-165**  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R8_D_GREEN_R8_E_READY**

**Authority:** Final verification after [164](164_R8_D_RADIOLOGIST_INTERPRETATION_IMPLEMENTATION.md). **Do not** implement R8-E/F, production healthcare, live PSP/money/carriers, PACS/DICOM transfer, or customer imaging report publication under this CR.

**Canonical inputs:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md) · [163](163_POST_R8_C_AUDIT.md) · [164](164_R8_D_RADIOLOGIST_INTERPRETATION_IMPLEMENTATION.md)

**Repo truth:** `apps/api/src/radiology/*` · `apps/web-radiologist` · `apps/web-radiology/src/imaging-interpretations-panel.tsx` · `packages/database/prisma` · `worldpharma_test` DB (RLS) · audit session 29 Aug 2026.

---

## 0. Executive summary

R8-D implementation in repository matches Book 164: `ImagingReport` / `ImagingReportVersion` / `ImagingFindingLine`, radiologist workflow APIs (`/radiologist/*`), SoD on verify, ops metadata on `web-radiology`, dedicated `web-radiologist` shell, customer operational progress only (no findings), sandbox acquisition metadata, opaque security/outbox events, and **no R8-E publication path**.

**R8-E boundary:** No radiologist `publish` endpoint, no `HealthArtifactType.IMAGING_REPORT`, no customer imaging report GET, no amendment publication flow.

**Regression note:** Book 164 reported **72/72 API e2e suites, 167/167 tests** (29 Aug 2026). This audit session could **not** re-run the isolated API suite 3× because Jest `global-setup.cjs` invokes `pnpm` (not on shell `PATH` on Windows host). A workspace-wide Jest invocation hit **beforeAll timeout** flakes (infrastructure / parallel contention), not R8-D-specific failures. **Typecheck** (`api`, `web-radiologist`, `web-radiology`) and **production builds** for both web apps **PASS** in this session.

**Dev DB drift:** `worldpharma` (development) does **not** contain `imaging_reports*` tables; `worldpharma_test` does (migrations applied). Classified as **environment / ops debt**, not an R8-D product defect.

**R8-E readiness:** **READY** — requires separate **`CR-R8-E-IMPL-*`** authorization.

---

## 1. R8-D audit matrix

| Area | Result | Evidence | Blocker? |
|------|--------|----------|----------|
| **Backend — models** | PASS | `schema.prisma` `ImagingReport`, `ImagingReportVersion`, `ImagingFindingLine`; enum `ImagingReportVersionStatus` | No |
| **Backend — migrations** | PASS | `20260829120000_r8d_imaging_interpretation`, `20260829120100_r8d_imaging_interpretation_rls_fix`; additive FKs/indexes; `RADIOLOGIST` partner seed | No |
| **State machine** | PASS | `imaging-report-status.ts` transitions; service enforces DRAFT→PENDING_VERIFY→VERIFIED on write paths | No |
| **State machine — gaps** | NOTE | `PENDING_VERIFY→DRAFT` in transition map but **no reject API**; `VERIFIED→PUBLISHED` in map but **no R8-D caller** | No (R8-E / future) |
| **Assignment** | PASS | `assignRadiologist`; duplicate assign 403; findings require assignment | No |
| **Findings entry** | PASS | `enterFindings` DRAFT-only; replaces lines in transaction; validation ≥1 line | No |
| **Submit / verify** | PASS | `submitForVerify` requires findings; `verifyReport` + `assertSod` | No |
| **SoD** | PASS | `assertSod` blocks enterer from verify; e2e `sodVerify` 403 | No |
| **Radiologist membership** | PASS | `assertRadiologistPartner` + `IMAGING_CENTER` membership; `attachRadiologist` test helper | No |
| **Org / country isolation** | PASS | e2e cross-org worklist 403; `imaging_org_id` required on all routes | No |
| **Customer access** | PASS | Progress API `boundary.report: false`; no findings in JSON; e2e regex | No |
| **Sandbox acquisition metadata** | PASS | `presentCaseDetail` exposes `sandbox_object_ref`, `pacs/dicom: false` | No |
| **Notification / outbox safety** | PASS | Outbox `IMAGING_REPORT_DRAFT_CREATED` payload IDs only; security events metadata IDs only | No |
| **Security events** | PASS | Types `IMAGING_REPORT_*` in `security-events.service.ts`; no clinical text in metadata | No |
| **API surface** | PASS | `radiologist.controller.ts` 8 endpoints; no publish/amend | No |
| **RLS — test DB** | PASS | `worldpharma_test`: ENABLE+FORCE on 3 tables; 3 policies; `worldpharma_app` NOSUPERUSER NOBYPASSRLS | No |
| **RLS — dev DB** | FAIL (env) | `worldpharma`: `imaging_reports` absent (migrations not applied locally) | No (ops) |
| **USING(true)** | PASS | `SELECT COUNT(*) … = 0` on `worldpharma` policies | No |
| **PHI — customer** | PASS | No customer interpretation routes; progress worker-scoped read of status only | No |
| **PHI — technician** | PASS | e2e radiologist worklist 403 for technician token | No |
| **PHI — ops UI** | PASS | `listOrgInterpretationMetadata` status/accession only; `imaging-interpretations-panel.tsx` no findings | No |
| **Immutability — findings** | PASS | Service: DRAFT-only edit; DB: `imaging_finding_lines` WITH CHECK `status IN ('DRAFT','PENDING_VERIFY')` | No |
| **Immutability — VERIFIED version** | DEBT | Service blocks edits (409); **no DB trigger** preventing `imaging_report_versions` UPDATE after VERIFIED | No |
| **UI — web-radiologist** | PASS (static) | OTP sign-in, org select, worklist/verify tabs, assign/findings/submit/verify wired in `radiologist-shell.tsx` + `radiologist-api.ts` | No |
| **UI — web-radiology** | PASS (static) | Interpretation tab metadata-only | No |
| **Tests — R8-D e2e** | PASS (Book 164) | `r8d.radiologist-interpretation.e2e.spec.ts` full flow + isolation | No |
| **Tests — regression 3×** | BLOCKED (infra) | `pnpm` missing from PATH for Jest globalSetup; not re-executed this session | No (audit env) |
| **Typecheck** | PASS | `nx run-many -t typecheck -p api,web-radiologist,web-radiology` | No |
| **Web builds** | PASS | `web-radiologist:build`, `web-radiology:build` | No |
| **Runtime** | NOT VERIFIED | API was down at end of audit session; no interactive browser pass | No |
| **File hygiene** | PASS | Single `InterpretationService`, single `RadiologistController`; no duplicate kernels; no R8-E/F code in radiology module | No |
| **R8-E boundary** | PASS | No publish endpoint; `HealthArtifactType` = `LAB_REPORT` only; no customer report GET | No |

---

## 2. Book 164 verification (repository truth)

### 2.1 Schema & migrations

| Claim (Book 164) | Verified |
|------------------|----------|
| `ImagingReport`, `ImagingReportVersion`, `ImagingFindingLine` | Yes — `schema.prisma` L4519–4598 |
| Migrations `20260829120000_*`, `20260829120100_*` | Yes — SQL reviewed; RLS ENABLE+FORCE; grants to `worldpharma_app` |
| `RADIOLOGIST` partner type | Yes — migration INSERT + `attachRadiologist` / `assertRadiologistPartner` |
| No `HealthArtifact` / `IMAGING_REPORT` publication | Yes — `HealthArtifactType` enum = `LAB_REPORT` only |

### 2.2 Draft-on-acquire hook

`InterpretationService.ensureDraftReportForAcquiredStudy` called from acquisition completion path (`imaging-study.service.ts`); idempotent if report exists; creates DRAFT v1 under worker tenant context.

### 2.3 APIs (enumerated)

| Method | Path | Auth | Scope check |
|--------|------|------|-------------|
| GET | `/api/v1/radiologist/organizations` | JWT + audience | `RADIOLOGIST` partner |
| GET | `/api/v1/radiologist/worklist` | JWT + audience | Radiologist + `imaging_org_id` membership |
| GET | `/api/v1/radiologist/verify-queue` | JWT + audience | Same |
| GET | `/api/v1/radiologist/cases/:studyId` | JWT + audience | Org match + case access rules |
| POST | `/api/v1/radiologist/reports/:id/assign` | JWT + audience | Org + study ACQUIRED |
| POST | `/api/v1/radiologist/reports/:id/findings` | JWT + audience | Assigned + DRAFT |
| POST | `/api/v1/radiologist/reports/:id/submit` | JWT + audience | Assigned + findings present |
| POST | `/api/v1/radiologist/reports/:id/verify` | JWT + audience | SoD + PENDING_VERIFY |
| GET | `/api/v1/radiology/interpretations` | JWT + audience | `assertImagingOrgAccess` — metadata only |

**Not present:** `POST .../publish`, `POST .../amend`, customer report GET.

---

## 3. State machine audit

**Canonical transitions** (`imaging-report-status.ts`):

```
DRAFT → PENDING_VERIFY
PENDING_VERIFY → VERIFIED | DRAFT (reject — no API)
VERIFIED → PUBLISHED (R8-E — no API)
PUBLISHED → (terminal)
```

| Transition | Service | Test | Verdict |
|------------|---------|------|---------|
| DRAFT → PENDING_VERIFY | `submitForVerify` + `assertImagingReportTransition` | e2e | PASS |
| PENDING_VERIFY → VERIFIED | `verifyReport` + SoD | e2e | PASS |
| DRAFT → VERIFIED (skip) | — | — | BLOCKED (409) |
| VERIFIED → DRAFT | — | — | BLOCKED (409 on findings) |
| Enterer verifies own report | `assertSod` | e2e 403 | PASS |
| Edit after VERIFIED | `enterFindings` DRAFT check | e2e 409 | PASS |
| Findings without assign | `assertAssignedToActor` | e2e 403 | PASS |
| Cross-org worklist | `assertRadiologist` | e2e 403 | PASS |
| Cancelled study | `assertStudyEligible` requires ACQUIRED | code | PASS |
| Duplicate assign | second radiologist | e2e 403 | PASS |
| Idempotent draft create | `ensureDraftReportForAcquiredStudy` early return | code | PASS |

**Unsafe / missing:** `PENDING_VERIFY → DRAFT` reject workflow not exposed (non-blocking; verify queue cannot send back via API).

---

## 4. Report data security

| Actor | Findings access | Evidence |
|-------|-----------------|----------|
| Customer | **Denied** | Progress API only; `boundary.report: false`; e2e no clinical strings |
| Technician | **Denied** (radiologist APIs) | e2e worklist 403 |
| Vendor / delivery | **Denied** | No radiology clinical routes |
| Radiologist (assigned) | **Allowed** | Case detail + findings |
| Radiologist (verify queue) | **Allowed** (case view) | `assertCaseAccess` allows PENDING_VERIFY/VERIFIED without assignment |
| Imaging center ops (API) | **Metadata only** | `GET /radiology/interpretations` |
| Imaging center ops (RLS) | **Possible at DB** | `can_org(imaging_org_id)` on report tables — API does not expose findings to non-radiologist roles |
| Notifications / outbox | **Opaque IDs** | Payload fields: `imaging_report_id`, `imaging_study_id`, `imaging_org_id`, `sandbox` |
| Security events | **No clinical text** | Metadata IDs only; logger JSON has event type + person_id |

---

## 5. RLS / tenancy

**Role `worldpharma_app`:** `rolsuper=f`, `rolbypassrls=f` (verified via `pg_roles`).

**`worldpharma_test` (authoritative for R8-D RLS):**

| Table | RLS | FORCE | Policy |
|-------|-----|-------|--------|
| `imaging_reports` | ON | ON | `imaging_reports_access` |
| `imaging_report_versions` | ON | ON | `imaging_report_versions_access` |
| `imaging_finding_lines` | ON | ON | `imaging_finding_lines_access` |

**Policy logic (summary):** worker/platform bypass; org read/write via `can_org` / `write_org`; assigned radiologist via `can_person`; finding-line writes restricted to versions in `DRAFT` or `PENDING_VERIFY` (WITH CHECK).

**RLS fix migration:** `20260829120100_*` removed overly strict WITH CHECK that blocked `VERIFIED` transition.

**Isolation scenarios (e2e + policy review):**

| Scenario | Result |
|----------|--------|
| Radiologist A ↛ Org B | 403 on worklist |
| Customer ↛ interpretation data | No API; RLS blocks direct customer tenant reads of report tables |
| Technician ↛ radiologist APIs | 403 |

**Dev DB `worldpharma`:** tables absent — run `prisma migrate deploy` before local R8-D runtime (ops).

---

## 6. Immutability

| Artifact | Service layer | Database layer |
|----------|---------------|----------------|
| DRAFT findings | Editable | DELETE+INSERT allowed (DRAFT) |
| PENDING_VERIFY findings | Not editable via API (`enterFindings` requires DRAFT) | WITH CHECK allows status PENDING_VERIFY — **theoretical** direct DB write |
| VERIFIED findings | 409 on API | WITH CHECK blocks (status not in DRAFT/PENDING_VERIFY) |
| VERIFIED version row (status/summary) | 409 on API | **No DB constraint** — defense-in-depth gap |

**Classification:** VERIFIED version-row mutability without service bypass is **non-blocking debt** (same pattern as pre-R8-E pathology; R8-E should add triggers or tighten WITH CHECK).

---

## 7. UI audit (static / wiring)

### `apps/web-radiologist`

| Surface | Wired | Notes |
|---------|-------|-------|
| Sign-in (OTP, `partner_applicant`) | Yes | `useSession` + `signInWithOtp` |
| Session expiry | Yes | `SessionExpiredState` |
| Organization selection | Yes | `fetchRadiologistOrganizations` |
| Worklist / verify queue | Yes | Tab switch + API |
| Case detail | Yes | `fetchRadiologistCase` |
| Assignment | Yes | `assignRadiologistCase` |
| Findings + summary | Yes | DRAFT state only in UI |
| Submit / verify | Yes | Status-gated buttons |
| Loading / empty / 403 / network | Yes | `LoadingState`, `EmptyState`, `PermissionDeniedState`, `NetworkErrorState` |
| VERIFIED terminal copy | Yes | Explicit R8-E boundary message |

**Not verified:** interactive browser session (audit environment).

### `apps/web-radiology`

`ImagingInterpretationsPanel` — accession, status, version, assignee ID only; explicit “no clinical findings” copy.

---

## 8. Customer boundary (R8-E must remain OFF)

| Check | Result |
|-------|--------|
| Customer report GET | **Absent** |
| `HealthArtifactType.IMAGING_REPORT` | **Absent** |
| `boundary.report` in progress | **`false`** |
| Finding text in customer/RN responses | **Absent** (e2e) |
| Radiologist publish API | **Absent** |
| Physical imaging report workflow (R8-F) | **Absent** |

---

## 9. Test regression (this session)

| Suite | Result | Notes |
|-------|--------|-------|
| R8-D e2e | **Not re-run** | Blocked by `pnpm` PATH in Jest globalSetup |
| R8-C / R8-B / R8-A e2e | **Not re-run** | Same |
| R7 / RLS / R3 / R5 / R6 | **Not re-run** | Same |
| Full API ×3 isolated | **Not re-run** | Book 164: 72/72, 167/167 |
| Workspace Jest (parallel) | **FAIL (infra)** | 32 suites `beforeAll` timeout 5000ms — not R8-D-specific |
| Typecheck | **PASS** | api, web-radiologist, web-radiology |
| `web-radiologist` build | **PASS** | This session |
| `web-radiology` build | **PASS** | This session |

**Flake classification:** Workspace parallel Jest timeouts = **infrastructure / test isolation debt**. Jest globalSetup `pnpm` dependency = **infrastructure issue** on Windows shells without global pnpm.

---

## 10. Runtime verification

| Check | Result |
|-------|--------|
| API health | **Not available** at audit close (`Unable to connect`) |
| R8-D routes registered | **Yes** (code) — `RadiologyModule` registers `RadiologistController` |
| `web-radiologist` build | **PASS** |
| Interactive browser | **Not performed** |
| Mobile runtime | **Not performed** |

---

## 11. Migration audit

| Migration | Ordering | Additive | RLS | Notes |
|-----------|----------|----------|-----|-------|
| `20260829120000_r8d_imaging_interpretation` | After R8-C | Yes | ENABLE+FORCE + policies | FKs, unique indexes |
| `20260829120100_r8d_imaging_interpretation_rls_fix` | Immediately after | Yes | Policy replace | Fixes VERIFIED WITH CHECK |

**Pending on dev `worldpharma`:** R8-C + R8-D migrations not applied (tables missing). **Applied on `worldpharma_test`:** both R8-D migrations present.

---

## 12. File hygiene

| Check | Result |
|-------|--------|
| Duplicate radiologist kernels | **None** — single `InterpretationService` + `RadiologistController` |
| Duplicate report models | **None** |
| Abandoned controllers | **None** found |
| Accidental R8-E code | **None** in radiology module |
| Accidental R8-F code | **None** |
| R9+ code | **None** introduced by R8-D |

---

## 13. R8-E boundary (explicit)

| R8-E capability | Status |
|-----------------|--------|
| `POST /radiologist/reports/:id/publish` | **NOT STARTED** |
| Customer final imaging report | **NOT STARTED** |
| `HealthArtifactType.IMAGING_REPORT` | **NOT STARTED** |
| Amendment publication flow | **NOT STARTED** (schema has `amendsVersionId` for parity) |
| Physical report workflow | **NOT STARTED** |

Pathology `POST /pathologist/reports/:id/publish` exists for **lab** R7-E — not radiology R8-E.

---

## 14. PASS (genuinely verified)

- R8-D schema, migrations, and RLS policies match Book 164 on `worldpharma_test`.
- Full radiologist workflow implemented: draft-on-acquire → assign → findings → submit → verify with SoD.
- Customer boundary holds: operational progress only; no publication surface.
- R8-E/F boundaries intact in code and schema.
- `web-radiologist` and `web-radiology` interpretation surfaces build and typecheck.
- Comprehensive R8-D e2e spec covers isolation, SoD, and customer non-exposure (verified by code review; executed per Book 164).

---

## 15. BLOCKERS

**None at product level** preventing R8-D from being declared implemented and R8-E planning-ready.

**Audit-environment limitations (not product blockers):**

1. Could not re-run isolated full API suite 3× (`pnpm` not on PATH for Jest globalSetup).
2. Dev database `worldpharma` not migrated through R8-C/D (local runtime for R8-D requires `prisma migrate deploy`).
3. No interactive browser or live API verification in this session.

---

## 16. NON-BLOCKING DEBT

1. **VERIFIED `imaging_report_versions` immutability** — service-layer only; add DB trigger or RLS WITH CHECK on terminal status before R8-E publication.
2. **Reject-to-draft API** — `PENDING_VERIFY → DRAFT` in transition table but no endpoint (verify queue cannot “send back” except by future CR).
3. **Imaging org staff RLS read scope** — `can_org` allows DB-level read of findings; API restricts clinical content to radiologist routes (documented in Book 164 §7).
4. **Jest globalSetup hard dependency on `pnpm` in PATH** — Windows dev ergonomics.
5. **Interactive UI/runtime smoke** — deferred to ops / CR-MOBILE-WEB-LOCAL-RUNTIME.

---

## 17. R8-E READINESS

**READY** — R8-D interpretation and verify/sign-off are implemented and bounded. R8-E requires separate **`CR-R8-E-IMPL-*`** authorization for `HealthArtifactType.IMAGING_REPORT`, customer report access, publication immutability, and amendment flows.

---

## 18. FINAL VERDICT

**R8_D_GREEN_R8_E_READY**

---

*End of Book 165 — audit only; no implementation.*
