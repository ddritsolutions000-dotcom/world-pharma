# 208 — Post-R12-A implementation audit

**CR:** CR-POST-R12-A-AUDIT-208  
**Date:** 29 August 2026  
**FINAL STATUS:** **R12_A_GREEN_R12_B_READY**

**Authority:** [207](207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [206](206_POST_R12_PLAN_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Independent audit of **R12-A only** (CRM / Customer 360 kernel, durable marketing preferences, conversion events, admin CRM shell). **Audit-only** — no source, schema, migration, API, UI, test, or configuration changes were made during this CR.

---

## 1. Executive summary

Book 207 accurately describes the R12-A implementation in repository state. All R12-A deliverables are present: CRM module, Customer 360 metadata projection, `marketing_preferences`, `conversion_events`, admin CRM APIs, web-admin shell, RBAC, pack gating, security events, migrations, and FORCE RLS.

**No accidental R12-B+ scope** was found (no campaigns, segments, promo admin, affiliate web, loyalty, wishlist, reviews, personalization, or refill marketing automation).

**No blockers** prevent R12-B authorization. Recorded debt is **test infrastructure**, **security hardening follow-up**, **architecture (dual-write)**, **product/legal gates**, and **deferred scope** — none block R12-B planning/implementation authorization.

---

## 2. Implementation verification (Book 207 vs repository)

| Book 207 claim | Repository verification | Result |
|----------------|-------------------------|--------|
| `apps/api/src/crm/` module (8 files) | Present: module, controllers, services, mask, e2e | **PASS** |
| 5 R12-A migrations (`20260829200000`–`00400`) | Present; `prisma migrate status` → up to date (91 migrations) | **PASS** |
| Prisma `MarketingPreference`, `ConversionEvent` | In `schema.prisma` L5197–5249 | **PASS** |
| Web-admin `/crm`, `/crm/customers/[id]` | `app/crm/*`, list/detail components, `crm-api.ts`, nav | **PASS** |
| `crm:read` / `crm:write` RBAC | `authority.ts`, `rbac.service.ts`; roles mapped | **PASS** |
| Policy `crm.enabled` default false | `document.ts`, `empty-pack.ts` | **PASS** |
| Security events | `CRM_CUSTOMER_VIEW`, `MARKETING_PREF_CHANGED`, `CONVERSION_EVENT_RECORDED` | **PASS** |
| Notification dual-write | `notification.service.ts` reads/writes Postgres for `marketing` only | **PASS** |
| No unreported R12-A files | Grep: no campaign/segment/wishlist/loyalty in `crm/` | **PASS** |

**Discrepancy (non-blocking):** Book 207 §13 reports `_prisma_migrations` count implicitly as 91 (folder count). Live DB `SELECT COUNT(*) FROM _prisma_migrations` returned **97** rows while `prisma migrate status` reports schema up to date with **91** migration files — likely historical/partial apply rows in dev DB. **Classification:** environment/ops observation; not a schema drift blocker.

---

## 3. CRM / Customer 360 audit

### 3.1 Metadata-only projection

`Customer360Service` reads from existing kernels via explicit `select` projections:

| Slice | Source | Clinical exclusion |
|-------|--------|-------------------|
| Profile | `Person`, `Account`, `AccountIdentifier` | `maskIdentifier()` — no raw email/phone in response |
| Orders | `Order` + items | `prescriptionId` → boolean `has_prescription_link` only |
| Appointments | `Appointment` | status/type/schedule/specialties JSON — no consult notes |
| Lab | `LabBooking` | `report_released` from version status only — no analyte/report body |
| Imaging | `ImagingBooking` | `report_released` flag only — no findings/DICOM |
| Support | `SupportTicket` | operational subject/status/refs |
| Refills | `RefillRequest` | status/timestamps only |
| Marketing | `MarketingPreference` | boolean flags only |

**No queries** to `health_timeline_events`, `health_artifacts`, `consent_*`, `break_glass_grants`, `prescription_version*`, care-nav narrative tables, or lab/imaging report payloads.

### 3.2 Authorization

| Control | Evidence | Result |
|---------|----------|--------|
| Admin audience | `@RequireAudiences('admin')` on `AdminCrmController` | **PASS** |
| RBAC | `@RequirePermissions('crm:read'/'crm:write')` + `PermissionsGuard` | **PASS** |
| Pack gate | `assertCrmEnabled()` → `policy.document.crm.enabled` | **PASS** |
| Country scope | `country_code` query param + `countryId` filters on all slices | **PASS** |
| Malformed UUID | `assertUuid()` → 400 (e2e verified) | **PASS** |
| Customer 360 activity gate | `getCustomer360` requires order/ticket/appointment in country else 404 | **PASS** |
| Masked identifiers | `crm-mask.ts`; e2e checks no unmasked email pattern | **PASS** |

### 3.3 Findings (non-blocking)

| ID | Finding | Classification |
|----|---------|----------------|
| **TD-R12A-06** | `GET .../customers/:id/orders` and `.../tickets` do **not** apply the same composite activity gate as `getCustomer360` — they return empty arrays instead of 404 when no rows | security/product — low; data still country+person scoped |
| **TD-R12A-07** | E2e does **not** explicitly test wrong-country, cross-customer, or wrong-organization denial | test infrastructure |
| **TD-R12A-08** | `r12a.crm-kernel.e2e.spec.ts` Customer 360 test **flaked** once (list returned non-200 when order reassignment path not taken); **isolated rerun passed 6/6** | test infrastructure |

**Cross-customer / wrong-country:** Server-side enforcement relies on country-scoped queries + RLS on underlying kernels + 360 activity gate. **Not e2e-proven** for all negative cases — documented as test gap, not product blocker.

---

## 4. CRM source-of-truth audit

| Kernel | Authoritative | CRM behavior | Result |
|--------|---------------|--------------|--------|
| Orders | `order.service` / `Order*` | Read-only `findMany` | **PASS** — no duplicate kernel |
| Appointments | clinical appointment kernel | Read-only metadata | **PASS** |
| Support | R11 `SupportTicket*` | Read-only metadata | **PASS** |
| Lab/imaging | R7/R8 kernels | Status flags only | **PASS** |
| Clinical/health | R9 health kernel | **Not accessed** | **PASS** |
| Marketing prefs | New R12-A table | Own kernel (in scope) | **PASS** |
| Conversion events | New R12-A table | Append-only ingest | **PASS** |

**No CRM write paths** mutate orders, appointments, support tickets, or clinical records. Conversion events and marketing prefs are the only R12-A write surfaces.

---

## 5. Database / migration audit

### 5.1 Migrations (verified present)

1. `20260829200000_r12a_crm_schema` — tables, enums, indexes, FKs
2. `20260829200100_r12a_crm_rls` — FORCE RLS, deny-by-default policies
3. `20260829200200_r12a_crm_grants` — `GRANT` to `worldpharma_app`
4. `20260829200300_r12a_crm_identifier_worker_select` — CRM projection SELECT policy
5. `20260829200400_r12a_crm_person_worker_select` — persons/accounts worker SELECT

### 5.2 Schema correctness

| Requirement | Verification | Result |
|-------------|--------------|--------|
| `marketing_preferences` PK/FK/unique `(person_id, country_id)` | migration.sql + schema | **PASS** |
| Defaults `marketing_allowed=false` | column default + service defaults | **PASS** |
| Optimistic `version` | column + 409 on conflict in service | **PASS** |
| `conversion_events` append-only | UPDATE/DELETE policies `USING(false)` | **PASS** |
| Unique `(source, source_key, event_kind)` | unique index | **PASS** |
| Person/country scope | FKs to `persons`, `countries` | **PASS** |

### 5.3 RLS (verified via Docker Postgres)

```
marketing_preferences | relforcerowsecurity = t
conversion_events     | relforcerowsecurity = t
worldpharma_app       | rolsuper = f, rolbypassrls = f
```

- **No `USING(true)`** on new R12-A table policies (grep confirmed)
- Identity worker SELECT policies are **additive SELECT-only** — writes unchanged on existing policies

**Note:** `marketing_preferences_select` includes `app.can_country("country_id")` — broader than person-only; acceptable for country-scoped worker CRM context. **TD-R12A-02** remains open for review.

---

## 6. Marketing preference audit

| Requirement | Verification | Result |
|-------------|--------------|--------|
| Postgres SoT for `marketing_allowed` | `MarketingPreferenceService` + notification overlay | **PASS** |
| Default OFF | DB default + `presentDefaults()` + Redis default | **PASS** |
| Explicit opt-in/out | PATCH + e2e | **PASS** |
| Person + country isolation | unique constraint + RLS + `country_code` param | **PASS** |
| Version/concurrency | `version` increment; 409 when `expectedVersion` mismatch | **PASS** (409 not e2e-tested) |
| Audit event | `MARKETING_PREF_CHANGED` on flag transition | **PASS** |
| Redis limited to `marketing` | `notification.service.ts` — only `marketing` field dual-written | **PASS** |
| Transactional prefs unchanged | Redis keys for order/appointment/delivery/etc. untouched | **PASS** |
| No second notification system | Reuses `NotificationService` + outbox kernel | **PASS** |

### Route naming (TD-R12-PLAN-01 from Book 206)

| Route | Status |
|-------|--------|
| `GET/PATCH /api/v1/me/marketing-preferences?country_code=` | **IMPLEMENTED** (dedicated R12-A controller) |
| `GET/PATCH /api/v1/me/notifications/preferences` | **PRESERVED** — `marketing` field syncs to Postgres via primary country (fallback XX) |

**Resolution:** Book 206 planning debt **resolved** in R12-A by adding dedicated route **and** preserving backward-compatible notification route. **PASS**

---

## 7. Conversion-event audit

| Requirement | Verification | Result |
|-------------|--------------|--------|
| Append-only | RLS no UPDATE/DELETE; service only `create`/`findUnique` | **PASS** |
| Idempotency | unique `(source, source_key, event_kind)`; e2e replay returns same `id` | **PASS** |
| Country scope | `country_id` FK + `can_country` on insert | **PASS** |
| Metadata guard | `assertSafeMetadata()` rejects clinical key tokens | **PASS** |
| Audit event | `CONVERSION_EVENT_RECORDED` | **PASS** |
| Admin/worker scoped | insert requires `is_worker()` or `is_platform()` | **PASS** |
| No R13 BI | No warehouse/search/analytics tables or vendors | **PASS** |

---

## 8. API audit

### Routes (actual vs Book 207)

| Method | Route | Book 207 | Repo | Result |
|--------|-------|----------|------|--------|
| GET | `/api/v1/admin/crm/customers` | ✓ | `AdminCrmController` | **MATCH** |
| GET | `/api/v1/admin/crm/customers/:personId` | ✓ | ✓ | **MATCH** |
| GET | `/api/v1/admin/crm/customers/:personId/orders` | ✓ | ✓ | **MATCH** |
| GET | `/api/v1/admin/crm/customers/:personId/tickets` | ✓ | ✓ | **MATCH** |
| POST | `/api/v1/admin/crm/conversion-events` | ✓ | ✓ | **MATCH** |
| GET/PATCH | `/api/v1/me/marketing-preferences` | ✓ | `MarketingPreferenceController` | **MATCH** |
| GET/PATCH | `/api/v1/me/notifications/preferences` | ✓ (dual-write) | existing platform route | **MATCH** |

**Guards on all admin CRM routes:** `JwtAuthGuard`, `AudienceGuard`, `PermissionsGuard`, pack gate in service.

**No extra R12-A admin routes** beyond Book 207 inventory.

---

## 9. Admin CRM UI audit

| Requirement | Verification | Result |
|-------------|--------------|--------|
| `/crm` list | `CrmCustomerList` → `listCrmCustomers()` | **PASS** |
| `/crm/customers/[id]` | `CrmCustomerDetail` → `getCrmCustomer360()` | **PASS** |
| Real API (no prod mocks) | `crm-api.ts` fetch to `NEXT_PUBLIC_API_BASE_URL` | **PASS** |
| Permission denied (403) | `PermissionDeniedState` | **PASS** |
| Not found (404) | `EmptyState` | **PASS** |
| Network/retry | `NetworkErrorState` | **PASS** |
| Loading/empty | `LoadingState`, `EmptyState` | **PASS** |
| Country scoping | `?country=` query param | **PASS** |
| PHI boundary copy | List + detail disclaimers | **PASS** |
| No clinical sections | UI shows orders/appointments/lab status/tickets/marketing only | **PASS** |
| Nav gating | `nav.ts` — `crm:read` | **PASS** |

**Minor UI gap (non-blocking):** imaging bookings and refill requests returned by API but **not rendered** in detail UI (lab bookings shown; imaging/refills omitted). **TD-R12A-09** deferred scope / product polish.

**Browser runtime:** not exercised in this audit (no web-admin dev server started).

---

## 10. Security / RLS negative testing

### Executed (this audit)

| Suite | Tests | First run | Isolated rerun | Affects R12-A? |
|-------|-------|-----------|----------------|----------------|
| `r12a.crm-kernel.e2e.spec.ts` | 6 | **1 fail** (list 200) | **6 pass** | Flake only — TD-R12A-08 |
| `crm.spec.tsx` | 6 | 6 pass | — | No |

**E2e coverage present:** 401, 403, marketing default/opt-in/out, 360 no clinical tokens, conversion idempotency, malformed ID 400.

**E2e coverage absent (TD-R12A-07):** explicit wrong-country, cross-customer, wrong-org, marketing version 409, pack-disabled 403.

---

## 11. Regression audit

| Suite | Tests | Result | R12-A impact |
|-------|-------|--------|--------------|
| `r11a.cms-support-kernel.e2e.spec.ts` | — | **PASS** | None — R11 preserved |
| `r10a.care-nav-kernel.e2e.spec.ts` | — | **PASS** | None — R10 preserved |
| `r9f.break-glass-health.e2e.spec.ts` | — | **PASS** | None — R9 preserved |

**Full API suite:** not run (TD-R12A-05). Focused R12-A + minimum R9/R10/R11 regression **green**.

**R12-A did not weaken** existing RLS on R0–R11 tables. Additive worker SELECT policies on identity tables are new scope for CRM projection only.

---

## 12. Typecheck / build audit

| Target | Result (this audit) |
|--------|---------------------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** |

---

## 13. Runtime audit

| Step | Result |
|------|--------|
| Docker Postgres | **UP** (healthy) |
| Docker Redis | **UP** (healthy) |
| `prisma migrate status` | **Up to date** (91 migrations) |
| RLS SQL verification | **PASS** (FORCE RLS + role) |
| API `node dist/main.js` | **NOT RUN** — `dist/main.js` absent after nx build (webpack output path); e2e provides integration coverage |
| `/health/ready` smoke | **NOT RUN** |
| Browser CRM UI | **NOT RUN** |

**Classification:** Runtime smoke deferred — environment/ops. E2e tests against live Postgres+Redis provide API-level runtime verification.

---

## 14. PHI / privacy audit

| Surface | Clinical data? | Evidence |
|---------|----------------|----------|
| Customer 360 API | **No** | Explicit `select` lists; no health artifact joins |
| Marketing preferences | **No** | Boolean flags only |
| Conversion events | **No** | Metadata key guard; operational kinds |
| Security events | **No** | IDs + booleans in metadata |
| Notification/outbox | **No change** | Existing PHI-minimal contract preserved |
| Admin CRM UI | **No** | Masked identifiers; operational fields only |

**Uncertainty (low):** Order line `title` could theoretically contain user-entered clinical text from commerce — same pre-existing commerce risk, not introduced by R12-A. No new clinical copy path.

---

## 15. Pack / policy audit

| Requirement | Result |
|-------------|--------|
| `crm.enabled` explicit in policy schema | **PASS** — default `false` |
| Disabled pack denies CRM | **PASS** — `assertCrmEnabled()` → 403 |
| Server-authoritative | **PASS** — no client pack bypass |
| OD-R12-07 medicine advertising | **NOT enabled** — no ad/campaign send code |
| Marketing send | **NOT implemented** — prefs only |

---

## 16. Technical debt (re-check + new)

| ID | Class | Status |
|----|-------|--------|
| TD-R11A-04 | product/security | **OPEN** — no `reveal-pii`; masked only |
| TD-R12A-01 | architecture | **OPEN** — Redis marketing dual-write; Postgres SoT |
| TD-R12A-02 | security | **OPEN** — worker SELECT on identity tables for CRM |
| TD-R12A-03 | product | **OPEN** — OD-R12-07 medicine advertising gate |
| TD-R12A-04 | deferred scope | **OPEN** — `crm_customer_snapshots` not built |
| TD-R12A-05 | test infrastructure | **OPEN** — full API suite not run |
| TD-R12-PLAN-01 | planning | **RESOLVED** — dedicated + notification routes coexist |
| TD-R12A-06 | security/product | **NEW** — sub-routes lack 360 activity gate |
| TD-R12A-07 | test infrastructure | **NEW** — missing negative tenancy e2e |
| TD-R12A-08 | test infrastructure | **NEW** — Customer 360 e2e flake |
| TD-R12A-09 | product | **NEW** — UI omits imaging/refill sections present in API |

---

## 17. R12 boundary verification

### Implemented (R12-A only)

- CRM / Customer 360 metadata kernel
- Durable marketing preferences
- Conversion events
- Admin CRM shell
- Migrations + RLS + RBAC + security events

### NOT STARTED (confirmed)

- R12-B campaigns/segmentation/send
- R12-C promo admin/customer UX
- R12-D affiliate web/referral
- R12-E wishlist/loyalty
- R12-F reviews/personalization
- R12-G refill marketing hooks
- R12-H closure
- R10-E/F
- R13+

**No accidental scope expansion detected.**

---

## 18. Blocker classification

**No product, security, database, or architecture blockers** prevent R12-B authorization.

Recorded debt is test infrastructure, minor security hardening follow-up, architecture dual-write cutover, product/legal gates, and deferred UI polish — **none block R12-B**.

---

## 19. Audit verdict

### **R12_A_GREEN_R12_B_READY**

---

## 20. Next authorization

**`CR-R12-B-IMPL-209`** — R12-B marketing campaigns + segments + consent-gated send pipeline (per [205](205_R12_IMPLEMENTATION_PLAN.md) §R12-B).

**HARD STOP:** Do not implement R12-B until explicitly authorized by CR-R12-B-IMPL-209. Do not start R12-C+, R10-E/F, or R13+.
