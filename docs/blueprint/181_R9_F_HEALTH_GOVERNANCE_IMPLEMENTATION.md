# 181 — R9-F Health governance + break-glass clinical bridge implementation

**CR:** CR-R9-F-IMPL-181  
**Date:** 29 August 2026  
**FINAL VERDICT:** **R9_F_WITH_BLOCKERS** (implementation complete; DB/e2e/runtime blocked — see §Environment)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)  
**Baseline:** [180](180_POST_R9_E_AUDIT.md) (**R9_E_GREEN_R9_F_READY**)

---

## Scope

R9-F delivers admin health governance (metadata-only) and the break-glass → `ConsentGrant` clinical bridge per Book 170 §7.5 / §R9-F:

- `BreakGlassBridgeService` — `HEALTH_CLINICAL` break-glass opens time-boxed `ConsentGrant` purpose `break_glass` (**ED-R9-01**)
- `AdminHealthController` — consent audit list, access audit list, break-glass queue/open/review
- Reuses `health_artifact_access_audits`, `ConsentService` path, `ClinicalAccessService`, security events, outbox
- web-admin governance surfaces wired to real APIs
- `clinical:audit:read` RBAC permission for admin audit screens

**Explicit non-starts:** R10+, care navigation, CRM clinical payloads, uploads, new payment/logistics, PACS/LIS/HIS, live healthcare/money.

---

## Environment check (CR §1)

| Check | Result |
|-------|--------|
| Docker Desktop | **UNAVAILABLE** (`dockerDesktopLinuxEngine` pipe not found) |
| Postgres `127.0.0.1:55432` | **UNREACHABLE** (`P1001`) |
| `prisma migrate status` | **BLOCKED** (cannot connect) |
| `worldpharma_app` NOSUPERUSER + NOBYPASSRLS | **NOT RE-VERIFIED** (requires live DB) |

E2E and migration apply were **not executed** in this session. No test results were faked.

---

## Database / migrations (76 total when applied)

| Migration | Purpose |
|-----------|---------|
| `20260829180000_r9f_health_governance_enums` | `BreakGlassGrantKind`, `BreakGlassReviewStatus` |
| `20260829180100_r9f_health_governance_schema` | Extend `break_glass_grants`; `consent_grants.break_glass_grant_id`; FORCE RLS on `break_glass_grants` |

### Schema highlights

| Table / column | Purpose |
|----------------|---------|
| `break_glass_grants.kind` | `PLATFORM` (existing company break-glass) vs `HEALTH_CLINICAL` |
| `break_glass_grants.patient_person_id` / `doctor_partner_id` | Health bridge scope |
| `break_glass_grants.review_status` | `PENDING` → `REVIEWED`; `CLOSED` terminal |
| `consent_grants.break_glass_grant_id` | Unique FK linking bridged consent |

RLS: `break_glass_grants` FORCE RLS; platform/worker insert/update; no `USING(true)`.

---

## Break-glass architecture

```
Admin (security:break_glass)
  POST /admin/health/break-glass
    → BreakGlassGrant (HEALTH_CLINICAL, review PENDING)
    → ConsentGrant (purpose break_glass, scope all R9 artifact types, TTL ≤ 4h)
    → Outbox BREAK_GLASS_HEALTH_OPENED (patient notification per ED-R9-01 / Book 170 §15)
    → Security event BREAK_GLASS_OPENED (metadata only)

Doctor
  GET .../artifacts/:id/payload?purpose=break_glass
    → ClinicalAccessService + active bridged consent + active break-glass grant
    → health_artifact_access_audits row + HEALTH_ARTIFACT_READ security event
```

### Engineering defaults applied

| ID | Behavior |
|----|----------|
| **ED-R9-01** | Bridged consent TTL = min(grant TTL, 4h); scope = all `HEALTH_CONSENT_ARTIFACT_TYPES` |
| **OD-R9-02** | Patient notification via `BREAK_GLASS_HEALTH_OPENED` outbox (opaque IDs; legal gate documented, not invented) |

### State machine

| Transition | Result |
|------------|--------|
| Open | `review_status=PENDING`, bridged consent `ACTIVE` |
| Review (PENDING) | → `REVIEWED` (idempotent if already `REVIEWED`) |
| Review (CLOSED) | **409** |
| Expired / revoked grant | Payload read **403** (`break_glass_expired` / `break_glass_revoked`) |
| Duplicate active grant (same patient+doctor) | **409** |

Platform `POST /admin/company-authority/break-glass` unchanged (`PLATFORM` kind).

---

## APIs

Base: `/api/v1`

| Method | Route | Permission | Response |
|--------|-------|------------|----------|
| GET | `/admin/health/consent-grants` | `clinical:audit:read` | Metadata list + cursor pagination |
| GET | `/admin/health/access-audits` | `clinical:audit:read` | Audit rows (no payload) |
| GET | `/admin/health/break-glass` | `security:break_glass` | Health break-glass queue |
| POST | `/admin/health/break-glass` | `security:break_glass` | Open health break-glass + bridge |
| POST | `/admin/health/break-glass/:grantId/review` | `security:break_glass` | Mark reviewed |

Doctor reads accept `purpose=break_glass` via `ARTIFACT_READ_PURPOSES` extension.

---

## Files changed

| Area | Path |
|------|------|
| Schema | `packages/database/prisma/schema.prisma` |
| Migrations | `20260829180000_r9f_health_governance_enums`, `20260829180100_r9f_health_governance_schema` |
| Bridge | `apps/api/src/health/break-glass-bridge.service.ts` |
| Admin service | `apps/api/src/health/admin-health.service.ts` |
| Admin controller | `apps/api/src/health/admin-health.controller.ts` |
| Module | `apps/api/src/health/health.module.ts` |
| Consent scope | `apps/api/src/clinical/consent-scope.ts` |
| Clinical access | `apps/api/src/clinical/clinical-access.service.ts` |
| RBAC | `apps/api/src/identity/authority.ts`, `rbac.service.ts` |
| Events | `apps/api/src/events/envelope.ts`, `handlers.ts` |
| Security events | `apps/api/src/identity/security-events.service.ts` |
| web-admin UI | `apps/web-admin/src/health-governance-admin.tsx`, `nav.ts` |
| web-admin routes | `apps/web-admin/app/governance/health/*` |
| E2E | `apps/api/src/health/r9f.break-glass-health.e2e.spec.ts` |

---

## Admin UI

| Route | Screen |
|-------|--------|
| `/governance/health/consents` | Consent grant governance |
| `/governance/health/access-audits` | Health access audits |
| `/governance/health/break-glass` | Break-glass queue + review (confirmation state) |

States: loading, empty, 401/403, network error, retry, pagination (load more).

---

## PHI handling

| Surface | Rule |
|---------|------|
| Admin consent list | IDs, purpose, status, scope types — no clinical body |
| Admin access audits | Reason codes only — no payload |
| Break-glass queue | Operational metadata — no findings/Rx text |
| Security events / outbox | Opaque IDs (`grant_id`, `consent_id`, `patient_person_id`) |
| Denied doctor responses | No PHI in 403 bodies |

---

## Tests

| Suite | Result (this session) |
|-------|------------------------|
| `r9f.break-glass-health.e2e.spec.ts` | **NOT RUN** (DB unavailable) |
| R9-A…E regression | **NOT RUN** (DB unavailable) |
| RLS `USING(true)=0` / `worldpharma_app` | **NOT RUN** (DB unavailable) |

E2E file covers: full consent→revoke→break-glass→read→admin lists (PHI negative)→review idempotency→expiry deny; duplicate grant 409; R9-C re-grant regression.

---

## Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `web-admin:typecheck` | **PASS** |
| `web-admin:build` | **PASS** |

---

## Runtime verification

| Environment | Status |
|-------------|--------|
| API `/health/ready` | **API_NOT_RUNNING** |
| Admin health APIs (live) | **NOT VERIFIED** (DB down) |
| web-admin browser flows | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Android / iOS | **ANDROID_RUNTIME_NOT_VERIFIED** / **IOS_RUNTIME_NOT_VERIFIED** |

---

## Security review (static)

| Check | Status |
|-------|--------|
| Duplicate consent kernel | **None** — bridge writes to existing `consent_grants` |
| Duplicate access-audit store | **None** — uses `health_artifact_access_audits` |
| `USING(true)` on new policies | **None** in R9-F migrations |
| Clinical payload on admin routes | **Denied by design** (metadata DTOs) |
| R10+ code | **Not started** |

---

## Known debt / blockers

1. **Docker/Postgres offline** — must start Docker, apply migrations 75–76, rerun e2e + regression before audit CR-POST-R9-F-AUDIT-182.
2. Shared-DB `policyPack` pollution (`doctor.e2e`) — pre-existing OD-R9-10.
3. `BROWSER_RUNTIME_NOT_VERIFIED` — unchanged baseline.

---

## Production boundaries (remain OFF)

Live PSP, real carriers, production healthcare/PACS/LIS/HIS, live e-Rx, automatic refill, production LiveKit, PHI in notifications/search/CRM.

---

## Next step

**CR-POST-R9-F-AUDIT-182** — do **not** start R10+ until audit returns clean R9 closure verdict.
