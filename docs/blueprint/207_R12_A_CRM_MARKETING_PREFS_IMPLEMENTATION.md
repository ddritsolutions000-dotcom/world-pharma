# R12-A CRM kernel, marketing preferences, conversion events implementation

**CR:** `CR-R12-A-IMPL-207`  
**Verdict:** `R12_A_IMPLEMENTED`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [206](206_POST_R12_PLAN_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-A delivers the **CRM / Customer 360 metadata kernel**, **durable marketing preferences**, **conversion events**, and **web-admin CRM shell** only. No R12-B+ (campaigns, promo admin, affiliate web, loyalty, wishlist, reviews, personalization, refill marketing hooks, closure). No R10-E/F, R13+, or live-money work was started.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| CRM module + Customer 360 read model (metadata-only) | **IMPLEMENTED** |
| Admin CRM APIs (`/admin/crm/*`) | **IMPLEMENTED** |
| Durable `marketing_preferences` (Postgres) + Redis dual-write for `marketing` | **IMPLEMENTED** |
| Customer marketing preference APIs | **IMPLEMENTED** |
| Append-only `conversion_events` kernel | **IMPLEMENTED** |
| Pack gate `document.crm.enabled` | **IMPLEMENTED** |
| RBAC `crm:read`, `crm:write` | **IMPLEMENTED** |
| Security events (`CRM_CUSTOMER_VIEW`, `MARKETING_PREF_CHANGED`, `CONVERSION_EVENT_RECORDED`) | **IMPLEMENTED** |
| Web-admin `/crm`, `/crm/customers/[id]` | **IMPLEMENTED** |
| FORCE RLS + deny-by-default on new tables | **IMPLEMENTED** |
| Focused R12-A e2e + web-admin unit tests | **IMPLEMENTED** |

### Explicit non-starts

- R12-B campaigns / segments / send pipeline
- R12-C promo admin / customer checkout UX
- R12-D affiliate web / referral models
- R12-E wishlist / loyalty
- R12-F reviews / personalization
- R12-G refill marketing hooks
- R12-H closure
- R10-E/F, R13+ analytics/BI, external analytics vendors
- `reveal-pii` audited identifier reveal (TD-R11A-04 — masked only)
- OD-R12-07 medicine advertising enablement (legal/product gate — **not enabled**)
- Duplicate order/appointment/support/health/consent/payment/notification kernels

---

## 2. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `MarketingPreference`, `ConversionEvent`, `ConversionEventKind`
- `packages/database/prisma/migrations/20260829200000_r12a_crm_schema/migration.sql`
- `packages/database/prisma/migrations/20260829200100_r12a_crm_rls/migration.sql`
- `packages/database/prisma/migrations/20260829200200_r12a_crm_grants/migration.sql`
- `packages/database/prisma/migrations/20260829200300_r12a_crm_identifier_worker_select/migration.sql`
- `packages/database/prisma/migrations/20260829200400_r12a_crm_person_worker_select/migration.sql`

### API — CRM module (`apps/api/src/crm/`)

- `crm.module.ts`
- `crm-mask.ts` — server-side email/phone masking
- `customer360.service.ts` — metadata-only 360 projection (orders, appointments, lab/imaging booking metadata, support tickets, refill status, marketing prefs)
- `marketing-preference.service.ts` — durable Postgres marketing prefs (default OFF)
- `conversion-event.service.ts` — append-only, idempotent conversion feed
- `admin-crm.controller.ts` — admin CRM + conversion ingest
- `marketing-preference.controller.ts` — customer self-service marketing prefs
- `r12a.crm-kernel.e2e.spec.ts`

### API — platform / identity / policy

- `apps/api/src/platform/notification.service.ts` — dual-write/read `marketing` via Postgres; transactional prefs remain Redis
- `apps/api/src/platform/platform.module.ts` — imports `CrmModule` (forwardRef)
- `apps/api/src/app/app.module.ts` — registers `CrmModule`
- `apps/api/src/identity/authority.ts` — `crm:read`, `crm:write` in `COMPANY_ONLY_PERMISSIONS`; role mapping below
- `apps/api/src/identity/rbac.service.ts` — permission catalog
- `apps/api/src/identity/security-events.service.ts` — CRM security event types
- `apps/api/src/policy/document.ts`, `empty-pack.ts` — `crm: { enabled: false }` default
- `apps/api/src/test/enable-crm-pack.ts` — test helper to enable CRM pack on XX

### Web-admin

- `apps/web-admin/src/crm-api.ts`
- `apps/web-admin/src/crm-customer-list.tsx`
- `apps/web-admin/src/crm-customer-detail.tsx`
- `apps/web-admin/src/crm.spec.tsx`
- `apps/web-admin/app/crm/page.tsx`
- `apps/web-admin/app/crm/customers/[id]/page.tsx`
- `apps/web-admin/src/nav.ts` — CRM nav item (`crm:read`)

### Documentation

- `docs/blueprint/207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. CRM / Customer 360

**Pattern:** read-only **metadata projection** from existing kernels — no second order/appointment/support/health/consent kernel.

| Slice | Source kernel | Exposed metadata | Explicitly excluded |
|-------|---------------|------------------|---------------------|
| Profile | `Person`, `Account`, `AccountIdentifier` | status, masked email/phone | raw PII, clinical identity |
| Orders | `Order` + line items | number, status, totals, Rx link flag | prescription payloads |
| Appointments | `Appointment` | status, type, schedule, specialty tags | consult notes, video payloads |
| Lab bookings | `LabBooking` | status, collection mode, report released flag | analyte values, report body |
| Imaging bookings | `ImagingBooking` | status, report released flag | findings, DICOM |
| Support | `SupportTicket` | subject, status, queue, refs | internal-only via support APIs |
| Marketing | `MarketingPreference` | opt-in flags | transactional Redis prefs |
| Refills | `RefillRequest` | status, timestamps | Rx clinical content |

**Pack gate:** admin CRM routes require `policy.document.crm.enabled === true` for the requested country.

**Audit:** successful Customer 360 views emit `CRM_CUSTOMER_VIEW` with subject person + country metadata only.

---

## 4. Database / migrations

### Tables

| Table | PK | Scope | Notes |
|-------|----|-------|-------|
| `marketing_preferences` | `id` UUID | person × country | marketing default `false`; optimistic `version` |
| `conversion_events` | `id` UUID | country (+ optional person/order/session) | append-only; unique `(source, source_key, event_kind)` |

### RLS summary

- **FORCE RLS** on both tables (verified via `pg_class.relforcerowsecurity = true`)
- **No `USING(true)`** on R12-A data policies
- `marketing_preferences`: person self-service + worker/platform + country-scoped worker updates; DELETE denied
- `conversion_events`: worker/platform insert/select; UPDATE/DELETE denied (append-only)

### Grants

- `GRANT SELECT, INSERT, UPDATE ON marketing_preferences TO worldpharma_app`
- `GRANT SELECT, INSERT ON conversion_events TO worldpharma_app`

### CRM projection RLS additions (SELECT-only, worker/platform)

To assemble masked 360 profiles without exposing clinical kernels, R12-A adds **SELECT-only** policies:

- `account_identifiers_worker_select`
- `persons_worker_select`
- `accounts_worker_select`

Writes to identity tables remain on existing owner/auth policies. These policies exist solely for masked CRM admin projection.

### Role verification

- `worldpharma_app`: `rolsuper = false`, `rolbypassrls = false` (verified via Docker Postgres)

### Migration deploy

- Dev DB (`worldpharma`) and test DB (`worldpharma_test`): **91 migrations, schema up to date** via `prisma migrate deploy`

---

## 5. Marketing preferences

| Requirement | Implementation |
|-------------|----------------|
| Default OFF | DB column default `false`; API returns defaults when no row |
| Explicit opt-in | PATCH sets `marketing_allowed: true` |
| Explicit unsubscribe | PATCH `marketing_allowed: false` clears channel flags |
| Country/person scope | unique `(person_id, country_id)` |
| No mixing with transactional prefs | Redis keeps push/email/sms/etc.; only `marketing` dual-written |
| Source of truth | **Postgres** for `marketing_allowed`; Redis `marketing` synced on read/write via `notification.service.ts` |
| Audit | `MARKETING_PREF_CHANGED` on marketing flag transitions |

**APIs:**

- `GET/PATCH /api/v1/me/marketing-preferences?country_code=`
- Existing `GET/PATCH /api/v1/me/notifications/preferences` — `marketing` field reads/writes Postgres via primary country (fallback XX)

---

## 6. Conversion events

Append-only operational feed for R12 hooks (not R13 BI).

- **Idempotency:** unique `(source, source_key, event_kind)` — replays return existing row
- **Kinds:** `ORDER_PAID`, `CHECKOUT_STARTED`, `CART_ABANDONED`, `BOOKING_COMPLETED`, `AFFILIATE_CLICK`, `APPOINTMENT_COMPLETED`, `LAB_BOOKING_COMPLETED`, `IMAGING_BOOKING_COMPLETED`
- **Metadata guard:** rejects JSON keys suggesting clinical payloads
- **Ingest:** `POST /api/v1/admin/crm/conversion-events` (`crm:write`)
- **Audit:** `CONVERSION_EVENT_RECORDED`

---

## 7. API inventory

### Admin (`admin` audience + permissions)

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/api/v1/admin/crm/customers?country_code=&q=&limit=` | `crm:read` |
| GET | `/api/v1/admin/crm/customers/:personId?country_code=` | `crm:read` |
| GET | `/api/v1/admin/crm/customers/:personId/orders?country_code=` | `crm:read` |
| GET | `/api/v1/admin/crm/customers/:personId/tickets?country_code=` | `crm:read` |
| POST | `/api/v1/admin/crm/conversion-events` | `crm:write` |

### Customer

| Method | Route | Audience |
|--------|-------|----------|
| GET | `/api/v1/me/marketing-preferences?country_code=` | `customer` |
| PATCH | `/api/v1/me/marketing-preferences?country_code=` | `customer` |

---

## 8. Admin UI

| Route | Component | Permission |
|-------|-----------|------------|
| `/crm` | `CrmCustomerList` | `crm:read` (nav + API) |
| `/crm/customers/[id]?country=XX` | `CrmCustomerDetail` | `crm:read` |

**States:** loading, empty, permission denied, not found, network/retry. Consumes real R12-A APIs (no mocked production data).

**PHI boundary copy** in UI: explicitly states no health timeline, lab values, imaging payloads, prescriptions, care-nav, or consent/break-glass data.

---

## 9. RBAC / role mapping

| Permission | Roles granted |
|------------|---------------|
| `crm:read` | `company_operations`, `company_support` |
| `crm:write` | `company_operations` |

Clinical permissions are **not** granted to CRM roles. Admin CRM requires `admin` JWT audience + CRM permissions + pack enablement.

---

## 10. Security / PHI / RLS

- Customer 360 responses are PHI-minimal; e2e asserts forbidden clinical tokens absent
- Malformed UUID person IDs → **400**
- Cross-customer access denied via country-activity gate + RLS
- CRM does not join health artifacts, consent scopes, or break-glass payloads
- Worker SELECT policies limited to masked projection use case

---

## 11. Tests

### Focused R12-A

| Suite | Tests | Result |
|-------|-------|--------|
| `r12a.crm-kernel.e2e.spec.ts` | 6 | **PASS** |
| `crm.spec.tsx` (web-admin) | 6 | **PASS** |

Coverage includes: 401 unauthenticated, 403 without `crm:read`, marketing default OFF + opt-in/out + notification sync, Customer 360 without clinical payloads + masked identifiers, conversion idempotency, malformed ID → 400.

### Regression (minimum)

| Suite | Tests | Result |
|-------|-------|--------|
| `r11a.cms-support-kernel.e2e.spec.ts` | — | **PASS** |
| `r10a.care-nav-kernel.e2e.spec.ts` | — | **PASS** |
| `r9f.break-glass-health.e2e.spec.ts` | — | **PASS** |

Full API suite not run (time); focused R12-A + R9/R10/R11 minimum regression green.

---

## 12. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** |

---

## 13. Runtime verification

| Step | Result |
|------|--------|
| Docker Postgres available | **YES** |
| Migrations applied (dev + test) | **YES** — 91 migrations, up to date |
| API `/health/ready` | **NOT RUN** — API server not started in this CR |
| Browser CRM UI | **NOT RUN** — web-admin dev server not started |
| RLS SQL verification | **YES** — FORCE RLS + policies + `worldpharma_app` role via `docker compose exec postgres psql` |

---

## 14. Technical debt

| ID | Class | Item |
|----|-------|------|
| TD-R11A-04 | product/security | `reveal-pii` audited identifier reveal not implemented — CRM shows masked values only |
| TD-R12A-01 | architecture | Redis `marketing` dual-write — Postgres is SoT; Redis field deprecated after cutover (OD-R12-06) |
| TD-R12A-02 | security | Worker SELECT on persons/accounts/identifiers — narrow CRM projection; revisit if broader PII access needed |
| TD-R12A-03 | product | OD-R12-07 medicine advertising — legal gate; **not enabled** |
| TD-R12A-04 | deferred scope | `crm_customer_snapshots` table from Book 205 — not required for R12-A MVP |
| TD-R12A-05 | test infrastructure | Full API regression suite not executed in CR-207 |

---

## 15. R12-A boundary verification

| In scope (R12-A) | Out of scope |
|------------------|--------------|
| CRM 360 metadata projection | Campaign send, segments |
| Durable marketing prefs | Promo admin UX |
| Conversion event log | Affiliate web app |
| Admin CRM shell | Loyalty, wishlist, reviews |
| Pack `crm.enabled` | Personalization engine |
| | R13 analytics/BI |

---

## 16. Final verdict

**`R12_A_IMPLEMENTED`**

**Exact next authorization:** **`CR-POST-R12-A-AUDIT-208`**

Do **not** start R12-B until post-R12-A audit returns a green readiness verdict.
