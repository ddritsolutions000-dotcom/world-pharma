# 194 — Post-R11 plan audit

**CR:** CR-POST-R11-PLAN-AUDIT-194  
**Verdict:** **R11_PLAN_GREEN_R11_A_READY**  
**Date:** 29 August 2026  
**Audited plan:** [193](193_R11_IMPLEMENTATION_PLAN.md)  
**Baseline:** [192](192_POST_R10_D_AUDIT.md) (**R10_GREEN_CLOSED_R11_READY_FOR_PLANNING**)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## Executive summary

Independent audit confirms **Book 193 is a sound, internally consistent R11 implementation plan** aligned with Book 93 (R11 = CMS + Help Center + Support Desk), Books [17](17_ADMIN_ERP.md) / [15](15_CRM_PLATFORM.md) admin/support specs, and repository truth verified 29 Aug 2026.

**No product, security, database, or architecture blockers** prevent authorization of **CR-R11-A-IMPL-195**.

Minor **documentation debt** is recorded (CR ID collision in Book 193 §5, `cms_editor` role not yet in RBAC catalog, help API pagination not enumerated, category taxonomy deferred to IMPL) — none require plan revision before R11-A.

**No R11 implementation code exists** in the repository. R10-E/F and R12+ are not planned in Book 193.

---

## Audit scope

Documentation-only audit of CR-R10-PLAN-R11-193 (Book 193) against Books [192](192_POST_R10_D_AUDIT.md), [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md), [35](35_OPEN_DECISIONS.md), and live repository inspection. **No code, schema, migration, test, or configuration changes.**

---

## 1. Current-state verification

### 1.1 CMS — Book 193 classifications **CONFIRMED**

| Claim | Audit | Evidence |
|-------|-------|----------|
| CMS Prisma models **MISSING** | **CONFIRMED** | `schema.prisma` — no `cms_*` tables |
| CMS API module **MISSING** | **CONFIRMED** | No `apps/api/src/cms/` |
| Admin CMS UI **MISSING** | **CONFIRMED** | `web-admin/src/nav.ts` — no cms/help entries |
| Publishing pattern **REUSABLE** | **CONFIRMED** | `PolicyPack` publish; `CatalogItem` publish workflow |
| Country/i18n **REUSABLE** | **CONFIRMED** | `Country`, `CatalogItemI18n`, `PolicyPack.document.i18n` |
| Object storage **REUSABLE** | **CONFIRMED** | `apps/api/src/partner/object-store.ts`, `catalog/assets.ts` |
| OD-CARE-02 pack strings **PARTIAL** | **CONFIRMED** | Hardcoded `care-nav-utils.ts`; no CMS tables |

### 1.2 Help Center — Book 193 classifications **CONFIRMED**

| Claim | Audit | Evidence |
|-------|-------|----------|
| `/help` routes **MISSING** | **CONFIRMED** | No `apps/web-customer/app/help/` |
| FAQ/KB content **MISSING** | **CONFIRMED** | No content models |
| Commerce search **EXISTS** | **CONFIRMED** | `CatalogSearchDocument`, `GET /api/v1/catalog/search` |
| Content search **MISSING** | **CONFIRMED** | No help index table |
| Support deep link **PARTIAL** | **CONFIRMED** | `customer-shell.tsx` → `/account/support` only |

### 1.3 Support — Book 193 classifications **CONFIRMED**

| Claim | Audit | Evidence |
|-------|-------|----------|
| Redis `SupportService` **PARTIAL** | **CONFIRMED** | `support.service.ts` — create/list only; `support:tickets:{personId}` |
| Customer UI **EXISTS** | **CONFIRMED** | `support-page.tsx`, mobile `SupportScreen` |
| Postgres tickets **MISSING** | **CONFIRMED** | No Prisma support models |
| State machine **PARTIAL** | **CONFIRMED** | Type `OPEN\|PENDING\|CLOSED`; no transitions |
| Vendor structured refs **EXISTS** | **CONFIRMED** | `vendor-support.controller.ts` — validates order/settlement/shipment |
| Agent desk **MISSING** | **CONFIRMED** | No `admin/support` controller |
| `company_support` **PARTIAL** | **CONFIRMED** | `authority.ts` L244–246 — `user:read`, `order:read`, `appointment:read`, `logistics:read` only |
| `SUPPORT_TICKET_*` events **STUB** | **CONFIRMED** | `envelope.ts` L113–114; **not emitted** from `SupportService` |
| `support_updates` pref **PARTIAL** | **CONFIRMED** | `notification.service.ts` L12/L24; dispatch maps to `order_updates` (Book 193 §8.4) |

---

## 2. Canonical R11 scope

| Check | Result |
|-------|--------|
| R11 = CMS + Help Center + Support Desk | **PASS** — Book 193 §3 matches Book 93 §R11 |
| R10-E uploads excluded | **PASS** — §0, §3 explicit |
| R10-F consult-note excluded | **PASS** |
| Caregiver proxy excluded | **PASS** |
| Clinical diagnosis / auto-Rx excluded | **PASS** |
| Live money / production healthcare excluded | **PASS** — §21 |
| R12 CRM/marketing excluded | **PASS** — §22 |
| R13 analytics search excluded | **PASS** — §16 deterministic Postgres only |
| No R11 code in repository | **PASS** |

---

## 3. Architecture / kernel reuse

| Kernel | Duplicate planned? | Audit |
|--------|-------------------|-------|
| Identity / JWT / audience guards | **NO** | Reuse existing guards |
| RBAC | **NO** | New `cms:*`, `support:*` permissions only |
| Policy (resolver/cache) | **NO** | `PolicyResolver` + `PolicyCache` exist — optional pack flags |
| Security events / outbox | **NO** | Extend envelope; reuse `OutboxService` |
| Notifications | **NO** | Reuse `NotificationService` + dispatch |
| Object storage | **NO** | Reuse `PrivateObjectStore` pattern |
| Search | **NO** | New `cms_content_search_documents` — mirrors `CatalogSearchDocument` |
| Health / consent | **NO** | Support agents default **no** clinical read |
| Redis → Postgres support migration | **PLANNED** | §8.4 — correct; durability gap acknowledged |

---

## 4. R11-A readiness

| Check | Result |
|-------|--------|
| R11-A = schema + RLS + CMS kernel + support kernel + e2e | **PASS** — §5 |
| Excludes CMS admin UI | **PASS** — deferred to R11-B |
| Excludes Help Center UI | **PASS** — deferred to R11-C |
| Excludes Support agent UI | **PASS** — deferred to R11-D |
| Excludes closure audit | **PASS** — R11-E |
| State machines specified | **PASS** — §12 |
| Permissions specified | **PASS** — §6.4, §10.5 |
| PHI boundaries specified | **PASS** — §14 |
| APIs for later phases | **PASS** — admin CMS + help read + support CRUD in §10 |

**Note:** R11-A is a substantial kernel phase (CMS + support together) but follows R10-A precedent (schema + services + RLS + focused e2e). Acceptable.

---

## 5. CMS plan audit

| Requirement | Status |
|-------------|--------|
| Draft / review / publish / archive | **PASS** — §12.1 state machine |
| Immutable published versions | **PASS** — §6.3, ED-R11-06 |
| Version history | **PASS** — `cms_content_revisions` + publications |
| Country + locale scope | **PASS** — §6.5 |
| Author/editor/reviewer roles | **PASS** — proposed permissions; `cms_editor` role **not yet in** `rbac.service.ts` (IMPL adds) |
| Auditability | **PASS** — security events per transition |
| OD-CMS-01 not resolved | **PASS** — remains OPEN; 422 on blocked publish |
| Seven content types justified | **PASS** — §6.1 maps to Book 93 + OD-CARE-02 bridge |
| CMS not clinical engine | **PASS** — §6 explicit |

**Minor debt:** Category taxonomy (separate `cms_categories` table vs slug/type) left to R11-A IMPL — not a plan blocker.

---

## 6. Help Center plan audit

| Requirement | Status |
|-------------|--------|
| Published-only reads | **PASS** — RLS + 404 for drafts |
| Category browse + article detail | **PASS** — §7, §10.2 |
| Search (deterministic) | **PASS** — §16 |
| Country/locale filtering | **PASS** |
| Web/mobile parity | **PASS** — §7.3 |
| Loading/error/empty states | **PASS** — §7.2 references R10-B matrix |
| No admin leakage | **PASS** — public APIs query publications table only |
| Pagination | **DOCUMENTATION DEBT** — not explicit in §10.2; ED default cursor/limit in IMPL |

---

## 7. Support Desk plan audit

| Requirement | Status |
|-------------|--------|
| Durable Postgres tickets | **PASS** — §9.2 |
| Queues + assignment | **PASS** — §8.1, §9.2 |
| Customer ownership | **PASS** — RLS `person_id` |
| Customer vs internal messages | **PASS** — `visibility` enum |
| Full state machine | **PASS** — §12.2 (extends Redis 3-state) |
| Audit append-only events | **PASS** — `support_ticket_events` |
| Notifications + idempotency | **PASS** — §15 |
| Structured refs operational only | **PASS** — §8.3 |
| Agents **NO** clinical payload | **PASS** — §8.2, OD-R11-07 |
| R9 consent not bypassed | **PASS** — explicit |

---

## 8. Database plan audit

| Table | Rationale | RLS | Append-only | PHI |
|-------|-----------|-----|-------------|-----|
| `cms_content_items` | Stable slug identity | FORCE | — | None |
| `cms_content_revisions` | Draft working copy | FORCE | — | None |
| `cms_content_publications` | Immutable publish | FORCE | **Yes** (insert-only policy) | None |
| `cms_content_assets` | Media metadata | FORCE | — | None |
| `cms_content_search_documents` | Help search denorm | FORCE | Rebuilt on publish | None |
| `support_queues` | Multi-queue catalog | FORCE | — | None |
| `support_tickets` | Durable header | FORCE | — | Metadata |
| `support_ticket_messages` | Thread | FORCE | — | User-provided risk |
| `support_ticket_events` | Audit trail | FORCE | **Yes** | Operational |
| `support_ticket_attachments` | File metadata | FORCE | — | OD-R11-09 |

**Requirements:** FORCE RLS, no `USING(true)`, `worldpharma_app` NOSUPERUSER + NOBYPASSRLS — **specified** in §9.3 (matches R10/R9 pattern).

**Minor debt:** Per-table FK/index/unique constraints not fully enumerated — acceptable at plan stage; R11-A migration CR must detail.

---

## 9. API inventory audit

| Area | Coverage | Result |
|------|----------|--------|
| Admin CMS (9 routes) | method, actor, authZ, scope, idempotency, PHI, audit | **PASS** |
| Public help (5 routes) | published-only, country/locale | **PASS** |
| Customer support (5 routes) | ownership, idempotency | **PASS** |
| Vendor support (2 routes) | org scope | **PASS** |
| Agent support (8 routes) | permission gated | **PASS** |
| Error codes | 400/401/403/404/409/422 | **PASS** |

Public help routes correctly omit auth for read. Cross-customer isolation via 404 specified.

---

## 10. State-machine audit

### CMS: `DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`

| Check | Result |
|-------|--------|
| Valid transitions documented | **PASS** — §12.1 |
| Invalid → 409 | **PASS** |
| Actors per transition | **PASS** |
| Terminal: ARCHIVED | **PASS** |
| Concurrency (optimistic version) | **PASS** |

### Support: `OPEN → ASSIGNED → IN_PROGRESS ⇄ WAITING_CUSTOMER → RESOLVED → CLOSED`

| Check | Result |
|-------|--------|
| Extends existing Redis states | **PASS** — `PENDING` → `WAITING_CUSTOMER` mapping |
| Terminal: CLOSED | **PASS** |
| Idempotency on transitions | **PASS** — ED-R11-08 |
| Audit events | **PASS** — §15 |

Repository has no conflicting state machine — plan model is appropriate.

---

## 11. Security / RLS / authorization

| Negative test | Planned |
|---------------|---------|
| Unauthenticated admin/help abuse | **PASS** — §13.3 |
| Wrong customer ticket | **PASS** |
| Wrong country/org | **PASS** |
| Unauthorized agent | **PASS** |
| Unpublished content | **PASS** |
| Malformed IDs | **PASS** |
| Disabled pack | **PASS** — ED-R11-01 |
| Terminal ticket mutation | **PASS** — §12.2 |
| Internal notes to customer | **PASS** — visibility enum + RLS |

**DB-level isolation required** — plan specifies FORCE RLS policies, not app-only checks. **PASS**.

---

## 12. PHI / privacy audit

| Surface | Classification in plan | Result |
|---------|-------------------------|--------|
| Help articles | Public/operational | **PASS** |
| Ticket metadata | Operational | **PASS** |
| Customer messages | User-provided risk | **PASS** |
| Internal notes | Sensitive, agent-only | **PASS** |
| Clinical payloads | **NOT** for support default | **PASS** |
| Notifications/outbox | Opaque IDs | **PASS** — §14, §15 |

---

## 13. Notifications / outbox audit

| Check | Result |
|-------|--------|
| Reuses existing kernel | **PASS** |
| `SUPPORT_TICKET_*` + proposed CMS events | **PASS** |
| Fix `order_updates` → `support_updates` | **PASS** — §8.4 |
| Occurrence keys | **PASS** — §15 |
| No clinical/ticket body in payloads | **PASS** |

---

## 14. Search strategy audit

| Check | Result |
|-------|--------|
| Postgres deterministic (no vendor) | **PASS** — §16 |
| Published-only filter | **PASS** |
| Separate from commerce index | **PASS** |
| Country/locale | **PASS** |
| Safe query validation | **IMPL** — plan defers SQL injection guards to R11-A |

---

## 15. Open decisions

| ID | Status in plan |
|----|----------------|
| OD-R11-01 … OD-R11-14 | **Explicit** — §17 |
| OD-CMS-01 | **OPEN** — not silently resolved |
| OD-SUP-01 | **OPEN** — ticket-first default |

**PASS** — legal/product decisions not assumed away.

---

## 16. Engineering defaults

`ED-R11-01` … `ED-R11-12` favor deny-by-default, immutable publish, durable Postgres, PHI-minimal notifications, kernel reuse. **PASS**.

---

## 17. Acceptance gates

Per-phase gates in §19 cover e2e, RLS, auth negatives, state-machine, idempotency, PHI, migration, typecheck, build, runtime. Closure target `R11_GREEN_CLOSED_R12_READY_FOR_PLANNING`. **PASS** — gates not weakened.

---

## 18. Regression requirements

R0–R10 preservation, R9 consent, R10 care-nav safety, R7/R8 clinical boundaries — **PASS** §20. Book 192 test debt carried forward with “do not worsen” — **PASS**.

---

## 19. Production boundaries

Live PSP, money, carriers, production healthcare, PACS, LIS/HIS, live e-Rx, refill, LiveKit, recording — **OFF** in §21. **PASS**.

---

## 20. Technical debt (re-verified)

| Item | Classification | Present? |
|------|----------------|----------|
| Shared-DB policy-pack pollution | test infrastructure | **Yes** |
| `doctor.e2e` flake | test infrastructure | **Yes** |
| Appointment slot contention | test infrastructure | **Yes** |
| Dev XX pack defaults | environment/ops | **Yes** |
| `pnpm` PATH | environment/ops | **Yes** |
| Redis support tickets | product debt → R11-A fixes | **Yes** |
| Support events not emitted | product debt → R11-A fixes | **Yes** |
| `support_updates` UI gap | product debt → R11-D | **Yes** |

No stale debt incorrectly carried.

---

## 21. R12 boundary

CRM, marketing, loyalty, affiliate, reviews, personalization, analytics — **deferred** §22. No R12 implementation planned. **PASS**.

---

## 22. Documentation debt (non-blocking)

| Item | Classification |
|------|----------------|
| Book 193 §5 CR ID `CR-R11-A-IMPL-194` collides with audit CR-194 | documentation |
| `cms_editor` role referenced but not in `rbac.service.ts` | documentation (IMPL adds) |
| Help list/search pagination not in API table | documentation |
| `CMS_*` events not yet in `envelope.ts` | documentation (IMPL adds) |
| Category taxonomy table TBD | documentation |

None block R11-A authorization.

---

## 23. Verdict

**`R11_PLAN_GREEN_R11_A_READY`**

---

## 24. Next authorization

**`CR-R11-A-IMPL-195`** — R11-A backend kernel only (Postgres schema, RLS, CMS content kernel, support ticket kernel migration from Redis, focused e2e). Do **not** start R11-B/C/D/E, R10-E/F, or R12+ without separate IMPL CRs.
