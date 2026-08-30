# 24 — Search Architecture

**Status:** Blueprint  
**Audience:** Architecture, search/backend, product, privacy, pharmacy/lab catalog ops  
**Requirement IDs:** REQ-SRCH, REQ-CUST, REQ-DOC, REQ-LAB  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Events](22_EVENT_ARCHITECTURE.md) · [UI/UX](25_UI_UX_ARCHITECTURE.md) · [Globalization](18_GLOBALIZATION.md)

Domain books may cite `24_SEARCH.md`. **This file is the canonical search architecture.** Search is a **read model**. Pricing, eligibility, Rx rules, and slot locks remain in domain services ([04](04_APPLICATION_ARCHITECTURE.md) client rule 1).

---

## 1. Purpose

Customers search **once** across medicines, products, tests, packages, doctors, and pharmacies ([01](01_PRODUCT_VISION.md) experience thesis). Supply-side apps may use **filtered operational search** (SKU, accession) that is **not** the same index as the public catalog.

This document specifies:

- OpenSearch as the search engine ([04](04_APPLICATION_ARCHITECTURE.md))
- Indexes, analyzers, ranking signals
- Indexing from **domain events** ([22](22_EVENT_ARCHITECTURE.md))
- Privacy: **do not index clinical notes**, report analytes, Rx images, or chat

**ASSUMPTION (A-SRCH-01):** One OpenSearch cluster per environment (later pin per residency). Indexes are **country-aware** (`country_id` on every document). Queries always filter `country_id` + publish state + policy flags.

**OPEN DECISION (OD-SRCH-02):** OpenSearch vs Algolia/Typesense. **Decision in 04: OpenSearch.** Revisit only if ops cost or managed-search SLA forces it. Do not start with a SaaS search that cannot honor residency.

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| Indexes, synonyms, query DSL, typeahead, facets | Offer price source of truth (catalog/pricing) |
| Suggest / did-you-mean | Rx verification, clinical advice |
| Availability **projection** used for ranking | Inventory quantity ledger |
| Ranking boosts from pack | Claiming clinical quality of a doctor |

**Staff queues** (pharmacy Rx desk, lab accession) use PostgreSQL, not OpenSearch, unless volume requires it ([06](06_PHARMACY_PLATFORM.md)).

---

## 3. Indexes (customer / discovery)

Logical index names (implementation may suffix `-{env}` and use aliases).

| Index | Document | Primary journeys |
| --- | --- | --- |
| `medicines_products` | Catalog items that are medicines, OTC, devices, marketplace products | J01, J03, J08 |
| `doctors` | Public doctor profile + next-slot hints | J05 |
| `labs` | Lab org / location public profile | J09 |
| `tests_packages` | Lab tests and packages | J09 |
| `pharmacies` | Owned stores + public vendor storefronts | J01, J03 store discovery |

**ASSUMPTION (A-SRCH-02):** Global typeahead is a **multi-index search** (or a `discovery` alias over these indexes) with a `result_type` discriminator. Ranking across types is pack-configurable (`search.rank.*`).

**OPEN DECISION (OD-SRCH-08):** Single flattened `discovery` index vs five indexes. Recommendation: **five indexes** + msearch; independent mappings and retention.

Do **not** create indexes for: consult notes, lab results, prescription text, tickets, ledger, wallet.

Health record “search” in the customer app is **timeline filter on PostgreSQL** (metadata), not OpenSearch full text of notes ([16](16_HEALTH_RECORD.md)).

---

## 4. Document models (logical fields)

Common on every doc: `id`, `country_id`, `language_fields`, `published`, `updated_at`, `version` (for idempotent index).

### 4.1 `medicines_products`

| Field | Use |
| --- | --- |
| `catalog_item_id`, `item_kind` | `MEDICINE` \| `OTC` \| `DEVICE` \| `OTHER` |
| `name`, `aliases[]`, `generic_name`, `brand` | Text + keyword |
| `form`, `strength`, `pack_size` | Filters / display |
| `category_ids[]`, `atc_or_class?` | Category filter; **do not invent** local controlled-class law — pack codes |
| `rx_required` | Badge; ranking must not hide Rx items if query matches |
| `offers[]` or child docs | `offer_id`, `seller_org_id`, `seller_type`, `location_id`, `price_minor`, `currency`, `availability_status`, `serviceable_geo` |
| `brand_id` | Brand filter |
| `is_own_pharmacy` | Boost (OD-CUS-07 / OD-SRCH-01) |

Do not store: patient reviews that contain health stories if pack forbids; **never** prescription OCR text.

### 4.2 `doctors`

| Field | Use |
| --- | --- |
| `doctor_id`, `display_name` | |
| `specialization_ids[]`, `languages[]` | Filters |
| `fee_range_minor`, `currency` | Filter / sort |
| `next_slot_at`, `consult_types[]` | Availability hint (eventually consistent) |
| `rating_aggregate`, `review_count` | After min-N (08); not a clinical quality claim |
| `geo` / catchment | If in-person later; teleconsult may be country-wide |
| `gender` | **OPEN DECISION (OD-DOC-14)** whether filter exists |

Do not index: license document images, KYC, consult notes, patient lists.

### 4.3 `labs`

| Field | Use |
| --- | --- |
| `lab_org_id`, `location_id` | |
| `name`, `accreditation_badges[]` | Display only after compliance review |
| `geo`, `home_collection`, `center_visit` | Filters |
| `catchment` | Home collection serviceability |

### 4.4 `tests_packages`

| Field | Use |
| --- | --- |
| `catalog_item_id`, `kind` | `TEST` \| `PACKAGE` |
| `name`, `synonyms[]`, `also_known_as[]` | |
| `fasting_required`, `age_min`, `sex_restriction` | Filters / warnings (not medical advice) |
| `included_test_ids[]` | Package |
| `offers[]` | Lab, price, TAT hint, home vs center |
| `prep_instruction_id` | CMS id, not full HTML in index |

Do not index: reference ranges, panic thresholds, patient results.

### 4.5 `pharmacies`

| Field | Use |
| --- | --- |
| `org_id`, `location_id`, `kind` | `OWNED` \| `VENDOR` |
| `name`, `geo`, `hours`, `services[]` | `delivery`, `rx` |
| `rating_aggregate` | If public |

**RISK:** Vendor enumerating other vendors’ internal stock via search APIs. Public index is **published offers only**. Staff APIs are org-scoped ([07](07_VENDOR_PLATFORM.md)).

---

## 5. Query features

### 5.1 Typo tolerance

| Mechanism | Use |
| --- | --- |
| `fuzziness` AUTO on name fields | Short queries: less fuzzy to avoid junk |
| `phrase` + `slop` | Multi-word drug names |
| `search_as_you_type` or edge n-grams | Typeahead |
| `did_you_mean` | Phrase suggester / term suggester on name fields |

**ASSUMPTION (A-SRCH-03):** Minimum query length 2 (pack). Blocklist terms from pack (`search.blocklist_terms`) — e.g. abuse, illegal drug slang — **LEGAL/COMPLIANCE REVIEW REQUIRED** per country.

### 5.2 Synonyms

| Layer | Examples |
| --- | --- |
| Global / country synonym set | Brand ↔ generic (pharmacy-ops maintained), test aliases (“CBC” ↔ “complete blood count”) |
| Per-language analyzers | **OPEN DECISION (OD-SRCH-05)** which languages at first launch |
| Do not | Synonym a symptom to a drug as “treatment” (clinical advice **out of scope**) |

Synonym files are **country pack + CMS**, not hardcoded English-only.

### 5.3 Filters and facets

| Filter | Indexes |
| --- | --- |
| Category | medicines, tests |
| Brand | medicines |
| Rx required | medicines |
| Price range | offers on medicines/tests |
| Availability | `IN_STOCK` / `OUT_OF_STOCK` / `UNKNOWN` — see §7 |
| Location / serviceability | pharmacies, labs, home collection, delivery radius |
| Specialization | doctors |
| Language | doctors |
| Consult type | doctors |
| Home collection | labs / tests |
| Fasting | tests |

Sort: relevance (default), price, distance, next slot, rating (where allowed). **Do not** sort doctors as “best clinician.”

### 5.4 Location

1. Resolve customer `country_id` (mandatory).
2. Serviceability: offer `location_id` ∩ customer address polygon / delivery radius (same engine as checkout).
3. Distance sort uses a **geo point** on store/lab; customer pin precision follows privacy policy ([11](11_LOGISTICS_PLATFORM.md)).
4. Teleconsult doctors: location filter is **license country**, not “nearby” unless in-person is enabled.

**OPEN DECISION (OD-SRCH-03):** Geo precision in the index. Recommendation: store-level geo + catchment polygon id; **do not** index customer addresses.

### 5.5 Availability and price

| Signal | Truth | Search |
| --- | --- | --- |
| Price | Catalog offer | Indexed snapshot; **re-validate at PDP/cart** |
| Availability | Inventory projection | `availability_status`; qty may be **boolean or bucketed** |
| Slot | Care/lab capacity | `next_slot_at` hint; **lock at booking** |

**OPEN DECISION (OD-SRCH-07):** Index sellable quantity vs boolean availability. Recommendation: **boolean + optional `LOW_STOCK` bucket**; do not expose exact qty to customers or competitors.

**OPEN DECISION (OD-SRCH-01):** Own-pharmacy vs vendor boost. Pack `search.rank.own_pharmacy_boost` (OD-CUS-07). Default: modest own-pharmacy boost, never hide cheaper in-stock vendors when marketplace is on.

### 5.6 Ranking (directional)

Signals (weights in pack, not code constants):

- Text relevance (name, brand, generic, synonym)
- In-stock / serviceable
- Own-pharmacy boost (pack)
- Price competitiveness (optional, pack)
- Doctor: next slot, fill-rate — **not** “clinical superiority”
- Lab: TAT hint, home-collection eligibility

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Ranking that constitutes medicine advertising or steering to a pharmacy.

---

## 6. Indexing pipeline (from domain events)

**OPEN DECISION (OD-EVT-07 / OD-SRCH-09):** Events vs CDC. Recommendation: **domain events + fetch-by-id**. The event is an invalidation; the indexer loads the authorized projection from the source module. Avoid putting large catalogs in the event payload.

```
CATALOG_ITEM_PUBLISHED / OFFER_UPDATED / INVENTORY_AVAILABILITY_CHANGED
DOCTOR_ACTIVATED / doctor.profile.published / slot.updated
Lab / test publish events
        │
        ▼
  BullMQ `evt.search` (from outbox)
        │
        ▼
  Indexer: fetch projection → upsert / delete by alias
        │
        ▼
  OpenSearch (version = aggregate version or occurred_at)
```

| Event | Index action |
| --- | --- |
| `CATALOG_ITEM_PUBLISHED` / unpublish | Upsert / delete medicines, tests, products |
| `OFFER_UPDATED` | Nested offer or child doc |
| `INVENTORY_AVAILABILITY_CHANGED` | Patch availability on offer |
| `DOCTOR_ACTIVATED` / suspend | Upsert / delete `doctors` |
| `Appointment` slot changes | Update `next_slot_at` (debounce) |
| `KYC_STATUS_CHANGED` (lab/vendor/doctor inactive) | Unpublish |
| `HEALTH_ARTIFACT_*` | **No clinical index** |

**Idempotency:** OpenSearch `external` version = monotonic aggregate version. Late events ignored.

**Retry:** Default worker policy ([22](22_EVENT_ARCHITECTURE.md)). Search fail = stale results, not wrong money. Alert if lag > pack SLO (p95 query &lt; 300 ms in [04](04_APPLICATION_ARCHITECTURE.md); indexing lag SLO **OPEN DECISION (OD-SRCH-10)**).

**RISK:** Selling expired lots via search. Indexer must use the same FEFO/sellable projection as inventory ([06](06_PHARMACY_PLATFORM.md)). Event `INVENTORY_AVAILABILITY_CHANGED` is mandatory on expiry write-off.

Debounce: slot and GPS-driven signals **must** debounce (e.g. 30–60s) to protect the cluster.

---

## 7. Privacy and compliance

| Rule | |
| --- | --- |
| Do not index clinical notes | Consult notes, chat, pathologist comments, OCR Rx text |
| Do not index results | Analytes, panic **values**, PDF text of reports |
| Health search | Patient timeline = SQL filters on artifact **type/date**, not OpenSearch |
| Support | No search of Rx images |
| Analytics | Query logs: hash user id; strip query strings that look like identifiers (pack) |
| Residency | Cluster pinning when pack requires ([18](18_GLOBALIZATION.md)) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Logging of search queries (may contain condition names). Retention and purpose limitation.

**RISK:** Indexing “customer 360” into OpenSearch for support. Forbidden; CRM is a projection with masked PII ([15](15_CRM_PLATFORM.md)).

---

## 8. APIs (logical)

| API | Who |
| --- | --- |
| `Search.Suggest` | Typeahead; multi-type |
| `Search.Query` | Full query + filters + geo |
| `Search.Click` | Analytics `search.result.clicked` (05) |
| Admin `Search.Synonyms.Upsert` | country_admin / cms |
| `Search.Reindex` | Ops, by index + country |

Clients must not send “search as doctor across all patients.” Doctor access is consent-scoped SQL, not this API ([08](08_DOCTOR_PLATFORM.md)).

p95 target: &lt; 300 ms ([04](04_APPLICATION_ARCHITECTURE.md)).

---

## 9. Country Policy Pack keys (illustrative)

| Key | Purpose |
| --- | --- |
| `search.indexes[]` | Which types are on |
| `search.synonyms` | Resource ids |
| `search.rank.own_pharmacy_boost` | |
| `search.blocklist_terms` | |
| `search.languages[]` | Analyzers |
| `marketplace.enabled` | Vendor offers in medicine index |

---

## 10. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| **OD-SRCH-01** | Own-pharmacy boost | Pack-configurable modest boost |
| **OD-SRCH-02** | Engine | OpenSearch (04); not Algolia unless revisited |
| **OD-SRCH-03** | Geo precision in index | Store/lab points + catchment ids |
| **OD-SRCH-04** | Doctor ranking signals | Next slot + fill-rate; not clinical quality |
| **OD-SRCH-05** | Multi-language analyzers | Pack languages; don’t assume English-only |
| **OD-SRCH-06** | Personalization | v1: none beyond country + serviceability; no diagnosis-based ranking |
| **OD-SRCH-07** | Qty vs boolean availability | Boolean + LOW_STOCK |
| **OD-SRCH-08** | One vs five indexes | Five + msearch |
| **OD-SRCH-09** | Events vs CDC | Events + fetch-by-id |
| **OD-SRCH-10** | Indexing lag SLO | Minutes max for availability; seconds for publish |

---

## 11. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-SRCH-01 | ASSUMPTION | Country_id on every doc; query always filters it |
| A-SRCH-02 | ASSUMPTION | Multi-index typeahead |
| A-SRCH-03 | ASSUMPTION | Min query length 2; blocklist from pack |
| | RISK | Oversell from stale availability |
| | RISK | Vendor enumeration of others’ stock |
| | RISK | Clinical notes in the cluster |
| | RISK | Query logs as health data |
| | LEGAL | Medicine ads, blocklists, query retention, residency |

Query UX (typeahead, Rx badges, empty states): [25](25_UI_UX_ARCHITECTURE.md). Events: [22](22_EVENT_ARCHITECTURE.md).
