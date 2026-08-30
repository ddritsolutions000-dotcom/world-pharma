# 21 — API Architecture

**Status:** Blueprint (implementation contract)  
**Audience:** API, client, mobile, admin engineering, QA, security  
**Related:** [Apps](04_APPLICATION_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Customer](05_CUSTOMER_PLATFORM.md)–[16](16_HEALTH_RECORD.md) · [Admin](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md)

**Requirement IDs:** REQ-API, REQ-ID, REQ-SEC, REQ-PAY, REQ-EHR

---

## 1. Purpose

This document is the **HTTP contract** for the NestJS modular monolith. Clients (RN, Next.js, partners) speak **one public API**. It is not production OpenAPI YAML and not handler code.

Style: **REST** under `/api/v1`. Errors: **Problem+JSON**. Money and order-creating POSTs require **`Idempotency-Key`**.

---

## 2. Cross-cutting contract

### 2.1 Base URL and versioning

| Item | Rule |
| --- | --- |
| Prefix | `/api/v1` |
| Compatibility | Additive fields OK; breaking changes → `/api/v2` |
| Content-Type | `application/json` unless multipart uploads |
| Date | ISO-8601 UTC (`2026-08-26T07:57:00Z`) |
| IDs | UUID v7 strings |
| Money | `{ "amount_minor": 19900, "currency": "XXX" }` — never floats |
| Country | Header `X-Country-Id` **or** JWT `country_id`; mismatch → `409 COUNTRY_MISMATCH` |
| Locale | `Accept-Language` BCP-47; pack must allow |
| Correlation | `X-Request-Id` (client or gateway); echoed |

### 2.2 Authentication (`authn`)

| Mechanism | Use |
| --- | --- |
| Bearer JWT | Access token; `sub` = person_id, `aud` = client family (`customer` \| `partner_applicant` \| `pharmacy` \| `vendor` \| `doctor` \| `lab` \| `pathologist` \| `phlebotomist` \| `delivery` \| `admin`), `membership_id`, `roles[]`, `session_id`, `country_id` |
| Refresh | Opaque/rotating refresh; family revoke |
| Public | Catalog browse, CMS home, doctor public profile, login start |
| HMAC | Inbound PSP webhooks only |

Staff tokens **must not** call customer-audience routes and vice versa ([03](03_USER_ROLES_AND_PERMISSIONS.md) RISK privilege confusion).

MFA: professional/admin required; customer step-up for wallet/refund.

### 2.3 Authorization (`authz`)

Evaluated in domain services:

1. `aud` matches route family
2. Permission `resource:action` from membership
3. Scope (`self` / `location` / `organization` / `country` / `platform`)
4. Health: **reload ConsentGrant**; JWT is insufficient
5. Policy Pack: disabled service → `403 SERVICE_DISABLED`

High-risk admin: header `X-Reason` required.

### 2.4 Idempotency

Header: `Idempotency-Key: <uuid-v7>`.

**Required** on:

- Checkout create/start-payment
- Payment confirm/capture/refund
- Wallet top-up, debit, manual credit
- Order cancel that refunds; booking create
- Settlement execute; payout retry
- Prescription submit; report release
- Logistics job create

Replay: same key + same body hash → original result (`200`/`201`). Same key + different hash → `409 IDEMPOTENCY_CONFLICT`.

**OPEN DECISION (OD-API-01):** TTL of stored keys. Align OD-PAY-14; recommendation 72h for money, 24h for bookings.

Safe GETs do not use the key. Webhooks use **provider event id**, not this header.

### 2.5 Pagination, filtering, sorting

| Style | Cursor `?cursor=&limit=` default 20 max 100 |
| --- | --- |
| Filter | Explicit query params; no free SQL |
| Sort | Allow-list per resource |

List responses:

```json
{
  "data": [],
  "page": { "next_cursor": "string|null", "limit": 20 }
}
```

### 2.6 Problem+JSON errors

`Content-Type: application/problem+json`

```json
{
  "type": "https://api.worldpharma.example/problems/cart-seller-conflict",
  "title": "Cart seller conflict",
  "status": 409,
  "detail": "Cart already has a different seller.",
  "code": "CART_SELLER_CONFLICT",
  "instance": "/api/v1/cart/items",
  "request_id": "uuid",
  "errors": [{ "field": "offer_id", "code": "SELLER_MISMATCH" }]
}
```

| HTTP | When |
| --- | --- |
| 400 | Validation |
| 401 | Missing/invalid token |
| 403 | Permission / pack / consent |
| 404 | Hidden as 404 if unauthorized-to-know |
| 409 | State conflict, idempotency, slot stolen |
| 412 | Stale `version` / `If-Match` |
| 422 | Business rule (Rx required, fasting block) |
| 429 | Rate limit |
| 502/503 | PSP/video downstream; retryable flag in body |

### 2.7 Concurrency

Contended resources (`Slot`, `InventoryLot`, `PaymentIntent`) use `version` and `If-Match` or body `version`. Failure: `412 PRECONDITION_FAILED` or `409 SLOT_TAKEN`.

### 2.8 Webhooks (platform inbound)

`POST /api/v1/webhooks/{gateway}` — no user JWT. Verify signature, timestamp window, persist `GatewayWebhook`, enqueue. Response `200` quickly. **At-least-once**; business effect exactly-once via provider event id.

### 2.9 Outbound webhooks (future partners)

Not v1 required. If added: signed, retry, `event_id` UUID v7. **OD-API-02**.

### 2.10 File uploads

Multipart or **presigned PUT**. Virus scan before `UPLOADED`→`INTAKE`. Rx/KYC/report PDFs go to object storage; API stores ids.

### 2.11 Rate limits

Per `aud` + person + IP. Stricter on OTP and pay. Headers `RateLimit-*`.

---

## 3. Resource naming

| Style | Example |
| --- | --- |
| Nouns, plural | `/customers/me/orders` |
| Nested only one level deep when child-owned | `/orders/{id}/items` |
| Actions as sub-resources | `POST /orders/{id}/cancel` |
| Admin | `/admin/...` with admin `aud` |
| Me | `/me` for self |

**OPEN DECISION (OD-API-03):** `/me` vs `/customers/{id}` for self. Recommendation: **`/me`** for customer; staff use `/admin/customers/{id}` with mask.

---

## 4. Domain: Auth

**Audience:** all client families (separate start endpoints or `aud` in complete).

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/otp/request` | Send OTP | public | pack channels | Yes (per identifier+channel window) |
| POST | `/auth/otp/verify` | Verify OTP | public | | No (OTP single use) |
| POST | `/auth/register` | Complete customer registration | OTP proof | pack min_age | Yes |
| POST | `/auth/login` | Start password or OTP login | public | | |
| POST | `/auth/token/refresh` | Rotate tokens | refresh | session valid | |
| POST | `/auth/logout` | End session | JWT | self | |
| POST | `/auth/logout-all` | Revoke family | JWT | self | |
| POST | `/auth/step-up` | MFA challenge for wallet/refund | JWT | self | |
| POST | `/auth/password/set` | Professional set/reset | challenge | | |
| POST | `/auth/social/start` | OIDC start | public | pack | |
| POST | `/auth/social/callback` | OIDC complete | public | pack | |
| GET | `/auth/sessions` | List devices/sessions | JWT | self | |
| DELETE | `/auth/sessions/{id}` | Revoke one | JWT | self | |

**POST `/auth/otp/request`**

Request: `identifier`, `channel` (`sms`\|`email`\|`whatsapp`), `purpose` (`register`\|`login`\|`step_up`), `country_id`, `device_id`.  
Response: `challenge_id`, `expires_at`, `retry_after_seconds`.  
Errors: `OTP_RATE_LIMITED` 429, `CHANNEL_DISABLED` 403, `WHATSAPP_DISABLED` 403.

**POST `/auth/register`**

Request: `challenge_id`, `country_id`, `legal_notice_ids[]` accepted, optional `name`.  
Response: `person_id`, `access_token`, `refresh_token`, `membership_id`.  
Errors: `AGE_BLOCKED` 422, `DUPLICATE_IDENTIFIER` → login path 409.

**Events:** `session.started`, `session.revoked`, `otp.verified`.

---

## 4b. Domain: Partner (onboarding)

**Audience:** `partner_applicant`, type apps, `admin`. Canonical: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §17.

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/public/partner-types` | Enabled types for country | public | pack | |
| POST | `/partner/applications` | Create application | JWT applicant | type enabled | Yes |
| GET/PATCH | `/partner/applications/{id}` | Get/patch profile | JWT | self/org | |
| POST | `/partner/applications/{id}/submit` | Submit packet | JWT | self | Yes |
| POST | `/partner/applications/{id}/documents` | Register upload | JWT | self | Yes |
| POST | `/partner/invitations` | Invite staff/professional | JWT | `partner_staff:invite` | Yes |
| POST | `/partner/invitations/{token}/accept` | Accept invite | JWT | identity | Yes |
| GET | `/partner/organizations/{id}/members` | Staff list | JWT | org | |
| GET | `/admin/partner-applications` | Worklist | admin JWT | `partner_application:review` | |
| POST | `/admin/partner-applications/{id}/verify` | Mark verified | admin | review | Yes |
| POST | `/admin/partner-applications/{id}/approve` | Approve | admin | approve SoD | Yes |
| POST | `/admin/partner-applications/{id}/reject` | Reject | admin | approve | Yes |
| POST | `/admin/partner-applications/{id}/request-info` | Request more | admin | review | Yes |
| POST | `/admin/partner-applications/{id}/suspend` | Suspend | admin | country_admin/compliance | Yes |

Errors: `TYPE_DISABLED_IN_COUNTRY` 403, `PACK_DOCUMENTS_EMPTY` 422, `SOD_VIOLATION` 403, `APPLICATION_STATE` 409, `INVITE_EXPIRED` 410.

**Events:** `PARTNER_REGISTERED`, `PARTNER_APPLICATION_SUBMITTED`, `PARTNER_APPROVED`, … ([22](22_EVENT_ARCHITECTURE.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §16).

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Social IdP; age of consent.

---

## 5. Domain: Users (identity / IAM)

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/me` | Person + active membership | JWT | self |
| PATCH | `/me` | Locale, display prefs | JWT | self |
| GET | `/me/memberships` | Switchable memberships | JWT | self |
| POST | `/me/memberships/{id}/select` | Set active membership | JWT | own |
| GET | `/admin/users/{id}` | Admin person view | admin JWT | `user:read` |
| POST | `/admin/users/{id}/disable` | Disable account | admin | `account:disable` + reason |
| POST | `/admin/users/{id}/impersonate` | Time-boxed | admin | `user:impersonate` super_admin |

**GET `/me` response (logical):** `person_id`, `status`, `country_id`, `membership`, `roles[]`, `permissions[]` (optional compact), `locale`.

Errors: `MEMBERSHIP_SUSPENDED` 403.

Admin disable: **not** ledger delete. Idempotent by nature if already disabled.

---

## 6. Domain: Customers

Customer-profile, addresses, settings, export/delete **requests**.

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/profile` | CustomerProfile | customer | self | |
| PATCH | `/me/profile` | Update pack fields | JWT | self | |
| GET | `/me/addresses` | List | JWT | self | |
| POST | `/me/addresses` | Create | JWT | self | Yes |
| PATCH | `/me/addresses/{id}` | Update | JWT | self | |
| DELETE | `/me/addresses/{id}` | Soft delete | JWT | self | |
| POST | `/me/addresses/{id}/default` | Set default | JWT | self | |
| POST | `/serviceability/check` | Geo vs services | JWT/public | | |
| POST | `/me/country` | Switch country | JWT | self | |
| POST | `/me/export` | Data export request | JWT | self | Yes |
| POST | `/me/deletion` | Deletion request | JWT | self | Yes |
| GET | `/admin/customers/{id}` | 360 masked | admin | `user:read` | |
| POST | `/admin/customers/{id}/reveal` | Unmask PII | admin | `user:reveal_pii` + reason | |

**PATCH `/me/profile` request:** pack-allowed fields only (`display_name`, `dob`, `gender`, …).  
Errors: `FIELD_NOT_IN_PACK` 422, `NATIONAL_ID_REQUIRED` if pack (default not).

**POST `/me/country`:** warns cart isolation; response `new_country_id`, `wallet_isolated: true`.

Export/delete: `202` `{ "request_id", "status": "QUEUED" }`. Hold blocks delete: `409 LEGAL_HOLD`.

---

## 7. Domain: Pharmacy (owned ops)

Audience `pharmacy`. Customer pharmacy **discovery** is Catalog/public locations.

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/pharmacy/locations` | My org locations | pharmacy | org/location | |
| PATCH | `/pharmacy/locations/{id}` | Hours, catchment | JWT | `location:write` | |
| GET | `/pharmacy/orders` | Queue | JWT | `order:read` location | |
| GET | `/pharmacy/orders/{id}` | Detail + Rx **if pharmacist** | JWT | scope | |
| POST | `/pharmacy/orders/{id}/accept` | Accept (if not auto) | JWT | manager | Yes |
| POST | `/pharmacy/orders/{id}/cancel` | Store cancel | JWT | policy | Yes |
| POST | `/pharmacy/fulfillments/{id}/start` | Start pack | JWT | packer | Yes |
| POST | `/pharmacy/fulfillments/{id}/scan` | Scan lot | JWT | packer | |
| POST | `/pharmacy/fulfillments/{id}/complete` | Pack done | JWT | packer | Yes |
| POST | `/pharmacy/orders/{id}/dispatch` | Create MEDICINE_DELIVERY job | JWT | | Yes |
| POST | `/pharmacy/refunds` | Request refund | JWT | | Yes |
| GET | `/pharmacy/invoices/{order_id}` | Invoice projection | JWT | | |
| POST | `/pharmacy/invoices/{id}/issue` | Issue | JWT | pack | Yes |

**POST dispatch** request: `fulfillment_id`. Response: `order_id`, `status: DISPATCHED`, `job_id`. Errors: `NOT_PACKED` 409, `JOB_CREATE_FAILED` 503.

Packer **does not** receive Rx image URLs unless permission (default deny).

Admin oversight: `/admin/pharmacies`, `/admin/stores` — [17](17_ADMIN_ERP.md).

---

## 8. Domain: Vendors

Audience `vendor`. Isolation: `org_id` from membership only.

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/vendor/register` | Create org + membership | JWT or invite | pack `marketplace.enabled` | Yes |
| GET | `/vendor/kyc` | Case status | vendor | org | |
| POST | `/vendor/kyc/submit` | Submit | vendor | org; not approve | Yes |
| GET | `/vendor/profile` | | vendor | org | |
| PATCH | `/vendor/profile` | | vendor | org | |
| POST | `/vendor/listings` | Draft listing | vendor | `catalog:write` own | Yes |
| POST | `/vendor/listings/{id}/submit` | Publish queue | vendor | | Yes |
| PUT | `/vendor/offers` | Upsert offer | vendor | own | Yes |
| GET | `/vendor/orders` | Own orders | vendor | `order:read` own | |
| POST | `/vendor/orders/{id}/accept` | | vendor | | Yes |
| POST | `/vendor/orders/{id}/reject` | | vendor | reason required | Yes |
| GET | `/vendor/settlements` | Statements | vendor | | |
| GET | `/vendor/commissions/{order_id}` | Breakdown | vendor | own | |

**POST accept** errors: `SLA_EXPIRED` 409, `STOCK_INSUFFICIENT` 409, `RX_NOT_ALLOWED` 403 if pack forbids vendor Rx (OD-VEND-01).

Public customer: `GET /vendors` `GET /vendors/{id}` published projection only.

Admin: `/admin/vendors/{id}/kyc/approve` — `kyc:approve`, ≠ submitter.

---

## 9. Domain: Catalog

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/catalog/medicines` | PLP | public/customer | published |
| GET | `/catalog/products` | | public | |
| GET | `/catalog/items/{id}` | PDP | public | |
| GET | `/catalog/items/{id}/offers` | Geo-ranked offers | JWT/session geo | |
| GET | `/catalog/items/{id}/substitutes` | | | pack |
| GET | `/pharmacies/locations` | Discover stores | public | licensed only |
| GET | `/specialties` | Doctor specialties | public | pack |
| POST | `/admin/catalog/items` | Create master | admin | `catalog:write` |
| POST | `/admin/catalog/items/{id}/publish` | Publish | admin | `catalog:publish` |

**GET offers** query: `lat`, `lng` or `address_id`. Response: `offer_id`, `seller`, `unit_amount_minor`, `currency`, `tax_label`, `rx_required`, `eta_hint`.  
Errors: `UNAVAILABLE_IN_GEO` empty list; never other-country items.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine advertising on PLP.

---

## 10. Domain: Inventory

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/inventory/lots` | List by location | pharmacy/vendor | location | |
| POST | `/inventory/adjustments` | Adjust with reason | JWT | `inventory:adjust` | Yes |
| POST | `/inventory/lots/{id}/quarantine` | | JWT | manager | Yes |
| POST | `/inventory/lots/{id}/recall` | Recall | JWT | manager/compliance | Yes |
| POST | `/inventory/transfers` | Create transfer | pharmacy | | Yes |
| POST | `/inventory/transfers/{id}/ship` | | JWT | | Yes |
| POST | `/inventory/transfers/{id}/receive` | | JWT | | Yes |
| POST | `/inventory/write-offs` | Expiry write-off | JWT | | Yes |
| GET | `/admin/inventory/recalls` | Oversight | admin | ops | |

**POST adjust** request: `lot_id`, `delta_qty` int, `reason_code`. Errors: `NEGATIVE_FORBIDDEN` 422, `REASON_REQUIRED` 400.

Transfers cannot change `country_id`.

---

## 11. Domain: Orders (customer + shared)

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/cart` | | customer | self | |
| POST | `/me/cart/items` | Add | JWT | | merge qty |
| PATCH | `/me/cart/items/{id}` | Qty | JWT | | |
| DELETE | `/me/cart/items/{id}` | | JWT | | |
| POST | `/me/cart/clear` | | JWT | | |
| POST | `/me/checkout/sessions` | Create session | JWT | | **Yes** |
| POST | `/me/checkout/sessions/{id}/children` | Attach | JWT | | |
| POST | `/me/checkout/sessions/{id}/fulfillment` | Address/slot | JWT | | |
| POST | `/me/checkout/sessions/{id}/quote` | Server quote | JWT | | |
| POST | `/me/checkout/sessions/{id}/pay` | Start PaymentIntent | JWT | | **Yes** |
| GET | `/me/checkout/sessions/{id}` | Poll | JWT | | |
| POST | `/me/checkout/sessions/{id}/cancel` | | JWT | | Yes |
| GET | `/me/orders` | | JWT | self | |
| GET | `/me/orders/{id}` | | JWT | self | |
| POST | `/me/orders/{id}/cancel` | Request/policy | JWT | | **Yes** |
| POST | `/me/orders/{id}/reorder` | New cart | JWT | | Yes |
| POST | `/me/returns` | Return request | JWT | | Yes |
| GET | `/me/orders/{id}/tracking` | Tracking DTO | JWT | self | |

**POST `/me/cart/items`**

Request: `offer_id`, `qty`, `prescription_id?`.  
Errors: `CART_SELLER_CONFLICT` 409, `RX_REQUIRED` 422, `OFFER_EXPIRED` 409, `QTY_MAX` 422, `SERVICE_DISABLED` 403.

**POST `/me/checkout/sessions`**

Request: `country_id` (must match JWT), optional `from_cart: true`, optional draft booking ids.  
Response: `id`, `status: DRAFT`, `expires_at`, `children[]`, `amount_minor` maybe 0 until quote.

**POST `.../pay`**

Request: `payment_method_id`, `wallet_amount_minor?`.  
Response: `checkout_status: PENDING_PAYMENT`, `payment_intent` `{ id, status, next_action }`.  
Errors: `QUOTE_STALE` 409, `UNSERVICEABLE_ADDRESS` 422, `HOLD_EXPIRED` 409, `FRAUD_DENY` 403.

**RISK:** Double capture — unique intent per session + idempotency.

Webhooks: none outbound to customer; client polls or WS `checkout.session.updated`.

COD: intent status `AUTHORIZED_COD` analog; order still committed per OD-CUS-02.

---

## 12. Domain: Prescription

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/me/prescriptions` | Create upload case | customer | self | **Yes** |
| POST | `/me/prescriptions/{id}/files` | Attach (presign or multipart) | JWT | self | |
| POST | `/me/prescriptions/{id}/submit` | Submit | JWT | | **Yes** |
| GET | `/me/prescriptions` | History | JWT | self | |
| GET | `/me/prescriptions/{id}` | | JWT | self | |
| POST | `/me/prescriptions/{id}/order` | Map to cart | JWT | | Yes |
| GET | `/pharmacy/rx-cases` | Queue | pharmacist | `prescription:verify` | |
| GET | `/pharmacy/rx-cases/{id}` | Images + OCR suggestions | JWT | pharmacist | |
| POST | `/pharmacy/rx-cases/{id}/verify` | Structured lines | JWT | | **Yes** |
| POST | `/pharmacy/rx-cases/{id}/reject` | | JWT | | Yes |
| POST | `/pharmacy/rx-cases/{id}/need-info` | | JWT | | Yes |
| POST | `/doctor/encounters/{id}/prescriptions` | Draft digital Rx | doctor | encounter | |
| POST | `/doctor/prescriptions/{id}/sign` | Sign | doctor | step-up | **Yes** |
| GET | `/me/digital-rx/{id}` | Customer view signed | customer | self | |

**GET case** for customer: status + reason; **not** OCR internals.

**POST verify** request: `items[]`, `substitutions[]`. Errors: `OCR_NOT_AUTHORITATIVE` N/A; `ALREADY_TERMINAL` 409.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** E-sign, controlled drugs. Unsigned drafts never returned to customer.

Payload reads of images: `HealthPayloadRead` audit.

---

## 13. Domain: Doctor

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/doctors` | Search | public/customer | pack telemedicine |
| GET | `/doctors/{id}` | Public profile | public | published |
| GET | `/doctor/profile` | Own | doctor | self |
| PATCH | `/doctor/profile` | | doctor | self |
| POST | `/doctor/onboarding/submit` | | doctor | self |
| GET | `/doctor/kyc` | | doctor | self |
| GET | `/admin/doctors` | Queue | admin | `kyc:review` |
| POST | `/admin/doctors/{id}/kyc/approve` | | admin | `kyc:approve` SoD |

**GET `/doctors`** query: specialty, locale, consult_mode, `from`/`to` slot hint. **No** “best doctor” clinical ranking.

Errors: `TELEMEDICINE_DISABLED` 403, `NOT_PUBLISHED` 404.

Admin approve: **LEGAL**; dual control OD-CMP-03.

---

## 14. Domain: Appointment

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/doctors/{id}/slots` | List OPEN | customer | | |
| POST | `/me/slots/{id}/hold` | Hold | customer | | **Yes** |
| POST | `/me/appointments` | Draft booking | JWT | | **Yes** |
| GET | `/me/appointments` | | JWT | self | |
| GET | `/me/appointments/{id}` | | JWT | self | |
| POST | `/me/appointments/{id}/cancel` | | JWT | policy | Yes |
| POST | `/me/appointments/{id}/reschedule` | | JWT | | Yes |
| GET | `/doctor/appointments` | Queue | doctor | self | |
| POST | `/doctor/appointments/{id}/complete` | via encounter | doctor | | Yes |
| POST | `/doctor/appointments/{id}/no-show` | | doctor | policy | Yes |
| POST | `/doctor/appointments/{id}/cancel` | | doctor | reason | Yes |

**POST hold** errors: `SLOT_TAKEN` 409, `HOLD_TTL` from pack.

**POST `/me/appointments`** attaches to CheckoutSession child `BOOKING_DOCTOR`. Payment via Checkout.pay.

**LEGAL:** No auto financial penalty until pack (OD-DOC-02).

---

## 15. Domain: Video

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| POST | `/me/appointments/{id}/video/token` | Join token | customer/doctor | participant + window |
| POST | `/video/sessions/{id}/heartbeat` | Presence | participant | |
| POST | `/video/sessions/{id}/quality` | Telemetry | JWT | participant |
| POST | `/video/sessions/{id}/recording/consent` | Grant/deny | JWT | participant |
| POST | `/admin/video/recording/enable` | **Forbidden unless pack** | admin | never default |

**POST token** response: `livekit_url`, `token`, `session_id`, `recording_state: OFF`. Errors: `OUTSIDE_JOIN_WINDOW` 403, `VIDEO_DISABLED` 403, `COMPLETED` 409.

Recording enable: **only** if pack `recording_allowed` AND consents. Default path omitted.

No webhook from LiveKit with clinical body; quality webhooks HMAC if used.

---

## 16. Domain: Lab (bookings)

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/me/lab-bookings` | Draft | customer | `lab_booking:create` | **Yes** |
| POST | `/me/lab-bookings/{id}/collection` | Address/mode | JWT | | |
| GET | `/me/lab-bookings` | | JWT | self | |
| GET | `/me/lab-bookings/{id}` | Status projection | JWT | self | |
| POST | `/me/lab-bookings/{id}/cancel` | | JWT | policy | Yes |
| GET | `/lab/bookings` | Lab portal | lab | org | |
| GET | `/admin/lab-bookings` | Ops | admin | ops | |

Payment via Checkout child `BOOKING_LAB`. Default **no COD** (OD-LAB-16) → `403 COD_NOT_ALLOWED`.

Errors: `FASTING_CONFLICT` 422 (OD-LAB-10), `AGE_RESTRICTED` 422, `PACKAGE_SPLIT_FORBIDDEN` 422, `LABS_DISABLED` 403.

---

## 17. Domain: Test (catalog tests/packages)

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/lab/tests` | PLP | public | labs enabled |
| GET | `/lab/tests/{id}` | PDP + prep | public | |
| GET | `/lab/packages` | | public | |
| GET | `/lab/packages/{id}` | | public | |
| POST | `/lab/offers` | Lab upsert offer | lab | org | Yes |
| POST | `/admin/lab/tests/{id}/publish` | | admin | `catalog:publish` | |

Response includes `prep`, `tat_hours`, `home_eligible` — not cost-plus internals.

---

## 18. Domain: Sample

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/lab-bookings/{id}/sample-view` | Customer timeline **no barcode** | customer | self | |
| POST | `/phlebotomy/jobs/{id}/verify-patient` | Identity | phe | assigned | |
| POST | `/phlebotomy/jobs/{id}/collect` | Create sample | phe | `sample:collect` | **Yes** |
| POST | `/phlebotomy/samples/{id}/seal` | Seal + barcode | phe | | Yes |
| POST | `/logistics/jobs/{id}/scan` | CoC pickup | phe/delivery | job | Yes |
| POST | `/lab/samples/{id}/receive` | Accession | lab_staff | `sample:accession` | **Yes** |
| POST | `/lab/samples/{id}/reject` | | lab_staff | | Yes |
| GET | `/lab/samples/{id}/chain` | CoC | lab/ops | **not support** | |
| GET | `/admin/samples/exceptions` | Queue | admin | ops | |

**POST verify-patient** fail → `COLLECTION_FAILED` `IDENTITY_MISMATCH`; **no** collect UI. Error `IDENTITY_MISMATCH` 422.

**POST receive** mismatch → `BARCODE_MISMATCH` 409; cannot PROCESSING.

Customer sample-view: states mapped to coarse labels; **no** custody actors.

---

## 19. Domain: Report

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/lab/results` | Enter analytes | lab_staff | `result:enter` | Yes |
| POST | `/lab/reports/{id}/send-back` | To processing | pathologist | | Yes |
| POST | `/lab/reports/{id}/approve` | Approve | pathologist | `report:sign` prep | Yes |
| POST | `/lab/reports/{id}/sign` | Sign | pathologist | `report:sign` + SoD | **Yes** |
| POST | `/lab/reports/{id}/release` | Release | system/lab_manager | `report:release` | **Yes** |
| GET | `/me/reports` | List metadata | customer | self | |
| GET | `/me/reports/{id}` | **Payload** | customer | self + audit | |
| GET | `/me/reports/{id}/file` | PDF stream | JWT | self | |
| POST | `/me/reports/{id}/share` | ConsentGrant | JWT | self | Yes |
| POST | `/me/reports/{id}/hard-copy` | PrintRequest + checkout | JWT | pack | **Yes** |
| GET | `/doctor/artifacts/{id}` | Payload | doctor | **grant** | |

**GET payload** always writes `HealthPayloadRead`. Support: `403 CLINICAL_PAYLOAD_DENIED`.

Amendment: `POST /lab/reports/{id}/amend` → new version; notify; do not rewind `DELIVERED_DIGITAL`.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Digital signature validity; panic display.

---

## 20. Domain: Logistics

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/delivery/jobs/offers` | Offers | delivery | capability | |
| POST | `/delivery/jobs/{id}/accept` | | delivery | `job:accept` | **Yes** |
| POST | `/delivery/jobs/{id}/reject` | Offer reject | delivery | | |
| POST | `/delivery/jobs/{id}/arrive-pickup` | | partner | assigned | |
| POST | `/delivery/jobs/{id}/pickup` | Scan | partner | | Yes |
| POST | `/delivery/jobs/{id}/arrive-dropoff` | | partner | | |
| POST | `/delivery/jobs/{id}/otp` | Verify OTP | partner | | |
| POST | `/delivery/jobs/{id}/deliver` | POD | partner | `job:pod` | **Yes** |
| POST | `/delivery/jobs/{id}/fail` | Reason | partner | | Yes |
| POST | `/delivery/presence` | ONLINE/OFFLINE | partner | | |
| GET | `/me/jobs/{id}/tracking` | Minimized | customer | own | |
| GET | `/ws` | WS upgrade tracking | JWT | scoped channel | |
| POST | `/admin/jobs/{id}/reassign` | | admin | dispatcher | Yes |

**POST deliver** request: `otp` or collection identity already passed; `pod_photo_id?`; `cod_collected_minor?`. Errors: `OTP_MISMATCH` 422, `WRONG_JOB_TYPE_OTP` 400.

Webhooks: none from riders; GPS via authenticated POST `/delivery/jobs/{id}/ping` (sampled).

Medicine jobs: rider response **must not** include Rx images.

---

## 21. Domain: Payment

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/payments/methods` | Catalog for country | JWT | pack | |
| GET | `/payments/intents/{id}` | Status | JWT | owner | |
| POST | `/payments/intents/{id}/confirm` | Client complete | JWT | | **Yes** |
| POST | `/payments/intents/{id}/capture` | Delayed capture | system/finance | | **Yes** |
| POST | `/payments/intents/{id}/void` | | | | Yes |
| POST | `/me/refunds` | Customer request | customer | self | **Yes** |
| GET | `/me/refunds` | | JWT | self | |
| POST | `/admin/refunds/{id}/approve` | Dual control | finance | `payment:refund` | **Yes** |
| POST | `/webhooks/payments/{gateway}` | Inbound | HMAC | | provider id |

**GET methods** response: `methods[]` `{ family, gateway_id, min_minor, max_minor, capture_mode }`. Empty → checkout blocked.

**Webhook:** raw body + signature headers. Errors: `401` invalid sig (PSP retries). Duplicate event: `200` no-op.

Never accept PAN JSON. `next_action` may be redirect URL.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** SCA, COD for Rx.

---

## 22. Domain: Wallet

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/wallet` | Balance + holds | customer | self; pack enabled | |
| GET | `/me/wallet/txns` | | JWT | | |
| POST | `/me/wallet/top-ups` | Checkout-like top-up | JWT | pack + step-up | **Yes** |
| POST | `/admin/wallets/{id}/credit` | Manual | finance | dual control | **Yes** |
| POST | `/admin/wallets/{id}/freeze` | | finance/compliance | | Yes |

Errors: `WALLET_DISABLED` 403, `KYC_REQUIRED` 403, `MAX_BALANCE` 422, `CROSS_COUNTRY` 409.

No P2P transfer v1.

---

## 23. Domain: Ledger

**Read-only** in v1 UI. No public customer access.

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/admin/ledger/accounts` | CoA | finance | `ledger:read` |
| GET | `/admin/ledger/entries` | Search | finance | country/entity |
| GET | `/admin/ledger/entries/{id}` | Lines | finance | |
| GET | `/admin/ledger/balances` | | finance | |

**No DELETE. No PATCH lines.** Reverse via posting pipeline only (system).

Errors: `403` support; `404` other country.

Query never returns clinical fields — only money ids.

---

## 24. Domain: Settlement

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/settlements` | Batches | finance | | |
| POST | `/admin/settlements` | Open/preview generate | finance | | **Yes** |
| POST | `/admin/settlements/{id}/approve` | Dual control | finance | `payout:approve` | Yes |
| POST | `/admin/settlements/{id}/execute` | PayoutPort | finance | `settlement:execute` | **Yes** |
| GET | `/vendor/settlements` | Own statements | vendor | org | |
| GET | `/doctor/earnings` | | doctor | self | |
| GET | `/delivery/earnings` | | delivery | self | |

**POST execute** errors: `KYC_INCOMPLETE` 409, `BELOW_MIN` skip line, `PAYOUT_RAIL_FAILED` 502 (batch PARTIAL_FAILED).

Participants **cannot** execute payout.

---

## 25. Domain: Affiliate

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/affiliates/apply` | Apply | JWT | pack | Yes |
| GET | `/affiliates/me` | | affiliate | self | |
| GET | `/affiliates/me/links` | | JWT | | |
| POST | `/me/referrals/attach` | Customer attach code | customer | | Yes |
| GET | `/me/referrals/code` | If pack allows customer share | JWT | | |
| GET | `/affiliates/me/commissions` | | affiliate | | |
| POST | `/admin/affiliates/{id}/approve` | | admin | kyc | Yes |
| POST | `/admin/commissions/{id}/void` | Fraud | admin | | Yes |

**POST attach** errors: `SELF_REFERRAL` 422, `CLINICAL_CATEGORY_BLOCKED` 403, `WINDOW_EXPIRED` 422.

Clinical earn default off — **LEGAL**.

No webhook to affiliates v1; poll.

---

## 26. Domain: CRM

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/admin/crm/customers/{id}/360` | Projection | admin | masked |
| GET | `/admin/crm/segments` | | admin | `campaign:send` or read |
| POST | `/admin/crm/segments` | | admin | |
| POST | `/admin/crm/campaigns` | | admin | `campaign:send` |
| POST | `/admin/crm/campaigns/{id}/send` | Enqueue | admin | pack ads | **Yes** |
| GET | `/admin/crm/leads` | | admin | |

360 **omits** artifact payloads. Campaign send respects marketing opt-in; `403 ADS_DISABLED`.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine ads, electronic marketing.

CRM does not POST order cancel; `POST /admin/crm/tickets/{id}/actions/request-cancel` creates a request.

---

## 27. Domain: Notifications

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/me/notifications` | Inbox | JWT | self |
| POST | `/me/notifications/{id}/read` | | JWT | self |
| PATCH | `/me/preferences` | Channels | JWT | self |
| POST | `/internal/notify` | Not public | service | |

Transactional templates cannot be fully suppressed. Promo requires allow.

WhatsApp: pack `notify.whatsapp` / `services.whatsapp`.

Inbound delivery receipts: adapter webhooks `/webhooks/notify/{provider}` HMAC.

---

## 28. Domain: Support

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| POST | `/me/tickets` | Create | customer | self | Yes |
| GET | `/me/tickets` | | JWT | self | |
| GET | `/me/tickets/{id}` | | JWT | self | |
| POST | `/me/tickets/{id}/messages` | Reply | JWT | | |
| GET | `/admin/tickets` | Inbox | support | `ticket:handle` | |
| POST | `/admin/tickets/{id}/messages` | | support | | |
| POST | `/admin/tickets/{id}/transition` | Status | support | | Yes |
| POST | `/vendor/tickets` | Vendor support | vendor | own orders only | Yes |

Create request: `topic`, `order_id?`, `booking_id?`, `body`. **No** Rx file as ticket attachment (use Rx flow).

Errors: `CLINICAL_PAYLOAD_DENIED` if agent requests artifact bytes.

States: [15](15_CRM_PLATFORM.md) §9.

---

## 29. Domain: Search

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/search/suggest` | Typeahead | public/JWT | country indexes |
| GET | `/search` | Query | public/JWT | |
| POST | `/search/click` | Analytics | JWT optional | |

Query: `q`, `types[]` (`medicine`,`product`,`test`,`package`,`doctor`,`pharmacy`,`vendor`), geo.  
Response: hits metadata; **no** lab values, no Rx images.

Errors: `timeout` 503; **never** other-country hits.

Indexing: internal workers, not public write API.

---

## 30. Domain: Analytics

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/admin/analytics/kpis` | Dashboard widgets | admin | `analytics:read` |
| GET | `/admin/analytics/reports/{name}` | Named report | admin | scope |
| POST | `/admin/analytics/exports` | Job | admin | | Yes |
| POST | `/events` | Client funnel (restricted schema) | JWT | allow-list event names |

**Forbidden** in warehouse/API: Rx bytes, PAN, analyte values.

`analyst` role: read; no PII reveal.

---

## 31. Domain: Compliance

| Method | Path | Purpose | Authn | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- |
| GET | `/policy-packs/current` | **Safe subset** for clients | JWT/public | country | |
| GET | `/admin/policy-packs` | Versions | admin | | |
| POST | `/admin/policy-packs` | Draft | super_admin | | |
| POST | `/admin/policy-packs/{id}/publish` | Publish | super_admin + legal_signoff for REGULATED | dual | **Yes** |
| GET | `/admin/kyc-cases` | Queue | admin | `kyc:review` | |
| GET | `/admin/kyc-cases/{id}` | | admin | | |
| POST | `/admin/kyc-cases/{id}/approve` | | admin | `kyc:approve` SoD | **Yes** |
| POST | `/admin/kyc-cases/{id}/reject` | | admin | | Yes |
| POST | `/admin/legal-holds` | Set hold | compliance | `hold:write` | Yes |
| POST | `/admin/legal-holds/{id}/release` | Dual | compliance | OD-CMP-06 | Yes |
| POST | `/admin/audit/exports` | Export job | compliance | `audit:read` | **Yes** |
| GET | `/admin/audit/logs` | Search | compliance/super | | |
| GET | `/me/consents` | Grants | customer | self | |
| POST | `/me/consents` | Grant | customer | self | Yes |
| POST | `/me/consents/{id}/revoke` | | customer | self | Yes |

**GET `/policy-packs/current`** returns enabled_services, locales, methods **without** secrets, unreleased legal drafts, or KYC document templates that leak process internals **OD-API-04**.

**POST approve KYC:** errors `SOD_VIOLATION` 403, `DOCUMENTS_MISSING` 422, `DUAL_CONTROL_INCOMPLETE` 409.

**POST legal-holds** request: `scope_type`, `scope_id`, `reason_code`, `ticket_id`. Erase jobs skip.

Audit export: `202` job; download `GET /admin/audit/exports/{id}/file` time-boxed. Dual control OD-CMP-08.

Break-glass: `POST /admin/health/break-glass` — super_admin, ticket, TTL; creates grant purpose `break_glass`.

---

## 32. Chat (consult; under care)

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/appointments/{id}/chat` | Messages | participant | |
| POST | `/appointments/{id}/chat` | Send | participant | window | Yes client_message_id |
| WS | `/ws/chat/{appointment_id}` | | JWT | |

Support cannot subscribe. Retention OD-VID-05 / pack.

---

## 33. Health (customer EHR)

| Method | Path | Purpose | Authn | Authz |
| --- | --- | --- | --- | --- |
| GET | `/me/health/artifacts` | Metadata list | customer | self |
| GET | `/me/health/artifacts/{id}` | Payload | JWT | self + audit |
| POST | `/me/health/artifacts` | Customer upload | JWT | pack | Yes |
| GET | `/me/health/timeline` | | JWT | self | |
| GET | `/me/health/export` | Redirect to export job | JWT | pack | Yes |

Doctors: only `/doctor/artifacts/{id}` with grant — §19.

---

## 34. Error code catalog (selected)

| Code | HTTP | Domain |
| --- | --- | --- |
| `CART_SELLER_CONFLICT` | 409 | Orders |
| `QUOTE_STALE` | 409 | Checkout |
| `SLOT_TAKEN` | 409 | Appointment |
| `IDEMPOTENCY_CONFLICT` | 409 | Money |
| `SERVICE_DISABLED` | 403 | Pack |
| `COUNTRY_MISMATCH` | 409 | I18n |
| `CLINICAL_PAYLOAD_DENIED` | 403 | Health/CRM |
| `CONSENT_INACTIVE` | 403 | Health |
| `IDENTITY_MISMATCH` | 422 | Sample |
| `BARCODE_MISMATCH` | 409 | Sample |
| `SOD_VIOLATION` | 403 | KYC/report |
| `WALLET_DISABLED` | 403 | Wallet |
| `LEGAL_HOLD` | 409 | Deletion |
| `VENDOR_SLA_TIMEOUT` | 409 | Vendor |
| `PAYMENT_REQUIRES_ACTION` | 200/402 | Payment (intent status) |

`402` **OPEN DECISION (OD-API-05):** use 409/422 vs 402 for payment required. Recommendation: **200 with intent.status** plus Problem only on hard fail.

---

## 35. Realtime

| Channel | Authz |
| --- | --- |
| `order.{id}` | buyer, fulfilling org, ops |
| `job.{id}` | customer minimized, partner, dispatcher |
| `appointment.{id}.chat` | participants |
| `checkout.{id}` | owner |

SSE allowed for admin queues ([04](04_APPLICATION_ARCHITECTURE.md)).

---

## 36. Implementation notes

1. Nest versioning `v1`; Problem filter maps domain errors → `code`.
2. Guards: `JwtAudGuard`, `MembershipGuard`, `PermissionGuard`, `CountryGuard`, `ConsentGuard`.
3. Money interceptors reject non-integer `amount_minor`.
4. OpenAPI generated from DTO classes **after** this contract; this file wins on conflict until updated.
5. No country ISO hardcoded in controllers.

---

## 37. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-API-01 | Customer JWT on admin | `aud` |
| R-API-02 | Consent in JWT only | Reload grants |
| R-API-03 | Double pay | Idempotency + intent uniqueness |
| R-API-04 | IDOR vendor | org from membership |
| R-API-05 | Tracking PII over WS | Minimize DTO |
| R-API-06 | Webhook without sig | Reject |

---

## 38. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-API-01 | Idempotency TTL | 72h money / 24h booking |
| OD-API-02 | Partner outbound webhooks | Not v1 |
| OD-API-03 | `/me` vs nested customer id | `/me` |
| OD-API-04 | How much pack JSON is public | Safe subset only |
| OD-API-05 | HTTP 402 vs 200+status for pay | 200 + intent |
| OD-API-06 | GraphQL | No v1 |
| OD-API-07 | BFF per app | No v1; single API |
| OD-API-08 | ETag vs body version | `version` field + If-Match on slots/stock |
| OD-API-09 | Public catalog without country header | Require country (geo or explicit) |
| OD-API-10 | File upload presign vs API proxy | Presign PUT + complete callback |
