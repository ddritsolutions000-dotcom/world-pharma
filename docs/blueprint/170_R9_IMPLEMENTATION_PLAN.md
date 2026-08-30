# 170 — R9 Health record + consent UX implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R9-AUTH-170**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R9_PLAN_READY**

**Prerequisite:** R8-F closed — **R8_F_GREEN_R9_READY_FOR_PLANNING** ([169](169_POST_R8_F_AUDIT.md)). R7 closed ([154](154_POST_R7_FINAL_CLOSURE_AUDIT.md)). This CR authorizes **R9 planning only**. It does **not** authorize R9 implementation.

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [169](169_POST_R8_F_AUDIT.md) · [16](16_HEALTH_RECORD.md) · [71](71_HEALTH_RECORD_CONSENT.md) · [27](27_SECURITY_ARCHITECTURE.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) · [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) · [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · `packages/database/prisma/schema.prisma` · `apps/api/src/clinical/*` · `apps/api/src/lab/pathology.service.ts` · `apps/api/src/radiology/interpretation.service.ts`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R9-A implementation. **Do not** start R10+. **Do not** enable live PSP/carriers/payouts, production LiveKit, recording, live e-Rx, automatic refill, production healthcare, LIS/HIS, or production PACS.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R9 Health record + consent UX** wave so future **CR-R9-*-IMPL** work can deliver Book 93 acceptance:

> **Patient-facing unified health timeline; grant/revoke consent; revoke stops next access; doctor access via relationship + consent; admin consent audit and break-glass review — all in sandbox, deny-by-default for clinical payloads.**

…without duplicating identity, partner, payment, logistics, finance, notification, audit, or tenant/RLS kernels; **without** modifying R7 laboratory or R8 radiology bounded contexts; **without** building a hospital EMR.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R9 IMPL authorization | Requires future **CR-R9-*-IMPL-*** |
| R10+ planning | Explicit hard stop |
| LIS/HIS / production PACS / live e-Rx / automatic refill | Production boundary |
| Live money / carriers / payouts | **R14** + legal |
| Second payment / logistics / notification kernel | Kernel lock |
| Full artifact type catalog from Book 16 §4.2 | R9 v1 = R5–R8 artifacts only (+ timeline events) |
| CRM 360 clinical payloads | Book 16 / 71 separation |
| Modifying R0–R8 implementation except additive health-read hooks | Hard stop |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated, fail-closed — build when IMPL-authorized |
| **LEGAL** | Human/legal gate |
| **CLINICAL** | Clinical policy / SoD — pack or committee |
| **PRODUCT** | Product decision — document as OD-R9-* if unresolved |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Canonical current state (verified 29 Aug 2026)

| Claim | Verified | Evidence |
|-------|----------|----------|
| R0–R6 complete sandbox | **YES** | Books 51–139; [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) |
| R7 CLOSED | **YES** | [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) **R7_CLOSED** |
| R8-A…R8-F complete sandbox | **YES** | Books 156–169 |
| Book 169 = R8-F GREEN / R9 READY | **YES** | [169](169_POST_R8_F_AUDIT.md) **R8_F_GREEN_R9_READY_FOR_PLANNING** |
| Live money OFF | **YES** | Mock PSP; sandbox finance facts only |
| Live PSP OFF | **YES** | No live payment provider paths in R7/R8 |
| Real carriers OFF | **YES** | Mock logistics |
| Production healthcare OFF | **YES** | `sandbox: true` on clinical rows |
| Production PACS/DICOM OFF | **YES** | No DICOM archive in repo |
| LIS/HIS OFF | **YES** | Explicit out of scope |
| Live e-Rx OFF | **YES** | Sandbox prescriptions only |
| Automatic refill OFF | **YES** | OD-RX-REFILL unresolved |
| Production LiveKit OFF | **YES** | Sandbox telemedicine |
| Recording OFF | **YES** | No recording artifact pipeline |

**68 migrations applied** (`prisma migrate status` per Book 169).

---

## 2. Current-state audit (R9-specific)

### EXISTS

| Area | Evidence |
|------|----------|
| `HealthArtifact` table | `LAB_REPORT`, `IMAGING_REPORT`; created on R7-E/R8-E publish |
| `health_artifacts` RLS | FORCE RLS; patient `can_person(person_id)`; org via booking FK ([r7e](packages/database/prisma/migrations/20260828180000_r7e_pathology_digital_report), [r8e](packages/database/prisma/migrations/20260829140100_r8e_imaging_report_publication_body)) |
| `ConsentGrant` + RLS | `consent_grants`; statuses ACTIVE/REVOKED/EXPIRED; hardened policy ([r7 clinical RLS](packages/database/prisma/migrations/20260827180700_rls_clinical_and_labels)) |
| `ClinicalRelationship` | Doctor–patient relationship with kind/status |
| `ClinicalAccessAudit` | Append-only access evaluation log |
| `ClinicalAccessService` | `evaluate()` — relationship + consent + policy gates |
| Consent API | `POST/GET /consent/grants`, `POST /consent/grants/:id/revoke` |
| Consent UI (customer) | `web-customer` `/account/consent`; `mobile` `ConsentScreen` |
| Customer per-booking report APIs | `GET /customer/lab/bookings/:id/report`; `GET /customer/imaging/bookings/:id/report` |
| `BreakGlassGrant` + company API | `POST /admin/company-authority/break-glass` — **not wired to clinical ConsentGrant** |
| Security events | `CONSENT_GRANTED`, `CONSENT_REVOKED`, `CLINICAL_ACCESS_EVALUATED`, `BREAK_GLASS_OPENED` |
| Outbox events | Consent + clinical access producer events |
| R5 `Prescription` aggregate | Clinical Rx exists; **not** projected to `HealthArtifact` |
| Doctor access evaluate API | `web-doctor` calls clinical access evaluate (encounter context) |

### PARTIAL

| Area | Gap |
|------|-----|
| Health record UX | No unified patient timeline; reports only via lab/imaging booking detail |
| Consent model vs Book 16 | No PENDING/SUPERSEDED/DENIED; purpose is free string not enum; scope JSON unvalidated |
| Doctor artifact read | No `health_artifact:read` enforcement on report payload fetch for doctors |
| Break-glass clinical | `BreakGlassGrant` grants permissions JSON; no `ConsentGrant` purpose `break_glass` for health reads |
| Admin consent audit | Security events exist; no dedicated admin consent/audit UI |
| `ClinicalAccessAudit` | Used for `evaluate()` only; not for every artifact payload read |
| Patient self-read RLS | `health_artifacts` allows patient SELECT; no unified list API |

### REUSABLE

| Kernel / module | R9 reuse |
|-----------------|----------|
| Identity / JWT / RBAC | All actors |
| `ConsentService` | Extend scope validation; grant lifecycle |
| `ClinicalAccessService` | Extend for artifact-read purpose matrix |
| `OutboxService` | New health notification events |
| `SecurityEventsService` | PHI-minimal metadata |
| Lab customer report endpoints | Payload delegate for `LAB_REPORT` artifacts |
| Imaging customer report endpoints | Payload delegate for `IMAGING_REPORT` artifacts |
| Customer shell / mobile navigation | Add Health tab |
| `@world-pharma/ui-kit` state components | Loading, empty, 401, 403, network error |
| `PolicyResolver` | Pack gates for health features |
| Finance / logistics | **No R9 finance or logistics jobs** (physical report delivery stays R7-F/R8-F) |

### MISSING

| Area | Notes |
|------|-------|
| `HealthTimelineEvent` aggregate / table | Ordered patient-visible feed |
| `HealthArtifactAccessAudit` (or extended clinical audit) | Per-payload read log |
| Unified health timeline API | `GET /health/timeline` |
| Artifact metadata + payload proxy API | Consent-gated doctor reads |
| Customer Health tab routes/screens | Web + mobile |
| Doctor patient health screens | Web + mobile-doctor |
| Admin consent audit screens | web-admin |
| Break-glass → clinical consent bridge | Book 16 §6.3 / 27 |
| `PRESCRIPTION` HealthArtifact projection | R5 artifacts not in timeline |
| R9 e2e / RLS / PHI leakage tests | Not started |
| Prescription payload in health read path | Deferred to R9-E artifact projection |

### PLANNED (blueprint only — not implemented)

| Reference | Content |
|-----------|---------|
| [16](16_HEALTH_RECORD.md) | Full artifact catalog, consent state machine, break-glass |
| [71](71_HEALTH_RECORD_CONSENT.md) | Access algorithm, CRM separation |
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R9 | Canonical R9 scope |
| [21](21_API_ARCHITECTURE.md) | `POST /admin/health/break-glass` pattern |

---

## 3. Canonical R9 scope

From [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) — **preserved verbatim**:

| Attribute | Value |
|-----------|-------|
| **Objective** | Patient-facing timeline, grant/revoke, break-glass review |
| **Domains** | Health Record, Consent |
| **Apps** | Customer Health tab; Admin consent audit; Doctor access via relationship+consent |
| **Depends** | Artifacts from R5–R8 |
| **Legal** | Controller/processor, residency (**OD-EHR-01/02**) |
| **Security** | Deny-by-default clinical payload; CRM must not copy payloads |
| **Accept** | View own artifacts; revoke stops next access |

### R9 v1 artifact scope (engineering interpretation — not expanding roadmap)

| Artifact type | Source release | In R9 timeline |
|---------------|----------------|----------------|
| `LAB_REPORT` | R7-E publish | **YES** (exists) |
| `IMAGING_REPORT` | R8-E publish | **YES** (exists) |
| `PRESCRIPTION_STRUCTURED` | R5 signed Rx | **YES** (projection in R9-E) |
| Consult notes, uploads, allergies, vaccines | Book 16 | **DEFERRED — R10+** |
| Physical report POD | R7-F/R8-F logistics | **DEFERRED — R9-X** (operational; not clinical timeline v1) |

---

## 4. Domain boundary

### Inside R9

- Patient unified health timeline (metadata only in list APIs)
- Health artifact index and consent-gated payload reads
- Consent grant/revoke UX hardening + scope enforcement
- Doctor patient health view (relationship + consent + audit)
- Admin consent grant audit + break-glass clinical review queue
- `HealthTimelineEvent` projection from R5–R8 publish events
- RLS hardening / access audit tables for health reads
- Notifications: consent + report-available (PHI-minimal)

### Remains in R8 (do not modify lifecycle)

- Imaging booking, acquisition, interpretation, publish, physical delivery
- `ImagingReport`, `ImagingReportVersion`, `ImagingPhysicalReportRequest`
- `web-radiology`, `web-radiologist`, radiology ops APIs

### Remains in R7 (do not modify lifecycle)

- Lab booking, collection, accession, pathology, publish, physical delivery
- `LabReport`, `LabReportVersion`, `PhysicalReportRequest`
- `web-lab`, `web-pathologist`, lab ops APIs

### R10+ (explicit non-starts)

- Care navigation, triage, symptom intake
- CMS/help desk clinical paste
- CRM 360 with clinical payloads
- Full Book 16 artifact catalog
- Customer upload / OCR Rx pipeline as health artifact
- Search index with PHI
- Production healthcare integrations

### Shared infrastructure (must NOT duplicate)

- Identity, tenancy, RLS helpers (`app.can_person`, `app.can_org`)
- Payment sandbox kernel (R9 has **no** new payable types)
- Logistics kernel (no new R9 job types)
- Finance facts kernel (no R9 finance)
- Notification outbox
- Object store / signed URL pattern for report blobs
- `ConsentService` / `ClinicalAccessService` — **extend**, do not fork

### Must NOT duplicate

- Lab report publish pipeline (R7-E)
- Imaging report publish pipeline (R8-E)
- Per-booking customer report controllers (R9 **delegates** for payload)
- Second consent store
- Second break-glass grant table (bridge to `ConsentGrant` instead)

---

## 5. Backend-first architecture

### 5.1 Module layout (future)

```
apps/api/src/health/
  health.module.ts
  health-timeline.service.ts      # Timeline projection + list
  health-artifact.service.ts      # Metadata, payload authorize + delegate
  health-access.service.ts        # Consent + relationship + break-glass evaluate for reads
  health.controller.ts            # Patient + doctor health APIs
  admin-health.controller.ts      # Admin audit + break-glass review
  health.types.ts
```

Registers in `app.module.ts` alongside existing `clinical` module (consent stays in `clinical`; health **consumes** it).

### 5.2 Aggregates

#### HealthTimelineEvent

| Attribute | Value |
|-----------|-------|
| **Owner** | Platform health module |
| **Actors** | System (projection), patient (read), doctor (read via consent), platform admin (audit metadata) |
| **Purpose** | Patient-visible ordered feed without payload |
| **PHI** | List row = **operational metadata** (type, title, date, status) — no analytes/findings |
| **RLS** | `person_id` = patient; doctor via app-layer consent check on list |

**Lifecycle:** `ACTIVE` → `SUPERSEDED` (amendment) | `REDACTED` (legal hold — **DEFERRED — R9-X**)

**Invalid transitions:** REDACTED → ACTIVE without legal workflow

**Idempotency:** Projection keyed by `(source_module, source_id, event_type)`

#### HealthArtifact (existing — extend usage only)

| Attribute | Value |
|-----------|-------|
| **Owner** | Source module creates; health module indexes |
| **Actors** | Patient (own), doctor (consent), lab/pathology worker (org RLS), platform |
| **Terminal** | Row immutable after publish (R7/R8 triggers) |
| **PHI** | Pointer only in table; payload in object store |
| **RLS** | Existing `health_artifacts_access` + no `USING(true)` |

#### ConsentGrant (existing — extend validation)

| Attribute | Value |
|-----------|-------|
| **Owner** | Clinical module |
| **Actors** | Patient grant/revoke; doctor read recipient; admin break-glass creates |
| **States** | ACTIVE, REVOKED, EXPIRED (v1); PENDING/SUPERSEDED **DEFERRED — R9-X** |
| **Invalid** | Revoke after REVOKED; grant to non-DOCTOR partner (existing rule) |
| **Idempotency** | Optional `request_id` on grant; duplicate grant returns existing ACTIVE for same tuple **ED-R9-03** |
| **PHI** | Grant row = sensitive operational; no artifact payload |
| **RLS** | Existing `consent_grants_access` |

#### ClinicalAccessAudit / HealthArtifactAccessAudit

| Attribute | Value |
|-----------|-------|
| **Owner** | Clinical / health |
| **Append-only** | No UPDATE/DELETE policies |
| **PHI** | reason code only; never payload |
| **RLS** | Subject, doctor, platform admin read |

### 5.3 Services

| Service | Responsibility |
|---------|----------------|
| `HealthTimelineService` | Project/list timeline; cursor pagination |
| `HealthArtifactService` | Resolve artifact → delegate payload URL/stream |
| `HealthAccessService` | `assertCanReadArtifact(actor, artifactId, purpose)` |
| `ConsentService` | Unchanged grant/revoke; add `assertScopeIncludes(grant, artifactType)` |
| `ClinicalAccessService` | Extend `evaluateForArtifactRead()` |
| `BreakGlassBridgeService` | On break-glass open → create time-boxed `ConsentGrant` purpose `break_glass` **ED-R9-01** |

### 5.4 Controllers (summary — full inventory §7)

| Controller | Audience |
|------------|----------|
| `HealthController` | Customer + doctor JWT |
| `AdminHealthController` | Platform admin / country admin |

### 5.5 Resolution strategy

| Dimension | Resolution |
|-----------|------------|
| **Tenant** | Patient `person_id` is primary scope; org context from artifact FK |
| **Country** | From artifact booking / consent `country_id`; pack gates |
| **Organization** | Lab/imaging org for worker reads; not required for patient self-read |
| **Actor** | JWT `personId`; doctor via `Partner` DOCTOR type |

### 5.6 Idempotency

| Operation | Key |
|-----------|-----|
| Timeline projection | `timeline:{source}:{source_id}` |
| Grant consent | `request_id` header optional; `(subject, recipient, purpose)` dedupe **ED-R9-03** |
| Artifact read audit | `read:{artifact_id}:{actor_id}:{minute_bucket}` — log every read; dedupe notifications only |
| Break-glass bridge | `break_glass_consent:{break_glass_grant_id}` |

### 5.7 Audit strategy

Every artifact **payload** read writes `health_artifact_access_audits` + `security_events` type `HEALTH_ARTIFACT_READ` with `{artifact_id, artifact_type, allowed, reason}` — never findings/Rx body.

### 5.8 Notification strategy

PHI-minimal outbox only (§15). No clinical content in push/email/SMS body.

### 5.9 Finance / logistics

**None.** R9 does not create finance facts or logistics jobs. Physical report delivery remains R7-F/R8-F.

---

## 6. Database plan (proposed — not implemented)

`worldpharma_app` remains **NOSUPERUSER + NOBYPASSRLS**. Additive migrations only. **No `USING(true)`** policies.

### 6.1 `health_timeline_events` (NEW)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | uuidv7 |
| `person_id` | UUID FK → persons | Data subject |
| `country_id` | UUID FK → countries | Residency hint |
| `event_type` | enum | `ARTIFACT_PUBLISHED`, `ARTIFACT_SUPERSEDED`, `CONSENT_GRANTED`, `CONSENT_REVOKED` |
| `artifact_id` | UUID FK → health_artifacts NULL | When applicable |
| `artifact_type` | HealthArtifactType NULL | Denormalized for list |
| `source_module` | text | `lab`, `radiology`, `prescription` |
| `source_id` | UUID | Booking id / prescription id |
| `title` | text | Non-sensitive display title |
| `status` | enum | `ACTIVE`, `SUPERSEDED` |
| `occurred_at` | timestamptz | Sort key |
| `sandbox` | bool | default true |
| `created_at` | timestamptz | |

**Unique:** `(source_module, source_id, event_type)` WHERE status = ACTIVE  
**Indexes:** `(person_id, occurred_at DESC)`, `(artifact_id)`  
**RLS:** FORCE RLS; `USING (app.can_person(person_id) OR app.is_platform())`; doctor list via **application** consent filter  
**Audit:** Append-only inserts; no UPDATE except status SUPERSEDED

### 6.2 `health_artifact_access_audits` (NEW)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `country_id` | UUID FK | |
| `artifact_id` | UUID FK → health_artifacts | |
| `actor_person_id` | UUID FK | |
| `patient_person_id` | UUID FK | |
| `doctor_partner_id` | UUID FK NULL | |
| `purpose` | text | e.g. `treatment`, `break_glass` |
| `allowed` | bool | |
| `reason` | text | Deny reason code |
| `request_id` | text NULL | |
| `created_at` | timestamptz | |

**Indexes:** `(patient_person_id, created_at)`, `(doctor_partner_id, created_at)`, `(artifact_id, created_at)`  
**RLS:** FORCE RLS; SELECT: subject, actor, platform; INSERT: actor present; UPDATE/DELETE: deny policy  
**History:** Immutable

### 6.3 `health_artifacts` (EXTEND — additive columns only)

| Column | Purpose |
|--------|---------|
| `country_id` | UUID FK NULL → backfill from booking |
| `prescription_id` | UUID FK NULL unique |
| `prescription_version_id` | UUID FK NULL unique |
| `title` | Non-sensitive list title |
| `status` | `ACTIVE` / `SUPERSEDED` — default ACTIVE |

Extend `HealthArtifactType` enum: `PRESCRIPTION_STRUCTURED`  
Extend CHECK constraint for type/payload FK consistency  
**RLS:** Extend policy — no permissive rewrite; keep patient `can_person`

### 6.4 `consent_grants` (EXTEND — optional)

| Column | Purpose |
|--------|---------|
| `notice_version` | text NULL |
| `break_glass_grant_id` | UUID FK NULL → break_glass_grants |

No destructive enum migration for status in R9-A; validate purposes in application layer **ED-R9-02**.

### 6.5 Migration sequence (future)

1. `r9a_health_timeline_events` — table + RLS  
2. `r9a_health_artifact_access_audits` — table + RLS  
3. `r9b_health_artifacts_prescription_fk` — enum + columns + constraint + RLS patch  
4. `r9e_backfill_timeline_from_artifacts` — data migration script in migration SQL  

---

## 7. API inventory (proposed — not implemented)

Base path: `/api/v1`. All routes JWT unless noted.

### 7.1 Patient health timeline

| Method | Route | Actor | Purpose | AuthZ | Request | Response | PHI | Idempotency | Errors |
|--------|-------|-------|---------|-------|---------|----------|-----|-------------|--------|
| GET | `/health/timeline` | Customer | List own timeline | `personId` = subject | `?cursor&limit&types[]` | `{items[], next_cursor}` | Metadata only | N/A | 401, 403 |
| GET | `/health/artifacts/:id` | Customer | Artifact metadata | Own artifact | — | `{id, type, title, published_at, source}` | Metadata | N/A | 401, 403, 404 |
| GET | `/health/artifacts/:id/payload` | Customer | Signed URL / stream | Own artifact | — | `{url, expires_at, content_type}` | **PHI** | N/A | 401, 403, 404, 409 not published |

### 7.2 Doctor patient health

| Method | Route | Actor | Purpose | AuthZ | Request | Response | PHI | Idempotency | Errors |
|--------|-------|-------|---------|-------|---------|----------|-----|-------------|--------|
| GET | `/health/patients/:patientPersonId/timeline` | Doctor | List patient timeline | Relationship + ACTIVE consent + purpose | `?purpose&cursor&limit` | `{items[], next_cursor}` | Metadata | N/A | 401, 403 consent_missing, 404 |
| GET | `/health/patients/:patientPersonId/artifacts/:id` | Doctor | Metadata | Same + artifact scope | `?purpose` | metadata | Metadata | N/A | 403, 404 |
| GET | `/health/patients/:patientPersonId/artifacts/:id/payload` | Doctor | Payload | Same + audit log | `?purpose` | `{url, expires_at}` | **PHI** | Read audit dedupe | 403 revoked, 410 expired consent |

### 7.3 Consent (existing — document for R9)

| Method | Route | Actor | Purpose | AuthZ | Request | Response | PHI | Idempotency | Errors |
|--------|-------|-------|---------|-------|---------|----------|-----|-------------|--------|
| POST | `/consent/grants` | Customer | Grant | Subject only | `{recipient_partner_id, purpose, scope?, organization_id?, expires_at?}` | ConsentGrant | Operational | request_id | 400, 403, 404 |
| POST | `/consent/grants/:id/revoke` | Customer | Revoke | Subject only | — | ConsentGrant | Operational | — | 403, 404 |
| GET | `/consent/grants` | Customer | List own | Subject | — | `{consents[]}` | Operational | N/A | 401 |

**R9-C enhancement:** validate `scope` against `HealthArtifactType[]`; reject unknown purposes not in pack allowlist.

### 7.4 Clinical access (existing)

| Method | Route | Actor | Purpose | AuthZ | Request | Response | PHI | Idempotency | Errors |
|--------|-------|-------|---------|-------|---------|----------|-----|-------------|--------|
| POST | `/clinical/access/evaluate` | Doctor | Pre-check access | Doctor JWT | `{patient_person_id, purpose, country_code}` | `{allowed, reason}` | No | N/A | 401, 403 |

### 7.5 Admin health governance

| Method | Route | Actor | Purpose | AuthZ | Request | Response | PHI | Idempotency | Errors |
|--------|-------|-------|---------|-------|---------|----------|-----|-------------|--------|
| GET | `/admin/health/consent-grants` | Platform/country admin | Consent audit list | `clinical:audit:read` | `?country&status&cursor` | metadata list | Operational | N/A | 403 |
| GET | `/admin/health/access-audits` | Admin | Payload access audit | `clinical:audit:read` | filters | audit rows | No payload | N/A | 403 |
| GET | `/admin/health/break-glass` | Admin | Break-glass queue | `security:break_glass` read | `?active_only` | grants + linked consent | Operational | N/A | 403 |
| POST | `/admin/health/break-glass/:grantId/review` | Admin | Mark reviewed | `security:break_glass` | `{review_notes}` | status | Operational | review_id | 403, 404 |

**Note:** Existing `POST /admin/company-authority/break-glass` remains; R9-E adds bridge side-effect.

### 7.6 Payload delegation (internal — not new public routes)

`HealthArtifactService` delegates to existing:

- `LabReportService.customerReport(personId, bookingId)`  
- `InterpretationService.customerReport(personId, bookingId)`  
- `PrescriptionService.customerPrescription(personId, prescriptionId)` (new read wrapper in R9-E)

---

## 8. Complete UI inventory

### 8.1 Web — `web-customer`

| App | Route | Screen | Actor | Purpose | API deps | States | Permissions | PHI | Mobile parity |
|-----|-------|--------|-------|---------|----------|--------|-------------|-----|---------------|
| web-customer | `/health` | Health home / timeline | Customer | Unified artifact feed | `GET /health/timeline` | §9 | Authenticated | Metadata | **Required** |
| web-customer | `/health/artifacts/[id]` | Artifact detail | Customer | Metadata + open report | `GET /health/artifacts/:id`, `GET .../payload` | §9 | Own only | Payload on action | **Required** |
| web-customer | `/account/consent` | Consent management | Customer | Grant/revoke (existing — enhance scope display) | consent APIs | §9 | Authenticated | No | **Required** (exists) |
| web-customer | `/account/consent/grant` | Grant consent form | Customer | Explicit grant flow | POST grant, care doctors | §9 | Authenticated | No | **Required** (split from list in R9-B) |

**Navigation:** Add primary nav item **Health** → `/health` (shell `customer-shell.tsx`).

### 8.2 Web — `web-doctor`

| App | Route | Screen | Actor | Purpose | API deps | States | Permissions | PHI | Mobile parity |
|-----|-------|--------|-------|---------|----------|--------|-------------|-----|---------------|
| web-doctor | `/patients/[patientPersonId]/health` | Patient health timeline | Doctor | Consent-gated timeline | timeline + evaluate | §9 | Doctor + relationship + consent | Metadata | **Required** |
| web-doctor | `/patients/[patientPersonId]/health/artifacts/[id]` | Patient artifact detail | Doctor | View report | artifact + payload | §9 | Consent purpose `treatment` | Payload | **Required** |
| web-doctor | `/encounters/[id]` | Encounter panel | Doctor | Access status (existing — link to health) | evaluate | existing | existing | No | existing |

### 8.3 Web — `web-admin`

| App | Route | Screen | Actor | Purpose | API deps | States | Permissions | PHI | Mobile parity |
|-----|-------|--------|-------|---------|----------|--------|-------------|-----|---------------|
| web-admin | `/governance/health/consents` | Consent grants audit | Admin | List/filter grants | admin consent API | §9 | `clinical:audit:read` | Metadata | N/A (admin web only) |
| web-admin | `/governance/health/access-audits` | Clinical access audit | Admin | Payload access log | access audits API | §9 | `clinical:audit:read` | No payload | N/A |
| web-admin | `/governance/health/break-glass` | Break-glass review | Admin | Review active break-glass | break-glass APIs | §9 | `security:break_glass` | No | N/A |

### 8.4 Android + iOS — `mobile` (customer RN)

| Screen ID | Navigation | Actor | Purpose | API | States | PHI | Parity |
|-----------|------------|-------|---------|-----|--------|-----|--------|
| `health-home` | Tab: Health | Customer | Timeline list | `GET /health/timeline` | §9 | Metadata | Web `/health` |
| `health-artifact-detail` | Stack from timeline | Customer | Artifact detail + open | artifact + payload | §9 | Payload | Web `/health/artifacts/[id]` |
| `consent` | Account → Consent | Customer | Grant/revoke | consent APIs | §9 | No | Web `/account/consent` (exists) |
| `consent-grant` | Stack from consent | Customer | Grant form | POST grant | §9 | No | Web `/account/consent/grant` |

**Tab bar:** Add **Health** tab (do not auto-select first artifact).

### 8.5 Android + iOS — `mobile-doctor` (RN)

| Screen ID | Navigation | Actor | Purpose | API | States | PHI | Parity |
|-----------|------------|-------|---------|-----|--------|-----|--------|
| `patient-health-timeline` | From appointment detail → Health | Doctor | Patient timeline | patient timeline API | §9 | Metadata | Web doctor health |
| `patient-health-artifact` | Stack | Doctor | Artifact + payload | artifact APIs | §9 | Payload | Web doctor artifact |
| `appointment-detail` | Tab: Appointments | Doctor | Link to health (enhance) | evaluate | existing | No | existing |

### 8.6 Apps explicitly out of R9 UI scope

| App | Reason |
|-----|--------|
| web-lab, web-pathologist | R7 bounded context — no health timeline |
| web-radiology, web-radiologist | R8 bounded context |
| mobile-delivery, mobile-phlebotomist | No clinical payload visibility |
| web-store, mobile-store | Commerce only |
| web-join | Onboarding only |

### 8.7 Intentionally deferred screens

| Screen | Mark |
|--------|------|
| Customer upload health document | **DEFERRED — R10+** |
| Caregiver/proxy consent | **DEFERRED — R9-X** (OD-CUS-04) |
| Legal hold / redaction admin | **DEFERRED — R9-X** |
| Physical report POD in health timeline | **DEFERRED — R9-X** |

---

## 9. UI state matrix

For **every** screen in §8, implement:

| State | Behavior |
|-------|----------|
| **loading** | Skeleton / `LoadingState` |
| **empty** | `EmptyState` with CTA (e.g. book lab, grant consent) — not a substitute for missing screen |
| **success** | Populated list/detail |
| **validation** | Inline field errors on grant form |
| **401/session expired** | `SessionExpiredState` + re-auth |
| **403/forbidden** | `PermissionDeniedState`; doctor: show consent required CTA |
| **404/unavailable** | Artifact not found or not published |
| **network failure** | `NetworkErrorState` + retry |
| **generic API error** | Problem+json message |
| **retry** | Explicit retry button on recoverable errors |
| **destructive confirmation** | Revoke consent modal |

### Stateful workflows

| Workflow | Extra states |
|----------|--------------|
| Grant consent | transition pending, success toast, duplicate grant (show existing), policy unavailable |
| Revoke consent | pending, success, already revoked |
| Open payload | transition pending, signed URL success, expired URL retry |
| Doctor read | consent_missing, consent_expired, invalid transition (revoked mid-session) |
| Break-glass review | concurrent update on review mark |

---

## 10. Mobile parity matrix

| Web screen | Android (`mobile`) | iOS (`mobile`) | Navigation | API | Offline | A11y |
|------------|-------------------|----------------|------------|-----|---------|------|
| `/health` | `health-home` | `health-home` | Bottom tab | timeline GET | Show cached list + stale banner; no payload cache | Screen reader labels for type/date |
| `/health/artifacts/[id]` | `health-artifact-detail` | same | Stack | artifact + payload | Block payload offline | Open report button accessible name |
| `/account/consent` | `consent` | same | Account stack | consent | Queue revoke **DEFERRED — R9-X** | Existing |
| `/account/consent/grant` | `consent-grant` | same | Stack | grant POST | Disable submit offline | Doctor picker must not auto-select first doctor **ED-R9-04** |
| web-doctor patient health | `patient-health-timeline` | same | From appointment | timeline | List only offline | Same consent states as web |
| web-doctor artifact | `patient-health-artifact` | same | Stack | payload | No offline payload | — |

**Parity rule:** Any new R9 customer/doctor health screen ships in **web + Android + iOS** in the same sub-phase.

---

## 11. Security / RLS model

### 11.1 RBAC

| Permission | Roles | R9 use |
|------------|-------|--------|
| (implicit own) | Customer | Own timeline/payload |
| `health_artifact:read` | Doctor | Payload read with consent **ED-R9-05** |
| `clinical:audit:read` | country_admin, super_admin | Admin audit screens |
| `security:break_glass` | super_admin | Open + review break-glass |

### 11.2 ABAC rules (application layer)

1. Patient reads own artifacts — always (RLS + controller check).  
2. Doctor reads — ACTIVE `ClinicalRelationship` + ACTIVE `ConsentGrant` matching `purpose` + artifact type in `scope` (or scope empty = all types **ED-R9-06**).  
3. Revoke — immediate deny on next payload read; in-flight signed URL may expire naturally.  
4. Break-glass — `BreakGlassGrant` + bridged `ConsentGrant` purpose `break_glass` + mandatory audit.  
5. Admin — metadata only on audit screens; no default payload.

### 11.3 SoD

- Break-glass grantor ≠ subject patient (existing).  
- Doctor cannot grant consent on behalf of patient.  
- Lab/radiology workers use org RLS on `health_artifacts` — not doctor consent path.

### 11.4 Negative tests (required per sub-phase)

| Test | Assertion |
|------|-----------|
| A ↛ B | Customer A cannot read B timeline/artifact (404/403) |
| Wrong organization | Lab worker org X cannot read org Y artifact |
| Wrong country | Pack/country mismatch denies |
| Wrong actor | Non-doctor cannot call doctor timeline |
| Unassigned doctor | No relationship → deny |
| Expired session | 401 |
| Disabled pack | `health.enabled` false → 403 |
| Unauthorized admin | Missing `clinical:audit:read` → 403 |
| Revoked consent | Payload 403 after revoke |
| Break-glass expired | Deny after TTL |

---

## 12. PHI / healthcare data classification

| Artifact / row | Class | Read | Write | Verify | Publish | Amend | Cannot access |
|--------------|-------|------|-------|--------|---------|-------|---------------|
| Timeline list row | operational | Patient, doctor (metadata) | System | — | — | — | Delivery, CRM |
| HealthArtifact row | sensitive pointer | Patient, consent doctor | Source module | — | R7/R8 publish | — | Rider |
| Lab report payload | PHI | Patient, consent doctor | R7 pathology | Pathologist | R7-E | Amendment new version | Admin default, support |
| Imaging report payload | PHI | Patient, consent doctor | R8 radiology | Radiologist | R8-E | Amendment **DEFERRED** | Rider |
| Prescription payload | PHI | Patient, consent doctor | R5 doctor | Pharmacist verify path | R5 sign | R5 amend | Marketplace |
| ConsentGrant row | sensitive operational | Subject, recipient doctor, admin | Subject | — | — | Revoke subject | Other patients |
| Access audit row | operational | Subject, admin | System | — | — | — | No payload |
| Notifications | operational | Recipient | — | — | — | — | No clinical text |

**Rule:** Outbox/notifications use opaque IDs + generic copy ("New lab report available").

---

## 13. Finance / payments boundary

| Interaction | R9 behavior |
|-------------|-------------|
| Sandbox payment | **None** — no new payables |
| Finance facts | **None** |
| Settlement | **None** |
| Live money | **OFF** |
| Report delivery fees | Stays R7-F/R8-F — not surfaced in health timeline v1 |

---

## 14. Logistics

R9 **does not** create logistics jobs.

| Topic | R9 stance |
|-------|-----------|
| Job types | None new |
| Rider visibility | **No** health timeline or clinical payload |
| Physical report | Remains sealed-parcel metadata in delivery app (R7-F/R8-F) |

---

## 15. Notifications

| Event name | Trigger | Recipient | Payload class | PHI | Occurrence key |
|------------|---------|-----------|---------------|-----|----------------|
| `HEALTH_ARTIFACT_PUBLISHED` | Timeline projection | Patient | operational | No body | `health_pub:{artifact_id}` |
| `CONSENT_GRANTED` | Existing | Doctor (optional) | operational | No | `granted:{consent_id}` |
| `CONSENT_REVOKED` | Existing | Doctor (optional) | operational | No | `revoked:{consent_id}` |
| `HEALTH_ARTIFACT_SHARED_READ` | Doctor first payload read in session | Patient **OD-R9-01** | operational | No | `read_notify:{audit_id}` |
| `BREAK_GLASS_HEALTH_OPENED` | Bridge consent created | Patient **LEGAL** | operational | No | `bg_health:{grant_id}` |

---

## 16. Test architecture

### 16.1 Per sub-phase gates

Each **CR-R9-*-IMPL** must include:

- Focused e2e for that sub-phase  
- RLS tests (NOSUPERUSER, NOBYPASSRLS, no `USING(true)` on new tables)  
- Authorization negative matrix (§11.4)  
- Idempotency tests (projection, grant dedupe)  
- State-machine tests (revoke stops read)  
- PHI leakage tests (grep JSON responses for analyte/finding patterns)  
- Migration verification (`prisma migrate status`)  
- Regression slice R0–R8 for touched kernels  

### 16.2 Full-suite regression

- Target: 3× full API suite green before R9 closure  
- Book 169 debt: shared-DB `policyPack` pollution, `order.e2e` timeout under load — **documented, not fixed in planning CR**  
- **ED-R9-07:** R9 impl sub-phases should add suite-level `beforeAll` pack isolation where touching policy — does not replace global debt fix (**OD-R9-10**)

### 16.3 Suggested e2e files (future)

- `r9a.health-timeline.e2e.spec.ts`  
- `r9c.consent-revoke-access.e2e.spec.ts`  
- `r9d.doctor-health-read.e2e.spec.ts`  
- `r9e.break-glass-health.e2e.spec.ts`  
- `r9f.prescription-artifact-projection.e2e.spec.ts`  

---

## 17. Runtime verification

Future implementation must record:

| Surface | Requirement | Status vocabulary |
|---------|-------------|-------------------|
| API local | `nest start` + e2e | `RUNTIME_PASS` / fail |
| web-customer health | Browser manual or Playwright | `RUNTIME_PASS` / `BROWSER_RUNTIME_NOT_VERIFIED` |
| web-doctor health | Same | Same |
| web-admin governance | Same | Same |
| Android emulator | Health tab + consent | `RUNTIME_PASS` / `MOBILE_RUNTIME_NOT_VERIFIED` |
| iOS simulator | Same | Same |

**Build success ≠ runtime success.**

---

## 18. Sub-phase design

### R9-A — Health record kernel (backend + DB)

| Item | Scope |
|------|-------|
| **Backend** | `health` module; timeline service; projection from existing artifacts; patient timeline APIs |
| **Database** | `health_timeline_events`, `health_artifact_access_audits`; migrations + RLS |
| **APIs** | `GET /health/timeline`, `GET /health/artifacts/:id`, `GET /health/artifacts/:id/payload` (delegate lab/imaging) |
| **Web UI** | None |
| **Mobile** | None |
| **Security** | RLS FORCE; patient-only; access audit on payload |
| **Tests** | r9a e2e; RLS; PHI grep on list |
| **Accept** | Patient can list timeline with lab+imaging entries; payload opens; A↛B isolation |
| **Non-starts** | Doctor APIs, admin, prescription projection, UI |

**Authorization:** `CR-R9-A-IMPL-171` (recommended)

---

### R9-B — Customer Health tab (web + mobile parity)

| Item | Scope |
|------|-------|
| **Backend** | Policy gate `health.timeline_enabled`; minor API pagination polish |
| **Database** | None |
| **APIs** | Consume R9-A |
| **Web UI** | `/health`, `/health/artifacts/[id]`, consent grant split route; shell nav |
| **Android/iOS** | `health-home`, `health-artifact-detail`, `consent-grant`; Health tab |
| **Security** | UI 401/403 states |
| **Tests** | UI component tests; e2e customer journey |
| **Accept** | Web + mobile parity matrix §10 green for customer screens |
| **Non-starts** | Doctor, admin |

**Authorization:** `CR-R9-B-IMPL-172`

---

### R9-C — Consent scope enforcement + revoke stops access

| Item | Scope |
|------|-------|
| **Backend** | Scope validation; purpose allowlist; wire payload reads through `HealthAccessService` |
| **Database** | Optional `notice_version` on consent |
| **APIs** | Enhance consent + health payload paths |
| **Web UI** | Consent scope chips on grant form (web + mobile) |
| **Security** | Revoke → next payload 403 e2e |
| **Tests** | r9c consent-revoke-access |
| **Accept** | Book 93 "revoke stops next access" |
| **Non-starts** | Doctor timeline UI, break-glass |

**Authorization:** `CR-R9-C-IMPL-173`

---

### R9-D — Doctor patient health access (web + mobile-doctor)

| Item | Scope |
|------|-------|
| **Backend** | Doctor timeline + artifact + payload APIs |
| **APIs** | §7.2 |
| **Web UI** | web-doctor patient health routes |
| **Mobile** | mobile-doctor patient health screens |
| **Security** | relationship + consent + audit every payload read |
| **Tests** | r9d doctor-health-read; negative matrix |
| **Accept** | Doctor with consent sees metadata + payload; without consent denied |
| **Non-starts** | Admin, prescription |

**Authorization:** `CR-R9-D-IMPL-174`

---

### R9-E — Prescription artifact projection

| Item | Scope |
|------|-------|
| **Backend** | On R5 signed Rx → `HealthArtifact` + timeline event; payload delegate |
| **Database** | `health_artifacts` prescription FKs; enum extension |
| **APIs** | Health payload branch for PRESCRIPTION_STRUCTURED |
| **Web/Mobile** | Timeline shows Rx entries (no new screens) |
| **Tests** | r9f projection e2e |
| **Accept** | Signed sandbox Rx appears in patient timeline |
| **Non-starts** | Upload Rx, consult notes |

**Authorization:** `CR-R9-E-IMPL-175`

---

### R9-F — Admin audit + break-glass clinical bridge + closure

| Item | Scope |
|------|-------|
| **Backend** | `BreakGlassBridgeService`; admin audit controllers |
| **Database** | `break_glass_grant_id` on consent; optional review columns |
| **APIs** | §7.5 |
| **Web UI** | web-admin governance health screens |
| **Security** | break_glass consent TTL; admin metadata only |
| **Tests** | r9e break-glass-health; full regression 3× |
| **Accept** | Admin lists consents + access audits; break-glass creates reviewable grant; R9 acceptance §21 |
| **Non-starts** | R10 |

**Authorization:** `CR-R9-F-IMPL-176`

---

## 19. Production boundary (remains OFF throughout R9)

- Live PSP / live money / bank payouts  
- Real carriers  
- Production healthcare / production PACS / DICOM archive  
- LIS/HIS  
- Live e-Rx  
- Automatic refill  
- Production LiveKit  
- Recording / recording artifacts  
- PHI in notifications/search/CRM  
- `USING(true)` RLS policies on new tables  

---

## 20. Open decisions

| ID | Type | Question |
|----|------|----------|
| **OD-R9-01** | LEGAL | Must patient be notified when doctor first reads artifact under consent? |
| **OD-R9-02** | LEGAL | Must patient be notified on break-glass health access? (extends OD-EHR-06) |
| **OD-R9-03** | PRODUCT | Default consent duration per purpose (extends OD-EHR-03) |
| **OD-R9-04** | PRODUCT | Empty scope = all artifact types vs deny-by-default |
| **OD-R9-05** | CLINICAL | Which purposes allow imaging vs lab vs Rx reads |
| **OD-R9-06** | LEGAL | Controller/processor labeling for health timeline (OD-EHR-01/02) |
| **OD-R9-07** | PRODUCT | Show physical delivery status in health timeline? |
| **OD-R9-08** | CLINICAL | Include cancelled/aborted bookings in timeline? |
| **OD-R9-09** | LEGAL | Patient export/portability in R9 vs later (OD-EHR-03) |
| **OD-R9-10** | ENGINEERING | Global shared-DB test isolation fix schedule |

---

## 21. Engineering defaults

| ID | Default |
|----|---------|
| **ED-R9-01** | Break-glass bridge creates `ConsentGrant` purpose `break_glass`, TTL = min(break_glass_grant.ttl, 4h), scope = all types |
| **ED-R9-02** | Validate purposes against pack list: `consultation`, `telemedicine`, `treatment`, `break_glass` |
| **ED-R9-03** | Duplicate ACTIVE grant same (subject, recipient, purpose) returns existing row |
| **ED-R9-04** | Doctor picker requires explicit selection — no auto-first |
| **ED-R9-05** | Doctor payload read requires purpose `treatment` or `consultation` |
| **ED-R9-06** | Empty consent scope = `['LAB_REPORT','IMAGING_REPORT','PRESCRIPTION_STRUCTURED']` until OD-R9-04 resolved |
| **ED-R9-07** | R9 e2e suites reset published pack fixture in `beforeAll` |
| **ED-R9-08** | Timeline sorted `occurred_at DESC`, page size 20 |
| **ED-R9-09** | Payload via short-lived signed URL only — no inline base64 in JSON |
| **ED-R9-10** | Sandbox flag remains true on all R9 rows |

---

## 22. Existing technical debt (from Book 169 — not fixed in this CR)

| Debt | Impact on R9 |
|------|--------------|
| Shared-DB policyPack pollution | Flaky full-suite; use isolated e2e + ED-R9-07 |
| `order.e2e` timeout under load | Monitor in R9-F regression |
| `BROWSER_RUNTIME_NOT_VERIFIED` | R9-B/F must attempt browser runtime |
| `MOBILE_RUNTIME_NOT_VERIFIED` | R9-B/D must attempt emulator runtime |
| Consent state machine simpler than Book 16 | Documented; PENDING deferred |
| `BreakGlassGrant` not linked to clinical consent | R9-F bridge |
| Prescriptions not in HealthArtifact | R9-E |

---

## 23. R9 acceptance criteria (closure — after R9-F)

- [ ] Patient timeline lists LAB_REPORT, IMAGING_REPORT, PRESCRIPTION_STRUCTURED (sandbox)  
- [ ] Patient payload read works; list APIs leak no PHI  
- [ ] Customer web + mobile Health tab parity complete  
- [ ] Grant/revoke consent; revoke blocks next doctor payload read  
- [ ] Doctor timeline + payload with relationship + consent; denied without  
- [ ] Admin consent list + access audit + break-glass review (metadata only)  
- [ ] RLS FORCE on new tables; `worldpharma_app` NOBYPASSRLS; zero `USING(true)` on new policies  
- [ ] Notifications PHI-minimal  
- [ ] No R7/R8 lifecycle regressions  
- [ ] No live money / production healthcare paths  
- [ ] Focused R9 e2e + 3× full API regression (best effort; OD-R9-10 tracked)  
- [ ] Runtime verification recorded per §17  
- [ ] Books 170 + index + roadmap updated at R9-F closure  

---

## 24. Recommended next authorization

**Next CR:** `CR-R9-A-IMPL-171` — Health record kernel (backend + DB + patient APIs only).

Do **not** start R9-B UI until R9-A acceptance gates pass.

---

## 25. Document control

| Field | Value |
|-------|-------|
| Author | CR-R9-AUTH-170 |
| Verdict | **R9_PLAN_READY** |
| Implementation | **NOT AUTHORIZED** |
