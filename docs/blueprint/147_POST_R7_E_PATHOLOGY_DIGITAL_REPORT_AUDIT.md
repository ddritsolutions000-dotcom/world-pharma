# 147 — Post-R7-E pathology + digital report audit

**Status:** Audit only — **no R7-F+ coding**  
**Change ID:** **CR-POST-R7-E-AUDIT-147**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R7_E_WITH_BLOCKERS**

**Authority:** Verify repository after [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) against [140](140_R7_IMPLEMENTATION_PLAN.md). **Do not** implement R7-F+, create migrations, modify APIs/UI, or delete files.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) · [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) · [70](70_PATHOLOGY_REPORTING.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Verdict

R7-E **core backend pathology kernel is present and substantially correct**: `PathologyService`, versioned report lifecycle, SoD, customer final-report gating, RLS on new tables, R7-E e2e, and customer/pathologist/lab surfaces exist. However **full regression is not green** and **required UI completeness has gaps** (web-lab result entry uses hardcoded demo values; customer report error states incomplete).

| Gate | Result |
|------|--------|
| R7-E backend scope vs repo | **PASS** |
| State machine vs Book 70/140 | **PASS** (minor gap: reject-to-draft not exposed) |
| Immutability / versioning (service + e2e) | **PASS** (DB constraint gap noted) |
| SoD (lab enter vs pathologist sign) | **PASS** |
| RLS on R7-E tables | **PASS** (no `USING(true)` on R7-E tables) |
| PHI / notification safety | **PASS** |
| R7-E e2e | **PASS** (1/1) |
| **API full regression** | **FAIL** — **65/66** suites · **156/157** tests |
| UI completeness (hard gate) | **FAIL** — web-lab result entry; customer report errors |
| Typecheck / web builds / mobile | **PASS** |
| R7-F+ coding | **NOT STARTED** |

---

## 1. Repository truth (verified)

| Component | Location | Present |
|-----------|----------|---------|
| `PathologyService` | `apps/api/src/lab/pathology.service.ts` | ✓ |
| Report state machine | `apps/api/src/lab/lab-report-status.ts` (+ unit spec) | ✓ |
| Lab result entry + submit-verify | `LabOperationsController` `/lab/reports/:id/*` | ✓ |
| Pathologist verify/publish/amend | `PathologistController` `/pathologist/*` | ✓ |
| Customer report status + final GET | `CustomerLabBookingController` | ✓ |
| Admin metadata only | `AdminLabController` `GET /admin/lab/reports` | ✓ |
| Draft on processing complete | `LabDiagnosticsOpsService` → `ensureDraftReportForProcessing` | ✓ |
| Object storage on publish | `PrivateObjectStore` via `pathology.service.ts` | ✓ |
| Security events | `LAB_REPORT_*` types in `security-events.service.ts` | ✓ |
| Notification | `LAB_REPORT_PUBLISHED` in `notification-dispatch.service.ts` (opaque inbox) | ✓ |
| Migrations | `20260828180000_r7e_pathology_digital_report`, `20260828180100_r7e_result_lines_delete` | ✓ |
| `web-pathologist` app | `apps/web-pathologist/` | ✓ |
| web-lab pathology tab | `lab-pathology-panel.tsx` | ✓ |
| Customer web report | `lab-bookings-page.tsx` | ✓ |
| Customer RN report | `apps/mobile/src/customer-features.tsx` `LabBookingDetailScreen` | ✓ |

No duplicate pathology kernels found (single `PathologyService`, single `lab-report-status`).

---

## 2. State machine audit

**Canonical (Book 70):** `DRAFT → PENDING_VERIFY → VERIFIED → PUBLISHED`; amendment creates new version; prior `PUBLISHED` preserved.

**Implementation (`lab-report-status.ts`):**

| Transition | Allowed | Enforced server-side |
|------------|---------|----------------------|
| DRAFT → PENDING_VERIFY | ✓ | `submitForVerify` |
| PENDING_VERIFY → VERIFIED | ✓ | `verifyReport` |
| VERIFIED → PUBLISHED | ✓ | `publishReport` |
| PENDING_VERIFY → DRAFT | Defined in machine | **No API endpoint** (gap — not blocker) |
| DRAFT → PUBLISHED | ✗ | Rejected (409) |
| PUBLISHED → * | ✗ | Rejected; `amendReport` creates new DRAFT version |
| Repeat verify/publish | ✗ | Illegal transition 409 |
| Client direct status mutation | ✗ | No status field on client APIs |

**Finding F-SM-01 (LOW):** `PENDING_VERIFY → DRAFT` reject path exists in transition table but no lab/pathologist reject endpoint.

**Finding F-SM-02 (LOW):** Pathologist worklist query includes `DRAFT` in `currentVersion.status` filter (`pathology.service.ts` ~L123), so pathologists may see cases before lab staff submits for verification. Book 140 implies worklist after result entry handoff.

---

## 3. Immutability / versioning

| Check | Result |
|-------|--------|
| Published report cannot accept new result lines via API | **PASS** — `enterResults` requires `DRAFT` only |
| Post-publish result mutation blocked in e2e | **PASS** — `r7e` expects 409 on re-entry |
| Amendment creates new version; prior version rows remain | **PASS** — `amendReport` inserts new `lab_report_versions` row |
| Published blob stored (`object_key`) | **PASS** |
| Customer API serves structured JSON, not mutable draft | **PASS** — 404 until `PUBLISHED` |
| Server-derived actors/timestamps | **PASS** — `enteredByPersonId`, `verifiedByPersonId`, `publishedAt` |
| Audit trail | **PASS** — `LAB_REPORT_*` security events |

**Finding F-IM-01 (MEDIUM):** No database `CHECK` or trigger preventing `UPDATE` of `lab_report_versions` where `status = 'PUBLISHED'`. Immutability relies on service-layer guards only. R7-E e2e covers API path; direct DB bypass remains theoretically possible.

**Finding F-IM-02 (LOW):** `enterResults` uses `deleteMany` + re-insert on `DRAFT` versions — acceptable for draft re-entry; published lines are never deleted via this path.

---

## 4. Separation of duties

| Actor | Expected | Verified |
|-------|----------|----------|
| Lab staff | Enter results, submit for verify | **PASS** — e2e + `assertNotPathologistOnly` |
| Pathologist | Verify, publish, amend; **not** enter results | **PASS** — pathologist result entry returns 403 in e2e |
| Same person enter + verify/publish | Blocked | **PASS** — `assertSod` |
| Customer | Read final report only | **PASS** — 404 pre-publish; 403 cross-customer |
| Admin | Metadata list only | **PASS** — `listAdminReportMetadata` has no mutation endpoints |

---

## 5. RLS / tenancy

**Migration audit (`20260828180000_r7e_pathology_digital_report`):**

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on `lab_reports`, `lab_report_versions`, `lab_result_lines`, `health_artifacts`
- Policies use `app.can_org`, `app.write_org`, `app.can_person`, `app.is_worker`, `app.is_platform` — **no `USING(true)` on R7-E tables**

**Live verification:**

- `prisma migrate status`: **53 migrations, database schema up to date**
- `rls.tenancy.e2e.spec.ts`: **PASS** — confirms `worldpharma_app` `NOSUPERUSER` + `NOBYPASSRLS`, cross-tenant deny

**Note:** Legacy `USING(true)` policies exist on pre-R7 tables (identity, catalog, finance, etc.) — pre-existing ecosystem debt, not introduced by R7-E.

**R7-E e2e isolation:** Lab A ↛ B, pathologist SoD, customer A ↛ B report — **PASS**.

---

## 6. Customer report visibility

| Phase | Expected | Verified |
|-------|----------|----------|
| Pre-publish | Safe status only, no diagnostic content | **PASS** — `getCustomerReportStatus` + collection `report_status`; `GET .../report` → 404 |
| Post-publish | Authorized final structured report | **PASS** — e2e + web/mobile integration |
| Internal notes exposed | None | **PASS** — e2e asserts no `internal_|pathologist_note` in customer JSON |

**Finding F-CU-01 (MEDIUM):** Customer web `lab-bookings-page.tsx` ~L224–227: `fetchLabReport` failure maps all errors to `generic` — does not surface **403** vs **404 unavailable** vs **network** for report fetch specifically.

**Download:** Not implemented; Book 140 allows view without mandating download — **N/A**.

---

## 7. PHI / security search

| Search | Finding |
|--------|---------|
| Report content in logs | **None** in `apps/api/src/lab/*` |
| `JSON.stringify` clinical payload | `pathology.service.ts:294` — object-store blob write only, not logged |
| Notification payload | **PASS** — outbox carries ids only; inbox body generic |
| Report in URLs | **None** |
| Customer over-exposure | **PASS** — minimum analyte lines post-publish |

No CRITICAL PHI findings.

---

## 8. Document access

- Published report stored in `PrivateObjectStore` with key on version row
- Customer API returns structured fields from DB, not public/signed URLs
- No report tokens in frontend source
- **PASS** — no public report URLs

---

## 9. Notifications / events

| Event | Lifecycle point | PHI in payload |
|-------|-----------------|----------------|
| `LAB_REPORT_PUBLISHED` (outbox) | On publish | **No** — ids + version_number + sandbox |
| Inbox dispatch | Handler registered | **No** — generic body |
| Idempotency | `occurrenceKey` on publish | **PASS** |

Security events (`LAB_REPORT_*`) use metadata ids only — **PASS**.

---

## 10. File hygiene

No duplicate pathology services/controllers/state machines. No temp/fix/backup files introduced for R7-E.

**Observation:** `apps/web-pathologist/.next/` build artifacts present locally (normal Next output, not source duplication).

---

## 11. UI completeness scorecard

| App | Screen | Route | API | Real data | All states | Result |
|-----|--------|-------|-----|-----------|------------|--------|
| web-pathologist | Sign in | `/` | OTP shell | ✓ | partial 401 via expire | **PASS** |
| web-pathologist | Session expired | `/` | — | — | ✓ | **PASS** |
| web-pathologist | Lab selector | `/` | `GET /lab/organizations` | ✓ | loading/error/network/403 | **PASS** |
| web-pathologist | Worklist | `/` | `GET /pathologist/work` | ✓ | loading/empty/error/403/network | **PASS** |
| web-pathologist | Case review | `/` inline | worklist data; `GET /pathologist/reports/:id` **unused** | ✓ from API | partial | **PASS** |
| web-pathologist | Verify / publish / amend | `/` inline | POST verify/publish/amend | ✓ | error/403; validation server-side | **PASS** |
| web-pathologist | Forbidden | `/` | — | — | ✓ | **PASS** |
| web-pathologist | Result entry | — | — | N/A (SoD — lab only) | — | **N/A** |
| web-lab | Pathology queue | tab | `GET /lab/pathology` | ✓ | loading/empty/shell errors | **PASS** |
| web-lab | Report detail | tab | `GET /lab/reports/:id` | ✓ | error via shell | **PASS** |
| web-lab | Result entry + submit | tab | POST results + submit-verify | **✗ hardcoded Glucose 95** | no form validation UI | **FAIL** |
| web-customer | Bookings list | `/lab/bookings` | `GET /me/lab/bookings` | ✓ | full shell states | **PASS** |
| web-customer | Booking detail + status | `/lab/bookings/[id]` | booking + collection | ✓ | loading/403/session/network | **PASS** |
| web-customer | View final report | inline | `GET .../report` | ✓ | loading; **report errors → generic only** | **FAIL** |
| mobile (RN) | Lab bookings | nav | `GET /me/lab/bookings` | ✓ | FeatureStates | **PASS** |
| mobile (RN) | Booking detail + report | nav | collection + report | ✓ | FeatureStates + unavailable text | **PASS** |
| admin | Report governance UI | — | `GET /admin/lab/reports` API only | metadata | no dedicated screen | **DEFERRED** (Book 146 minimum) |

**Hardcoded demo data:** `apps/web-lab/src/lab-pathology-panel.tsx` L76–78 submits fixed `{ analyte_code: 'GLU', analyte_name: 'Glucose', value: '95' }` — violates audit requirement for real result-entry workflow.

---

## 12. Regression scorecard (28 Aug 2026, `--skip-nx-cache`)

| Gate | Result |
|------|--------|
| **API (full)** | **FAIL** — **65/66** suites · **156/157** tests |
| R7-A | **PASS** — `r7a.lab.e2e.spec.ts` (included) |
| R7-B | **FAIL** — `r7b.lab-booking.e2e.spec.ts` — catalog detail `GET /me/lab/catalog/r7b-lab-{suffix}?country=XX` → **404** (expected 200) at L265 |
| R7-C | **PASS** — `r7c.sample-collection.e2e.spec.ts` |
| R7-D | **PASS** — `r7d.transport-accession-processing.e2e.spec.ts` |
| R7-E | **PASS** — `r7e.pathology-digital-report.e2e.spec.ts` (1/1) |
| RLS | **PASS** — `rls.tenancy.e2e.spec.ts` (10 tests in suite) |
| R3 | **PASS** — `r3.isolation.e2e.spec.ts` |
| R5/R6 vendor/clinical | **PASS** — **9/9** suites · **11/11** tests |
| Workspace tests | **FAIL** — **10/11** projects (api failed) · **214/215** tests pass |
| Web tests (admin, customer, shell-*, ui-kit) | **PASS** — **7/7** projects · **57/57** tests |
| Mobile tests | **PASS** — **2/2** suites · **4/4** tests |
| Typecheck | **PASS** — **21/21** projects |
| Web builds | **PASS** — web-customer, web-lab, web-pathologist |
| Pending migrations | **PASS** — 0 pending (53 applied) |

**First failure root cause:** R7-B e2e catalog detail-by-slug returns 404 after successful browse list. Likely catalog routing/slug resolution regression or test-order isolation — **not R7-E-specific**, but blocks full API green per audit gate.

---

## 13. Production boundary

| Control | Status |
|---------|--------|
| Live PSP / real money | **OFF** — sandbox pay only |
| `live_payout` | **false** in lab capability |
| Real carriers | **OFF** — mock transport |
| LIS/HIS | **NOT present** |
| Physical report delivery | **NOT started** (R7-F) |
| Production healthcare | **NOT enabled** — `sandbox: true` on reports |
| Live e-Rx / auto refill | **OFF** |
| Production LiveKit / recording | **OFF** |

No CRITICAL production-boundary violations.

---

## 14. Legal / human gates (engineering respect only)

| Gate | Engineering status |
|------|-------------------|
| OD-LAB-08 pathologist e-sign legal mechanism | **UNRESOLVED** — sandbox abstraction only; no legal claim |
| Official e-report status | Correctly **not claimed** |
| Country-pack lab enablement | Fail-closed inherited from R7-A/B packs |
| Production healthcare authorization | **NOT granted** |
| OD-LAB-05 panic values in SMS | **Respected** — notifications opaque |

---

## 15. Blockers summary

| ID | Severity | Finding | Action (future CR) |
|----|----------|---------|-------------------|
| **B-01** | **HIGH** | API regression **65/66** — R7-B catalog detail 404 | Fix catalog slug/detail route or test isolation |
| **B-02** | **HIGH** | web-lab result entry uses **hardcoded demo values** | Real analyte entry form + validation |
| **B-03** | **MEDIUM** | Customer web report fetch errors collapse to `generic` | Map 403/404/network for report GET |

Non-blocking observations: F-SM-01, F-SM-02, F-IM-01, F-IM-02, admin UI deferred.

---

## Final declaration

**FINAL VERDICT: R7_E_WITH_BLOCKERS**

R7-E pathology kernel and R7-E e2e are **substantively implemented**, but **full regression is not green** and **UI hard-gate items fail** (web-lab fake result entry; customer report error states).

**R7-F NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No physical report delivery.**  
**No production healthcare enablement.**

**STOP.**
