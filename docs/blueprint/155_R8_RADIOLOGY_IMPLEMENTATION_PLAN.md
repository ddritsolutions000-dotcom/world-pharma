# 155 — R8 Radiology / imaging implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R8-AUTH-155**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R8_PLAN_READY**

**Prerequisite:** R7 closed — **R7_CLOSED_R8_READY_FOR_PLANNING** ([154](154_POST_R7_FINAL_CLOSURE_AUDIT.md)). This CR authorizes **R8 planning only**. It does **not** authorize R8 implementation.

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) · [140](140_R7_IMPLEMENTATION_PLAN.md) · [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) §7 · [35](35_OPEN_DECISIONS.md) · [09](09_LAB_PLATFORM.md) (contrast only — radiology is **not** lab) · [11](11_LOGISTICS_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md) · `apps/api/src/identity/app-topology.ts` · `packages/shared/src/policy.ts` · R7 lab module (`apps/api/src/lab/*`) as **pattern reference only**

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R8-A implementation. **Do not** start R9+. **Do not** enable live PSP/carriers/payouts, production LiveKit, recording, live e-Rx, automatic refill, production healthcare, LIS/HIS, or production PACS.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R8 Radiology / imaging** wave so future **CR-R8-*-IMPL** work can deliver Book 93 acceptance:

> **browse → book modality → sandbox pay → study scheduled → acquisition → interpretation → published imaging report in health timeline (sandbox pay/finance)**

…without duplicating identity, partner, catalog, payment, logistics, finance, notification, clinical consent/relationship, audit, or tenant/RLS kernels; **without** treating radiology as pathology or lab; **without** silently introducing LIS/HIS or a production PACS.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R8 IMPL authorization | Requires future **CR-R8-*-IMPL-*** |
| Creating application folders now | Topology slots; create only under IMPL CRs |
| LIS/HIS replacement | Explicitly out ([09](09_LAB_PLATFORM.md), Book 92) |
| Production PACS / live DICOM archive | **OD-RAD-02**; gated integration boundary only |
| Full Health Record / consent UX product | **R9** (R8 publishes `IMAGING_REPORT` artifacts into minimal pointer foundation) |
| Care navigation / CMS / CRM / Marketing | **R10–R12** |
| Live money / carriers / payouts | **R14** + legal |
| Second identity / payment / notification / logistics engine | Kernel lock |
| Generic Partner App | Forbidden ([88](88_GLOBAL_APPLICATION_TOPOLOGY.md)) |
| Modifying R0–R7 implementation | Hard stop |

### Boundary labels (used throughout)

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated, fail-closed implementation may be built when IMPL-authorized |
| **LEGAL** | Human/legal gate — engineering must not invent conclusions |
| **CLINICAL** | Clinical policy / SoD — pack or clinical committee, not code defaults |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Current-state audit (repository truth — 28 Aug 2026)

Inspected: `apps/api/src`, `packages/database/prisma/schema.prisma`, `packages/shared/src/policy.ts`, `apps/api/src/identity/app-topology.ts`, customer/lab/pathologist/delivery apps, blueprint Books 92–154.

| Area | Status | Evidence |
|------|--------|----------|
| Radiology / imaging / DICOM / PACS code | **MISSING** | No `apps/api/src/radiology`; no DICOM/PACS references in source |
| Radiology enums / models | **MISSING** | No `IMAGING_REPORT`, `IMAGING_STUDY`, `RADIOLOGIST` in Prisma |
| Radiologist / radiology apps | **MISSING** | No `web-radiologist`, `web-radiology`, `mobile-radiology` on disk |
| R7 lab diagnostics | **IMPLEMENTED** | `apps/api/src/lab/` (31 files); Books 141–150, closure [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) |
| Report kernel (reuse pattern) | **READY** | `LabReport` / `LabReportVersion` / `HealthArtifact` / DB immutability triggers (Book 152) |
| Lab booking spine (reuse pattern) | **READY** | `LabBooking` aggregate — **not** `Appointment`; separate commercial SoT |
| Payment sandbox | **READY** | Mock PSP; `PaymentService` lab pay pattern |
| Logistics job types | **PARTIAL** | `REPORT_DELIVERY` exists (R7-F); no imaging-specific transport |
| Catalog kinds | **PARTIAL** | `LAB_TEST` exists; no imaging catalog kind |
| Partner types (policy) | **PARTIAL** | `LAB`, `PATHOLOGIST`, `PHLEBOTOMIST`; no `RADIOLOGIST` |
| Organization kinds | **PARTIAL** | `LAB` exists; no `IMAGING_CENTER` |
| Service keys | **PARTIAL** | `lab_home`, `lab_center`, `physical_report_delivery`; no imaging keys |
| Consent / relationship | **READY** (doctor-centric) | `ConsentGrant`, `ClinicalRelationship` — pathologist/radiologist today use **org membership**, not consent recipient extension |
| Object store | **READY** | `PrivateObjectStore` for report JSON; pattern for study pointers |
| App topology registry | **STALE** | `APP-PATH-W` still `PLANNED` though `web-pathologist` exists; no radiology slots |

**Do not assume** radiology functionality exists because lab/pathology exists. R8 is a **separate bounded context** (`radiology`) per Book 92 §7.

---

## 2. Exact R8 scope

### 2.1 IN SCOPE (Book 93 + Book 92 §7)

| Area | Deliverable |
|------|-------------|
| Modality catalog | Platform imaging study definitions; radiology-center offers; country + pack gated |
| Customer booking | Center-first imaging booking; optional referral/eligibility gate (pack); sandbox payment |
| Authorization / eligibility | Referral or clinical prerequisite check where pack requires — **not** invented law |
| Study scheduling | Equipment/room calendar; appointment slot binding to imaging booking |
| Imaging order / referral | Distinct clinical authorization record when pack requires — separate from commercial booking |
| Patient preparation | Pack/provider preparation instructions surfaced to customer — content from provider + CMS later |
| Acquisition | Technician check-in, study start/complete, **metadata-only** sandbox study record |
| Image / study handling | Private object-store **pointer** + metadata; sandbox synthetic placeholder — **not** production PACS |
| Radiologist worklist | Assigned cases only; interpretation under SoD |
| Report lifecycle | Draft → review → verify → publish → amend (new version); `IMAGING_REPORT` health artifact |
| Customer report access | Digital report in booking detail + health artifact pointer |
| Physical report (optional) | Reuse `REPORT_DELIVERY` + `physical_report_delivery` pack pattern from R7-F |
| Sandbox finance | `IMAGING_PAYABLE` / fee facts — sandbox only |
| Apps (new + extend) | `web-radiology`, `web-radiologist`; extend customer web/RN, admin, delivery |
| Domains | **Radiology/Imaging** bounded context; reuse Logistics, Payment, Partner, Notification, Audit |

**Book 93 accept line:** book modality → worklist → publish imaging report; **isolated from lab analytes**.

### 2.2 OUT OF SCOPE

| Item | Owner wave |
|------|------------|
| Pathology / lab CoC / sample transport | **R7** (complete) |
| Full hospital LIS/HIS | Forever out |
| Production PACS / DICOM router / modality worklist from modalities | Gated integration — **OD-RAD-02** |
| Radiology-as-pathology (analyte result lines) | Forbidden |
| Live PSP / real payouts / live carriers | **R14** |
| Production LiveKit / recording | R4 production auth (separate) |
| Live e-Rx / automatic refill | R5 + legal (remain OFF) |
| Full patient health timeline UX | **R9** |
| Care navigation / CMS product / CRM | **R10–R12** |
| Generic Partner App | Forbidden |
| Invented accreditation / radiation safety claims | Legal + CMS |

### 2.3 DEPENDENCIES

| Dependency | Classification | Notes |
|------------|----------------|-------|
| R0 identity / JWT / RLS / NOBYPASSRLS | **READY** | Extend audiences/roles; no second identity |
| R0 partner / Join / KYC | **READY** | Add `RADIOLOGIST`, `IMAGING_CENTER` partner patterns under IMPL |
| R0 policy packs | **READY** | New service keys; empty pack **fail-closed false** |
| R1 payment sandbox | **READY** | Mock PSP only |
| R1 logistics | **PARTIAL** | Reuse `REPORT_DELIVERY`; no new job type unless OD-R8-LOG-01 requires |
| R1 finance / ledger | **PARTIAL** | Reuse sandbox fact pattern from R7-F |
| R2 appointments | **PARTIAL** | Doctor `Appointment` is teleconsult SoT — **do not overload**; imaging uses `ImagingBooking` + `StudySchedule` |
| R7 report architecture | **READY** (pattern) | Versioning, immutability, `HealthArtifact` — **separate models** |
| Radiology module | **MISSING** | `apps/api/src/radiology` planned |
| Radiology apps | **MISSING** | Planned slots only |
| DICOM viewer | **MISSING** | **OD-RAD-02** — vendor port at integration boundary |

### 2.4 DEFERRED (within or after R8)

| Item | Note |
|------|------|
| Mobile imaging technician app | **ED-R8-TECH-SURFACE** — web-radiology tech panels first |
| Mobile imaging unit / home imaging | Pack + legal; service key `imaging_mobile` deferred |
| Live DICOM ingest from modalities | Integration CR after sandbox proven |
| FHIR imaging export | OD-EHR-04 — later |
| Full in-browser DICOM viewer | **OD-RAD-02** |
| Tele-radiology cross-border | **OD-R8-03** — legal |
| Contrast administration clinical documentation depth | **OD-R8-06** — pack |

---

## 3. Bounded context — radiology vs lab

Per Book 92 §7:

| Owns (`radiology` BC) | Does **not** own |
|------------------------|------------------|
| Modality catalog (`IMAGING_STUDY` kind) | Pathology microscopy / LIS |
| Imaging center org, equipment calendar | Sample CoC |
| `ImagingBooking` commercial spine | `LabBooking` / `LabSample` |
| `ImagingReferral` / clinical authorization | Lab analyte `LabResultLine` |
| `ImagingStudy` + acquisition metadata | DICOM vendor choice |
| `ImagingReport` + versions | Treating CT/MRI as lab test |
| `IMAGING_REPORT` `HealthArtifact` | |

**Implementation rule:** New Nest module `apps/api/src/radiology/`. **Do not** extend `pathology.service.ts` or lab CoC services.

---

## 4. Imaging study model (planned schema — IMPL only)

Clear separation of aggregates (names indicative; exact Prisma names chosen under IMPL CR):

```
ImagingBooking          — commercial spine (like LabBooking, NOT Order, NOT Appointment)
  ├── ImagingBookingLine(s)     — frozen catalog offer / modality
  ├── ImagingReferral?          — optional clinical authorization (pack-gated)
  ├── StudySchedule             — slot + location + equipment
  ├── ImagingStudy              — procedure instance (1..n per booking if pack allows)
  │     └── ImagingAcquisition  — start/complete, tech actor, metadata pointer
  └── ImagingReport             — 1:1 with booking (or per-study if OD-R8-STUDY-SPLIT)
        └── ImagingReportVersion(s)  — DRAFT → PENDING_VERIFY → VERIFIED → PUBLISHED
              └── ImagingFindingLine(s)  — structured findings (NOT lab analytes)
```

| Aggregate | Role | Immutable after publish? |
|-----------|------|--------------------------|
| `ImagingBooking` | Customer contract, payment, status | Status transitions only |
| `ImagingReferral` | Referring clinician / document / eligibility | Append-only amendments |
| `ImagingStudy` | Procedure identity, accession-like number | Metadata corrections audit-logged pre-report |
| `ImagingAcquisition` | Who acquired, when, equipment, object pointer | Append-only event log preferred |
| `ImagingReportVersion` | Interpretation text + structured findings | **Yes** when `PUBLISHED` (DB trigger + service) |
| `HealthArtifact` | Customer-visible published pointer | Published row immutable |

**ED-R8-05:** Mirror R7 Book 152 immutability triggers on `imaging_report_versions` and `imaging_finding_lines`.

---

## 5. Report model (reuse R7 architecture)

| R7 pattern | R8 equivalent |
|------------|---------------|
| `LabReportVersionStatus` | `ImagingReportVersionStatus` (same enum values) |
| `pathology.service.ts` SoD | `interpretation.service.ts` — enterer ≠ verifier ≠ publisher |
| `amendReport()` | `amendImagingReport()` — new DRAFT version; published vN unchanged |
| `HealthArtifactType.LAB_REPORT` | Add `IMAGING_REPORT` |
| `PrivateObjectStore` `lab-reports/...` | `imaging-reports/{imagingOrgId}/...` |
| Customer differentiated errors | Same 401/403/404/network/generic pattern (Book 148/152) |

**CLINICAL:** Customer must never edit findings or radiologist interpretation. Read-only report view after publish.

---

## 6. Imaging data / DICOM plan

### 6.1 Sandbox default (**ED-R8-01** — engineering default, not law)

| Question | R8 sandbox plan |
|----------|-----------------|
| Store actual DICOM images? | **No** in R8 sandbox v1 — **metadata + synthetic placeholder** in private object store |
| What is stored? | Study UID (sandbox-generated), modality, body region, acquisition timestamp, technician id, **pointer** to placeholder object |
| Viewer | Static summary / PDF-style report JSON for customer; **no** production DICOM viewer |
| Future DICOM | **Integration boundary** `DicomIngestPort` / `StudyArchivePort` — separate gated CR; **OD-RAD-02** |

### 6.2 Access control

| Actor | Imaging content access |
|-------|------------------------|
| Customer | Published report JSON/summary; **no** raw DICOM in R8 sandbox |
| Imaging center staff | Own-org study metadata; pre-publish operational fields |
| Technician | Assigned studies — metadata + placeholder only |
| Radiologist | Assigned worklist — report draft + study metadata |
| Delivery rider | Parcel metadata only — **no** report body (R7-F pattern) |
| Admin | Metadata / KYC / incident — **no** clinical findings |
| Support | Ticket links only — **no** imaging payload (R11) |

### 6.3 Retention / audit / export

| Topic | Plan |
|-------|------|
| Retention | **OD-R8-04** — pack + legal; engineering stores `retention_policy_code` pointer only |
| Audit | `ClinicalAccessAudit` + radiology security events on report/study access |
| Download/export | **OD-R8-05** — customer export off by default in sandbox |
| Public URLs | **Forbidden** — private object store with server-mediated download only |

**PRODUCTION PACS = OFF.** LIS/HIS = OFF.

---

## 7. Radiology staff — actors, SoD, permissions

| Actor | Organization | Can do | Cannot do |
|-------|--------------|--------|-----------|
| Customer | — | Book, pay (sandbox), view own published report | Edit findings; see other patients |
| Imaging center admin | `IMAGING_CENTER` | Catalog, schedule, staff assign, check-in | Interpret, verify, publish report |
| Imaging technician | `IMAGING_CENTER` membership | Check-in, start/complete acquisition, study metadata | Interpret, verify, publish; see unrelated patients |
| Radiologist | `RADIOLOGIST` partner + center assignment | Worklist, draft interpretation, submit for verify | Acquire study (SoD); publish own verification (SoD) |
| Verifier radiologist | different person from enterer | Verify, publish | Enter findings on same version they verify |
| Platform admin | company | Partner KYC, pack, metadata incidents | Clinical findings, raw imaging |
| Delivery rider | delivery org | `REPORT_DELIVERY` POD | Report content |

### SoD matrix (planned — **CLINICAL** defaults, pack may tighten)

| Action | Enterer | Verifier | Publisher |
|--------|---------|----------|-----------|
| Draft findings | Radiologist A | — | — |
| Submit for verify | Radiologist A | — | — |
| Verify | — | Radiologist B (≠ A) | — |
| Publish | — | — | Radiologist B or dedicated publisher role (≠ A) |
| Amend published | Authorized radiologist | New version flow | Same SoD on new version |

**ED-R8-10:** Radiologist authorization via org membership + role assertions (mirror `assertPathologist`); extend `ConsentGrant` recipient types in **R9**, not silently in R8.

---

## 8. Customer experience (planned flow)

```
Browse radiology catalog (pack-gated)
  → Study detail + preparation requirements (provider/pack content)
  → Referral / eligibility step (if pack requires)
  → Select imaging center location
  → Select equipment slot
  → Create booking (idempotent)
  → Sandbox payment
  → Booking confirmed
  → Preparation instructions (read-only)
  → Study progress (scheduled → checked-in → acquired → reporting → published)
  → Final imaging report (read-only)
  → Optional physical report request
  → Booking history / health artifact pointer
```

**ENGINEERING:** Customer never mutates clinical findings.  
**LEGAL:** Preparation and radiation consent copy from pack/CMS — no invented clinical protocols.  
**PRODUCTION:** Disabled until country pack + legal enablement.

---

## 9. Application inventory

**No generic Partner App.** Join/KYC uses existing `web-join` + admin review.

| App | ID (planned) | Status | Action under R8 |
|-----|--------------|--------|-----------------|
| Customer web | `APP-CUS-W` | EXISTS | Extend `web-customer` |
| Customer mobile | `APP-CUS-M` | EXISTS | Extend `apps/mobile` (shared Android/iOS) |
| Imaging center web | `APP-RAD-W` | **PLANNED** | New `apps/web-radiology` under R8-A+ |
| Radiologist web | `APP-RADL-W` | **PLANNED** | New `apps/web-radiologist` under R8-D (**OD-RAD-01**) |
| Imaging technician mobile | `APP-RAD-T-M` | **DEFERRED** | Web panels first (**ED-R8-TECH-SURFACE**) |
| Delivery mobile | `APP-DEL-M` | EXISTS | Extend `REPORT_DELIVERY` branch for imaging physical reports |
| Admin web | `APP-ADM-W` | EXISTS | Extend radiology partner governance |
| Support | — | R11 | Metadata-only ticket links — not R8 |

### 9.1 UI completeness rule (HARD)

A screen is **not complete** if only: app builds, route exists, EmptyState placeholder, or static copy without API wiring.

Every screen below must implement: **loading, empty, error, 401, 403, session expired, network failure, validation, success, accessibility, responsive (web), mobile parity (customer RN)**.

---

## 10. Complete UI inventory — customer web (`web-customer`)

| # | Screen | Route | Nav entry | Actor | API(s) | Data | States required |
|---|--------|-------|-----------|-------|--------|------|-----------------|
| C-W-01 | Radiology catalog list | `/radiology` or `/lab-radiology` | Main nav "Imaging" (pack-gated) | Customer | `GET /me/imaging/catalog` | Study cards, modality, price sandbox | All |
| C-W-02 | Study detail | `/radiology/:slug` | From catalog | Customer | `GET /me/imaging/catalog/:slug` | Title, prep summary, eligibility hints | All |
| C-W-03 | Referral / eligibility | `/radiology/:slug/eligibility` | From detail CTA | Customer | `POST /me/imaging/eligibility` | Referral doc upload meta / doctor link | All + validation |
| C-W-04 | Location picker | `/radiology/book/location` | Booking wizard | Customer | `GET /me/imaging/locations` | Centers list | All |
| C-W-05 | Slot picker | `/radiology/book/slot` | Wizard | Customer | `GET /me/imaging/slots` | Calendar slots | All |
| C-W-06 | Booking review | `/radiology/book/review` | Wizard | Customer | — | Lines, price, prep ack checkbox | All + validation |
| C-W-07 | Sandbox checkout | `/radiology/book/pay` | Wizard | Customer | `POST /me/imaging/bookings`, `POST .../pay` | Payment sandbox status | All + idempotency |
| C-W-08 | Booking confirmation | `/radiology/bookings/:id/confirmed` | Post-pay redirect | Customer | `GET /me/imaging/bookings/:id` | Booking id, next steps | All |
| C-W-09 | My imaging bookings list | `/radiology/bookings` | Account / Imaging | Customer | `GET /me/imaging/bookings` | Status list | All |
| C-W-10 | Booking detail + progress | `/radiology/bookings/:id` | From list | Customer | `GET .../bookings/:id`, `GET .../progress` | Schedule, study status, prep | All |
| C-W-11 | Preparation instructions | `/radiology/bookings/:id/preparation` | From detail | Customer | `GET .../preparation` | Read-only prep content | All |
| C-W-12 | Report status | inline on C-W-10 | When reporting | Customer | `GET .../report/status` | Pre-publish denial | All |
| C-W-13 | Final report view | inline on C-W-10 | When published | Customer | `GET .../report` | Findings summary (read-only) | All + 403/404 differentiated |
| C-W-14 | Physical report request | inline on C-W-10 | When published + pack | Customer | `GET/POST .../physical-report/*` | Eligibility, status | All (mirror R7-F web) |
| C-W-15 | Cancel booking | modal on C-W-10 | Action | Customer | `POST .../cancel` | Cancel rules | All + validation |

**Mobile parity:** Screens C-W-01…C-W-15 have 1:1 RN equivalents in `apps/mobile` `Imaging*` screens (same APIs, `FeatureStates` + native error components per Book 152).

---

## 11. Complete UI inventory — customer React Native (`apps/mobile`)

| # | Screen | Route (nav) | API parity | Notes |
|---|--------|-------------|------------|-------|
| C-M-01 | Imaging catalog | `ImagingCatalog` | C-W-01 | Shared Android/iOS kernel |
| C-M-02 | Study detail | `ImagingStudyDetail` | C-W-02 | |
| C-M-03 | Eligibility | `ImagingEligibility` | C-W-03 | |
| C-M-04 | Location | `ImagingLocation` | C-W-04 | |
| C-M-05 | Slot | `ImagingSlot` | C-W-05 | |
| C-M-06 | Review | `ImagingReview` | C-W-06 | |
| C-M-07 | Pay | `ImagingPay` | C-W-07 | |
| C-M-08 | Confirmed | `ImagingConfirmed` | C-W-08 | |
| C-M-09 | Bookings list | `ImagingBookings` | C-W-09 | |
| C-M-10 | Booking detail | `ImagingBookingDetail` | C-W-10–14 | Report `reportError` states required |
| C-M-11 | Preparation | `ImagingPreparation` | C-W-11 | |

All screens: **loading, empty, error, 401, 403, session expired, network, validation, success, accessibility** via existing `FeatureStates` / `NativeNetworkErrorState` / `NativePermissionDeniedState`.

---

## 12. Complete UI inventory — imaging center web (`web-radiology` — PLANNED)

| # | Screen | Route | Nav | Actor | API(s) |
|---|--------|-------|-----|-------|--------|
| R-W-01 | Dashboard | `/` | Home | Center admin | `GET /radiology/dashboard` |
| R-W-02 | Catalog list | `/catalog` | Catalog | Center admin | `GET /radiology/catalog` |
| R-W-03 | Catalog edit | `/catalog/:id` | Catalog | Center admin | `PUT /radiology/catalog/:id` |
| R-W-04 | Bookings queue | `/bookings` | Bookings | Center staff | `GET /radiology/bookings` |
| R-W-05 | Booking detail | `/bookings/:id` | Bookings | Center staff | `GET /radiology/bookings/:id` |
| R-W-06 | Schedule calendar | `/schedule` | Schedule | Scheduler | `GET /radiology/schedule` |
| R-W-07 | Equipment admin | `/equipment` | Settings | Center admin | `GET/PUT /radiology/equipment` |
| R-W-08 | Check-in desk | `/check-in` | Operations | Technician | `GET /radiology/check-in`, `POST .../check-in` |
| R-W-09 | Acquisition console | `/studies/:id/acquire` | Operations | Technician | `POST /radiology/studies/:id/start`, `.../complete` |
| R-W-10 | Studies in progress | `/studies` | Operations | Technician | `GET /radiology/studies` |
| R-W-11 | Referral review | `/referrals` | Clinical ops | Center admin | `GET /radiology/referrals`, approve/deny |
| R-W-12 | Report ops status | `/reports` | Reports | Center admin | Metadata only — not interpretation |
| R-W-13 | Physical report ops | `/physical-reports` | Logistics | Center staff | Mirror lab physical panel |
| R-W-14 | Org settings | `/settings` | Settings | Center admin | Pack, locations, hours |

Each screen: full state matrix (§9.1). Technician screens (R-W-08–10) enforce assigned-study scope only.

---

## 13. Complete UI inventory — radiologist web (`web-radiologist` — PLANNED)

Mirror `web-pathologist` patterns; **OD-RAD-01** may merge into `web-radiology` mode — if so, same screens under `/radiologist/*` prefix in one app. Plan assumes **separate app** (**ED-R8-03**) pending human decision.

| # | Screen | Route | API |
|---|--------|-------|-----|
| RL-W-01 | Worklist | `/` | `GET /radiologist/worklist` |
| RL-W-02 | Case detail | `/cases/:studyId` | `GET /radiologist/cases/:id` |
| RL-W-03 | Interpretation editor | `/cases/:studyId/interpret` | `POST /radiologist/reports/:id/findings` |
| RL-W-04 | Submit for verify | action | `POST .../submit` |
| RL-W-05 | Verify queue | `/verify` | `GET /radiologist/verify-queue` |
| RL-W-06 | Verify screen | `/verify/:versionId` | `POST .../verify` |
| RL-W-07 | Publish | action | `POST .../publish` |
| RL-W-08 | Amend published | `/cases/:studyId/amend` | `POST .../amend` |
| RL-W-09 | Published read-only | `/cases/:studyId/report` | `GET .../report` |

SoD enforced server-side; UI shows 403 when actor wrong role.

---

## 14. Complete UI inventory — admin (`web-admin` extensions)

| # | Screen | Route | API |
|---|--------|-------|-----|
| A-W-01 | Imaging partners list | `/admin/partners?type=IMAGING` | `GET /admin/imaging/partners` |
| A-W-02 | Partner detail / KYC | `/admin/partners/:id` | existing + imaging attestation |
| A-W-03 | Imaging acceptance | `/admin/imaging/:orgId/acceptance` | `POST /admin/imaging/accept` |
| A-W-04 | Imaging incidents (metadata) | `/admin/imaging/incidents` | security events — no findings |
| A-W-05 | Physical report metadata | `/admin/imaging/physical-reports` | mirror admin lab physical |

---

## 15. Complete UI inventory — delivery mobile (`mobile-delivery` extension)

Reuse `REPORT_DELIVERY` job branch. Imaging physical reports use same rider UX as R7-F with imaging booking id in metadata.

| # | Screen | Change | API |
|---|--------|--------|-----|
| D-M-01 | Job list | Show `REPORT_DELIVERY` for imaging | existing `GET /delivery/jobs` |
| D-M-02 | Report delivery detail | Parcel metadata only | existing + imaging fields |
| D-M-03 | POD capture | unchanged | existing |

Rider payloads: **no** report text, findings, or DICOM metadata.

---

## 16. Security / RLS (planned)

| Requirement | Plan |
|-------------|------|
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | Unchanged — attested in every R8 e2e gate |
| FORCE RLS | All new radiology clinical tables |
| No `USING(true)` | Tenant-scoped policies via `app.*` GUC helpers (post-`multi_tenant_rls` pattern) |
| Tenant isolation | Imaging org A ↛ B |
| Country isolation | Pack + `country_id` on bookings/catalog |
| Patient authorization | Customer `person_id` on own bookings/reports only |
| Pack gates | `imaging_center` (and deferred `imaging_mobile`) fail-closed |
| Admin boundary | Metadata-only clinical access |
| Delivery boundary | Job-scoped parcel fields only |

Cross-tenant e2e matrix (required per phase): customer, imaging center, technician, radiologist, delivery, admin, finance sandbox.

---

## 17. PHI / imaging privacy

| Surface | Minimum necessary | Notification rule |
|---------|-------------------|-------------------|
| Push / SMS / email | Booking ref, appointment time, "report ready" | **No** findings, **no** modality diagnosis text, **no** image thumbnails |
| Outbox events | IDs + status enums | No clinical payload |
| Logs | Request ids, booking ids | No findings, no DICOM UIDs in info logs |
| Support | Booking id link | No paste of report body |
| Commerce CDN | Never | Imaging objects in **private** store only |

---

## 18. Finance (sandbox only)

| Item | Plan |
|------|------|
| Payment | Reuse `PaymentService` — new `payImagingBooking` mirror `payLabBooking` |
| `creates_order` | **false** — diagnostic booking is not commerce order |
| Sandbox facts | `IMAGING_PAYABLE` on publish; `REPORT_DELIVERY_FEE` on physical dispatch (reuse R7-F) |
| Live PSP / real money / bank payout | **OFF** |
| Report access vs payment | Digital report after **publish**, not gated on payment settlement beyond booking confirm |

---

## 19. Logistics

| Need | Plan |
|------|------|
| Patient transport to center | **OUT** of R8 v1 — customer travels; **OD-R8-LOG-01** if later |
| Equipment transport | **OUT** — not platform logistics |
| Physical report delivery | **IN** — reuse `LogisticsJobType.REPORT_DELIVERY` + `physical_report_delivery` pack |
| Sample-like logistics | **NOT APPLICABLE** — imaging is not lab CoC |

---

## 20. Notifications (planned events)

| Event | Recipient | Payload |
|-------|-----------|---------|
| `IMAGING_BOOKING_CONFIRMED` | Customer | Booking ref, time, location name |
| `IMAGING_APPOINTMENT_REMINDER` | Customer | Time, location — no clinical |
| `IMAGING_STUDY_CHECKED_IN` | Customer | Status only |
| `IMAGING_REPORT_PUBLISHED` | Customer | "Report ready" — no findings |
| `PHYSICAL_REPORT_*` | Customer / rider | Reuse R7-F titles |
| `IMAGING_REFERRAL_REJECTED` | Customer | Reason code — no clinical |

---

## 21. Legal / clinical / human gates

**Do not invent law.**

| ID | Topic | Status |
|----|-------|--------|
| **OD-RAD-01** | Radiologist web vs imaging-center web radiology mode | **OPEN** — product + ops |
| **OD-RAD-02** | DICOM/PACS viewer strategy | **OPEN** — clinical + security |
| **OD-R8-01** | Referral mandatory vs optional per country/modality | **OPEN** — legal + clinical |
| **OD-R8-02** | Ionizing radiation consent / disclosure copy | **OPEN** — legal |
| **OD-R8-03** | Tele-radiology / cross-border interpretation | **OPEN** — legal |
| **OD-R8-04** | Image and report retention periods | **OPEN** — legal |
| **OD-R8-05** | Patient download/export of images | **OPEN** — legal + privacy |
| **OD-R8-06** | Contrast administration documentation requirements | **OPEN** — clinical |
| **OD-R8-07** | Physical imaging report courier rules | **OPEN** — legal (reuse R7-F pattern) |
| **OD-R8-08** | Production healthcare activation for imaging | **NOT GRANTED** |
| **OD-EHR-01/02** | Controller/processor, residency | **OPEN** |
| **OD-PAY / MoR / PSP** | Live money | **R14** — out of R8 |
| Country licensing / facility accreditation | Marketplace enablement | **LEGAL** — packs only |

---

## 22. Engineering defaults (**ED-R8-*** — not law)

| ID | Default | Label |
|----|---------|-------|
| **ED-R8-01** | Sandbox stores metadata + synthetic placeholder object, not production DICOM | Engineering |
| **ED-R8-02** | Center-first booking (imaging at facility) | Engineering |
| **ED-R8-03** | Separate `web-radiology` + `web-radiologist` apps (pending OD-RAD-01) | Engineering |
| **ED-R8-04** | Reuse `REPORT_DELIVERY` for physical imaging reports | Engineering |
| **ED-R8-05** | DB immutability triggers on published imaging report versions + finding lines | Engineering |
| **ED-R8-06** | Add `CatalogItemKind.IMAGING_STUDY` (additive) | Engineering |
| **ED-R8-07** | Add `OrganizationKind.IMAGING_CENTER` (additive) | Engineering |
| **ED-R8-08** | Add partner type `RADIOLOGIST` to policy catalog | Engineering |
| **ED-R8-09** | Service keys `imaging_center` (+ deferred `imaging_mobile`) | Engineering |
| **ED-R8-10** | Radiologist auth via org membership + SoD; consent recipient extension deferred to R9 | Engineering |
| **ED-R8-TECH-SURFACE** | Technician workflow on web-radiology first; mobile tech app deferred | Engineering |

---

## 23. Implementation order (sub-phases)

Each sub-phase requires its own future **CR-R8-*-IMPL** authorization. **None authorized by this CR.**

### R8-A — Radiology foundation + imaging partner gate

| | |
|--|--|
| **Scope** | Nest `radiology` module shell; `IMAGING_STUDY` catalog kind; `IMAGING_CENTER` org kind; `RADIOLOGIST` partner type; pack keys `imaging_center`; `ImagingCapabilityService` (mirror lab capability); admin imaging acceptance; `apps/web-radiology` foundation shell |
| **Deps** | R7 closed; R0 partner/policy |
| **Apps** | web-radiology (**FOUNDATION**), web-admin, web-join |
| **DB** | Additive enums; imaging org profile tables |
| **API** | Org capabilities; catalog CRUD; admin eligibility |
| **UI** | R-W-01–03, R-W-14, A-W-01–03 |
| **Security** | Center A ↛ B; pack fail-closed |
| **Tests** | `r8a.radiology.e2e.spec.ts` |
| **Non-starts** | Customer booking; acquisition; DICOM; live money; LIS/HIS |

### R8-B — Customer imaging catalog + booking + sandbox pay

| | |
|--|--|
| **Scope** | `ImagingBooking` aggregate; customer browse/book/pay; optional `ImagingReferral` gate; `StudySchedule` slot binding |
| **Deps** | R8-A; payment sandbox |
| **Apps** | web-customer, mobile (customer) |
| **DB** | Booking lines; price freeze; referral table |
| **API** | `GET/POST /me/imaging/*`; idempotent pay |
| **UI** | C-W-01…C-W-09, C-M-01…C-M-09 |
| **Security** | Customer A ↛ B |
| **Tests** | `r8b.imaging-booking.e2e.spec.ts` |
| **Non-starts** | Acquisition; interpretation; DICOM ingest |

### R8-C — Imaging operations + acquisition

| | |
|--|--|
| **Scope** | Check-in, study lifecycle, technician acquisition, metadata + sandbox object pointer; referral review |
| **Deps** | R8-B |
| **Apps** | web-radiology |
| **DB** | `ImagingStudy`, `ImagingAcquisition`, status history |
| **API** | `/radiology/check-in`, `/radiology/studies/*` |
| **UI** | R-W-04–11, R-W-08–10 |
| **Security** | Technician assigned-only; no radiologist interpretation here |
| **Tests** | `r8c.imaging-acquisition.e2e.spec.ts` |
| **Non-starts** | Report publish; PACS; mobile tech app |

### R8-D — Radiologist interpretation + SoD

| | |
|--|--|
| **Scope** | `apps/web-radiologist`; worklist; draft findings; submit/verify SoD |
| **Deps** | R8-C |
| **Apps** | web-radiologist |
| **DB** | `ImagingReport`, `ImagingReportVersion`, `ImagingFindingLine` |
| **API** | `/radiologist/*` |
| **UI** | RL-W-01…RL-W-07 |
| **Security** | Radiologist ↛ unrelated cases; SoD enforced |
| **Tests** | `r8d.radiologist-interpretation.e2e.spec.ts` |
| **Non-starts** | Publish to customer; DICOM viewer |

### R8-E — Digital imaging report + publication

| | |
|--|--|
| **Scope** | Publish flow; `HealthArtifactType.IMAGING_REPORT`; customer report access; amendment; DB immutability triggers |
| **Deps** | R8-D |
| **Apps** | web-radiologist, web-customer, mobile |
| **DB** | `health_artifacts` extension; immutability migration |
| **API** | Publish, amend, customer report endpoints |
| **UI** | RL-W-08–09, C-W-10–13, C-M-10 report states |
| **Security** | Pre-publish denial; published immutability |
| **Tests** | `r8e.imaging-digital-report.e2e.spec.ts` (incl. amendment + DB trigger) |
| **Non-starts** | Physical delivery; live finance |

### R8-F — Physical report + sandbox finance + acceptance

| | |
|--|--|
| **Scope** | Physical report request; `REPORT_DELIVERY` for imaging; `IMAGING_PAYABLE` sandbox facts; full chain acceptance |
| **Status** | **IMPLEMENTED** [168](168_R8_F_PHYSICAL_REPORT_DELIVERY_FINANCE_IMPLEMENTATION.md) (**R8_F_IMPLEMENTED**) |
| **Deps** | R8-E |
| **Apps** | web-customer, mobile, web-radiology, mobile-delivery, web-admin |
| **API** | Physical report + finance facts |
| **Tests** | `r8f.imaging-physical-finance.e2e.spec.ts`; R0–R8 regression (see Book 168) |
| **Non-starts** | R9 EHR; R14 live money; PACS production |

---

## 24. Test strategy

| Layer | Requirement |
|-------|-------------|
| Unit | State machines, SoD assertions, pack gate helpers |
| API e2e | Per-phase `r8a`…`r8f` specs; full chain in `r8f` |
| RLS | `rls.tenancy.e2e` extended for imaging tables; `USING(true)` count = 0 |
| PHI | Assert no findings in notifications, rider JSON, admin list payloads |
| SoD | Enterer ≠ verifier ≠ publisher in `r8d`/`r8e` |
| State machine | Illegal transitions return 409 |
| Idempotency | Booking create, pay, physical request |
| Amendment | Published v1 immutable; v2 draft; customer visibility rules |
| UI | web-customer + mobile jest; web-radiology/radiologist typecheck + build |
| Regression | R0–R7 suites remain green after each IMPL phase |
| Determinism | **No retry-to-pass**; isolated `--runInBand` canonical command |

---

## 25. Production boundary (preserved)

| Boundary | R8 plan status |
|----------|----------------|
| LIVE PSP | **OFF** |
| REAL MONEY | **OFF** |
| REAL CARRIERS | **OFF** |
| PRODUCTION HEALTHCARE | **OFF** |
| LIVE E-RX | **OFF** |
| AUTO REFILL | **OFF** |
| PRODUCTION LIVEKIT | **OFF** |
| RECORDING | **OFF** |
| LIS/HIS | **OFF** |
| PACS PRODUCTION | **OFF** |

---

## 26. Measurable R8 acceptance (future IMPL complete)

| Area | Accept |
|------|--------|
| Flow | Customer books pack-enabled modality → sandbox pay → check-in → acquisition → radiologist publishes → customer sees digital imaging report |
| Isolation | Imaging report isolated from lab analytes; separate BC |
| Money | Sandbox only; no live PSP |
| Carrier | Mock only; `REPORT_DELIVERY` parcel metadata safe |
| Security | Isolation matrix green; FORCE RLS; NOBYPASSRLS; zero `USING(true)` |
| PHI | Min-necessary; no findings in notifications |
| UI | Every screen in §10–15 with full state matrix — no placeholder acceptance |
| Imaging data | Sandbox metadata + pointer only unless separate DICOM CR authorized |
| Regression | R0–R7 API suites green |
| Pack | Fail-closed when `imaging_center` disabled |
| Non-claims | No official imaging report legal claim without legal gate; no invented radiation law |

---

## Document control

| Action | Status |
|--------|--------|
| Create Book 155 | **This document** |
| Update master index / roadmap | Companion edits only |
| Production code / migrations / app folders | **NONE** |

---

## Final declaration

**FINAL STATUS: R8_PLAN_READY**

**R8 implementation NOT STARTED.**  
**R8-A NOT STARTED.**  
**R9+ NOT STARTED.**  
**No migrations.**  
**No application/source code created.**

**STOP.**
