# R11-A Backend Kernel Implementation

**CR:** `CR-R11-A-IMPL-195`  
**Verdict:** `R11_A_IMPLEMENTED`  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R11-A delivers the **Postgres CMS + Support desk backend kernel** only. No R11-B/C/D/E UI, no R10-E/F, no R12+.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| CMS Postgres schema + RLS | **IMPLEMENTED** |
| CMS state machine (`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`) | **IMPLEMENTED** |
| CMS permissions (`cms:read/write/review/publish`) | **IMPLEMENTED** |
| Support Postgres kernel (Redis durable store replaced) | **IMPLEMENTED** |
| Support state machine | **IMPLEMENTED** |
| Support permissions (`support:read/manage`) | **IMPLEMENTED** |
| Admin CMS APIs | **IMPLEMENTED** |
| Public Help Center read APIs (backend only) | **IMPLEMENTED** |
| Customer + admin support APIs | **IMPLEMENTED** |
| Outbox / notifications (opaque payloads) | **IMPLEMENTED** |
| Security events (operational metadata) | **IMPLEMENTED** |
| Deterministic Postgres CMS search | **IMPLEMENTED** |
| Focused R11-A e2e | **IMPLEMENTED** |

### Explicit non-starts

- R11-B CMS admin UI
- R11-C Help Center customer UI
- R11-D Support Desk agent UI
- R11-E closure audit
- R10-E uploads / R10-F consult-note projection
- `reveal-pii` support endpoint (deferred to R11-D per UI scope)
- Caregiver proxy, R12+, live money, production healthcare integrations

---

## 2. Files changed

### Database

- `packages/database/prisma/schema.prisma` — R11-A enums/models + `Country`/`Person` relations
- `packages/database/prisma/migrations/20260829190000_r11a_cms_support_enums/migration.sql`
- `packages/database/prisma/migrations/20260829190100_r11a_cms_support_schema/migration.sql`
- `packages/database/prisma/migrations/20260829190200_r11a_cms_rls/migration.sql`
- `packages/database/prisma/migrations/20260829190300_r11a_support_rls/migration.sql`

### API — CMS module (`apps/api/src/cms/`)

- `cms.module.ts`
- `cms-status.ts`, `support-status.ts`, `cms-country.ts`
- `cms-audit.service.ts`, `cms-content.service.ts`, `cms-search.service.ts`
- `admin-cms.controller.ts`, `help-center.controller.ts`
- `admin-support.service.ts`, `admin-support.controller.ts`
- `r11a.cms-support-kernel.e2e.spec.ts`

### API — platform / identity / events

- `apps/api/src/platform/support.service.ts` — Postgres kernel (Redis list removed as durable store)
- `apps/api/src/platform/support.controller.ts` — ticket detail/messages/close
- `apps/api/src/platform/notification-dispatch.service.ts` — `support_updates` pref mapping
- `apps/api/src/identity/authority.ts`, `rbac.service.ts` — `cms:*`, `support:*`
- `apps/api/src/events/envelope.ts` — CMS + support event types
- `apps/api/src/identity/security-events.service.ts` — CMS/support security events
- `apps/api/src/app/app.module.ts` — `CmsModule` registration

---

## 3. Database / migrations

**Tables:** `cms_content_items`, `cms_content_revisions`, `cms_content_publications`, `cms_content_assets`, `cms_content_search_documents`, `cms_content_audits`, `support_queues`, `support_tickets`, `support_ticket_messages`, `support_ticket_events`, `support_ticket_attachments`

**Constraints:** slug+locale uniqueness per country; revision/publication version uniqueness; idempotency keys on tickets/messages/publications; FK graph verified in schema migration.

**RLS:** `FORCE ROW LEVEL SECURITY` on all R11-A tables; **no `USING(true)`** on CMS/support data. Published search documents allow public read via `published = true` + `can_country` (tenant context set by Help APIs).

**Migration deploy (test DB):** all four `20260829190*` migrations applied successfully via `prisma migrate deploy`.

---

## 4. CMS kernel

- Draft editing with revision rows
- Submit review (`DRAFT → IN_REVIEW`)
- Publish creates immutable `cms_content_publications` row + search document
- Archive unpublishes search document (`PUBLISHED → ARCHIVED`)
- Re-publish from `ARCHIVED` supported via state machine
- Optimistic `version` on content item; idempotent publish via `Idempotency-Key`

---

## 5. Support Postgres kernel

- Default `GENERAL` queue per country (created on first ticket)
- Ticket header + customer message thread in Postgres
- `support_ticket_events` append-only audit trail
- Redis retained only for notification inbox cache (not durable tickets)

---

## 6. State machines

### CMS

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED` (+ `ARCHIVED → PUBLISHED` re-publish)

### Support

`OPEN → ASSIGNED → IN_PROGRESS ⇄ WAITING_CUSTOMER → RESOLVED → CLOSED`  
Legacy Redis `PENDING` not emitted; new statuses used in API responses.

---

## 7. APIs

| Route | Auth | Permission |
|-------|------|------------|
| `GET/POST/PATCH /admin/cms/content*` | admin JWT | `cms:read/write/publish` |
| `GET /help/categories|articles|search|banners` | public | country tenant context |
| `GET/POST /support/tickets*` | customer JWT | ownership |
| `GET/POST /admin/support/*` | admin JWT | `support:read/manage` |

---

## 8. Security / RLS

- Customer ticket/content cross-access → **404**
- Unauthenticated admin CMS → **401**
- Wrong publish permission → **403**
- Terminal ticket mutation → **409**
- `worldpharma_app` remains non-superuser / no bypass RLS (unchanged)

---

## 9. PHI / privacy

- Published CMS/help → non-PHI operational content
- Support metadata → operational opaque refs only
- Customer messages may contain user-pasted sensitive text (risk documented; not expanded to clinical APIs)
- Outbox/notifications: `ticket_id`, `queue_code`, `status` only — no bodies, notes, or clinical payloads

---

## 10. Notifications / outbox

Events: `CMS_CONTENT_*`, `SUPPORT_TICKET_CREATED|ASSIGNED|CUSTOMER_REPLY|AGENT_REPLY|RESOLVED|CLOSED|UPDATED`  
Preference mapping corrected to `support_updates`.

---

## 11. Idempotency / concurrency

- Ticket create: `(person_id, idempotency_key)` unique
- Publish: `(content_item_id, idempotency_key)` unique on publications
- Ticket status: optimistic `version` + `updateMany` count check
- E2e covers duplicate create/publish and closed-ticket message rejection

---

## 12. Tests

**Focused:** `apps/api/src/cms/r11a.cms-support-kernel.e2e.spec.ts` — **4/4 PASS**

Covers: CMS lifecycle, unauthorized publish, public draft isolation, support lifecycle, customer isolation, internal notes, terminal immutability, idempotency.

**Regression spot-check:** `r10d.care-nav-governance.e2e.spec.ts` — **4/4 PASS**

**Full API suite:** not re-run in this CR window (prior baseline 200/201 green per Book 192).

---

## 13. Typecheck / build

- `tsc --noEmit` (apps/api) — **PASS**
- `nx run api:build` — **PASS**

---

## 14. Runtime verification

Docker Postgres (`:55432`) and Redis (`:56379`) available; migrations applied; e2e exercises real HTTP against Nest app.

API server was **not** left running; `/health/ready` not probed on a long-lived process. E2e HTTP verification substitutes for manual curl in this environment.

---

## 15. Boundary verification

| Phase | Status |
|-------|--------|
| R10-A…D | COMPLETE |
| R10-E/F | NOT STARTED |
| **R11-A** | **IMPLEMENTED** |
| R11-B/C/D/E | NOT STARTED |
| R12+ | NOT STARTED |

---

## 16. Technical debt

### Carried forward (Book 194)

- Shared-DB e2e pack pollution risk
- `pnpm` PATH shim for Jest on Windows
- Dev XX policy pack operational quirks

### New (R11-A)

| ID | Class | Note |
|----|-------|------|
| TD-R11A-01 | product | OD-CMS-01 dual-control (`cms:review` gate on publish) not enforced — requires human OD |
| TD-R11A-02 | product | OD-R11-05 customer-initiated close limited to OPEN/WAITING_CUSTOMER |
| TD-R11A-03 | test infrastructure | `prisma generate` EPERM on Windows when engine DLL locked |
| TD-R11A-04 | deferred scope | `POST /admin/support/tickets/:id/reveal-pii` not implemented (R11-D) |

---

## 17. Next step

**`CR-POST-R11-A-AUDIT-196`**
