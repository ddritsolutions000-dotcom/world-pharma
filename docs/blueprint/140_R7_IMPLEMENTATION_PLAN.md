# 140 — R7 Laboratory diagnostics implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R7-AUTH-140**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R7_PLAN_READY** (plan); **R7-A IMPLEMENTED** per [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md); **R7-B IMPLEMENTED** per [143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md); **R7-C IMPLEMENTED** per [144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md); **R7-D IMPLEMENTED** per [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md); **R7-E IMPLEMENTED** per [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md); blockers closed per [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md); **R7-F IMPLEMENTED** per [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md) (**R7_F_IMPLEMENTED**). **R7 COMPLETE (A–F).** R8+ NOT STARTED.

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) · [09](09_LAB_PLATFORM.md) · [10](10_PHLEBOTOMIST_PLATFORM.md) · [68](68_LAB_ECOSYSTEM.md) · [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) · [70](70_PATHOLOGY_REPORTING.md) · [11](11_LOGISTICS_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · [35](35_OPEN_DECISIONS.md) · [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md) · `apps/api/src/identity/app-topology.ts` · `packages/shared/src/policy.ts`

**Prerequisite:** Post-R6 ecosystem = **ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING** ([139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md)). This CR authorizes **planning only**. It does **not** authorize R7 coding.

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, or new database tables under this CR. **Do not** start R8+. **Do not** enable live PSP/carriers/payouts, production LiveKit, recording, live e-Rx, or automatic refill. **Do not** invent diagnostic marketplace / home-collection / e-report / pathologist e-signature law.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R7 Laboratory diagnostics** wave so future **CR-R7-*-IMPL** work can deliver Book 93 acceptance:

> **book → collect → CoC → published report in health timeline (sandbox pay)**

…without duplicating identity, partner, catalog, inventory, order, payment, logistics, finance, support, notification, clinical, audit, or tenant/RLS kernels.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R7 IMPL authorization | Requires future **CR-R7-*-IMPL-*** |
| Creating missing apps now | Topology apps are planned slots; create only under IMPL CRs |
| Radiology / imaging | **R8** |
| Full Health Record / consent UX product | **R9** (R7 publishes lab artifacts into a minimal pointer/timeline foundation only) |
| Care navigation / CMS / CRM / Marketing | **R10–R12** |
| Live money / carriers / payouts | **R14** + legal |
| Second identity / payment / notification / support / logistics engine | Kernel lock |
| Hospital LIS/HIS replacement | Explicitly out ([09](09_LAB_PLATFORM.md)) |

### Acceptance of this plan

Humans can authorize coding CRs that implement R7 sub-phases in §12 **without** redesigning R0–R6 kernels. Legal ODs remain **human gates** for country enablement and production traffic — they do **not** block writing this plan.

---

## 1. Exact R7 scope (canonical)

### 1.1 IN SCOPE (Book 93 + Lab platform books)

| Area | Deliverable |
|------|-------------|
| Lab catalog | Platform `TestDefinition` / lab offers / packages; country + pack gated |
| Booking | Home-collection-first diagnostic booking; sandbox payment |
| Sample collection | Phlebotomist assignment; identity verify; barcode; seal |
| Chain of custody | Append-only CoC events; sample state machine ([69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md)) |
| Lab processing | Accession, LIMS-lite processing on Lab web (+ optional lab staff mobile) |
| Pathology | Pathologist worklist, verify/sign under SoD, digital report publish |
| Reports | Digital report artifact for customer; optional physical `REPORT_DELIVERY` job |
| Logistics job types | Activate contracts: `SAMPLE_COLLECTION`, `SAMPLE_TRANSPORT`, `REPORT_DELIVERY` (still **mock carrier**) |
| Apps (new + extend) | Lab web, Lab staff mobile, Phlebotomist mobile, Pathologist web; Customer lab+reports; Delivery job extensions; Admin KYC/incidents; Ops shell as needed |
| Domains | Laboratory, Sample/CoC, Pathology, Reports (lab), Phlebotomist; reuse Logistics + Payment + Partner + Consent |

**Book 93 accept line:** book → collect → CoC → published report in health timeline (**sandbox pay**).

### 1.2 OUT OF SCOPE

| Item | Owner wave |
|------|------------|
| Radiology / imaging / radiologist app | **R8** |
| Full patient health timeline UX / caregiver proxy | **R9** |
| Care navigation / triage / matching | **R10** |
| CMS / Help Center product | **R11** |
| CRM / Marketing / Analytics warehouse | **R12+** |
| Live PSP, real payouts, live DHL/carriers, real COD settlement | **R14** |
| Production LiveKit / recording | R4 production auth (separate) |
| Live e-Rx / automatic refill | R5 pack + legal (remain OFF) |
| Vendor marketplace changes | R6 complete — touch only if lab seller patterns require shared catalog reuse (no vendor fork) |
| Full hospital LIS/HIS | Forever out |
| Affiliate product | Separate |
| Invented accreditation marks / medical claim copy | Legal + CMS later |

### 1.3 DEPENDENCIES

| Dependency | Classification (repo) | Notes |
|------------|----------------------|-------|
| R0 identity / audiences / memberships | **READY** | Extend audiences/roles; no second identity |
| R0 partner / Join / KYC | **READY** | Partner types `LAB`, `PHLEBOTOMIST`, `PATHOLOGIST` exist in policy catalog |
| R0 policy packs | **READY** | Service keys `lab_home`, `lab_center`, `physical_report_delivery` exist; empty pack **fail-closed false** |
| R0 consent hooks | **READY** | Generic `ConsentGrant`; lab purposes are plan items |
| R1 payment sandbox | **READY** | Mock PSP only |
| R1 logistics / delivery job engine | **PARTIAL** | Enum has sample/report types; runtime = `MEDICINE_DELIVERY` only |
| R1 finance / ledger patterns | **PARTIAL** | Reuse unearned → AP pattern per OD-LAB-02 / OD-LED-01 (**human** for live AP) |
| R2 appointments | **PARTIAL** | Doctor-centric; lab booking is a **new** diagnostic booking aggregate (do not overload doctor appointment as SoT) |
| R3 delivery mobile | **PARTIAL** | Extend for sample/report jobs under IMPL |
| R3/R6 admin partner oversight | **READY** | Extend for LAB partner review |
| Catalog item kinds | **PARTIAL** | No `LAB_TEST` (or equivalent) yet — **additive** under IMPL |
| Health record / report artifacts | **MISSING** | Minimal lab report artifact store required in R7; full EHR UX = R9 |
| Lab / CoC / Pathology modules | **MISSING** | Planned bounded context |
| Lab / Pathologist / Phlebotomist apps | **MISSING** | Topology PLANNED; `currentPath: null` |
| Dedicated Logistics/Ops web (APP-OPS-W) | **MISSING** | May start with admin logistics shell; dedicated app **DEFERRED** if not required for accept |

### 1.4 DEFERRED (within or after R7)

| Item | Note |
|------|------|
| Center walk-in as primary UX | OD-LAB-01 — home-first; center optional pack |
| Split package across labs | OD-LAB-15 — v1 **no** |
| COD for diagnostics | OD-LAB-16 — **no** until decided |
| Automated delta checks | OD-LAB-18 — off until pack |
| FHIR export | OD-EHR-04 — later |
| Full APP-OPS-W | Prefer admin shell until volume requires dedicated ops web |
| Production pathologist e-sign legal recognition | OD-LAB-08 — pack after legal |
| Live lab marketplace traffic | Country pack + legal + sandbox money proven |

### 1.5 LEGAL / HUMAN GATES (do not invent)

See §13. Engineering may implement **sandbox, pack-gated, fail-closed** diagnostics; **country enablement** and **official result** claims require legal.

---

## 2. Current-state dependency audit

| Dependency | Status | Evidence |
|------------|--------|----------|
| Post-R6 green / R6 complete | **READY** | [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) |
| Identity / JWT / RLS / NOBYPASSRLS | **READY** | API + DB attestation in Book 139 |
| Partner engine + Join | **READY** | `apps/web-join`, partner module |
| Policy `lab_*` service keys | **READY** | `packages/shared/src/policy.ts`; defaults false |
| `OrganizationKind.LAB` / `LocationKind.LAB` | **PARTIAL** | Enum scaffold; no lab ops |
| Consent | **READY** | Clinical consent module |
| Payment sandbox | **READY** | Mock adapter |
| Logistics job enum | **PARTIAL** | SAMPLE_* / REPORT_DELIVERY contracts only |
| Delivery medicine jobs | **READY** | `MEDICINE_DELIVERY` |
| Appointment (doctor) | **PARTIAL** | Not lab booking SoT |
| Catalog LAB_TEST kind | **MISSING** | Additive required |
| Lab domain module + Prisma models | **MISSING** | No `apps/api/src/lab` |
| Health timeline / LAB_REPORT artifact | **MISSING** | |
| `apps/web-lab` | **MISSING** | |
| `apps/mobile-lab` | **MISSING** | |
| `apps/mobile-phlebotomist` | **MISSING** | |
| `apps/web-pathologist` | **MISSING** | |
| `apps/web-logistics` | **MISSING** | DEFERRED ok |
| Radiology | **NOT APPLICABLE** | R8 |
| Live PSP / carriers / payouts | **BLOCKED** (correctly) | Remain OFF |
| Legal OD-LAB / OD-EHR | **BLOCKED** for production claims | Does not block sandbox plan |

**No blockers prevent planning.** Domain/app absences are **expected** and filled by future IMPL CRs — not by this CR.

---

## 3. Application impact

**Do not create apps in this CR.** Future IMPL CRs create folders when authorized.

### 3.1 Existing apps affected

| App | Existing | Required future (R7) | Existing APIs | Future APIs | Reuse |
|-----|----------|----------------------|---------------|-------------|-------|
| `web-customer` | Commerce, Rx, account | Lab catalog browse, book, track, digital report, optional hard-copy request | Catalog/cart/pay/order | Lab catalog/booking/report presenters | Shell, ui-kit states, OTP session |
| `mobile` (customer) | Expo foundation | Same journeys (mobile-first home collection) | Same | Same | RN ui-kit, auth |
| `web-admin` | Partners, finance, clinical admin | Lab partner KYC review, incident/refund hooks, pack enablement visibility | Partner/admin | Lab admin oversight (minimum) | Admin shell |
| `web-join` | Partner applicant | LAB / PHLEBOTOMIST / PATHOLOGIST join paths (pack-gated) | Partner apply | Credential fields for lab types | Join flows |
| `mobile-delivery` | Medicine jobs | SAMPLE_TRANSPORT / REPORT_DELIVERY assigned jobs (no PDF to rider) | Delivery medicine | Job-type filters + CoC handover scans | Delivery shell |
| `web-doctor` | Clinical | Optional report view **only** via consent + relationship (minimum; full = R9) | Consent | Report read if authorized | Do not dump lab into doctor by default |
| `web-vendor` / store | Marketplace / pharmacy | **No R7 ownership** | — | — | Isolation preserved |

### 3.2 New apps (planned slots — create under IMPL only)

| Topology | Path (planned) | Required screens (summary) |
|----------|----------------|----------------------------|
| APP-LAB-W | `apps/web-lab` | Catalog/offers, bookings, accession, processing queue, QC flags, incidents |
| APP-LAB-M | `apps/mobile-lab` | Scan/accession, bench status, handover (floor) |
| APP-PHE-M | `apps/mobile-phlebotomist` | Offers, navigate, verify, collect, barcode, seal, handover, earnings (sandbox) |
| APP-PATH-W | `apps/web-pathologist` | Assigned worklist, case, result review, sign/publish (SoD) |
| APP-OPS-W | `apps/web-logistics` | **DEFERRED** — admin logistics shell may suffice for R7 accept |

---

## 4. Domain / kernel impact

### 4.1 Reuse (mandatory — no duplicates)

| Kernel | R7 reuse rule |
|--------|---------------|
| Identity | Same Person + memberships; add lab/pathologist/phlebotomist audiences/roles as needed |
| Partner / Join / KYC | Same engine; lab credential types |
| Catalog / pricing | Extend kinds/offers for lab tests — **one** catalog kernel |
| Inventory | Only if consumables for collection kits; do **not** invent second stock system |
| Order | Do **not** fork commerce order for lab; diagnostic **booking** is the commercial spine (align Book 09 `LabBooking` / `DiagnosticCase`) |
| Payment | Same PaymentPort / mock PSP |
| Logistics | Same `LogisticsJob` engine; activate sample/report types |
| Finance | Same ledger patterns; sandbox payouts; OD-LAB-02 accounting **as pack/legal allow** |
| Support / notifications | Shared platform kernels; no clinical values in SMS/push |
| Clinical (doctor/Rx) | Separate; pathologist ≠ doctor Rx authority |
| Consent / audit / RLS / tenancy | Same server-built context + FORCE RLS |

### 4.2 New bounded context (planned slot only)

**Laboratory / Diagnostics** — new Nest module + Prisma aggregates under IMPL, owning:

- `DiagnosticCase` (customer-visible spine)  
- `LabBooking` / booking lines  
- `Sample` / containers / barcodes  
- `ChainOfCustodyEvent` (append-only)  
- `Result` / `Report` (versioned)  
- `PhysicalReportRequest`  

**Not** a second payment, identity, or logistics service.

### 4.3 Explicit non-duplication check

| Kernel | Duplicate allowed? |
|--------|-------------------|
| identity / partner / catalog / inventory / order / payment / logistics / finance / support / notification / clinical Rx / audit / tenant-RLS | **NO** |

---

## 5. Security / RLS (plan items only)

### 5.1 Boundaries

| Actor | May | Must not |
|-------|-----|----------|
| Customer | Own bookings/reports | Other patients; lab bench; pathologist queue |
| Lab org staff | Own lab cases/accession | Lab B cases; company finance; unrelated EHR |
| Phlebotomist | Assigned collection jobs; min PII | Full EHR; unrelated patients; report PDF |
| Pathologist | Assigned cases; sign under SoD | Unassigned cases; result-enter if same user forbidden (OD-LAB-17) |
| Delivery rider | Transport/report parcel jobs | Clinical PDF; analyte values |
| Company admin | KYC, incidents, pack config | Act as lab without membership / break-glass rules |
| Doctor | Report only with consent+relationship | Browse lab marketplace as clinical SoT |

### 5.2 Preserve

- Server-built tenant context (headers never authoritative)  
- ENABLE + FORCE RLS; `worldpharma_app` NOSUPERUSER + NOBYPASSRLS  
- MNC / country / org / location hierarchy  
- Company vs partner separation  

### 5.3 Planned RLS work (IMPL only)

- Policies for all new lab/sample/report tables (deny-by-default)  
- Pathologist assignment-scoped SELECT/UPDATE  
- CoC events insert-only for authorized actors; no UPDATE of history  
- Report artifact storage pointers; no public CDN URLs for PHI  
- Negative tests: Lab A ↛ Lab B; Pathologist A ↛ unassigned; Customer A ↛ B; Rider ↛ PDF  

---

## 6. Healthcare / PHI

### 6.1 Minimum necessary

| Surface | Allowed | Forbidden |
|---------|---------|-----------|
| Phlebotomist | Name, address, phone, specimen checklist, prep flags | Unrelated clinical history, prior analytes |
| Delivery | Address, sealed bag id, POD | Report PDF, results |
| Lab staff | Case/sample needed for processing | Unrelated patient chart |
| Pathologist | Assigned case results | Unassigned panels |
| Vendor/support | Correlation ids only | Result values, diagnosis |
| Notifications | “Report ready” generic | Analyte values / panic numbers in SMS (OD-LAB-05) |
| Admin | Incident metadata | Unrestricted clinical browse |

### 6.2 Consent / authorization / audit

- Consent purpose(s) for lab processing + report share (exact strings = IMPL + legal)  
- Clinical authorization: pathologist sign ≠ doctor prescribe  
- Audit: booking, CoC transitions, accession, result enter, verify, publish, break-glass  
- PHI isolation: outbox/events redact clinical fields (reuse envelope patterns)  
- Support: no paste-of-results product; tickets correlate booking id only  

### 6.3 Explicit clinical non-starts

- No autonomous diagnosis  
- No auto-Rx from lab results  
- No silent test substitution  
- No automatic refill  
- No claiming official legal validity of e-reports without pack + legal (OD-LAB-08)  

### 6.4 Legal review dependencies (separate)

Diagnostic marketplace, home collection authority, who may phlebotomize, official e-report status, pathologist electronic signature, advertising of tests, data residency for results (OD-EHR-01/02/08).

---

## 7. UI / frontend plan

### 7.1 Shared UX rules

- Full state set on every primary screen: **loading, empty, error, 401, 403, session-expired, network-failure, success**  
- Unavoidable buffering: **healthcare/medicine-contextual** treatment (not generic unrelated content); **never** fake loading over real errors  
- Responsive web; RN Android **and** iOS for mobile apps (Expo pattern)  
- Reuse `ui-kit` / shell patterns; do not invent a second design system  

### 7.2 Journeys (summary)

| Actor | Journey |
|-------|---------|
| Customer | Search/select test → address/slot → sandbox pay → track collection → digital report → optional hard copy |
| Phlebotomist | Offer → accept → arrive → verify → collect → seal → handover |
| Lab | Receive → accession → process → enter results (SoD) → hand to pathologist |
| Pathologist | Queue → review → sign/publish |
| Delivery | Sample transport / report parcel POD (no PDF) |
| Admin | Partner KYC; pack flags visible; incidents |

### 7.3 Per-app navigation (planned)

| App | Nav focus |
|-----|-----------|
| web-lab | Catalog · Bookings · Accession · Processing · Incidents · Account |
| mobile-lab | Assigned · Scan · Bench · Handover |
| mobile-phlebotomist | Jobs · Active · History · Earnings (sandbox) · Account |
| web-pathologist | Worklist · Case · Published |
| web-customer / mobile | Lab tab or section · Booking detail · Reports |
| mobile-delivery | Jobs filtered by assigned types including sample/report |

### 7.4 Mobile readiness note

Typecheck ≠ store readiness. Each mobile IMPL CR must state Android/iOS smoke expectations; production store release remains separate.

---

## 8. Data / API plan (not implemented here)

### 8.1 Expected entities (logical)

`DiagnosticCase`, `LabBooking`, `BookingLine`, `TestDefinition` / lab offer linkage, `Sample`, `SampleContainer`, `ChainOfCustodyEvent`, `CollectionAssignment`, `Result`, `Report` (+ versions), `PhysicalReportRequest`; reuse `LogisticsJob`, `PaymentIntent`, `Organization`, `ConsentGrant`, `SecurityEvent`.

### 8.2 API surface (illustrative — IMPL ADR finalizes)

| Prefix (planned) | Audience | Examples |
|------------------|----------|----------|
| `/lab/...` or `/diagnostics/...` | lab staff | accession, processing |
| `/pathologist/...` | pathologist | worklist, publish |
| `/phlebotomist/...` | phlebotomist | jobs, CoC transitions |
| `/customer/lab/...` | customer | catalog, book, reports |
| `/delivery/...` | delivery | extend job types |
| `/admin/lab/...` | admin | KYC/incidents oversight |

Prefer additive Nest modules under the **existing** API monolith.

### 8.3 DTO / presenter / events

- Snake_case public DTOs consistent with recent R6 presenters  
- Report payloads never on vendor/support channels  
- Outbox: booking/CoC/report lifecycle **ids + status**, not analyte dumps  
- Idempotency: book/pay/collect/publish keys ([68](68_LAB_ECOSYSTEM.md))  
- Audit events for every privileged clinical transition  

### 8.4 Migrations (plan only)

- Additive tables for diagnostics aggregates + RLS ENABLE/FORCE  
- Possibly `CatalogItemKind` extension for lab tests  
- **No** historical rewrite; **no** duplicate payment/order tables  

---

## 9. Production boundary

| Capability | R7 stance |
|------------|-----------|
| Live PSP | **OFF** — sandbox pay only |
| Real lab/affiliate payouts | **OFF** — ledger sandbox; R14 for live |
| Live carriers / DHL | **OFF** — mock logistics |
| Production LiveKit / recording | **N/A / OFF** — not R7 |
| Live e-Rx | **OFF** |
| Automatic refill | **OFF** |
| Tax/FX production engines | **OFF** unless separately authorized |
| Country packs | **Required** — `lab_home` / `lab_center` / `physical_report_delivery` fail-closed until enabled |
| Official e-report legal claim | **Gated** — OD-LAB-08 + legal |

Anything requiring **R14** or unresolved legal ODs stays gated.

---

## 10. Test / acceptance plan (for future IMPL)

| Layer | Criteria |
|-------|----------|
| Unit | State machines (booking, CoC, report versioning); presenters redact PHI |
| E2E | Happy path: book → pay (sandbox) → collect → transport → accession → process → sign → publish → customer sees report |
| RLS | Lab A ↛ B; pathologist assignment; customer isolation; rider no PDF |
| Tenant | Country/org/location boundaries; headers non-authoritative |
| PHI | No results in notifications/support/outbox bodies |
| UI states | All primary screens: load/empty/error/401/403/session/network/success |
| Web builds | New webs + customer/admin green |
| Mobile | typecheck (+ targeted tests); device smoke as IMPL defines |
| Regression | Full API R0–R6 suites remain green (no retry-to-pass) |

**Book 93 accept:** book → collect → CoC → published report in health timeline (sandbox pay).

---

## 11. File hygiene (this CR)

| Action | Status |
|--------|--------|
| Create `docs/blueprint/140_R7_IMPLEMENTATION_PLAN.md` | **This document** |
| Update `00_MASTER_INDEX.md`, `93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | Companion only |
| Application/source / migrations / temp fix copies | **NONE** |

---

## 12. Implementation order (sub-phases)

Each sub-phase requires its own future **CR-R7-*-IMPL** authorization. **None authorized by this CR.**

### R7-A — Diagnostics foundation + lab partner gate — **IMPLEMENTED** ([141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md))

| | |
|--|--|
| **Scope** | Nest `lab` module; `LAB_TEST`/`LAB_OWNED` catalog enums; pack gate wiring; LAB partner activation role; admin lab acceptance; `apps/web-lab` foundation |
| **Deps** | R0 partner/policy; Book 140 |
| **Apps** | web-lab (**FOUNDATION**), web-admin, web-join (existing) |
| **Kernels** | partner, policy, catalog (extend), identity roles |
| **DB** | Additive enum migration only |
| **API** | Lab org/capabilities/catalog; admin lab eligibility |
| **UI** | Lab shell + admin lab governance |
| **Security** | Lab A ↛ B; pack fail-closed |
| **Tests** | `r7a.lab.e2e` |
| **Legal** | No country marketplace enablement |
| **Human** | OD-LAB-01 home-first recommendation unchanged |
| **Non-starts** | Booking; pathology; live money; radiology; CoC |

### R7-B — Customer lab catalog + booking + sandbox pay — **IMPLEMENTED** ([143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md))

| | |
|--|--|
| **Scope** | Customer browse/book/pay (sandbox); booking state machine through CONFIRMED |
| **Deps** | R7-A; payment sandbox |
| **Apps** | web-customer, mobile (customer) |
| **Kernels** | payment, catalog, consent purpose hooks |
| **DB** | Booking lines; price freeze fields |
| **API** | Customer lab endpoints; idempotent pay/book |
| **UI** | Lab browse, slot, checkout, booking detail + full states |
| **Security** | Customer A ↛ B bookings |
| **Tests** | E2E book+pay sandbox |
| **Legal** | Advertising copy review deferred; no medical claims invented |
| **Human** | OD-LAB-02/03 product defaults for sandbox |
| **Non-starts** | Collection; pathology; live PSP |

### R7-C — Phlebotomist + SAMPLE_COLLECTION + CoC

| | |
|--|--|
| **Scope** | `apps/mobile-phlebotomist`; collection assignment; CoC events through SEALED/HANDED_OVER; min PII |
| **Deps** | R7-B |
| **Apps** | mobile-phlebotomist; admin assignment ops as needed |
| **Kernels** | logistics job type SAMPLE_COLLECTION; diagnostics CoC |
| **DB** | Sample, container, CoC event tables |
| **API** | Phlebotomist job + CoC commands |
| **UI** | Full field journey + offline-tolerant status queue (as blueprint) |
| **Security** | Assigned-only; no EHR dump |
| **Tests** | CoC immutability; isolation |
| **Legal** | Home phlebotomy authority before country enable |
| **Human** | OD-PHE-01 employment model; OD-LAB-13 barcode |
| **Non-starts** | Pathologist; live geo mandatory if pack forbids |

### R7-D — Transport + lab accession / processing

| | |
|--|--|
| **Scope** | SAMPLE_TRANSPORT on delivery (or same-actor leg per OD-PHE-06); `web-lab` (+ `mobile-lab`) accession/processing |
| **Deps** | R7-C |
| **Apps** | web-lab, mobile-lab, mobile-delivery |
| **Kernels** | logistics; diagnostics processing |
| **DB** | Accession/processing status fields |
| **API** | Lab receive/accession/process |
| **UI** | Lab queues; delivery transport jobs |
| **Security** | Lab A ↛ B; rider no results |
| **Tests** | Transport + accession e2e |
| **Legal** | Specimen transport compliance review |
| **Human** | OD-PHE-06 same-person transport |
| **Non-starts** | Report publish; live carrier |

### R7-E — Pathology + digital report artifact

| | |
|--|--|
| **Scope** | `web-pathologist`; SoD enter vs sign; versioned digital report; customer report view; consent-gated doctor read optional |
| **Deps** | R7-D |
| **Apps** | web-pathologist, web-customer, mobile |
| **Kernels** | diagnostics report; minimal health artifact pointer; notifications generic “ready” |
| **DB** | Result/Report tables; artifact pointer |
| **API** | Pathologist publish; customer report GET |
| **UI** | Worklist/case/publish; customer reports |
| **Security** | Assignment RLS; no values in push/SMS |
| **Tests** | Publish e2e; PHI notification tests |
| **Legal** | OD-LAB-08 e-sign; official result claim OFF until legal |
| **Human** | OD-LAB-05/06/17 |
| **Non-starts** | Physical delivery; live payout; radiology |

### R7-F — Physical report (optional) + sandbox finance hooks + acceptance

| | |
|--|--|
| **Scope** | `PhysicalReportRequest` + `REPORT_DELIVERY` (rider never gets PDF); sandbox ledger hooks per OD-LAB-02 recommendation; isolation/pack attestation; Book 93 accept |
| **Deps** | R7-E |
| **Apps** | customer, delivery, admin finance visibility (sandbox) |
| **Kernels** | logistics REPORT_DELIVERY; finance sandbox |
| **DB** | Physical request; delivery linkage |
| **API** | Hard-copy request; delivery POD |
| **UI** | Request hard copy; delivery parcel job |
| **Security** | Final Lab/Pathologist/Customer/Rider matrix green |
| **Tests** | Full happy path + R0–R6 regression |
| **Legal** | Physical report handling; still no live money |
| **Human** | OD-LAB-07 lost copy |
| **Non-starts** | R8 radiology; R9 full EHR; R14 live money; CMS/CRM |

---

## 13. Human / legal decisions (cannot invent)

| ID | Topic | R7 note |
|----|-------|---------|
| OD-LAB-01 | Home vs center first | Plan assumes home-first |
| OD-LAB-02 / OD-LED-01 | Bill-on-booking vs accession vs report | Sandbox may follow recommended unearned→AP; **live** AP needs finance+legal |
| OD-LAB-03 | Customer picks lab vs assign | Pack |
| OD-LAB-04 | Multi-sample rollup | Product |
| OD-LAB-05 | Panic-value channels | **No values in SMS** if pack forbids |
| OD-LAB-06 | Amendment visibility | Pack |
| OD-LAB-07 | Lost hard copy | Pack |
| OD-LAB-08 | Pathologist e-signature legal mechanism | **Legal** |
| OD-LAB-09–20 | Capacity, prep blocks, barcode, temp, COD, SoD, delta, cancel, recollection price | Pack/clinical/finance — do not invent |
| OD-PHE-01 / OD-PHE-06 | Employment model; transport leg | Product/ops |
| OD-EHR-01/02/08 | Controller/processor; cross-border | **Legal** |
| OD-PAY / MoR / PSP | Live money | **R14** — out of R7 |
| Country licensing / accreditation marks | Diagnostic marketplace enablement | **Legal** — packs carry marks; eng does not invent |
| Medical advertising claims | Test catalog copy | **Legal** + later CMS |

---

## 14. Measurable R7 acceptance (future IMPL complete)

| Area | Accept |
|------|--------|
| Flow | Customer books pack-enabled test → sandbox pay → phlebotomist collects → CoC complete → lab processes → pathologist publishes → customer sees digital report |
| Money | Sandbox only; `live_payout` false; no live PSP |
| Carrier | Mock only |
| Security | Isolation matrix green; FORCE RLS; NOBYPASSRLS |
| PHI | Min-necessary; no results in notifications/support |
| UI | States complete; contextual loading rule respected |
| Regression | R0–R6 API suites green |
| Pack | Fail-closed when `lab_home`/`lab_center` disabled |
| Non-claims | No official e-report legal claim without OD-LAB-08; no radiology |

---

## Document control

| Action | Status |
|--------|--------|
| Create Book 140 | **This document** |
| Update master index / roadmap | Companion edits only |
| Production code / migrations | **NONE** |

---

## Final declaration

**FINAL STATUS: R7_PLAN_READY**

**R7 implementation NOT STARTED.**  
**R8+ NOT STARTED.**  
**No migrations.**  
**No application/source code created.**

**STOP.**
