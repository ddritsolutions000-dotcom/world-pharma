# 327 — R15-A Main Admin Country Policy Pack operator (M-ADM-CFG)

**CR:** `CR-327-R15-A-POLICY-PACK-OPERATOR`  
**Date:** 31 August 2026  
**Type:** Authorized sandbox/configuration-management slice — **not** live PSP, **not** R15 full workforce/DR/residency, **not** R16  
**Verdict:** **`R15_A_POLICY_PACK_OPERATOR_COMPLETE`**

**Does not:** set `PAYMENT_LIVE_ENABLED=true`, execute CR-244, invent Book-263 evidence, manufacture medicines, or fork countries.

---

## Roadmap requirement

| Source | Why this slice is in scope |
| ------ | -------------------------- |
| [01](01_PRODUCT_VISION.md) §3.6 | Config over code; service availability lives in Country Policy Packs |
| [17](17_ADMIN_ERP.md) §6.32 **Configuration (`M-ADM-CFG`)** | Pack editor, flags, payment-method enablement, tax **profile id**, service availability, diff, publish |
| [18](18_GLOBALIZATION.md) | Packs, not country code forks; `tax_profile_id` is an id/code |
| [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) | Countries nav was a read-only foundation placeholder |
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) R15 | Control-plane depth; this is the smallest operator slice, not full R15 |

---

## Source gap (confirmed before coding)

| Layer | Status before this CR |
| ----- | --------------------- |
| `policy_packs` table + statuses DRAFT / PUBLISHED / SUPERSEDED | **ALREADY_COMPLETE** — no migration |
| `PolicyAdminService` create / publish / retire / rollback + `COUNTRY_POLICY_*` events | **ALREADY_COMPLETE** |
| `validatePolicyDocument` Zod schema | **ALREADY_COMPLETE** (operator keys existed; `tax_profile_id` was Book-18-only) |
| `GET/POST /api/v1/admin/policy-packs` | **PARTIAL** — list omitted documents; no GET-by-id, validate, or diff |
| `gateway_refs` vs `PaymentGatewayRegistry` at publish | **REAL_MISSING_FEATURE** — schema required ids; registry check was submit-path only |
| Main Admin `/countries` | **REAL_MISSING_FEATURE** — read-only `CountriesGovernance` list |

---

## Scope delivered

1. Main Admin structured operator on `/countries` (select country, versions, published inspect, draft, validate, diff, publish, rollback).
2. Operator keys only: services, `payments.enabled` / methods / `gateway_refs` / currencies, `tax_profile_id`, healthcare/CRM/analytics/search flags, `recording_allowed`, `data_residency_mode`.
3. `gateway_refs` must be **registered adapter codes** (`PaymentGatewayRegistry`). Unknown/invented PSP codes and secret-like values fail closed.
4. Dual control reused (`assertMakerChecker`); auto-required when `recording_allowed` is true.
5. Publishing a pack **cannot** set `PAYMENT_LIVE_ENABLED`, create a production PSP, or bypass R14-A 7/7 gates.

**Migration:** none. Existing `policy_packs.document` JSON holds `tax_profile_id` as an optional pack field.

---

## APIs

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/api/v1/admin/policy-packs?country=` | `policy:read` |
| GET | `/api/v1/admin/policy-packs/catalog` | `policy:read` |
| GET | `/api/v1/admin/policy-packs/:id` | `policy:read` |
| GET | `/api/v1/admin/policy-packs/:id/diff` | `policy:read` |
| POST | `/api/v1/admin/policy-packs/validate` | `policy:publish` |
| POST | `/api/v1/admin/policy-packs/:id/validate` | `policy:publish` |
| POST | `/api/v1/admin/policy-packs` | `policy:publish` |
| POST | `/api/v1/admin/policy-packs/:id/publish` | `policy:publish` |
| POST | `/api/v1/admin/policy-packs/:id/retire` | `policy:publish` |
| POST | `/api/v1/admin/policy-packs/rollback` | `policy:publish` |

---

## Explicit exclusions

Live PSP / SDK / webhooks / credentials, `PAYMENT_LIVE_ENABLED=true`, CR-244, R16 country forks, R15 workforce/DR/residency program, wallet product, OpenSearch, DICOM, affiliate mobile, manufacturing, new notification engine.

---

## Tests (this CR)

| Suite | Result |
| ----- | ------ |
| `operator.spec` + `validator.spec` | **11/11 PASS** |
| `r15a.policy-admin.e2e` | **4/4 PASS** |
| `policy.e2e` + `payment.e2e` + `r14a-gate.e2e` + `provider-config` | **28/28 PASS** |
| `company-authority.e2e` | **PASS** (included in 16-test combined run with operator/R15-A) |
| `policy-pack-admin.spec` + `payments-admin.spec` | **19/19 PASS** |
| `api:typecheck` / `web-admin:typecheck` / `api:build` | **PASS** |

**Migration:** none (151 existing; none pending).

| Status | Meaning |
| ------ | ------- |
| **`R15_A_POLICY_PACK_OPERATOR_COMPLETE`** | Company/Main Admin can operate existing packs in sandbox |
| **`R14_A_ENGINEERING_CONFIG_READY`** | Unchanged — not live-ready |
| **`R14_A_LIVE_PRODUCTION_READY`** | **Not claimed** |

---

## Addendum — production-prep operator fields (no new CR)

Authorized by this production-preparation pass and Book [18](18_GLOBALIZATION.md) pack example (i18n, catalog currency, timezone, optional ledger refs). **No new CR number. No migration. No invented legal-entity or country approval.**

The pack **document schema** already had `i18n`, `currency`, and `timezone`. The operator/UI previously omitted them, so a future country launch would still ship `en` / `XXX` / `UTC` unless someone edited JSON/SQL.

Operator view now includes:

- `i18n.default_locale` / `i18n.locales`
- `currency.default` / `currency.allowed` (catalog money; distinct from `payments.currencies`)
- `timezone.default` (merged into `timezone.allowed`)
- `ledger.legal_entity_id` (opaque id/code, optional, empty until legal fills — **not** MoR, **not** a Book-263 gate)
- `ledger.accounting_currency` (ISO 4217, must be in `currency.allowed` when set)

Technical defaults remain `en` / `XXX` / `UTC`. Empty ledger refs are valid. Secret-like legal-entity values fail closed. Publishing still cannot set `PAYMENT_LIVE_ENABLED` or bypass R14-A.

EUR / `Europe/Berlin` in tests are **hypothetical pack values**, not production country evidence.
