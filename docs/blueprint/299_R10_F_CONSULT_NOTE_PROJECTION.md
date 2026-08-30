# 299 — R10-F encounter consult-note projection (CR-299)

**CR:** `CR-R10-F-IMPL-299`  
**Verdict:** **`R10_F_IMPLEMENTATION_COMPLETE`**  
**Date:** 30 August 2026  
**Type:** Engineering implementation  
**Authorization:** Explicit `CR-R10-F-IMPL-299` user charter  
**Predecessor:** [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) / [298](298_R10_E_MOBILE_UPLOAD_PARITY.md) (R10-E complete)

**Boundaries respected:**

- No duplicate health artifact/timeline kernel (extends R9/R10-E pattern)
- No R10-E reopen
- No R14-A live PSP / R3 / R14-B scope creep
- No caregiver/proxy upload, production AV, or clinician-only note expansion

---

## A. Authorization evidence

| Source | Evidence |
|--------|----------|
| User charter | `# CR-R10-F-IMPL-299 — CONSULT-NOTE PROJECTION` with explicit proceed instruction |
| Prior CR-298 | Recommended R10-F **only when explicitly authorized** — authorization supplied in this CR |
| Roadmap [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) | R10-F listed as separate IMPL CR — not inferred from sandbox readiness alone |

**Authorization verdict:** **EXPLICIT** — proceed authorized.

---

## B. Pre-audit findings

| Component | Pre-CR state | Classification |
|-----------|--------------|----------------|
| `HealthArtifactType.CONSULT_NOTE` | Absent | **REAL_MISSING_FEATURE** |
| `HealthTimelineEventType.CONSULT_COMPLETED` | Absent | **REAL_MISSING_FEATURE** |
| `health_artifacts.encounter_id` FK | Absent | **REAL_MISSING_FEATURE** |
| `EncounterConsultNote` source table | Absent | **REAL_MISSING_FEATURE** (prerequisite — encounter module had no consult-note storage) |
| `HealthConsultProjectionService` | Absent | **REAL_MISSING_FEATURE** |
| Encounter `complete()` → health projection | Absent | **REAL_MISSING_FEATURE** |
| `HealthArtifactService` CONSULT_NOTE delegate | Absent | **REAL_MISSING_FEATURE** |
| `HEALTH_CONSENT_ARTIFACT_TYPES` CONSULT_NOTE | Absent | **PARTIAL** |
| R9 health kernel (artifact/timeline/access) | Present | **ALREADY_COMPLETE** (reused) |
| R10-E upload kernel | Present | **ALREADY_COMPLETE** (untouched) |

**Pre-audit note:** Book 183 §R10-F lists “Non-starts: Modifying encounter clinical storage.” Pre-audit confirmed the encounter module had **no** consult-note source at all. The smallest complete slice therefore adds a minimal adjunct `encounter_consult_notes` table (patient-visible summary only) without altering existing `Encounter` columns — projection remains a delegate read, not a duplicate clinical store.

---

## C. Implementation summary

| Area | Change |
|------|--------|
| Migrations | `20260830230000_r10f_consult_note_projection` (enums), `20260830230100_r10f_consult_note_projection_schema` (table + FK + RLS) |
| Source | `EncounterConsultNoteService` — records patient-visible summary on encounter complete |
| Projection | `HealthConsultProjectionService.projectCompletedEncounter()` — idempotent artifact + timeline |
| Timeline | `HealthTimelineService.projectConsultCompleted()` — `CONSULT_COMPLETED` / `encounter` source module |
| Trigger | `AppointmentService.complete()` when `patient_summary` provided |
| API | `POST /doctor/appointments/:id/complete` accepts optional `patient_summary` |
| Payload | `HealthArtifactService` delegate → `EncounterConsultNoteService.getHealthPayload()` |
| Consent | `CONSULT_NOTE` added to `HEALTH_CONSENT_ARTIFACT_TYPES` |
| Tests | `r10f.consult-note-projection.e2e.spec.ts` — 8/8 |

**Call path:** Doctor complete + summary → `encounter_consult_notes` → `HealthConsultProjectionService` → `health_artifacts` + `health_timeline_events` → existing R9 health read APIs.

---

## D. Post-implementation audit

| Check | Result |
|-------|--------|
| Uses canonical health artifact kernel | **PASS** |
| No duplicate projection engine | **PASS** (single `HealthConsultProjectionService`) |
| DB-level idempotency (`encounter_id` unique) | **PASS** |
| Timeline replay idempotency | **PASS** (e2e replay test) |
| RLS fail-closed | **PASS** (migration policies) |
| Patient ownership / cross-patient deny | **PASS** (e2e) |
| Country isolation | **PASS** (e2e) |
| Consent scope enforcement | **PASS** (e2e) |
| PHI not in timeline list API | **PASS** (string deny in e2e) |
| No object/storage key leak | **PASS** (e2e) |
| R10-E upload behavior intact | **PASS** (r10e 4/4 regression) |
| R14-A / R3 untouched | **PASS** |
| Missing summary skips projection | **PASS** (e2e) |

---

## E. Defects found / fixed

| ID | Finding | Fix |
|----|---------|-----|
| TD-SCHEMA-R10F-01 | `EncounterConsultNote.country` missing inverse on `Country` | Added `encounterConsultNotes` relation |
| TD-MIG-R10F-01 | Timeline RLS typo `imaging_booking_id` vs `imaging_org_id` | Corrected in migration SQL before apply |

No reproducible runtime defects after fixes.

---

## F. Test results

### Focused (R10-F)

| Suite | Result |
|-------|--------|
| `r10f.consult-note-projection.e2e.spec.ts` | **8/8 PASS** |

Covers: projection happy path, `CONSULT_NOTE` metadata, encounter traceability, replay idempotency, missing summary, consent deny/grant, cross-patient, wrong country, no storage key leak.

### Regressions

| Suite | Result |
|-------|--------|
| `r10e.health-upload.e2e.spec.ts` | **4/4 PASS** |
| `r9e.prescription-health-artifact-projection.e2e.spec.ts` | **4/4 PASS** |
| `r9a.health-record-kernel.e2e.spec.ts` | **1/1 PASS** |
| `mobile` health-parity + upload-parity | **10/10 PASS** |
| `api:typecheck` | **PASS** |

---

## G. Migration / runtime

| Database | Head | Pending |
|----------|------|---------|
| Test / Dev | **146** (`20260830230100_r10f_consult_note_projection_schema`) | **0** |

| Runtime | Result |
|---------|--------|
| `GET /health/ready` | **HTTP 200** |

---

## H. Remaining REAL gaps (R10 / health expansion)

| Gap | Classification | Notes |
|-----|----------------|-------|
| Upload supersede / amendment UX | **FUTURE** | Book 183 amendment pattern |
| Consult-note amendment / supersede | **FUTURE** | v1 single summary per encounter |
| Clinician-only encounter notes | **FUTURE** | OD-EHR-09 patient vs clinician note split |
| Production AV for uploads | **HUMAN_BLOCKED** | OD / vendor |
| Caregiver/proxy upload | **HUMAN_BLOCKED** | OD-EHR-05 |
| R10 optional track | **COMPLETE** | R10-E + R10-F implemented |

**No authorized unblocked R10 engineering gap remains.**

---

## I. Exactly ONE next CR

**`ROADMAP_ENGINEERING_PAUSE`** — re-audit per [296](296_NEXT_AUTHORIZED_ENGINEERING_WAVE.md). R10 optional expansions (R10-E, R10-F) are complete. Further work requires explicit human authorization (R14-A live 0/7, R5-F, R4 production, or a new track).

Do **not** manufacture a follow-on CR without a code-first authorized gap.

---

## J. Verdict

**`R10_F_IMPLEMENTATION_COMPLETE`**

Encounter consult-note projection is implemented on the existing health kernel, secured, regression-green, and documented. R10 optional health-record expansion (E + F) is now complete in sandbox.
