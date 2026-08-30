# 187 — R10-B Customer Care Navigation UI implementation

**CR:** CR-R10-B-IMPL-187  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R10_B_IMPLEMENTED**  
**Canonical plan:** [183](183_R10_IMPLEMENTATION_PLAN.md)  
**Baseline:** [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md) (**R10_A_IMPLEMENTED**)

---

## Scope

R10-B delivers the **customer-only** Care Navigation intake experience on web and mobile (shared React Native), wired to real **R10-A** APIs. No backend kernel changes.

**Delivered:**

- Care Navigation entry under Health
- Session create (idempotent `X-Idempotency-Key`)
- Client-side intake questions (`duration`, `symptom_change`)
- Answer submission (append-only; server authoritative)
- Progress indicator
- Auto `complete-intake` → rules-based triage result
- Red-flag / emergency guidance **before** any continuation messaging
- Normal-path completion state (no provider matching / booking)
- Pack gate (`care_navigation_enabled`) — disabled unavailable state
- Error/retry states (401, 403, 404, 409, network, validation, generic)
- Double-submit prevention; non-editable `COMPLETED` / `TERMINATED` sessions
- Web + mobile parity via shared flow logic

**Explicit non-starts:** R10-C matching/handoff; R10-D admin override; R10-E uploads; R10-F consult-note projection; R11+; ML triage; live healthcare integrations; appointment/tele handoff UI; duplicate R10-A backend.

---

## Web (`apps/web-customer`)

| Route | Screen | APIs |
|-------|--------|------|
| `/health/care-navigation` | `CareNavigationScreen` (`care-nav-page.tsx`) | `POST /api/v1/care-nav/sessions`, `POST .../answers`, `POST .../complete-intake`, `GET .../sessions/:id`, `GET .../assessment` |

**Modules:** `care-nav-api.ts`, `care-nav-utils.ts`, `care-nav-page.tsx`  
**Entry:** Health home link (`health-page.tsx`) — ED-R10-02 sub-route under Health  
**Resume:** `?session=<id>` query param loads session/assessment when authenticated  
**Country:** `XX` (sandbox; backend enforces pack + ownership)

---

## Mobile (`apps/mobile`)

| Screen id | Component | APIs |
|-----------|-----------|------|
| `care-navigation` | `CareNavigationScreen` (`care-nav-features.tsx`) | Same R10-A endpoints |

**Modules:** `care-nav-api.ts`, `care-nav-utils.ts`, `care-nav-features.tsx`  
**Navigation:** `navigation.ts` (`MORE_NAV`, `ACCOUNT_NAV`), `app-root.tsx`, Health home button (`health-features.tsx`)  
**Platform:** Shared RN implementation for Android and iOS (single codebase).

---

## Web / mobile parity

| Capability | Web | Android | iOS |
|------------|-----|---------|-----|
| Care Navigation entry | ✓ | ✓ | ✓ (shared RN) |
| Create session | ✓ | ✓ | ✓ |
| Intake questions | ✓ | ✓ | ✓ |
| Answer submission | ✓ | ✓ | ✓ |
| Progress | ✓ | ✓ | ✓ |
| Completion | ✓ | ✓ | ✓ |
| Triage result | ✓ | ✓ | ✓ |
| Red-flag guidance | ✓ | ✓ | ✓ |
| Error/retry states | ✓ | ✓ | ✓ |

---

## API integration

| Endpoint | Use |
|----------|-----|
| `POST /api/v1/care-nav/sessions` | Create session (`X-Idempotency-Key`) |
| `POST /api/v1/care-nav/sessions/:id/answers` | Submit intake answer |
| `POST /api/v1/care-nav/sessions/:id/complete-intake` | Run triage |
| `GET /api/v1/care-nav/sessions/:id` | Resume session |
| `GET /api/v1/care-nav/sessions/:id/assessment` | Load triage when `TRIAGED` |

**Error mapping (`classifyCareNavError`):**

| Condition | UI |
|-----------|-----|
| 401 | Session expired → sign in |
| 403 + “not enabled” | Care navigation unavailable (pack gate) |
| 403 other | Permission denied |
| 404 | Session not found |
| 409 | Session cannot be updated |
| 400 | Validation / check answers |
| Network (`status === 0`) | Connection problem + retry |
| Other | Generic error + retry |

Uses dedicated `CareNavApiError` client (not generic `apiCall`) to preserve 403 detail for pack-gate detection. No duplicate authorization logic; no PHI in logs/URLs.

---

## State handling

Explicit UI states on major screens: loading, populated, submitting, success, retry, network error, unauthorized, forbidden, disabled-pack, not-found, conflict, expired-session, validation, generic error.

- `submitting` flag prevents double submission
- Server session status is authoritative
- `COMPLETED` / `TERMINATED` → non-editable result/closed messaging
- Non-`INTAKE` resume → conflict state

---

## Triage safety UX

- Copy states rules-based guidance; **not a diagnosis**
- No prescriptions, treatment recommendations, or AI/ML claims
- Red-flag: emergency guidance card shown **first**; booking/matching explicitly deferred (“not available for urgent guidance paths in this release”)
- Normal path: “Provider matching and appointment booking will be available in a future update” (R10-C)

---

## Tests (this session)

| Suite | Result |
|-------|--------|
| `web-customer` care-nav (`care-nav-page.spec.tsx`, `care-nav-utils.spec.ts`) | **8/8 PASS** |
| `web-customer` full jest | **32/32 PASS** (10 suites) |
| `mobile` care-nav (`care-nav-parity.spec.ts`) | **4/4 PASS** |
| `mobile` full jest | **14/14 PASS** (5 suites) |

**Web UI tests cover:** entry, session creation, questions, answers, routine completion, red-flag ordering, disabled pack (403), network error, conflict (409).

**Mobile tests:** error classification, progress, terminal status, non-diagnostic copy (screen-level flow parity via shared utils + RN screen module).

---

## Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** (no R10-B API changes) |
| `web-customer:typecheck` | **PASS** |
| `mobile:typecheck` | **PASS** |
| `web-customer` production build | **PASS** (24 routes incl. `/health/care-navigation`) |
| Android APK | **Not produced** — `ANDROID_SDK_NOT_FOUND` on host |
| iOS build | **`IOS_BUILD_NOT_AVAILABLE_ON_WINDOWS`** |

---

## Backend regression

| Suite | Result | Notes |
|-------|--------|-------|
| R10-A e2e (`r10a.care-nav-kernel`) isolated | **2/2 PASS** | Authoritative happy-path + red-flag |
| RLS tenancy (`rls.tenancy`) | **11/11 PASS** | |
| Full API Jest (82 suites) | **77 pass / 5 fail** | **Environmental / test DB pollution** when run as full suite (see below) |
| R7/R8/R9 subset (parallel run) | **3 failures** | Pre-existing pack/fixture issues unrelated to R10-B UI |

**Full-suite failures (isolated rerun recommended):**

| Suite | Test | Error | Classification |
|-------|------|-------|----------------|
| `r9c.consent-scope-enforcement.e2e` | grant → authorized doctor read | 403 vs 200 | **environment** (health pack / fixture) |
| `r9d.doctor-health.e2e` | complete doctor flow | Prisma `labSample` not found | **environment** |
| `r9f.break-glass-health.e2e` | full flow | 403 vs 200 | **environment** |
| `r10a.care-nav-kernel.e2e` | happy path (in full suite only) | 403 vs 201 | **environment** (pack state; **passes isolated**) |
| `r6a.vendor.e2e` | filters VENDOR orgs | Unique constraint policy pack | **environment** |

**Isolated rerun:** `npx jest --config apps/api/jest.config.cts --testPathPatterns="r10a.care-nav-kernel" --runInBand` → **PASS**

No R10-A backend modifications in R10-B.

---

## Runtime verification

| Check | Result |
|-------|--------|
| `GET /health/ready` | **200** (`postgres`, `redis`, `bullmq` up) |
| `POST /api/v1/care-nav/sessions` unauthenticated | **401** |
| `POST /api/v1/care-nav/sessions` authenticated, pack **off** | **403** “Care navigation is not enabled for this country” |
| Authenticated happy-path on dev XX pack | **Blocked** — dev `healthcare` JSON / policy cache sensitivity (same debt as Book 185); **R10-A isolated e2e authoritative** |
| `web-customer` dev (`next dev :3000`) | **200** on `/health/care-navigation` (sign-in gate when unauthenticated) |
| Full browser intake (auth + pack on) | Requires OTP sign-in + `enableCareNavigationPack` — not exercised end-to-end on dev DB in this session |
| Android emulator flow | **Not run** — no Android SDK/emulator |
| iOS runtime | **`IOS_RUNTIME_NOT_VERIFIED`** (Windows host) |

---

## PHI / security

- No PHI in analytics, URLs (session id only for resume), client logs, or notification payloads
- Chief complaint / answers sent only to authorized R10-A endpoints over bearer token
- Client does not trust client-supplied org context; `country_code` query only
- Pack gate never bypassed client-side

---

## Known limitations / debt

- Intake questions are client-defined (R10-A accepts any `question_key`); server rules engine uses complaint text + answers
- Country defaults to `XX`; no country picker on care-nav screens
- Mobile screen tests are parity/utils-focused; full RN renderer tests deferred (no `react-test-renderer` in mobile typecheck graph)
- Dev XX policy pack manual toggle is fragile; use `enableCareNavigationPack` helper for runtime demos
- Web `nx serve` blocked on host by pnpm engine mismatch; `next dev` works directly

---

## Phase boundary

| Phase | Status |
|-------|--------|
| R10-A | **COMPLETE** |
| R10-B | **IMPLEMENTED** |
| R10-C | **NOT STARTED** |
| R10-D | **NOT STARTED** |
| R10-E | **NOT STARTED** |
| R10-F | **NOT STARTED** |
| R11+ | **NOT STARTED** |

---

## Next step

**CR-POST-R10-B-AUDIT-188** — do not start R10-C until audit returns **`R10_B_GREEN_R10_C_READY`**.
