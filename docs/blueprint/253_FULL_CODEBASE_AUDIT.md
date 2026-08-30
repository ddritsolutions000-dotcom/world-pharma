# 253 — Full codebase ground-truth audit

**CR:** `CR-FULL-CODEBASE-AUDIT-253`  
**Verdict:** **`ECOSYSTEM_SANDBOX_COMPLETE_R14_A_NOT_STARTED`**  
**Date:** 30 August 2026  
**Method:** Repository is primary source of truth. Blueprint books consulted for scope/history only; all material claims verified against live code, schema, migrations, and runtime probes.  
**Rule:** Audit only — **no source, test, schema, migration, config, or runtime changes** were made in this CR.

**Prior audits:** [241](241_FULL_PROJECT_AUDIT.md) · [250](250_R14_A_PREIMPLEMENTATION_AUDIT.md) · [251](251_PRE_R14_A_FINAL_GATE_VERIFICATION.md)  
**Human gates:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) (**0/7 evidenced**, CR-252 intake complete)  
**R14 plan:** [242](242_R14_IMPLEMENTATION_PLAN.md) · **IMPL blocked:** [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md)

---

## 0. Executive verdict

World-Pharma is a **large, real, multi-app monorepo** with a single NestJS API kernel (`apps/api`), 12 Next.js web portals, 5 React Native mobile apps, and 6 shared packages. **R0–R13 engineering surface is substantially implemented in code** as **sandbox/mock/fail-closed** behavior — not production live money, carriers, telemedicine, or clinical search enablement.

**Payment (R14-A) is architecturally scaffolded but operationally sandbox-only.** The only concrete gateway adapter is `MockPaymentGatewayAdapter`. `PaymentRouter` selects sandbox gateways from DB but `PaymentService` always calls `this.mock`. No Stripe/Razorpay/live PSP code exists.

**Human/legal R14-A gates remain 0/7 evidenced** ([247](247_R14_A_HUMAN_GATE_EVIDENCE.md), [251](251_PRE_R14_A_FINAL_GATE_VERIFICATION.md)). Engineering can start R14-A adapter work **after** human authorization; production rollout requires gates + staging parity.

**Critical operational finding:** Local Postgres (`worldpharma` @ `127.0.0.1:55432`) has **34 pending migrations** (R12-C through R13-G). Code and tests assume these objects exist; local runtime/API may be on an older schema than repository head.

**Build/typecheck evidence (this audit):**
| Target | Result |
|--------|--------|
| `tsc -p apps/api/tsconfig.app.json` | **PASS** |
| `nx run api:build` | **PASS** (cached) |
| `tsc -p apps/web-admin/tsconfig.json` | **PASS** |
| `tsc -p apps/web-customer/tsconfig.json` | **FAIL** — `store-home.tsx:174` prop `onRetry` not on `EmptyState` |
| API e2e/jest suites | **NOT RUN** — `global-setup.cjs` invokes `pnpm exec prisma migrate deploy`; `pnpm` not on PATH in audit shell |
| `/health/ready` | **200** — `{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}` |

**Authoritative one-line status:** Sandbox healthcare/commerce platform **functionally broad**; **live finance/carriers/PHI search production NOT present**; **R14-A live PSP NOT implemented**.

---

## 1. Repository inventory — actual code

| Area | Actual implementation | Location | Status |
|------|----------------------|----------|--------|
| **Monorepo root** | pnpm workspace + Nx 23.1.1 | `package.json`, `nx.json`, `pnpm-workspace.yaml` | COMPLETE |
| **API (NestJS)** | Modular monolith, 30+ domain modules | `apps/api/src/` | COMPLETE (sandbox) |
| **Web — customer** | Next.js App Router | `apps/web-customer/` | PARTIAL UI |
| **Web — admin** | Next.js ERP shell | `apps/web-admin/` | PARTIAL UI |
| **Web — affiliate** | Separate affiliate hub | `apps/web-affiliate/` | PARTIAL |
| **Web — doctor/lab/radiology/vendor/store/join/pathologist/radiologist** | Role portals | `apps/web-*` (10 more) | PARTIAL shells |
| **Mobile — customer** | React Native | `apps/mobile/` | PARTIAL |
| **Mobile — delivery/doctor/phlebotomist/store** | Field/partner RN | `apps/mobile-*` | PARTIAL |
| **Design system** | Web + native tokens | `apps/ds-web/`, `packages/ui-kit/` | COMPLETE |
| **Config package** | Zod env parsing | `packages/config/` | COMPLETE |
| **Database package** | Prisma client export | `packages/database/` | COMPLETE |
| **Shared utilities** | UUID, helpers | `packages/shared/` | COMPLETE |
| **Shell layers** | Auth/session for web/mobile | `packages/shell-core/`, `packages/shell-web/` | COMPLETE |
| **Prisma schema** | 226 models, 133 enums | `packages/database/prisma/schema.prisma` | COMPLETE |
| **Migrations** | 128 folders | `packages/database/prisma/migrations/` | COMPLETE in repo; **34 pending locally** |
| **RLS SQL** | 47+ RLS-dedicated migrations; core retrofit | `20260827180000_multi_tenant_rls/` + `*_rls*` | COMPLETE in repo |
| **Identity/auth** | JWT, OTP, sessions, RBAC | `apps/api/src/identity/` | COMPLETE |
| **Policy engine** | Country pack resolver, fail-closed defaults | `apps/api/src/policy/` | COMPLETE |
| **Tenancy / RLS GUCs** | `TenantContext`, `applyTenantGucs`, interceptor | `apps/api/src/tenancy/` | COMPLETE |
| **Events / outbox** | Outbox + BullMQ `domain-events` | `apps/api/src/events/` | COMPLETE |
| **Logistics worker** | BullMQ `logistics-booking` | `apps/api/src/logistics/worker.ts` | MOCK/SANDBOX |
| **Analytics worker** | Scheduled rollups service (no cron) | `apps/api/src/analytics/analytics-worker.service.ts` | PARTIAL |
| **Search indexing** | Job dispatch + worker hooks | `apps/api/src/search/` | PARTIAL (no clinical auto-index) |
| **Payment kernel** | Sandbox mock only | `apps/api/src/payment/` | MOCK/SANDBOX |
| **Finance / ledger** | Sandbox facts, journals | `apps/api/src/finance/` | MOCK/SANDBOX |
| **Clinical search** | Gated doctor API, not in discovery | `apps/api/src/clinical/clinical-search.*` | PARTIAL (indexing gap) |
| **Feature flags** | Country policy packs (not LaunchDarkly) | `apps/api/src/policy/document.ts`, `empty-pack.ts` | COMPLETE |
| **Docker data plane** | Postgres 16 + Redis 7 | `docker-compose.yml` | RUNNING (local) |
| **CI scripts** | Audit + migration check | `scripts/ci/` | COMPLETE |
| **Tests** | 113 `*.spec.ts` under `apps/` (excl. node_modules) | scattered | SUBSTANTIAL (not executed this CR) |

**Nx projects (24):** 18 apps + 6 libs (`project.json` in each).

**API bounded contexts (from `app.module.ts`):** Identity, Policy, Partner, Catalog, Lab, Radiology, Health, CareNav, CMS, CRM, Promo, Affiliate, Wishlist, Loyalty, Reviews, Personalization, Search, Discovery, Recommendations, Analytics, Inventory, Cart, Payment, Order, Logistics, Finance, Clinical, Store, Delivery, Governance, Platform, Events, Security.

---

## 2. Complete feature matrix (from code)

| Feature | Status | Code proof |
|---------|--------|------------|
| Identity/auth | **COMPLETE** | `identity/` — auth.controller, JWT guards, sessions, OTP |
| RBAC | **COMPLETE** | `authority.ts`, `PermissionsGuard`, `Membership` model |
| Tenant/country isolation | **COMPLETE** | `tenancy/`, RLS migrations, `country_id` on operational tables |
| Catalog | **COMPLETE** | `catalog/` — items, offers, pricing, vendor marketplace |
| Inventory | **COMPLETE** | `inventory/` — lots, balances, reservations, GRN |
| Cart | **COMPLETE** | `cart/` — cart, checkout sessions, promo integration |
| Checkout | **COMPLETE** | `cart.controller.ts` → `PaymentService.payCheckout` |
| Orders | **COMPLETE** (sandbox) | `orders/` — state machine, fulfillment, vendor views |
| Payments | **MOCK/SANDBOX** | Only `MockPaymentGatewayAdapter`; `sandbox: true` hardcoded |
| Refunds | **PARTIAL** | Payment refund via mock; order `REFUND_PENDING` decoupled |
| Ledger/finance | **MOCK/SANDBOX** | `finance.service.ts` — sandbox facts, no live payout |
| Affiliates | **PARTIAL** | API + web-affiliate; no customer click-capture UI |
| Logistics | **MOCK/SANDBOX** | Mock carrier, BullMQ worker, `live_dhl: false` log |
| Doctors | **COMPLETE** (sandbox) | `clinical/doctor*`, appointments, encounters |
| Appointments | **COMPLETE** | `clinical/*appointment*` |
| Labs | **COMPLETE** (sandbox) | `lab/` — booking, CoC, pathology, physical report |
| Imaging/radiology | **COMPLETE** (sandbox) | `radiology/` — booking, acquisition, reports |
| Health records | **COMPLETE** | `health/` — artifacts, timeline, consent, break-glass |
| CRM | **COMPLETE** | `crm/` — customer 360, conversion events |
| Personalization | **COMPLETE** (API) | `personalization/` — event ingest |
| Search/indexing | **PARTIAL** | Workers exist; admin UI missing; clinical index manual |
| Discovery | **COMPLETE** | Public `GET /discovery/search` — no auth guards |
| Recommendations | **PARTIAL** | Item-level + `/me/recommendations` API; no dedicated page |
| Analytics | **PARTIAL** | Ingest + admin BI; no scheduled cron for rollups |
| Clinical search | **PARTIAL** | Fail-closed API; no auto-index; not in discovery types |
| Admin surfaces | **PARTIAL** | web-admin covers CMS, CRM, support, analytics, payments (read) |
| Customer web | **PARTIAL** | Commerce, health, care-nav, help; 1 TS error |
| Mobile | **PARTIAL** | Parity specs for health/care-nav/imaging; not full product |
| Affiliate web | **PARTIAL** | `web-affiliate` hub only |

---

## 3. R9 → R13 actual code audit

| Phase | Code exists | Integrated | Tested | Missing | Actual status |
|-------|-------------|------------|--------|---------|---------------|
| **R9** Health kernel | Yes — `health/`, `clinical/consent*` | Customer/doctor/admin UI | 5 e2e + unit | Event handlers log-only | **COMPLETE** (sandbox) |
| **R10** Care navigation | Yes — `care-nav/` (17 files) | web-customer `/health/care-navigation` | 3 e2e + unit | Doctor care-nav UI | **COMPLETE** |
| **R11** CMS/help/support | Yes — `cms/`, `platform/support` | web-customer help + support; web-admin CMS/desk | `r11a` e2e + UI specs | Support ticket UI tests sparse | **COMPLETE** |
| **R12-A** CRM | Yes — `crm/admin-crm*` | web-admin `/crm` | `r12a` e2e | — | **COMPLETE** |
| **R12-B** Marketing | Yes — `crm/marketing/` | web-admin `/marketing` | `r12b` e2e | Customer prefs UI partial | **COMPLETE** |
| **R12-C** Promo | Yes — `promo/`, cart integration | Checkout promo UI | `r12c` e2e | **DB migrations pending locally** | **COMPLETE** in code |
| **R12-D** Affiliate | Yes — `affiliate/` | web-admin + web-affiliate | `r12d` e2e | Customer attribution UI | **PARTIAL** |
| **R12-E** Wishlist | Yes — `wishlist/` | web-customer wishlist | `r12e` e2e | — | **COMPLETE** |
| **R12-E** Loyalty | Yes — `loyalty/` API only | **No UI** | In r12e e2e | All loyalty UI | **STUB** (API only) |
| **R12-F** Reviews | Yes — `reviews/`, `personalization/` | Product detail + admin moderation | `r12f` e2e | Admin Q&A page | **COMPLETE** |
| **R12-G** Automation | Yes — `crm/automation/` | API only | `r12g` e2e | Admin UI, cron | **PARTIAL** |
| **R12-H** Refills | Yes — `clinical/refill*` | Customer/doctor/admin Rx UI | `refill.e2e` + r12g | — | **COMPLETE** |
| **R13-A** Search indexing | Yes — `search/` | Event dispatch + CLI | `r13a` e2e | Admin reindex UI | **PARTIAL** |
| **R13-B** Discovery | Yes — `discovery/` | web-customer store/search | `r13b` e2e | — | **COMPLETE** |
| **R13-C** Provider search | Yes — `provider-search.service.ts` | Via discovery types | `r13c` e2e | — | **COMPLETE** |
| **R13-D** Recommendations | Yes — `recommendations/` | Product detail related items | `r13d` e2e | `/me/recommendations` page | **PARTIAL** |
| **R13-E** Analytics ingest | Yes — `analytics/` | Worker service callable | `r13e` e2e | Cron scheduler | **PARTIAL** |
| **R13-F** Analytics admin | Yes — `admin-analytics.controller.ts` | web-admin `/analytics` | `r13f` e2e | — | **COMPLETE** |
| **R13-G** Clinical search | Yes — `clinical-search.*` | **No UI** (by design) | `r13g` e2e | Auto-index on artifact publish | **PARTIAL** |
| **R13-H** Closure | Policy gates + regression tests | Cross-cutting | `r13h.closure.e2e` | — | **COMPLETE** |

**Note:** Blueprint books mark R9–R13 **CLOSED**. Code confirms **broad implementation** with **documented partials** (loyalty UI, automation cron, clinical index hooks, local DB lag).

---

## 4. R14-A deep code audit — payment call graph

### 4.1 Commerce checkout (CARD success)

```
HTTP POST /api/v1/me/checkout/sessions/:id/pay
  → CartController.pay                    [cart.controller.ts]
  → PaymentService.payCheckout            [payment.service.ts:75-89]
  → withIdempotency (Redis lock)          [payment.service.ts:~1213]
  → createAndSubmit                       [payment.service.ts:355-496]
      → PolicyResolver (payments.enabled) [policy/resolver.ts]
      → AllowlistRiskAdapter.assess       [allowlist.risk.ts — always allow]
      → PaymentRouter.decide              [router.ts — environment:'sandbox' only]
      → prisma.paymentIntent.create       (sandbox: true)
      → prisma.paymentAttempt.create
      → MockPaymentGatewayAdapter.submit  [mock.adapter.ts — ALWAYS, not router gateway]
      → applyStatus + assertIntentTransition [state-machine.ts]
      → outbox PAYMENT_* events
      → OrderService.createFromPayment    (on CAPTURED)
      → FinanceService.syncPayment
```

### 4.2 Lab / imaging booking pay

```
POST /api/v1/me/lab/bookings/:id/pay
  → CustomerLabBookingController.pay
  → PaymentService.payLabBooking → createAndSubmitLabBooking
  → applyStatus → confirmLabBookingCapture (NO Order created)

POST /api/v1/me/imaging/bookings/:id/pay
  → CustomerImagingBookingController.pay
  → PaymentService.payImagingBooking → createAndSubmitImagingBooking
  → applyStatus → confirmImagingBookingCapture (NO Order created)
```

### 4.3 COD path

```
createAndSubmit → authorizeCod
  → AUTHORIZED_COD intent (no mock gateway)
  → OrderService.createFromPayment directly
```

### 4.4 Customer payment API

```
GET  /api/v1/payments/methods
GET  /api/v1/me/payments/intents/:id
POST /api/v1/me/payments/intents/:id/confirm|capture|refund
  → PaymentController → PaymentService
```

### 4.5 Webhook path

```
POST /api/v1/webhooks/payments/:gatewayId
  → TenantContextInterceptor: workerTenantContext() [tenant.interceptor.ts:25-28]
  → PaymentWebhookController.ingest
  → PaymentService.ingestWebhook
      → verifySandboxSignature (HMAC, x-sandbox-signature) [hmac.ts]
      → PaymentWebhookEvent dedupe (gatewayId + providerEventId)
      → mapWebhookType → applyStatus (mock NOT called)
```

### 4.6 Admin

```
GET  /admin/payments, /admin/payments/unknown
POST /admin/payments/:id/refund|reconcile
  → PaymentAdminController → PaymentService
  → reconcile: mock.status vs DB transaction
```

### 4.7 Component assessment

| Component | Real/Mock | DI | Production ready? |
|-----------|-----------|-----|-------------------|
| `PaymentGatewayPort` | Port only | N/A | Contract ready |
| `MockPaymentGatewayAdapter` | **Mock** | Registered | Sandbox only |
| `PaymentRouter` | Real DB | Yes | **Sandbox filter L36** |
| `PaymentService` | Real orchestration | Hardwired `this.mock` | **No** |
| `AllowlistRiskAdapter` | **Stub** (always allow) | Yes | **No** |
| `state-machine.ts` | Real | Used on intents | Partial (refund SM bypassed) |
| Webhook HMAC | Real (sandbox secret) | Env/default | **No** (no timestamp/replay) |
| `FinanceService.syncPayment` | Real ledger writes | Yes | Sandbox facts only |
| Policy `payments.enabled` | Real fail-closed | Yes | Yes (default false) |

### 4.8 Sandbox-only lines (authoritative)

| File | Line/behavior | Effect |
|------|---------------|--------|
| `payment/router.ts:36` | `environment: 'sandbox'` | Live gateways never selected |
| `payment/mock.adapter.ts:10` | Comment + in-memory ledger | No external PSP |
| `payment/payment.service.ts` | All intents `sandbox: true`; `present()` returns `sandbox: true` | Responses always sandbox |
| `payment/payment.module.ts:27` | Only `MockPaymentGatewayAdapter` provider | No adapter registry |
| `payment/seed.ts` | Seeds `MOCK_PRIMARY`, `MOCK_FALLBACK` | No live gateway rows |
| `payment/hmac.ts:4` | Default `'sandbox-webhook-secret'` | Weak default if env unset |
| `policy/empty-pack.ts:210-214` | `payments.enabled: false` | Fail-closed default |
| `schema.prisma:~1939` | Comment "Phase 1D sandbox payment kernel" | Schema intent |

---

## 5. R14-A missing work (code only)

| # | File/module | Current behavior | Required behavior | Dependency | Blocker? | Complexity |
|---|-------------|------------------|-------------------|------------|----------|------------|
| 1 | `payment/payment.module.ts` | Single mock provider | Adapter registry/factory; bind port to selected gateway | PSP choice (human gate) | **Yes** (PSP) | Medium |
| 2 | `payment/payment.service.ts` | Always `this.mock.submit` | Dispatch to adapter by `gatewayCode` from router | #1 | No | Medium |
| 3 | `payment/router.ts:36` | Sandbox-only filter | Environment-aware filter (`sandbox` vs `production`) | Config + human gates | **Yes** (gates) | Low |
| 4 | New `payment/adapters/*.ts` | **Missing** | Concrete Stripe/Razorpay/Adyen adapter implementing `PaymentGatewayPort` | PSP SDK, credentials vault | **Yes** | High |
| 5 | `payment/webhook.controller.ts` + `hmac.ts` | Sandbox HMAC header | Provider-specific signature, timestamp tolerance, replay store | PSP webhook spec | No | High |
| 6 | `payment/allowlist.risk.ts` | Always `{ allow: true }` | Real risk rules or provider risk pass-through | PSP/risk vendor | No | Medium |
| 7 | `payment/payment.service.ts` refund | Skips refund state machine | Honor `REFUND` transitions | — | No | Low |
| 8 | `orders/order.service.ts` | `requestRefund` → order state only | Link to `PaymentService.refund` | #2 | No | Medium |
| 9 | `policy/document.ts` | `gateway_refs` validated not used | Wire gateway_refs to router/seed | Country pack publish | No | Medium |
| 10 | `.env.example` | No `PAYMENT_*` vars | Document vault refs, webhook secrets | Ops | No | Low |
| 11 | `payment/*.e2e.spec.ts` | Mock scenarios only | `r14a` live-adapter contract tests (sandbox mode) | #4 | No | High |
| 12 | `packages/database` | Sandbox gateway seed | Production gateway/account rows per country | Legal entity, MoR | **Yes** | Medium |

---

## 6. Payment security audit

### 6.1 Secrets

| Finding | Severity | Location |
|---------|----------|----------|
| Default webhook secret `'sandbox-webhook-secret'` | P2 | `payment/hmac.ts:4` |
| `PAYMENT_MOCK_WEBHOOK_SECRET` not in `.env.example` | P3 | `.env.example` |
| No hardcoded `sk_live`/PAN/CVV in payment TS | OK | `pci.spec.ts` static scan |
| Docker compose default JWT/OTP dev secrets | P2 (local only) | `docker-compose.yml:52-53` |
| `worldpharma_app` password in migration SQL | P1 | `20260827180000_multi_tenant_rls` |

### 6.2 Card data

- Client sends `scenario` + method family; **no PAN/CVV fields** in payment DTOs.
- `MockPaymentGatewayAdapter` uses `tok_sandbox` pattern in e2e.
- Webhook storage: `encryptWebhookPayload` stores SHA256 digest only — **not card data**.
- **Risk:** Provider adapter implementation must preserve PCI boundary (no PAN persistence).

### 6.3 Webhooks (sandbox)

| Control | Present? | Notes |
|---------|----------|-------|
| Signature validation | **Yes** | HMAC-SHA256, timing-safe |
| Timestamp validation | **No** | — |
| Replay protection | **Partial** | DB dedupe on `providerEventId` only |
| Idempotency | **Yes** | `PaymentWebhookEvent` unique |
| Unknown events | **Partial** | Stored; mapping may no-op |
| Secret rotation | **No** | Single env secret |
| Worker tenant context | **Empty worker** | Webhook path uses `workerTenantContext()` without country scope |

### 6.4 State transitions

- `state-machine.ts` guards intent transitions; illegal transitions throw.
- `applyStatus` drives CAPTURED → order creation — **requires mock/webhook result** (not arbitrary client flag).
- **Gap:** Refund path writes `REFUNDED` directly, bypassing refund SM.
- **Gap:** Order `REFUND_PENDING` does not invoke payment refund — **inconsistent refund story**.

---

## 7. Database / Prisma audit

| Metric | Value |
|--------|-------|
| Models | 226 |
| Enums | 133 |
| Migration folders | 128 |
| Local DB applied | **~94** (34 pending) |

### 7.1 Pending migrations (verified `prisma migrate status`)

From `20260829220000_r12c_promo_schema` through `20260829300200_r13g_clinical_search_grants` — **34 migrations** including promo, affiliate, wishlist/loyalty, reviews, automation, search, provider search, recommendations, analytics, clinical search schema/RLS/grants.

**Impact:** Code references tables (`PromoCampaign`, `WishlistItem`, `ClinicalSearchDocument`, etc.) that **may not exist** on local DB until `migrate deploy`. E2E global setup would fail or tests would skip features.

### 7.2 Schema/code alignment

- Prisma schema includes full R12/R13 models — **matches** migration folders at repo head.
- Payment models comment: sandbox kernel — **consistent** with code.
- No orphan migration folders found without schema counterparts at head.

### 7.3 Indexes/constraints

- Payment idempotency: `IdempotencyRecord`, webhook dedupe on `gatewayId + providerEventId`.
- RLS: FORCE RLS on operational tables post-retrofit.
- **Not audited live:** index usage on search document tables under load.

---

## 8. RLS / multi-tenant security audit

### 8.1 Application context

- **No `RlsContext` type** — uses `TenantContext` (`tenancy/tenant-context.ts`).
- GUCs: `app.actor_kind`, `app.person_id`, `app.country_ids`, `app.org_ids`, etc. (`apply-tenant-gucs.ts`).
- HTTP: `TenantContextInterceptor` builds full user context from memberships.
- `/health` bypasses tenant binding (intentional).
- `/webhooks/*` uses empty `workerTenantContext()` — **RLS relies on worker policies**.

### 8.2 SQL policies

- Core: `20260827180000_multi_tenant_rls` — `worldpharma_app` **NOBYPASSRLS**, helper functions, tenant policies.
- Early migrations (pre-retrofit) contained `USING (true)` — **superseded** by retrofit `drop_all_policies()`.
- Transient `security_events_insert WITH CHECK (true)` — **fixed** in `20260827181200`.
- Historical `app.bypass_rls` GUC in old payment/order policies — **dropped** at retrofit; no app code sets it.

### 8.3 Findings

| ID | Severity | Finding |
|----|----------|---------|
| RLS-1 | P1 | Hardcoded `worldpharma_app` password in migration |
| RLS-2 | P2 | Webhook worker context has no country/org scope — verify per-handler scoping |
| RLS-3 | P3 | Historical `USING (true)` in old migration files (grep noise; not effective) |

---

## 9. API audit (summary)

**98 controller files** under `apps/api/src/`.

| Audience | Pattern | Examples |
|----------|---------|----------|
| **Public** | No JWT | `discovery/*`, `help/*`, `public/affiliate/click`, webhooks |
| **Customer** | `JwtAuthGuard` + `audience: customer` | `/me/*`, `/customer/*`, cart, checkout |
| **Doctor** | `audience: doctor` + permissions | `/doctor/*`, `/clinical/search` |
| **Admin** | `audience: admin` + `RequirePermissions` | `/admin/*` |
| **Partner/vendor** | Scoped membership | `/vendor/*`, store ops |
| **Internal/worker** | `workerTenantContext` | Outbox handlers, search jobs, webhooks |

**Validation:** Widespread Zod schemas on query/body (e.g. `clinical-search.controller.ts`, `discovery-customer.controller.ts`).

**Rate limiting:** Not observed on payment or auth endpoints in code review.

**Sensitive fields:** CRM masking (`crm-mask.ts`); clinical search token leak guard in `clinical-search.service.ts:165`.

---

## 10. Search / discovery / recommendations / analytics

| Kernel | Implementation | Gaps |
|--------|----------------|------|
| **SearchIndexJobService** | `search/search-index-job.service.ts` — processes catalog/provider jobs | Clinical kind only via manual/admin job |
| **SearchIndexDispatchService** | Listens catalog/inventory/doctor events | Clinical auto-index **not wired** |
| **DiscoverySearchService** | Merges commerce, help, provider indices | Public, no auth; types exclude clinical |
| **ProviderSearchService** | Doctor/lab/test/pharmacy documents | Integrated via discovery |
| **RecommendationsService** | Co-occurrence + deterministic ranking | No dedicated customer page |
| **AnalyticsIngestService** | Conversion events → facts | — |
| **AnalyticsWorkerService** | `runDailyRollups()`, purge | **No cron/scheduler** in codebase |
| **ClinicalSearchIndexService** | `reindexArtifact()` | `scheduleClinicalReindex()` has **zero callers** |

**Duplicate kernels:** None found — single discovery service, single clinical search service.

---

## 11. Clinical / PHI audit

| Control | Verified |
|---------|----------|
| Clinical search default OFF | `empty-pack.ts` → `clinical_search_enabled: false` |
| Policy gate in service | `ClinicalSearchService.requireEnabled()` throws forbidden |
| Audience | `@RequireAudiences('doctor')` only |
| Permission | `@RequirePermissions('clinical:search')` |
| Consent enforcement | `ClinicalAccessService.evaluateForPatientHealthRead` |
| Not in discovery types | `DISCOVERY_TYPES` excludes clinical (`discovery-query.ts:10-17`) |
| Public discovery test | `r13g.clinical-search.e2e.spec.ts`, `r13h.closure.e2e.spec.ts` |
| Query blocking | `isClinicalQueryBlocked`, policy blocked terms |
| Audit events | `CLINICAL_SEARCH_QUERY` security events |
| Auto-enable path | **None found** — fail-closed confirmed |

**PHI in logs:** Clinical search response scanned for sensitive token leaks before return.

---

## 12. Frontend actual code audit

| App | API integration | Auth/guards | Notable gaps | Typecheck |
|-----|-----------------|-------------|--------------|-----------|
| **web-customer** | commerce-api, discovery-api, health, care-nav, help | `@world-pharma/shell-web` session | `store-home.tsx` TS error; no loyalty UI | **FAIL** (1 error) |
| **web-admin** | Admin modules for CMS, CRM, support, analytics, payments | Shell session + RBAC from API | No search reindex UI; payments read-only | **PASS** |
| **web-affiliate** | Affiliate hub API | Session | Minimal surface | Not run |
| **mobile** | Parity specs for help, health, care-nav, imaging | shell-core | Not full checkout parity verified | Not run |

**Checkout/payment UI:** `web-customer/checkout-page.tsx` calls `payCheckout`, displays sandbox intent status and 3DS redirect URL from mock.

---

## 13. Test audit

| Metric | Value |
|--------|-------|
| Spec files under `apps/` | **113** |
| API spec/e2e files | **~102** (per explore agent) |
| Unit vs e2e (api) | ~54 unit, ~68 e2e (`*.e2e.spec.ts`) |
| web-admin tests | **0** |
| web-affiliate tests | **0** |

**Execution this CR:** Jest **not executed** — `global-setup.cjs` requires `pnpm exec prisma migrate deploy`; `pnpm` unavailable in audit shell.

**Prior evidence (Book 125):** 136/136 api tests green when environment complete.

**Missing test categories:** Live PSP contract tests, webhook replay/timestamp tests, negative security tests for discovery abuse, frontend e2e for checkout.

---

## 14. Build / dependency audit

- **Workspace:** pnpm 10.15.1, Node >=22, Nx 23.1.1.
- **Root deps:** NestJS 11, Prisma 6.14, BullMQ 6.2, Zod 4.
- **Circular deps:** Payment ↔ Lab/Radiology via `forwardRef` — known, bounded.
- **API build:** PASS (webpack).
- **No duplicate payment SDKs** — none installed (consistent with mock-only).

---

## 15. Runtime audit (actually run)

| Check | Result |
|-------|--------|
| Docker Postgres | **Up 9h, healthy** (`world-pharma-postgres`, port 55432) |
| Docker Redis | **Up 9h, healthy** (`world-pharma-redis`, port 56379) |
| API container | **Not running** (compose profile `app` not started) |
| API process localhost:4000 | **Responding** |
| `GET /health/ready` | **200** — postgres up, redis 7.4.11, bullmq up |
| Migration status | **34 pending** on local `worldpharma` DB |
| Payment sandbox | API running against DB with **older schema** (pre-R12-C migrations) |

---

## 16. Dead code / stub / mock audit (important)

| Pattern | Classification | Location |
|---------|----------------|----------|
| `MockPaymentGatewayAdapter` | **REAL BLOCKER** (sandbox path) | `payment/mock.adapter.ts` |
| `AllowlistRiskAdapter` always allow | **PRODUCTION PATH** (stub) | `payment/allowlist.risk.ts` |
| Router selects gateway, service ignores | **REAL BLOCKER** | `payment.service.ts` vs `router.ts` |
| `scheduleClinicalReindex` no callers | **DEAD CODE** | `clinical-search-index.service.ts` |
| Event handlers log-only | **STUB** | `events/handlers.ts` (consent, break-glass) |
| Logistics `live_dhl: false` | **MOCK/SANDBOX** | `logistics/worker.ts:44` |
| Finance `recordSandbox*` methods | **MOCK/SANDBOX** | `finance.service.ts` |
| Order tracking placeholder | **STUB** | `order.service.ts:997` |
| Notification external channels disabled | **SANDBOX** | `notification-dispatch.service.ts:106` |
| Video LiveKit production | **NOT IMPLEMENTED** | `app-topology.ts` |

---

## 17. Actual project completion estimate (functional areas)

| Surface | Implemented | Partial | Sandbox/mock | Missing |
|---------|-------------|---------|--------------|---------|
| Platform/RBAC/RLS | ✓ | | | |
| Commerce catalog→order | ✓ | | ✓ payments/logistics | |
| Vendor marketplace | ✓ | | ✓ settlements | |
| Lab diagnostics | ✓ | | ✓ pay/finance | |
| Radiology | ✓ | | ✓ pay/finance | |
| Health records/consent | ✓ | | | |
| Care navigation | ✓ | | | |
| CMS/help/support | ✓ | | | |
| CRM/marketing/promo | ✓ | UI gaps | | |
| Affiliate/loyalty | | ✓ | | loyalty UI |
| Search/discovery | ✓ | index admin UI | | |
| Recommendations/analytics | | ✓ | | cron, pages |
| Clinical search | | ✓ API | fail-closed | auto-index |
| Live payments (R14-A) | | scaffold | ✓ mock | live PSP |
| Live carriers/payouts (R14-B+) | | | ✓ mock | live |

**No file-count percentage claimed** — functional breadth is **high in sandbox**, **zero in live money**.

---

## 18. R14-A readiness — three independent verdicts

### 18.1 Engineering readiness

**READY TO START** adapter implementation once human CR authorizes `CR-R14-A-IMPL-244`.

Evidence: `PaymentGatewayPort`, router, service orchestration, state machine, webhooks, ledger hooks, policy gates, e2e sandbox tests — all present. Primary engineering gaps are **adapter dispatch** and **live adapter modules** — expected R14-A scope, not pre-blockers.

### 18.2 Human/legal readiness

**NOT READY — 0/7 gates evidenced.**

Repository contains intake record only ([247](247_R14_A_HUMAN_GATE_EVIDENCE.md)); no PSP, country, legal entity, MoR, contract, vault, or PCI SAQ evidence in artifacts.

### 18.3 Operational readiness

**PARTIAL — BLOCKED for R12–R13 feature parity testing.**

- Postgres/Redis/BullMQ: **healthy**
- API: **running**
- Local DB: **34 migrations behind repo head** — must run `prisma migrate deploy` before R12/R13 e2e or R14-A staging tests
- `pnpm` required for jest global setup — ensure CI/dev PATH
- No staging PSP credentials/vault

---

## 19. Critical findings (ranked)

### P0 — catastrophic / security / prod blocker

| ID | File | Problem | Impact | Fix | Blocks R14-A? |
|----|------|---------|--------|-----|---------------|
| P0-1 | Human gates [247] | 0/7 R14-A gates evidenced | Cannot enable live money legally | Complete human intake | **Yes** (production) |
| P0-2 | `payment/payment.service.ts` | No live adapter; hardwired mock | All money is fake | Implement adapter dispatch + live adapter | **Yes** (functional) |

### P1 — implementation blocker

| ID | File | Problem | Impact | Fix | Blocks R14-A? |
|----|------|---------|--------|-----|---------------|
| P1-1 | Local DB | 34 pending migrations | Code/DB mismatch; tests fail | `migrate deploy` on all envs | **Yes** (testing) |
| P1-2 | `20260827180000_multi_tenant_rls` | Hardcoded DB role password | Credential leak in migration history | Rotate + external secret mgmt | Staging prod |
| P1-3 | `payment/router.ts:36` | Sandbox-only gateway filter | Live gateways never routed | Environment-aware routing | **Yes** |
| P1-4 | `orders/order.service.ts` | Order refund ≠ payment refund | Customer refund inconsistency | Wire to PaymentService.refund | No (parallel) |

### P2 — significant technical debt

| ID | Finding |
|----|---------|
| P2-1 | Webhook: no timestamp/replay window beyond event dedupe |
| P2-2 | Default `sandbox-webhook-secret` |
| P2-3 | Risk adapter stub always allows |
| P2-4 | Clinical search indexing not event-driven |
| P2-5 | Analytics rollups + CRM automation: no scheduler |
| P2-6 | web-customer typecheck failure (`store-home.tsx`) |
| P2-7 | Loyalty API without any web UI |

### P3 — minor debt

| ID | Finding |
|----|---------|
| P3-1 | Admin search reindex UI missing |
| P3-2 | `/me/recommendations` page missing |
| P3-3 | `PAYMENT_*` not documented in `.env.example` |
| P3-4 | web-admin has zero unit tests |

---

## 20. Final “what is actually done?” matrix

| Area | Actual code status | Tests | Runtime | Production ready? | Remaining work |
|------|-------------------|-------|---------|-------------------|----------------|
| Commerce | COMPLETE sandbox | e2e | API up | **No** | R14-A live pay |
| Care | COMPLETE sandbox | e2e | API up | **No** | R4 live video |
| Lab | COMPLETE sandbox | e2e | API up | **No** | Live pay/settlement |
| Imaging | COMPLETE sandbox | e2e | API up | **No** | Same |
| Health records | COMPLETE | e2e | API up | **No** | Legal gates OD-EHR |
| CRM | COMPLETE | e2e | API up | **No** | ESP integration |
| Search | PARTIAL | e2e | DB lag | **No** | Migrations, admin UI |
| Discovery | COMPLETE | e2e | API up | **No** | — |
| Recommendations | PARTIAL | e2e | DB lag | **No** | UI page |
| Analytics | PARTIAL | e2e | DB lag | **No** | Cron scheduler |
| Clinical search | PARTIAL fail-closed | e2e | DB lag | **No** | Auto-index; legal gate |
| Payments | MOCK/SANDBOX | e2e mock | Sandbox | **No** | **R14-A entire scope** |
| Finance/ledger | MOCK/SANDBOX | e2e | API up | **No** | R14-B payouts |
| Logistics | MOCK/SANDBOX | e2e | Worker up | **No** | R14 live carrier |
| Affiliate | PARTIAL | e2e | DB lag | **No** | Customer attribution UI |
| Admin | PARTIAL UI | sparse | API up | **No** | Search reindex, loyalty |
| Customer web | PARTIAL | few | TS error | **No** | Fix store-home |
| Mobile | PARTIAL | parity specs | Not verified | **No** | Full journeys |

---

## 21. Final R14-A work plan

### Step 1 — Before R14-A implementation

1. Human gates 1–7 evidenced ([247](247_R14_A_HUMAN_GATE_EVIDENCE.md)) — **mandatory**
2. Authorize `CR-R14-A-IMPL-244` via formal CR
3. Apply all pending migrations on dev/staging (`prisma migrate deploy`)
4. Fix web-customer typecheck (`store-home.tsx` EmptyState props)
5. Ensure `pnpm` on PATH for jest/CI

### Step 2 — R14-A implementation (dependency order)

1. Adapter registry + `PaymentService` dispatch by `gatewayCode`
2. Environment-aware `PaymentRouter` (sandbox vs production)
3. First live adapter (per named PSP gate) implementing `PaymentGatewayPort`
4. Provider webhook verification (signature, timestamp, replay)
5. Vault-backed secret loading (no defaults in prod)
6. Wire `gateway_refs` in country packs to gateway seed/config
7. Risk adapter real rules or defer with explicit pack gate
8. Unify order refund with payment refund
9. Production gateway seed migration (separate from mock)

### Step 3 — Tests required

- `r14a.*.e2e.spec.ts` — adapter contract tests (PSP sandbox mode)
- Webhook security tests (replay, bad signature, unknown event)
- Refund partial/full + ledger reconciliation
- Policy fail-closed when `payments.enabled: false`
- PCI boundary regression (`pci.spec.ts`)

### Step 4 — Staging/runtime verification

- DB at migration head
- PSP sandbox credentials in vault
- `/health/ready` with redis + bullmq
- End-to-end checkout → webhook → order → ledger
- Reconcile admin flow

### Step 5 — Post-R14-A audit

- Book **254** (recommended): `POST_R14_A_AUDIT.md`
- Verify no mock adapter in production config
- Verify human gates still valid

### Step 6 — R14-B prerequisites

- MoR settlement rules
- Payout provider selection
- Tax/FX handling
- Live carrier adapter (DHL or equivalent) — separate from PSP

---

## 22. CR number

**Book 253 / `CR-FULL-CODEBASE-AUDIT-253` is correct.**

Sequence verified in [00_MASTER_INDEX.md](00_MASTER_INDEX.md):
- **251** — Pre-R14-A final gate verification (latest numbered book)
- **252** — `CR-R14-A-HUMAN-GATE-EVIDENCE-252` (final evidence intake pass recorded **inside** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md); no separate book file)
- **253** — This full ground-truth codebase audit (successor to [241](241_FULL_PROJECT_AUDIT.md), which was pre-R14 planning)

**Next authorized engineering CR (after human gates):** `CR-R14-A-IMPL-244` per [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md) — **NOT authorized today**.

**Next recommended audit CR:** `CR-POST-R14-A-AUDIT-254` after R14-A implementation.

---

## 23. Audit artifact confirmation

| Artifact | Action |
|----------|--------|
| `docs/blueprint/253_FULL_CODEBASE_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** — row 253 |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** — §11 R14 pointer |

**No other files modified.**

---

**HARD STOP. No implementation in CR-253.**
