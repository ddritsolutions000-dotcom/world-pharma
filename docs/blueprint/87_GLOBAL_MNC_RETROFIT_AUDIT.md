# 87 — Global multinational-company retrofit audit

**Status:** Implemented (additive retrofit of the existing system)  
**Authorization:** existing-system MNC retrofit only  
**Does not start:** prescription, lab, samples, pathology, reports, health record, CRM, live PSP, live DHL, real payouts

This is an inspection of **what already shipped** (Phase 0, 1A–1G, P2-HC-1/2, video foundation if present, company-owned admin). Where the current implementation would fail as one global company-controlled ecosystem, it was retrofitted **now**.

---

## Architectural rule

World Pharma remains **one company-controlled platform**. Regions, countries, and legal entities are configuration dimensions. They are not separate platforms, identity systems, or country forks.

**OPEN HUMAN DECISION:** launch countries, legal names, MoR, PSPs, carriers, tax providers, data residency, telemedicine law.  
**LEGAL/COMPLIANCE REVIEW REQUIRED:** tax, telemedicine, licensing, data residency, recording, KYC.

---

## 1. Already MNC-ready (verified in code)

| Area | Evidence |
| --- | --- |
| Identity | One `Person`; memberships carry scope + country/org |
| Auth | E.164 phones via `libphonenumber-js`; no India-only format |
| Country policy | Fail-closed packs; services/payments/shipping gated |
| Catalog | Country assortment, i18n, offer `currency`, seller org |
| Cart | Unique `(customer, country)`; seller conflict; no cross-country merge |
| Money | `BigInt` minor units + ISO 4217 `Char(3)` on quotes, payments, orders, journals |
| Payments | Gateway accounts + routing by country/currency/method; sandbox UNKNOWN retained |
| Orders | Immutable snapshots (tax/shipping/payment/economics) + country + currency |
| Inventory | Lot `countryId` + owner org + location timezone |
| Appointments | `timezone` + country + org/location |
| Video | Country + appointment/encounter; recording default false; tokens not persisted |
| Company vs partner admin | [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md) |
| Events | Outbox + countryId; payload redaction of tokens/secrets |

---

## 2. Problems found (and whether they were fatal)

| Problem | Severity | Action |
| --- | --- | --- |
| No region/legal-entity configuration objects | High | Added `OperatingRegion`, `LegalEntity`, `BusinessUnit` |
| Membership could not express region/legal-entity company staff | High | Scope enum + nullable FKs |
| JWT/principal lacked org/region/legal-entity | High | Hydrated from membership |
| Country-scoped company staff could see global finance counts | High | Finance dashboard filtered by membership country |
| Customer brand/category APIs were not country-required | Medium | Country query required; only in-assortment rows |
| Catalog Redis invalidation existed but browse keys did not include locale | Medium | Cache key `catalog:browse:{country}:{locale}:…` |
| Payment/carrier accounts had CSV only | Medium | Added optional `countryId` / `legalEntityId` |
| Ledger/journals/orders/intents had no legal-entity hook | Medium | Nullable `legalEntityId` — **not backfilled** |
| Outbox envelope had only `countryId` | Medium | Optional region/legal-entity/organization columns |
| Empty policy pack timezones `['UTC']` | Intentional fail-closed | Not a launch pack; published packs may list IANA zones |
| No production legal entities | N/A | Architecture only — **OPEN HUMAN DECISION** |

---

## 3. Code fixes

- `identity/scope.ts` — access scope + country/org/legal-entity assertions
- JWT/session/principal: `organization_id`, `region_id`, `legal_entity_id`
- Company membership scopes include `region` and `legal_entity`
- Catalog storefront brands/categories require `country`
- Catalog browse cache is country+locale scoped
- Cart create stamps `currency` from country default (nullable historical rows)
- Payment router honors account `countryId` / `legalEntityId` when set
- Finance dashboard counts filter to membership country unless platform-scoped
- Outbox enqueue accepts optional region/legal-entity/organization

---

## 4. Schema / migration

Additive migration `20260827150000_mnc_operating_scope`.

New tables: `operating_regions`, `legal_entities`, `business_units`.  
Nullable columns on: countries, organizations, locations, memberships, payment gateway accounts, carrier accounts, ledger accounts, journals, outbox events, carts, payment intents, orders.

**No migrate reset. No rewrite of historical money, journals, orders, or payments.** New dimensions are null until humans configure them.

---

## 5. Authorization

| Actor | Can access |
| --- | --- |
| Platform company role | Cross-country company APIs (still permission-gated) |
| Country-scoped company role | That country only |
| Org admin | Own organization only |
| Partner/doctor | Existing partner/clinical evaluators; never company admin |

Clinical data is still **not** granted by company_admin automatically ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md)).

---

## 6. Tests

- `identity/scope.spec.ts` — unit scope assertions
- `identity/mnc-scope.e2e.spec.ts` — region/legal-entity config, catalog country required, dual carts, country-scoped finance membership
- Full API suite must still pass (Phase 0–1G, P2-HC)

---

## 7. Remaining gaps (honest)

- Legal entities are **not populated** with real companies.
- Ledger chart is still unique on `(country, code)` not `(legal_entity, country, code)` until a human chart-of-accounts decision exists.
- No multi-region physical deployment (hooks only: data_residency_mode, BullMQ prefix, country-scoped queues).
- Search is Postgres `contains`, not a dedicated search cluster.
- `KEYS` for cache invalidation is acceptable at current scale; not Redis Cluster-ready.
- Reporting currency / accounting period calendars are not implemented.
- Telemedicine / residency / recording law still **LEGAL/COMPLIANCE REVIEW REQUIRED**.

---

## 8. Human decisions / legal

OPEN HUMAN DECISION: countries, legal entity names, MoR, PSP, carrier contracts, tax engines, SMS vendor, residency pinning, chart of accounts.  
LEGAL/COMPLIANCE REVIEW REQUIRED: tax, telemedicine, licensing, KYC, recording, cross-border care.

This retrofit does **not** claim the product is commercially “MNC-ready” in a legal sense. It means the **implemented kernel no longer hard-codes a single country/entity/currency/timezone platform**.
