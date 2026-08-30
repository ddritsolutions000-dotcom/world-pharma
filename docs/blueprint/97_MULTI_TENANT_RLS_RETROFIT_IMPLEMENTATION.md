# 97 — Multi-tenant RLS retrofit implementation

**Status:** Implemented (sandbox). **R3 is not started.**  
**Change ID:** **CR-RLS-96-IMPL** (coding authorization for [96](96_MULTI_TENANT_RLS_RETROFIT_PLAN.md))  
**Date:** 27 August 2026  
**Does not:** Store/Delivery/Join apps, R4 healthcare/video product work, live PSP/DHL/payouts, or commerce/healthcare scope expansion.

**Inputs:** [96](96_MULTI_TENANT_RLS_RETROFIT_PLAN.md), [95](95_GLOBAL_CURRENT_STATE_AUDIT.md), [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md), [87](87_GLOBAL_MNC_RETROFIT_AUDIT.md).

**LEGAL/COMPLIANCE REVIEW REQUIRED** remains for residency, break-glass, and workforce access to clinical rows. RLS is not a substitute for clinical ABAC/consent.

---

## 1. Runtime role

| Role | Purpose |
| --- | --- |
| Migrator / `DATABASE_URL` user (`worldpharma` locally) | Migrations, test fixtures, bootstrap seeders. Superuser-class in local Compose; **must stay separate from runtime**. |
| `worldpharma_app` | API + workers runtime. `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, **`NOBYPASSRLS`**, `NOREPLICATION`. |

Local/test role password is the development default `worldpharma_app`. **Human decision:** production must `ALTER ROLE worldpharma_app PASSWORD ...` (or create the role) from a secret manager. Do not commit production passwords.

The API still opens Prisma as the migrator user, then **`SET LOCAL ROLE worldpharma_app`** inside each tenant transaction so FORCE RLS actually applies. Direct runtime `DATABASE_URL` as `worldpharma_app` is also valid.

`GRANT worldpharma_app TO CURRENT_USER` is required for `SET LOCAL ROLE`.

---

## 2. Transaction context

Authenticated principal (JWT + memberships) → **server-built** `TenantContext` → `BEGIN` → `set_config(..., is_local)` + `SET LOCAL ROLE worldpharma_app` → queries → `COMMIT`/`ROLLBACK`.

`PrismaService.runWithTenant` wraps `root.$transaction`. AsyncLocalStorage binds the transaction client so every `this.prisma.*` call in the request/worker uses that client. Nested `$transaction` callbacks reuse the same tenant transaction (isolation upgrade to Serializable is a no-op inside the outer tx).

Context is **not** read from `x-organization-id`, `x-country-id`, or other client headers.

Unauthenticated auth routes use `actor_kind=auth`. HTTP webhooks and workers use `actor_kind=worker`. After outbox lookup, workers re-apply GUCs from **persisted** `outbox_events` columns (`organization_id`, `country_id`, `region_id`, `legal_entity_id`, `actor_id`). Webhook payloads are not an authorization source.

---

## 3. GUCs (transaction-local)

| GUC | Meaning |
| --- | --- |
| `app.actor_kind` | `user` \| `auth` \| `worker` \| `webhook` \| `system` |
| `app.company_scope` | `none` \| `location` \| `organization` \| `business_unit` \| `legal_entity` \| `country` \| `region` \| `platform` |
| `app.person_id` | UUID or empty |
| `app.org_ids` | CSV UUIDs |
| `app.location_ids` | CSV UUIDs |
| `app.country_ids` | CSV UUIDs |
| `app.region_ids` | CSV UUIDs |
| `app.legal_entity_ids` | CSV UUIDs |
| `app.business_unit_ids` | CSV UUIDs (membership has no `business_unit_id` yet) |

Missing `actor_kind` → `app.actor_present()` is false → **deny**. NULL keys are not grants. Company administrators receive `platform` only when a **company** role is bound to `MembershipScope.platform`.

Helpers live in schema `app` (`app.can_person`, `app.can_org`, `app.can_country`, `app.write_org`, `app.is_platform`, `app.is_worker`, …). `p IS NOT NULL` is required in matchers.

---

## 4. Table classifications (summary)

| Class | Examples | Policy idea |
| --- | --- | --- |
| GLOBAL | `countries`, partner types, roles/permissions, payment/carrier catalogs | SELECT if actor present; writes platform/worker |
| COMPANY | `operating_regions`, `legal_entities`, `business_units` | Read by company_scope; write platform/worker |
| COUNTRY | policy packs, country-scoped finance | country GUC + company_scope ≥ country |
| ORGANIZATION | organizations, partners, offers (write), inventory, warehouse | `org_ids` / `write_org` |
| LOCATION | locations, lot location predicates | `location_ids` or owning org |
| PERSON | persons, accounts, sessions, carts, addresses, payment intents | `person_id` |
| RELATIONSHIP/CONSENT | appointments, consent grants, clinical relationships, video sessions | person + org + worker; **ABAC/consent still required** |
| OPERATIONAL | `outbox_events`, inbox, payment/video webhook receipts | worker/platform |

True catalog **item master** SELECT is actor-present (marketplace browse). Offer **writes** and inventory/orders/carts are tenant-scoped.

Leftover public tables receive an auto policy from column names (`seller_org_id`, `owner_org_id`, `customer_person_id`, `order_id`, …) plus worker/platform. Tables with no classifying columns stay worker/platform only.

ENABLE + **FORCE** RLS on all `public` tables.

---

## 5. Worker and webhook behavior

| Path | Context |
| --- | --- |
| Outbox dispatcher | `workerTenantContext()` — worker, not implicit platform god-mode |
| Event worker | bootstrap as worker, then GUCs from the outbox **row** |
| Inventory TTL | `runWithTenant(workerTenantContext(), …)` |
| Logistics booking worker | same |
| HTTP `/webhooks/` | interceptor uses worker context; tenant IDs from stored payment/shipment/video rows |

Bootstrap `onModuleInit` seeders (RBAC catalog, policy pack, sandbox gateways/carriers, finance chart) still run as the migrator connection **without** `SET LOCAL ROLE`. That is explicit bootstrap, not request-path access.

---

## 6. Historical data

Migration writes `app.rls_ownership_gaps` for NULL ownership on `orders.seller_org_id`, `inventory_lots.owner_org_id`, `carts.customer_person_id`, `payment_intents.customer_person_id`. Those columns are NOT NULL in the current schema, so the table is expected to stay empty unless a future relaxation appears. **No money/order/payment/journal meaning was rewritten. No ownership was invented.**

---

## 7. Test evidence

Database-level suite: `apps/api/src/tenancy/rls.tenancy.e2e.spec.ts` using role **`worldpharma_app`**:

- NOSUPERUSER + NOBYPASSRLS
- missing context → zero organization rows
- org A cannot SELECT/UPDATE/DELETE org B
- org A cannot INSERT another organization id
- SET LOCAL does not survive COMMIT
- worker can count outbox without `company_scope=platform`
- country scope cannot see another country’s orgs (when a second country exists)
- interceptor source does not honor client tenant headers

Database-level suite (`rls.tenancy.e2e.spec.ts`): **8/8 passed** as `worldpharma_app`.

**CR-RLS-96-REPAIR (in-place):**

- Shopper availability uses `app.available_qty` (SECURITY DEFINER) so catalog/cart can see boolean/qty without opening lot rows to other vendors.
- Outbox worker records failure in a **new** tenant transaction after the handler tx rolls back.
- OTP verify applies `person_id` GUC before RBAC so company-admin audience can be issued.
- Nested `runWithTenant` restores the previous GUC set after scoped seller/worker work.
- Leftover `_auto` policies on order/shipment/clinical child tables were replaced with parent-EXISTS predicates (not `USING (true)`).
- Doctor availability windows are readable by authenticated actors; writes remain profile-owner scoped.
- Tenant middleware that started a request tx before JWT was removed; interceptor remains the request tenant wrapper.

**CR-RLS-96-FINAL-REPAIR (in-place, 27 Aug 2026):** closed the remaining 4 e2e failures without a second tenancy stack, without `USING (true)`, and without `migrate reset`.

1. **Payment + order (same HTTP tenant transaction).** `insertFromPayment` now applies seller-org worker GUCs on the existing ALS transaction (no nested Prisma interactive tx, no detached tx). `createFromPayment` is no longer swallowed after CARD capture, so a failed child write cannot leave Postgres in `25P02` while idempotency still persists. Finance `syncOrder` / refund `syncPayment` run under `runWithTenant(workerTenantContext)` on that same tx; leftover child `WITH CHECK` that is worker-only no longer aborts the request after JS catch. Cross-customer GET that RLS hides maps to **403** (not Prisma `P2025` 500). Additive `20260827181300_rls_refund_attempts_parent`: `refund_attempts` INSERT/RETURNING via parent `refunds` → `payment_intents` `can_person(customer_person_id)`, not `USING (true)`.
2. **Logistics tracking.** `markReadyToShip` no longer swallows `requestBooking`. Worker GUCs are applied **before** `READY` + mock book so `DRAFT → BOOKING` is legal. Mock `createShipment` / `createLabel` tracking refs are persisted onto `shipments.tracking_number` (actual mock reference, not a fabricated UI value). Booking failures surface to the caller.
3. **Video `security_events` RETURNING.** Additive `20260827181100` / `20260827181200`: INSERT `WITH CHECK` is `actor_present` plus `person_id IS NULL OR can_person OR worker/platform OR actor_kind=auth` (auth OTP/login may stamp `person_id` before user GUCs). SELECT for RETURNING is `can_person` / auth / worker / platform / null-person + actor present — not `USING (true)`. `video_join_audits` SELECT/INSERT via `can_person(actor_person_id)` or appointment customer/doctor, WITH CHECK owner/worker/platform.
4. **Inventory child WITH CHECK.** Same 812 migration adds `is_worker()` to `inventory_balances` / `inventory_movements` WITH CHECK so seller-org worker consumption in the capture tx is allowed without opening those tables globally.

Full API Jest (`nx test api`, 27 Aug 2026 after final repair): **111 passed, 0 failed**. RLS tenancy: **8/8**. Typecheck: PASS. Prisma validate: PASS. Migration status: UP TO DATE (33 migrations). `worldpharma_app`: `rolsuper=f`, `rolbypassrls=f`.

**R3 is not started.**

---

## 8. Known limitations

1. HTTP webhook handler still uses worker visibility for the **lookup** of provider events (then persists). Subsequent domain writes should follow stored org/person columns; some payment/shipment policies still allow `is_worker()` for all rows of that type. Narrowing lookup to `SECURITY DEFINER` by provider event id is a follow-up.
2. `memberships.business_unit_id` does not exist; `app.business_unit_ids` is wired but unused by membership load.
3. Marketplace catalog SELECT is not vendor-private (by design). Inventory, lots, reservations, and writes are.
4. Nested Prisma `$transaction({ isolationLevel: Serializable })` inside an HTTP tenant tx does not start a new isolation level.
5. Local role password is a dev default. Production secret rotation is a human ops task.
6. Clinical RLS is **not** consent/ABAC. Doctor A vs B private credentials rely on leftover/auto policies plus person match; clinical access evaluation remains in services.

---

## 9. Remaining human decisions

- Production `worldpharma_app` password and whether API `DATABASE_URL` is the app role directly vs migrator + `SET LOCAL ROLE`.
- Whether webhook lookup should be a `SECURITY DEFINER` function instead of worker-wide SELECT on payment/shipment webhook tables.
- Break-glass / residency legal review (unchanged from 96).
- Authorize R3 only after this retrofit is accepted in the target environment.

---

## 10. Acceptance (engineering)

| Item | Result |
| --- | --- |
| Runtime app role NOBYPASSRLS | Yes (role definition + test) |
| Runtime app role not superuser | Yes |
| Tenant context server-derived | Yes (JWT + memberships) |
| SET LOCAL transaction-safe | Yes |
| Pool leakage test | Yes (SET LOCAL after COMMIT) |
| Tenant RLS policies | Yes |
| FORCE RLS | Yes |
| Missing context fail closed | Yes |
| Cross-tenant SELECT/INSERT/UPDATE/DELETE | Yes on organizations (DB role) |
| Worker access explicit | Yes (dispatcher/worker/TTL/logistics) |
| Webhook scope persisted-record derived | Partial (lookup as worker; IDs not taken from payload for authz of later rows once GUCs applied from DB) |
| Historical ownership gaps reported | Yes (`app.rls_ownership_gaps`) |
| Full regression | **PASS** — 111/111 API tests (`nx test api`, 27 Aug 2026) |
| Product scope not expanded | Yes |

**R3 is not auto-started.** Partner Store/Delivery/Join clients remain unauthorized until a separate CR after this retrofit is accepted.
