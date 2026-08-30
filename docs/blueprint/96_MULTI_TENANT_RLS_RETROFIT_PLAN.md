# 96 — Multi-tenant RLS / tenancy retrofit (plan only)

**Status:** Plan. **Not a coding authorization.**  
**Change ID:** **CR-RLS-96**  
**Date:** 27 August 2026  
**Does not:** implement code, migrations, schema edits, R3 apps, or behavior changes.

**Inputs:** [95](95_GLOBAL_CURRENT_STATE_AUDIT.md), [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md), [87](87_GLOBAL_MNC_RETROFIT_AUDIT.md), [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md), [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md).

**LEGAL/COMPLIANCE REVIEW REQUIRED** for residency, break-glass, and workforce access to clinical rows. Do not encode India/INR/GST/UPI/DHL or medical statutes in policies.

---

## 0. Current weaknesses (evidence)

| Weakness | Evidence |
| --- | --- |
| Most RLS policies are no-ops | `USING (true) WITH CHECK (true)` on identity, partner, catalog, inventory, cart, finance, clinical, video, etc. |
| Partial person policies unused | `orders`, `payment_intents`, `shipments` check `app.person_id` **or** `app.bypass_rls='on'` — **Prisma never `SET LOCAL` those GUCs** (`PrismaService` is a bare client) |
| Superuser bypass | App connection is table owner / superuser-class: **FORCE RLS does not apply to SUPERUSER / BYPASSRLS** |
| Isolation is service-layer only | Vendor org asserts, membership `scope.ts`, JWT audience — **correct but insufficient** if SQL is ever leaked, admin raw query, or a missed WHERE |
| Business unit | `business_units` table exists; **no `memberships.business_unit_id`** |
| Pool leakage | No transaction-scoped tenant context → even after SET SESSION, PgBouncer/pool reuse would leak |

**Do not load real partner/store/vendor production data until this retrofit is implemented, tested, and enabled.**

---

## 1. Target architecture

RLS **complements** RBAC + ABAC. It never replaces clinical consent checks ([94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md) / clinical books).

```
Authenticated principal (JWT + memberships)
        ↓  API/worker only — never client headers
Build TenantContext (fail-closed)
        ↓
BEGIN
  SET LOCAL app.person_id = ...
  SET LOCAL app.org_ids = ...
  SET LOCAL app.location_ids = ...
  SET LOCAL app.country_ids = ...
  SET LOCAL app.region_ids = ...
  SET LOCAL app.legal_entity_ids = ...
  SET LOCAL app.business_unit_ids = ...
  SET LOCAL app.company_scope = none|location|organization|business_unit|legal_entity|country|region|platform
  SET LOCAL app.actor_kind = user|worker|webhook|system
  SET LOCAL app.bypass_rls = off   -- on only for audited system jobs
  <queries>
COMMIT  -- LOCAL settings discarded; pool-safe
```

**Roles (PostgreSQL):**

| Role | Use |
| --- | --- |
| `worldpharma_migrator` | Migrations only; owner; BYPASSRLS |
| `worldpharma_app` | API + workers; **NOBYPASSRLS**; not superuser |
| `worldpharma_readonly` | Optional BI; same RLS; SELECT-only |

Helpers (SQL `SECURITY DEFINER` **stable**, not invoker leaking): `app.uuid_guc(name)`, `app.uuid_array_guc(name)`, `app.scope()`, `app.actor()`, `app.can_company(level)`, `app.org_match(org_id)`, `app.person_match(person_id)`, `app.location_match(location_id)`. Missing GUC → empty → **deny**.

**No** `x-organization-id` / `x-country-id` as authorization.

---

## 2. Which scope applies to which domain

| Data | Primary RLS class | Notes |
| --- | --- | --- |
| `countries`, `partner_types`, role/permission catalogs, chart-of-accounts **codes** | GLOBAL | Read all authenticated; write company_platform only |
| Policy packs, country enablement | COUNTRY + company ≥ country | Partners read published pack for their country |
| `operating_regions`, `legal_entities`, `business_units` | COMPANY (read by scope) | Write platform/region/LE as appropriate |
| `persons`, `accounts`, identifiers, sessions, TOTP | PERSON (+ company identity ops) | Never org-wide dump |
| `memberships` | PERSON (own) + COMPANY identity | Cannot insert `company_*` roles except company grant path |
| Organizations, locations | ORGANIZATION / LOCATION | Company sees per `company_scope` |
| Partners, applications, KYC blobs metadata | ORGANIZATION + COUNTRY + PERSON (applicant) | KYC bytes already private store |
| Catalog **item master** (platform SKU) | COUNTRY assortment | Public read if pack; write catalog:admin company |
| Offers / prices | ORGANIZATION (`seller_org_id`) + COUNTRY | Vendor A ↛ B |
| Inventory lots, GRN, reservations, transfers | LOCATION (+ org) | Store A ↛ B |
| Carts, addresses, checkout | PERSON + COUNTRY | Unique (person, country) already |
| Orders, fulfillments | PERSON (customer) **OR** ORGANIZATION (seller) **OR** company order:read in country | Dual path policies |
| Shipments, jobs, POD | Same as order **plus** assignee PERSON for rider | Rider: `assignee_id = person` only |
| Payments, refunds | PERSON (customer) **OR** company payment:read in country/LE | Never vendor reading others’ PAN — PAN not stored |
| Journals, payables, payouts, facts | LEGAL_ENTITY + COUNTRY; company finance perms | Org finance: own `seller_org_id` lines only |
| Doctor profile, credentials | PERSON (doctor) + company doctor:review | |
| Appointments, encounters, video_sessions | RELATIONSHIP (patient or practitioner) + company appointment:read in country | **Payload** still ABAC/consent |
| Consent grants | PERSON (grantor) + grantee in relationship | |
| Security events / audit | INSERT by actor; SELECT company audit **or** own person | Append-only |
| Outbox | INSERT same txn; SELECT worker | Worker scoped after claim |
| Future lab/radiology/care-nav | ORGANIZATION / RELATIONSHIP / PERSON | Same pattern; no new tenancy model |

**BUSINESS_UNIT:** policies ready as `app.business_unit_ids()`; until membership binds BU, leave GUC empty → BU predicates **not used** (fail-open on BU only if column IS NULL). Do not fake BU.

---

## 3. Company admin (no universal god mode)

`app.company_scope` from **membership.scope**, not from role name alone:

| Membership scope | `company_scope` | Row predicate |
| --- | --- | --- |
| `platform` + company role | `platform` | Country/org filters optional (still RBAC) |
| `region` | `region` | `region_id IN app.region_ids()` |
| `country` | `country` | `country_id IN app.country_ids()` |
| `legal_entity` | `legal_entity` | `legal_entity_id IN app.legal_entity_ids()` |
| `organization` | `organization` | org match; **not** global finance |
| `location` | `location` | location match |
| none / partner | `none` | partner predicates only |

**Break-glass:** `app.actor_kind='system'` + `app.bypass_rls=on` + `app.bypass_reason` + security event. Time-boxed grant already in 86; RLS bypass is **that path only**, never a partner permission.

`platform` still needs **permission** (`finance:read`, etc.). RLS allows the row; RBAC may still 403.

---

## 4. Partner / customer guarantees (policy intent)

| Guarantee | Mechanism |
| --- | --- |
| Vendor A ↛ B | Offers/inventory/orders `seller_org_id IN app.org_ids()` |
| Store A ↛ B | Lots `location_id IN app.location_ids()` (if location-scoped) else org |
| Doctor ↛ other panel | Doctor tables person_id or org clinic membership |
| Lab ↛ other lab | Future org_id (R7) |
| Rider ↛ unrelated jobs | `assignee_id = app.person_id()` (not all org jobs unless dispatcher role) |
| Affiliate ↛ other earnings | Person or affiliate org on liability |
| Org admin ↛ company ledger | Finance policies require company_scope ≥ legal_entity **and** finance permission |
| Customer A ↛ B | Cart/order/payment/address `customer_person_id = app.person_id()` |
| Clinical payload | RLS may show appointment **exists**; **service** still requires relationship+consent |

---

## 5. SELECT / INSERT / UPDATE / DELETE

| Command | Pattern |
| --- | --- |
| SELECT | USING (predicate) |
| INSERT | WITH CHECK (same predicate; cannot insert into other org) |
| UPDATE | USING + WITH CHECK (cannot reassign `seller_org_id` / `customer_person_id` to escape) |
| DELETE | USING; **deny** on journals, security_events, outbox (append-only) except migrator |

Split policies per command. No `FOR ALL USING (true)`.

**Genuinely GLOBAL** (catalog of ISO countries, permission codes): SELECT true for authenticated `app.person_id IS NOT NULL`; writes company_platform only. Explain in migration comments.

---

## 6. Workers, cron, webhooks

| Actor | Context |
| --- | --- |
| HTTP user | From JWT memberships; `bypass=off` |
| Outbox dispatcher | `actor_kind=worker`; claim row by `id` in a **short bypass** subtransaction **or** `FOR UPDATE SKIP LOCKED` on outbox (GLOBAL worker table); **payload apply** in a second txn with GUCs copied from **persisted** `country_id` / `organization_id` on the event row |
| Finance posting | Same; never `bypass=on` for the whole worker process |
| Payment/carrier webhook | Authenticate HMAC; load intent/shipment **by provider id**; SET LOCAL from **that row**; ignore payload org/country for authz |
| Reconciliation | Company finance scope of the **job’s legal_entity_id** stored on the job |

**Forbidden:** a long-lived pooled connection with `bypass_rls=on`.

---

## 7. Migration strategy (when later authorized)

1. **Inventory** all `CREATE POLICY` (this book §0).  
2. **Roles:** create `worldpharma_app` NOBYPASSRLS; stop API using superuser.  
3. **Helpers** + `SET LOCAL` interceptor wrapping **every** request in `$transaction` (Prisma interactive).  
4. **Indexes** on org/location/country/region/LE/person/seller_org (many exist). Add missing composite indexes listed §9.  
5. **Replace** `USING (true)` policies table-by-table (shadow names, then drop old).  
6. **Backfill** only **NULL ownership** that is required for deny-closed (e.g. country_id on operational rows). **Do not rewrite** money amounts, journals, or order snapshots. If a historical row lacks org, leave visible only to `platform` until backfilled by ops script with audit.  
7. **FORCE RLS** on `worldpharma_app`.  
8. **Regression:** existing e2e + new matrix §10 **with app role**.  
9. **Gate:** only then allow R3 to persist real partner/store data.

Feature flag `TENANCY_RLS=enforce|shadow|off`: shadow = policies exist but app still superuser (measure); enforce = app role.

---

## 8. Fail-closed

If `app.actor_kind` unset or `app.person_id` empty for a user request: **all non-GLOBAL SELECT/DML deny**.

No fallback to “first org”, “any country”, or platform.

Workers must set `actor_kind` + at least one of person/org/country/LE **or** explicit audited bypass.

---

## 9. Performance

Prefer **column compare to GUC arrays** (`= ANY(app.org_ids())`) over joins to `memberships` in every policy.

| Index (if missing) | Tables |
| --- | --- |
| `(seller_org_id, country_id)` | offers, orders |
| `(organization_id, location_id)` | lots, GRN |
| `(customer_person_id, country_id)` | carts, orders, intents |
| `(assignee_id, status)` | logistics_jobs |
| `(legal_entity_id, country_id)` | journals, payouts |
| `(country_id)` | packs, catalog_item_countries |

**Tradeoff:** array GUC vs join memberships — arrays stay small (one login’s orgs). Avoid subquery to `memberships` per row (initplan OK if `STABLE`).

InitPlan: `current_setting` is cheap; `::uuid` once per helper.

---

## 10. Test matrix (later implementation)

Must run **as `worldpharma_app`**, not migrator.

Negative tests: vendor A SELECT B offer; store loc1 UPDATE loc2 lot; customer A cart B; country-ops finance other country; org_admin SELECT journals of other LE; rider job not assigned; missing GUC; **pool reuse** (two sequential requests different persons on one Prisma connection — second must not see first); webhook with forged `organization_id`; INSERT offer with other `seller_org_id`; UPDATE order reassign customer; DELETE journal denied; platform admin with `order:read` still scoped if membership is country; partner cannot SET `bypass`.

Clinical: RLS may return appointment metadata; service still 403 without consent.

---

## 11. MNC

Policies use **IDs in GUC**, never ISO country codes or currencies. Adding a country is pack + membership, not a new policy file.

---

## 12. Affected tables (policy replacement)

**USING(true) today (replace):** persons, accounts, identifiers, otp, devices, sessions, refresh, memberships, totp, recovery, security_events, countries, policy_packs, partner_types, partners, applications, KYC, documents, organizations, locations, invitations, catalog_*, inventory_*, goods_receipts, transfers, carts, cart_items, quotes, addresses, checkout_*, promo_*, affiliate_attribution, idempotency, finance_*, shipping_quotes, return_shipments, logistics_jobs/events, doctor_*, consent_grants, clinical_relationships, appointments*, encounters, video_*.

**Partial person GUC (keep idea, wire SET LOCAL, add org/company OR):** orders, payment_intents, payment_attempts, refunds, shipments.

**Likely GLOBAL read:** permission/role catalogs, currency/ISO seed, outbox (worker).

Exact GRANT/REVOKE in the implementation CR, not here.

---

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Superuser still used | Fail CI if API role has BYPASSRLS |
| Pool leak | SET LOCAL only; test |
| Policy too slow | Indexes; EXPLAIN; no membership join |
| Historical NULL org | Platform-only visibility until backfill |
| Breaks e2e | Dual-run shadow then enforce |
| RLS used as consent | Document ABAC still required |
| Bypass flag in JWT | Never; only system grant |

---

## 14. Dependencies

- Prisma interactive transaction per request (Nest interceptor).  
- PgBouncer **transaction** pooling compatible with SET LOCAL.  
- Role provisioning in compose/CI.  
- Does **not** require R3 apps.  
- Does **not** require live PSP.

---

## 15. R3 relationship

**R3 must not load real partner data until CR-RLS-96 is implemented and enforced** (or a human accepts residual risk in writing).

**R3 coding** of **empty shells** against sandbox fixtures **may** proceed **in parallel** only if: (a) this retrofit is **authorized and in progress**, or (b) R3 uses synthetic orgs and a written exception. **Default: implement 96 first, then authorize R3.**

---

## 16. Next implementation authorization required

**Exact next coding CR:** **CR-RLS-96-IMPL** — “Enable `worldpharma_app` NOBYPASSRLS + SET LOCAL tenant GUC + replace no-op policies + tests as `worldpharma_app`.”

Not R3, not R4, not live money.

---

## 17. Confirmation

This task is **plan documentation only**. **STOP.**
