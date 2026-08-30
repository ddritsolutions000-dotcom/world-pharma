# Post-R11-A Audit

**CR:** `CR-POST-R11-A-AUDIT-196`  
**Verdict:** **`R11_A_GREEN_R11_B_READY`**  
**Baseline:** [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) (**R11_A_IMPLEMENTED**)  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. No source, schema, migration, API, UI, test, or configuration changes were made.

---

## 1. Executive summary

R11-A backend kernel **matches repository reality** and Book 195 for all core deliverables: Postgres CMS + support schemas with FORCE RLS, state machines, admin/public/customer APIs, Redis durable-ticket removal, outbox/notifications, focused e2e, typecheck, and build.

**No product, security, database, or architecture blockers** prevent authorization of **CR-R11-B-IMPL-197**.

Known gaps are **explicit open decisions** (OD-CMS-01, OD-SUP-01, OD-R11-*) or **classified debt** carried forward from Books 194–195 — not silent deferrals.

---

## 2. Implementation verification (Book 195 vs repository)

### CMS kernel — **PASS**

| Claim | Verified |
|-------|----------|
| `CmsContentItem`, `CmsContentRevision`, `CmsContentPublication` | Present in `schema.prisma` |
| `CmsContentAsset`, `CmsContentSearchDocument`, `CmsContentAudit` | Present (assets schema only; see §8) |
| `cms-status.ts`, `cms-content.service.ts`, `cms-search.service.ts` | Present |
| `admin-cms.controller.ts`, `help-center.controller.ts` | Present |
| `CmsModule` registered in `app.module.ts` | Yes |
| Country/locale scoping | `country_code` + `(countryId, slug, locale)` unique |
| Publication immutability | RLS no-update on `cms_content_publications`; insert-only |
| Deterministic search | `cms-search.service.ts` — title/slug asc ordering |

### Support kernel — **PASS**

| Claim | Verified |
|-------|----------|
| Postgres `support_queues`, `support_tickets`, `support_ticket_messages`, `support_ticket_events`, `support_ticket_attachments` | Present |
| `support-status.ts`, `platform/support.service.ts` (Postgres) | Present |
| `admin-support.service.ts`, `admin-support.controller.ts` | Present |
| Redis durable list removed | No `support:tickets:{personId}` / `lpush` in `support.service.ts` |
| Single durable kernel | Postgres authoritative; Redis only for notification inbox cache |

### Minor Book 195 nuance

Book 195 lists `cms:review` as “implemented.” Permission exists in RBAC catalog and role grants, but **publish flow does not require `cms:review`** (OD-CMS-01 deferred). Classified as **product debt**, not documentation blocker.

---

## 3. CMS state-machine assessment — **PASS**

**Implemented transitions** (`cms-status.ts`):

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED` (+ `ARCHIVED → PUBLISHED` re-publish, `IN_REVIEW → DRAFT` reject)

| Check | Result |
|-------|--------|
| Invalid transition → 409 conflict | `assertCmsTransition` |
| Unauthorized publish → 403 | E2e: editor cannot publish |
| Published snapshot immutable | Publications RLS no-update |
| Archive unpublishes search doc | `cms-search.service.unpublishDocument` |
| Version history retained | Revisions + publications tables |
| Client cannot forge state | Status updated only via service methods |
| Idempotent publish | `(contentItemId, idempotencyKey)` unique + e2e |
| Optimistic version | `expected_version` on PATCH |

**OD-CMS-01 dual-control:** **NOT implemented.** Publish requires `cms:publish` only; `cms:review` unused in controllers.  
**Classification:** **non-blocking product debt** (open decision OD-CMS-01; Book 194 explicitly allows 422-on-block when OD resolves — not required for R11-A kernel green).

---

## 4. Support state-machine assessment — **PASS**

**Implemented transitions** (`support-status.ts`):

`OPEN → ASSIGNED → IN_PROGRESS ⇄ WAITING_CUSTOMER → RESOLVED → CLOSED` (+ direct `OPEN/CLOSED`, customer close paths)

| Check | Result |
|-------|--------|
| Terminal `CLOSED` immutability | E2e 409 on post-close message |
| Customer vs agent permissions | JWT ownership + `support:manage` admin |
| Internal notes hidden from customer | RLS `visibility = CUSTOMER` filter + e2e |
| Optimistic version | `updateMany` with version check |
| Idempotency | Ticket `(personId, idempotencyKey)`; message `(ticketId, idempotencyKey)` |

**TD-R11A-02 customer close:** Limited to `OPEN` and `WAITING_CUSTOMER` via `customerMayClose()`.  
**Classification:** **non-blocking product debt** per Book 193 optional OD-R11-05; behavior explicit and tested.

**Queue membership:** Assignment checks `support:manage` + country tenant context only — **no per-agent queue membership table**.  
**Classification:** **architecture/product debt v1**; country isolation enforced; not a security blocker.

---

## 5. Database / migrations — **PASS (with env caveat)**

| Check | Result |
|-------|--------|
| Four R11-A migrations present | `20260829190000`–`20260829190300` |
| Schema matches Prisma models | Verified |
| FKs, indexes, uniques | Per schema + migration SQL |
| Append-only publications/revisions/events | RLS no-update policies |
| FORCE RLS on all R11 tables | Verified in migration SQL |
| No `USING(true)` on R11 CMS/support | Grep clean |

**Migration tooling:** `prisma migrate deploy` as `worldpharma_app` fails on `_prisma_migrations` RLS (expected ops pattern). Jest bootstrap + prior deploy applied R11 migrations; **R11-A e2e passes**, confirming tables/policies live on test DB.

**`worldpharma_app` role:** Not re-verified via `psql` (not in PATH). Inherited from R0–R10 baseline; no R11-A change weakens role attributes.

---

## 6. CMS security / RLS — **PASS**

| Check | Mechanism |
|-------|-----------|
| Drafts invisible to public | Help APIs query `published=true` search docs; items worker-only RLS |
| Unpublished slug → 404 | E2e draft article 404 on `/help/articles/:slug` |
| Wrong country | `can_country` + `country_code` resolution |
| Unauthorized editor/publisher | PermissionsGuard + e2e 403 |
| Malformed UUID | `assertUuid` → validation error |
| Archived content | Search doc `published=false`; public 404 |

Service layer + DB isolation aligned for R11-A scope.

---

## 7. Support security / RLS — **PASS**

| Check | Result |
|-------|--------|
| Customer A ≠ Customer B | E2e 404/403 cross-ticket |
| Internal notes | RLS + customer API filter; e2e |
| Closed ticket mutation | E2e 409 |
| Agent clinical access | No health/clinical imports in cms/support modules |
| R9 consent/RLS | No changes to R9 health modules or break-glass paths |

Support references remain opaque IDs (`reference_type` / `reference_id`); no clinical payload APIs added.

---

## 8. API audit — **PASS with documented gaps**

### Implemented (Book 193 §10)

| Route group | Status |
|-------------|--------|
| Admin CMS content CRUD/lifecycle | **YES** |
| Help public read | **YES** |
| Customer support tickets/messages/close | **YES** |
| Admin support queues/tickets/assign/messages/status/escalate | **YES** |
| Vendor support (existing) | **YES** — Postgres-backed |

### Not implemented (deferred)

| Route | Status | Classification |
|-------|--------|----------------|
| `POST /admin/cms/assets` | Schema only, no controller | **deferred scope → R11-B** (media upload UI) |
| `POST /admin/support/tickets/:id/reveal-pii` | Absent | **TD-R11A-04 deferred → R11-D** |
| Support attachment upload APIs | Schema only | **deferred scope** (R10-E / R11-D) |

No R11-D agent UI or unrestricted agent surface beyond planned admin JSON APIs.

---

## 9. PHI / privacy — **PASS**

- CMS/help: operational/public classification; no clinical joins.
- Support outbox payloads: `ticket_id`, `queue_code`, `status`, `person_id` — no bodies.
- Notifications: generic “Open the app for details” body.
- Security events: operational metadata only.
- No exposure paths for health timeline, lab, imaging, Rx, care-nav narratives, or break-glass through support APIs.

---

## 10. Notifications / outbox — **PASS**

| Event | Emitted | Pref |
|-------|---------|------|
| `SUPPORT_TICKET_CREATED` | Yes | `support_updates` |
| `SUPPORT_TICKET_ASSIGNED` | Yes | `support_updates` |
| `SUPPORT_TICKET_CUSTOMER_REPLY` | Yes (plan alias: MESSAGE) | `support_updates` |
| `SUPPORT_TICKET_AGENT_REPLY` | Yes | `support_updates` |
| `SUPPORT_TICKET_RESOLVED` / `CLOSED` | Yes | `support_updates` |
| `CMS_CONTENT_PUBLISHED` / `ARCHIVED` | Yes | — |

Occurrence keys present. No ticket bodies or internal notes in payloads.

---

## 11. Idempotency / concurrency — **PASS**

E2e + schema constraints cover duplicate ticket create, duplicate publish, closed-ticket rejection, queue upsert race (fixed in impl-195). Publication/version uniques enforced at DB level.

---

## 12. Redis → Postgres — **PASS**

Redis no longer stores durable support tickets. Postgres is authoritative. Customer list/create/read paths use Prisma. Notification inbox remains Redis — non-authoritative, transient.

---

## 13. Search audit — **PASS**

Postgres `cms_content_search_documents`; published-only; country + locale filters; deterministic `orderBy`; query length cap; no external search vendor. Upsert on publish; unpublish on archive.

---

## 14. Audit / governance — **PASS**

Append-only: `cms_content_audits`, `support_ticket_events`, immutable publications/revisions RLS. Security events for CMS lifecycle and support assignment/messages. Unauthorized attempts covered by existing 401/403/404 patterns in e2e.

---

## 15. Test results

### Focused R11-A

| Suite | Result |
|-------|--------|
| `r11a.cms-support-kernel.e2e.spec.ts` | **4/4 PASS** |

### Regression spot-check

| Suite | Result |
|-------|--------|
| `r10d.care-nav-governance.e2e.spec.ts` | **4/4 PASS** |
| `r9d.doctor-health.e2e.spec.ts` | **3/3 PASS** |
| `r6e.vendor.e2e.spec.ts` | **1/1 PASS** |

### Full API suite

| Metric | Result |
|--------|--------|
| Total | **204/205 PASS** |

**Failure (test infrastructure):**

1. **Suite:** `partner.e2e.spec.ts`
2. **Test:** partner status transition (line ~154)
3. **Error:** expectation failure on concurrent suite run
4. **Isolated rerun:** **6/6 PASS**
5. **Classification:** **test infrastructure** (shared-DB pollution; consistent with Book 192/194)

---

## 16. Typecheck / build — **PASS**

- `tsc --noEmit` (apps/api): **PASS**
- `nx run api:build`: **PASS**

R11-B/C/D UI builds not required.

---

## 17. Runtime verification

| Step | Result |
|------|--------|
| Redis `:56379` | Available |
| Postgres `:55432` | Used successfully by e2e |
| Long-lived API + `/health/ready` curl | **Not performed** (no persistent server) |
| HTTP CMS/support lifecycle | **Verified via R11-A e2e** (real Nest HTTP) |

E2e substitutes for manual curl where API process was not left running.

---

## 18. Regression safety — **PASS**

No R11-A changes to R9 health/consent/break-glass, R10 care-nav, R7/R8 clinical, payment, or logistics modules. Spot-check suites green. Full-suite flake is pre-existing infrastructure noise.

---

## 19. Boundary verification — **PASS**

| Phase | Required | Actual |
|-------|----------|--------|
| R10-A…D | COMPLETE | COMPLETE |
| R10-E/F | NOT STARTED | NOT STARTED |
| R11-A | IMPLEMENTED | IMPLEMENTED |
| R11-B/C/D/E | NOT STARTED | NOT STARTED |
| R12+ | NOT STARTED | NOT STARTED |

No CMS admin UI, Help Center UI, Support Desk UI, R12 CRM, marketing, loyalty, analytics, caregiver proxy, clinical automation, live money, or production healthcare integrations detected.

---

## 20. Technical debt re-verification

| ID | Classification | Blocker? |
|----|----------------|----------|
| TD-R11A-01 OD-CMS-01 dual-control | **product debt** | No |
| TD-R11A-02 customer close scope | **product debt** | No |
| TD-R11A-03 prisma generate EPERM | **environment/ops** | No |
| TD-R11A-04 reveal-PII | **deferred scope → R11-D** | No |
| Book 194 shared-DB pollution | **test infrastructure** | No |
| Missing `POST /admin/cms/assets` | **deferred scope → R11-B** | No |
| Queue membership simplification | **architecture/product debt v1** | No |
| OD-R11-14 pack gates not implemented | **product debt** | No |

---

## 21. Open decisions (unchanged)

| Decision | Status |
|----------|--------|
| OD-CMS-01 | **OPEN** — dual-control publish |
| OD-SUP-01 | **OPEN** — chat vs ticket |
| OD-R11-01 … OD-R11-14 | **OPEN** — per Book 193 §17 |

Not silently resolved.

---

## 22. Verdict

### `R11_A_GREEN_R11_B_READY`

**Next authorization:** **`CR-R11-B-IMPL-197`**
