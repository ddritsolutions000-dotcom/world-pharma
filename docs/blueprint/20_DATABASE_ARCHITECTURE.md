# 20 — Database Architecture

**Status:** Blueprint (implementation contract)  
**Audience:** Backend engineering, DBA, security, finance, compliance  
**Related:** [Apps](04_APPLICATION_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · Domain books [05](05_CUSTOMER_PLATFORM.md)–[16](16_HEALTH_RECORD.md) · [Admin](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [API](21_API_ARCHITECTURE.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Payment](12_PAYMENT_PLATFORM.md)

**Requirement IDs:** REQ-DAT, REQ-SEC, REQ-LED, REQ-EHR, REQ-I18N, REQ-CMP

---

## 1. Purpose

This document is the **conceptual OLTP data model** for the NestJS modular monolith. It is the contract for migrations: entity purpose, PK, fields, relationships, constraints, audit, soft delete, tenant/country scope.

It is **not** SQL DDL, Prisma schema, or production code.

**Stack (locked for Phase 0):** PostgreSQL 16, UUID v7 primary keys, integer minor-unit money, `country_id` tenancy, **Row Level Security (RLS)**. Physical split (`pinned_region` / `dedicated_db`) later without changing the logical model ([18](18_GLOBALIZATION.md)).

---

## 2. Design principles

| # | Rule |
| --- | --- |
| 1 | UUID v7 PKs for all new OLTP rows (`id`). |
| 2 | Money: `amount_minor BIGINT` + `currency CHAR(3)` ISO 4217. **Never** `NUMERIC`/`float` for money. |
| 3 | Timestamps: `timestamptz` UTC. Display TZ is application/pack. |
| 4 | Tenant: `country_id` on every country-scoped table. |
| 5 | RLS enabled; session `app.country_id`, `app.user_id`, `app.membership_id`. |
| 6 | Modules do not `JOIN` across another module’s tables from random services — use published IDs + events. Read models may project. |
| 7 | **Journal never deleted.** No `deleted_at` on ledger tables. |
| 8 | Health artifacts: `retention_status`; clinical payload not in commerce tables. |
| 9 | Soft delete (`deleted_at`) only on mutable masters (address, cart line, listing, membership). |
| 10 | Idempotency keys unique per actor+route (or global for money POSTs). |
| 11 | Immutable snapshots on paid documents (price, tax, commission, pack version). |
| 12 | No hardcoded country, tax, or Rx statute in CHECKs. CHECKs are technical (status enum, amount ≥ 0). |

---

## 3. Column conventions

Every table unless noted:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID v7 PK | |
| `country_id` | UUID FK → `countries` | Omit only on true platform tables (see §5) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Omit on immutable (journal, audit, sample events, webhooks) |
| `created_by` | UUID nullable | Person or system |
| `version` | INT | Optimistic lock on contended rows (Slot, StockLot, PaymentIntent) |
| `deleted_at` | timestamptz | Only if soft-deletable |
| `legal_hold_id` | UUID nullable | If hold-applicable |

**Audit (mutation):** application writes `audit_logs` via outbox; not a trigger-only strategy (triggers optional later).

**Enums:** Postgres enums **or** `TEXT` + CHECK. **OPEN DECISION (OD-DB-01):** PG ENUM vs TEXT. Recommendation: **TEXT + CHECK** for country-pack-extensible statuses; frozen machines (journal) may use ENUM.

---

## 4. Multi-tenant strategy

### 4.1 Phase 0 — shared Postgres

```
One cluster / one primary database
  └── schemas or table-prefix by module (logical)
  └── EVERY tenant table: country_id
  └── RLS: USING (country_id = current_setting('app.country_id')::uuid)
  └── Platform roles: SET app.country_id per request OR app.is_platform = true
      (OD-ADM-07: platform bypass is explicit and audited — never DISABLE RLS)
```

**ASSUMPTION (A-DB-01):** One database, one logical ledger, `legal_entity_id` + `country_id` on journal lines ([13](13_LEDGER_SETTLEMENT.md) OD-LED-04).

### 4.2 Later physical split

| Mode | Implementation |
| --- | --- |
| `shared` | Above |
| `pinned_region` | Same schema; country rows (and object bucket) in a regional cluster; routing in gateway |
| `dedicated_db` | Separate PG; **identical migrations**; connection resolver by `country_id` |

Application services always query **as if** `country_id` is required. No `WHERE` omitted “because we’re in that DB.”

### 4.3 What is not a tenant

| Table class | `country_id`? |
| --- | --- |
| `countries`, `policy_packs`, `currencies`, `fx_rates` (pair is global, *used* per country) | Country table no; packs yes; fx_rates global with `as_of` |
| `roles`, `permissions` (system catalog) | No |
| `persons`, `accounts` | Person is global; **memberships and profiles** are country-scoped |
| `audit_logs` | Yes (plus platform-wide for pack publish) |

**OPEN DECISION (OD-DB-02):** Person uniqueness of phone/email **global vs per country**. Recommendation: **global Account identifier uniqueness**; customer **profile** and wallet per country. Login resolves person then requires country selection.

---

## 5. Entity catalog

Legend: **SD** = soft delete · **IMM** = no update/delete · **TEN** = country scoped · **AUD** = row-level sensitive (extra audit on read/write).

---

### 5.1 Person / User

| | |
| --- | --- |
| **Purpose** | Human identity kernel. One person, many memberships. |
| **PK** | `id` UUID v7 |
| **Table** | `persons` |
| **TEN** | No (global). Access via memberships. |
| **SD** | No. Use account status + deletion request. |
| **AUD** | PII |

**Fields:** `id`, `status` (`ACTIVE`/`DISABLED`/`PENDING_DELETION`), `preferred_locale`, `primary_country_id` (nullable hint), `created_at`, `updated_at`.

Display name, DOB, sex/gender live on **CustomerProfile** / professional profiles (pack fields), not necessarily on Person.

**Relationships:** 1:1 `Account`; 1:N `Membership`; 0:1 `CustomerProfile` per country; 0:1 professional profiles.

**Constraints:** None on phone here — identifiers on Account.

---

### 5.2 Account

| | |
| --- | --- |
| **Purpose** | Login credentials, MFA, lockout. |
| **PK** | `id`; unique `person_id` |
| **TEN** | No |
| **SD** | No |

**Fields:** `person_id`, `status` (`ACTIVE`/`LOCKED`/`DISABLED`), `password_hash` (nullable; customers may be passwordless), `mfa_required`, `mfa_secret_ref` (KMS), `failed_login_count`, `locked_until`, `last_login_at`.

**Identifiers table** `account_identifiers`: `account_id`, `type` (`PHONE`/`EMAIL`), `value_normalized`, `verified_at`, unique(`type`,`value_normalized`).

**Relationships:** N `Session`, `Device`, `OtpChallenge` (short-lived).

**Constraints:** At least one identifier to complete registration.

---

### 5.3 Membership

| | |
| --- | --- |
| **Purpose** | Role binding at a scope. |
| **PK** | `id` |
| **TEN** | `country_id` nullable for `platform` scope |
| **SD** | Yes (`deleted_at`) — revoke |

**Fields:** `person_id`, `role_id`, `scope` (`platform`/`country`/`organization`/`location`/`self`), `country_id`, `organization_id`, `location_id`, `status` (`ACTIVE`/`SUSPENDED`), `starts_at`, `ends_at`.

**Constraints:** CHECK scope vs FKs (location scope requires `location_id`); unique active (`person_id`,`role_id`,`organization_id`,`location_id`,`country_id`) **OD-DB-03** exact unique key.

JWT carries `membership_id`; server reloads.

---

### 5.4 Role

| | |
| --- | --- |
| **Purpose** | System role catalog. |
| **PK** | `id`; unique `code` (`super_admin`, `customer`, …) |
| **TEN** | No |
| **SD** | No (deactivate) |

**Fields:** `code`, `name`, `is_system` (true for Phase 0), `parent_role_id` nullable (custom subset later).

Custom roles cannot exceed parent ([03](03_USER_ROLES_AND_PERMISSIONS.md) §9).

---

### 5.5 Permission

| | |
| --- | --- |
| **Purpose** | `resource:action` catalog. |
| **PK** | `id`; unique `code` |
| **TEN** | No |

**Join:** `role_permissions` (`role_id`, `permission_id`).

---

### 5.6 Country

| | |
| --- | --- |
| **Purpose** | First-class geography + pack pointer. |
| **PK** | `id` |
| **TEN** | N/A (is the tenant) |
| **SD** | No |

**Fields:** `iso3166_a2` unique, `iso3166_a3`, `name_i18n` JSONB, `status`, `default_locale`, `default_currency`, `default_timezone` IANA, `phone_prefix`, `legal_entity_id`, `published_policy_pack_id`, `data_residency_mode`.

**Relationships:** N `Region`, N `PolicyPack` versions.

---

### 5.7 PolicyPack

| | |
| --- | --- |
| **Purpose** | Versioned Country Policy Pack JSON ([18](18_GLOBALIZATION.md)). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No. New version. |
| **IMM** | Published rows immutable |

**Fields:** `country_id`, `version` INT, `status` (`DRAFT`/`PUBLISHED`/`SUPERSEDED`), `document` JSONB, `sensitivity_checksum`, `legal_signoff_id`, `published_at`, `published_by`.

**Constraints:** unique (`country_id`,`version`); at most one `PUBLISHED` per country.

---

### 5.8 Organization

| | |
| --- | --- |
| **Purpose** | Legal/operational org. |
| **PK** | `id` |
| **TEN** | `country_id` (primary operating country) |
| **SD** | `deleted_at` for drafts only; operating orgs `status=CLOSED` |

**Fields:** `type` (`PLATFORM`/`PHARMACY_OWNED`/`VENDOR`/`CLINIC`/`HOSPITAL`/`LAB`/`LOGISTICS_FLEET`/`AFFILIATE_ORG`/`HEALTHCARE_BUSINESS`), `legal_name`, `display_name`, `status` (vendor/lab/doctor-org machines — store **party status** + type-specific tables), `kyc_case_id`, `payout_profile_id`, pack-defined `license_fields` JSONB.

**Relationships:** N `Location`, N `Membership`, 0:1 type-specific profile.

**Constraints:** Marketplace listing requires `type=VENDOR` and KYC `APPROVED`.

---

### 5.8b Partner onboarding entities

Canonical definitions: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). **Do not** add a second user table.

| Entity | Purpose | PK / TEN / SD | Key fields / relationships |
| --- | --- | --- | --- |
| **PartnerType** | Catalog of types | `code` unique; not country-tenant | `code`, `subject_kind` (`PERSON`/`ORGANIZATION`), `is_extensible` |
| **Partner** | Supply-side participation | UUID; `country_id` | `person_id`, `partner_type_code`, `organization_id` nullable, `status` (mirrors current application), unique active (`person_id`,`partner_type_code`,`country_id`) **OD-PTR-02** |
| **PartnerApplication** | Onboarding case + state machine | UUID; `country_id`; no hard delete | `partner_id`, `state`, `source` (`PUBLIC`/`INVITE`/`INTERNAL`), `assigned_reviewer_id`, `pack_version` |
| **PartnerStatusHistory** | Immutable transitions | UUID; `country_id`; IMM | `application_id`, `from_state`, `to_state`, `actor_id`, `reason_code` |
| **PartnerDocument** | Pack-typed files | UUID; `country_id`; versioned | `document_type_code`, `issuing_country_id`, `expires_on`, `verification_status`, `object_id`, `version`, `reviewer_id`, `kyc_case_id` |
| **PartnerInvitation** | Invite tokens | UUID; `country_id` | `token_hash`, `organization_id`, `partner_type_code`, `intended_role_id`, `source`, `expires_at` |
| **PartnerRiskFlag** | Fraud/ops flags | UUID; `country_id` | `partner_id`, `code`, `severity`, `open` |

`KycCase.subject` may point at `PartnerApplication`. Type-specific profiles (`DoctorProfile`, vendor store, …) remain; they are **not** login identities.

---

### 5.9 Location

| | |
| --- | --- |
| **Purpose** | Store, warehouse, lab site, clinic, vendor ship-from. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | Yes |

**Fields:** `organization_id`, `kind` (`STORE`/`WAREHOUSE`/`LAB`/`CLINIC`/`HOSPITAL`/`VENDOR_WAREHOUSE`/`COLLECTION_POINT`), `name`, `hours` JSONB, `timezone` IANA, `service_polygon` GEOGRAPHY, `address_id`, `is_fulfillment_enabled`, `license_fields` JSONB, `capabilities[]`.

**Constraints:** Cross-country stock transfer forbidden (app + CHECK `country_id` match on transfer lines).

---

### 5.10 Address

| | |
| --- | --- |
| **Purpose** | Postal/geo address snapshot-capable. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | Yes (customer saved addresses) |

**Fields:** `owner_type` (`PERSON`/`ORGANIZATION`/`LOCATION`), `owner_id`, `label`, `lines` JSONB (pack format), `postal_code`, `region_id`, `city_id`, `geo` POINT, `instructions`, `is_default`.

**Jobs/orders** copy a **snapshot JSON** so later edits do not mutate in-flight logistics ([11](11_LOGISTICS_PLATFORM.md)).

---

### 5.11 CustomerProfile

| | |
| --- | --- |
| **Purpose** | Commerce/care demographics for the person **in a country**. |
| **PK** | `id`; unique (`person_id`,`country_id`) |
| **TEN** | `country_id` |
| **SD** | No (account deletion request) |
| **AUD** | PII |

**Fields:** `person_id`, `display_name`, `dob`, `sex_gender` (pack), `locale`, `emergency_contact` JSONB, `marketing_opt_in`, `lifecycle_stage`.

**Not** professional profile. Caregiver dual identity **not v1**.

---

### 5.12 CatalogItem

| | |
| --- | --- |
| **Purpose** | Country-published master: medicine, OTC, device, lab test, package, consult product. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | Archive `status=RETIRED` |

**Fields:** `kind` (`MEDICINE`/`PRODUCT`/`LAB_TEST`/`LAB_PACKAGE`/`CONSULT`), `name_i18n`, `slug`, `rx_required` bool, `controlled_visibility` bool, `tax_class_id`, `attributes` JSONB (form, strength **as data**), `status` (`DRAFT`/`PUBLISHED`/`RETIRED`), `substitutes` via join table.

**LabTest** / **LabPackage** are **kinds** (or 1:1 extension tables) — see §5.29–5.30.

**Constraints:** Vendor-proposed items stay `DRAFT` until country publish.

---

### 5.13 Offer

| | |
| --- | --- |
| **Purpose** | Sellable: item + seller org + serving location + country + price + tax + availability flags. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | `RETIRED` |

**Fields:** `catalog_item_id`, `seller_org_id`, `location_id` nullable (org-wide), `currency`, `unit_amount_minor`, `tax_class_id`, `status` (`DRAFT`/`PUBLISHED`/`RETIRED`), `valid_from`/`valid_to`, `home_collection_eligible` (lab).

**Constraints:** `currency` = country catalog currency (v1). Unique published offer per (item, seller, location) **OD-DB-04**.

Checkout snapshots offer fields; later price changes do not mutate PAID sessions.

---

### 5.14 InventoryLot

| | |
| --- | --- |
| **Purpose** | Physical lot/batch at a Location. FEFO. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No. Reverse via movement. |
| **AUD** | Recall |

**Fields:** `catalog_item_id`, `location_id`, `lot_number`, `expiry_date` DATE, `qty_on_hand`, `qty_held`, `qty_quarantine`, `recalled_at`, `supplier_id` nullable, `grn_id`.

**Related:** `stock_movements` IMM (`RECEIPT`/`TRANSFER_OUT`/`TRANSFER_IN`/`ALLOCATE`/`PICK`/`RELEASE`/`WRITE_OFF`/`RETURN`). Qty columns are **projections** of movements **OD-DB-05** (recommend: movements source of truth + cached qty).

**Constraints:** `qty_* >= 0` if pack `inventory.negative_forbidden`; cannot allocate recalled/expired (app).

**Indexes:** (`location_id`,`catalog_item_id`,`expiry_date`).

---

### 5.15 Cart

| | |
| --- | --- |
| **Purpose** | Goods intent only (v1). Not lab/doctor lines. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | Lines `deleted_at`; cart may be abandoned |

**Fields:** `customer_person_id`, `seller_org_id` (v1 single seller), `status` (`ACTIVE`/`CHECKED_OUT`/`ABANDONED`), `currency`.

**Lines:** `cart_lines`: `offer_id`, `qty`, `prescription_id` nullable, `amount_snapshot` optional.

**Constraints:** unique active cart per (`customer_person_id`,`country_id`) (A-CUS-05). Seller conflict → `CART_SELLER_CONFLICT`.

---

### 5.16 CheckoutSession

| | |
| --- | --- |
| **Purpose** | Payment envelope over child Order and/or Booking(s). |
| **PK** | `id` |
| **TEN** | `country_id` immutable after leave DRAFT |
| **SD** | No |

**Fields:** `customer_person_id`, `currency`, `amount_minor`, `status` (`DRAFT`/`PENDING_PAYMENT`/`PAID`/`FAILED`/`EXPIRED`/`CANCELLED`/`PARTIALLY_FAILED`), `payment_intent_id`, `idempotency_key` unique, `expires_at`, `quote_expires_at`, `fraud_review_id`, `quote_snapshot` JSONB (immutable after pay start).

**Children:** `checkout_children`: `kind` (`ORDER`/`BOOKING_DOCTOR`/`BOOKING_LAB`), `ref_id`.

**Constraints:** At most one `ORDER` child (A-CUS-04). All children same `country_id`+`currency`.

**State machine:** [05](05_CUSTOMER_PLATFORM.md) §5.3.

---

### 5.17 Order

| | |
| --- | --- |
| **Purpose** | Paid/COD goods order; one seller org. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `customer_person_id`, `seller_org_id`, `fulfilling_location_id`, `checkout_session_id`, `status` (pharmacy machine: `DRAFT`/`PENDING_PAYMENT`/`PAID`/`RX_REVIEW`/`ACCEPTED`/`PACKING`/`DISPATCHED`/`OUT_FOR_DELIVERY`/`DELIVERED`/`CANCELLED`/`RETURN_REQUESTED`/`RETURNED`/`REFUNDED`), `currency`, `goods_minor`, `tax_minor`, `fee_minor`, `discount_minor`, `total_minor`, `payment_method`, `address_snapshot`, `prescription_id` nullable, `refund_ids[]` or join, `commission_snapshot` JSONB (vendor).

**Constraints:** One seller (A-BIZ-01). Illegal status skips rejected in service.

**Related:** `Fulfillment` (pick/pack unit) — supporting table.

---

### 5.18 OrderItem

| | |
| --- | --- |
| **Purpose** | Line snapshot. |
| **PK** | `id` |
| **TEN** | via order |
| **SD** | No |

**Fields:** `order_id`, `offer_id` (original), `catalog_item_id`, `qty`, `unit_amount_minor`, `tax_minor`, `rx_required`, `lot_id` (allocated), `substitution_of_item_id`.

**Constraints:** Amounts integer; qty > 0.

---

### 5.19 Prescription

| | |
| --- | --- |
| **Purpose** | Upload case **or** digital Rx header. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |
| **AUD** | Clinical |

**Fields:** `patient_person_id`, `source` (`UPLOAD`/`DIGITAL`), `status` (verify machine: `UPLOADED`/`INTAKE`/`OCR_ASSISTED`/`PENDING_REVIEW`/`NEEDS_INFO`/`VERIFIED`/`REJECTED`/`EXPIRED`/`CANCELLED` **or** digital `DRAFT`/`SIGNED`), `encounter_id` nullable, `doctor_person_id` nullable, `verifier_membership_id`, `signed_at`, `reason_code`, `health_artifact_id`.

**Constraints:** `SIGNED`/`VERIFIED` required before dispense unless pack (still default verify). OCR never sets VERIFIED.

---

### 5.20 PrescriptionItem

| | |
| --- | --- |
| **Purpose** | Structured Rx lines. |
| **PK** | `id` |
| **TEN** | via prescription |

**Fields:** `prescription_id`, `catalog_item_id` nullable (unmapped), `free_text`, `strength`, `form`, `dose`, `route`, `frequency`, `duration`, `quantity`, `substitution_allowed`, `mapped_offer_id`.

---

### 5.21 DoctorProfile

| | |
| --- | --- |
| **Purpose** | Professional profile. |
| **PK** | `id`; unique `person_id` (+ country **OD-DOC-06**) |
| **TEN** | `country_id` primary practice |
| **SD** | No |

**Fields:** `person_id`, `organization_id` nullable, `status` (onboarding machine), `display_name`, `bio`, `photo_object_id`, `timezone`, `consult_types[]`, `default_duration_minutes`.

**Related:** `DoctorLicense`, `DoctorQualification`, `FeeSchedule` — supporting.

---

### 5.22 Slot

| | |
| --- | --- |
| **Purpose** | Bookable unit (doctor or lab). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `owner_type` (`DOCTOR`/`LAB_LOCATION`), `owner_id`, `starts_at` timestamptz, `ends_at`, `status` (`OPEN`/`HELD`/`BOOKED`/`RELEASED`/`BLOCKED`), `hold_expires_at`, `version`.

**Constraints:** No overlap BOOKED for same owner; `SELECT … FOR UPDATE` / version.

---

### 5.23 Appointment

| | |
| --- | --- |
| **Purpose** | Doctor booking (commercial + schedule). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `patient_person_id`, `doctor_person_id`, `slot_id`, `offer_id`, `checkout_session_id`, `status` ([08](08_DOCTOR_PLATFORM.md) §8.1), `consult_mode`, `currency`, `amount_minor`, `successor_appointment_id`.

Lab uses **LabBooking**, not this table.

---

### 5.24 Encounter

| | |
| --- | --- |
| **Purpose** | Clinical session for an appointment. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **AUD** | Clinical |

**Fields:** `appointment_id` unique v1, `status` (`CREATED`/`WAITING`/`IN_CONSULT`/`COMPLETED`/`INCOMPLETE`/`VOID`), `timer_started_at`, `completed_at`, `note_artifact_id`.

**ASSUMPTION:** 1:1 appointment in v1.

---

### 5.25 VideoSession

| | |
| --- | --- |
| **Purpose** | Media metadata; not the SFU. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **IMM** | Events append |

**Fields:** `appointment_id`, `encounter_id`, `room_name`, `status` (`CREATED`/`WAITING_ROOM`/`LIVE`/`RECONNECTING`/`ENDED`/`FAILED`), `recording_state` (`OFF`/`PENDING_CONSENT`/`ACTIVE`/`FAILED`), `recording_allowed_pack`, `egress_object_id` nullable.

**Related:** `recording_consents` per participant.

**Constraints:** Egress only if pack allows AND all required consents GRANTED.

---

### 5.26 ConsentGrant

| | |
| --- | --- |
| **Purpose** | Health artifact access grant. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **AUD** | Yes |

**Fields:** `patient_person_id`, `grantee_type`, `grantee_id`, `purpose`, `artifact_scope` JSONB, `status` (`PENDING`/`ACTIVE`/`EXPIRED`/`REVOKED`/`SUPERSEDED`/`DENIED`), `expires_at`, `notice_version`, `break_glass` bool.

Server reloads on every payload read.

---

### 5.27 HealthArtifact

| | |
| --- | --- |
| **Purpose** | Unified clinical object + pointer to encrypted blob. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | **No casual delete.** `retention_status` |
| **AUD** | Payload reads logged |

**Fields:** `patient_person_id`, `type` (see [16](16_HEALTH_RECORD.md)), `source_module`, `source_id`, `status` (`DRAFT`/`ACTIVE`/`AMENDED`/`SUPERSEDED`/`REDACTED`/`LEGAL_HOLD`), `retention_status` (`ACTIVE`/`EXPIRED_PENDING`/`HELD`/`PURGED_POINTER`/`LEGAL_HOLD`), `sensitivity`, `storage_uri`, `metadata` JSONB (non-payload), `legal_hold_id`, `supersedes_id`.

**List APIs** use metadata only. Payload is separate authorized read.

---

### 5.28 LabTest

| | |
| --- | --- |
| **Purpose** | Canonical test definition (CatalogItem kind LAB_TEST + extension). |
| **PK** | `catalog_item_id` or own `id` FK |
| **TEN** | `country_id` |

**Fields:** `specimen_type`, `fasting_hours`, `tat_target_hours`, `age_min`/`age_max`, `sex_restriction`, `prep_instruction_id`.

---

### 5.29 LabPackage

| | |
| --- | --- |
| **Purpose** | Bundle of tests. v1 not split across labs (OD-LAB-15). |
| **PK** | `id` / catalog_item |
| **TEN** | `country_id` |

**Join:** `lab_package_items` (`package_id`,`test_item_id`).

---

### 5.30 LabBooking

| | |
| --- | --- |
| **Purpose** | Commercial diagnostics booking (`Booking` child). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `customer_person_id`, `lab_org_id`, `lab_location_id`, `checkout_session_id`, `status` (case projection / booking: `BOOKED`/`CONFIRMED`/`CANCELLED`/… aligned with [09](09_LAB_PLATFORM.md) §10 **or** booking subset + samples hold operational states), `collection_mode` (`HOME`/`CENTER`), `slot_id`, `address_snapshot`, `currency`, `total_minor`.

**OPEN DECISION (OD-DB-06):** Store full sample machine on `LabBooking` vs only on `Sample`. Recommendation: **booking** commercial states (`BOOKED`/`CONFIRMED`/`CANCELLED`/`REFUNDED`); **Sample** holds collection-to-report operational states; case rollup is a view (OD-LAB-04).

---

### 5.31 Sample

| | |
| --- | --- |
| **Purpose** | Physical specimen. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |
| **AUD** | CoC |

**Fields:** `lab_booking_id`, `barcode` unique, `accession_no` (lab-local, set at receive), `status` (happy + exception catalog §10.1 of [09](09_LAB_PLATFORM.md)), `specimen_type`, `container_type`, `collected_at`, `received_at`.

**Constraints:** Barcode unique globally; mismatch cannot PROCESSING.

---

### 5.32 SampleEvent (chain of custody)

| | |
| --- | --- |
| **Purpose** | Immutable custody event. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **IMM** | **Yes. Never delete.** |
| **SD** | **Forbidden** |

**Fields:** `sample_id`, `event_type`, `from_actor_id`, `to_actor_id`, `location_id`, `geo`, `photo_object_id`, `temperature`, `note`, `occurred_at`, `offline_flag`, `actor_device_id`.

**Constraints:** Append-only. `PICKED_UP` and `LAB_RECEIVED` require same `sample_id` scan.

---

### 5.33 LabResult

| | |
| --- | --- |
| **Purpose** | Analyte values before/with report. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **AUD** | Clinical |
| **SD** | No; amendments new rows |

**Fields:** `sample_id`, `test_item_id`, `analyte_code`, `value_text`, `value_num` (scientific, **not money**), `unit`, `ref_range`, `flag` (`NORMAL`/`ABNORMAL`/`PANIC`), `entered_by`, `qc_pass`.

**Constraints:** Signer ≠ enterer when pack SoD.

---

### 5.34 Report

| | |
| --- | --- |
| **Purpose** | Signed diagnostic report version. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **AUD** | Clinical |

**Fields:** `lab_booking_id`, `version` INT, `status` (`GENERATED`/`RELEASED`/`AMENDED`), `signed_by_person_id`, `signed_at`, `health_artifact_id`, `hash`.

**Constraints:** Release requires sign; amendments increment version; do not rewind booking to PROCESSING.

---

### 5.35 PrintRequest

| | |
| --- | --- |
| **Purpose** | Physical report copy. |
| **PK** | `id` |
| **TEN** | `country_id` |

**Fields:** `report_id`, `status`, `address_snapshot`, `checkout_session_id` (fee), `logistics_job_id`.

Job type `REPORT_DELIVERY`.

---

### 5.36 LogisticsJob

| | |
| --- | --- |
| **Purpose** | Physical movement engine. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `job_type` (`MEDICINE_DELIVERY`/`SAMPLE_COLLECTION`/`SAMPLE_TRANSPORT`/`REPORT_DELIVERY`), `state` ([11](11_LOGISTICS_PLATFORM.md) §6), `reference_type`, `reference_id`, `parent_job_id`, `organization_id` pickup org, `partner_person_id`, `customer_person_id`, `pickup_snapshot`, `dropoff_snapshot`, `requirements[]`, `sla_at`, `eta_*`, `payout_amount_minor`, `cod_amount_minor`, `otp_hash`, `privacy_mode`.

**Constraints:** Order not DISPATCHED without `job_id`. Rider does not store report PDF.

---

### 5.37 JobEvent

| | |
| --- | --- |
| **Purpose** | Job timeline (status, scan, GPS ping summary). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **IMM** | Yes |

**Fields:** `job_id`, `event_type`, `state_to`, `actor_id`, `geo`, `occurred_at`, `payload` JSONB (non-clinical).

GPS high-frequency pings: **Redis + sampled persist** **OD-DB-07**.

---

### 5.38 PaymentIntent

| | |
| --- | --- |
| **Purpose** | Money movement attempt for a CheckoutSession. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `checkout_session_id`, `capture_mode`, `amount_minor`, `payment_currency`, `fx_snapshot_id`, `gateway_id`, `merchant_account_id`, `provider_ref`, `status` ([12](12_PAYMENT_PLATFORM.md) §5.2), `next_action` JSONB, `risk_decision`, `idempotency_key` unique, `version`.

**Balances:** authorized/captured/refunded remaining in **payment currency**.

---

### 5.39 PaymentAttempt

| | |
| --- | --- |
| **Purpose** | Each confirm/redirect/retry. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **IMM** | Yes |

**Fields:** `payment_intent_id`, `gateway_id`, `status`, `provider_attempt_ref`, `error_code`, `occurred_at`.

---

### 5.40 GatewayWebhook

| | |
| --- | --- |
| **Purpose** | Normalized inbound PSP event. |
| **PK** | `id` |
| **TEN** | `country_id` nullable until parsed |
| **IMM** | Yes |

**Fields:** `gateway_id`, `provider_event_id`, unique (`gateway_id`,`provider_event_id`), `payload_encrypted`, `signature_ok`, `processed_at`, `intent_id`.

**Constraints:** Idempotent consumer. Reject unsigned.

---

### 5.41 Wallet

| | |
| --- | --- |
| **Purpose** | Stored-value ops balance per customer × country. |
| **PK** | `id`; unique (`person_id`,`country_id`,`currency`) |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `person_id`, `currency`, `available_minor`, `held_minor`, `status` (`ACTIVE`/`FROZEN`), `enabled_by_pack`.

**Constraints:** `available_minor >= 0`; no cross-country merge. Ledger `LIAB_WALLET` must match (recon).

---

### 5.42 WalletTxn

| | |
| --- | --- |
| **Purpose** | Wallet operational ledger (not accounting journal). |
| **PK** | `id` |
| **TEN** | `country_id` |
| **IMM** | Yes |
| **SD** | **No** |

**Fields:** `wallet_id`, `type` (`TOPUP`/`HOLD`/`RELEASE`/`CAPTURE`/`REFUND_CREDIT`/`MANUAL_CREDIT`/`PROMO`), `amount_minor`, `direction`, `payment_intent_id`, `idempotency_key`, `source_event_id`.

Manual credit dual control at API layer.

---

### 5.43 LedgerAccount

| | |
| --- | --- |
| **Purpose** | Chart of accounts + participant sub-accounts. |
| **PK** | `id` |
| **TEN** | `country_id` + `legal_entity_id` |
| **SD** | No (close) |

**Fields:** `code` (logical `AST_GATEWAY_CASH`…), `name`, `type` (`ASSET`/`LIABILITY`/`REVENUE`/`EXPENSE`), `participant_type`, `participant_id` nullable, `currency`.

---

### 5.44 JournalEntry

| | |
| --- | --- |
| **Purpose** | Immutable header. |
| **PK** | `id` |
| **TEN** | `country_id`, `legal_entity_id` |
| **IMM** | **Posted rows never updated or deleted** |
| **SD** | **FORBIDDEN** |

**Fields:** `booked_at`, `source_event_id`, `source_type`, `posting_rule_id`, `correlation` JSONB, `description`, `actor_id`, `status` (`POSTED` only v1), `reverses_entry_id`.

**Constraints:** unique (`source_event_id`,`posting_rule_id`); lines balance in balancing currency.

---

### 5.45 JournalLine

| | |
| --- | --- |
| **Purpose** | Debit/credit line. |
| **PK** | `id` |
| **TEN** | same as entry |
| **IMM** | **Yes** |
| **SD** | **FORBIDDEN** |

**Fields:** `journal_entry_id`, `ledger_account_id`, `participant_id`, `amount_minor`, `currency`, `dc` (`D`/`C`), `fx_snapshot_id`, `amount_accounting_minor`.

**Constraints:** CHECK amount_minor > 0; entry sums to 0.

---

### 5.46 SettlementBatch

| | |
| --- | --- |
| **Purpose** | Payout batch. |
| **PK** | `id` |
| **TEN** | `country_id`, `legal_entity_id` |
| **SD** | No (`CANCELLED` from PREVIEW only) |

**Fields:** `participant_type`, `status` (`OPEN`/`PREVIEW`/`APPROVED`/`EXECUTED`/`PARTIAL_FAILED`/`CLOSED`/`CANCELLED`), `period_start`/`end`, `currency`.

---

### 5.47 SettlementItem

| | |
| --- | --- |
| **Purpose** | Line in a batch. |
| **PK** | `id` |
| **TEN** | via batch |
| **IMM** | after EXECUTED |

**Fields:** `batch_id`, `participant_id`, `amount_minor`, `currency`, `payout_attempt_id`, `status`, `source_refs` JSONB.

---

### 5.48 Affiliate

| | |
| --- | --- |
| **Purpose** | Affiliate account. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | `CLOSED` |

**Fields:** `person_id` or `organization_id`, `status` (`APPLIED`/`KYC_PENDING`/`APPROVED`/`REJECTED`/`SUSPENDED`/`CLOSED`), `kyc_case_id`.

---

### 5.49 ReferralAttribution

| | |
| --- | --- |
| **Purpose** | Touch + bind to customer/checkout. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No (fraud forensics) |

**Fields:** `affiliate_id`, `campaign_id`, `click_id`, `customer_person_id` nullable, `device_fingerprint_hash`, `ip_hash`, `occurred_at`, `channel`.

**Constraints:** Self-referral rejected at conversion. Cross-country attribution default deny.

---

### 5.50 Commission

| | |
| --- | --- |
| **Purpose** | Affiliate commission on a conversion. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `affiliate_id`, `conversion_ref_type`/`id`, `rule_version_id`, `status` (`PENDING`/`APPROVED`/`REVERSED`/`VOID`/`LOCKED_FOR_SETTLEMENT`/`PAID`), `base_amount_minor`, `commission_minor`, `currency`.

**Constraints:** `PENDING` is not AP. Unique conversion+affiliate v1.

---

### 5.51 Ticket

| | |
| --- | --- |
| **Purpose** | Support ticket. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | No |

**Fields:** `customer_person_id`, `status` (`OPEN`/`PENDING_CUSTOMER`/`PENDING_INTERNAL`/`ESCALATED`/`RESOLVED`/`CLOSED`/`REOPENED`), `topic`, `linked_objects` JSONB (ids only), `sla_policy_id`.

**Messages:** `ticket_messages` — no clinical payload.

---

### 5.52 Notification

| | |
| --- | --- |
| **Purpose** | In-app notification + dispatch record. |
| **PK** | `id` |
| **TEN** | `country_id` |
| **SD** | Inbox can mark read; row retained per pack |

**Fields:** `person_id`, `channel`, `template_id`, `status`, `deep_link`, `redacted` bool (clinical body not stored).

---

### 5.53 Device

| | |
| --- | --- |
| **Purpose** | Device bind for customers and field staff. |
| **PK** | `id` |
| **TEN** | optional `country_id` |
| **SD** | Yes (logout device) |

**Fields:** `person_id`, `platform` (`IOS`/`ANDROID`/`WEB`), `push_token_ref`, `attestation`, `bound_at`, `status`.

Phlebotomist/rider: collection/job posts require bound device.

---

### 5.54 AuditLog

| | |
| --- | --- |
| **Purpose** | Immutable security/compliance trail. |
| **PK** | `id` |
| **TEN** | `country_id` (nullable platform) |
| **IMM** | **Yes** |
| **SD** | **FORBIDDEN** |

**Fields:** `occurred_at`, `actor_person_id`, `membership_id`, `action`, `resource_type`, `resource_id`, `reason`, `ticket_id`, `ip_hash`, `request_id`, `diff` JSONB (no secrets, no clinical payload, no PAN).

Health payload access: dedicated `health_payload_reads` IMM.

---

### 5.55 FxRate

| | |
| --- | --- |
| **Purpose** | Quoted FX used for snapshots. |
| **PK** | `id` |
| **TEN** | No (global table) |
| **IMM** | Snapshots attached to payments are immutable |

**Fields:** `base_currency`, `quote_currency`, `rate_n` / `rate_d` **or** integer ppm **OD-DB-08** (never float), `source`, `quoted_at`, `lock_policy`.

**PaymentIntent.fx_snapshot_id** FK. Historical payments **never** re-rated in place.

---

## 6. Supporting entities (required for implementation)

| Entity | Purpose |
| --- | --- |
| `regions`, `cities` | Geo |
| `sessions`, `otp_challenges`, `social_identities` | Auth |
| `kyc_cases`, `kyc_attachments`, `kyc_signatures` | [19](19_COMPLIANCE_FRAMEWORK.md) |
| `legal_holds` | Hold |
| `retention_policies`, `retention_jobs` | Retention |
| `idempotency_keys` | Money/order POSTs |
| `outbox_events` | Outbox |
| `stock_movements`, `stock_transfers`, `purchase_orders` | Inventory |
| `fulfillments` | Pick/pack |
| `invoices`, `credit_notes` | Billing (schema from pack) |
| `availability_rules`, `calendar_blocks` | Care |
| `chat_threads`, `chat_messages` | Consult chat SoT |
| `doctor_licenses`, `fee_schedules` | Care |
| `prep_instructions` | Lab |
| `refunds` | Payment refunds |
| `payment_captures` | Captures |
| `campaigns`, `coupons`, `reviews` | CRM/growth |
| `cms_documents`, `banners` | CMS |
| `referral_codes`, `commission_rules` | Affiliate |
| `phlebotomist_profiles`, `partner_profiles` | Field |
| `health_payload_reads` | EHR access log |

---

## 7. Entity list (index)

**Kernel:** Person, Account, Membership, Role, Permission, Session, Device, Country, Region, City, PolicyPack, Organization, Location, Address, CustomerProfile, KycCase, LegalHold, Partner, PartnerType, PartnerApplication, PartnerDocument, PartnerInvitation.

**Catalog/inventory:** CatalogItem, Offer, LabTest, LabPackage, InventoryLot, StockMovement.

**Commerce:** Cart, CartLine, CheckoutSession, CheckoutChild, Order, OrderItem, Fulfillment, Invoice.

**Rx/care:** Prescription, PrescriptionItem, DoctorProfile, Slot, Appointment, Encounter, VideoSession, ChatMessage, ConsentGrant, HealthArtifact.

**Diagnostics:** LabBooking, Sample, SampleEvent, LabResult, Report, PrintRequest.

**Logistics:** LogisticsJob, JobEvent.

**Money:** PaymentIntent, PaymentAttempt, GatewayWebhook, Refund, Wallet, WalletTxn, LedgerAccount, JournalEntry, JournalLine, SettlementBatch, SettlementItem, FxRate.

**Growth/ops:** Affiliate, ReferralAttribution, Commission, Ticket, Notification, AuditLog, CmsDocument, Coupon, Campaign.

---

## 8. ERD (descriptive)

```
Person 1──1 Account
Person 1──N Membership ──N Role ──N Permission
Person 1──N CustomerProfile (per Country)
Person 1──0..1 DoctorProfile ──N Slot ──N Appointment ──1 Encounter ──0..1 VideoSession
Person 1──N ConsentGrant (as patient)
Person 1──N HealthArtifact

Country 1──N PolicyPack
Country 1──N Organization 1──N Location 1──N InventoryLot
Organization 1──N Offer ──N CatalogItem
CustomerProfile 1──1 Cart (active per country) ──N CartLine ── Offer
CheckoutSession 1──N CheckoutChild → Order | Appointment | LabBooking
CheckoutSession 1──0..1 PaymentIntent 1──N PaymentAttempt
PaymentIntent 1──N GatewayWebhook (by provider ref)
Order 1──N OrderItem
Order 0..1 Prescription 1──N PrescriptionItem
Order 1──0..N LogisticsJob (MEDICINE_DELIVERY)

LabBooking 1──N Sample 1──N SampleEvent
Sample 1──N LabResult
LabBooking 1──N Report ── HealthArtifact
Report 1──N PrintRequest ── LogisticsJob (REPORT_DELIVERY)

Wallet 1──N WalletTxn
JournalEntry 1──N JournalLine ── LedgerAccount
SettlementBatch 1──N SettlementItem

Affiliate 1──N ReferralAttribution
Affiliate 1──N Commission
```

HealthArtifact **does not** FK to CRM Ticket. Tickets store ids only.

---

## 9. Relationship map (cardinality highlights)

| From | To | Card | Rule |
| --- | --- | --- | --- |
| Cart | Organization (seller) | 1 | v1 |
| CheckoutSession | Order | 0..1 | |
| CheckoutSession | Appointment/LabBooking | 0..N | same currency |
| Order | Location | 1 | no split ship v1 |
| Prescription | Order | 0..N | |
| Appointment | Encounter | 1:1 v1 | |
| Encounter | VideoSession | 0..1 | chat-only may omit |
| LabBooking | Sample | 1..N | |
| Sample | SampleEvent | 1..N | append-only |
| Report | HealthArtifact | 1 | |
| PaymentIntent | CheckoutSession | N:1 | retries = new intent |
| JournalLine | JournalEntry | N:1 | balance |
| Commission | conversion | 1 per doc v1 | |

---

## 10. Core indexes

| Table | Index |
| --- | --- |
| memberships | `(person_id, status)`, `(country_id, role_id)` |
| account_identifiers | unique `(type, value_normalized)` |
| offers | `(country_id, catalog_item_id, status)`, `(seller_org_id, status)` |
| inventory_lots | `(location_id, catalog_item_id, expiry_date)` WHERE recalled_at IS NULL |
| carts | unique `(customer_person_id, country_id)` WHERE status=ACTIVE |
| checkout_sessions | unique `idempotency_key`; `(customer_person_id, status)` |
| orders | `(country_id, seller_org_id, status, created_at)`, `(customer_person_id, created_at)` |
| prescriptions | `(country_id, status)` queue; `(patient_person_id)` |
| slots | `(owner_id, starts_at)` WHERE status IN OPEN,HELD |
| appointments | `(doctor_person_id, starts_at)`, `(patient_person_id, status)` |
| lab_bookings | `(lab_org_id, status)`, `(customer_person_id)` |
| samples | unique `barcode`; `(lab_booking_id)` |
| sample_events | `(sample_id, occurred_at)` |
| logistics_jobs | `(partner_person_id, state)`, `(reference_type, reference_id)` |
| payment_intents | unique `idempotency_key`; `(checkout_session_id)` |
| gateway_webhooks | unique `(gateway_id, provider_event_id)` |
| wallets | unique `(person_id, country_id, currency)` |
| journal_entries | unique `(source_event_id, posting_rule_id)`; `(country_id, booked_at)` |
| journal_lines | `(ledger_account_id, booked_at)` — via entry |
| tickets | `(country_id, status, sla)` |
| audit_logs | `(country_id, occurred_at)`, `(actor_person_id, occurred_at)`, `(resource_type, resource_id)` |
| health_artifacts | `(patient_person_id, created_at)`, `(country_id, type)` |
| consent_grants | `(patient_person_id, grantee_id, status)` |
| fx_rates | `(base, quote, quoted_at DESC)` |

Partial indexes for queues (e.g. `orders` WHERE status IN (`PAID`,`RX_REVIEW`)).

---

## 11. Partitioning

| Table | Strategy | Key |
| --- | --- | --- |
| `audit_logs` | RANGE `occurred_at` monthly | retain per pack |
| `job_events` | RANGE `occurred_at` | |
| `gateway_webhooks` | RANGE `created_at` | |
| `notifications` | RANGE `created_at` | |
| `outbox_events` | RANGE + processed drain | |
| `journal_lines` | RANGE `booked_at` **OD-DB-09** | Only after volume; never drop partitions with legal retain |
| `health_payload_reads` | RANGE `occurred_at` | |

**Do not** partition `orders` or `persons` in v1.

UUID v7 is time-sortable — btree inserts are append-friendly.

---

## 12. RLS patterns

```
-- session: SET app.country_id = '<uuid>'; SET app.user_id = '...';
CREATE POLICY country_iso ON orders
  USING (country_id = current_setting('app.country_id', true)::uuid);
```

| Pattern | Use |
| --- | --- |
| Tenant isolation | Default on TEN tables |
| Org isolation | Additional `seller_org_id = app.org_id` for vendor connections |
| Self | `customer_person_id = app.user_id` |
| Platform | `app.platform = 'true'` **and** audit; still set country for working context when viewing a country |
| Health | RLS **not sufficient**; ConsentGrant checked in service |

**RISK:** Superuser bypass. App roles: `wp_app` (RLS), `wp_migrator` (migrations only).

---

## 13. Data retention (database view)

| Class | Tables | Delete policy |
| --- | --- | --- |
| LEDGER | JournalEntry, JournalLine, LedgerAccount | **Never** |
| PAYMENT ops | PaymentIntent, Attempt, Webhook, WalletTxn | Pack; no silent wipe; prefer archive |
| HEALTH | HealthArtifact blobs | `retention_status`; hold skips |
| CoC | SampleEvent | Treat as health/ops evidence — pack; default **no auto-delete** |
| AUDIT | AuditLog | Partition drop only after pack + hold scan |
| CART | Abandoned carts | Technical TTL |
| OTP | otp_challenges | Short TTL |

Erase jobs: [19](19_COMPLIANCE_FRAMEWORK.md) §7. `deleted_at` is **not** enough for GDPR-style erase (must anonymize PII columns when pack allows).

---

## 14. Idempotency store

`idempotency_keys`: `key`, `actor_id`, `route`, `request_hash`, `response_ref`, `created_at`. Unique (`actor_id`,`route`,`key`). Conflict 409 if hash differs.

TTL **OD-PAY-14**.

---

## 15. Outbox

`outbox_events`: `id`, `topic`, `payload`, `created_at`, `published_at`. Same transaction as aggregate mutation. Dispatcher publishes to Redis/bus.

---

## 16. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-DB-01 | Float money | BIGINT minor |
| R-DB-02 | Cross-country leak | RLS + mandatory country_id |
| R-DB-03 | Journal update | No grants; reversing entries |
| R-DB-04 | Health in tickets | No FK payload |
| R-DB-05 | Split DB schema drift | Same migration pipeline |
| R-DB-06 | Person merge across countries leaking Rx | Profiles isolated |

---

## 17. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-DB-01 | ENUM vs TEXT+CHECK | TEXT+CHECK for extensible statuses |
| OD-DB-02 | Phone uniqueness global vs country | Global account identifiers |
| OD-DB-03 | Membership unique tuple | Include org+location+country+role |
| OD-DB-04 | Offer uniqueness | One published offer per item+seller+location |
| OD-DB-05 | Lot qty vs movement-sourced | Movements SoT + cached qty |
| OD-DB-06 | Booking vs sample state owner | Split commercial vs specimen |
| OD-DB-07 | GPS ping persistence | Redis + sampled JobEvent |
| OD-DB-08 | FX rate storage | Rational integers / ppm, not float |
| OD-DB-09 | Partition journal v1 | No; later by booked_at |
| OD-DB-10 | Schema-per-module vs public | `public` + table prefixes **or** PG schemas per module; recommendation: **PG schemas per bounded context** (`identity`, `catalog`, `ledger`, …) with cross-schema FKs allowed in monolith |
| OD-DB-11 | Invoice table vs snapshot JSON | Separate `invoices` when pack requires legal invoice |
| OD-DB-12 | Chat messages in OLTP vs object | OLTP for SoT; attachments in object store |
