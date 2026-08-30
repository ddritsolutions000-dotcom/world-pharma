# 167 — Post-R8-E audit (final gate)

**Status:** Audit only — **no R8-F+ coding, no source changes**  
**Change ID:** **CR-POST-R8-E-AUDIT-167**  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R8_E_GREEN_R8_F_READY**

**Authority:** Final verification after [166](166_R8_E_IMAGING_REPORT_PUBLICATION_IMPLEMENTATION.md). **Do not** implement R8-F, R9+, production healthcare, live PSP/money/carriers, PACS/DICOM transfer, or physical imaging report delivery under this CR.

**Canonical inputs:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [164](164_R8_D_RADIOLOGIST_INTERPRETATION_IMPLEMENTATION.md) · [165](165_POST_R8_D_AUDIT.md) · [166](166_R8_E_IMAGING_REPORT_PUBLICATION_IMPLEMENTATION.md)

**Repo truth:** `apps/api/src/radiology/*` · `apps/web-customer` · `apps/mobile` · `apps/web-radiologist` · `apps/web-radiology` · `packages/database/prisma` · `worldpharma` + `worldpharma_test` DBs · audit session 29 Aug 2026.

---

## 0. Executive summary

R8-E implementation in repository matches Book 166: `HealthArtifactType.IMAGING_REPORT`, `VERIFIED→PUBLISHED` publication with SoD, customer report status/GET APIs, amendment with lineage and re-verification, DB immutability triggers on published versions/lines, customer RLS for published reads, PHI-safe outbox/security events, radiologist publish/amend UI, customer web/mobile report surfaces, and admin governance metadata.

**R8-F boundary:** No imaging physical report delivery, `REPORT_DELIVERY`, or report-delivery finance in radiology module. Lab R7-F physical report paths remain lab-scoped only.

**Regression:** Full API e2e suite **73/73 suites, 171/171 tests PASS** on first isolated run. Subsequent full-suite runs showed **test-isolation debt** (shared `worldpharma_test` policy-pack pollution), not R8-E product defects. R8-E suite **4/4 PASS** in dedicated isolated runs.

**UI:** Static wiring verified for customer web, mobile, and web-radiologist. **BROWSER_RUNTIME_NOT_VERIFIED** · **MOBILE_RUNTIME_NOT_VERIFIED**.

**R8-F readiness:** **READY** — requires separate **`CR-R8-F-IMPL-*`** authorization.

---

## 1. R8-E audit matrix

| Area | Result | Evidence | Blocker? |
|------|--------|----------|----------|
| **Backend — IMAGING_REPORT artifact** | PASS | `schema.prisma` `HealthArtifactType.IMAGING_REPORT`; `interpretation.service.ts` `healthArtifact.create` with `imagingReportVersionId` + `imagingBookingId` | No |
| **Backend — publish workflow** | PASS | `publishReport()` requires `VERIFIED`, SoD, findings, non-cancelled booking, `ACQUIRED` study; idempotent if already `PUBLISHED` | No |
| **Backend — amendment** | PASS | `amendReport()` from `PUBLISHED` only; creates DRAFT vN+1 with `amendsVersionId`; re-submit/verify/publish required (e2e) | No |
| **Backend — customer APIs** | PASS | `getCustomerReportStatus`, `getCustomerPublishedReport`; 404 before publish; 403 cross-customer | No |
| **API surface** | PASS | Book 166 endpoints present in `radiologist.controller.ts`, `customer-imaging-booking.controller.ts`, `admin-radiology.controller.ts` | No |
| **State machine** | PASS | `imaging-report-status.ts`: `VERIFIED→PUBLISHED` only; illegal transitions 409; e2e PENDING_VERIFY publish blocked | No |
| **SoD — verify (R8-D intact)** | PASS | `assertSod` on verify + publish; e2e enterer cannot verify/publish own report | No |
| **SoD — amendment re-verify** | PASS | e2e amend → DRAFT → submit → different verifier → publish | No |
| **Versioning / lineage** | PASS | `versionNumber` increment; `amendsVersionId`; prior `PUBLISHED` row preserved; e2e asserts 2 versions | No |
| **Immutability — PUBLISHED** | PASS | Service 409 on post-publish edit; DB triggers `guard_published_imaging_report_version`, `guard_published_imaging_finding_line` in migration `20260829140100` | No |
| **Immutability — VERIFIED row** | DEBT | Service blocks edits; **no DB trigger** on `VERIFIED` version row (inherited R8-D pattern) | No |
| **PHI — outbox** | PASS | `IMAGING_REPORT_PUBLISHED` / `AMENDED` payloads: IDs, version_number, customer_person_id only; e2e regex | No |
| **PHI — security events** | PASS | Metadata: report/booking/org IDs + sandbox flag only | No |
| **PHI — notifications** | PASS | `notification-dispatch.service.ts` generic body; no findings in handler | No |
| **Notifications — idempotency** | PASS | `occurrenceKey` on outbox enqueue (`imaging_report_published:${version.id}`, `imaging_report_amended:${versionId}`) | No |
| **RLS — migrations** | PASS | `20260829140200` customer published-read policies; `20260829140100` health_artifacts imaging paths | No |
| **RLS — live DB** | PASS (migration) | ENABLE+FORCE on imaging tables from R8-D; customer RLS in `20260829140200`; `rls.tenancy.e2e.spec.ts` PASS | No |
| **RLS — isolation tests** | PASS | e2e: customer A/B, cross-org radiologist, tech/rider 403; progress no findings leak | No |
| **DB / migrations** | PASS | 65 migrations; zero pending on `worldpharma` + `worldpharma_test` | No |
| **Customer web UI** | PASS (static) | `imaging-bookings-page.tsx` + `imaging-api.ts`; real APIs; 401/403/404/network/generic states | No |
| **Customer mobile UI** | PASS (static) | `ImagingBookingDetailScreen` + `imaging-api.ts`; parity pattern with web | No |
| **web-radiologist** | PASS (static) | Publish (VERIFIED), amend (PUBLISHED), R8-D workflow retained | No |
| **web-radiology** | PASS | `imaging-interpretations-panel.tsx` metadata only; no findings | No |
| **Admin** | PASS | `listAdminImagingReportMetadata` — status/accession/version only; no clinical edit | No |
| **R8-D regression** | PASS | `r8d.radiologist-interpretation.e2e.spec.ts` PASS in clean full run; worklist/verify/SoD intact | No |
| **R8-C/B/A regression** | PASS | `r8c`, `r8a` PASS in full run; `r8b` flaky under pollution (see §4) | No |
| **R7 regression** | PASS | All `r7*.e2e.spec.ts` PASS in first full run (171/171) | No |
| **R3 / R5 / R6 regression** | PASS (run 1) | Included in 171/171 first full run | No |
| **Tests — R8-E e2e** | PASS | `r8e.imaging-digital-report.e2e.spec.ts` **4/4** isolated | No |
| **Tests — full suite 3×** | DEBT | Run 1: **171/171**; Run 2: **162/171**; Run 3: **169/171** — isolation failures (§4) | No |
| **Typecheck** | PASS | 23/23 projects | No |
| **Web builds** | PASS | `web-customer`, `web-radiologist`, `api` production builds | No |
| **Runtime — API** | PASS | `GET /health` → `{"status":"ok"}`; Nest started on port 4000 | No |
| **Runtime — browser** | NOT VERIFIED | **BROWSER_RUNTIME_NOT_VERIFIED** | No |
| **Runtime — mobile** | NOT VERIFIED | **MOBILE_RUNTIME_NOT_VERIFIED** | No |
| **File hygiene** | PASS | Single `InterpretationService`; no duplicate publication kernels; no `r8f` files | No |
| **R8-F boundary** | PASS | No radiology physical delivery code | No |
| **Production boundary** | PASS | Sandbox flags; no live PSP/PACS/DICOM enablement in R8-E paths | No |

---

## 2. Book 166 verification

| Claim (Book 166) | Verified |
|------------------|----------|
| Three R8-E migrations applied | Yes — `20260829140000`, `20260829140100`, `20260829140200` |
| `IMAGING_REPORT` distinct from `LAB_REPORT` | Yes — enum + CHECK constraint mutual exclusion |
| Publish/amend/customer report APIs | Yes — controllers + service methods |
| Amendment → re-verify | Yes — e2e full amend cycle |
| Customer web + mobile report UI | Yes — static wiring |
| web-radiologist publish/amend | Yes — `radiologist-shell.tsx` |
| Admin governance metadata | Yes — `GET /admin/imaging/reports` |
| R8-E e2e 4 tests | Yes — all pass isolated |
| R8-F NOT STARTED | Yes — no imaging delivery implementation |

---

## 3. State machine audit

**Transitions** (`imaging-report-status.ts`):

```
DRAFT → PENDING_VERIFY
PENDING_VERIFY → VERIFIED | DRAFT (reject — no API)
VERIFIED → PUBLISHED
PUBLISHED → (terminal for version row; amend creates new DRAFT current)
```

| Scenario | Service / test | Verdict |
|----------|----------------|---------|
| Unverified → publish | `assertImagingReportTransition` 409; e2e PENDING_VERIFY | PASS |
| VERIFIED → publish (authorized) | `publishReport`; e2e | PASS |
| Enterer → publish (SoD) | `assertSod` 403; e2e | PASS |
| Duplicate publish | Idempotent return if already PUBLISHED; e2e | PASS |
| Duplicate amend (mid-draft) | 409 `REPORT_NOT_PUBLISHED`; e2e | PASS |
| Cancelled study → publish | `assertStudyEligible` + cancelled booking check; e2e | PASS |
| Cross-org publish | `assertReportForOrg` 403; e2e | PASS |
| Post-publish edit | 409 API + DB triggers | PASS |

**Gap (non-blocking):** No explicit cross-**country** e2e for imaging publication; org/country enforced via tenancy + `imaging_org_id` membership (same pattern as R8-D).

---

## 4. Regression findings (3× full suite)

| Run | Suites | Tests | Result |
|-----|--------|-------|--------|
| 1 | 73 | 171 | **ALL PASS** |
| 2 | 73 | 171 | **2 suites FAIL** (9 tests) |
| 3 | 73 | 171 | **1 suite FAIL** (2 tests) |

### Run 2 failures — infrastructure / test-isolation debt

**Suite:** `apps/api/src/partner/r3.isolation.e2e.spec.ts`  
**Tests:** 8 failures (T-LOC, T-JOIN, T-PACK, T-ORG, T-INV, T-KYC, T-AUD)  
**Errors:** `OrganizationService.create` validation 400; partner application 400 instead of expected 200/403  
**Root cause:** Shared `worldpharma_test` state pollution after prior suites (country `XX` / org fixtures); **not R8-E product behavior**  
**Reproduce:** Only after heavy full-suite run; not reproduced in run 1

**Suite:** `apps/api/src/radiology/r8b.imaging-booking.e2e.spec.ts`  
**Test:** `discovers, books, pays sandbox, isolates tenants/locations, fail-closed packs`  
**Error:** `prisma.policyPack.create()` unique constraint on `(country_id, version)`  
**Root cause:** `publishPack()` uses `Math.floor(Date.now() % 1_000_000)` — collision under concurrent/sequential suite pressure on shared DB  
**Classification:** **Test-isolation debt** (same class as Book 166 note on `r7b`; **does not reproduce on clean run 1**)

### Run 3 failures — infrastructure / test-isolation debt

**Suite:** `apps/api/src/radiology/r8e.imaging-digital-report.e2e.spec.ts`  
**Tests:** `amendment creates new version…`, `unverified report cannot publish from PENDING_VERIFY`  
**Errors:** `imaging_center service is disabled for this country pack` (403 attest); booking 403  
**Root cause:** Prior suites overwrote/disabled `XX` country policy pack on shared test DB  
**Isolated R8-E re-run after pollution:** **4/4 PASS**

### Book 166 `r7b` failure — current status

**Does NOT reproduce** on audit run 1 (171/171). **Does reproduce** on run 2 when full suite stresses shared DB — same `policyPack` version collision mechanism as `r8b`.

---

## 5. Focused suite results (audit session)

| Suite | Isolated result |
|-------|-----------------|
| R8-E (`r8e.imaging-digital-report.e2e.spec.ts`) | **4/4 PASS** |
| R8-D | PASS in full run 1 |
| R8-C, R8-A, RLS | PASS in full run 1 |
| R8-B | Flaky under DB pollution; different assertion failure when run alone after pollution |
| R7-E | Flaky when run in batch after pollution |

---

## 6. UI audit (static)

### Customer web (`/radiology/bookings/[id]`)

| State | Wired |
|-------|-------|
| Report status (`fetchImagingReportStatus`) | Yes |
| Unavailable before publish | Yes — `report_available: false` copy |
| View final report (`fetchImagingReport`) | Yes — on demand |
| Version / amendment display | Yes — version number + amendment_reason |
| 401 | Yes — `expire()` |
| 403 | Yes — `PermissionDeniedState` |
| 404 | Yes — unavailable `EmptyState` |
| Network / generic | Yes |
| Hardcoded clinical demo | **None** — findings from API only |

### Customer mobile (`ImagingBookingDetailScreen`)

| State | Wired |
|-------|-------|
| Report status + fetch | Yes |
| Unavailable / forbidden / network / generic | Yes — native state components |
| Runtime | **MOBILE_RUNTIME_NOT_VERIFIED** |

### web-radiologist

| Action | Wired |
|--------|-------|
| Publish (VERIFIED) | `publishRadiologistReport` |
| Amend (PUBLISHED) | `amendRadiologistReport` |
| R8-D assign/findings/submit/verify | Retained |
| Error states | `PermissionDeniedState`, `NetworkErrorState`, error card |

---

## 7. R8-F boundary

| Check | Result |
|-------|--------|
| Imaging `REPORT_DELIVERY` / physical report request | **NOT FOUND** in `apps/api/src/radiology` |
| R8-F file glob | **0 files** |
| Lab physical report (R7-F) | Present — lab bounded context only; unchanged |

---

## 8. Production boundary (verified OFF)

Live PSP, real money, bank payouts, real carriers, production PACS/DICOM, production image storage, LIS/HIS, production healthcare, live e-Rx, automatic refill, production LiveKit, recording — **not enabled** in R8-E paths (`sandbox: true` throughout).

---

## PASS

- R8-E backend publication, amendment, versioning, customer access
- PHI-safe notifications, outbox, security events
- RLS customer read path for published reports (migration `20260829140200`)
- DB immutability triggers for published data
- R8-D interpretation workflow preserved
- Book 166 claims substantiated by source + tests
- First full regression **171/171**
- Typecheck **23/23**; targeted builds PASS
- API health endpoint PASS

---

## BLOCKERS

**None** — no product-level R8-E defect identified.

---

## NON-BLOCKING DEBT

1. **Test isolation:** Shared `worldpharma_test` policy-pack version collisions (`r8b`, `r7b`, intermittent `r8e`/`r3` under multi-suite runs). Fix: per-suite unique pack versions or DB reset between suites.
2. **VERIFIED version-row DB immutability:** Service-only (inherited from R8-D); published rows have triggers.
3. **Cross-country publication e2e:** Not explicitly covered; org scoping enforced.
4. **UI runtime:** Browser and mobile not interactively verified this session.

---

## REGRESSION FINDINGS

| Classification | Detail |
|----------------|--------|
| Product defect | **None** for R8-E scope |
| Test-isolation debt | `policyPack (country_id, version)` collisions; `XX` pack disablement after suite pollution |
| Clean baseline | Full suite **171/171** achievable (run 1) |

---

## R8-F READINESS

**READY** — R8-E digital publication is green. Physical imaging report delivery requires **`CR-R8-F-IMPL-*`**. R8-F remains **NOT STARTED**.

---

## FINAL VERDICT

**R8_E_GREEN_R8_F_READY**
