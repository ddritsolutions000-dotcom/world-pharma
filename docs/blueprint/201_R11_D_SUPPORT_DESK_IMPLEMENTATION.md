# R11-D Support Desk Agent UI Implementation

**CR:** `CR-R11-D-IMPL-201`  
**Verdict:** `R11_D_IMPLEMENTED`  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) · [196](196_POST_R11_A_AUDIT.md) · [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md) · [198](198_POST_R11_B_AUDIT.md) · [199](199_R11_C_CUSTOMER_HELP_CENTER_IMPLEMENTATION.md) · [200](200_POST_R11_C_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R11-D delivers the **web-admin Support Desk agent UI** on top of the existing R11-A Postgres support kernel. No API, schema, or migration changes. No R11-E, R10-E/F, or R12+ work was started.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| Support queue/list view (`/support`) | **IMPLEMENTED** |
| Ticket detail (`/support/[id]`) | **IMPLEMENTED** |
| Ticket messages (customer + internal) | **IMPLEMENTED** |
| Assignment | **IMPLEMENTED** |
| Status transitions (state machine) | **IMPLEMENTED** |
| Internal notes (`visibility: INTERNAL`) | **IMPLEMENTED** |
| Customer-visible replies (`visibility: CUSTOMER`) | **IMPLEMENTED** |
| Queue escalation | **IMPLEMENTED** |
| Operational metadata (refs, person IDs, queue) | **IMPLEMENTED** |
| Permission gating (`support:read`, `support:manage`) | **IMPLEMENTED** |
| Error states (401/403/404/409/network/5xx) | **IMPLEMENTED** |
| Closed-ticket immutability UX | **IMPLEMENTED** |
| Nav entry | **IMPLEMENTED** |
| Focused unit tests | **IMPLEMENTED** |

### Explicit non-starts

- R11-E closure audit
- R10-E/F health uploads / consult-note projection
- R12+ CRM/marketing/analytics
- Mobile Support Desk UI
- `reveal-pii` endpoint (no R11-A API — deferred TD-R11A-04)
- New support kernel / duplicate logic in UI
- Clinical payload access (health timeline, labs, imaging, prescriptions, care-nav narratives)
- API or migration changes

---

## 2. Files changed

### Web-admin — Support Desk UI

- `apps/web-admin/src/support-desk-api.ts` — **NEW** — admin support API client
- `apps/web-admin/src/support-desk-list.tsx` — **NEW** — queue/list view
- `apps/web-admin/src/support-desk-ticket.tsx` — **NEW** — ticket detail + mutations
- `apps/web-admin/src/support-desk.spec.tsx` — **NEW** — focused tests (12)
- `apps/web-admin/src/nav.ts` — Support Desk nav item (`support:read`)
- `apps/web-admin/app/support/page.tsx` — **NEW**
- `apps/web-admin/app/support/[id]/page.tsx` — **NEW**

### Documentation

- `docs/blueprint/201_R11_D_SUPPORT_DESK_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. Support Desk UI routes

| Route | Component | Permission |
|-------|-----------|------------|
| `/support` | `SupportDeskList` | `support:read` (nav); API enforces |
| `/support/[id]` | `SupportDeskTicket` | read via API; mutations require `support:manage` in UI + API |

Country scoping via `?country=XX` query param (matches R11-A `country_code` contract).

---

## 4. API integration

All data and mutations use existing R11-A endpoints:

| Method | Route | UI usage |
|--------|-------|----------|
| GET | `/admin/support/queues` | Queue filter + escalation targets |
| GET | `/admin/support/tickets` | List view |
| GET | `/admin/support/tickets/:id` | Detail + refresh after mutation |
| POST | `/admin/support/tickets/:id/assign` | Assignment form |
| POST | `/admin/support/tickets/:id/status` | Status transition |
| POST | `/admin/support/tickets/:id/messages` | Customer reply / internal note |
| POST | `/admin/support/tickets/:id/escalate` | Queue reassignment |

No duplicate support logic in UI — state machine transitions are UX hints only; server is authoritative.

---

## 5. Auth / RBAC

| Permission | Capability |
|------------|------------|
| `support:read` | Nav + list + ticket detail |
| `support:manage` | Assign, status, messages, escalate |

403 → `PermissionDeniedState` (list) or inline error (mutations). No clinical permissions granted.

---

## 6. PHI / security boundary

UI exposes only operational ticket metadata from admin APIs:

- Ticket ID, subject, status, queue
- Opaque person ID (truncated in list)
- Structured `reference_type` / `reference_id` only
- Message bodies (operational — not clinical kernel data)

Does **not** link to health timeline, lab reports, imaging, prescriptions, or care-nav governance. Internal notes labeled distinctly; customer Help Center remains separate (R11-C).

---

## 7. Tests (exact counts)

### Focused R11-D

| Suite | Tests | Result |
|-------|-------|--------|
| `web-admin` — `support-desk.spec.tsx` | **12** | **PASS** |

Covers: API helpers, list render, 403/500 states, ticket detail, 404, read-only without `support:manage`, closed ticket notice, 409 API client.

### Regression

| Suite | Tests | Result |
|-------|-------|--------|
| `r11a.cms-support-kernel.e2e` | **4** | **PASS** |
| `web-admin` — `cms-admin.spec.tsx` | **5** | **PASS** |
| `web-customer` help tests | **7** | **PASS** |
| `mobile` — `help-parity.spec.ts` | **3** | **PASS** |
| Full API suite | **205** | **PASS** |

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `web-admin:typecheck` | **PASS** |
| `web-admin:build` | **PASS** (34 routes incl. `/support`, `/support/[id]`) |
| API typecheck/build | **N/A** — no API changes |

---

## 9. Runtime verification

| Step | Result |
|------|--------|
| Docker Postgres/Redis (e2e harness) | Available via R11-A e2e |
| `/health/ready` long-lived | **NOT VERIFIED** |
| Browser Support Desk flow | **NOT VERIFIED** — no browser automation |
| Support lifecycle (assign, notes, close) | **VERIFIED** via R11-A e2e kernel |

---

## 10. Database / migration

**No migration.** R11-A schema fully supports R11-D UI.

---

## 11. Technical debt (carried forward)

| ID | Classification | Status |
|----|----------------|--------|
| OD-CMS-01 | product | Open |
| TD-R11A-04 `reveal-pii` | deferred scope | Open — no API |
| TD-R11B-01/02/03 | product / test infra | Open |
| TD-R11C-01/02/03/04 | product / test infra / ops | Open |
| Queue membership v1 | architecture | Open — country + RBAC only |
| TD-R11D-01 browser E2E | test infrastructure | **NEW** |
| TD-R11D-02 runtime verification | environment/ops | **NEW** |
| TD-R11D-03 assignee UUID manual entry | product | **NEW** — session has no personId |
| Shared-DB test pollution | test infrastructure | Known |

---

## 12. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | COMPLETE |
| R10-E/F | NOT STARTED | NOT STARTED |
| R11-A/B/C | COMPLETE | COMPLETE |
| **R11-D** | **IMPLEMENTED** | **IMPLEMENTED** |
| R11-E | NOT STARTED | NOT STARTED |
| R12+ | NOT STARTED | NOT STARTED |

---

## 13. Next step

**HARD STOP.** Do not start R11-E or R12+.

**Next authorization:** **`CR-POST-R11-D-AUDIT-202`**
