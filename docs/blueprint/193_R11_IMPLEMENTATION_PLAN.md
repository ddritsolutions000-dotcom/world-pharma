# 193 — R11 CMS + Help Center + Support Desk implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R10-PLAN-R11-193**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R11_PLAN_READY**

**Prerequisite:** R10 closed — **R10_GREEN_CLOSED_R11_READY_FOR_PLANNING** ([192](192_POST_R10_D_AUDIT.md)). R9 closed ([182](182_POST_R9_FINAL_CLOSURE_AUDIT.md)).

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [192](192_POST_R10_D_AUDIT.md) · [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) · [17](17_ADMIN_ERP.md) · [15](15_CRM_PLATFORM.md) · [35](35_OPEN_DECISIONS.md) · [27](27_SECURITY_ARCHITECTURE.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · [23](23_NOTIFICATION_ARCHITECTURE.md) · `packages/database/prisma/schema.prisma` · `apps/api/src/platform/*` · `apps/api/src/catalog/search.service.ts`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R11-A/B/C/D/E implementation. **Do not** start R10-E/F or R12+. **Do not** enable live PSP/carriers/payouts, production healthcare, live e-Rx, recording, or production integrations.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R11** wave so future **CR-R11-*-IMPL** work can deliver Book 93 acceptance:

> **One CMS** (blog, education, news, landings, banners, FAQ, KB) with country-targeted publish; **one Help Center** for customer browse/search; **one Support Desk** (multi-queue, ticket-first) with minimum-necessary links and no unrestricted clinical paste.

…without duplicating identity/RBAC, consent, health record, appointments, video, payment, logistics, notification/outbox, or security-event kernels; **without** absorbing R10-E/F, caregiver proxy, CRM/marketing (R12), or platform analytics search (R13).

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R11 IMPL authorization | Requires future **CR-R11-*-IMPL-*** |
| R10-E/F implementation | Separate CR scope |
| R12+ planning / implementation | Explicit hard stop |
| Chat-first support (until OD-SUP-01 resolved) | Ticket-first default |
| External search vendor (Elasticsearch, etc.) | R11 v1 deterministic DB search |
| Support agent clinical payload access by default | R9 consent/RLS; OD-R11-07 |
| Per-app CMS or notification engines | Kernel lock ([93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §2) |
| Live money / carriers / production healthcare | **R14** + production boundary |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated where applicable, fail-closed — build when IMPL-authorized |
| **LEGAL** | Human/legal gate — blocks enablement, not necessarily planning |
| **PRODUCT** | Product decision — document as OD-R11-* if unresolved |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Canonical current state (verified 29 Aug 2026)

| Claim | Verified | Evidence |
|-------|----------|----------|
| R10 core closed | **YES** | [192](192_POST_R10_D_AUDIT.md) |
| R9 consent/RLS closed | **YES** | [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) |
| CMS product code | **NO** | No Prisma CMS models; no `cms` API module |
| Help Center customer UI | **NO** | No `/help`, FAQ, or KB routes |
| Support ticket kernel (Redis) | **PARTIAL** | `apps/api/src/platform/support.service.ts` |
| Support customer UI | **YES** | `web-customer` `/account/support`; mobile `SupportScreen` |
| Support admin/agent desk | **NO** | No admin support module in `web-admin` nav |
| Notification kernel | **YES** | `notification.service.ts`, inbox + prefs |
| `SUPPORT_TICKET_*` outbox events | **STUB** | Defined in `envelope.ts`; **not emitted** from `SupportService` |
| Catalog search index | **YES** | `CatalogSearchDocument` + `search.service.ts` — **commerce only** |
| Private object store | **YES** | `object-store.ts` (KYC pattern) — reusable for CMS media / attachments |
| `company_support` RBAC role | **PARTIAL** | `rbac.service.ts`; read-only order/appointment/logistics — no `support:*` ticket APIs |
| OD-CMS-01 / OD-SUP-01 | **OPEN** | [35](35_OPEN_DECISIONS.md) |
| 82 migrations applied | **YES** | Book 192 verification |

---

## 2. Current-state repository audit

Classification key: **EXISTS** · **PARTIAL** · **REUSABLE** · **MISSING** · **DEFERRED** · **OUT OF SCOPE**

### 2.1 CMS

| Capability | State | Evidence |
|------------|-------|----------|
| Content/article Prisma models | **MISSING** | `schema.prisma` — no CMS tables |
| CMS API module | **MISSING** | No `apps/api/src/cms/` |
| Admin CMS UI | **MISSING** | `web-admin/src/nav.ts` — no CMS entry |
| Publishing/versioning kernel | **REUSABLE** | `PolicyPack` version + publish pattern; `CatalogItem` publish workflow |
| Country/language targeting | **REUSABLE** | `Country`, `PolicyPack.document.i18n`, `CatalogItemI18n` |
| Admin permissions pattern | **REUSABLE** | `authority.ts`, `rbac.service.ts`, company roles |
| Audit/security events | **REUSABLE** | `SecurityEvent`, outbox envelope |
| Policy/pack gating | **REUSABLE** | `PolicyCache`, `healthcare.*` flags — CMS may add `cms_enabled` (pack decision) |
| Object storage for media | **REUSABLE** | `PrivateObjectStore`, `CatalogAsset` + `LocalCatalogAssetStore` |
| Pack-string content (OD-CARE-02) | **PARTIAL** | Hardcoded care-nav copy in `care-nav-utils.ts`; `PolicyPack` i18n shell only |
| Blog/education/news/landings/banners/FAQ/KB | **MISSING** | Roadmap R11 scope |
| Medical-claim workflow | **DEFERRED** | **OD-CMS-01** — dual-control publish |
| Blueprint admin CMS spec | **DEFERRED** | [17](17_ADMIN_ERP.md) §6.29 — spec only |

### 2.2 Help Center

| Capability | State | Evidence |
|------------|-------|----------|
| Customer `/help` routes | **MISSING** | `web-customer/app` — no help routes |
| FAQ/KB browse UI | **MISSING** | — |
| Article detail / category taxonomy | **MISSING** | — |
| Content search index | **MISSING** | No `ContentSearchDocument` model |
| Commerce search | **EXISTS** | `GET /api/v1/catalog/search` — **not** help content |
| Localization | **REUSABLE** | i18n patterns in catalog + policy pack |
| Deep links | **PARTIAL** | Customer shell links to `/account/support` only |
| Web/mobile parity | **MISSING** for help | Mobile has support screen only |
| Published-only visibility | **MISSING** | No content lifecycle |

### 2.3 Support Desk

| Capability | State | Evidence |
|------------|-------|----------|
| Ticket create/list (customer) | **EXISTS** | `SupportController` — `GET/POST /api/v1/support/tickets` |
| Ticket persistence | **PARTIAL** | Redis list `support:tickets:{personId}` — **not durable** |
| Ticket state machine | **PARTIAL** | Type allows `OPEN` \| `PENDING` \| `CLOSED`; create always `OPEN`; no transitions |
| Vendor ticket create (structured refs) | **EXISTS** | `vendor-support.controller.ts` — validates order/settlement/shipment |
| Customer structured refs | **PARTIAL** | API accepts `reference_type`/`reference_id`; web embeds in free text |
| Agent/admin ticket APIs | **MISSING** | No `admin/support` controller |
| Multi-queue helpdesk | **MISSING** | Roadmap acceptance criterion |
| Assignment / escalation / SLA | **MISSING** | — |
| Customer/agent replies | **MISSING** | No message thread model |
| Internal notes | **MISSING** | — |
| Attachments | **MISSING** | No upload on tickets |
| `company_support` role | **PARTIAL** | Read order/appointment/logistics — no ticket handle perms |
| Break-glass ticket correlation | **REUSABLE** | `BreakGlassGrant.ticketId` — metadata-only link pattern |
| Support notifications | **PARTIAL** | Direct inbox enqueue on create; `SUPPORT_TICKET_*` events unused |
| `support_updates` preference | **PARTIAL** | API default exists; web/mobile UI omits toggle |
| Chat support | **OUT OF SCOPE** | **OD-SUP-01** — ticket-first until privacy review |
| CRM 360 clinical payloads | **OUT OF SCOPE** | R12; forbidden for support default ([17](17_ADMIN_ERP.md) §6.27) |

---

## 3. Canonical R11 scope

Per [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R11 — **unchanged**:

| In scope | Out of scope (explicit) |
|----------|-------------------------|
| One CMS: blog, education, news, landings, banners, FAQ, KB | R10-E health uploads |
| Country-targeted publish + versioning | R10-F consult-note projection |
| Admin authoring + review/publish workflow | Caregiver/proxy |
| Customer Help Center (browse, search, article view) | Unrelated clinical features |
| Support desk: multi-queue, ticket lifecycle, agent UX | Live healthcare / production PACS/LIS/HIS |
| Partner support queues in existing partner apps | Live money / PSP / carriers |
| Minimum-necessary ticket links (order id, booking id) | ML / autonomous diagnosis |
| Notification/outbox integration (PHI-minimal) | CRM/marketing/loyalty (R12) |
| Pack-managed operational strings where justified (OD-CARE-02 bridge) | Platform analytics/BI search (R13) |

**Acceptance (Book 93):** publish country-targeted article; create support ticket from order id **without lab values**.

---

## 4. R11 architecture and boundaries

### 4.1 Bounded contexts

```
┌─────────────────────────────────────────────────────────────────┐
│ R11 CMS (authoring kernel)                                       │
│  draft → review → publish → immutable version → archive          │
│  Admin (web-admin) only for authoring                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ published snapshots only
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ R11 Help Center (read-only consumption)                          │
│  category browse · article detail · deterministic search         │
│  Customer web + mobile · pack-public · no admin leakage          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ R11 Support Desk (case kernel)                                   │
│  ticket → queue → assign → messages → resolve → close            │
│  Customer/vendor create · agent admin desk · audit append-only   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ reuses (no duplicate)
                            ▼
 Identity/RBAC · Notification/Outbox · SecurityEvent · PolicyPack
 Order/Appointment/Booking read hooks (metadata refs only)
 PrivateObjectStore (attachments) · R9 consent boundary (no PHI paste)
```

### 4.2 Kernel reuse (mandatory)

| Kernel | R11 usage |
|--------|-----------|
| Identity / JWT / audience guards | All R11 APIs |
| RBAC + company roles | CMS publish, support agent actions |
| `PolicyCache` / country scope | CMS + help visibility; optional `cms_enabled` pack flag |
| `OutboxService` + `NotificationDispatchService` | Ticket + publish events |
| `SecurityEvent` | CMS publish, support PII reveal, escalation |
| `PrivateObjectStore` | CMS media, ticket attachments (sandbox local) |
| `CatalogSearchService` pattern | **New** `ContentSearchService` — same upsert/query pattern, separate table |
| Order / appointment / lab / imaging APIs | **Reference validation only** — opaque IDs in ticket metadata |

### 4.3 Explicit non-duplication

Do **not** create: second notification dispatcher, second identity system, second consent kernel, health timeline reader for support agents, appointment booking kernel, payment kernel, or commerce catalog CMS.

---

## 5. Proposed sub-phases

| Phase | CR target | Deliverable | Depends |
|-------|-----------|-------------|---------|
| **R11-A** | `CR-R11-A-IMPL-194` | Postgres schema + RLS; CMS content kernel; support ticket kernel (migrate from Redis); content + ticket services; focused e2e + RLS | R0 platform |
| **R11-B** | `CR-R11-B-IMPL-195` | Admin CMS UI: list, editor, review, publish, version history, media upload; permissions `cms:write`, `cms:publish` | R11-A |
| **R11-C** | `CR-R11-C-IMPL-196` | Customer Help Center web + mobile: home, categories, article, search; public read APIs | R11-A, R11-B (published content) |
| **R11-D** | `CR-R11-D-IMPL-197` | Support desk: queues, assignment, agent APIs, admin/support UI, customer/vendor reply thread, structured refs | R11-A |
| **R11-E** | `CR-R11-E-IMPL-198` + `CR-POST-R11-CLOSURE-AUDIT-199` | Integrated regression, PHI review, runtime verification, closure audit | R11-A…D |

**Rationale:** Kernel and durability first (A); authoring before customer help consumption (B→C); support desk can parallelize after A but agent UX depends on durable tickets (D). Closure (E) matches R10-E pattern.

**OD-CARE-02 bridge:** Pack-managed emergency/guidance strings may migrate from hardcoded `care-nav-utils.ts` during R11-B/C as **operational CMS content type** — not clinical decision logic.

---

## 6. CMS plan

### 6.1 Content types (v1)

| Type | Purpose | PHI class |
|------|---------|-----------|
| `ARTICLE` | Blog, news, education | Public/operational — **OD-CMS-01** for health education claims |
| `FAQ` | Short Q&A entries | Public/operational |
| `KB` | Structured help articles | Public/operational |
| `BANNER` | Home/promo rails | Public/operational |
| `LANDING` | Campaign/education landings | Public/operational |
| `LEGAL_NOTICE` | Terms/privacy versioned docs | Public/operational (acceptance tracking deferred to compliance CR) |
| `PACK_STRING` | Operational copy (e.g. care-nav guidance keys) | Operational — no symptom narratives |

CMS is **not** a clinical decision engine. Health education content requires legal workflow per **OD-CMS-01**.

### 6.2 Lifecycle

See §12 CMS state machine.

### 6.3 Versioning

- **Draft** rows mutable in `cms_content_revisions` (working copy).
- **Published** snapshot immutable in `cms_content_publications` (or version table with `published_at` + no update policy).
- Customer APIs return **published version only** for `(slug, country, locale)`.
- Rollback = publish prior version (new publication event), never mutate published row.

### 6.4 Permissions (proposed)

| Permission | Roles (default) |
|------------|-----------------|
| `cms:read` | `company_operations`, `company_compliance`, `cms_editor` |
| `cms:write` | `cms_editor`, `company_operations` |
| `cms:review` | `company_compliance` (if OD-CMS-01 dual control) |
| `cms:publish` | `company_compliance`, `super_admin` (split per OD-ADM-04) |

### 6.5 Country/language

- Every content item has `country_id` scope (or `GLOBAL` with country allow-list JSON).
- Locales per `PolicyPack.document.i18n.locales` default `en`.
- Publish validates locale completeness per **ED-R11-03** (default: `en` required).

---

## 7. Help Center plan

### 7.1 Customer surfaces

| Surface | Routes (proposed) |
|---------|-------------------|
| Web customer | `/help`, `/help/c/[categorySlug]`, `/help/a/[articleSlug]`, `/help/search?q=` |
| Mobile | `help-home`, `help-category`, `help-article`, `help-search` screens |
| Entry points | Customer shell, account menu, care-nav “contact support” → `/help` or `/account/support` |

### 7.2 Behavior

- **Published-only:** 404 for draft/archived/unpublished slugs.
- **No auth required** for public help articles (JWT optional for personalization only).
- **Country:** `country_code` query param or resolved from customer profile / pack default.
- **Search:** deterministic Postgres `contains` / `tsvector` (see §16) — separate from commerce catalog index.
- **States:** loading, empty, error, retry — match R10-B UI matrix patterns.

### 7.3 Parity

Web and mobile consume the same read APIs. No admin content in customer apps.

---

## 8. Support Desk plan

### 8.1 Queues (v1)

| Queue code | Audience | Typical categories |
|------------|----------|------------------|
| `CUSTOMER_GENERAL` | Customer | Account, orders, appointments |
| `CUSTOMER_COMMERCE` | Customer | Orders, shipments, payments (metadata) |
| `CUSTOMER_CARE` | Customer | Appointments, care-nav **operational** questions only |
| `VENDOR_OPS` | Vendor org | Orders, settlements, catalog |
| `PARTNER_LAB` | Lab org | Booking status (no report values) |
| `PARTNER_IMAGING` | Imaging org | Booking status (no findings) |

Multi-queue = routing by `queue_code` + country. Not separate apps.

### 8.2 Agent access boundaries (default **NO**)

| Data | Support agent default | Mechanism |
|------|----------------------|-----------|
| Health timeline | **NO** | No `health_artifact:read` for `company_support` |
| Lab report values | **NO** | Ticket may link `lab_booking_id` — status only |
| Imaging findings | **NO** | `imaging_booking_id` — status only |
| Prescription details | **NO** | `prescription_id` — eligibility/status only |
| Care-nav symptom narrative | **NO** | Session id + status only; admin governance separate role |
| Order line items | **MASKED** | SKU/qty OK; no clinical free text from customer paste |
| PII reveal | **REASON-GATED** | `user:reveal_pii` + `SecurityEvent` (existing pattern) |

Agents must **not** bypass R9 consent/RLS. Clinical paste in ticket body is discouraged; scanner hook **DEFERRED** (OD-R11-09).

### 8.3 Ticket references (structured)

| `reference_type` | Validates | Exposes to agent |
|------------------|-----------|------------------|
| `order` | Order ownership + country | Order number, status |
| `appointment` | Person ownership | Time, status, doctor display name |
| `lab_booking` | Person ownership | Status, catalog name |
| `imaging_booking` | Person ownership | Status, study name |
| `care_nav_session` | Person ownership | Status, red_flag boolean — **no complaint text** |
| `shipment` | Person ownership | Tracking status |

Vendor controller validation pattern (`vendor-support.controller.ts`) is the template for customer structured refs.

### 8.4 Migration from Redis kernel

R11-A must:
1. Introduce Postgres `support_tickets` + related tables.
2. Keep Redis API compatibility during transition **or** one-time cutover with e2e migration note.
3. Emit `SUPPORT_TICKET_CREATED` / `SUPPORT_TICKET_UPDATED` via outbox.
4. Fix notification dispatch pref mapping: `support_updates` not `order_updates`.

---

## 9. Database plan (proposed — not authorized)

### 9.1 CMS tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `cms_content_items` | Stable identity: slug, type, country scope | FORCE RLS |
| `cms_content_revisions` | Draft/working revisions | FORCE RLS |
| `cms_content_publications` | Immutable published snapshots | FORCE RLS — insert-only for published rows |
| `cms_content_assets` | Media metadata (`storage_key`, mime, checksum) | FORCE RLS |
| `cms_content_search_documents` | Denormalized search row per publication | FORCE RLS — customer read via published filter |

### 9.2 Support tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `support_queues` | Queue catalog per country | FORCE RLS |
| `support_tickets` | Ticket header: status, queue, person, country, refs | FORCE RLS |
| `support_ticket_messages` | Thread; `visibility: CUSTOMER \| INTERNAL` | FORCE RLS |
| `support_ticket_events` | Append-only audit (assign, status change, escalate) | FORCE RLS — insert-only |
| `support_ticket_attachments` | Metadata + `object_key` | FORCE RLS |

### 9.3 Migration sequencing

1. `r11a_cms_support_enums` — enums for content type, ticket status, message visibility.
2. `r11a_cms_schema` — CMS tables + indexes.
3. `r11a_cms_rls` — policies; **no `USING(true)`** on sensitive tables.
4. `r11a_support_schema` — support tables + FK to person/country/order/etc.
5. `r11a_support_rls` — tenant isolation; agent policies via membership scope.

**`worldpharma_app`:** remains NOSUPERUSER + NOBYPASSRLS.

---

## 10. API inventory (proposed)

Base prefix: `/api/v1`. All routes require TLS in production. Shapes are illustrative — implement in IMPL CRs.

### 10.1 CMS — Admin

| Method | Route | Actor | AuthZ | Scope | Idempotency | PHI | Audit event |
|--------|-------|-------|-------|-------|-------------|-----|-------------|
| GET | `/admin/cms/content` | admin | `cms:read` | country | — | None | — |
| POST | `/admin/cms/content` | admin | `cms:write` | country | optional key | None | `CMS_CONTENT_CREATED` |
| GET | `/admin/cms/content/:id` | admin | `cms:read` | country | — | None | — |
| PATCH | `/admin/cms/content/:id` | admin | `cms:write` | country | — | None | `CMS_CONTENT_UPDATED` |
| POST | `/admin/cms/content/:id/submit-review` | admin | `cms:write` | country | — | None | `CMS_CONTENT_SUBMITTED` |
| POST | `/admin/cms/content/:id/publish` | admin | `cms:publish` | country | key | None | `CMS_CONTENT_PUBLISHED` |
| POST | `/admin/cms/content/:id/archive` | admin | `cms:publish` | country | — | None | `CMS_CONTENT_ARCHIVED` |
| GET | `/admin/cms/content/:id/versions` | admin | `cms:read` | country | — | None | — |
| POST | `/admin/cms/assets` | admin | `cms:write` | country | key | None | — |

### 10.2 Help Center — Public / Customer

| Method | Route | Actor | AuthZ | Scope | PHI | Notes |
|--------|-------|-------|-------|-------|-----|-------|
| GET | `/help/categories` | public | — | `country_code` | None | Published categories only |
| GET | `/help/articles` | public | — | country + locale | None | List/filter |
| GET | `/help/articles/:slug` | public | — | country + locale | None | 404 if not published |
| GET | `/help/search` | public | — | country + locale + `q` | None | Deterministic search |
| GET | `/help/banners` | public | — | country | None | Active banners only |

### 10.3 Support — Customer

| Method | Route | Actor | AuthZ | Scope | Idempotency | PHI |
|--------|-------|-------|-------|-------|-------------|-----|
| GET | `/support/tickets` | customer | JWT customer | own `person_id` | — | Customer messages only |
| POST | `/support/tickets` | customer | JWT customer | country | `Idempotency-Key` | Body user-provided — warn paste |
| GET | `/support/tickets/:id` | customer | JWT customer | ownership | — | Customer-visible messages |
| POST | `/support/tickets/:id/messages` | customer | JWT customer | ownership | key | Customer reply |
| POST | `/support/tickets/:id/close` | customer | JWT customer | ownership | — | Optional customer-initiated close |

### 10.4 Support — Vendor (extend existing)

| Method | Route | Actor | AuthZ | Notes |
|--------|-------|-------|-------|-------|
| GET | `/vendor/support/tickets` | vendor | vendor org scope | List org tickets |
| POST | `/vendor/support/tickets` | vendor | vendor org scope | Structured refs required |

### 10.5 Support — Agent / Admin

| Method | Route | Actor | AuthZ | PHI |
|--------|-------|-------|-------|-----|
| GET | `/admin/support/queues` | admin | `support:read` | None |
| GET | `/admin/support/tickets` | admin | `support:read` | Metadata + masked refs |
| GET | `/admin/support/tickets/:id` | admin | `support:read` | No clinical payloads |
| POST | `/admin/support/tickets/:id/assign` | admin | `support:manage` | None |
| POST | `/admin/support/tickets/:id/messages` | admin | `support:manage` | INTERNAL or CUSTOMER visibility |
| POST | `/admin/support/tickets/:id/status` | admin | `support:manage` | State machine guard |
| POST | `/admin/support/tickets/:id/escalate` | admin | `support:manage` | None |
| POST | `/admin/support/tickets/:id/reveal-pii` | admin | `user:reveal_pii` | Reason required — SecurityEvent |

### 10.6 Error states (all APIs)

| Code | When |
|------|------|
| 400 | Validation, invalid transition, malformed UUID |
| 401 | Unauthenticated |
| 403 | Wrong role, wrong country, unpublished content, disabled pack |
| 404 | Cross-tenant ticket/content |
| 409 | Invalid state transition, version conflict |
| 422 | OD-CMS-01 publish blocked pending review |

---

## 11. UI inventory (proposed)

### 11.1 Web customer (`apps/web-customer`)

| Route | Screen | Purpose |
|-------|--------|---------|
| `/help` | Help home | Categories, featured articles, search entry |
| `/help/c/[categorySlug]` | Category | Article list |
| `/help/a/[articleSlug]` | Article detail | Published body, related links |
| `/help/search` | Search results | Query + filters |
| `/account/support` | Support (existing) | Extend: thread view, structured ref picker |
| `/account/support/[ticketId]` | Ticket detail | Messages, status |

### 11.2 Mobile (`apps/mobile`)

| Screen | Purpose |
|--------|---------|
| `help-home` | Parity with web `/help` |
| `help-category` | Category list |
| `help-article` | Article detail |
| `help-search` | Search |
| `support` (existing) | Extend thread + refs |
| `support-ticket` | Ticket detail |

### 11.3 Web admin (`apps/web-admin`)

| Route | Screen | Permission |
|-------|--------|------------|
| `/cms` | Content list | `cms:read` |
| `/cms/new` | Create content | `cms:write` |
| `/cms/[id]` | Editor | `cms:write` |
| `/cms/[id]/review` | Review queue | `cms:review` |
| `/cms/[id]/versions` | Version history | `cms:read` |
| `/support` | Ticket inbox | `support:read` |
| `/support/[ticketId]` | Ticket detail | `support:manage` |
| `/support/queues` | Queue config (read-only v1) | `support:read` |

Nav entries: add **CMS** and **Support** to `nav.ts` under governance/operations group.

### 11.4 Partner apps (existing shells)

| App | Extension |
|-----|-----------|
| `web-vendor` | Extend `vendor-support-panel.tsx` — thread + queue |
| Lab/imaging web | Ticket list using vendor pattern — **no new app** |

---

## 12. State machines

### 12.1 CMS content

```
DRAFT ──submit──► IN_REVIEW ──publish──► PUBLISHED ──archive──► ARCHIVED
  │                    │                      │
  └────save────────────┘                      └──republish prior──► PUBLISHED (new version)
```

| Transition | Actor | Guard |
|------------|-------|-------|
| `DRAFT → IN_REVIEW` | `cms:write` | Required fields present |
| `IN_REVIEW → PUBLISHED` | `cms:publish` (+ `cms:review` if OD-CMS-01) | Locale completeness |
| `PUBLISHED → ARCHIVED` | `cms:publish` | — |
| `ARCHIVED → PUBLISHED` | `cms:publish` | New publication row |
| Invalid | — | 409 `INVALID_STATE_TRANSITION` |

**Terminal:** `ARCHIVED` (customer 404). **Concurrency:** optimistic `version` on item row.

### 12.2 Support ticket

Proposed v1 (extends existing `OPEN` / `PENDING` / `CLOSED`):

```
OPEN ──assign──► ASSIGNED ──start──► IN_PROGRESS ──wait──► WAITING_CUSTOMER
                      │                    │                      │
                      │                    └──resolve──► RESOLVED ──close──► CLOSED
                      │                    │
                      └──escalate──► (queue change, stays IN_PROGRESS)
```

| Transition | Actor | Guard |
|------------|-------|-------|
| `OPEN → ASSIGNED` | `support:manage` | Agent in queue scope |
| `ASSIGNED → IN_PROGRESS` | agent | — |
| `IN_PROGRESS → WAITING_CUSTOMER` | agent | Customer reply requested |
| `WAITING_CUSTOMER → IN_PROGRESS` | customer message or agent | — |
| `IN_PROGRESS → RESOLVED` | agent | Resolution note (internal) |
| `RESOLVED → CLOSED` | agent or auto | — |
| `* → CLOSED` | agent | Terminal |
| Customer `close` from `OPEN`/`WAITING` | customer | Optional OD-R11-05 |

**Terminal:** `CLOSED` — no new customer messages (409). **Idempotency:** status transition with `Idempotency-Key` per ticket.

**Legacy mapping:** Redis `PENDING` → `WAITING_CUSTOMER`; migrate on cutover.

---

## 13. Security / RLS model

### 13.1 Principles

- Customer owns tickets (`person_id` + `country_id`).
- Agents see tickets only in assigned queue + country scope (membership).
- CMS drafts invisible to customer APIs (RLS + API guard).
- Published content readable without auth; draft/review requires admin role.
- Cross-customer ticket/content access → **404** (not 403) where enumeration risk exists.
- Append-only: `support_ticket_events`, published CMS snapshots.
- Fail-closed: disabled pack (if `cms_enabled` / `support_enabled` added) → 403.

### 13.2 RLS policy sketch

| Table | Customer | Agent | Admin |
|-------|----------|-------|-------|
| `cms_content_publications` | SELECT published + country | — | ALL via worker tenant |
| `cms_content_revisions` | — | — | role-gated |
| `support_tickets` | SELECT own | SELECT queue scope | ALL metadata |
| `support_ticket_messages` | SELECT `CUSTOMER` visibility | SELECT all in ticket | INSERT role-gated |

### 13.3 Negative tests (required per phase)

- Unauthenticated admin CMS → 401
- Customer A → Customer B ticket → 404
- Wrong `country_code` → 403/404
- Unauthorized support agent → 403
- Unpublished article slug → 404
- Malformed UUID → 400/404
- Agent without `health_artifact:read` → no payload APIs (403 on health routes)
- Disabled pack (if gated) → 403

---

## 14. PHI / privacy model

### 14.1 Classification matrix

| Surface | Class | May contain PHI? | Storage | Notifications |
|---------|-------|------------------|---------|---------------|
| Published help article | Public/operational | **NO** (OD-CMS-01) | Postgres | Optional `CMS_CONTENT_PUBLISHED` — slug only |
| FAQ/KB answer | Public/operational | **NO** | Postgres | — |
| Banner/landing | Public/operational | **NO** | Postgres | — |
| Ticket header metadata | Operational | **NO** — refs opaque | Postgres | `ticket_id`, `queue`, `status` |
| Customer ticket message | User-provided | **RISK** — user may paste PHI | Postgres | Generic “reply received” |
| Internal support note | Internal operational | Must not require PHI | Postgres | Never in customer notification |
| Agent masked 360 | Operational | **NO** clinical payload | API compose | — |
| Security/outbox events | Operational | **NO** narrative | Postgres | Opaque IDs only |

### 14.2 Prohibited in notifications (default)

- Health report text, imaging findings, lab values, prescription details, care-nav symptom narratives, free-text ticket bodies.

### 14.3 Support agent clinical access

**Default: NO.** Any future clinical read for support requires separate OD + consent review + explicit permission — not R11 v1.

---

## 15. Notifications / outbox

Reuse `OutboxService` + `NotificationDispatchService`.

| Event | Trigger | Inbox pref | Payload |
|-------|---------|------------|---------|
| `CMS_CONTENT_PUBLISHED` | Publish | — (admin only) or ops | `{ content_id, slug, country_id }` |
| `SUPPORT_TICKET_CREATED` | Ticket create | `support_updates` | `{ ticket_id, queue_code }` |
| `SUPPORT_TICKET_ASSIGNED` | Assign | `support_updates` (agent internal) | `{ ticket_id, assignee_id }` |
| `SUPPORT_TICKET_CUSTOMER_REPLY` | Customer message | `support_updates` | `{ ticket_id }` |
| `SUPPORT_TICKET_AGENT_REPLY` | Agent CUSTOMER message | `support_updates` | `{ ticket_id }` |
| `SUPPORT_TICKET_RESOLVED` | Resolve | `support_updates` | `{ ticket_id, status }` |

**Idempotency:** `occurrenceKey` = `{event}:{ticket_id}:{transition}:{idempotency_key}`.

**Fix existing debt:** map `SUPPORT_TICKET_*` dispatch to `support_updates`; emit from service via outbox (not direct inbox only).

---

## 16. Search / indexing strategy

**R11 v1:** Deterministic, auditable **Postgres** search — mirror `CatalogSearchService`:

- Table `cms_content_search_documents` populated on publish.
- Query: `WHERE country_id = ? AND locale = ? AND published = true AND (title ILIKE OR body ILIKE OR tsvector @@ plainto_tsquery)`.
- **No** external search vendor.
- **Separate index** from `CatalogSearchDocument` — never mix commerce and help in one customer query.
- R13 may add warehouse/analytics later — R11 does not block it.

---

## 17. Open decisions (`OD-R11-*`)

| ID | Topic | Default stance | Blocks |
|----|-------|----------------|--------|
| **OD-R11-01** | Content ownership (central vs country admin) | Central template + country override | R11-B publish workflow |
| **OD-R11-02** | Review required for all types vs FAQ-only | All except `PACK_STRING` need review if OD-CMS-01 | R11-B |
| **OD-R11-03** | Localization required locales per publish | `en` required; others optional | R11-B/C |
| **OD-R11-04** | Country-specific content vs global with allow-list | Per-country rows (matches catalog pattern) | R11-A schema |
| **OD-R11-05** | Customer-initiated ticket close | Allowed from `OPEN`/`WAITING_CUSTOMER` | R11-D |
| **OD-R11-06** | Support SLA targets | Pack-config `ticket.sla_hours` — no auto-escalation v1 | R11-D |
| **OD-R11-07** | Support-agent access to health timeline | **NO** default | R11-D |
| **OD-R11-08** | Internal notes visibility | Agents + compliance only; never customer | R11-D |
| **OD-R11-09** | Attachment policy | Images/PDF max 5MB; malware scan hook; **no** clinical upload intent | R11-D |
| **OD-R11-10** | Escalation model | Queue reassignment only v1; no pager | R11-D |
| **OD-R11-11** | Customer notification on agent reply | In-app only; email OFF sandbox | R11-D |
| **OD-R11-12** | Health/clinical education in CMS | Allowed with OD-CMS-01 dual control | R11-B |
| **OD-R11-13** | Retention/deletion for tickets | 7y operational default — legal confirm | R11-A |
| **OD-R11-14** | Pack gate `cms_enabled` / `support_enabled` | **ED-R11-01:** default **true** in XX sandbox for testing | R11-A |
| **OD-CMS-01** | (existing) Medical-claim workflow | Dual control publish | Health education go-live |
| **OD-SUP-01** | (existing) Chat vs ticket | Ticket-first | Chat deferred |

---

## 18. Engineering defaults (`ED-R11-*`)

| ID | Default |
|----|---------|
| **ED-R11-01** | `cms_enabled` and `support_enabled` pack flags default **true** in XX sandbox; **false** in empty pack template until explicitly enabled |
| **ED-R11-02** | Deny-by-default RBAC; explicit grants for publish and ticket manage |
| **ED-R11-03** | Publish requires `en` locale body |
| **ED-R11-04** | Customer help APIs are public read; no draft leakage via slug guess (404) |
| **ED-R11-05** | Ticket references store opaque IDs only in outbox/security events |
| **ED-R11-06** | Immutable published CMS rows — no UPDATE on publication table |
| **ED-R11-07** | Append-only `support_ticket_events` |
| **ED-R11-08** | Idempotency-Key on ticket create and status transition |
| **ED-R11-09** | Postgres durable tickets; Redis list deprecated after R11-A cutover |
| **ED-R11-10** | Reuse `PrivateObjectStore` local backend in sandbox |
| **ED-R11-11** | No live email/SMS/WhatsApp for support in R11 — in-app only |
| **ED-R11-12** | Agent APIs metadata-only for linked orders/bookings |

---

## 19. Acceptance gates (per phase)

| Gate | R11-A | R11-B | R11-C | R11-D | R11-E |
|------|-------|-------|-------|-------|-------|
| Focused e2e | schema + services | admin publish | help read/search | ticket lifecycle | full R11 suite |
| RLS/tenancy e2e | **required** | **required** | **required** | **required** | **required** |
| Auth negatives | **required** | **required** | **required** | **required** | **required** |
| State-machine tests | CMS transitions | publish/archive | — | ticket transitions | combined |
| Idempotency tests | create/publish | publish key | — | ticket create/transition | — |
| PHI leakage tests | — | admin list | public search | ticket notifications | **full matrix** |
| Migration verify | **required** | — | — | — | all R11 migrations |
| Typecheck / build | API | + web-admin | + web-customer, mobile | + web-admin support | all apps |
| Runtime verification | API health | admin publish flow | help browse | agent ticket flow | live HTTP checklist |

**R11 closure target:** `R11_GREEN_CLOSED_R12_READY_FOR_PLANNING` — only after **CR-POST-R11-CLOSURE-AUDIT-*** with actual verification (Book 192 precedent).

---

## 20. Regression requirements

### 20.1 Must preserve

- R0–R10 full API behavior (especially R10 care-nav safety, R9 consent/RLS, R7/R8 clinical boundaries).
- Appointment/video kernels unchanged except ticket reference hooks.
- Payment/logistics sandbox boundaries.

### 20.2 Focused regression (each IMPL CR)

| Batch | Suites |
|-------|--------|
| R11 core | `r11a.*`, `r11b.*`, `r11c.*`, `r11d.*` (to be authored) |
| R10 + RLS | `r10a`, `r10c`, `r10d`, `rls.tenancy` |
| R9 consent | `r9c.consent-scope-enforcement` |
| Platform | `outbox.e2e`, notification specs |

### 20.3 Full suite

- `nx test api` — target **201/201** (or document isolated flakes per Book 192).
- web-customer **32/32**, mobile **14/14** minimum.

### 20.4 Carry-forward test debt (still present per Book 192)

| Item | Action during R11 |
|------|-------------------|
| Shared-DB policy-pack pollution | Do not worsen; isolate R11 pack flags in e2e `beforeAll`/`afterAll` |
| `doctor.e2e` flake | Monitor; no regression |
| `pnpm` PATH | CI/docs note; not R11 scope |
| Dev XX pack defaults | Use `enableR11Pack()` test helper pattern |

---

## 21. Production boundaries (R11)

**Remain OFF:**

- Live PSP, live money, bank payouts, real carriers
- Production healthcare, PACS/DICOM, LIS/HIS, live e-Rx, automatic refill
- Production LiveKit, recording
- External notification providers (email/SMS/WhatsApp production)
- External search/analytics vendors

R11 is **sandbox-operational** content and support only.

---

## 22. R12 boundary (deferred — not planned)

Explicitly **beyond R11** ([93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R12):

- CRM 360, marketing campaigns, coupons, affiliate web
- Loyalty/membership, wishlist, reviews/Q&A
- Personalization hooks, subscription/refill marketing hooks
- WhatsApp campaigns (pack default off)
- Doctor/lab public ratings (**OD-RATE-01**)
- Notification templates CMS (may overlap — resolve in R12 planning)
- Analytics/BI dashboards (**R13**)

R11 delivers **content + help + tickets** only — not CRM pipelines.

---

## 23. Technical debt inventory (re-audited)

| Item | Source | Still present? | R11 impact |
|------|--------|----------------|------------|
| Shared-DB policy-pack pollution | Book 192 | **Yes** | Use isolated pack helpers in R11 e2e |
| `pnpm` PATH for Jest | Book 192 | **Yes** | Environment |
| Appointment slot contention | Book 192 | **Yes** | Unrelated unless ticket refs appointments |
| Mobile session resume | Book 192 | **Yes** | Non-blocking |
| Web governance UI test coverage | Book 192 | **Yes** | Extend pattern for CMS/support UI tests |
| Browser/Android/iOS runtime | Book 192 | **Yes** | R11-E runtime checklist |
| Dev XX pack orphaned pointer | Book 192 | **Yes** | Fix in hygiene CR or R11-A seed |
| Redis support tickets | This audit | **Yes** | **R11-A replaces** |
| `SUPPORT_TICKET_*` not emitted | This audit | **Yes** | **R11-A fixes** |
| `support_updates` UI gap | This audit | **Yes** | **R11-D** |
| Notification dispatch wrong pref | This audit | **Yes** | **R11-A fixes** |

---

## 24. Verdict

**`R11_PLAN_READY`**

---

## 25. Next authorization

**`CR-POST-R11-PLAN-AUDIT-194`** — Post-plan audit of Book 193 against repository truth and Book 93 acceptance criteria. **Do not** start R11-A implementation until plan audit passes or is explicitly waived by humans.

After plan audit green:

**`CR-R11-A-IMPL-194`** — R11-A backend/content + support kernel, migrations, RLS, focused e2e only.

**Do not** start R10-E/F, R12+, or R11-B/C/D without separate IMPL CRs after R11-A.
