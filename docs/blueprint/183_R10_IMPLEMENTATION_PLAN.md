# 183 — R10 Care navigation + health record expansion implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R10-PLANNING-183**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R10_PLAN_READY**

**Prerequisite:** R9 closed — **R9_GREEN_CLOSED_R10_READY_FOR_PLANNING** ([182](182_POST_R9_FINAL_CLOSURE_AUDIT.md)). R7 closed ([154](154_POST_R7_FINAL_CLOSURE_AUDIT.md)). R8-F closed ([169](169_POST_R8_F_AUDIT.md)). R4 sandbox video implemented ([107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md)).

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) · [170](170_R9_IMPLEMENTATION_PLAN.md) · [16](16_HEALTH_RECORD.md) · [71](71_HEALTH_RECORD_CONSENT.md) · [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) · [27](27_SECURITY_ARCHITECTURE.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · `packages/database/prisma/schema.prisma` · `apps/api/src/health/*` · `apps/api/src/clinical/*`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R10-A implementation. **Do not** plan R11+. **Do not** enable live PSP/carriers/payouts, production LiveKit, recording, live e-Rx, automatic refill, production healthcare, LIS/HIS, or production PACS.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R10** wave so future **CR-R10-*-IMPL** work can deliver Book 93 acceptance:

> **Symptom/voice intake → clarify → red-flag → urgency → specialty + explanation → match → appointment/tele handoff — sandbox, pack-off by default, not diagnosis, no auto-Rx.**

…without duplicating identity, consent, health-record, appointment, video, payment, logistics, finance, notification, audit, or tenant/RLS kernels; **without** modifying R7/R8/R9 bounded contexts except additive read/handoff hooks; **without** building a hospital EMR or autonomous diagnosis system.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R10 IMPL authorization | Requires future **CR-R10-*-IMPL-*** |
| R11+ planning | Explicit hard stop |
| Autonomous diagnosis / auto-prescribe | Book 92 §3, Book 93 §R10 |
| ML/NLP vendor integration without OD-CARE-01 | Legal gate |
| LIS/HIS / production PACS / live e-Rx / automatic refill | Production boundary |
| Live money / carriers / payouts | **R14** + legal |
| Second payment / logistics / notification / consent kernel | Kernel lock |
| Full Book 16 artifact catalog in one wave | Phased; most types deferred |
| CRM 360 clinical payloads | Book 16 / 71 separation |
| Modifying R0–R9 implementation except additive hooks | Hard stop |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated, fail-closed — build when IMPL-authorized |
| **LEGAL** | Human/legal gate — blocks enablement, not necessarily planning |
| **CLINICAL** | Clinical policy / SoD — pack or committee |
| **PRODUCT** | Product decision — document as OD-R10-* if unresolved |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Canonical current state (verified 29 Aug 2026)

| Claim | Verified | Evidence |
|-------|----------|----------|
| R0–R6 sandbox complete | **YES** | Books 51–139; [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) |
| R7 CLOSED | **YES** | [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) |
| R8-A…R8-F complete sandbox | **YES** | Books 156–169 |
| R9-A…R9-F CLOSED | **YES** | [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) |
| R4 sandbox video | **YES** | [107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md); `video.service.ts` |
| Care navigation code | **NO** | No `care-nav` / `CareSession` modules in `apps/api/src` |
| Live money OFF | **YES** | Mock PSP; sandbox finance |
| Production healthcare OFF | **YES** | `sandbox: true` on clinical rows |
| 77 migrations applied | **YES** | Book 182 verification |

---

## 2. Current-state inventory (repository audit)

### 2.1 Health record

| Capability | State | Evidence |
|------------|-------|----------|
| `HealthTimelineEvent` + list API | **COMPLETE** | `health-timeline.service.ts`; `GET /health/timeline` |
| `HealthArtifact` table + RLS | **COMPLETE** | `schema.prisma`; migration `20260829160000_r9a` |
| `LAB_REPORT` projection | **COMPLETE** | R7-E `pathology.service.ts` → `HealthPrescriptionProjection` pattern |
| `IMAGING_REPORT` projection | **COMPLETE** | R8-E `interpretation.service.ts` |
| `PRESCRIPTION_STRUCTURED` projection | **COMPLETE** | R9-E `health-prescription-projection.service.ts` |
| Artifact metadata API | **COMPLETE** | `health.controller.ts` |
| Artifact payload access (patient) | **COMPLETE** | Consent-gated via `HealthArtifactService` |
| Doctor artifact read | **COMPLETE** | `health-doctor.controller.ts`; `assertCanReadArtifactPayload` |
| `health_artifact_access_audits` | **COMPLETE** | Append-only; FORCE RLS |
| Customer Health web | **COMPLETE** | `web-customer` `/health`, `/health/artifacts/[id]` |
| Customer Health mobile | **COMPLETE** | `mobile` `health-features.tsx`, `health-api.ts` |
| Doctor Health web | **COMPLETE** | `web-doctor` health routes |
| Doctor Health mobile-doctor | **COMPLETE** | `mobile-doctor` `health-features.tsx` |
| Admin consent governance | **COMPLETE** | `admin-health.controller.ts`; web-admin `/governance/health/*` |
| Admin access-audit list | **COMPLETE** | Metadata-only DTOs |
| Break-glass clinical bridge | **COMPLETE** | `break-glass-bridge.service.ts`; R9-F |
| `CONSULT_NOTE` / `DOCUMENT` / uploads | **MISSING** | Not in `HealthArtifactType` enum |
| `ALLERGY` / `VACCINATION` / `MEDICATION_LIST` | **MISSING** | Book 16 catalog; not in schema |
| `PHYSICAL_REPORT_POD` in timeline | **DEFERRED** | R7-F/R8-F logistics exist; not projected (OD-R9-07) |
| Legal hold / redaction admin | **DEFERRED** | Book 170 §8.7 R9-X |
| Full Book 16 artifact lifecycle (`REDACTED`, `LEGAL_HOLD`) | **PARTIAL** | Only `ACTIVE` / `SUPERSEDED` in schema |

### 2.2 Consent

| Capability | State | Evidence |
|------------|-------|----------|
| Grant / revoke API | **COMPLETE** | `consent.service.ts`; `POST/GET /consent/grants` |
| Scope validation | **COMPLETE** | `consent-scope.ts`; R9-C |
| Purpose allowlist | **COMPLETE** | `consultation`, `telemedicine`, `treatment`, `break_glass` |
| Doctor relationship gate | **COMPLETE** | `ClinicalAccessService.evaluate()` |
| Break-glass + review | **COMPLETE** | R9-F |
| Expiry enforcement | **COMPLETE** | Server-side re-load; e2e |
| PHI-minimal notifications | **COMPLETE** | Outbox + security events |
| Access audit trail | **COMPLETE** | `ClinicalAccessAudit` + `health_artifact_access_audits` |
| Caregiver/proxy grants | **DEFERRED** | OD-EHR-05, OD-CUS-04; Book 182 |
| PENDING / DENIED consent states | **DEFERRED** | Book 170 §5 R9-X |
| Mobile queue revoke UX | **DEFERRED** | Book 170 §10 R9-X |

### 2.3 Clinical domains (unchanged by R10 plan)

| Domain | State | Evidence |
|--------|-------|----------|
| Prescriptions (R5) | **COMPLETE** (sandbox) | `prescription.service.ts` |
| Lab booking → pathology (R7) | **COMPLETE** (sandbox) | `apps/api/src/lab/*` |
| Radiology/imaging (R8) | **COMPLETE** (sandbox) | `apps/api/src/radiology/*` |
| Appointments + encounters (R2) | **COMPLETE** | `appointment.service.ts` |
| Sandbox video (R4) | **COMPLETE** | `video.service.ts`; recording **OFF** |
| Physical report delivery (R7-F/R8-F) | **COMPLETE** | Finance/logistics hooks; not in health timeline |

### 2.4 Care navigation (R10 target)

| Capability | State | Evidence |
|------------|-------|----------|
| Symptom intake | **MISSING** | Book 92 §17 PLANNED |
| Structured follow-ups | **MISSING** | — |
| Red-flag / urgency rules | **MISSING** | OD-CARE-02 (pack CMS) |
| Specialty explanation | **MISSING** | — |
| Doctor/specialty matching | **PARTIAL** | `appointments.directory`, `slots` exist; no care-nav context |
| Appointment handoff | **PARTIAL** | `POST /appointments` exists; no care-nav session link |
| Tele handoff | **PARTIAL** | Video join on appointment; no care-nav link |
| Care-nav audit (admin) | **MISSING** | — |
| Clinician override | **MISSING** | — |
| Voice intake adapter | **DEFERRED** | Book 92 — architecture only in R10 |

### 2.5 Explicitly deferred from R9 (Book 170 / 182)

| Item | Tag | Source |
|------|-----|--------|
| Consult notes, uploads, allergies, vaccines | R10+ optional | Book 170 §3 |
| Customer health document upload | R10 optional | Book 170 §8.7 |
| Caregiver/proxy consent | **Blocked — legal** | OD-CUS-04, OD-EHR-05 |
| Physical report POD in timeline | R10-X / later | OD-R9-07 |
| Legal hold / redaction admin | R10-X / later | Book 170 §8.7 |
| Care navigation | **R10 core** | Book 93 §R10 |

### 2.6 Technical debt (from Book 182)

| ID | State | R10 classification |
|----|-------|---------------------|
| OD-R9-10 shared-DB test isolation | **NON-BLOCKING** | R10 prerequisite for reliable regression |
| BROWSER_RUNTIME_NOT_VERIFIED | **NON-BLOCKING** | R10 runtime gate must attempt browser |
| ANDROID_RUNTIME_NOT_VERIFIED | **NON-BLOCKING** | R10 runtime gate must attempt emulator |
| IOS_RUNTIME_NOT_VERIFIED | **NON-BLOCKING** | Document per host |
| OD-R9-01…09, OD-EHR-01/02 | **LEGAL/PRODUCT OPEN** | Do not block care-nav sandbox; block production enablement |

---

## 3. Canonical R10 scope

Book [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) defines **R10 = Care Navigation**. Book [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) deferred health-record expansion items to **R10+ optional** sub-phases — not automatic inclusion.

### 3.1 Scope classification

| Tier | Contents |
|------|----------|
| **R10 core** | Care navigation kernel, customer intake UX, rules-based triage, red-flag handling, specialty match + explanation, appointment/tele handoff, admin/doctor audit |
| **R10 optional** | Customer health document upload (`DOCUMENT`); encounter consult-note projection (`CONSULT_NOTE`) — separate IMPL authorization per sub-phase |
| **R10 deferred** | Caregiver/proxy; allergies/vaccines/full Book 16 catalog; POD timeline; legal hold admin; voice vendor; ML triage |
| **Blocked on legal/product** | Caregiver proxy (OD-EHR-05); production care-nav enablement (OD-CARE-01/02); controller/processor labeling (OD-EHR-01/02) |

### 3.2 Capability matrix

| Capability | Source requirement | Current state | R10 reason | Priority |
|------------|-------------------|---------------|------------|----------|
| Care intake session | Book 93 §R10; Book 92 §3 | MISSING | Canonical R10 wave | **P0 — core** |
| Rules-based triage (no ML v1) | OD-CARE-01 default rules | MISSING | Safe sandbox default | **P0 — core** |
| Red-flag / emergency guidance | Book 92 §3; OD-CARE-02 | MISSING | Safety requirement | **P0 — core** |
| Specialty + explanation | Book 93 §R10 | MISSING | User trust + audit | **P0 — core** |
| Doctor match + book handoff | Book 93 §R10; R2 appointments | PARTIAL | Completes care-nav loop | **P0 — core** |
| Teleconsult handoff | Book 93 §R10; R4 video | PARTIAL | Optional path when pack allows | **P1 — core** |
| Care-nav admin audit | Book 92 §17 | MISSING | Governance | **P1 — core** |
| Clinician override + audit | Book 92 §3 | MISSING | Human authority | **P1 — core** |
| Customer document upload | Book 16 §4.2; Book 170 deferred | MISSING | Health record expansion | **P2 — optional** |
| Consult note → HealthArtifact | Book 16 §4.2; Book 170 deferred | MISSING | Timeline completeness | **P2 — optional** |
| Caregiver/proxy access | Book 16 §6.3; OD-EHR-05 | DEFERRED | Legal model unresolved | **BLOCKED** |
| Allergies / vaccines / med list | Book 16 §4.2 | MISSING | Broader catalog | **DEFERRED R10-X** |
| POD in health timeline | OD-R9-07 | DEFERRED | Operational not clinical v1 | **DEFERRED R10-X** |

---

## 4. R10 bounded context

### 4.1 R10 owns

| Area | Responsibility |
|------|----------------|
| `CareNavigationSession` | Intake state machine, symptom capture, triage outcome |
| `CareTriageAssessment` | Rules output: urgency, specialty hints, red-flag flags (metadata) |
| `CareMatchRecommendation` | Ranked provider/specialty suggestions with explanation pointers |
| `CareNavAudit` | Append-only decision/override log (metadata; no full symptom PHI in events) |
| Customer care-nav UX | Web + mobile intake, follow-ups, emergency copy, match list |
| Admin care-nav audit UI | Session list, override review (metadata) |
| Country-pack triage rules | Red-flag patterns, emergency CTAs, specialty maps |

### 4.2 Delegated — do NOT duplicate

| Kernel | R10 usage |
|--------|-----------|
| **R7** lab/pathology | Unchanged; no new lab lifecycle |
| **R8** radiology | Unchanged; no imaging lifecycle |
| **R9** health record | Optional projection targets only; extend `HealthArtifactService` |
| **R9** consent | Extend purposes/scopes if needed; use `ConsentService` |
| **R9** access audit | Reuse `health_artifact_access_audits` for health reads |
| **R2** appointments | Handoff via `AppointmentService.book()` |
| **R4** video | Handoff via existing video join on booked appointment |
| Identity / JWT / RBAC | All actors |
| `PolicyResolver` | Pack gate `care_navigation.enabled` (default **off**) |
| `OutboxService` / `SecurityEventsService` | PHI-minimal care-nav events |
| Object store | Upload optional phase only; reuse signed-URL pattern from lab/imaging |

### 4.3 Service extension map

| Proposed service | Extend existing | Notes |
|------------------|-----------------|-------|
| `CareNavigationService` | **New** (care bounded context) | Orchestrates intake → triage → match |
| `CareTriageEnginePort` | **New port** | Rules adapter v1; ML adapter later (OD-CARE-01) |
| `CareMatchService` | **Extends** `AppointmentService.directory/slots` | No second doctor catalog |
| `CareNavHandoffService` | **Wraps** `AppointmentService.book` | Links session → appointment |
| `HealthUploadService` (optional) | **Extends** `HealthArtifactService` | R10-E only |
| `HealthConsultProjectionService` (optional) | **Extends** R9 projection pattern | R10-F only; source = encounter |

---

## 5. Sub-phase plan

### R10-A — Care navigation kernel (backend + DB)

| Field | Value |
|-------|-------|
| **Purpose** | Session aggregate, triage port, audit kernel, pack gate |
| **Backend** | `CareNavigationModule`; `CareNavigationService`; `RulesTriageEngine`; `CareNavAuditService` |
| **Database** | `care_navigation_sessions`, `care_triage_assessments`, `care_match_recommendations`, `care_nav_audits`; enums `CareNavSessionStatus`, `CareUrgencyLevel`; FORCE RLS |
| **API** | `POST /care-nav/sessions`, `POST .../answers`, `GET .../assessment`, `POST .../match`, `POST .../handoff/appointment` (stubs through handoff in R10-C) |
| **Web / mobile** | None (API-only) |
| **Security/RLS** | Patient owns session via `app.can_person`; worker for server transitions; no cross-patient SELECT |
| **PHI** | Intake text stored encrypted/at rest per object-store pattern; list APIs metadata-only |
| **Notifications** | `CARE_NAV_SESSION_STARTED` (opaque IDs only) |
| **Tests** | `r10a.care-nav-kernel.e2e.spec.ts`; RLS tenancy; state machine negatives |
| **Runtime** | API routes 401 without auth |
| **Depends** | R9 closed; R2 appointments read |
| **Accept** | Session lifecycle; triage rules return urgency; audit append-only; pack off → 403 |
| **Non-starts** | ML vendor; voice; UI; appointment booking; health upload |

### R10-B — Customer care-nav intake UX (web + mobile)

| Field | Value |
|-------|-------|
| **Purpose** | Patient-facing symptom intake, follow-ups, red-flag UX |
| **Backend** | Wire answer submission; red-flag pack resolver |
| **Database** | None (uses R10-A) |
| **API** | Consume R10-A |
| **Web** | `web-customer` `/care` or `/care/navigate` — intake, follow-up, emergency guidance |
| **Android / iOS** | `mobile` parity screens; same API client pattern as health |
| **Security** | Customer JWT only; session bound to `person_id` |
| **PHI** | Symptom text only in authorized session detail; not in push/outbox |
| **Tests** | Component tests; API integration via e2e |
| **Runtime** | **Required:** web-customer + mobile dev build exercise intake |
| **Depends** | R10-A |
| **Accept** | Web/mobile parity; loading/empty/error/retry/401/403 states per Book 170 §9 matrix |
| **Non-starts** | Match list booking; admin; voice capture implementation |

### R10-C — Match, explain, appointment/tele handoff

| Field | Value |
|-------|-------|
| **Purpose** | Specialty explanation, doctor match, book appointment, optional tele path |
| **Backend** | `CareMatchService`; `CareNavHandoffService` → `AppointmentService` |
| **Database** | `care_navigation_sessions.appointment_id` FK (additive) |
| **API** | `GET .../recommendations`, `POST .../handoff/appointment`, `GET .../handoff/status` |
| **Web / mobile** | Match list, explanation panel, book CTA → existing appointment flow |
| **Security** | Match uses public directory; booking uses existing appointment auth |
| **PHI** | Recommendations: provider metadata only; no clinical payloads |
| **Notifications** | `CARE_NAV_HANDOFF_BOOKED` (appointment id, no symptoms) |
| **Tests** | `r10c.care-nav-handoff.e2e.spec.ts`; no auto-Rx assertions |
| **Runtime** | Book sandbox appointment from care-nav flow |
| **Depends** | R10-A, R10-B; R2; R4 pack optional |
| **Accept** | Red-flag shows emergency guidance (pack); ordinary match books appointment; tele handoff when video pack on |
| **Non-starts** | Auto-prescribe; diagnosis language in API |

### R10-D — Admin audit + clinician override + closure

| Field | Value |
|-------|-------|
| **Purpose** | Governance, override, R10 regression + closure |
| **Backend** | `AdminCareNavController`; override with audit |
| **Database** | `care_nav_overrides` append-only |
| **API** | `GET /admin/care-nav/sessions`, `POST .../override` |
| **Web** | `web-admin` `/governance/care-nav` |
| **Android / iOS** | Doctor override: **web-doctor only v1** (see parity §12) |
| **Security** | `care_nav:audit:read`, `care_nav:override` permissions |
| **PHI** | Admin lists metadata-only (urgency, specialty, timestamps — not full symptom body in list) |
| **Tests** | Full R10 e2e; R9 regression; full API suite |
| **Runtime** | Admin list + override in browser |
| **Depends** | R10-A/B/C |
| **Accept** | Override audited; R10 closure gate (§22) |
| **Non-starts** | R11 CMS; CRM |

### R10-E — Customer health document upload (OPTIONAL — separate IMPL CR)

| Field | Value |
|-------|-------|
| **Purpose** | `DOCUMENT` / `PRESCRIPTION_UPLOAD` artifacts per Book 16 |
| **Backend** | `HealthUploadService`; extend `HealthArtifactType` enum |
| **Database** | `health_artifact_uploads` metadata; object key on artifact |
| **API** | `POST /health/uploads`, `GET /health/artifacts/:id/payload` (delegate) |
| **Web / mobile** | Upload UI on customer Health tab |
| **Security** | Patient-only upload; MIME/size validation; signed PUT URL |
| **Blocked if** | OD-EHR upload retention/classification unresolved — use ED-R10-03 sandbox defaults |
| **Non-starts** | OCR as authoritative; production antivirus vendor |

### R10-F — Encounter consult note projection (OPTIONAL — separate IMPL CR)

| Field | Value |
|-------|-------|
| **Purpose** | Project `CONSULT_NOTE` / patient summary to health timeline |
| **Backend** | `HealthConsultProjectionService` on encounter complete |
| **Database** | Add enum values; FK `encounter_id` on `health_artifacts` |
| **API** | Reuse R9 doctor/patient health routes |
| **Consent** | Extend scope types; doctor read requires consent + relationship |
| **Non-starts** | Modifying encounter clinical storage |

---

## 6. Health record expansion (optional R10-E/F)

### 6.1 Timeline event types (proposed — not in core R10)

| Event type | Source | Projection trigger |
|------------|--------|-------------------|
| `ARTIFACT_UPLOADED` | R10-E | Upload committed |
| `CONSULT_COMPLETED` | R10-F | Encounter `complete()` |
| `CARE_NAV_COMPLETED` | R10-A | Handoff success (metadata in timeline) |

### 6.2 Artifact types (optional phases only)

| Type | Lifecycle | Payload owner |
|------|-----------|---------------|
| `DOCUMENT` | ACTIVE → SUPERSEDED | Object store blob; patient upload |
| `PRESCRIPTION_UPLOAD` | ACTIVE; linked to verify case | Object store; non-authoritative OCR |
| `CONSULT_NOTE` | ACTIVE → SUPERSEDED | Encounter module delegate |

### 6.3 Projection pattern (unchanged from R9)

```
source domain (encounter / upload / R7-E / R8-E / R9-E)
  → workerTenantContext insert
  → HealthArtifact row
  → HealthTimelineEvent (metadata)
  → payload read via HealthArtifactService delegate + consent
```

**Idempotency:** `findUnique` on source version/id before create (R9-E pattern).  
**Amendment:** New artifact row; prior `SUPERSEDED` (no silent overwrite).

### 6.4 Break-glass interaction

Optional health artifacts use existing R9-F bridge. No second break-glass path. `break_glass` purpose + scope must include new types when added to `HEALTH_CONSENT_ARTIFACT_TYPES`.

---

## 7. Caregiver / proxy access

**Status: DEFERRED — BLOCKED on OD-EHR-05 and OD-CUS-04.**

Book [16](16_HEALTH_RECORD.md) §6.3 and [71](71_HEALTH_RECORD_CONSENT.md) require a legal proxy model before engineering. R10 **must not** implement household password sharing or implicit family access.

If authorized in a future CR after legal sign-off, minimum design constraints (planning placeholder only):

| Area | Requirement |
|------|-------------|
| Relationship | Explicit `CareProxyRelationship` with grantor patient, proxy person, legal basis |
| Authorization | Separate consent purpose `proxy_access`; scope per artifact type |
| Audit | All proxy reads logged; patient notified (OD-R9-01 pattern) |
| Isolation | Proxy cannot access unrelated patients; RLS on relationship |

**Do not implement in R10-A…D without OD-EHR-05 resolution.**

---

## 8. Uploads / user-generated health data (R10-E optional)

| Area | Plan |
|------|------|
| Allowed categories | `DOCUMENT`, `PRESCRIPTION_UPLOAD` only (Book 16) |
| Metadata | `mime_type`, `size_bytes`, `sha256`, `uploaded_at`, `classification` (pack) |
| Storage | Existing object-store pattern; `sandbox: true` |
| Authorization | Patient JWT; upload session scoped to `person_id` |
| Validation | MIME allowlist (pdf, jpeg, png); max size ED-R10-03 |
| Malware scan | **DEFERRED** — stub hook; no production vendor |
| Signed URLs | Short-lived PUT/GET; no public CDN |
| Ownership | `person_id` on artifact |
| Deletion | Soft-delete + retention class pointer (Book 19); legal hold blocks |
| Doctor access | Consent scope includes type; `assertCanReadArtifactPayload` |
| Audit | `health_artifact_access_audits` on payload read |

---

## 9. Timeline / artifact architecture

Canonical chain (preserved from R9):

```
Clinical domain (R5/R7/R8/encounter/upload)
  → projection service (worker tenant)
  → HealthArtifact (index)
  → HealthTimelineEvent (patient-visible metadata)
  → GET /health/artifacts/:id/payload (consent-gated PHI)
```

R10 care-nav sessions are **not** clinical artifacts. They link to appointments via FK. Only optional R10-E/F add artifact types.

**Care-nav PHI boundary:** Symptom intake text is sensitive; store with health-tier classification; never copy to CRM, marketing, or commerce search.

---

## 10. Security / RLS (R10-A entities)

### 10.1 `care_navigation_sessions`

| Control | Policy |
|---------|--------|
| Actor | Customer (owner), worker (transitions), platform (admin audit) |
| Ownership | `person_id` = patient |
| SELECT | `app.can_person(person_id)` OR `app.is_worker()` OR `app.is_platform()` |
| INSERT | `app.can_person(person_id)` |
| UPDATE | `app.is_worker()` OR owner during `DRAFT` status only |
| DELETE | **false** (append-only terminal states) |
| Break-glass | N/A — care-nav is not clinical payload store |

### 10.2 Mandatory negative test matrix (all R10 APIs)

| Case | Expected |
|------|----------|
| Patient A → patient B session | 403/404 |
| Doctor without override perm | 403 |
| Wrong org/country pack | 403 |
| Revoked/expired consent (health reads) | 403 |
| Expired break-glass | 403 |
| Unauthorized admin | 403 |
| Disabled `care_navigation` pack | 403 |
| Unauthenticated | 401 |
| Malformed UUID | 400/404; no PHI in body |

**No `USING(true)`.** `worldpharma_app` remains NOSUPERUSER + NOBYPASSRLS.

---

## 11. PHI model

| Surface | Classification | Clinical body allowed? |
|---------|----------------|------------------------|
| Care-nav session list (customer) | SENSITIVE | Titles/status only |
| Care-nav session detail (customer) | PHI | Symptom answers (authorized owner) |
| Match recommendations | OPERATIONAL | No |
| Emergency guidance | PUBLIC/OPERATIONAL | Pack copy only; no patient data |
| Admin care-nav list | OPERATIONAL | Metadata only |
| Admin session detail | SENSITIVE | Minimized; full text only if legal gate |
| Outbox / security events | OPERATIONAL | Opaque session/appointment IDs |
| Health upload payload | PHI | Authorized patient + consented doctor |
| Notifications | OPERATIONAL | No symptom text |

---

## 12. Web / mobile parity

### 12.1 Care navigation (core R10)

| Capability | Web (customer) | Android | iOS |
|------------|----------------|---------|-----|
| Start intake | R10-B | R10-B | R10-B |
| Follow-up questions | R10-B | R10-B | R10-B |
| Red-flag / emergency | R10-B | R10-B | R10-B |
| Specialty explanation | R10-C | R10-C | R10-C |
| Match + book | R10-C | R10-C | R10-C |
| Tele handoff CTA | R10-C | R10-C | R10-C |
| Admin audit list | web-admin | N/A | N/A |
| Doctor override | web-doctor | **DEFERRED v1** | **DEFERRED v1** |

**Reason for doctor mobile deferral:** Override is infrequent governance action; web-doctor sufficient for sandbox v1 (document in R10-D audit).

### 12.2 UI state matrix (required per screen)

loading · empty · error · retry · offline (best-effort) · session expiry · 401 · 403 · pack disabled

### 12.3 Health upload (optional R10-E)

| Capability | Web | Android | iOS |
|------------|-----|---------|-----|
| Upload document | R10-E | R10-E | R10-E |
| View uploaded artifact | R10-E | R10-E | R10-E |

---

## 13. API contract plan (core R10 — proposed)

Base: `/api/v1`. All routes JWT-required unless noted.

| Method | Route | Actor | PHI | Authz | Idempotency |
|--------|-------|-------|-----|-------|-------------|
| POST | `/care-nav/sessions` | Customer | SENSITIVE | `care_navigation` pack + customer JWT | `X-Idempotency-Key` |
| POST | `/care-nav/sessions/:id/answers` | Customer | PHI | Session owner | Per-question key |
| GET | `/care-nav/sessions/:id` | Customer | PHI | Session owner | — |
| GET | `/care-nav/sessions/:id/assessment` | Customer | OPERATIONAL | Session owner | — |
| GET | `/care-nav/sessions/:id/recommendations` | Customer | OPERATIONAL | Session owner | — |
| POST | `/care-nav/sessions/:id/handoff/appointment` | Customer | OPERATIONAL | Session owner + slot valid | Idempotency key |
| GET | `/admin/care-nav/sessions` | Admin | OPERATIONAL | `care_nav:audit:read` | cursor pagination |
| GET | `/admin/care-nav/sessions/:id` | Admin | SENSITIVE | `care_nav:audit:read` | minimized body |
| POST | `/admin/care-nav/sessions/:id/override` | Admin/Doctor | OPERATIONAL | `care_nav:override` | audit required |

**Errors:** 400 validation; 401 unauthenticated; 403 pack off / forbidden; 404 wrong patient; 409 invalid state transition.

**Audit events:** `CARE_NAV_SESSION_CREATED`, `CARE_NAV_TRIAGE_COMPLETED`, `CARE_NAV_HANDOFF_BOOKED`, `CARE_NAV_OVERRIDE_APPLIED`.

---

## 14. Database plan (R10-A — proposed, not implemented)

| Migration (proposed name) | Contents |
|---------------------------|----------|
| `20260829xxxx_r10a_care_nav_enums` | `CareNavSessionStatus`, `CareUrgencyLevel`, `CareNavHandoffType` |
| `20260829xxxx_r10a_care_nav_schema` | Tables + FKs + indexes |
| `20260829xxxx_r10a_care_nav_rls` | FORCE RLS; policies per §10 |

### Tables (logical)

**`care_navigation_sessions`:** `id`, `person_id`, `country_id`, `status`, `chief_complaint_summary` (truncated index safe), `urgency`, `specialty_code`, `appointment_id?`, `created_at`, `completed_at`

**`care_triage_assessments`:** `id`, `session_id`, `rules_version`, `urgency`, `red_flag`, `specialty_codes[]`, `explanation_key`, `created_at`

**`care_match_recommendations`:** `id`, `session_id`, `doctor_profile_id`, `rank`, `explanation_key`, `created_at`

**`care_nav_audits`:** append-only; `session_id`, `actor_id`, `action`, `metadata` (JSON, no PHI duplication)

**Indexes:** `(person_id, created_at DESC)`, `(country_id, status)`, `(session_id)` on child tables.

**CHECK:** `red_flag = true` implies `urgency IN ('EMERGENT', 'URGENT')` (application-enforced if not DB).

---

## 15. Finance / logistics boundary

**R10 core has NO new finance, payment, or logistics jobs.**

| Interaction | Rule |
|-------------|------|
| Appointment booking | May use existing sandbox payment on appointment types that already require it (R2) — no new payable SKU |
| Physical delivery | Out of scope |
| Vendor/carrier | No new integrations |
| Ledger facts | None |

R10-E uploads: storage cost only; no billing in R10.

---

## 16. Production boundaries (remain OFF throughout R10)

| Boundary | Status |
|----------|--------|
| Live PSP / live money / bank payouts | **OFF** |
| Real carriers | **OFF** |
| Production healthcare | **OFF** — `sandbox: true` |
| PACS/DICOM / LIS/HIS | **OFF** |
| Live e-Rx | **OFF** |
| Automatic refill | **OFF** — OD-RX-REFILL |
| Production LiveKit | **OFF** — sandbox video only |
| Recording | **OFF** |
| ML/NLP triage vendor | **OFF** until OD-CARE-01 |
| Care-nav pack default | **OFF** — `care_navigation.enabled = false` |

Future production enablement requires separate CR + legal gates (OD-CARE-01/02, OD-EHR-01/02).

---

## 17. Test strategy

### Per-phase gate

| Check | Required |
|-------|----------|
| Focused e2e | `r10a.*`, `r10c.*`, etc. |
| RLS / tenancy | Cross-patient denial |
| Auth negatives | 401/403 matrix |
| PHI leakage | Forbidden responses + admin lists |
| State machines | Invalid transition → 4xx |
| Migrations | Apply to dev + test DB; zero pending |
| Typecheck | api + affected web/mobile |
| Regression | R9 suites + full API (189 tests baseline) |
| Runtime | Per §18 |

### Failure protocol

1. Exact suite name  
2. Exact test name  
3. Isolated rerun  
4. Classify: product defect / test isolation / infrastructure  

Do not label "flaky" without reproduction.

### OD-R9-10 mitigation

R10 impl sub-phases should use suite-level pack isolation (`beforeAll`) per ED-R9-07; track global fix separately.

---

## 18. Runtime strategy

| Surface | Gate | Failure label |
|---------|------|---------------|
| API | `docker compose up`; `/health/ready`; care-nav routes 401/403 | `API_NOT_RUNNING` |
| web-customer care-nav | Local `nx serve web-customer`; complete intake flow | `BROWSER_RUNTIME_NOT_VERIFIED` |
| web-admin care-nav audit | List sessions after e2e seed | `BROWSER_RUNTIME_NOT_VERIFIED` |
| mobile care-nav | Emulator if configured | `ANDROID_RUNTIME_NOT_VERIFIED` |
| iOS | Windows host | **`IOS_RUNTIME_NOT_VERIFIED`** (mandatory on Windows) |

Never claim RUNTIME_PASS without exercising the application.

---

## 19. Technical debt carry-forward

| Debt | Classification | R10 action |
|------|----------------|------------|
| OD-R9-10 shared-DB isolation | Non-blocking; R10 prerequisite for CI confidence | Mitigate per-suite; track global fix |
| Browser runtime gaps | Non-blocking | **R10-B/C/D must attempt** |
| Android runtime gaps | Non-blocking | Attempt on emulator |
| iOS runtime | Non-blocking | Document `IOS_RUNTIME_NOT_VERIFIED` on Windows |
| OD-EHR-01/02 controller/processor | Legal; non-blocking for sandbox | Document; block production |
| OD-CARE-01/02 | Legal/product; non-blocking for rules-only sandbox | ED-R10-01 rules engine default |

---

## 20. Open decisions (OD-R10-*)

| ID | Type | Decision needed | Affects | Safe default (if any) |
|----|------|---------------|---------|----------------------|
| **OD-R10-01** | PRODUCT | Care-nav entry point: dedicated `/care` tab vs Health sub-route | R10-B | **ED-R10-02:** sub-route under existing Health tab |
| **OD-R10-02** | LEGAL | Whether symptom text is health data for retention (links OD-EHR-01) | R10-A storage | Sandbox retention = patient-deletable; legal review before production |
| **OD-R10-03** | PRODUCT | Upload MIME/size limits and retention class | R10-E | PDF/JPEG/PNG; 10MB; `STANDARD_HEALTH` |
| **OD-R10-04** | CLINICAL | Minimum red-flag rule set for sandbox | R10-A | Country pack JSON; empty pack = no red-flag (fail-safe to "seek care") |
| **OD-R10-05** | PRODUCT | Tele handoff: auto-select video appointment type vs in-person default | R10-C | In-person default; tele when `video.enabled` + patient selects |
| **OD-R10-06** | ENGINEERING | Voice intake: defer entirely vs stub adapter port | R10-B+ | **Defer implementation;** port only in R10-A |
| **OD-CARE-01** | LEGAL | Rules vs ML/NLP vendor | R10+ production | **ED-R10-01:** rules-only v1 |
| **OD-CARE-02** | LEGAL | Emergency copy and CTA per country | R10-B enablement | Pack CMS strings; no hardcoded national numbers |
| **OD-EHR-05** | LEGAL | Caregiver/proxy model | Blocks proxy feature | **Defer** |
| **OD-CUS-04** | PRODUCT | Family/caregiver access | Blocks proxy feature | **Defer** |

---

## 21. Engineering defaults (ED-R10-*)

| ID | Default | Rationale |
|----|---------|-----------|
| **ED-R10-01** | Rules-based triage only in R10-A…D; `CareTriageEnginePort` with `RulesTriageEngine` adapter | OD-CARE-01 unresolved; Book 92 forbids diagnosis |
| **ED-R10-02** | Care-nav customer UI under existing Health/Care navigation entry | Minimizes new IA; matches Book 93 customer super-app |
| **ED-R10-03** | Upload limits: pdf/jpeg/png, 10MB max, sandbox object store | Matches lab/imaging blob patterns |
| **ED-R10-04** | Care-nav pack `care_navigation.enabled` default **false** | Book 93 pack-off until legal |
| **ED-R10-05** | No symptom text in outbox/security events — session_id + urgency enum only | PHI-minimal notification kernel |
| **ED-R10-06** | Handoff creates appointment via existing `AppointmentService.book` — no parallel booking kernel | Kernel lock |
| **ED-R10-07** | Red-flag sessions cannot hand off to ordinary booking as primary CTA — emergency guidance first | Book 92 §3 |

---

## 22. Acceptance gates

### Phase gate (each R10-A…D)

- [ ] Focused e2e for sub-phase **PASS** (exact counts recorded)  
- [ ] RLS negative cases **PASS**  
- [ ] PHI leakage tests **PASS**  
- [ ] Migrations applied; zero pending  
- [ ] `api:typecheck` + affected clients **PASS**  
- [ ] R9 regression subset **PASS**  
- [ ] Runtime per §18 attempted; gaps explicitly labeled  

### R10 closure gate (after R10-D + optional E/F if authorized)

- [ ] All authorized sub-phases complete  
- [ ] Full API suite **PASS** (baseline 80 suites / 189 tests; report exact counts)  
- [ ] R7/R8/R9 regression **PASS**  
- [ ] Security audit: no `USING(true)`; NOBYPASSRLS  
- [ ] Production boundaries confirmed OFF  
- [ ] Books 183 + index + roadmap updated  
- [ ] Runtime status explicitly reported  

**Closure verdict target:** `R10_GREEN_CLOSED_R11_READY_FOR_PLANNING` or `R10_WITH_BLOCKERS`.

---

## 23. Explicit non-starts (entire R10 program)

- R11 CMS / help desk / support product  
- R12 CRM / marketing / loyalty  
- R13 PHI search index  
- R14 live money / carriers  
- Autonomous diagnosis or auto-prescribe  
- ML triage vendor (without OD-CARE-01 + CR)  
- Caregiver/proxy (without OD-EHR-05)  
- Production PACS/LIS/HIS  
- Live e-Rx / automatic refill  
- Recording / production LiveKit  
- Modifying R7/R8/R9 clinical lifecycles  
- Second consent, booking, or triage kernel  

---

## 24. Recommended next authorization

| Step | CR | Notes |
|------|-----|-------|
| 1 | **CR-POST-R10-PLAN-AUDIT-184** | Audit this plan only |
| 2 | **CR-R10-A-IMPL-185** (proposed) | Care navigation kernel — **not authorized until audit passes** |

Do **not** start R10-B UI until R10-A acceptance gates pass.

---

## 25. Document control

| Field | Value |
|-------|-------|
| Author | CR-R10-PLANNING-183 |
| Verdict | **R10_PLAN_READY** |
| Implementation | **NOT AUTHORIZED** |
| Next CR | **CR-POST-R10-PLAN-AUDIT-184** |
