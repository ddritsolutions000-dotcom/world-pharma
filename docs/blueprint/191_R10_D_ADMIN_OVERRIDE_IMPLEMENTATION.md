# Book 191 — R10-D Admin Audit + Clinician Override Implementation

**CR:** CR-R10-D-IMPL-191  
**Verdict:** `R10_D_IMPLEMENTED`  
**Next step:** `CR-POST-R10-D-AUDIT-192`

---

## 1. Scope delivered

R10-D completes the care navigation **governance core**:

| Capability | Status |
|------------|--------|
| Admin operational audit (metadata-only lists/detail) | **IMPLEMENTED** |
| Clinician/admin override (reason-required, auditable) | **IMPLEMENTED** |
| Governance rematch (versioned recommendations, history preserved) | **IMPLEMENTED** |
| Append-only `care_nav_overrides` + security events | **IMPLEMENTED** |
| Admin UI `/governance/care-nav` | **IMPLEMENTED** |
| Red-flag safety preserved (no customer booking unlock) | **VERIFIED** |

**Explicit non-starts (unchanged):** R10-E uploads, R10-F consult-note projection, R11+, caregiver/proxy, new payment/logistics/consent/health kernels, doctor mobile override UI.

---

## 2. APIs (Book 183 §13)

Base: `/api/v1`. JWT required.

| Method | Route | Audience | Permission | Notes |
|--------|-------|----------|------------|-------|
| GET | `/admin/care-nav/sessions` | admin | `care_nav:audit:read` | Cursor pagination; PHI-minimal |
| GET | `/admin/care-nav/sessions/:id` | admin | `care_nav:audit:read` | Detail + overrides + audit trail |
| POST | `/admin/care-nav/sessions/:id/override` | admin, doctor | `care_nav:override` | `REMATCH` \| `TERMINATE`; reason required |

### Override body

```json
{
  "action": "REMATCH",
  "reason": "Governance review requested new provider set",
  "country_code": "XX",
  "idempotency_key": "optional-stable-key"
}
```

### Override semantics

- **Does not mutate** `care_triage_assessments` — original rules-based assessment preserved.
- **REMATCH:** increments `match_set_version`, inserts new `care_match_recommendations` rows; prior sets remain for audit; customer sees active set only.
- **TERMINATE:** `status → TERMINATED`, `terminated_at` set; terminal sessions cannot resume.
- **Red-flag:** override does **not** clear `red_flag` or unlock customer `GET .../recommendations` / handoff — `assertRedFlagHandoffAllowed` unchanged.
- **Doctor override:** requires active `clinical_relationship` to session patient in session country (in addition to `care_nav:override`).
- **Idempotency:** duplicate `idempotency_key` per session returns existing override record.

### Security event

`CARE_NAV_OVERRIDE_APPLIED` — metadata: `session_id`, `override_id`, `action`, `country_id` (no symptoms).

---

## 3. Permissions

Added to `COMPANY_ONLY_PERMISSIONS` and RBAC catalog:

| Permission | Granted to (company roles) |
|------------|----------------------------|
| `care_nav:audit:read` | `company_compliance`, `company_operations`, `super_admin`, `global_admin`, … |
| `care_nav:override` | `company_compliance`, `super_admin`, `global_admin`, … |

Org/doctor roles do not receive company-only permissions by default; doctors may hold `care_nav:override` via break-glass grant for governed actions.

---

## 4. Database

**Migration:** `20260829180700_r10d_care_nav_governance`

| Change | Purpose |
|--------|---------|
| `care_navigation_sessions.match_set_version` | Active recommendation set pointer |
| `care_match_recommendations.set_version` | Versioned rematch without DELETE |
| `care_nav_overrides` | Append-only governance log |
| RLS on `care_nav_overrides` | FORCE RLS; no `USING(true)`; insert via worker/platform/actor |

---

## 5. State machine

Unchanged customer path: `INTAKE → TRIAGED → MATCHED → COMPLETED` and `→ TERMINATED`.

Governance additions:

- **REMATCH** allowed in `TRIAGED` or `MATCHED` (not after `appointment_id` linked).
- **TERMINATE** allowed until terminal; `COMPLETED` / `TERMINATED` reject further overrides with **409**.

---

## 6. Admin UI

**Route:** `web-admin` → `/governance/care-nav`  
**Nav:** Care navigation (requires `care_nav:audit:read`)

States: loading, empty, populated, forbidden, network error, retry, session detail, override confirmation, success/failure.

Override UI requires explicit confirmation + reason (min 8 chars).

---

## 7. Tests

### R10-D focused (`r10d.care-nav-governance.e2e.spec.ts`)

| # | Test | Result |
|---|------|--------|
| 1 | Admin audit authorized + metadata-only; unauthorized 403 | PASS |
| 2 | Override rematch + idempotency + terminate + terminated 409 | PASS |
| 3 | Red-flag rematch does not unlock customer booking | PASS |
| 4 | Customer cannot override; malformed session 400 | PASS |

**R10-D count: 4/4 PASS**

### Regression

| Suite | Result |
|-------|--------|
| R10-A + R10-C + R10-D combined | **10/10 PASS** |
| Full API | **83/84 suites, 200/201 tests PASS** |

**Full-suite failure (isolated rerun PASS — test infra):**

| Suite | Test | Error | Isolated | Classification |
|-------|------|-------|----------|----------------|
| `company-authority.e2e.spec.ts` | blocks partner escalation… | `VALIDATION_ERROR` at `OrganizationService.create` | **PASS** | Shared-DB / ordering flake (pre-existing) |

---

## 8. Typecheck / builds

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `nx build api` | PASS |
| `web-admin:typecheck` | PASS |
| `web-admin:build` | PASS (includes `/governance/care-nav`) |
| `web-customer:typecheck` | PASS |
| `mobile:typecheck` | PASS |
| Android build | Not attempted |
| iOS | `IOS_BUILD_NOT_AVAILABLE_ON_WINDOWS` / `IOS_RUNTIME_NOT_VERIFIED` |

---

## 9. Runtime verification

| Check | Result |
|-------|--------|
| API `/health/ready` | Not verified (API not running in agent session) |
| Admin list/detail/override | Covered by e2e |
| Customer care-nav regression | R10-A/C e2e PASS |

---

## 10. PHI / security boundaries

- Admin list/detail exclude `chief_complaint_summary`, answers, and symptom narrative.
- Override/audit metadata uses opaque IDs, urgency enums, explanation keys.
- Denied customer override attempts return 401/403 without clinical leakage.
- Red-flag handoff block remains server-side.

---

## 11. Technical debt (carry-forward)

| Item | Severity |
|------|----------|
| Full-suite `company-authority` flake | non-blocking infra |
| Mobile session resume (R10-B debt) | non-blocking |
| Web UI tests for match/handoff/governance screens | non-blocking |
| Doctor override web-doctor surface deferred v1 per Book 183 | by design |
| Runtime browser walk-through not executed in agent session | audit gap |

---

## 12. Boundary verification

| Phase | Status |
|-------|--------|
| R10-A | COMPLETE |
| R10-B | COMPLETE |
| R10-C | COMPLETE |
| R10-D | **IMPLEMENTED** |
| R10-E | NOT STARTED |
| R10-F | NOT STARTED |
| R11+ | NOT STARTED |

**Confirmed absent:** document upload, consult-note projection, caregiver proxy, autonomous diagnosis/prescribing, ML triage, live money, production healthcare/video, recording.

---

## 13. Files changed

### API
- `apps/api/src/care-nav/admin-care-nav.controller.ts` (new)
- `apps/api/src/care-nav/admin-care-nav.service.ts` (new)
- `apps/api/src/care-nav/care-nav-override.service.ts` (new)
- `apps/api/src/care-nav/care-match.service.ts` — `setVersion`, `rematchForGovernance`
- `apps/api/src/care-nav/care-nav-session.access.ts` — active match filter
- `apps/api/src/care-nav/care-nav.module.ts`
- `apps/api/src/care-nav/r10d.care-nav-governance.e2e.spec.ts` (new)
- `apps/api/src/identity/authority.ts`
- `apps/api/src/identity/rbac.service.ts`
- `apps/api/src/identity/security-events.service.ts`

### Database
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260829180700_r10d_care_nav_governance/migration.sql`

### Web admin
- `apps/web-admin/src/care-nav-governance-admin.tsx` (new)
- `apps/web-admin/app/governance/care-nav/page.tsx` (new)
- `apps/web-admin/src/nav.ts`

### Docs
- `docs/blueprint/191_R10_D_ADMIN_OVERRIDE_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 14. Exact next step

**`CR-POST-R10-D-AUDIT-192`** — post-implementation audit to determine whether R10 core can be closed. Do not start R10-E/F or R11+ without separate CR.
