# 149 — R7-F Physical report + sandbox finance implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R7-F-AUTH-149**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R7_F_PLAN_READY**

**Authority:** R7-F planning only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-F implementation NOT STARTED. R8+ NOT STARTED.**

**Prerequisite:** R7-E blockers closed per [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) (**R7_E_BLOCKERS_CLOSED**).

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) · [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) · [70](70_PATHOLOGY_REPORTING.md) · [11](11_LOGISTICS_PLATFORM.md) · [73](73_HEALTHCARE_PAYMENTS_SETTLEMENT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Readiness gate summary

| Gate | Result |
|------|--------|
| R7-A through R7-E implemented | **PASS** — Books 141–146 |
| Book 148 blocker fixes present in repo | **PASS** — verified |
| R7-B catalog detail by slug | **PASS** — `catalogDetail` exact slug query |
| web-lab real result-entry form | **PASS** — `lab-pathology-panel.tsx` |
| customer report error differentiation | **PASS** — `reportError` states in `lab-bookings-page.tsx` |
| RLS/PHI/SoD kernels intact | **PASS** — no regressions in R7-E e2e |
| API regression (isolated, 3 runs) | **PASS** — **66/66** · **157/157** × 3 |
| Pending migrations | **PASS** — 53 applied, 0 pending |
| R7-F engineering blockers | **NONE** |
| Test determinism debt | **NON-BLOCKING** — see §2 |

---

## 1. Current state verification (repository truth)

### 1.1 R7 sub-phases

| Phase | Book | Status | Key artifacts |
|-------|------|--------|---------------|
| R7-A | 141 | **IMPLEMENTED** | `LabModule`, `web-lab`, pack gates, `LAB_TEST` |
| R7-B | 143 | **IMPLEMENTED** | customer catalog/book/pay, `r7b.lab-booking.e2e.spec.ts` |
| R7-C | 144 | **IMPLEMENTED** | phlebotomist CoC, `r7c.sample-collection.e2e.spec.ts` |
| R7-D | 145 | **IMPLEMENTED** | transport/accession/processing, `r7d.*.e2e.spec.ts` |
| R7-E | 146 | **IMPLEMENTED** | pathology + digital report, `r7e.pathology-digital-report.e2e.spec.ts` |
| R7-F | — | **NOT STARTED** | no `PhysicalReportRequest`, no `REPORT_DELIVERY` product flow |

### 1.2 Book 148 fixes (verified in source)

| Fix | Evidence |
|-----|----------|
| B-01 catalog detail | `lab-booking.service.ts` — `catalogBrowseWhere`, `formatCatalogItems`, slug-filtered `catalogDetail` |
| B-02 result entry | `lab-pathology-panel.tsx` — form fields, `validateEntry`, `submitEntry`, no hardcoded values |
| B-03 report errors | `lab-bookings-page.tsx` — `reportError`: forbidden / unavailable / network / generic |

### 1.3 R7-F absent (expected)

- No `PhysicalReportRequest` table or service
- No customer hard-copy request UI (web/mobile grep: no physical/print flows)
- `REPORT_DELIVERY` exists only as `LogisticsJobType` enum + contract note in `logistics.service.ts`
- `DeliveryService` implements `SAMPLE_TRANSPORT` only; no `REPORT_DELIVERY` branch yet

---

## 2. Regression determinism

### 2.1 API suite — three consecutive isolated runs (28 Aug 2026)

| Run | Suites | Tests |
|-----|--------|-------|
| 1 | **66/66 PASS** | **157/157 PASS** |
| 2 | **66/66 PASS** | **157/157 PASS** |
| 3 | **66/66 PASS** | **157/157 PASS** |

### 2.2 `inventory.e2e.spec.ts` — three isolated runs

| Run | Result |
|-----|--------|
| 1 | **1/1 PASS** |
| 2 | **1/1 PASS** |
| 3 | **1/1 PASS** |

### 2.3 Full workspace parallel run

When `nx run-many -t test` runs all 11 projects concurrently, **intermittent** API failures have been observed historically (`inventory.e2e.spec.ts`, 1–8 tests). On this audit date, isolated API runs were **deterministic 3/3 green**; one parallel workspace run showed **65/66** suites (**156/157** tests).

**Classification:** **Non-blocking infrastructure/test determinism debt** — not an R7-F plan blocker. Recommend serializing API e2e or strengthening `applyTestIsolation` in a future hygiene CR before R7-F IMPL sign-off, but does not block authoring the R7-F plan.

### 2.4 Other gates

| Gate | Result |
|------|--------|
| Typecheck | **21/21 PASS** |
| R7-A–E focused | **7/7** suites · **28/28** tests PASS |
| RLS | `rls.tenancy.e2e.spec.ts` PASS |
| R3 | `r3.isolation.e2e.spec.ts` PASS |
| Migrations | 53 applied, 0 pending |

---

## 3. R7-F scope (Book 140 only)

### 3.1 In scope

| Area | Deliverable |
|------|-------------|
| Physical report | `PhysicalReportRequest` linked to **published** `LabReportVersion` |
| Logistics | `REPORT_DELIVERY` job lifecycle (mock carrier) — rider **never** gets PDF |
| Customer UX | Optional hard-copy request + delivery tracking (no diagnostic content in transit UI) |
| Lab UX | Prepare/pack/dispatch queue for physical copies |
| Delivery UX | `mobile-delivery` branch for `REPORT_DELIVERY` (sealed parcel, OTP/POD) |
| Sandbox finance | Ledger hooks per OD-LAB-02 **sandbox only** — `LAB_PAYABLE`, optional `REPORT_DELIVERY_FEE` facts |
| Governance | Admin metadata + pack gate `physical_report_delivery` |
| Acceptance | Full R7 happy path + R0–R6 regression green + R7 attestation |

### 3.2 Explicit non-starts

Physical report delivery is **optional** per pack. Still **OFF**:

- Live PSP / real money / live payout
- Real carriers / DHL
- LIS/HIS / radiology / EHR / CMS/CRM
- Production healthcare enablement
- Live e-Rx / automatic refill
- Production LiveKit / recording
- R8+ features
- Rider clinical PDF access
- Mutating finalized digital report facts

---

## 4. Physical report lifecycle

### 4.1 Principles

- Digital report/version model from R7-E remains **immutable** after `PUBLISHED`
- Physical request references `lab_report_id` + `lab_report_version_id` (must be `PUBLISHED`)
- Physical workflow tracks **parcel metadata only** — not clinical re-interpretation
- Lab print/pack is operational fact; no new clinical values

### 4.2 `PhysicalReportRequest` state machine (planned)

```
REQUESTED → ACCEPTED → PREPARING → PACKED → DISPATCHED → DELIVERED
                ↓           ↓          ↓          ↓
            CANCELLED   CANCELLED  CANCELLED   FAILED → (RETURNED | CANCELLED)
```

| State | Actor | Meaning |
|-------|-------|---------|
| `REQUESTED` | Customer | Hard-copy requested (pack + published report required) |
| `ACCEPTED` | Lab/system | Lab acknowledged; may charge sandbox print fee separately |
| `PREPARING` | Lab staff | Print in progress (operational; no clinical edit) |
| `PACKED` | Lab staff | Sealed package id assigned; ready for logistics |
| `DISPATCHED` | Lab/system | `REPORT_DELIVERY` `LogisticsJob` created |
| `DELIVERED` | System | Job terminal `DELIVERED` + POD |
| `FAILED` | Lab/ops/delivery | Delivery failed; digital report unchanged |
| `CANCELLED` | Customer/lab/ops | Before dispatch or per pack rules |

Illegal transitions rejected server-side. No client status mutation.

### 4.3 Audit events (planned)

`PHYSICAL_REPORT_REQUESTED` · `PHYSICAL_REPORT_ACCEPTED` · `PHYSICAL_REPORT_PACKED` · `PHYSICAL_REPORT_DISPATCHED` · `PHYSICAL_REPORT_DELIVERED` · `PHYSICAL_REPORT_FAILED` · `PHYSICAL_REPORT_CANCELLED`

Metadata: ids + status only — **no report body**.

---

## 5. Delivery (reuse logistics kernel)

### 5.1 Existing infrastructure to extend

| Kernel | Location | R7-F use |
|--------|----------|----------|
| `LogisticsJob` | `schema.prisma`, `logistics.service.ts` | `jobType: REPORT_DELIVERY` |
| `DeliveryService` | `apps/api/src/delivery/` | Mirror `SAMPLE_TRANSPORT` branch pattern |
| `mobile-delivery` | `apps/mobile-delivery/` | Job list/detail; **no PDF** |
| Mock carrier | Phase 1F | Sandbox transport only |

### 5.2 Job model (Book 11)

- Pickup: lab location
- Dropoff: customer address from booking / request
- Rider sees: addressee, masked contact, package/sealed id, handling flags
- Rider **never** sees: report PDF, analyte values, pathology notes
- POD: OTP verification (reuse medicine delivery POD path where applicable)
- CoC: operational handoff events on job; **not** sample CoC extension

### 5.3 Permissions

| Actor | Allowed |
|-------|---------|
| Customer | Request (own booking), track status |
| Lab staff | Accept/prepare/pack/dispatch for own org |
| Delivery partner | Accept/pickup/deliver assigned `REPORT_DELIVERY` jobs |
| Rider A | ↛ Rider B jobs |
| Admin | Assign job, governance metadata — **no** clinical edit |

---

## 6. Sandbox finance hooks

### 6.1 Reuse (no new payment kernel)

- `PaymentIntent` / sandbox pay (R7-B) for booking — **already captured**
- Optional **sandbox print/delivery fee** line — separate `PaymentIntent` or booking line extension (IMPL decision)
- Ledger: existing 1G journal — new **sandbox** fact kinds only:
  - `LAB_PAYABLE` (on publish or accession per OD-LAB-02 recommendation — **sandbox posting only**)
  - `REPORT_DELIVERY_FEE` (if print/delivery fee charged)

### 6.2 Decoupling rules

- Digital report customer access **must not** depend on physical request payment state
- Physical request eligibility: `PUBLISHED` report + pack `physical_report_delivery` + lab acceptance
- `live_payout: false` remains on lab capability
- No live PSP, no bank payout, no carrier billing

### 6.3 Admin visibility

Extend existing `web-admin` finance surfaces with **sandbox** lab payable / delivery fee metadata — read-only, no clinical content.

---

## 7. Apps / UI inventory (planned — not implemented)

### 7.1 Customer web (`apps/web-customer`)

| Screen | Route | API | States |
|--------|-------|-----|--------|
| Booking detail — request hard copy | `/lab/bookings/[id]` | `POST .../physical-report` | loading, empty (not eligible), 401, 403, session, network, validation, success |
| Physical delivery status | same | `GET .../physical-report/status` | tracking states; no diagnostic content |
| Digital report (R7-E) | same | existing report APIs | unchanged |

### 7.2 Customer mobile (`apps/mobile` — shared RN)

| Screen | API | States |
|--------|-----|--------|
| `LabBookingDetailScreen` — request hard copy | `POST .../physical-report` | same as web via `FeatureStates` |
| Physical delivery tracking | `GET .../physical-report/status` | loading, forbidden, unavailable, network, success |

**No** separate mobile kernel.

### 7.3 web-lab (`apps/web-lab`)

| Screen | Tab | API | States |
|--------|-----|-----|--------|
| Physical report queue | new tab `Physical` | `GET /lab/physical-reports` | loading, empty, error, 401, 403, session, network |
| Request detail | inline | `GET /lab/physical-reports/:id` | prepare/pack/dispatch actions |
| Dispatch action | inline | `POST .../dispatch` | creates `REPORT_DELIVERY` job |

### 7.4 mobile-delivery (`apps/mobile-delivery`)

| Screen | API | States |
|--------|-----|--------|
| Jobs list | `GET /delivery/jobs` | includes `REPORT_DELIVERY` filter |
| Job detail | accept/pickup/deliver/POD | branch like `SAMPLE_TRANSPORT`; sealed parcel copy only |

### 7.5 Admin (`apps/web-admin`)

| Surface | API | Notes |
|---------|-----|-------|
| Lab physical-report metadata | `GET /admin/lab/physical-reports` | governance only |
| Sandbox finance visibility | existing finance + lab payable facts | no clinical edit |

### 7.6 Apps **not** created

- No generic Partner App
- No duplicate delivery app
- No rider PDF viewer

---

## 8. Schema / API plan (IMPL only — not created here)

### 8.1 Tables (additive)

| Entity | Purpose |
|--------|---------|
| `physical_report_requests` | Request lifecycle; FK to `lab_reports`, `lab_report_versions`, `lab_bookings`, `lab_org_id`, optional `logistics_job_id` |
| RLS | FORCE RLS; tenant via lab org + customer booking ownership |

### 8.2 API surface (illustrative)

| Method | Path | Audience |
|--------|------|----------|
| POST | `/me/lab/bookings/:id/physical-report` | Customer — request hard copy |
| GET | `/me/lab/bookings/:id/physical-report` | Customer — status |
| GET | `/lab/physical-reports` | Lab staff — queue |
| GET | `/lab/physical-reports/:id` | Lab staff — detail |
| POST | `/lab/physical-reports/:id/accept` | Lab staff |
| POST | `/lab/physical-reports/:id/prepare` | Lab staff |
| POST | `/lab/physical-reports/:id/pack` | Lab staff — sealed package id |
| POST | `/lab/physical-reports/:id/dispatch` | Lab staff — enqueue `REPORT_DELIVERY` |
| POST | `/lab/physical-reports/:id/cancel` | Lab/customer per policy |
| GET | `/admin/lab/physical-reports` | Admin metadata |
| Delivery | existing `/delivery/jobs/*` | Extend for `REPORT_DELIVERY` |

---

## 9. RLS / security requirements

Preserve:

- `worldpharma_app` **NOSUPERUSER** + **NOBYPASSRLS**
- **FORCE RLS** on new tables
- Server-built tenant context
- Pack fail-closed: `physical_report_delivery` service key ([`packages/shared/src/policy.ts`](../../../packages/shared/src/policy.ts))

### 9.1 Isolation tests (R7-F e2e must cover)

- Customer A ↛ Customer B physical request / tracking
- Lab A ↛ Lab B queue
- Delivery A ↛ Delivery B jobs
- Unauthorized physical-report request (no published report)
- Unauthorized dispatch
- Admin ↛ rewrite finalized clinical facts
- No `USING(true)` on new policies

---

## 10. PHI / report security

| Risk | Mitigation |
|------|------------|
| Report in URL | IDs only; no blob keys in paths |
| Report in logs/notifications | Opaque refs; generic inbox copy |
| Public documents | `PrivateObjectStore`; no public URLs |
| Rider PDF | **Forbidden** — sealed parcel metadata only |
| Internal pathology notes | Excluded from customer/delivery surfaces |
| Signed URLs | Server-generated, short-lived, auth-checked if used for lab print station (IMPL) |

Reuse R7-E `PrivateObjectStore` — do not invent storage kernel.

---

## 11. Notifications (reuse kernel)

| Event | Payload |
|-------|---------|
| `PHYSICAL_REPORT_ACCEPTED` | booking id, request id |
| `PHYSICAL_REPORT_DISPATCHED` | request id, job id |
| `PHYSICAL_REPORT_DELIVERED` | request id |
| `PHYSICAL_REPORT_FAILED` | request id, reason code |

**No** diagnostic values. Deep link to authenticated status screen only.

---

## 12. Open decisions

### 12.1 Engineering (resolvable in IMPL ADR)

| ID | Topic |
|----|-------|
| ENG-R7F-01 | Separate sandbox fee `PaymentIntent` vs booking line extension for print/delivery |
| ENG-R7F-02 | Exact `LAB_PAYABLE` trigger point (publish vs accession) in sandbox |
| ENG-R7F-03 | OTP vs signature POD default for `REPORT_DELIVERY` |

### 12.2 Product

| ID | Topic |
|----|-------|
| OD-LAB-04 | Multi-sample rollup for physical copies |
| OD-LAB-06 | Amendment visibility when physical copy in flight |
| OD-LAB-07 | Lost hard copy procedure |
| OD-PHE-06 | Same-person transport restrictions |

### 12.3 Legal (cannot be solved by code)

| ID | Topic |
|----|-------|
| OD-LAB-08 | Pathologist e-sign / official report legal status |
| OD-LAB-02 / OD-LED-01 | Bill-on-booking vs accession vs report (**live** AP = R14) |
| OD-EHR-01/02/08 | Controller/processor; cross-border |
| Country licensing | Diagnostic marketplace marks in packs |

### 12.4 Country-pack

| Key | Gate |
|-----|------|
| `physical_report_delivery` | Fail-closed until pack enables |
| `lab_home` / `lab_center` | Prerequisite for booking (existing) |

---

## 13. R7-F acceptance criteria (future IMPL)

R7-F is complete only when **all** hold:

| Area | Criteria |
|------|----------|
| Flow | Customer with published report → optional hard-copy request → lab pack → `REPORT_DELIVERY` → mock deliver → customer tracking shows delivered |
| APIs | All §8.2 endpoints live with server-side state machine |
| UI | Every §7 screen: real route, API, data, full state set, no fake data, no dead buttons |
| Digital immutability | Published `LabReportVersion` unchanged by physical workflow |
| Finance | Sandbox ledger facts only; `live_payout: false` |
| Security | Isolation matrix green; FORCE RLS; no PHI in notifications |
| Regression | R7-A–F e2e + R0–R6 + RLS + R3 green; **deterministic** API 3/3 |
| Migrations | 0 pending |
| Production boundary | §14 preserved |
| Book 93 | R7 laboratory diagnostics **COMPLETE** attestation |

---

## 14. Production boundary (preserved)

| Capability | Status |
|------------|--------|
| Live PSP | **OFF** |
| Real money | **OFF** |
| Real carriers | **OFF** |
| Production healthcare | **OFF** |
| LIS/HIS | **OFF** |
| Live e-Rx | **OFF** |
| Automatic refill | **OFF** |
| Production LiveKit | **OFF** |
| Recording | **OFF** |
| Live payout | **OFF** |

---

## 15. Recommended IMPL sequencing (future CR-R7-F-IMPL)

1. Schema + `PhysicalReportRequest` + RLS  
2. Customer request/status APIs + pack gate  
3. Lab prepare/pack/dispatch APIs  
4. `REPORT_DELIVERY` logistics + delivery app branch  
5. Customer web + RN tracking  
6. web-lab physical tab  
7. Sandbox finance hooks  
8. Admin metadata  
9. R7-F e2e + full regression + Book 93 R7 acceptance doc  

---

## Final declaration

**FINAL VERDICT: R7_F_PLAN_READY**

R7-A through R7-E are implemented; Book 148 fixes verified; API regression **deterministic 3/3** on isolated runs. No engineering blocker prevents R7-F implementation planning authorization.

**Remaining observation (non-blocking):** intermittent `inventory.e2e.spec.ts` under parallel workspace test runs — infrastructure determinism debt.

**R7-F implementation NOT STARTED.**  
**R8+ NOT STARTED.**  
**No migrations.**  
**No application/source code created.**

**STOP.**
