# R12-B Marketing campaigns, segments, consent-gated send implementation

**CR:** `CR-R12-B-IMPL-209`  
**Verdict:** `R12_B_IMPLEMENTED`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [206](206_POST_R12_PLAN_AUDIT.md) · [208](208_POST_R12_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-B delivers **marketing segments**, **campaign lifecycle**, **consent-gated in-app send pipeline**, **suppression handling**, **admin APIs**, and **web-admin marketing UI** only. No R12-C+ (promo, affiliate, loyalty, wishlist, reviews, personalization, refill hooks, closure). No R10-E/F, R13+, production SMS/WhatsApp, external ESP, or clinical automation.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| Segment kernel (rules v1, non-clinical) | **IMPLEMENTED** |
| Campaign lifecycle state machine | **IMPLEMENTED** |
| Consent-gated send pipeline (IN_APP v1) | **IMPLEMENTED** |
| Suppression list + opt-out integration | **IMPLEMENTED** |
| Idempotent campaign sends | **IMPLEMENTED** |
| Admin marketing APIs | **IMPLEMENTED** |
| Web-admin `/marketing` shell | **IMPLEMENTED** |
| Outbox `CRM_CAMPAIGN_MESSAGE` + inbox via notification kernel | **IMPLEMENTED** |
| RBAC `campaign:read`, `campaign:send` | **IMPLEMENTED** |
| Security events (`CRM_SEGMENT_*`, `CRM_CAMPAIGN_*`, `CRM_CAMPAIGN_SENT`) | **IMPLEMENTED** |
| FORCE RLS + deny-by-default on new tables | **IMPLEMENTED** |
| Focused R12-B e2e + web-admin unit tests | **IMPLEMENTED** |

### Explicit non-starts

- R12-C promo / coupons admin
- R12-D affiliate web / referral
- R12-E wishlist / loyalty
- R12-F reviews / personalization
- R12-G refill marketing hooks
- R12-H closure
- R10-E/F, R13+
- Production SMS/WhatsApp / external marketing vendors
- Abandoned-cart scheduler (deferred — not required for minimal R12-B v1)
- OD-R12-07 medicine advertising (policy default `medicine_advertising: false`)

---

## 2. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `CrmSegment`, `CrmCampaign`, `CrmCampaignSend`, `CrmSuppression` + enums
- `packages/database/prisma/migrations/20260829210000_r12b_marketing_schema/migration.sql`
- `packages/database/prisma/migrations/20260829210100_r12b_marketing_rls/migration.sql`
- `packages/database/prisma/migrations/20260829210200_r12b_marketing_grants/migration.sql`

### API — marketing submodule (`apps/api/src/crm/marketing/`)

- `campaign-status.ts` — server-authoritative transitions; invalid → 409
- `segment-rules.ts` — rules v1 validation; clinical token rejection; evaluators
- `suppression.service.ts` — country/person scoped suppressions
- `segment.service.ts` — segment CRUD + preview count
- `campaign.service.ts` — campaign CRUD, schedule, send log list
- `send-pipeline.service.ts` — consent-gated batch send → inbox + outbox
- `admin-marketing.controller.ts` — `/admin/marketing/*`

### API — integration

- `apps/api/src/crm/crm.module.ts` — marketing services/controller; `PlatformModule` forwardRef
- `apps/api/src/crm/marketing-preference.service.ts` — suppression on marketing opt-out
- `apps/api/src/identity/authority.ts` — `campaign:read`, `campaign:send`
- `apps/api/src/identity/rbac.service.ts` — permission catalog
- `apps/api/src/identity/security-events.service.ts` — CRM marketing event types
- `apps/api/src/policy/document.ts`, `empty-pack.ts` — `crm.marketing` nested defaults
- `apps/api/src/test/enable-crm-pack.ts` — enables `crm.marketing.enabled` + `in_app` channel
- `apps/api/src/events/envelope.ts` — `CRM_CAMPAIGN_MESSAGE` domain event
- `apps/api/src/platform/notification.controller.ts` — **await** `listInbox` (minimum integration fix)
- `apps/api/src/crm/r12b.marketing.e2e.spec.ts`

### Web-admin

- `apps/web-admin/src/marketing-api.ts`
- `apps/web-admin/src/marketing-list.tsx`
- `apps/web-admin/src/marketing-campaign-detail.tsx`
- `apps/web-admin/src/marketing-segment-detail.tsx`
- `apps/web-admin/src/marketing.spec.tsx`
- `apps/web-admin/app/marketing/page.tsx`
- `apps/web-admin/app/marketing/campaigns/[id]/page.tsx`
- `apps/web-admin/app/marketing/segments/[id]/page.tsx`
- `apps/web-admin/src/nav.ts` — Marketing nav (`campaign:read`)
- `apps/web-admin/app/crm/customers/[id]/page.tsx` — import path fix (`../../../../src/...`)

### Documentation

- `docs/blueprint/209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. Segment implementation

**Rules v1** (JSON, server-validated):

| Rule type | Behavior |
|-----------|----------|
| `all` | Intersection of child rules |
| `has_order_in_country` | Distinct `Order.customerPersonId` in country |
| `person_ids` | Explicit UUID list (admin/test targeting) |

**Forbidden:** health timeline, lab values, imaging, prescriptions, care-nav, clinical notes, consent/break-glass payloads (string scan + parse rejection).

**Scope:** `country_id` + tenant isolation; optimistic `version` on PATCH.

---

## 4. Campaign implementation

**Lifecycle (server-authoritative):**

```
DRAFT → SCHEDULED → SENDING → COMPLETED
DRAFT|SCHEDULED → CANCELLED (terminal)
```

Invalid client-forged transitions → **409**. Channel v1: **IN_APP** only (policy-gated `crm.marketing.channels`).

**Fields:** code, name, segment, title, body, locale, optional `cms_content_id` (reference only).

---

## 5. Consent / suppression safety

| Check | Enforcement |
|-------|-------------|
| `marketing_allowed` default **false** | Postgres `marketing_preferences` (R12-A SoT) |
| Explicit opt-in required | Send skips when `marketing_allowed !== true` |
| Opt-out immediate | `marketing_allowed: false` + suppression row on PATCH |
| Transactional notifications | Unchanged — Redis notification prefs kernel |
| Suppression wins | `crm_suppressions` checked after consent |
| Policy fail-closed | `crm.marketing.enabled === false` → 403 |
| No client-only consent | All checks server-side in `SendPipelineService` |

**Skip reasons (operational, non-PHI):** `marketing_not_allowed`, `suppressed`.

---

## 6. Notification / outbox integration

- **Inbox:** `NotificationService.enqueueInbox` (existing Redis inbox)
- **Outbox:** `CRM_CAMPAIGN_MESSAGE` with opaque IDs only (`campaign_id`, `person_id`, `channel`)
- **Idempotency:** unique `(campaign_id, person_id, idempotency_key)` on `crm_campaign_sends`
- **Batch key:** `Idempotency-Key` header + per-person suffix

No second notification system. Marketing events distinct from transactional outbox types.

---

## 7. API inventory

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET/POST/PATCH | `/api/v1/admin/marketing/segments` | read / send | country_code required |
| GET | `/api/v1/admin/marketing/segments/:id` | `campaign:read` | includes `preview_count` |
| GET/POST/PATCH | `/api/v1/admin/marketing/campaigns` | read / send | IN_APP default |
| POST | `/api/v1/admin/marketing/campaigns/:id/schedule` | `campaign:send` | DRAFT→SCHEDULED |
| POST | `/api/v1/admin/marketing/campaigns/:id/send` | `campaign:send` | Idempotency-Key header |
| GET | `/api/v1/admin/marketing/campaigns/:id/sends` | `campaign:read` | append-only send log |

All routes: JWT, `admin` audience, country isolation, audit events on mutations.

---

## 8. Admin UI

| Route | Capability |
|-------|------------|
| `/marketing` | Campaign + segment lists; country filter; create segment/campaign (when `campaign:send`) |
| `/marketing/campaigns/[id]` | Creative, workflow (schedule/send), send log with skip reasons |
| `/marketing/segments/[id]` | Rules JSON, preview audience count |

States: loading, empty, permission denied, validation/conflict errors, network retry. **UI is not the security boundary.**

---

## 9. Security / RLS

All new tables: **ENABLE + FORCE RLS**, deny-by-default, no `USING(true)`.

| Table | Insert | Update | Delete |
|-------|--------|--------|--------|
| `crm_segments` | worker/platform + country | worker/platform + country | denied |
| `crm_campaigns` | worker/platform + country | worker/platform + country | denied |
| `crm_campaign_sends` | worker/platform + country | denied | denied |
| `crm_suppressions` | worker/platform/person + country | same | denied |

`worldpharma_app`: NOSUPERUSER, NOBYPASSRLS (unchanged).

**RBAC:** `company_operations` has `campaign:read` + `campaign:send`.

---

## 10. PHI / privacy

Marketing kernel stores **operational copy only** (title/body). Segment rules and campaign content scanned for clinical tokens. Send records contain status + opaque skip reason codes only. Admin APIs and outbox payloads exclude clinical narratives.

---

## 11. Idempotency / concurrency

- Campaign/segment PATCH: `version` optimistic lock → 409
- Send: `Idempotency-Key` + per-person occurrence; replay on COMPLETED campaign returns stable counts
- Opt-out race: preference checked at send time; suppression table updated on opt-out

---

## 12. Tests

### R12-B (`r12b.marketing.e2e.spec.ts`) — **7/7 passed**

- 401 unauthenticated
- 403 without `campaign:send`
- Clinical segment rule rejection (400)
- Consent OFF → skip; opt-in → inbox delivery
- Opt-out → suppression skip
- Invalid schedule transition → 409
- Send idempotency replay

### Web-admin (`marketing.spec.tsx`) — **5/5 passed**

### Regression (selected) — **30/30 passed**

`r12a.crm-kernel`, R9, R11, notification/outbox suites.

---

## 13. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** |

---

## 14. Runtime verification

| Step | Result |
|------|--------|
| Postgres migrations (`worldpharma` + `worldpharma_test`) | **Applied** (R12-B 3 migrations) |
| R12-B e2e against `worldpharma_test` | **PASS** (7/7) |
| Live API smoke (`/health/ready`, manual campaign/segment) | **Not run** — e2e provides send/consent/isolation evidence |

---

## 15. Technical debt

| ID | Class | Item |
|----|-------|------|
| TD-R12B-01 | product | Abandoned-cart / win-back scheduler not implemented (Book 205 optional hook) |
| TD-R12B-02 | product | EMAIL/PUSH/SMS/WhatsApp channels stubbed in enum; only IN_APP send wired |
| TD-R12B-03 | test infrastructure | Jest global-setup migrate output noisy on Windows; test DB may lag until global-setup runs |
| TD-R12B-04 | product | `company_support` lacks `campaign:read` — marketing nav hidden for read-only support role |
| TD-R12B-05 | architecture | `CrmModule` ↔ `PlatformModule` forwardRef for notification injection |

Pre-existing debt (not resolved): Redis transactional notification prefs; TD-R11A-04 masked CRM identifiers.

---

## 16. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | COMPLETE |
| R10-E/F | NOT STARTED | NOT STARTED |
| R11-A/B/C/D/E | COMPLETE | COMPLETE |
| R12-A | COMPLETE | COMPLETE |
| **R12-B** | IMPLEMENTED | **IMPLEMENTED** |
| R12-C/D/E/F/G/H | NOT STARTED | NOT STARTED |
| R13+ | NOT STARTED | NOT STARTED |

---

## 17. Next authorization

**`CR-POST-R12-B-AUDIT-210`** — post-implementation audit of R12-B only. Do not start R12-C+ until audit authorizes.
