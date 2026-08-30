# 151 — Post-R7 global ecosystem audit (final)

**Status:** Audit only — **no R8+ coding, no source changes**  
**Change ID:** **CR-POST-R7-GLOBAL-AUDIT-151**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R7_GLOBAL_WITH_BLOCKERS**

**Authority:** Strict read-only verification against Books 140–150 and live repository + test database. **Do not** implement R8+, create migrations, modify APIs/UI, enable live money/carriers/production healthcare, or perform unrelated cleanup.

**Canonical inputs:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) · [143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md) · [144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md) · [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) · [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) · [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) · [149](149_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION_PLAN.md) · [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) · [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md)

**Repo truth:** `apps/*` · `packages/database/prisma` · `apps/api/src/lab/*` · regression runs executed 28 Aug 2026 (this CR).

---

## 0. Executive summary

R7 sub-phases **A–F are implemented** with a **real end-to-end sandbox chain**: lab catalog → customer booking → sandbox payment → sample collection / CoC → transport → accession → processing → pathology → verification → digital publication → physical report request → REPORT_DELIVERY logistics → sandbox finance facts (`LAB_PAYABLE`, `REPORT_DELIVERY_FEE`).

Engineering does **not** equal legal approval. Production healthcare, live PSP, real carriers, and live payouts remain **OFF**.

This audit finds **functional completeness** for the authorized R7 scope, but **global green** is blocked by: customer mobile report-error UX parity (Book 148 web-only), service-layer-only published-report immutability, legacy `USING (true)` on pre-R7 tables, intermittent non-R7 regression flakes, and missing e2e for report amendment.

| Gate | Result |
|------|--------|
| R7 A–F domain chain (sandbox) | **PASS** |
| Book 148 blocker fixes still present | **PASS** |
| `creates_order: false` on lab booking pay | **PASS** |
| R7 table RLS (no `USING(true)` in R7 migrations) | **PASS** |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** (via `rls.tenancy.e2e.spec.ts`) |
| Migrations applied / pending | **56 / 0** |
| API suite 3× isolated | **68/68 · 161/161** (all three runs) |
| `inventory.e2e.spec.ts` 3× isolated | **Run 1 FAIL · Run 2 PASS · Run 3 PASS** |
| Production-ready claim | **FAIL** (none — expected) |
| R8 coding | **NOT STARTED** |

---

## 1. R7 complete chain verification

Verified by code inspection + `r7f.physical-report-finance.e2e.spec.ts` (full chain) and cross-phase e2e specs:

| Step | Evidence | Bypass check |
|------|----------|--------------|
| Lab catalog (`LAB_TEST` / `LAB_OWNED`) | `r7a.lab.e2e.spec.ts` | Vendor/partner isolation in catalog writes |
| Customer catalog + booking | `r7b.lab-booking.e2e.spec.ts` | Pack gates; wrong location rejected |
| Sandbox payment | `lab-booking.service.ts` + r7b | No `Order` row created (`creates_order: false`) |
| Sample collection + CoC | `r7c.sample-collection.e2e.spec.ts` | Append-only CoC; illegal transitions rejected |
| Transport | `r7d.transport-accession-processing.e2e.spec.ts` | Rider payloads exclude clinical content |
| Accession + processing | r7d | State machine server-authoritative |
| Pathology DRAFT→PENDING_VERIFY→VERIFIED→PUBLISHED | `r7e.pathology-digital-report.e2e.spec.ts` | SoD on verify/publish |
| Digital report customer access | r7e + Book 148 B-03 | Pre-publication denial; differentiated errors (web) |
| Physical report request | `r7f.physical-report-finance.e2e.spec.ts` | Requires published version; pack gate |
| REPORT_DELIVERY logistics | r7f + `delivery.service.ts` | Rider-safe metadata only |
| Sandbox finance facts | r7f | `LAB_PAYABLE` on publish; `REPORT_DELIVERY_FEE` on dispatch |

No shortcut found that skips authorization, tenant context, or state machines on the **API path** inspected.

---

## 2. R7-A — Diagnostics lab foundation

| Requirement | Status | Evidence |
|-------------|--------|----------|
| LAB organization capability | **PASS** | `OrganizationKind.LAB`; lab capability service |
| Lab pack gates (`lab_home`, `lab_center`, etc.) | **PASS** | `PolicyResolver` fail-closed |
| `LAB_PARTNER_SANDBOX_V1` attestation | **PASS** | `lab-capability.service.ts` |
| Lab catalog `LAB_TEST` / `LAB_OWNED` | **PASS** | Migration `20260827230000_r7a_catalog_lab_test_kind` |
| Vendor/partner isolation | **PASS** | r7a e2e + RLS on catalog |
| Admin accept/block | **PASS** | `web-admin` partners + `/admin/lab/*` |
| web-lab real APIs | **PASS** | Catalog, settings, bookings tabs wired |
| Loading/empty/error/auth states | **PASS** | Shell states on web-lab panels |

**Minor drift (non-blocking for R7-A):** Dashboard copy still references locked downstream tabs in places; topology strings may lag implementation.

---

## 3. R7-B — Customer lab booking

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Customer lab catalog + detail | **PASS** | `web-customer` + `mobile` lab screens |
| Exact-slug catalog detail (Book 148 B-01) | **PASS** | `lab-booking.service.ts` `catalogDetail` |
| Slot + location selection | **PASS** | CENTER vs HOME rules in service + r7b |
| Customer addresses / wrong location rejection | **PASS** | r7b e2e |
| Booking creation + idempotency | **PASS** | Idempotency keys on pay |
| Sandbox payment + cancellation | **PASS** | Mock PSP; cancel transitions |
| Customer web + RN Android/iOS | **PASS** | Shared `apps/mobile` kernel |
| web-lab booking visibility | **PASS** | `web-lab` bookings panel |
| No spurious Order on lab pay | **PASS** | `boundary.creates_order: false`; zero `order` rows in r7b |

---

## 4. R7-C — Sample collection + CoC

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `LabSample` model | **PASS** | Schema + migration `20260828120000_r7c_*` |
| Append-only CoC events | **PASS** | CoC service insert-only; illegal transitions rejected |
| `SAMPLE_COLLECTION` jobs | **PASS** | Logistics job type + RLS migration `20260828140000` |
| Phlebotomist assignment | **PASS** | Lab + worker APIs |
| Collect/handover flow | **PASS** | r7c e2e |
| Customer collection status | **PASS** | Customer API + web/RN |
| web-lab collections | **PASS** | Collections panel |
| mobile-phlebotomist | **PASS** | `apps/mobile-phlebotomist` app-root |
| Min-PII presenter | **PASS** | Phlebotomist payloads scoped |
| Tenant isolation | **PASS** | r7c + `rls.tenancy.e2e.spec.ts` |

---

## 5. R7-D — Transport, accession, processing

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `SAMPLE_TRANSPORT` lifecycle | **PASS** | handover → transit → received → accepted → processing |
| Rider pickup/delivery | **PASS** | `mobile-delivery` transport branch |
| Worker tenant context | **PASS** | Delivery service worker scope |
| `LabAccession` / `LabProcessing` | **PASS** | Migration `20260828160000_r7d_*` |
| Accession numbering | **PASS** | Server-generated in service |
| web-lab transport/accession/processing | **PASS** | Dedicated panels |
| Customer operational progress | **PASS** | Collection boundary fields on booking |
| No clinical content to delivery actors | **PASS** | r7d asserts no diagnosis/result in rider payloads |

---

## 6. R7-E — Pathology + digital report

| Requirement | Status | Evidence |
|-------------|--------|----------|
| State machine DRAFT / PENDING_VERIFY / VERIFIED / PUBLISHED | **PASS** | `pathology.service.ts` + r7e |
| SoD (enter ≠ verify ≠ publish) | **PASS** | `assertSod()` |
| Result entry + verification + publication | **PASS** | web-lab pathology + web-pathologist |
| Amendment/versioning | **PASS** (service) | `amendReport()` creates new version; old preserved |
| Amendment e2e coverage | **PARTIAL** | **No** r7e test for amend path |
| Immutable historical versions (API) | **PASS** | Published version read-only via API |
| DB-enforced published immutability | **FAIL** | **F-IM-01** — service-only (Book 147) |
| Customer pre-publication denial | **PASS** | r7e |
| Customer final report access | **PASS** | Customer report endpoint |
| Differentiated customer report errors (Book 148 B-03) | **PASS (web)** · **FAIL (mobile)** | `lab-bookings-page.tsx` has `reportError` states; RN does not |
| Real pathology result-entry form (Book 148 B-02) | **PASS** | `lab-pathology-panel.tsx` |
| Admin metadata-only | **PASS** | Admin lab sections metadata |

---

## 7. R7-F — Physical report + sandbox finance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `PhysicalReportRequest` + lifecycle | **PASS** | `physical-report.service.ts` |
| Published-version requirement | **PASS** | Enforced before request |
| `physical_report_delivery` pack gate | **PASS** | Fail-closed |
| Cancellation / failure behavior | **PASS** | State machine + events |
| `REPORT_DELIVERY` logistics | **PASS** | `delivery.service.ts` branch |
| Rider-safe parcel metadata | **PASS** | r7f asserts no analyte/pathology in rider JSON |
| Customer physical-report UX (web) | **PASS** | `lab-bookings-page.tsx` physical section |
| Customer RN UX | **PARTIAL** | Basic flow present; no differentiated report/physical error states |
| web-lab physical tab | **PASS** | `lab-physical-panel.tsx` |
| mobile-delivery report-delivery branch | **PASS** | `mobile-delivery/app-root.tsx` |
| Admin metadata | **PASS** | `partners-admin.tsx` |
| `LAB_PAYABLE` sandbox fact | **PASS** | On publish in `pathology.service.ts` |
| `REPORT_DELIVERY_FEE` sandbox fact | **PASS** | On dispatch in `physical-report.service.ts` |
| Digital report independent of physical payment | **PASS** | Separate concerns; r7f chain |
| Physical delivery does not mutate clinical facts | **PASS** | Logistics/status only |

---

## 8. RLS / tenancy / security

| Check | Status | Notes |
|-------|--------|-------|
| `worldpharma_app` NOSUPERUSER | **PASS** | `rls.tenancy.e2e.spec.ts` queries `pg_roles` |
| `worldpharma_app` NOBYPASSRLS | **PASS** | Same |
| FORCE RLS on R7 clinical tables | **PASS** | `lab_reports`, `lab_report_versions`, `lab_result_lines`, `health_artifacts`, `physical_report_requests`, `lab_bookings`, CoC, accession, processing |
| R7 migrations: no `USING (true)` | **PASS** | Grep clean on `20260828*` migrations |
| Legacy tables: `USING (true)` residual | **PARTIAL** | ~93 policy lines across **12 pre-R7** migrations (identity, catalog, finance, clinical foundation). R7 scope uses tenant policies. |
| Tenant context server-built | **PASS** | Prisma middleware / request context |
| Client-controlled tenant bypass | **NOT FOUND** on inspected paths |

Isolation matrix (e2e): Customer A ↛ B, Lab A ↛ B, phlebotomist/delivery/pathologist scoping — covered in `rls.tenancy.e2e.spec.ts` and phase e2e specs.

---

## 9. PHI / clinical data hygiene

Code search for `JSON.stringify` + clinical/report patterns: **no production log leaks found** in lab modules; e2e tests explicitly assert absence of internal notes/pathology in customer and rider payloads.

| Surface | Minimum-necessary | Status |
|---------|-------------------|--------|
| Customer | Own report results | **PASS** |
| Lab staff | Operational + result entry | **PASS** |
| Pathologist | Worklist + verify/sign | **PASS** |
| Phlebotomist | Min-PII collection card | **PASS** |
| Delivery rider | Parcel metadata only | **PASS** |
| Admin | Metadata-only for physical reports | **PASS** |
| Notifications | No clinical findings in templates | **PASS** — `notification-dispatch.service.ts` titles only |

No public report/document URLs found on inspected paths.

---

## 10. Immutability / audit

| Item | Status |
|------|--------|
| Sealed digital report versions reconstructable | **PASS** (version rows + artifacts) |
| Amendments create new versions; old preserved | **PASS** (service) |
| CoC append-only | **PASS** |
| Physical report lifecycle auditable | **PASS** — security events + status history |
| Server-authoritative transitions | **PASS** |
| Duplicate actions safely handled | **PASS** — idempotency on pay/physical request |
| Actor/timestamp server-derived | **PASS** |
| DB enforcement on PUBLISHED rows | **FAIL** — **B-IM-01** / Book 147 **F-IM-01** |

---

## 11. UI completeness (R7-required screens)

Legend: **PASS** = real route, navigation, API, states; **PARTIAL** = functional gaps in error/edge states; **N/A** = not required this wave.

| Surface | R7 screens | Status |
|---------|------------|--------|
| web-customer | Lab catalog, booking, collection progress, digital report, physical report | **PASS** |
| customer RN (`apps/mobile`) | Lab catalog, booking detail, collection, report, physical | **PARTIAL** — missing Book 148 B-03 parity on mobile report errors |
| web-lab | Catalog, bookings, collections, transport, accession, processing, pathology, physical | **PASS** |
| mobile-phlebotomist | Job list, collection handover | **PASS** (no jest project) |
| mobile-delivery | SAMPLE_TRANSPORT + REPORT_DELIVERY | **PASS** (no jest project) |
| web-pathologist | Worklist, verify, sign | **PASS** |
| web-admin | Lab partner ops, physical report metadata | **PASS** |

Placeholder/deferred: web-lab **incidents** tab remains deferred EmptyState (acceptable per R7-A audit). Generic `LoadingState` spinner remains platform-wide (Book 121/139 observation).

**web-lab / web-pathologist:** No top-level `jest.config.cts` in app folder (shell package configs only) — web UI tested via typecheck + build, not dedicated jest suites.

---

## 12. Mobile architecture

| Check | Status |
|-------|--------|
| Customer healthcare on shared RN (`apps/mobile`) | **PASS** |
| Android/iOS shared kernel | **PASS** — single Expo app |
| No duplicate native healthcare kernels | **PASS** |
| mobile-phlebotomist / mobile-delivery boundaries | **PASS** — separate apps, job-type scoped |
| Platform parity for R7-F error UX | **PARTIAL** — see §6–7 |

---

## 13. Notifications / events

R7 events present in `security-events.service.ts` and `notification-dispatch.service.ts`:

- `LAB_REPORT_PUBLISHED`
- `PHYSICAL_REPORT_REQUESTED` / `ACCEPTED` / `PREPARING` / `PACKED` / `DISPATCHED` / `DELIVERED` / `FAILED` / `CANCELLED`
- Collection/transport events via logistics + CoC (phase specs)

Notification bodies: title/category only — **no clinical findings**. Idempotency on financial and booking actions where required.

---

## 14. Finance boundary

| Item | Status |
|------|--------|
| Live PSP | **OFF** |
| Real money / bank payouts | **OFF** |
| Real carrier billing | **OFF** |
| Live vendor payouts | **OFF** |
| `LAB_PAYABLE` / `REPORT_DELIVERY_FEE` | **SANDBOX** facts only |
| Clinical report availability vs payment | **DECOUPLED** — digital report after publish, not pay-gated |

---

## 15. Legal / human gates (unresolved)

Engineering completion ≠ legal approval. **Do not invent legal conclusions.**

| Gate | Status |
|------|--------|
| Country pack diagnostic marketplace rules | **OPEN** — human/legal |
| Home collection regulatory requirements | **OPEN** |
| Official e-report / digital signature law | **OPEN** |
| Physical report delivery (courier + health document) | **OPEN** |
| Production healthcare authorization | **NOT GRANTED** |
| MoR / PSP / payout KYC (R14) | **OPEN** |
| OD-RAD-01/02 (radiology — R8) | **OPEN** |
| OD-CARE-01/02 (care navigation) | **OPEN** |
| OD-CMS-01 / OD-SUP-01 | **OPEN** |
| OD-RX-REFILL | **OPEN** — auto-refill remains OFF |

---

## 16. Migrations

| Metric | Value |
|--------|-------|
| Total migrations in repo | **56** |
| Pending on `worldpharma` @ `127.0.0.1:55432` | **0** |
| R7-specific migrations | **10** (r7a catalog kind + r7b–r7f chain) |
| Destructive accidental migrations | **None found** |
| R7 ordering | **Correct** — chronological `20260827*` / `20260828*` |

R7 migrations add FORCE RLS + tenant policies without `USING (true)`.

---

## 17. Regression — exact results (this audit)

### API full suite — 3 consecutive isolated runs (`--runInBand`, `worldpharma_test`)

| Run | Suites | Tests |
|-----|--------|-------|
| 1 | **68/68** | **161/161** |
| 2 | **68/68** | **161/161** |
| 3 | **68/68** | **161/161** |

### `inventory.e2e.spec.ts` — 3 consecutive isolated runs

| Run | Result | Detail |
|-----|--------|--------|
| 1 | **FAIL** | Concurrent reservation race: expected `[201, 409]`, received `[201, 500]` at line 269 |
| 2 | **PASS** | 1/1 |
| 3 | **PASS** | 1/1 |

### Focused suites (single run each, this audit)

| Suite | Result |
|-------|--------|
| R7-A–F + RLS (`r7a`…`r7f`, `rls.tenancy`) | **7/7 suites · 17/17** |
| R3 + R6 (`r3.isolation`, `r6a`–`r6f`) | **7/7 suites · 19/19** |
| `company-authority.e2e.spec.ts` ×5 isolated | **5/5 PASS** |
| `rls.tenancy.e2e.spec.ts` | **PASS** |
| Typecheck (workspace) | **PASS** (8 projects) |
| Web builds (customer, lab, pathologist, admin) | **PASS** |
| `apps/mobile` jest | **2/2 suites · 4/4** |
| `apps/web-customer` jest | **8/8** |

**Note:** `nx run api:test` parallel orchestration previously flagged flaky specs (`company-authority`, `logistics`) under full parallel load. Isolated `--runInBand` runs green for company-authority this session.

---

## 18. `company-authority.e2e.spec.ts` investigation (Book 150)

| Question | Finding |
|----------|---------|
| Deterministic production defect? | **No** — passes 5/5 isolated; service correctly validates `countryCode` via `PolicyResolver.resolvePublished` |
| Test isolation issue? | **Yes (primary)** — failure mode in Book 150 (`Country has no published policy pack` for `XX`) occurs when shared test DB lacks published pack for `XX` after other suites mutate policy state or run out of order |
| Infrastructure issue? | **Possible contributor** — shared `worldpharma_test` without per-suite pack reset |
| Unrelated pre-existing? | **Partially** — predates R7-F; surfaced under parallel suite load |

**Classification: #2 test isolation issue** (with possible #3 infrastructure contribution). **Not** a deterministic R7 production defect. **Not modified** in this CR.

---

## 19. Global scorecard

| Domain | Status |
| ------ | ------ |
| R7-A | **PASS** |
| R7-B | **PASS** |
| R7-C | **PASS** |
| R7-D | **PASS** |
| R7-E | **PARTIAL** (amend e2e gap; DB immutability) |
| R7-F | **PARTIAL** (mobile error-state parity) |
| RLS | **PARTIAL** (R7 tables strong; legacy `USING(true)` debt) |
| PHI | **PASS** |
| SoD | **PASS** |
| Immutability | **PARTIAL** (service-only on PUBLISHED) |
| UI completeness | **PARTIAL** (mobile report errors; no web-lab jest) |
| Mobile parity | **PARTIAL** |
| Finance boundary | **PASS** |
| Legal gates | **OPEN** (human) |
| Regression | **PARTIAL** (inventory 1/3 fail; parallel flake history) |
| Migrations | **PASS** |

---

## 20. Overall ecosystem position (Book 121/139 methodology)

Pillar scoring 0–10, same weights as Book 139:

| Pillar | Weight | Score /10 | Rationale |
|--------|--------|-----------|-----------|
| Backend/domain | 20% | **8.5** | R0–R7 domains present; R8–R14 absent |
| Web UI | 15% | **7.5** | +web-lab, web-pathologist; not all webs have jest |
| Mobile UI | 10% | **5.5** | +phlebotomist/delivery R7; RN error parity gaps |
| Security/tenancy | 15% | **8.0** | R7 FORCE RLS; legacy USING(true) on early tables |
| Healthcare | 10% | **8.0** | R4–R5 sandbox + **R7 lab sandbox complete** |
| Commerce | 10% | **7.0** | Sandbox commerce + vendor marketplace |
| Finance | 5% | **6.5** | Ledger + lab sandbox facts; live payout OFF |
| MNC/governance | 5% | **8.0** | Packs fail-closed |
| Support/CMS/CRM | 5% | **2.5** | Support foundation only |
| Production readiness | 5% | **1.0** | Explicitly not production |

**Weighted total ≈ 70%** toward full R0–R16 roadmap (up from **≈62%** at Book 139).  
**R0–R7 authorized engineering slices ≈ 92%** complete (sandbox/functional); R4 telemedicine and R5-F remain partial; live money excluded by design.

| Wave | Status |
|------|--------|
| R0–R3 | **DONE** (sandbox/partner ops) |
| R4 | **SANDBOX** telemedicine — not production |
| R5 | **A–E DONE**; R5-F not started; auto-refill OFF |
| R6 | **COMPLETE** (vendor marketplace A–F) |
| R7 | **COMPLETE (A–F)** — sandbox diagnostics chain; audit blockers above |
| R8 | **NOT STARTED** |
| Production readiness | **NOT PRODUCTION-READY** |
| Live money | **OFF** |
| Production healthcare | **OFF** |

---

## 21. Blockers (why not `R7_GLOBAL_GREEN_R8_READY_FOR_PLANNING`)

| ID | Severity | Description |
|----|----------|-------------|
| B-UI-01 | P1 | Customer RN `LabBookingDetailScreen` lacks differentiated `reportError` states (Book 148 B-03 web parity) |
| B-IM-01 | P1 | Published `lab_report_versions` immutability service-only (Book 147 F-IM-01) |
| B-RLS-01 | P2 | Legacy pre-R7 tables retain `USING (true)` policies |
| B-TEST-01 | P2 | `inventory.e2e.spec.ts` intermittent failure (1/3 this audit) |
| B-TEST-02 | P2 | Full parallel API suite flake history (`company-authority`, `logistics`) |
| B-E2E-01 | P2 | Report amendment path not in r7e e2e |
| B-UI-02 | P3 | web-lab/pathologist lack dedicated jest projects; stale dashboard copy |

**R8 planning** may proceed only via separate human **CR-R8-AUTH** authorization. **R8 coding is NOT authorized by this audit.**

---

## 22. Explicit non-starts

- **R8 NOT STARTED.** Radiology / imaging absent.
- **R9+ NOT STARTED.**
- **Live PSP OFF.** **Real money OFF.** **Real carriers OFF.**
- **Production healthcare OFF.** **Live e-Rx OFF.** **Automatic refill OFF.**
- **Production LiveKit OFF.** **Recording OFF.**
- **LIS/HIS OFF.**

---

## Final declaration

**FINAL VERDICT: R7_GLOBAL_WITH_BLOCKERS**

R7 engineering wave A–F is **functionally complete in sandbox** with green isolated API regression (3/3). Global audit **with blockers** due to mobile UI parity, immutability depth, legacy RLS debt, and intermittent inventory regression. **Stop here** — no R8 implementation from this CR.
