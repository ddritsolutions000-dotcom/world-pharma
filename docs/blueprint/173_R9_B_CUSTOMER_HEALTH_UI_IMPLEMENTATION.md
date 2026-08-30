# 173 — R9-B Customer Health UI implementation

**CR:** CR-R9-B-IMPL-173  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_B_IMPLEMENTED**  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [172](172_POST_R9_A_AUDIT.md) (**R9_A_GREEN_R9_B_READY**)

---

## Scope

R9-B customer-facing Health experience only (web + mobile), wired to real R9-A APIs:

- Health home / timeline (`GET /api/v1/health/timeline`)
- Artifact detail (`GET /api/v1/health/artifacts/:id` + `/payload`)
- Lab/imaging report rendering via delegated R7/R8 payload shapes (no duplicate kernels)
- Navigation integration; link to existing consent routes (no R9-C scope enforcement)

**Explicit non-starts:** R9-C consent-scope enforcement, R9-D doctor UI/APIs, R9-E prescription projection, R9-F admin governance, break-glass UI, R10+, new payment/logistics, R9-A backend changes.

---

## Web (`apps/web-customer`)

| Route | Screen | API |
|-------|--------|-----|
| `/health` | `HealthScreen` (`health-page.tsx`) | `GET /api/v1/health/timeline` |
| `/health/artifacts/[id]` | `HealthArtifactScreen` (`health-artifact-page.tsx`) | metadata + payload |

**Supporting modules:** `health-api.ts`, `health-utils.ts`, `health-report-content.tsx`  
**Shell nav:** Health button in `customer-shell.tsx`  
**Consent:** link to `/account/consent` (existing flow preserved)

Default `country_code`: **XX** (aligned with lab/imaging sandbox packs that enable `health_timeline_enabled`).

---

## Mobile (`apps/mobile`)

| Screen id | Component | API |
|-----------|-----------|-----|
| `health-home` | `HealthHomeScreen` | timeline |
| `health-artifact-detail` | `HealthArtifactDetailScreen` | metadata + payload |

**Supporting modules:** `health-api.ts`, `health-utils.ts`, `health-features.tsx`  
**Navigation:** `navigation.ts` (`MORE_NAV`, `ACCOUNT_NAV`), `app-root.tsx`, `AccountHubScreen`

Shared React Native implementation for Android and iOS.

---

## State matrix (web + mobile parity)

| Capability | Web | Android | iOS |
|------------|-----|---------|-----|
| Health home | ✓ | ✓ | ✓ (shared RN) |
| Timeline (real API) | ✓ | ✓ | ✓ |
| Empty state | ✓ | ✓ | ✓ |
| Loading | ✓ | ✓ | ✓ |
| Error / retry | ✓ | ✓ | ✓ |
| Session expiry (401) | ✓ | ✓ | ✓ |
| Forbidden (403) | ✓ | ✓ | ✓ |
| Disabled health pack | ✓ | ✓ | ✓ |
| Artifact detail | ✓ | ✓ | ✓ |
| Artifact unavailable (404) | ✓ | ✓ | ✓ |
| Network failure | ✓ | ✓ | ✓ |
| Refresh | ✓ | ✓ | ✓ |
| Pagination / load more | ✓ | ✓ | ✓ |

**iOS runtime:** `IOS_RUNTIME_NOT_VERIFIED` (host lacks Xcode; Android/RN code path verified via shared implementation + mobile tests).

---

## API error mapping

| Status | UI |
|--------|-----|
| 401 | Session expired → sign in again |
| 403 (pack off) | Health timeline unavailable |
| 403 (other) | Permission denied |
| 404 | Record/report not found |
| Network | Retry |
| Other | Generic error + retry where appropriate |

Timeline shows **metadata only** (date, type, source, title, status). Clinical content only on authorized payload response.

---

## PHI / security

- No hardcoded timeline or report data
- No PHI in analytics/events
- Client does not embed patient IDs into authorization logic
- `country_code` sent as query only; backend enforces pack + ownership
- Payload rendering reuses R7/R8 customer report structures; no duplicate storage

---

## Tests (this session)

| Suite | Result |
|-------|--------|
| `web-customer` jest (8 suites) | **24/24 PASS** |
| `health-page.spec.tsx` | 7 tests |
| `health-artifact-page.spec.tsx` | 5 tests |
| `health-utils.spec.ts` | 4 tests |
| `mobile` jest (4 suites) | **10/10 PASS** |
| `health-parity.spec.ts` | 2 tests |

---

## Typecheck / build

| Target | Result |
|--------|--------|
| `apps/api` typecheck | PASS |
| `web-customer` typecheck | PASS |
| `mobile` typecheck | PASS |
| `web-customer` production build | PASS (23 routes incl. `/health`, `/health/artifacts/[id]`) |

---

## Backend regression (unchanged by UI)

| Pattern | Suites | Tests |
|---------|--------|-------|
| R9-A + RLS + R7 + R8 + R3 + R5 + R6 | **23** | **51/51 PASS** |

No R9-A backend modifications in R9-B.

---

## Runtime verification

| Check | Status |
|-------|--------|
| API typecheck | Verified |
| Web production build includes health routes | Verified |
| Local API + live `/health` UI | Requires running stack (same as prior slices) |
| Android emulator | `IOS_RUNTIME_NOT_VERIFIED` |

---

## Known limitations / debt

- R9-C artifact-level consent enforcement not in UI (by design)
- `payload_available: true` always in R9-A metadata (Book 172)
- Country code defaults to XX; user can change on web
- Mobile consent navigation from Health home routes to consent screen; full deep-link parity deferred

---

## Next step

**CR-POST-R9-B-AUDIT** — do not start R9-C until audit is green.
