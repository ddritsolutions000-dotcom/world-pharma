# 185 — R10-A Care navigation kernel implementation

**CR:** CR-R10-A-IMPL-185  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R10_A_IMPLEMENTED**  
**Canonical plan:** [183](183_R10_IMPLEMENTATION_PLAN.md)  
**Plan audit:** [184](184_POST_R10_PLAN_AUDIT.md) (**R10_PLAN_GREEN_R10_A_READY**)

---

## Scope

R10-A delivers the **backend-only** care navigation kernel per Book 183 §R10-A:

- Database schema + FORCE RLS for care-navigation entities
- Server-enforced session state machine
- Rules-only deterministic triage (`CareTriageEnginePort` / `RulesTriageEngine`)
- Policy pack gate `care_navigation_enabled` (default **OFF**, fail-closed)
- Customer intake APIs (create, answers, complete-intake/triage, assessment, terminate)
- Idempotency on session create (`X-Idempotency-Key`)
- PHI-minimal outbox, security events, append-only audit
- Dedicated e2e suite + full API regression

**Explicit non-starts:** R10-B customer UI; R10-C match/handoff; R10-D admin override; R10-E uploads; R10-F consult-note projection; R11+; live healthcare/money; ML/vendor triage; appointment booking; HealthArtifact duplication.

---

## Verification summary

| Check | Result |
|-------|--------|
| Prisma migrations (80 total) | **APPLIED** (dev + test DB) |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| R10-A e2e (`r10a.care-nav-kernel`) | **2/2 tests PASS** |
| Triage unit (`rules-triage.engine.spec`) | **2/2 tests PASS** |
| Full API Jest suite | **82 suites / 193 tests PASS** |
| RLS migration audit | FORCE RLS on all R10-A tables; **no `USING(true)`** |
| Runtime `/health/ready` | **200** (`postgres`/`redis`/`bullmq` up) |
| Runtime R10-A route registration | **CareNavController** mapped (6 routes) |
| Runtime unauthenticated care-nav | **401** |
| Runtime disabled pack | **403** (fail-closed; e2e + live gate) |
| Runtime happy-path create (live curl) | **Blocked on dev XX policy pack** — manual curl corrupted `healthcare` JSON during verification; **e2e happy path is authoritative** (201 create, triage, red-flag) |

---

## Database / migrations

| Migration | Purpose |
|-----------|---------|
| `20260829180300_r10a_care_nav_enums` | `CareNavSessionStatus`, `CareUrgencyLevel` |
| `20260829180400_r10a_care_nav_schema` | Sessions, answers, triage assessments, match recommendations (schema-only for R10-C), audits |
| `20260829180500_r10a_care_nav_rls` | FORCE RLS + policies + grants |

### Enums

| Enum | Values |
|------|--------|
| `CareNavSessionStatus` | `DRAFT`, `INTAKE`, `TRIAGED`, `COMPLETED`, `TERMINATED` |
| `CareUrgencyLevel` | `ROUTINE`, `SOON`, `URGENT`, `EMERGENT` |

### Tables

| Table | Purpose |
|-------|---------|
| `care_navigation_sessions` | Session aggregate; owner `person_id`; country FK; TTL `expires_at`; triage summary columns |
| `care_navigation_session_answers` | Append-only intake answers (`session_id` + `question_key` unique) |
| `care_triage_assessments` | Immutable triage outcome (rules version, urgency, red-flag, explanation keys) |
| `care_match_recommendations` | **Schema only** — populated in R10-C |
| `care_nav_audits` | Append-only action log (metadata; no clinical text) |

### RLS model

- **Sessions:** customer `INSERT` via `app.can_person(person_id)`; `SELECT` owner/worker/platform; `UPDATE` worker/platform only; no `DELETE`
- **Answers / assessments / match / audits:** `SELECT` via parent session ownership; `INSERT` worker/platform; answers **no UPDATE** (service uses create + idempotent read, not upsert)
- **FORCE RLS** on all five tables; **no `USING(true)`**
- `worldpharma_app` retains NOSUPERUSER + NOBYPASSRLS

---

## State machine

Implemented in `care-nav-status.ts`; enforced in `CareNavigationService` via `assertCareNavTransition`.

| From | Allowed to |
|------|------------|
| `DRAFT` | `INTAKE`, `TERMINATED` |
| `INTAKE` | `TRIAGED`, `TERMINATED` |
| `TRIAGED` | `COMPLETED`, `TERMINATED` |
| `COMPLETED` | _(terminal)_ |
| `TERMINATED` | _(terminal)_ |

**R10-A behavior:** create starts at `INTAKE` (skips `DRAFT`). `complete-intake` transitions `INTAKE → TRIAGED`. Invalid transitions return **409**. Expired sessions return **403**. Terminal sessions return **409** on mutation.

Session TTL: **24 hours** (`CARE_NAV_SESSION_TTL_HOURS`).

---

## Triage engine

**Port:** `CareTriageEnginePort`  
**Implementation:** `RulesTriageEngine` (`r10a-rules-v1`)

- Rules-only, deterministic, explainable (returns `explanation_key` / `emergency_guidance_key`)
- No ML, no diagnosis language, no prescription generation
- Red-flag patterns (cardiac, breathing, bleeding, stroke, mental health) → `EMERGENT` + `red_flag: true` + emergency guidance key
- Fever → `SOON`; abdominal pain → `URGENT`; default → `ROUTINE`
- Assessment API exposes `booking_handoff_allowed: false` when `red_flag` (emergency guidance before ordinary booking — R10-C handoff not started)

---

## Policy pack gating

| Field | Default | Gate |
|-------|---------|------|
| `healthcare.care_navigation_enabled` | `false` | `PolicyResolver.isCareNavigationEnabled()` |

Disabled pack → **403** on all care-nav operations. Tests use `enableCareNavigationPack()` helper (merges via `emptyPolicyDocument().healthcare`).

---

## APIs

Base: `/api/v1/care-nav` — customer JWT + `customer` audience.

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| `POST` | `/sessions` | Customer | `X-Idempotency-Key`; **201** |
| `GET` | `/sessions/:id` | Customer | `country_code` query; owner only |
| `POST` | `/sessions/:id/answers` | Customer | **200**; append-only answers |
| `POST` | `/sessions/:id/complete-intake` | Customer | Runs triage; **201** |
| `GET` | `/sessions/:id/assessment` | Customer | Post-triage read |
| `POST` | `/sessions/:id/terminate` | Customer | **201** |

**Not implemented (R10-C/D):** `POST .../match`, `POST .../handoff/appointment`, admin override routes.

---

## Security / tenancy

- Service-level: `loadOwnedSession` filters `person_id` + `country_id`; malformed UUID → **404** (no leak)
- RLS: cross-tenant isolation on all care-nav tables
- E2e covers: customer isolation, unauthenticated **401**, disabled pack **403**, malformed id **404**, expired session **403**, invalid transition **409**, PHI-negative error bodies

---

## PHI / data minimization

| Surface | Classification |
|---------|----------------|
| Session detail (owner) | PHI — chief complaint summary + answers |
| Outbox (`CARE_NAV_*`) | Metadata only (session/person/country IDs, urgency, red_flag boolean) |
| Security events | Action codes + opaque IDs |
| `care_nav_audits` | Question keys / reason codes — no answer text |
| Error responses | No clinical payload in problem details |

No HealthArtifact rows created. No clinical reports published.

---

## Kernel reuse

| Reused | Not duplicated |
|--------|----------------|
| Identity/RBAC, JWT guards | Consent kernel |
| `PolicyResolver` + pack cache | Health artifact kernel |
| `OutboxService`, `SecurityEventsService` | Appointment kernel |
| `runWithTenant` / `workerTenantContext` | Payment/logistics kernels |
| Idempotency store pattern | |

---

## Events

| Type | Channel |
|------|---------|
| `CARE_NAV_SESSION_STARTED` | Outbox |
| `CARE_NAV_TRIAGE_COMPLETED` | Outbox |
| `CARE_NAV_SESSION_CREATED` | Security events |
| `CARE_NAV_ANSWER_RECORDED` | Security events |
| `CARE_NAV_TRIAGE_COMPLETED` | Security events |
| `CARE_NAV_SESSION_TERMINATED` | Security events |

---

## Files changed

| Area | Path |
|------|------|
| Schema | `packages/database/prisma/schema.prisma` |
| Migrations | `20260829180300_r10a_care_nav_enums`, `20260829180400_r10a_care_nav_schema`, `20260829180500_r10a_care_nav_rls` |
| Module | `apps/api/src/care-nav/care-nav.module.ts` |
| Controller | `apps/api/src/care-nav/care-nav.controller.ts` |
| Service | `apps/api/src/care-nav/care-navigation.service.ts` |
| State machine | `apps/api/src/care-nav/care-nav-status.ts` |
| Triage | `apps/api/src/care-nav/care-triage-engine.port.ts`, `rules-triage.engine.ts` |
| Audit | `apps/api/src/care-nav/care-nav-audit.service.ts` |
| Policy | `apps/api/src/policy/document.ts`, `empty-pack.ts`, `resolver.ts` |
| App wiring | `apps/api/src/app/app.module.ts` |
| Events | `apps/api/src/events/envelope.ts`, `handlers.ts` |
| Security events | `apps/api/src/identity/security-events.service.ts` |
| Tests | `apps/api/src/care-nav/r10a.care-nav-kernel.e2e.spec.ts`, `rules-triage.engine.spec.ts` |
| Test helper | `apps/api/src/test/enable-care-nav-pack.ts` |

---

## Tests

### R10-A e2e (`r10a.care-nav-kernel.e2e.spec.ts`)

1. **Happy path:** create, idempotent create, answer, routine triage, red-flag path, outbox PHI check
2. **Security negatives:** cross-customer **404**, unauthenticated **401**, malformed id **404**, expired **403**, invalid transition **409**, disabled pack **403**

### Unit (`rules-triage.engine.spec.ts`)

Deterministic urgency/red-flag rule coverage.

### Regression

Full API suite: **82 suites / 193 tests PASS** (includes R7–R9 suites unchanged).

---

## Runtime

```
GET  /health/ready                              → 200
POST /api/v1/care-nav/sessions (no auth)        → 401
POST /api/v1/care-nav/sessions (pack off)       → 403
CareNavModule routes registered at boot         → confirmed
```

Happy-path API exercised via e2e (pack enabled in test harness). For local manual curl, enable pack with `enableCareNavigationPack()` pattern — do not partially overwrite `healthcare` JSON.

---

## Known debt

| ID | Item |
|----|------|
| ENV-01 | Dev DB `XX` policy pack may need re-publish if manually edited outside validator (runtime curl session only) |
| PROD-01 | `OD-CARE-01` / `OD-CARE-02` — rules vs ML and emergency copy remain human gates |
| R10-C-01 | `care_match_recommendations` table unused until handoff phase |
| R10-A-01 | Answer amend requires new session (append-only RLS by design) |

---

## Phase boundary confirmation

| Phase | Status |
|-------|--------|
| R10-B customer UI | **NOT STARTED** |
| R10-C match/handoff | **NOT STARTED** |
| R10-D admin/clinician override | **NOT STARTED** |
| R10-E uploads | **NOT STARTED** |
| R10-F consult-note projection | **NOT STARTED** |
| R11+ | **NOT STARTED** |

---

## Next step

**`CR-POST-R10-A-AUDIT-186`** — do not start R10-B until audit returns **`R10_A_GREEN_R10_B_READY`**.
