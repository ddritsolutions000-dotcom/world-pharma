# 18 — Globalization

**Status:** Blueprint  
**Audience:** Architecture, platform engineering, product, finance, legal/compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Apps](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Admin ERP](17_ADMIN_ERP.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md)

**Requirement IDs:** REQ-I18N, REQ-FX, REQ-CMP, REQ-PAY

---

## 1. Purpose

World Pharma must be **correct in more than one country without a rewrite**. Country is a first-class dimension: language, currency, tax **profile**, payments, catalog rules, professional licensing **placeholders**, logistics, and data residency are **configuration**, not forks.

This document specifies:

- Geo model: Country, Region, City
- Language, currency, timezone
- Tax and payment **routing configuration**
- Service availability
- **Country Policy Pack** architecture (JSON/config schema — conceptual)
- Config-over-code rules
- UTC storage / IANA display
- Multi-currency (points to [12](12_PAYMENT_PLATFORM.md); does not re-invent money)

**Do not hardcode a launch country.** Technical defaults live in an empty “launch country TBD” pack until legal fills rules.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country launch: pharmacy, telemedicine, lab, e-prescription, data protection, e-commerce, payments, advertising. This file does **not** invent statutes.

---

## 2. Principles

| # | Principle |
| --- | --- |
| 1 | **Config over code.** Feature availability, Rx placeholders, KYC field lists, settlement cycles, recording policy live in Policy Packs. |
| 2 | **No invented law.** Pack keys exist; legal values are empty until reviewed. Disabled services stay off. |
| 3 | **One kernel.** Clients do not fork per country. |
| 4 | **UTC in, IANA out.** Persist timestamps in UTC; display in an IANA timezone from pack or user preference. |
| 5 | **Integer money + ISO 4217.** Never float. Original payment currency is never destroyed ([12](12_PAYMENT_PLATFORM.md) §4). |
| 6 | **Residency is a mode, not a rewrite.** Logical `country_id` tenancy now; physical pin/split when legally required. |
| 7 | **Recording default false.** Video recording is never on by default ([08](08_DOCTOR_PLATFORM.md)). |
| 8 | **Wallet and WhatsApp are not global defaults.** Country-gated. |

---

## 3. Geo model

### 3.1 Country

| Field (logical) | Meaning |
| --- | --- |
| `country_id` | UUID v7 PK |
| `iso3166_alpha2` | ISO 3166-1 alpha-2 (technical), not a product brand |
| `iso3166_alpha3` | Optional |
| `name_i18n` | Display names by locale |
| `status` | `DRAFT` / `ACTIVE` / `SUSPENDED` / `RETIRED` |
| `policy_pack_id` | Current published pack |
| `default_locale` | BCP-47 |
| `default_currency` | ISO 4217 |
| `default_timezone` | IANA (e.g. display default; users may override) |
| `phone_prefix` | E.164 country code **for formatting**, not a hard-coded OTP vendor |
| `legal_entity_id` | Books owner for this country ([13](13_LEDGER_SETTLEMENT.md)) |

A session always has a selected `country_id`. Catalog, tax, payments, Rx, telemedicine, and wallet **filter** by that country.

**ASSUMPTION (A-I18N-01):** A Person may have customer memberships in multiple countries. Wallets, carts, and stored-value **do not merge** across countries (A-BIZ-03).

**OPEN DECISION (OD-I18N-01):** Whether a user may hold **simultaneous** active customer sessions in two countries (two wallets). Recommendation: **allowed**, with explicit country switcher and no silent catalog swap on GPS ([05](05_CUSTOMER_PLATFORM.md) §6.8).

### 3.2 Region

| Field | Meaning |
| --- | --- |
| `region_id` | UUID v7 |
| `country_id` | Parent |
| `code` | Pack-defined (state/province/governorate — **schema from pack**, not a global political model) |
| `name_i18n` | |
| `timezone_override` | Optional IANA if the country spans zones |

**OPEN DECISION (OD-I18N-02):** Region as first-class logistics catchment vs polygons-only. Recommendation: **both** — Region for tax/address forms; **polygons** for serviceability.

### 3.3 City

| Field | Meaning |
| --- | --- |
| `city_id` | UUID v7 |
| `region_id` / `country_id` | |
| `name_i18n` | |
| `geo` | Centroid; service polygons live on Location/coverage tables |

Address format (`address.format`, `address.required_fields[]`, `address.postal_required`) is pack-defined. **Do not** assume postal codes exist worldwide.

Maps provider is per-country adapter (**OD-CUS-06**).

---

## 4. Language

| Concept | Rule |
| --- | --- |
| UI locale | From pack `i18n.locales[]` + user preference |
| Default locale | `i18n.default_locale` |
| Clinical content language | May differ from UI language (report PDF language vs app chrome) |
| Catalog copy | Per country + locale; fallback chain: user → country default → `en` technical fallback **OPEN DECISION (OD-I18N-03)** whether English is a global fallback or packs must be complete |
| BCP-47 | Store `ar`, `en-GB`, `sw` — not homemade codes |
| RTL | UI kit must support RTL when locale requires it |

**ASSUMPTION (A-I18N-02):** Translation of UI strings is a CMS/i18n pipeline, not hardcoded in Nest modules.

Doctor consult languages: BCP-47 on `DoctorProfile` ([08](08_DOCTOR_PLATFORM.md)).

---

## 5. Currency and money (pointer to 12)

Globalization **does not** own FX math. It owns **which currencies are allowed** and which is the country default.

| Role | Owner |
| --- | --- |
| Money object, FxSnapshot, five currency roles | [12](12_PAYMENT_PLATFORM.md) §4 |
| Accounting currency | Legal entity / pack `ledger.accounting_currency` — **OD-FX-04** |
| Wallet currency | One per customer × country (**OD-FX-06**) |
| Catalog/offer prices | Country default currency; integer minor units |
| Display formatting | Pack: `money.grouping`, `money.symbol_position`, exponent from currency table |

**Forbidden:** Float prices; converting historical rows with a new rate; assuming a worldwide “home” currency.

**OPEN DECISION (OD-I18N-04):** Whether a country pack may allow **multiple catalog currencies**. Recommendation: **v1 one catalog currency per country**; display conversion is optional and never the charged amount unless PSP supports it (A-PAY-02).

---

## 6. Timezone

| Rule | Detail |
| --- | --- |
| Storage | All `timestamptz` / UTC instants |
| Slot generation | Doctor/lab local IANA on AvailabilityRule; persist slot start/end as UTC |
| Display | Convert with IANA from: (1) user preference, else (2) pack default, else (3) device TZ **if** pack `timezone.allow_device` |
| Duration | Store seconds/minutes integers, not TZ-dependent calendar days for SLA |
| “Today” for FEFO | Date in the **fulfilling Location’s** IANA timezone, not the API server’s |

**RISK:** Expiry at “end of day” computed in UTC vs store local. Mitigation: pack `inventory.expiry_timezone = location`.

---

## 7. Tax

The platform stores **tax profile ids** and computed **tax line snapshots** on checkout. It does **not** invent VAT/GST/sales-tax law.

| Config | Meaning |
| --- | --- |
| `tax.profile_id` | Identifier of a tax engine configuration for this country |
| `tax.engine` | `internal_tables` / `adapter` — **OD-LED-02** |
| `tax.classes[]` | Catalog tax class codes (opaque to product; mapped in engine) |
| `tax.display` | Inclusive vs exclusive **display** — legal review |
| Invoice fields | `invoice.fields[]` from pack — [06](06_PHARMACY_PLATFORM.md) |

Checkout clients **must not** recompute tax. Quote API returns integer minor units.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Tax registration, e-invoicing, marketplace facilitator vs seller of record (**OD-PAY-01**).

---

## 8. Payments and gateways

Pack lists **enabled method families** and **gateway ids**. No global default of a single domestic scheme ([12](12_PAYMENT_PLATFORM.md) §8).

| Key | Meaning |
| --- | --- |
| `payments.methods[]` | `CARD`, `BANK`, `WALLET_PLATFORM`, `WALLET_THIRD_PARTY`, `COD`, `LOCAL_METHOD`, optional local real-time family **only if pack enables** |
| `payments.gateways[]` | Ordered routing candidates |
| `payments.cod` | Goods COD; labs default **off** (OD-LAB-16) |
| `payments.3ds` / `sca_policy` | Follow PSP + pack; do not skip in software |
| `wallet.enabled` | Default **false** |

**LEGAL/COMPLIANCE REVIEW REQUIRED** per acquiring country. Never send PAN through World Pharma servers if hosted fields are used.

---

## 9. Service availability

Home tiles, search indexes, and APIs **must** hide disabled services. A 404/feature-disabled reason code is preferable to a half-working checkout.

| Service key (illustrative) | Meaning |
| --- | --- |
| `services.pharmacy` | First-party pharmacy |
| `services.marketplace` | Third-party vendors |
| `services.teleconsult` | Doctor video/audio/chat |
| `services.lab_home` | Home collection |
| `services.lab_center` | Center visit (OD-LAB-01 / OD-CUS-09) |
| `services.whatsapp` | WhatsApp OTP/notifications/CRM |
| `services.wallet` | Stored value |
| `services.affiliate_clinical` | Affiliate earn on clinical categories — **default false** |
| `services.affiliate_commerce` | Affiliate on eligible commerce |
| `ads.allowed` | Marketing of medicines — legal |

Adding a country = **data + pack**, not a new deployable (except residency split).

---

## 10. Country Policy Pack architecture

### 10.1 What a pack is

A **Country Policy Pack** is a versioned, country-scoped JSON document (plus optional binary assets: legal PDFs) that the kernel evaluates at runtime.

```
Country ──1──* PolicyPackVersion (immutable once published)
                └── json_document
                └── published_by, published_at
                └── legal_signoff_id?   (required for “regulated keys”)
```

Runtime reads the **published** version. Drafts are editable in Admin Configuration ([17](17_ADMIN_ERP.md) §6.32).

**ASSUMPTION (A-I18N-03):** Evaluation is in-process in the modular monolith (cached); not a remote “rules microservice” in Phase 0.

### 10.2 Sensitivity classes

| Class | Who may publish | Examples |
| --- | --- | --- |
| `TECHNICAL` | `global_admin` / `country_admin` (limited) | locales, timezone, session TTL, slot hold seconds |
| `COMMERCIAL` | country_admin + finance as needed | commission bps, delivery fee, settlement cadence |
| `REGULATED` | `super_admin` + **legal sign-off record** | `rx.*`, `telemedicine.enabled`, `video.recording.allowed`, `affiliate.eligible_services` clinical, `wallet.enabled`, `data_residency_mode` |

Empty regulated keys evaluate as **safe default** (service off / recording false / wallet off).

### 10.3 Conceptual JSON schema

Not production JSON Schema code. Logical shape:

```json
{
  "pack_id": "uuid-v7",
  "country_id": "uuid-v7",
  "version": 12,
  "status": "PUBLISHED",
  "i18n": {
    "default_locale": "string-bcp47",
    "locales": ["bcp47"]
  },
  "currency": {
    "default": "ISO4217",
    "allowed": ["ISO4217"]
  },
  "timezone": {
    "default": "IANA",
    "allow_device": true
  },
  "enabled_services": {
    "pharmacy": false,
    "marketplace": false,
    "teleconsult": false,
    "lab_home": false,
    "lab_center": false,
    "whatsapp": false,
    "wallet": false,
    "affiliate_clinical": false,
    "affiliate_commerce": false
  },
  "payment_methods": [],
  "gateways": [],
  "tax_profile_id": "uuid-or-code",
  "data_residency_mode": "shared | pinned_region | dedicated_db",
  "recording_allowed": false,
  "rx_rules": {
    "upload_enabled": false,
    "digital_enabled": false,
    "validity_days": null,
    "reuse_allowed": null,
    "controlled_visible": false,
    "skip_review_if_platform_signed": false,
    "notes": "LEGAL placeholders — do not fill with invented statutes"
  },
  "kyc": {
    "vendor_documents": [],
    "doctor_documents": [],
    "doctor_dual_control": true
  },
  "partner_types": {
    "DOCTOR": { "join_public": false, "required_fields": [], "required_documents": [], "approval_workflow": "dual", "allowed_services": [], "auto_approve_after_verify": false },
    "VENDOR": { "join_public": false, "required_fields": [], "required_documents": [] },
    "PHARMACY": { "join_public": false },
    "LAB": { "join_public": false },
    "DELIVERY_PARTNER": { "join_public": false },
    "PHLEBOTOMIST": { "join_public": false },
    "PATHOLOGIST": { "join_public": false },
    "CLINIC": { "join_public": false },
    "HOSPITAL": { "join_public": false },
    "AFFILIATE": { "join_public": false, "clinical_categories": false },
    "HEALTHCARE_BUSINESS": { "join_public": false }
  },
  "ledger": {
    "legal_entity_id": "uuid",
    "accounting_currency": "ISO4217"
  }
}
```

`data_residency_mode`:

| Mode | Meaning |
| --- | --- |
| `shared` | Shared Postgres; `country_id` + RLS |
| `pinned_region` | Same logical DB product; cluster/region pin for that country’s data |
| `dedicated_db` | Separate database (later); **same schema and APIs** |

See [20](20_DATABASE_ARCHITECTURE.md) tenancy.

`recording_allowed` default **false**. Feature flags cannot override pack false ([08](08_DOCTOR_PLATFORM.md) §11.6).

`rx_rules` are **placeholders**. `validity_days: null` means “do not auto-expire using invented law; expire only when legal fills the pack or pharmacist rejects.”

### 10.4 Key catalog (index)

Keys are grouped; new features add keys, they do not hardcode countries.

**Identity / auth**

| Key | Default technical |
| --- | --- |
| `auth.session_ttl` | config |
| `auth.mfa_step_up_actions[]` | wallet, refund |
| `auth.max_devices` | config |
| `auth.password_enabled` | customer default **false** |
| `auth.social.enabled` | false |
| `auth.social.providers[]` | empty |
| `otp.channels[]` | pack |
| `otp.whatsapp_enabled` | false unless `services.whatsapp` |
| `registration.identifier` | `phone` \| `email` \| `either` |
| `registration.min_age` | **LEGAL** — empty until filled |
| `registration.kyc_at_signup` | false |

**Profile / address**

| Key | Notes |
| --- | --- |
| `profile.fields[]` | |
| `profile.gender_model` | pack enum |
| `profile.national_id_required` | default false; **LEGAL** |
| `address.format` | |
| `address.required_fields[]` | |
| `address.postal_required` | false unless pack |

**Services / home / search**

| Key | Notes |
| --- | --- |
| `home.modules[]` | CMS rails |
| `search.indexes[]` | |
| `search.own_pharmacy_boost` | OD-CUS-07 |

**Catalog / Rx**

| Key | Notes |
| --- | --- |
| `catalog.rx_required_rules` | placeholder |
| `catalog.controlled_substance_visible` | false until legal |
| `catalog.substitute_customer_visible` | |
| `rx.upload.enabled` | |
| `rx.digital.enabled` | false |
| `rx.ocr.enabled` | assist only |
| `rx.verify.role` | pharmacist |
| `rx.central_desk` | OD-PHARM-05 |

**Care / video**

| Key | Default |
| --- | --- |
| `telemedicine.enabled` | false |
| `consult.modes[]` | empty until enabled |
| `video.enabled` | false |
| `video.recording.allowed` | **false** |
| `video.identity_check` | pack |
| `video.data_residency` | follow country mode |
| `appointment.cancel_hours` | commercial + **LEGAL** |
| `appointment.no_show_fee` | **LEGAL**; default no auto penalty (OD-DOC-02) |

**Labs**

| Key | Default |
| --- | --- |
| `labs.enabled` | false |
| `lab.home_collection.enabled` | false |
| `lab.center_visit.enabled` | OD-LAB-01 |
| `lab.packages.enabled` | |
| `lab.bill_on` | booking / accession / report — OD-LED-01 |

**Commerce / wallet / affiliate**

| Key | Default |
| --- | --- |
| `checkout.cod_enabled` | pack |
| `wallet.enabled` | false |
| `wallet.topup.enabled` | false |
| `wallet.max_balance_minor` | **LEGAL** |
| `marketplace.enabled` | false |
| `marketplace.rx_fulfillment` | owned pharmacy only until legal (OD-VEND-01) |
| `marketplace.commission.default_bps` | integer bps |
| `affiliate.customer_referral.enabled` | |
| `affiliate.eligible_services[]` | clinical default **empty/off** |
| `membership.enabled` | OD-CUS-12 |
| `loyalty.enabled` | |
| `coupons.clinical_services_allowed` | **LEGAL** |

**Logistics**

| Key | Notes |
| --- | --- |
| `tracking.map_enabled` | |
| `pod.otp_required` | |
| `logistics.medicine_job_type` | `MEDICINE_DELIVERY` |
| `vendor.self_logistics` | v1 false (OD-VEND-07) |

**Data / privacy**

| Key | Notes |
| --- | --- |
| `data_residency_mode` | shared \| pinned_region \| dedicated_db |
| `privacy.deletion_process` | **LEGAL** |
| `health.export.enabled` | |
| `health.retention_class_map` | filled after [19](19_COMPLIANCE_FRAMEWORK.md) legal |

**CMS / CRM / ads**

| Key | Notes |
| --- | --- |
| `ads.allowed` | **LEGAL** |
| `notify.channels[]` | |
| `notify.whatsapp` | gated |
| `notify.promo.opt_in_default` | **LEGAL**; engineering default no promo without allow |
| `crm.quiet_hours` | |

### 10.5 Resolution order

1. Published pack for `country_id`
2. Organization overlay (optional later — **OD-I18N-05**, default none in v1)
3. Runtime flag (kill switch) **cannot enable** a pack-false regulated service
4. Request-time: user’s selected country, not IP-derived silent switch

### 10.6 Adding a country (engineering)

1. Insert `Country` + `DRAFT` pack with technical defaults (currency, TZ, locale).
2. Leave regulated keys empty/false.
3. Legal fills `REGULATED` keys → dual control publish.
4. Enable `Country.status = ACTIVE`.
5. If `dedicated_db` / `pinned_region`, infra work **before** `ACTIVE` ([29] when present).

**OPEN DECISION (OD-I18N-06):** Who is merchant of record per country — drives tax, invoices, PSP merchant accounts. Not a code fork; a pack + legal entity mapping.

---

## 11. Data residency

| Mode | OLTP | Objects (Rx, reports) | Video media | Search |
| --- | --- | --- | --- | --- |
| `shared` | Shared PG + `country_id` RLS | Same object store, prefix/key policy | LiveKit region per pack | Shared index with country filter |
| `pinned_region` | PG in required region | Bucket in region | SFU in region | Index in region |
| `dedicated_db` | Separate PG instance, **same migrations** | Separate bucket | Isolated | Isolated |

**ASSUMPTION (A-I18N-04):** Phase 0 is `shared`. APIs and schema stay identical when splitting.

**OPEN DECISION (OD-I18N-07):** Replication of **metadata** (not payloads) to a global ops plane for `super_admin`. Recommendation: **aggregates only**; no cross-border clinical payload (OD-EHR-08).

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Cross-border transfer, processor/controller role (OD-EHR-01).

---

## 12. Client and API behavior

| Surface | Rule |
| --- | --- |
| JWT | Contains selected `country_id` |
| Catalog | Filter Offers by country |
| Cart | One cart per customer per country (A-CUS-05) |
| Checkout | Children must share country and currency |
| Errors | `SERVICE_DISABLED`, `COUNTRY_MISMATCH`, `CURRENCY_MISMATCH` |
| Admin | Working country switcher for platform roles ([17](17_ADMIN_ERP.md)) |

APIs: [21](21_API_ARCHITECTURE.md). Packs are readable by clients as a **safe subset** (no secrets, no unreleased legal drafts).

---

## 13. Events

| Event | When |
| --- | --- |
| `country.activated` | Country ACTIVE |
| `policy_pack.published` | New version live; cache bust |
| `country.switched` | User changed session country (analytics) |

---

## 14. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-I18N-01 | Hardcoded country in code | Lint + review; pack required in CI fixtures |
| R-I18N-02 | Invented Rx/tax/KYC documents | Empty regulated keys; legal checklist |
| R-I18N-03 | Silent GPS country switch | Force confirm |
| R-I18N-04 | Recording enabled by flag vs pack | Pack is source of truth |
| R-I18N-05 | Wallet on without license | Default off |
| R-I18N-06 | Affiliate clinical earn on | Default off; regulated class |
| R-I18N-07 | FEFO “today” in wrong TZ | Location TZ |
| R-I18N-08 | Split DB with divergent schema | Same migrations; extract later |

---

## 15. Assumptions

| ID | Statement |
| --- | --- |
| A-I18N-01 | Multi-country persons; no wallet merge |
| A-I18N-02 | UI strings via i18n pipeline |
| A-I18N-03 | Pack evaluation in-process Phase 0 |
| A-I18N-04 | Shared PG first |

---

## 16. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-I18N-01 | Simultaneous multi-country customer sessions | Yes, explicit switcher |
| OD-I18N-02 | Region vs polygon catchment | Both |
| OD-I18N-03 | English technical fallback | Technical `en` for missing UI keys; catalog must not show another country’s medicines |
| OD-I18N-04 | Multi-currency catalog in one country | No in v1 |
| OD-I18N-05 | Org-level pack overlay | Not v1 |
| OD-I18N-06 | Merchant of record per country | Legal; pack maps `legal_entity_id` |
| OD-I18N-07 | Global ops metadata plane | Aggregates only |
| OD-I18N-08 | Address autocomplete provider | Per-country maps adapter |
| OD-I18N-09 | Locale for clinical PDFs vs UI | Independent; pack `report.locales[]` |
| OD-I18N-10 | Phone OTP sender ID / DLT-style registration | Pack + SMS adapter; do not assume one regulator |
