# 174 — Post-R9-B audit

**CR:** CR-POST-R9-B-AUDIT-174  
**Verdict:** **R9_B_GREEN_R9_C_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [173](173_R9_B_CUSTOMER_HEALTH_UI_IMPLEMENTATION.md)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [172](172_POST_R9_A_AUDIT.md) (**R9_A_GREEN_R9_B_READY**)

---

## Executive summary

Repository inspection confirms **R9-B is implemented within Book 170 R9-B scope**. Customer web (`/health`, `/health/artifacts/[id]`) and mobile (`health-home`, `health-artifact-detail`) consume real R9-A APIs via `health-api.ts` clients. Timeline UI shows metadata only; clinical payload renders only after authorized `/payload` responses. **No accidental R9-C/D/E/F or R10+ implementation** was found. R9-A backend files are unchanged.

**No product-level security, PHI, or functional blockers** were identified for R9-B acceptance.

**Automated verification:** web-customer **24/24**, mobile **10/10**, typechecks PASS, web-customer production build PASS, R9-A e2e **1/1** isolated PASS. Combined regression batch **50/51** — one failure classified as **test-infrastructure/isolation debt** (not R9-B, not R9-A).

**Runtime:** API, web, Android, and iOS **interactive runtime not executed** in this audit session (`API_NOT_RUNNING`, `WEB_NOT_RUNNING`, `ANDROID_RUNTIME_NOT_VERIFIED`, `IOS_RUNTIME_NOT_VERIFIED`).

---

## Audit scope

Documentation-only audit of CR-R9-B-IMPL-173 against Books [170](170_R9_IMPLEMENTATION_PLAN.md), [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md), [172](172_POST_R9_A_AUDIT.md), [173](173_R9_B_CUSTOMER_HEALTH_UI_IMPLEMENTATION.md), and repository source. **No code, schema, migration, test, or configuration changes** (except this book and index/roadmap updates).

---

## 1. R9-B scope verification

| Area | Status | Evidence |
|------|--------|----------|
| Customer web Health home | **IN SCOPE** | `apps/web-customer/src/health-page.tsx`, `app/health/page.tsx` |
| Customer web artifact detail | **IN SCOPE** | `health-artifact-page.tsx`, `app/health/artifacts/[id]/page.tsx` |
| Mobile Health home | **IN SCOPE** | `apps/mobile/src/health-features.tsx` → `HealthHomeScreen` |
| Mobile artifact detail | **IN SCOPE** | `HealthArtifactDetailScreen` |
| R9-A API consumption | **VERIFIED** | `fetchHealthTimeline`, `fetchHealthArtifactMetadata`, `fetchHealthArtifactPayload` in web + mobile `health-api.ts` |
| Navigation integration | **VERIFIED** | `customer-shell.tsx` Health link; `navigation.ts` + `app-root.tsx` + `AccountHubScreen` |
| R9-C consent-scope enforcement | **NOT STARTED** | No scope checks on health reads; consent link only |
| R9-D doctor Health | **NOT STARTED** | No matches in `web-doctor` for health timeline/artifact |
| R9-E prescription projection | **NOT STARTED** | No prescription artifact rendering in health UI |
| R9-F admin/break-glass | **NOT STARTED** | No admin health routes or break-glass UI |
| R10+ | **NOT STARTED** | — |
| R9-A backend changes | **NONE** | `apps/api/src/health/*` unchanged from R9-A baseline |

---

## 2. Web Health home (`/health`)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Uses `GET /api/v1/health/timeline` | **PASS** | `health-page.tsx` → `fetchHealthTimeline` → `api/v1/health/timeline?country_code=` |
| Loading | **PASS** | `LoadingState label="Loading health timeline"` |
| Empty | **PASS** | `EmptyState title="No health records yet"` |
| Populated | **PASS** | `groupTimelineByDate` + `TimelineEventCard` |
| Pagination | **PASS** | `next_cursor` + Load more button |
| Refresh | **PASS** | Refresh timeline button |
| 401 | **PASS** | `SessionExpiredState` via `classifyHealthApiFailure` → `unauthorized` |
| 403 | **PASS** | `PermissionDeniedState` |
| Disabled pack | **PASS** | 403 + message contains "not enabled" → `disabled` → dedicated empty state |
| Network | **PASS** | `NetworkErrorState` + Retry |
| Generic error | **PASS** | `EmptyState` + Retry |
| No fake timeline data | **PASS** | `items` state populated only from API `result.data.items`; no hardcoded rows in production code |

**Static verification:** PASS  
**Interactive runtime:** NOT VERIFIED (web server not running)

---

## 3. Web artifact detail (`/health/artifacts/[id]`)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Metadata API | **PASS** | `fetchHealthArtifactMetadata` |
| Payload API | **PASS** | `fetchHealthArtifactPayload` when `payload_available` |
| Loading | **PASS** | Separate metadata + payload loading states |
| Success | **PASS** | Metadata card + `HealthReportContent` |
| 401 | **PASS** | `SessionExpiredState` on metadata unauthorized |
| 403 | **PASS** | `PermissionDeniedState` (metadata + payload) |
| 404 | **PASS** | Record not found / Report not available |
| Network | **PASS** | `NetworkErrorState` + Retry (metadata + payload) |
| Generic error | **PARTIAL** | Metadata generic `EmptyState` has **no Retry** (payload generic same) |
| Client bypass | **PASS** | Payload rendered only from `fetchHealthArtifactPayload` success; no local cache of clinical data |
| Invalid ID | **PASS** | API 404 → empty state; no crash |

**Static verification:** PASS  
**Interactive runtime:** NOT VERIFIED

---

## 4. Mobile Health experience (shared RN)

| Requirement | Code parity | Notes |
|-------------|-------------|-------|
| Health Home | **PASS** | `HealthHomeScreen` |
| Timeline from API | **PASS** | `fetchHealthTimeline` |
| Pagination / refresh | **PASS** | Load more + Refresh timeline |
| Artifact detail | **PASS** | `HealthArtifactDetailScreen` |
| Loading / empty / populated | **PASS** | `FeatureStates` + `NativeEmptyState` |
| 401 | **PASS** | `ctx.onUnauthorized()` → app `expired` screen |
| 403 | **PASS** | `ctx.setViewState('forbidden')` |
| Disabled pack | **PASS** | `disabledPack` + dedicated empty state |
| 404 / unavailable | **PASS** | Record not found / Report not available |
| Network retry | **PASS** | `NativeNetworkErrorState onRetry` |
| Generic error retry | **PARTIAL** | Timeline generic + load-more generic lack explicit retry (web has retry) |
| No fake data | **PASS** | State from API only |
| No auto-selection | **PASS** | User taps "View record" per event |

**Android runtime:** NOT VERIFIED  
**iOS runtime:** `IOS_RUNTIME_NOT_VERIFIED`

---

## 5. Web / mobile parity matrix

| Capability | Web CODE | Android CODE | iOS CODE | Web RUNTIME | Android RUNTIME | iOS RUNTIME |
|------------|----------|--------------|----------|-------------|-----------------|-------------|
| Health home | ✓ | ✓ | ✓ (shared RN) | — | — | — |
| Timeline | ✓ | ✓ | ✓ | — | — | — |
| Loading | ✓ | ✓ | ✓ | — | — | — |
| Empty | ✓ | ✓ | ✓ | — | — | — |
| Error | ✓ | ✓ | ✓ | — | — | — |
| Retry | ✓ | ~partial | ~partial | — | — | — |
| 401 | ✓ | ✓ | ✓ | — | — | — |
| 403 | ✓ | ✓ | ✓ | — | — | — |
| Disabled pack | ✓ | ✓ | ✓ | — | — | — |
| Artifact detail | ✓ | ✓ | ✓ | — | — | — |
| 404/unavailable | ✓ | ✓ | ✓ | — | — | — |
| Network | ✓ | ✓ | ✓ | — | — | — |
| Refresh | ✓ | ✓ | ✓ | — | — | — |

Legend: **CODE** = static source audit; **RUNTIME** = interactive verification (not performed this session).

---

## 6. PHI / security

| Check | Result |
|-------|--------|
| Timeline metadata only | **PASS** — title, type, source, status, date; no analytes/findings |
| Payload after authorized API | **PASS** — `HealthReportContent` / `HealthReportBody` only when payload fetch succeeds |
| No hardcoded PHI | **PASS** — no production hardcoded timeline/report rows |
| No analytics/events in health modules | **PASS** — grep: no `trackEvent` / `analytics` in health-* sources |
| No PHI logging | **PASS** — no `console.log` of report bodies in health UI |
| Client not authorization source | **PASS** — all reads via JWT + R9-A APIs; `country_code` is query hint only |
| Deep link bypass | **PASS** — artifact route checks session + calls metadata API; 404/403 from server |

---

## 7. R9-A regression

### Combined batch (audit session)

| Metric | Result |
|--------|--------|
| Suites | **23** run |
| Tests | **51** total |
| Pass | **50** |
| Fail | **1** |

### Failure classification

| Test | Failure | Classification |
|------|---------|----------------|
| `r8c.imaging-acquisition.e2e.spec.ts` | `policyPack.create` unique constraint on `(country_id, version)` | **test-infrastructure/isolation debt** |

### Isolated R9-A

| Suite | Result |
|-------|--------|
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** |

R9-A controller, services, and migrations remain intact. **Not classified as R9-A regression or R9-B product defect.**

---

## 8. Web tests

| Suite | Tests | Focus |
|-------|-------|-------|
| `health-page.spec.tsx` | **7** | loading, populated, empty, 401, 403, disabled pack, network retry, pagination |
| `health-artifact-page.spec.tsx` | **5** | metadata+payload success, 404 metadata, 403, 404 payload, network retry |
| `health-utils.spec.ts` | **4** | error classification, grouping, source labels |
| Other web-customer suites | **8** | shell, cart, checkout, orders, store-home |
| **Total web-customer** | **24/24 PASS** | No snapshot-only health tests |

**Gaps (non-blocking):** no dedicated web test for timeline generic error, artifact metadata 401, or imaging payload rendering.

---

## 9. Mobile tests

| Suite | Tests | Focus |
|-------|-------|-------|
| `health-parity.spec.ts` | **2** | `classifyHealthApiFailure`, `formatArtifactType` |
| Other mobile suites | **8** | navigation, consult-panel, imaging-parity |
| **Total mobile** | **10/10 PASS** | |

**Gap (non-blocking):** no component/integration tests for `HealthHomeScreen` or `HealthArtifactDetailScreen` state transitions (unlike web). Book 173 implied broader mobile test parity; actual coverage is helper-level only.

---

## 10. Typecheck / build

| Target | Result (audit session) |
|--------|------------------------|
| `apps/api` typecheck | **PASS** |
| `web-customer` typecheck | **PASS** |
| `mobile` typecheck | **PASS** |
| `web-customer` production build | **PASS** — routes `/health`, `/health/artifacts/[id]` present |

---

## 11. Runtime verification

| Check | Result |
|-------|--------|
| `/health/ready` | **NOT VERIFIED** — API not running on localhost:3001 |
| `/api/v1/health/timeline` (live) | **NOT VERIFIED** |
| Web `/health` interactive | **NOT VERIFIED** — web not running on localhost:3000 |
| Android emulator | **ANDROID_RUNTIME_NOT_VERIFIED** |
| iOS simulator | **IOS_RUNTIME_NOT_VERIFIED** |

Automated e2e (R9-A supertest) and Jest UI tests provide **automated verification** only. Build/typecheck provide **static verification**.

---

## 12. API / UI contract

| Contract point | Alignment |
|----------------|-----------|
| Timeline shape `{ items, next_cursor }` | **MATCH** |
| Cursor pagination | **MATCH** — `cursor` query on load more |
| Artifact metadata fields | **MATCH** — types in `health-api.ts` align with R9-A `presentMetadata` |
| Payload delegate shape | **MATCH** — `{ artifact_type, payload }` with R7/R8 report bodies |
| 401/403/404 semantics | **MATCH** — via `apiCall` + `classifyHealthApiFailure` |
| Disabled pack 403 message | **MATCH** — substring "not enabled" |
| `payload_available: true` always (Book 172 debt) | **RECORDED** — UI auto-attempts payload when flag true; actual availability enforced by `/payload` 404 |

---

## 13. Navigation / auth

| Check | Result |
|-------|--------|
| Health link in shell | **PASS** — `customer-shell.tsx` |
| Mobile nav entry | **PASS** — `health-home` in `MORE_NAV`, `ACCOUNT_NAV`, hub |
| Auth required | **PASS** — session checks before API calls; sign-in required states |
| Deep link auth | **PASS** — unauthenticated → sign-in empty state |
| Invalid artifact ID | **PASS** — 404 empty state, no throw |
| Back navigation | **PASS** — web Link to `/health`; mobile `onBack` |
| Session expiry | **PASS** — web `SessionExpiredState`; mobile `onUnauthorized` → `expired` |

---

## 14. Accessibility / UI quality (static)

| Check | Result |
|-------|--------|
| Headings | **PASS** — `Heading` / `NativeText variant="h2"` |
| Accessible controls | **PASS** — web timeline links use `aria-label`; buttons labeled |
| Error messages | **PASS** — user-facing copy, no raw JSON/stack traces |
| Retry controls | **PASS** on web; **partial** on mobile generic errors |
| Focus / keyboard | **PASS** (web) — standard ui-kit components; RN touch targets via `NativeButton` |

---

## 15. Verdict breakdown

### PRODUCT BLOCKERS

**None identified.**

### NON-BLOCKING TECHNICAL DEBT

1. Mobile lacks screen-level tests for Health Home / Artifact Detail (helpers only).
2. Minor web/mobile parity: mobile generic timeline errors lack explicit retry (web has retry).
3. Web artifact metadata generic error lacks retry button.
4. R9-A `payload_available` always `true` — UI may attempt payload fetch before 404 (Book 172).
5. Combined regression batch intermittent `r8c` policy-pack collision (pre-existing isolation pattern).

### ENVIRONMENT LIMITATIONS

1. No interactive API/web/Android/iOS runtime in this audit session.
2. `IOS_RUNTIME_NOT_VERIFIED` — no Xcode/iOS simulator execution.

---

## 16. FINAL VERDICT

**`R9_B_GREEN_R9_C_READY`**

R9-B customer Health UI is correctly scoped, wired to R9-A APIs, and free of product-level blockers. Automated tests and static analysis pass. Runtime verification was not performed live; that gap is documented and does not block R9-C planning authorization.

**Next authorized implementation:** `CR-R9-C-IMPL-175` (consent scope enforcement and revoke-blocks-access).

**Hard stop:** Do not implement R9-C+ in this audit CR.
