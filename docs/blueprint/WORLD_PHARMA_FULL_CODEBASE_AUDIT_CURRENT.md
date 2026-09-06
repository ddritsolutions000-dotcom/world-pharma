# World-Pharma — Full Codebase Audit (Current, post-S140)

**Date:** 2026-09-05  
**Scope:** Entire current repository through Sprint 140  
**Mode:** AUDIT ONLY — no code, schema, test, or product changes  
**Method:** Inventory + call-chain tracing of runtime modules. Sprint reports used only as file pointers, never as proof of completeness.  
**Launch verdict:** `CAN_PRODUCTION_LAUNCH = NO`

This document supersedes prior percentage snapshots (69% / 53% / 4% and similar) for **current-state scoring**. Historical sprint books remain valid as history.

---

## 1. Executive Summary

World-Pharma is a **large, working sandbox healthcare commerce platform**: NestJS API (`apps/api`), Prisma/Postgres kernel (`packages/database`), Redis, 13 Next.js web apps, 6 Expo/RN apps, and a dense Admin control plane.

**What is real in sandbox:** identity/OTP-HMAC, country policy packs, catalog/cart/checkout, mock PSP → order create, vendor pick/pack, mock carrier + rider POD, ledger/settlement **records**, doctor appointments/consent/prescriptions, lab booking→accession→report→health artifact, imaging booking→study→sandbox ingest→report, partner join/KYC document store, CMS/CRM/support, Admin launch/provider cards.

**What is not production:** there is **no live PSP adapter**, **no SMS/email provider adapter**, **no live carrier adapter**, **no LiveKit/eRx/PACS/KYC/S3/KMS/AV SDK**. Production env flags **fail-closed** (`assertProduction*` always blocks initiation when `*_ENVIRONMENT=production`). Closures S132–S140 are **authoritative reports + fail-closed hooks**, not live rails.

**Highest operational risk:** default `PAYMENT_ENVIRONMENT` / `COMMUNICATION_ENVIRONMENT` / logistics/storage envs are **sandbox**. A host with `NODE_ENV=production` that leaves those unset still runs **mock money + console OTP + mock carrier**. Production-*mode* cannot use mocks; a production *host* can, if env is left at sandbox.

**Do not rebuild:** identity kernel, Prisma domain model, cart/order/fulfillment state machines, Admin permission shells, customer web commerce/health surfaces, partner join engine, fail-closed activation-path pattern.

---

## 2. Repository Inventory

### 2.1 Top level (current)

| Area | Current reality |
| --- | --- |
| Package manager | pnpm 10.15.1, Nx 23.1.1, Node 22 (`package.json`) |
| Apps | 20 Nx projects with `project.json` + extra dirs under `apps/` |
| Packages | 6: `config`, `database`, `shared`, `shell-core`, `shell-web`, `ui-kit` |
| Docs | `docs/` (~416 files); `docs/blueprint/` **322** files (contract + sprint log + this audit) |
| Scripts | `scripts/` CI, backup, provider-verify, S129/S130 mobile, many `s5x-ensure-*-fixtures.ts` |
| Infra | `docker-compose.yml` (Postgres 16, Redis 7, optional API profile), `Dockerfile`, `infra/postgres/pg_hba.conf` only |
| CI | `.github/workflows/ci.yml` (single `validate` job) |
| Tests | **551** `*.spec.*` / `*.test.*` files repo-wide; API **321** specs; Playwright **93** `s*.spec.ts` under `apps/web-customer/src/__tests__` only |
| Seed | `apps/api/src/dev/dev-sandbox.seed.service.ts`, `dev-transactional.seed.service.ts`, `scripts/s52-…s61-…` |
| Root debris | `tmp-otp-*.json`, `tmp-cookies*.txt`, `s39-e2e-results.txt`, `.audit-api-run.log` — **not product**; leftover probe artifacts |

### 2.2 Apps (actual)

| Path | Role | Classification |
| --- | --- | --- |
| `apps/api` | NestJS kernel | **ACTIVE** |
| `apps/web-customer` | Customer Next.js (79 `page.tsx`) | **ACTIVE** |
| `apps/web-admin` | Admin Next.js (82 `page.tsx`) | **ACTIVE** |
| `apps/web-vendor` | Vendor portal | **ACTIVE** |
| `apps/web-doctor` | Doctor portal | **ACTIVE** |
| `apps/web-lab` | Lab SPA shell | **ACTIVE** |
| `apps/web-radiology` | Imaging org SPA | **ACTIVE** |
| `apps/web-radiologist` | Radiologist SPA | **ACTIVE** |
| `apps/web-pathologist` | Pathologist SPA | **ACTIVE** |
| `apps/web-store` | Pharmacy store ops SPA | **ACTIVE** |
| `apps/web-join` | Partner join | **ACTIVE** |
| `apps/web-affiliate` | Affiliate portal | **ACTIVE** |
| `apps/web-logistics` | Logistics desk SPA | **ACTIVE** |
| `apps/ds-web` | UI-kit playground (port 3100) | **NON-PRODUCT** |
| `apps/mobile` | Customer Expo | **ACTIVE** |
| `apps/mobile-store` | Pharmacy/store staff Expo | **ACTIVE** |
| `apps/mobile-doctor` | Doctor Expo | **ACTIVE** |
| `apps/mobile-lab` | Lab staff Expo | **ACTIVE** |
| `apps/mobile-phlebotomist` | Phlebotomist Expo | **ACTIVE** |
| `apps/mobile-delivery` | Rider Expo | **ACTIVE** |
| `apps/mobile-affiliate` | — | **MISSING** (does not exist) |
| `apps/test-results` | Sprint screenshots/APK copies | **ARTIFACTS** |

### 2.3 Packages

| Package | Purpose | Status |
| --- | --- | --- |
| `packages/database` | Prisma schema + 187 migrations | **ACTIVE** |
| `packages/config` | Zod env parse (`parseEnv`) | **ACTIVE** |
| `packages/shared` | Policy types, identifiers, join/CMS blocks | **ACTIVE** |
| `packages/shell-core` | Session/OTP HTTP client for mobile | **ACTIVE** |
| `packages/shell-web` | Web session/API helpers | **ACTIVE** |
| `packages/ui-kit` | Shared UI | **ACTIVE** |

### 2.4 API modules (`apps/api/src`, imported from `app.module.ts`)

Identity, policy, partner, catalog, lab, radiology, health, care-nav, cms, crm, promo, affiliate, wishlist, medication-reminder, family-member, loyalty, care-plan, speciality-care, corporate-wellness, health-packages, store-locator, reviews, personalization, search, discovery, recommendations, analytics, inventory, cart, payment, orders, logistics, finance, clinical, healthcare, store, delivery, governance, platform, events, security, metrics.

**Controllers:** **146** `*.controller.ts`. Global prefix `api/v1` (`apps/api/src/common/http-setup.ts`).

### 2.5 Database counts (current `schema.prisma`)

| Metric | Count |
| --- | --- |
| Models | **264** |
| Enums | **162** |
| `@@index` | **336** |
| `@unique` / `@@unique` | **197** |
| Migration directories | **187** |

Last model in schema: `AnalyticsIngestCursor`. No `DROP TABLE` / `DROP COLUMN` found in migration SQL (grep). Destructive-data migrations: **not observed** in SQL text search.

### 2.6 Duplicate / obsolete / conflicting (inventory view)

| Item | Verdict |
| --- | --- |
| Layered `*-first-onboarding.ts` + `*-real-activation-first-onboarding.ts` + `*-activation-preparation.ts` + `*-production-activation-path.ts` + `*-workflow-closure.ts` | **ACTIVE duplicates** of *reporting*, not parallel runtimes. Wired through `admin-control-plane.service.ts` and Admin Provider/Launch cards. |
| `MockPaymentGatewayAdapter` vs S132 “production path” | **Not conflicting runtimes** — path always `production_payment: BLOCKED`; mock is the only `PaymentGatewayPort` impl. |
| `ds-web` | Abandoned as product; kept as design playground. |
| Sprint fixture scripts `scripts/s55-…s61-…` | Dev-only; not imported by API runtime. |
| Root `tmp-*` OTP/cookie dumps | Obsolete local probes; **not referenced** by apps. |

---

## 3. Architecture (traced, not documented)

### 3.1 Commerce: Customer → API → DB → vendor → fulfillment → logistics → settlement

```
web-customer / mobile
  → CartController / PaymentController / OrderCustomerController
  → PaymentService.createAndSubmit (assertSandboxOnlyRuntime + assertProductionPspInitiationAllowed)
  → PaymentGatewayRegistry → MockPaymentGatewayAdapter.submit
  → PaymentService.applyStatus CAPTURED
  → OrderService.createFromPayment (assertEligiblePayment: CAPTURED | AUTHORIZED_COD)
  → FulfillmentGroup / PickTask / PackTask (OrderService vendor paths)
  → LogisticsService.requestBooking → MockCarrierAdapter
  → DeliveryController rider OTP/POD
  → FinanceModule VendorPayable / SettlementBatch (sandbox ledger postings)
```

**Evidence:** `apps/api/src/payment/payment.service.ts`, `mock.adapter.ts`, `gateway.registry.ts`, `apps/api/src/orders/order.service.ts`, `apps/api/src/logistics/logistics.service.ts`, `logistics.module.ts` (`CarrierPort` → `MockCarrierAdapter`), `apps/api/src/delivery/delivery.service.ts`, `apps/api/src/finance/`.

### 3.2 Clinical: Customer → doctor → consultation → prescription → eRx → medicine

```
CustomerAppointmentController → AppointmentService
  → ConsentGrant / ClinicalAccessService
  → Encounter / VideoService (sandbox; production join gated)
  → PrescriptionService → PrescriptionErxSubmission / ErxSubmissionService
  → RxCommerceHandoff / Order (medicine) when commerce handoff used
```

**Evidence:** `apps/api/src/clinical/*`, `erx-production-activation-path.ts`, `video-production-activation-path.ts`, `doctor-consultation-erx-production-workflow-closure.ts`.  
**ISSUED ≠ LEGALLY_TRANSMITTED** (S137). Production eRx transmit **fail-closed**.

### 3.3 Lab: Customer → lab → booking → sample → processing → report → health record

```
CustomerLabBookingController → LabBookingService
  → LabSample / LabSampleCocEvent / LabAccession / LabProcessing
  → LabReport / LabReportVersion (DRAFT vs PUBLISHED)
  → HealthArtifact
```

**Evidence:** `apps/api/src/lab/lab-booking.service.ts`, `pathology.service.ts`, `lab-partner-production-workflow-closure.ts`. HL7/FHIR live adapters **MISSING**.

### 3.4 Imaging: Customer → imaging → study → PACS/DICOM → radiology → report → health record

```
CustomerImagingBookingController → ImagingBookingService
  → ImagingStudy / ImagingAcquisition / ImagingStudyInstance
  → ImagingIngestService (assertProductionPacsIngestAllowed)
  → ImagingReport → HealthArtifact
```

**Evidence:** `apps/api/src/radiology/*`, `pacs-production-activation-path.ts`, `imaging-pacs-dicom-production-workflow-closure.ts`.  
**REPORT ≠ DIAGNOSTIC VIEWER** — no production DICOM viewer app.

### 3.5 Admin: control plane → partners → catalog → orders → payments → logistics → clinical → finance → configuration

```
web-admin pages → /api/v1/admin/*
  JwtAuthGuard + AudienceGuard(admin) + PermissionsGuard
  AdminControlPlaneService evaluates S128–S140 path/closure reports
  Provider-activation + launch-readiness UIs consume those JSON reports
```

**Evidence:** `apps/api/src/platform/admin-control-plane.service.ts` (imports `evaluatePspPaymentProductionActivationPath`, `evaluateCarrierLogisticsProductionActivationPath`, `evaluatePrivateStorageKmsMalwareProductionActivationPath`, workflow closures), `apps/web-admin/src/provider-activation-admin.tsx`, `production-launch-control-admin.tsx`.

---

## 4. Feature Matrix

Legend: **IMPLEMENTED** = real API + persistence in sandbox; **PARTIALLY_IMPLEMENTED** = core path exists with material gaps; **PLACEHOLDER** = UI/report without runtime; **MOCK_ONLY** = only fake provider; **EXTERNAL_GATED** = software exists, live vendor required; **MISSING**; **DEAD_CODE**; **BROKEN**.

### 4.1 Customer

| Capability | Status | Evidence |
| --- | --- | --- |
| Registration / login | IMPLEMENTED | `identity/auth.service.ts` OTP register/verify, sessions, cookies `wp_at`/`wp_rt` |
| OTP | MOCK_ONLY + EXTERNAL_GATED | `ConsoleOtpAdapter` in `identity.module.ts`; S133 `otp-messaging-production-activation-path.ts` |
| Profile | IMPLEMENTED | `me` + health profile controllers |
| Family | IMPLEMENTED | `family-member.controller.ts`, `CustomerFamilyMember` |
| Address | IMPLEMENTED | `CustomerAddress` + account addresses page |
| Discovery / search / categories / PDP | IMPLEMENTED | `catalog/customer.controller.ts`, `search`, `discovery`, `web-customer/app/p/[slug]`, `/search`, `/categories` |
| Cart / checkout / orders / reorder | IMPLEMENTED (sandbox pay) | `cart.controller.ts`, checkout page, `buy-again` |
| Wishlist | IMPLEMENTED | `wishlist` module + `/wishlist` |
| Offers / promo | IMPLEMENTED | `promo` + `PromoCampaign` |
| Subscriptions (Rx) | PARTIALLY_IMPLEMENTED | `RxSubscription` + `refill.service.ts`; auto-execute **policy-gated OFF** by default |
| Health records | IMPLEMENTED | `health-artifact.service.ts`, `/health` |
| Medicine reminders | IMPLEMENTED | `medication-reminder` |
| Lab / doctor / imaging / consult / Rx | IMPLEMENTED (sandbox clinical) | customer lab/radiology/appointments/prescriptions pages |
| Notifications | PARTIALLY_IMPLEMENTED | in-app + `NotificationCountryProvider`; production SMS/email **EXTERNAL_GATED** |
| Support | IMPLEMENTED | `SupportTicket` + `/account/support` |
| Payments | MOCK_ONLY + EXTERNAL_GATED | `MockPaymentGatewayAdapter`; S132 path BLOCKED |

### 4.2 Vendor / pharmacy

| Capability | Status | Evidence |
| --- | --- | --- |
| Onboarding / KYC/KYB / org / team | IMPLEMENTED (docs local-store) | `join.controller.ts`, `kyc.service.ts`, `vendor-team.controller.ts`; live KYC vendor **EXTERNAL_GATED** |
| Catalog / inventory | IMPLEMENTED | `catalog/vendor.controller.ts`, `inventory` |
| Accept / pick / pack / RTS | IMPLEMENTED | `orders/vendor.controller.ts`, `order.service.ts` |
| Returns | IMPLEMENTED | `vendor-returns.controller.ts`, `ReturnRequest` |
| Settlement / statements | PARTIALLY_IMPLEMENTED | vendor finance read + `VendorPayable`; live payout **EXTERNAL_GATED** (`affiliate-payout-first-onboarding.ts` pattern) |
| Suspension | IMPLEMENTED | `PartnerStatus` + S135 fulfillment fail-closed on non-ACTIVE |

### 4.3 Doctor

| Capability | Status | Evidence |
| --- | --- | --- |
| Onboarding / verification / profile / availability | IMPLEMENTED | `DoctorProfile`, credentials, windows, join |
| Appointments / consent / consultation | IMPLEMENTED | appointment + consent services |
| Prescription / eRx | PARTIALLY_IMPLEMENTED | structured Rx **IMPLEMENTED**; legal eRx **EXTERNAL_GATED** (`erx-production-activation-path.ts`) |
| Health record | IMPLEMENTED | consent-gated `HealthArtifactService` |
| Notifications | PARTIALLY_IMPLEMENTED | same comms gate as customer |
| Live video | MOCK_ONLY / EXTERNAL_GATED | `video.service.ts` + `assertProductionVideoSessionAllowed` |

### 4.4 Lab

| Capability | Status | Evidence |
| --- | --- | --- |
| Onboarding / catalog / packages / booking / family | IMPLEMENTED | lab + health-packages + family on booking |
| Accession / sample / CoC / processing / pathology / report / publish | IMPLEMENTED | lab sample/report models + pathology |
| Health record | IMPLEMENTED | published report → artifact |
| Settlement | PARTIALLY_IMPLEMENTED | same finance kernel; live payout gated |
| Production partner activation | EXTERNAL_GATED | `lab-partner-onboarding-activation-preparation.ts` / S136 closure |

### 4.5 Imaging / radiology

| Capability | Status | Evidence |
| --- | --- | --- |
| Partner onboarding / booking / accession / study | IMPLEMENTED | imaging booking/study models |
| DICOM / PACS | MOCK_ONLY + EXTERNAL_GATED | sandbox ingest; `assertProductionPacsIngestAllowed` |
| Worklist / radiologist / report | IMPLEMENTED | `radiologist.controller.ts`, `ImagingReport` |
| Viewer | MISSING / PLACEHOLDER | S139: report ≠ diagnostic viewer; portals state PACS viewer unavailable |
| Health record | IMPLEMENTED | report → artifact |

### 4.6 Delivery

| Capability | Status | Evidence |
| --- | --- | --- |
| Rider / assignment / pickup / tracking / delivery / POD / fail / RTO | IMPLEMENTED in **sandbox** | `delivery.service.ts`, `SANDBOX_DELIVERY_OTP` in `logistics/sandbox-otp.ts` |
| Live carrier | MOCK_ONLY + EXTERNAL_GATED | `MockCarrierAdapter` only |

### 4.7 Affiliate

| Capability | Status | Evidence |
| --- | --- | --- |
| Acquisition / attribution / commission / portal | IMPLEMENTED (sandbox) | `affiliate` module, `web-affiliate`, `AffiliateReferralCode` |
| Settlement / payout | PARTIALLY_IMPLEMENTED | `AffiliateLiability`; live wallet/bank **EXTERNAL_GATED** |
| Affiliate mobile | MISSING | no `apps/mobile-affiliate` |

### 4.8 Admin

| Capability | Status | Evidence |
| --- | --- | --- |
| Users/staff, customers, vendors, doctors, labs, imaging, delivery, affiliates | IMPLEMENTED | corresponding `web-admin/app/*` + admin controllers |
| Catalog / orders / payments / settlements / KYC / country policies | IMPLEMENTED (payments mock) | admin pages + finance/payment admin |
| Provider activation / launch controls | IMPLEMENTED as **readiness inventory** | does not enable live rails |
| Notifications / CMS / CRM / marketing / support / SEO | IMPLEMENTED | CMS, CRM, `web-admin/app/seo`, support |
| Production launch | EXTERNAL_GATED | Launch UI reports BLOCKED; `can_production_launch: NO` |

---

## 5. Real vs Mock Matrix

| Surface | Runtime impl | Env gate | Classification |
| --- | --- | --- | --- |
| Card/UPI pay | `MockPaymentGatewayAdapter` (`payment/mock.adapter.ts`); default scenario **captured** | `PAYMENT_ENVIRONMENT`; S132 `assertProductionPspInitiationAllowed` always throws in production | **SAFE SANDBOX-ONLY** if env=production; **PRODUCTION RISK** if sandbox left on live host |
| Webhooks pay | `SandboxWebhookAdapter` | production webhook assert always throws | **SAFE FAIL-CLOSED** in production mode |
| Client “I paid” | `evaluateClientForgedPaymentSuccess` → rejected; orders need server CAPTURED | — | **SAFE FAIL-CLOSED** |
| Checkout token | hardcoded `tok_sandbox` in `payment.service.ts` | sandbox | **SAFE SANDBOX-ONLY** |
| OTP SMS | `ConsoleOtpAdapter` only | S133 production initiation always throws | **SAFE FAIL-CLOSED** in production mode; **PRODUCTION RISK** sandbox default |
| Delivery OTP | `SANDBOX_DELIVERY_OTP = '123456'` | sandbox | **SAFE SANDBOX-ONLY** |
| Carrier | `MockCarrierAdapter` (`logistics.module.ts`) | S134 shipment/webhook asserts | **SAFE SANDBOX-ONLY** / **SAFE FAIL-CLOSED** in production mode |
| Video | sandbox session path | `assertProductionVideoSessionAllowed` | **SAFE FAIL-CLOSED** in production |
| PACS | sandbox ingest | `assertProductionPacsIngestAllowed` | **SAFE FAIL-CLOSED** in production |
| KYC vendor | local object store + review workflow | KYC onboarding reports EXTERNAL_GATED | **SAFE SANDBOX-ONLY**; not a live bureau |
| eRx network | sandbox adapter / submission rows | `assertProductionErxTransmissionAllowed` | **SAFE FAIL-CLOSED** |
| Object storage | `LocalPrivateObjectStore` `var/private-objects` | S140 `assertProductionPrivateStorageAllowed` | **SAFE FAIL-CLOSED** in production |
| Malware | `AllowAllMalwareScanner` default; optional `DeterministicSandboxMalwareScanner` | S140 scan assert | **PRODUCTION RISK** if sandbox scanner treated as AV; **SAFE FAIL-CLOSED** if scan env=production |
| CMS malware | CMS wires `AllowAllMalwareScanner` separately | marketing assets | **SAFE SANDBOX** for public CMS; not PHI store |
| Seed fixtures | `DevSandboxSeedService` in `AppModule` | dev | **SAFE DEV-ONLY** if not enabled in prod boot; confirm env before deploy |
| `completeSandboxUpi` | `payment.service.ts` | `assertSandboxOnlyRuntime` | **SAFE SANDBOX-ONLY** |

**Env check caveat:** gates key off domain envs (`PAYMENT_ENVIRONMENT`, `COMMUNICATION_ENVIRONMENT`, `LOGISTICS_ENVIRONMENT`, `OBJECT_STORAGE_ENVIRONMENT`, …), **not** `NODE_ENV`. `packages/config` does **not** require those payment vars. Mis-set sandbox on a production VM is the real bypass of “we have production-ready functions.”

---

## 6. Database Audit

**Schema:** `packages/database/prisma/schema.prisma` (generator `prisma-client-js`, Postgres `DATABASE_URL`).

### 6.1 Strengths

- Country-centric: `Country` has `defaultCurrency`, `defaultTimezone`, `defaultLocale`, `publishedPolicyPackId`, `productionLifecycle` (not conflated with sandbox `CountryStatus`).
- Soft-ish person lifecycle: `PersonStatus.PENDING_DELETION`.
- Audit-ish: `*StatusHistory`, `ClinicalAccessAudit`, `HealthArtifactAccessAudit`, `CmsContentAudit`, `SecurityEvent`.
- Tenant: `Membership.countryId` / `organizationId`; RLS migrations exist (e.g. imaging/PACS, family, reminders).
- Idempotency table: `IdempotencyRecord`.
- Finance: journal + vendor payable + settlement import worker models (R14-B sandbox).

### 6.2 Risks / issues (no schema changes made)

| Finding | Classification |
| --- | --- |
| `R14AHumanGate` / `R14AHumanGateRevision` live in **global** schema | Sprint-specific but **ACTIVE** (payment live gates). Not India-specific. |
| No stored-value `Wallet` model | Wallet is policy/payment-method language, not a ledger wallet product — **MISSING** as 1mg-style wallet |
| `RxSubscription` exists; auto-execute policy default off | Race if auto-execute later enabled without job locking — **race-condition risk** if turned on |
| Inventory reservations + checkout | Concurrent checkout depends on reservation rows (`InventoryReservation`) — design exists; not independently load-tested in this audit |
| Nullable `productionActivatedById` etc. | Expected until activation; not a bug |
| Duplicate conceptual “readiness” : `CountryReadinessGate` + `ProductionDependency` + R14A + S100–S140 report objects | Parallel **control-plane** models; not duplicate transactional orders |
| Unused models | Not proven unused without reference graph; do **not** delete. Search-index + analytics tables are written by jobs. |

### 6.3 Migrations

187 directories under `packages/database/prisma/migrations/`. CI runs `scripts/ci/check-migrations.mjs` then `prisma migrate deploy`. No `DROP TABLE`/`DROP COLUMN` matches in SQL. **Development-only assumption:** compose defaults user/password `worldpharma` (`docker-compose.yml`) — **CONFIG_REQUIRED** for real deploy.

---

## 7. API Audit

**Authn:** `JwtAuthGuard` — Bearer or `wp_at` cookie; session ACTIVE + tokenVersion (`apps/api/src/identity/`).  
**Authz:** `AudienceGuard`, `PermissionsGuard` (admin); partner routes use org/partner asserts.  
**Tenant:** `TenantContextInterceptor` + Postgres GUCs.  
**Validation:** mix of typed DTOs and `Record<string, unknown>` with service-side allowlists (mass-assignment residual).  
**Idempotency:** payment pay paths use `IdempotencyRecord` (`PaymentService.withIdempotency`).  
**Rate limit:** Redis, fail-closed 503 on OTP, pay, webhooks, uploads — **not** global middleware (`http-setup.ts` + per-service).  
**Errors:** `Errors.problem` RFC-style.  
**Helmet / CORS / cookie flags:** `configureApi` in `http-setup.ts`; CORS empty in prod unless `CORS_ALLOWED_ORIGINS`.  
**Logging:** structured ops reports; OTP must not log codes in production (`AUTH_DEV_REVEAL_OTP` boot-fails with `NODE_ENV=production` via `packages/config`).  
**Production behavior:** domain `assertProduction*` hooks.

### 7.1 Security findings (concrete)

| ID | Behavior | Class |
| --- | --- | --- |
| Audience mint | `AuthService` OTP verify: client may set `audience: 'doctor' \| 'partner_applicant'` without role proof; only `admin` is company-role gated (`auth.service.ts` ~300–316) | **privilege / portal confusion** — PHI still gated by ACTIVE doctor + consent on clinical reads |
| Vendor RBAC | `assertVendorSellerAccess` = ACTIVE membership, not `order:fulfill` permission (`catalog/access.ts` + `OrderVendorController`) | **privilege escalation within org** (org_staff can fulfill) |
| Guest track | `OrderPublicController` / `OrderService.trackPublic` — knowledge factor | **intentional Low** disclosure |
| Payment forge | Status from gateway/`applyStatus`, not client field | **not vulnerable** as traced |
| Shipment forge | Customer/vendor shipment APIs read-only; webhooks signed; production ingest blocked | **not vulnerable** in production mode |
| IDOR sample | `OrderService.getMine`, `PaymentService.requireOwner`, Rx/lab/imaging ownership, `KycService.assertCan` | **generally protected** |
| SSRF / path traversal | `url-safety.spec.ts` (S115); object store `assertSafeObjectKey` | hardening present; not a full pentest |
| Secrets | CI gitleaks; do not commit `.env` | process **CODE_COMPLETE**; live vault **MISSING** |

---

## 8. Auth / Authz Audit

| Role | Token / membership | Surfaces | Gap |
| --- | --- | --- | --- |
| Customer | `JwtAudience.customer` | `/me/*`, cart, pay, health | — |
| Partner applicant | client-chosen audience | `/join`, some partner APIs | audience too easy to mint |
| Vendor / staff | membership on VENDOR org | `/vendor/*` | permission codes not enforced on fulfill |
| Doctor | `JwtAudience.doctor` + `Partner` DOCTOR | `/doctor/*` | audience mint vs partner row |
| Lab / radiology staff | LAB / imaging org membership | `/lab/*`, `/radiology/*` | same membership pattern |
| Pathologist / radiologist | specialist controllers | worklists | thin UIs, API-backed |
| Delivery | DELIVERY_PARTNER / LOGISTICS_FLEET + assignee | `/delivery/*` | sandbox OTP |
| Affiliate | customer self + admin | `/me/affiliate`, admin affiliate | no mobile |
| Admin / super | `audience=admin` + company roles (`super_admin`, `global_admin`, … in RBAC catalog) | `/admin/*` | Admin PHI metadata lists (appointments/Rx IDs) with `*:read` |

---

## 9. Payment

```
Checkout pay → PaymentService.payCheckout
  → createAndSubmit
  → assertPaymentSubmitAllowed / assertSandboxOnlyRuntime
  → assertProductionPspInitiationAllowed   // no-op unless PAYMENT_ENVIRONMENT=production; then ALWAYS throw
  → Mock adapter submit → applyStatus
  → OrderService.createFromPayment
Webhook: PaymentWebhookController → ingestWebhook (sandbox HMAC)
Refund: PaymentRefundListenerService → mock gateway.refund
```

| Question | Answer |
| --- | --- |
| LIVE-CAPABLE? | **No.** No Stripe/Razorpay/Adyen class. Registry codes `MOCK`, `MOCK_PRIMARY`, `MOCK_FALLBACK`, `MOCK_SECONDARY` (`gateway.registry.ts`). |
| SANDBOX? | **Yes** — only working rail. |
| MOCK? | **Yes** — `mock.adapter.ts`. |
| EXTERNAL_GATED? | **Yes** — S128 control + S132 path + R14A human gates (`r14a-gate.ts`). |
| Production mock? | **Blocked** when `PAYMENT_ENVIRONMENT=production`. **Not blocked** when unset (defaults sandbox). |
| Seeded gateways | `environment: 'sandbox'` in seed |

---

## 10. Logistics

State machine: `apps/api/src/logistics/state.ts` (`canTransitionShipment`).  
Booking: `LogisticsService.requestBooking` / `executeBooking` → **only** `MockCarrierAdapter`.  
Production: `carrier-logistics-production-activation-path.ts` — `enabled: false`, `NO_PRODUCTION_CARRIER_ADAPTER`.  
False delivered/POD/RTO: **possible in sandbox** via mock webhook, rider OTP `123456`, admin RTO — classified **SAFE SANDBOX-ONLY**. Production booking never starts.

**Quirk:** `markReadyToShip` may set shipment READY without `assertShipmentTransition` — sandbox handoff; would be **PRODUCTION RISK** if live booking existed without the S134 gate.

---

## 11. Clinical

- Consent + relationship: `clinical-access.service.ts`, `consent.service.ts`.
- eRx production: `erx-production-activation-path.ts`.
- Video production: `video-production-activation-path.ts` + `video.service.ts` join.
- Lab publish invariant: DRAFT ≠ PUBLISHED (S136 report + pathology).
- Imaging ingest: `imaging-ingest.service.ts` + S139 assert.
- PHI soft spots: admin list/get appointment and prescription expose person IDs with admin read permission (`appointment.service.ts` `listAdmin`, `prescription.service.ts` `listAdmin`). Not a customer IDOR.

---

## 12. Storage

| Layer | File | Behavior |
| --- | --- | --- |
| Port | `partner/object-store.ts` | `PrivateObjectStore`, opaque `signAccess` tickets, **not** public URLs |
| Disk | `LocalPrivateObjectStore` | `var/private-objects`, mode `0o600` |
| Gates | `GatedPrivateObjectStore` / `GatedMalwareScanner` | S140 asserts when storage/scan env = production |
| Scanner default | `AllowAllMalwareScanner` (`engine: 'noop'`) | **UNSCANNED ≠ TRUSTED** (S140 slogan matches code) |
| Public | CMS/catalog `publicUrl`, `/api/v1/help/media` | marketing, not KYC/DICOM |
| KMS / S3 | **MISSING** runtime | env refs in `production-storage-requirements.ts` only |

Sensitive files **do not** get public URLs through `PrivateObjectStore`. Residual: AllowAll = no AV; CMS uses AllowAll independently.

---

## 13. Global Architecture

**Policy-driven (correct):** `Country` + `PolicyPack` + `PolicyResolver` (`apps/api/src/policy/resolver.ts`) for payments methods, Rx subscription flags, etc. Seed packs for IN / AE / US in `dev-sandbox.seed.service.ts` / `us-policy.ts` — **legitimate fixtures**.

**India in copy, not kernel:** `PaymentService` methods listing message uses `countryCode === 'IN'` only to mention UPI in sandbox banner (`payment.service.ts` ~148–150). Method **families** still come from policy `allowedPaymentFamilies`.

**Repeated markets tuple** `GLOBAL | IN | AE | US` in S100–S109 onboarding evaluators and `provider-activation-admin.tsx` — **evaluation UI**, not hardcoded GST engine.

**Not flagged as bugs:** IN/INR in `vendor-currency-mapping.spec.ts`, India policy pack seed.

**No GST/Aadhaar/PAN engine** found as global business logic. UPI appears as a **payment method family** and sandbox copy, resolved via country policy.

---

## 14. Web UX / Runtime

All product web apps: **Next.js 15 / React 19**, `/api/*` rewrite to Nest.

| App | Implementation | Notes |
| --- | --- | --- |
| web-customer | **IMPLEMENTED** 79 routes | Sandbox pay scenario buttons are **honest** mock controls, not dead buttons |
| web-admin | **IMPLEMENTED** 82 routes | Launch/provider cards show BLOCKED — not fake green |
| web-vendor / doctor / join / affiliate | **IMPLEMENTED** thinner IA | Real APIs |
| web-lab / radiology / radiologist / pathologist / store / logistics | **IMPLEMENTED** SPA shells | Sidebar tabs + APIs; radiology **honest** “no PACS viewer” |
| ds-web | **NON-PRODUCT** | EmptyState demo `onClick: undefined` |

No full live-browser pass in this audit (read-only). Prior sprint Playwright against `127.0.0.1:4000` is the regression harness for customer only.

---

## 15. Mobile

**Affiliate mobile:** does not exist.

Common: Expo **^53**, RN **0.79.2**, OTP via `shell-core`, `android/` present, **`ios/` absent**, Windows → iOS **EXTERNAL_GATED**.

Statuses are **not combined**:

| App | CODE COMPLETE | BUILDABLE | EXPO SERVER STARTS | WEB RUNTIME | EXPO GO | APK EXISTS | APK INSTALLABLE | APK ACTUALLY RUNS | iOS BUILDABLE | iOS SIGNED | iOS RUNS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mobile | YES (large; 55 screens) | YES (S129 export, S130 Gradle) | PASS (:8081, S130) | PASS **partial** (PDP/cart/logout FAIL in S130) | LIKELY (no custom native) | YES debug ~125MB (`s130-artifacts`) | **NOT PROVEN** | **NOT PROVEN** (device) | NO (`ios/` missing; no Xcode) | NO | NO |
| mobile-store | YES thin shell | YES | PASS :8082 | FAIL (S130) | LIKELY | YES | NOT PROVEN | NOT PROVEN | NO | NO | NO |
| mobile-doctor | YES | YES | PASS :8083 | FAIL | LIKELY | YES | NOT PROVEN | NOT PROVEN | NO | NO | NO |
| mobile-lab | YES thin | YES | PASS :8084 | FAIL | LIKELY | YES | NOT PROVEN | NOT PROVEN | NO | NO | NO |
| mobile-phlebotomist | YES thin | YES | PASS :8085 | FAIL | LIKELY | YES | NOT PROVEN | NOT PROVEN | NO | NO | NO |
| mobile-delivery | YES; photo POD incomplete | YES | PASS :8086 | FAIL | LIKELY | YES | NOT PROVEN | NOT PROVEN | NO | NO | NO |

Evidence: `scripts/s129-mobile-runtime-validation.mjs`, `scripts/s130-android-apk-build.mjs`, `apps/test-results/s129-*`, `s130-*`.

---

## 16. Testing

| Kind | Location | Exercises |
| --- | --- | --- |
| API Jest | `apps/api` **321** specs | Mix of **real Prisma/module** tests and **report-shape** tests (`expect(can_production_launch).toBe('NO')`) |
| Customer Playwright | **93** files `apps/web-customer/src/__tests__/s*.spec.ts` + `e2e/helpers` | **Live browser + live API** (no `page.route` mocks found by explore) — **REAL APPLICATION PATH** for customer sandbox |
| Web component Jest | customer/admin/etc. | Often `jest.mock` of `*-api` — **function/UI existence** |
| Mobile Jest | mobile, doctor, delivery, sparse others | nav/parity — **not device** |
| False confidence | S65–S140 `*-onboarding.spec.ts` / `*-activation.spec.ts` | Assert JSON inventory, “no INR in payload”, BLOCKED flags — **do not prove live PSP/carrier** |
| Gaps | No Playwright for vendor/admin/lab/doctor; store/pathologist/ds-web/mobile-lab/store ≈ 0 specs | |

---

## 17. Production Infrastructure

| Topic | Classification | Evidence |
| --- | --- | --- |
| Environment schema | CODE_COMPLETE | `packages/config/src/env.ts` |
| Secrets manager runtime | MISSING | S132/S133/S140 comments; refs only |
| Database | CONFIG_REQUIRED | Compose local; no managed cloud in-repo |
| Deployment | PARTIAL CODE_COMPLETE | `Dockerfile`, compose `api` profile; no k8s/terraform. S99/S119 reports |
| CI/CD | CODE_COMPLETE for validate | `.github/workflows/ci.yml`: prisma, lint, typecheck, test coverage, build api/ds-web/web-customer/web-admin, mobile typecheck, redis 7 probe, `scripts/ci/audit.mjs`, gitleaks. **Does not** build all portals or mobile APKs |
| Artifact identity | PARTIAL | `GIT_SHA`, `APP_VERSION` env |
| Migrations / rollback | CODE_COMPLETE migrate deploy; rollback **HUMAN** | no automated down |
| Storage / KMS / malware | EXTERNAL_PROVIDER_REQUIRED | S140 BLOCKED |
| Backup / PITR / DR | CODE_COMPLETE scripts + EXTERNAL | `scripts/db-backup.mjs`, `db-restore.mjs`, `db-recovery-drill.mjs`; S108 reports; no proven cloud PITR |
| Monitoring / APM / alerting | EXTERNAL_PROVIDER_REQUIRED | S109 inventory; no Datadog/etc. SDK |
| WAF / DDoS | EXTERNAL_PROVIDER_REQUIRED | S114 `edge-waf-ddos-activation` report |
| Rate limiting | CODE_COMPLETE (Redis) | not globally certified multi-region |
| Security headers | CODE_COMPLETE | helmet in `http-setup.ts` |
| Incident handling | MISSING / HUMAN | no on-call runbook runtime |
| R14-A live PSP | HUMAN_APPROVAL_REQUIRED | 0/7 gates (index + `r14a-gate`) |

---

## 18. Duplicate / Sprint Debt

Pattern: **composer reports** stacked per sprint; **one runtime adapter**.

| File | Purpose | Active? | Duplicate? | Callers |
| --- | --- | --- | --- | --- |
| `payment/psp-first-onboarding.ts` | S65 inventory | YES | YES (layer 1) | Admin/provider cards, specs |
| `payment/psp-real-activation-first-onboarding.ts` | S102 | YES | YES | same |
| `payment/psp-payment-activation-preparation.ts` | S120 | YES | YES | same |
| `payment/psp-payment-production-activation-control.ts` | S128 | YES | YES | control plane |
| `payment/psp-payment-production-activation-path.ts` | S132 **assert + report** | YES | Authoritative **gate** | `payment.service.ts`, control plane |
| Same stack for OTP (`s66`…`s133`), carrier (`s67`…`s134`), KYC, PACS, video, eRx, storage | Reports | YES | YES | `admin-control-plane.service.ts` |
| `pharmacy-vendor-network-closure.ts` S135 | Maps `PartnerStatus` | YES | Soft duplicate of partner module | control plane |
| `lab-partner-production-workflow-closure.ts` S136 | Compose S126/S127 | YES | Report | control plane |
| `doctor-consultation-erx-production-workflow-closure.ts` S137 | Compose S125 | YES | Report | control plane |
| `telemedicine-live-consultation-production-workflow-closure.ts` S138 | Compose video path | YES | Report | control plane |
| `imaging-pacs-dicom-production-workflow-closure.ts` S139 | Compose PACS path | YES | Report | control plane |
| `private-storage-kms-malware-production-workflow-closure.ts` S140 | Compose storage path | YES | Report | control plane |
| `web-admin` Launch vs Provider cards | Same JSON, two UIs | YES | UX duplicate | both call path APIs |

**Obsolete but referenced:** none of the onboarding files are dead; deleting them would break Admin. **New not referenced:** not observed for S140 — both path + closure imported in `admin-control-plane.service.ts`.

---

## 19. TODO / FIXME / Placeholder

Meaningful (not HTML `placeholder=` / market `'IN'`):

| Occurrence | Class |
| --- | --- |
| `r14a-gate.ts` / service / specs | **MISSING FEATURE** (human evidence) + **SAFE DEV-ONLY** tests |
| `production-secrets-env-requirements.ts` | **EXTERNAL_GATED** checklist |
| `production-config-validator.ts` | **CONFIG_REQUIRED** |
| `apps/mobile/src/commerce-ui.tsx` TODO comments | **MISSING FEATURE** / mobile polish |
| `payments-admin.tsx` copy about sandbox | **FALSE POSITIVE** / honest UX |
| Sprint specs asserting no UPI in onboarding JSON | **FALSE POSITIVE** for “TODO” |
| `ConsoleOtpAdapter` / `Mock*` names | **SAFE SANDBOX** not leftover TODOs |
| `throw new Error` in activation paths | typically **SAFE FAIL-CLOSED** problem errors via `Errors.problem` |

Full string harvest of every `TODO` in 140 sprints is dominated by tests and Admin filter placeholders — not a second product backlog.

---

## 20. Dead / Unreachable / Superseded

| Item | Verdict |
| --- | --- |
| Root `tmp-otp-*`, `tmp-cookies*` | Unreferenced artifacts |
| `scripts/s55-mark-delivered.ts` etc. | Dev probes; not API graph |
| `ds-web` | Non-product |
| S65 onboarding **runtime** | Superseded as *authority* by S132 path; **still called** for cards |
| Code after production asserts | Intentionally unreachable when env=production (dead in prod, live in sandbox) |

Do not delete without a dedicated CR; Admin still depends on old evaluators.

---

## 21. End-to-End Flow Results

### FLOW A — Product → settlement

Sandbox: **completes** (mock capture → order → pick/pack → mock ship → rider OTP → ledger rows).  
**First production-incapable point:** `PaymentService.createAndSubmit` → `assertProductionPspInitiationAllowed` (`psp-payment-production-activation-path.ts`) when `PAYMENT_ENVIRONMENT=production`.  
Even if that were waived: **no non-mock adapter** (`gateway.registry.ts`). Next stop would be `assertProductionCarrierShipmentInitiationAllowed`.

### FLOW B — Doctor → medicine

Sandbox consult + Rx + optional commerce handoff: **completes internally**.  
**First production-incapable point (legal eRx):** `assertProductionErxTransmissionAllowed`.  
**Live video:** `assertProductionVideoSessionAllowed` on join.  
Medicine order then hits Flow A payment gate.

### FLOW C — Lab → health record

Sandbox booking → sample → published report → artifact: **completes**.  
**First production-incapable point:** production lab partner activation / clinical adapter (`NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW` / `NO_PRODUCTION_CLINICAL_ADAPTER` in S126/S136 reports). Booking itself is software-complete.

### FLOW D — Imaging → health record

Sandbox booking/study/report: **completes**. DICOM viewer: **does not**.  
**First production-incapable point:** `assertProductionPacsIngestAllowed` (`imaging-ingest.service.ts`).

### FLOW E — Partner onboarding → settlement

Join + documents + Admin approval + sandbox catalog/ops: **completes**. Live KYC bureau + live payout: **EXTERNAL_GATED**.  
**First production-incapable point:** KYC/provider verification (`kyc-healthcare-partner-verification-activation-preparation.ts` / S124) and payout onboarding (`finance/affiliate-payout-first-onboarding.ts`).

---

## 22. Fresh Completion Scores

**Methodology:** score *current code behavior*, not sprint titles.  
- **A** = share of locked product domains with real services/UI/schema (sandbox adapters count as software, not as production).  
- **B** = overlap with a 1mg-class live consumer product (live pay, SMS, courier, app-store apps, diagnostic viewer, India-scale ops).  
- **C** = ability to take real users/money/PHI in a real country tomorrow.  
- **D/E/F/G** = as labeled.  
Weights are expert estimates from the inventories above, not test pass rates.

| ID | Score | Why this number (not last year’s) |
| --- | --- | --- |
| **A. Software implementation** | **73%** | Kernel + 264 models + 146 controllers + full sandbox E2E A–D. Subtract: live adapters 0, thin satellite apps, stacked report debt, no DICOM viewer, wallet product absent. |
| **B. 1mg-class feature parity** | **51%** | Sandbox covers pharmacy+lab+doctor+content+admin. 1mg live UPI/delivery/apps/PACS viewer/SMS are absent. Global policy is *ahead* of 1mg; live India ops are *behind*. |
| **C. Production readiness** | **11%** | Fail-closed gates and CI are real (~that 11%). R14-A 0/7, no PSP/SMS/carrier/KMS/WAF/APM/PITR in cloud, sandbox-default envs. |
| **D. Web application completeness** | **78%** | Customer+admin deep; partner SPAs wired; ds-web excluded; no live-pay UX because no PSP. |
| **E. Mobile code completeness** | **58%** | Customer app substantial; five satellites are ops shells; no affiliate app; photo POD incomplete. |
| **F. Mobile actual runtime readiness** | **28%** | Metro 6/6 and debug APKs on disk ≠ install/run; Expo web only customer partial; iOS 0. |
| **G. Security implementation readiness** | **62%** | Ownership checks, helmet, rate limits, fail-closed prod mode, gitleaks. Subtract: audience mint, vendor permission skip, no pentest, sandbox-default host risk, AllowAll scanner. |

**Not reused:** previous 69% / 53% / 4% figures.

---

## 23. CRITICAL BLOCKERS

1. **No live PSP** — only `MockPaymentGatewayAdapter` (`apps/api/src/payment/mock.adapter.ts`); S132 always BLOCKED.  
2. **R14-A human gates 0/7** — `r14a-gate.ts` / Admin R14A.  
3. **No live OTP/SMS/email** — `ConsoleOtpAdapter` only; S133 BLOCKED.  
4. **No live carrier** — `MockCarrierAdapter`; S134 BLOCKED.  
5. **Sandbox env defaults on a production host** still take fake money (`payment.config.ts` `readPaymentEnvironment`).  
6. **No production private storage/KMS/AV** — `LocalPrivateObjectStore` + AllowAll; S140 BLOCKED.  
7. **No live eRx / video / PACS providers** — S137–S139 asserts.  
8. **`CAN_PRODUCTION_LAUNCH = NO`** — S140 spec + Master Index #436.  
9. **Mobile not device-proven; iOS unsigned/unbuilt.**  
10. **Secrets manager runtime MISSING** — cannot inject live PSP/OTP credentials as implemented.

---

## 24. HIGH PRIORITY WORK

1. Decide and set **domain environment flags** so a production host cannot silently remain sandbox.  
2. Procure **one** PSP, wire a real `PaymentGatewayPort`, keep mock compile-time impossible in production registry.  
3. Procure **SMS/email**, replace Console adapter; keep reveal OTP impossible in prod (already boot-gated).  
4. Bind **JWT `doctor` / `partner_applicant`** to actual partner/application state at mint (`auth.service.ts`).  
5. Enforce **org permission codes** on vendor fulfill/catalog writes.  
6. Close **R14-A** with real human evidence or formally defer live money.  
7. Prove **Android install+run** on emulator/device; do not claim runtime from APK file size.  
8. Replace **AllowAll** as default for KYC/health/DICOM paths even in sandbox if those files are sensitive.  
9. Live **KYC** vendor or explicit “manual review only” production policy.  
10. Stop treating S65–S140 **JSON specs** as proof of live integrations.

---

## 25. MEDIUM PRIORITY WORK

1. Collapse duplicate onboarding/activation **report** layers behind the S132–S140 path files (Admin still needs one API).  
2. Playwright for admin/vendor/lab/doctor smoke.  
3. Guest order-track enumeration hardening.  
4. Imaging **diagnostic viewer** (explicitly out of S139).  
5. Delivery **photo POD** (`mobile-delivery` comments).  
6. Affiliate **mobile** only if product requires it.  
7. Satellite Expo **web** failures (S130).  
8. CI build coverage for remaining web apps.  
9. Wallet product vs payment-method “wallet” naming cleanup (docs/policy).  
10. Root `tmp-*` probe files hygiene (ops, not product).

---

## 26. LOW PRIORITY / CLEANUP

- `ds-web` playground isolation.  
- Sprint screenshot folders growth.  
- Duplicate Admin cards (Launch vs Provider) copy.  
- India-specific sandbox **strings** in payment method banner.  
- `markReadyToShip` transition bypass once live carriers exist.

---

## 27. Explicitly Completed — MUST NOT REBUILD

| Area | Why keep |
| --- | --- |
| Prisma identity/IAM/membership/country/policy kernel | `schema.prisma` Person→Country→PolicyPack |
| Cart / checkout session / order snapshots / fulfillment tasks | `order.service.ts`, cart module |
| Payment **orchestration** (intents, attempts, webhooks inbox, refunds, idempotency) | `payment.service.ts` — replace **adapter**, not the ledger of intents |
| Shipment **state machine** | `logistics/state.ts` |
| Partner join + application + document tickets | `partner` module + `object-store.ts` port |
| Clinical consent + access evaluate | `clinical-access.service.ts` |
| Lab sample CoC + report versioning | lab models + pathology |
| Imaging study/report model (not viewer) | radiology models |
| Customer web commerce + health IA | 79 App Router pages |
| Admin permissioned shells | 82 pages + RBAC guards |
| Fail-closed `assertProduction*` pattern | S132–S140 path files |
| Tenant interceptor + RLS migrations | tenancy |
| CI prisma/lint/typecheck/test/gitleaks | `.github/workflows/ci.yml` |

Rebuilding these would discard working sandbox E2E and the only production-safety mechanism that exists (fail-closed).

---

## Appendix — Count snapshot

| Item | n |
| --- | --- |
| Nx app projects | 20 |
| Web product apps | 13 (incl. ds-web) |
| Mobile apps | 6 |
| Packages | 6 |
| Prisma models | 264 |
| Prisma enums | 162 |
| Migrations | 187 |
| API controllers | 146 |
| API Jest specs | 321 |
| Schema indexes | 336 |
| Unique constraints | 197 |

**End of audit. No code was changed except this report and the Master Index pointer.**
