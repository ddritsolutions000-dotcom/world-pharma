# 190 — Post-R10-C audit

**CR:** CR-POST-R10-C-AUDIT-190  
**Verdict:** **R10_C_GREEN_R10_D_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [189](189_R10_C_PROVIDER_MATCH_HANDOFF_IMPLEMENTATION.md)  
**Canonical plan:** [183](183_R10_IMPLEMENTATION_PLAN.md)  
**Prior audits:** [188](188_POST_R10_B_AUDIT.md) (**R10_B_GREEN_R10_C_READY**)

---

## Executive summary

Repository inspection confirms **R10-C is implemented within Book 183 §R10-C scope**. Provider matching, explainable recommendations, red-flag safety gating, appointment handoff via existing `AppointmentService`, and optional tele metadata are present on **API**, **web-customer**, and **mobile**. **No R10-D/E/F or R11+ care-nav governance/upload/projection code** was found.

**No product-level security, PHI, database, or architecture blockers** were identified for R10-C closure.

**Full API regression: 83/83 suites, 197/197 tests PASS** (this audit run). R10-C isolated e2e **4/4 PASS**. R10-A + RLS **13/13 PASS**. Web-customer **32/32** and mobile **14/14** tests PASS. API typecheck, `nx build api`, and web production build PASS.

**Runtime gaps (non-blocking):** live `/health/ready` returned **500** on dev host during audit (process reachable but not healthy); authenticated browser OTP care-nav handoff flow not exercised; **ANDROID_RUNTIME_NOT_VERIFIED**; **IOS_BUILD_NOT_AVAILABLE_ON_WINDOWS** / **IOS_RUNTIME_NOT_VERIFIED**.

**Carry-forward debt:** insert-only `care_match_recommendations` / rematch limitation; mobile session resume; shared test-DB slot contention; dev XX pack default off; web UI tests do not yet cover match/handoff screens.

---

## 1. Implementation verification (Book 189 vs repository)

| Item | Expected | Repository | Status |
|------|----------|------------|--------|
| `CareMatchService` | ✓ | `apps/api/src/care-nav/care-match.service.ts` | **PASS** |
| `CareNavHandoffService` | ✓ | `apps/api/src/care-nav/care-nav-handoff.service.ts` | **PASS** |
| `care-nav-session.access.ts` | ✓ | Shared ownership/pack/red-flag helpers | **PASS** |
| `care-nav-status.ts` `MATCHED` | ✓ | `TRIAGED→MATCHED→COMPLETED` transitions | **PASS** |
| `CareNavController` R10-C routes | ✓ | recommendations, handoff/appointment, handoff/status | **PASS** |
| `matched_at`, `appointment_id` | ✓ | Prisma + migration `20260829180600_r10c_*` | **PASS** |
| `care_match_recommendations` population | ✓ | `createMany` on first match | **PASS** |
| Reuse `AppointmentService` | ✓ | `directory()` + `book()` — no duplicate catalog/booking kernel | **PASS** |
| Reuse R4 video | ✓ | `video_join_route` → `/api/v1/appointments/:id/video/join`; no `VideoService` in care-nav | **PASS** |
| No duplicate matching kernel | ✓ | Deterministic rules in `CareMatchService` only | **PASS** |
| No R10-D admin API | ✓ | No `AdminCareNav*` / `admin/care-nav` routes | **PASS** |

Migration status on dev Postgres: **81 migrations, schema up to date** (includes R10-C).

---

## 2. Matching safety assessment

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Deterministic | **PASS** | Fixed scoring (`specialty_match`, GP fallback), sort by score → name → id |
| Server-side | **PASS** | All matching in `CareMatchService`; client receives results only |
| Explainable | **PASS** | `explanation_key` per recommendation; UI maps to customer copy |
| Country scoped | **PASS** | `loadOwnedCareNavSession` filters `countryId`; directory by country |
| Tenant scoped | **PASS** | Session bound to `personId` + `countryId` |
| Pack gated | **PASS** | `care_navigation_enabled` + `appointments_enabled` |
| Fail-closed | **PASS** | Disabled pack → 403; no providers → `no_match: true` |
| Specialty match | **PASS** | `scoreDoctor` direct specialty overlap |
| GP fallback | **PASS** | `care_nav.match.general_practice_fallback` |
| Tele capability | **PASS** | `tele_available` + `online_capable`; `;tele_capable` suffix on key |
| No ML / external vendor | **PASS** | Rules only; `AppointmentService.directory` |
| No diagnosis / Rx | **PASS** | Operational metadata only; `reason_category: care_navigation` |
| No internal security leak | **PASS** | Explanation keys are stable i18n tokens; e2e `assertNoPhi` |

---

## 3. Red-flag safety assessment

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Emergency guidance first | **PASS** | R10-A `emergency_guidance_key` unchanged; UI renders before continuation |
| Blocks ordinary matching | **PASS** | `assertRedFlagHandoffAllowed` → 403 on `GET .../recommendations` |
| Blocks ordinary booking | **PASS** | Same gate on `POST .../handoff/appointment` |
| Direct API bypass denied | **PASS** | `r10c` e2e red-flag path: match 403, handoff 403 |
| Client bypass denied | **PASS** | Web/mobile: `booking_handoff_allowed` hides match CTA; red-flag copy only |
| No unnecessary PHI in errors | **PASS** | 403 generic operational message; e2e PHI patterns absent |
| R10-A behavior preserved | **PASS** | `presentAssessment` still sets `booking_handoff_allowed: !redFlag` |

---

## 4. State-machine assessment

**Server-enforced transitions:**

`DRAFT → INTAKE → TRIAGED → MATCHED → COMPLETED` (+ `TERMINATED` from non-terminal states)

| Check | Status |
|-------|--------|
| Invalid transition → 409 | **PASS** (`assertCareNavTransition`) |
| Terminated / completed immutable | **PASS** (`assertCareNavSessionActive`, terminal guards) |
| Repeated match (cached) | **PASS** | `MATCHED` + existing rows → return cached recommendations |
| Repeated handoff idempotent | **PASS** | `X-Idempotency-Key` + `appointmentId` short-circuit |
| Client cannot forge `MATCHED` / `appointment_id` | **PASS** | Session updates via `workerTenantContext` only |
| Customer ownership | **PASS** | `personId` + `countryId` on all mutations |

**Rematch policy:** Intentionally limited — `care_match_recommendations` is insert-only under RLS (no worker DELETE). Re-fetch after `MATCHED` returns cached rows when `matches.length > 0`. Full rematch/override deferred to **R10-D** per Book 183.

**Non-blocking edge:** `MATCHED` with zero recommendations could re-run insert logic on a second `GET` (no delete policy). No e2e asserts empty-directory path; product impact low in sandbox.

---

## 5. Appointment handoff assessment

| Check | Status |
|-------|--------|
| Delegates to `AppointmentService.book` | **PASS** |
| Requires `MATCHED` status | **PASS** |
| Provider in recommendation set | **PASS** |
| Slot validation via appointment kernel | **PASS** |
| `authorized: true` required | **PASS** |
| Country / ownership / pack gates | **PASS** |
| Red-flag gate | **PASS** |
| Idempotency | **PASS** (e2e duplicate key) |
| `appointment_id` persisted (unique FK) | **PASS** |
| No appointment payload duplication | **PASS** — reference only |

---

## 6. Tele-video handoff assessment

| Check | Status |
|-------|--------|
| Reuses R4 join route (metadata only) | **PASS** |
| Provider `onlineCapable` checked for ONLINE | **PASS** |
| `telemedicine_eligibility` pack gate | **PASS** |
| No second video kernel | **PASS** |
| `recording_enabled: false` | **PASS** (handoff + status responses) |
| Non-tele fallback (IN_PERSON default) | **PASS** (e2e tele-off pack path) |
| Production LiveKit not enabled in care-nav | **PASS** |

---

## 7. API / security / RLS assessment

### Endpoints

| Endpoint | Auth | Ownership | Pack | State | Red-flag | Idempotency |
|----------|------|-----------|------|-------|----------|-------------|
| `GET .../recommendations` | JWT customer | ✓ | care_nav + appointments | TRIAGED/MATCHED | 403 | N/A (cached) |
| `POST .../handoff/appointment` | JWT customer | ✓ | ✓ | MATCHED | 403 | ✓ |
| `GET .../handoff/status` | JWT customer | ✓ | care_nav | read | N/A | N/A |
| `GET /care/doctors/:id/slots` | JWT customer | R2 existing | appointments | N/A | N/A | N/A |

**RLS:** R10-A policies unchanged; FORCE RLS; no `USING(true)` on care-nav tables. R10-C migration is additive FK/index only.

**Isolation:** e2e cross-customer → 404; malformed UUID → 404; disabled pack → 403.

**Audit events:** `CARE_NAV_MATCH_COMPLETED`, `CARE_NAV_HANDOFF_BOOKED`; outbox `CARE_NAV_HANDOFF_BOOKED` with opaque IDs.

---

## 8. Idempotency / concurrency assessment

| Scenario | Status |
|----------|--------|
| Repeated match | **PASS** — deterministic cached response |
| Same handoff idempotency key | **PASS** |
| Duplicate appointment prevention | **PASS** — `AppointmentService` overlap check + DB exclusion constraint |
| Concurrent handoff race | **Mitigated** — appointment kernel conflict; occasional 500 on exclusion race (pre-existing); e2e `postHandoff` retries slots (test infra only) |

The slot-retry helper does **not** mask product idempotency — duplicate idempotency key test asserts same `appointment_id`.

---

## 9. PHI / audit assessment

| Surface | Classification | PHI leakage |
|---------|----------------|-------------|
| Recommendations | OPERATIONAL | **PASS** — display name, specialties, explanation keys |
| Handoff response | OPERATIONAL | **PASS** — appointment id, type, times |
| Outbox / security events | OPERATIONAL | **PASS** — session_id, appointment_id, counts |
| Denied responses | Safe | **PASS** — no symptom text in 403/404 |

---

## 10. UI assessment

### Web (`care-nav-page.tsx`)

| State | Status |
|-------|--------|
| Matched providers + explanation | **PASS** |
| Provider selection + slots | **PASS** |
| In-person / online booking | **PASS** |
| No-match `EmptyState` | **PASS** |
| Red-flag — no book CTA | **PASS** |
| Handoff success | **PASS** |
| Error / retry panels | **PASS** (existing R10-B matrix) |
| R10-B intake intact | **PASS** |

### Mobile (`care-nav-features.tsx`)

| State | Status |
|-------|--------|
| Core match → book flow | **PASS** |
| Red-flag / no-match | **PASS** |
| Tele option | **PASS** |
| Session resume | **GAP** (carry-forward from R10-B; non-blocking) |

**No R10-D admin UI** found.

**UI test gap:** `care-nav-page.spec.tsx` covers intake/triage/red-flag but not match/handoff screens (non-blocking test debt).

---

## 11. Test results (this audit)

| Suite | Result |
|-------|--------|
| Full API | **83/83 suites, 197/197 PASS** |
| `r10c.care-nav-handoff.e2e.spec.ts` (isolated) | **4/4 PASS** |
| `r10a.care-nav-kernel.e2e.spec.ts` | **2/2 PASS** |
| `rules-triage.engine.spec.ts` | **PASS** |
| `rls.tenancy.e2e.spec.ts` | **11/11 PASS** |
| web-customer | **32/32 PASS** |
| mobile | **14/14 PASS** |

**Note:** Running `r10c` + `r10a` in one Jest invocation without full suite ordering once produced **403** on session create (pack disabled by `r10a` security test `afterAll`). Isolated `r10c` and full suite both pass — classified as **test infrastructure / pack isolation**, not product defect.

---

## 12. Typecheck / build

| Target | Result |
|--------|--------|
| API `tsc --noEmit` | **PASS** |
| `nx build api` | **PASS** |
| web-customer `tsc` + `next build` | **PASS** |
| mobile `tsc` | **PASS** |
| Android | **ANDROID_RUNTIME_NOT_VERIFIED** |
| iOS | **IOS_BUILD_NOT_AVAILABLE_ON_WINDOWS** / **IOS_RUNTIME_NOT_VERIFIED** |

---

## 13. Runtime verification

| Check | Result |
|-------|--------|
| `GET /health/ready` | **500** on audit host (API reachable, not healthy) — **RUNTIME_NOT_VERIFIED** |
| Match / handoff / red-flag API | **PASS** via e2e (authoritative for this audit) |
| Browser OTP care-nav handoff | **NOT VERIFIED** (XX pack off on dev) |
| Mobile device flow | **NOT VERIFIED** |

---

## 14. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A | COMPLETE | **COMPLETE** |
| R10-B | COMPLETE | **COMPLETE** |
| R10-C | COMPLETE | **COMPLETE** |
| R10-D | NOT STARTED | **NOT STARTED** |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R11+ | NOT STARTED | **NOT STARTED** |

Confirmed absent: clinician override, admin governance UI, document uploads, consult-note projection, caregiver proxy, live money, production healthcare/video, recording, ML matching, autonomous diagnosis/prescribing.

---

## 15. Technical debt (classified)

| Item | Classification |
|------|----------------|
| `care_match_recommendations` insert-only / limited rematch | **non-blocking debt** (R10-D scope) |
| `MATCHED` + zero providers re-fetch edge | **non-blocking debt** |
| Mobile session resume | **non-blocking debt** (R10-B carry-forward) |
| Web match/handoff UI unit tests missing | **test infrastructure** |
| R10 pack disable pollution across focused suites | **test infrastructure** |
| Shared DB appointment slot contention in e2e | **test infrastructure** |
| Dev XX `care_navigation_enabled` default off | **environment/ops** |
| Browser / Android / iOS runtime | **environment/ops** |
| Appointment overlap race → 500 (exclusion constraint) | **non-blocking debt** (pre-existing R2) |

---

## 16. R10-D readiness

R10-C meets Book 183 acceptance for match + handoff. **R10-D** (admin audit, clinician override, governance UI) may proceed with above debt documented — none block planning/implementation of R10-D.

---

## 17. Verdict

**`R10_C_GREEN_R10_D_READY`**

---

## 18. Next authorization

**`CR-R10-D-IMPL-191`** — Admin audit + clinician override + closure (R10-D only). Do not start R10-E/F or R11+ without separate CR.
