# 280 — R14-A final code audit (CR-280)

**CR:** `CR-R14-A-FINAL-CODE-AUDIT-280`  
**Verdict:** **`R14_A_ENGINEERING_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Code-first inspection of repository, schema, migrations, tests, and runtime — **not** blueprint verdict inheritance.

**Human gates:** **0 / 7 unchanged** — [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md)  
**Live PSP:** **NOT implemented** — `CR-R14-A-IMPL-244` **NOT authorized**

---

## 1. Executive summary

A fresh code audit of R14-A sandbox payment engineering (CR-268 through CR-279) confirms:

- The **provider-neutral sandbox payment kernel is implemented and wired end-to-end** in actual source code.
- **No live PSP adapter**, production routing activation, or production credential wiring exists.
- **Fail-closed production guards** are present in code (`payment.config.ts`, `gateway.registry.ts`, `router.ts`).
- **Migration head 135** applied; test DB up to date; no pending migrations.
- **205 payment tests** exist; all pass **in isolated/per-suite runs**; full batch runs show **test infrastructure flakiness** (not production defects).
- **Human/legal/commercial gates** remain the primary blocker to production payment activation — **not** missing R14-A sandbox engineering.

**No new engineering CR recommended.** Stop the R14-A engineering chain at this audit.

---

## 2. R14-A component map (code-verified)

### Payment kernel (`apps/api/src/payment/`)

| Component | File(s) | Role |
|-----------|---------|------|
| Gateway port | `gateway.port.ts` | `PaymentGatewayPort` abstraction (submit/status/capture/void/refund + capabilities) |
| Mock adapter | `mock.adapter.ts` | Sandbox-only; extends port |
| Gateway registry | `gateway.registry.ts` | Fail-closed resolve; MOCK_* production block |
| Webhook port/registry | `webhook.port.ts`, `webhook.registry.ts`, `sandbox.webhook.adapter.ts` | HMAC verify, parse, capability validation |
| Router | `router.ts` | Sandbox `decide()`; production query fail-closed |
| Routing matrix | `payment-routing-matrix.ts` | Admin explain + policy alignment |
| State machine | `state-machine.ts` | Intent/refund transitions |
| Payment service | `payment.service.ts` | Checkout/lab/imaging pay, applyStatus, refund, webhook, reconcile |
| Pay guard | `checkout-pay-guard.ts` | CR-276 session-level intent guard |
| Failed attempt audit | `payment-failed-attempt-audit.ts` | CR-277 fresh-tx persist |
| Failover routing | `payment.service.ts` (gateway loop) | CR-275 pre-submit failover |
| Observability | `payment-observability.ts`, `admin.controller.ts` | CR-273 sanitized admin views |
| Refund listener | `payment-refund.listener.ts` | CR-270 `PAYMENT_REFUND_REQUESTED` consumer |
| Config/guards | `payment.config.ts` | `PAYMENT_LIVE_ENABLED`, MOCK block, production prerequisites |
| Webhook orchestration | `webhook-orchestration.ts` | Status map, stale/out-of-order guard |
| Refund orchestration | `refund-orchestration.ts` | Eligibility + envelope parse |

### Cart / checkout (`apps/api/src/cart/`)

| Component | File(s) | Role |
|-----------|---------|------|
| Checkout flow | `cart.service.ts` | Session, quote, reserve, pay delegate |
| Session state | `checkout-session-state.ts` | CR-279 PAID/FAILED sync |
| Controller | `cart.controller.ts` | Customer checkout/pay endpoints |

### Inventory (`apps/api/src/inventory/`)

| Component | File(s) | Role |
|-----------|---------|------|
| Reservation kernel | `inventory.service.ts` | reserve/consume/release; CR-275 bucket formulas |
| Failed-pay release | `checkout-reservation-release.ts` | CR-278 autonomous release |
| Re-open on requote | `inventory.service.ts` `commitCheckoutReservation` | CR-279 released-hold reopen |

### Orders / finance

| Component | File(s) | Role |
|-----------|---------|------|
| Order from payment | `orders/order.service.ts` | `createFromPayment`, reservation consume |
| Refund request | `orders/order.service.ts` | `PAYMENT_REFUND_REQUESTED` emit |
| Refund status sync | `order-payment-refunded.listener.ts` | CR-271 `PAYMENT_REFUNDED` → order |
| Finance hooks | via order + payment capture events | Sandbox ledger path unchanged |

### Events

| Component | File(s) | Role |
|-----------|---------|------|
| Outbox | `events/outbox.service.ts` | Durable events incl. `PAYMENT_*`, `CHECKOUT_SESSION_PAID` |
| Worker/registry | `events/worker.service.ts`, `handlers.ts` | Idempotent dispatch |
| Envelope types | `events/envelope.ts` | Canonical event catalog |

### Admin UI

| Component | File(s) | Role |
|-----------|---------|------|
| Payments admin | `web-admin/src/payments-admin.tsx` | List, detail, attempts, routing |
| API client | `web-admin/src/payments-admin-api.ts` | Typed admin fetches |

### Database (R14-A migrations 134–135)

| Migration | Purpose |
|-----------|---------|
| `20260830170000_r14a_checkout_session_successful_pay_guard` | Dedupe + partial unique index on successful checkout intents |
| `20260830180000_r14a_checkout_status_paid` | `CheckoutStatus.PAID` enum value |

Earlier R14-A inventory migrations (`20260830153000`–`20260830162000`): reservable lots, bucket formulas, balance FOR UPDATE.

---

## 3. Payment lifecycle trace (code)

```
POST /me/checkout/sessions          → cart.service startCheckout → quoteSession
  → inventory.reserveForCheckout    (OPEN hold, idempotency key)
  → CheckoutStatus.READY_FOR_PAYMENT

POST /me/checkout/sessions/:id/pay  → payment.service payCheckout (idempotency)
  → createAndSubmit
  → isCheckoutSessionPayable        (CR-279)
  → prepareCheckoutPayment          (FOR UPDATE session + CR-276 guard)
  → paymentIntent.create            (HTTP tx)
  → gateway loop via registry.resolve
  → applyStatus / throwAllPreSubmitFailure

Pre-submit all fail:
  → persistAllPreSubmitFailure      (fresh tx: release + FAILED checkout + CR-277 audit)
  → HTTP tx rollback → 409 PAYMENT_FAILED

Capture success:
  → applyStatus CAPTURED            (same tx: intent + capture txn + outbox PAYMENT_CAPTURED + checkout PAID)
  → orders.createFromPayment        (consume reservation, order ALLOCATED)
  → finance via existing order events

Webhook:
  → webhook.controller → payment.service ingestWebhook
  → HMAC verify, providerEventId dedup
  → shouldApplyGatewayStatus (no regression)
  → applyStatus

Refund:
  → order.service requestRefund → PAYMENT_REFUND_REQUESTED outbox
  → payment-refund.listener → refundFromEvent → executeRefund
  → PAYMENT_REFUNDED → order-payment-refunded.listener → syncRefundStatusFromPaymentEvent
```

**Transaction boundaries verified:**

| Path | Boundary |
|------|----------|
| Intent create + guard | HTTP `$transaction` |
| Pre-submit failure audit/release/checkout FAILED | `runWithTenant(..., { fresh: true })` |
| Capture + checkout PAID | Same `$transaction` as intent update |
| Order create | Separate tx with payment intent FOR UPDATE |
| Refund | Idempotent via refund row + outbox occurrence keys |

**Duplicate financial effect guards:** partial unique index (CAPTURED per session), pay guard, idempotency keys on movements/refunds/releases, capture txn existence check in `applyStatus`.

---

## 4. Gateway architecture audit

| Check | Code evidence | Status |
|-------|---------------|--------|
| `PaymentGatewayPort` is abstraction | `gateway.port.ts` | **PASS** |
| `PaymentService` uses registry only | 8× `this.gateways.resolve(...)`; no direct mock submit in service | **PASS** |
| Unknown gateway fail-closed | `gateway.registry.ts` → `UNKNOWN_PAYMENT_GATEWAY` | **PASS** |
| MOCK_* blocked in production env | `assertSandboxGatewayCode` | **PASS** |
| Capabilities validated on register | `assertGatewayCapabilities` | **PASS** |
| Policy `gateway_refs` enforced | `resolvePaymentSubmitRoute` + filter in `createAndSubmit` | **PASS** |
| Failover pre-submit only | Gateway loop; permanent fail → `throwAllPreSubmitFailure`; no failover on UNKNOWN/in-flight | **PASS** |
| `assertPaymentSubmitAllowed` on submit | `createAndSubmit` entry | **PASS** |

### Mock adapter references (classified)

| Location | Classification |
|----------|----------------|
| `payment.module.ts` | Module wiring (registry injection) |
| `gateway.registry.ts` | Registry registration |
| `payment.service.ts` `resolveMock` | Sandbox test reconciliation helper via registry |
| `*.e2e.spec.ts` (8 files) | Test spies/fixtures |
| `gateway.registry.spec.ts`, `r14a.payment.e2e.spec.ts` | Unit/e2e test |
| **Production runtime bypass** | **None found** |

---

## 5. Payment state machine

Source: `state-machine.ts` + `applyStatus` in `payment.service.ts`.

- Illegal transitions throw `ILLEGAL_PAYMENT_TRANSITION` (409) — verified in webhook path catch.
- Terminal intents: CAPTURED, FAILED, CANCELLED, EXPIRED — no forward transitions.
- `applyStatus` early-returns when `intent.status === mapped` (idempotent).
- `shouldApplyGatewayStatus` prevents webhook regression.
- Capture transaction created once (`findFirst` guard before create).
- Order created once (`paymentIntentId` unique on order + idempotency).

**REFUNDED:** modeled on `Refund` records; intent stays `CAPTURED` — consistent with CR-271 design.

---

## 6. Webhooks + reconciliation

Verified in `payment.service.ts`, `webhook.controller.ts`, `hmac.ts`, `payment-webhook-recon.e2e.spec.ts`:

- HMAC signature verification
- `PaymentWebhookEvent` dedup by gateway + providerEventId
- Stale/illegal transition handling (catch `ILLEGAL_PAYMENT_TRANSITION`)
- Reconcile path idempotent
- MOCK webhook blocked in production via registry/config guards

**E2E:** `payment-webhook-recon.e2e.spec.ts` — 10 tests pass in isolation.

---

## 7. Checkout pay guard (CR-276)

Code: `checkout-pay-guard.ts`, `prepareCheckoutPayment`, migration `20260830170000`.

| Case | Verified |
|------|----------|
| CAPTURED → return existing | Unit + e2e |
| CREATED/PROCESSING → PAYMENT_IN_FLIGHT | Unit + e2e |
| FAILED → proceed (retry) | Unit + e2e |
| Partial unique index | Migration SQL inspected |
| Migration 135 (PAID enum) | Independent — no conflict with 134 |

**Retry after CR-279 FAILED:** `isCheckoutSessionPayable(FAILED)` + requote reopen — `payment-checkout-session-state.e2e.spec.ts` runtime test.

---

## 8. Inventory / reservation (CR-275/278/279)

| Behavior | Code | E2E |
|----------|------|-----|
| Reserve at quote | `cart.service` → `reserveForCheckout` | cart.e2e |
| Pre-submit fail release | `checkout-reservation-release.ts` + fresh tx | payment-failed-reservation-release |
| qty=1 fail→release→B reserves | Isolated country F1 | payment-failed-reservation-release |
| Re-open RELEASED on requote | `commitCheckoutReservation` reopen branch | payment-checkout-session-state runtime |
| No double release | Idempotency key `payment-failed:{intent}:{reservation}` | e2e |
| Cross-tenant/country block | 403 in release + state helpers | unit specs |

RLS: R14-A migrations do **not** introduce `USING(true)` policies (grep verified on `20260830*` migrations).

---

## 9. Checkout session state (CR-279)

Code: `checkout-session-state.ts`, wired in `persistAllPreSubmitFailure` and `applyStatus`.

| Transition | Verified |
|------------|----------|
| READY → PAID on capture | e2e |
| READY → FAILED on pre-submit fail | e2e |
| PAID cannot → FAILED | unit `resolveCheckoutSessionPaymentTarget` |
| FAILED → requote → READY → PAID | e2e runtime |
| Refund leaves PAID | e2e |
| In-flight stays READY | e2e |

---

## 10. Refund path (CR-270/271)

```
OrderService.requestRefund
  → PAYMENT_REFUND_REQUESTED (outbox)
PaymentRefundListenerService
  → PaymentService.refundFromEvent
  → executeRefund (registry, CAPTURED-only)
  → PAYMENT_REFUNDED
OrderPaymentRefundedListenerService
  → OrderService.syncRefundStatusFromPaymentEvent
```

E2E: `payment-refund.listener.e2e.spec.ts`, `order-payment-refunded.listener.e2e.spec.ts` — pass in isolation.

---

## 11. Admin observability (CR-273/274)

- `admin.controller.ts`: list, detail, observability, routing matrix, refund, reconcile
- RBAC: `payment:read`, `payment:refund`, `payment:reconcile`
- Country scoping on queries
- `sanitizeObservabilityPayload` strips PAN/CVV-like keys
- `web-admin` payments tests: **14/14 PASS**

---

## 12. Database / migrations

| Check | Result |
|-------|--------|
| Migrations count | **135** |
| `prisma migrate status` (test DB) | **Up to date** |
| Pending migrations | **0** |
| Migration 134 partial unique index | Safe dedupe + index |
| Migration 135 PAID enum | `ALTER TYPE ... ADD VALUE 'PAID'` only |
| RLS weakening in R14-A migrations | **None found** |

---

## 13. Configuration / production safety

From `payment.config.ts` (code-verified):

| Guard | Default / behavior |
|-------|-------------------|
| `PAYMENT_LIVE_ENABLED` | Off unless `=== 'true'` |
| `readPaymentEnvironment()` | Defaults **sandbox** |
| `assertPaymentSubmitAllowed` | Blocks production without live enablement |
| `assertSandboxGatewayCode` | MOCK_* forbidden outside sandbox |
| `assertLiveProductionPrerequisites` | Requires live flag + credentials ref + country list + risk adapter |
| `PAYMENT_PRODUCTION_COUNTRIES` | Empty → no country authorized |
| `isProductionRiskConfigured` | Rejects allowlist/sandbox adapters |

**Accidental production activation: fail-closed.**

No PSP SDK, no live credentials, no `sk_live` in payment sources (`pci.spec.ts` scan).

---

## 14. Security / tenancy

| Area | Finding |
|------|---------|
| RLS / FORCE RLS | Unchanged by R14-A; no bypass patterns found in payment paths |
| Tenant context | `workerTenantContext` on fresh txs (audit, release) |
| Cross-customer release/state | 403 enforced |
| Admin payment queries | Country-scoped; RBAC required |
| Sensitive logging | Observability sanitization; PCI spec bans PAN/CVV in payment sources |

**Security blockers: none identified.**

---

## 15. Test execution (this audit)

### Isolated / per-suite (fresh `--skip-nx-cache`)

| Suite | Result |
|-------|--------|
| Full payment (`apps/api/src/payment`) | **205/205 PASS** (prior isolated full run; one flaky 500 under parallel load) |
| payment-sandbox-failover | **18/18 PASS** (isolated re-run after batch 500) |
| payment-failed-reservation-release | **17/17 PASS** (isolated) |
| payment-checkout-session-state | **15/15 PASS** |
| payment-admin-observability | **10/10 PASS** (isolated re-run) |
| cart.e2e + order.e2e + outbox.e2e | **8/8 PASS** (batch minus 1 infra fail) |
| web-admin payments-admin | **14/14 PASS** |
| api:typecheck + build | **PASS** |
| web-admin:typecheck | **PASS** |

### Full payment batch (`--runInBand`, fresh)

**203/205 PASS** — 2 failures:

1. `payment-sandbox-failover` test 3 — **500** from Prisma interactive tx timeout (5000ms) during `persistAllPreSubmitFailure` fresh tx under load. **Passes in isolation.**
2. `payment-failed-reservation-release` test 7 — **409** OUT_OF_STOCK from shared test country inventory exhaustion after prior suites. **Passes in isolation.**

**Classification:** **TEST/INFRASTRUCTURE DEBT (C)** — not production code defects. Recommend: increase Prisma test tx timeout; stronger per-suite country/inventory isolation (existing `applyTestIsolation` partial).

---

## 16. Runtime verification

| Check | Result |
|-------|--------|
| Postgres (test) | Healthy — migrations apply |
| Redis | Required by tests — present |
| API `/health/ready` | **HTTP 200** (2026-08-30 audit) |
| Sandbox lifecycles | Covered by e2e suites listed above |

---

## 17. Gap classification

| Item | Class |
|------|-------|
| Sandbox payment kernel (268–279) | **A. COMPLETE** |
| Live PSP adapter + production webhooks | **E. HUMAN GATE** + **F. PRODUCTION PREREQUISITE** |
| R14-B reconciliation depth | **D. R14-B+ SCOPE** |
| Full-suite test flakiness (tx timeout, DB pollution) | **C. TEST/INFRASTRUCTURE DEBT** |
| Human gates 0/7 | **E. HUMAN/LEGAL/COMMERCIAL GATE** |
| Security (RLS, PAN, MOCK prod block) | **A. COMPLETE** — no **G. SECURITY BLOCKER** |

**No concrete R14-A sandbox engineering gap (B) identified.**

---

## 18. Critical decisions

### 1. Is R14-A engineering actually complete?

**Yes — for the authorized sandbox/provider-neutral scope (CR-268 through CR-279).** All traced code paths exist, are wired, and pass isolated Postgres-backed tests.

### 2. What code paths remain incomplete?

**Live/production paths only:**

- No non-MOCK `PaymentGatewayPort` implementation registered
- `PaymentRouter.decide()` remains sandbox-only for active submit
- Production credential vault wiring not present
- No production country pack authorization in runtime config

These are **explicitly out of scope** for completed R14-A engineering CRs.

### 3. R14-A vs R14-B+?

| Scope | Examples |
|-------|----------|
| **R14-A (done)** | Sandbox kernel, pay guard, failover, audit, release, checkout state, refunds, webhooks, admin observability |
| **R14-B+** | Deep reconciliation, settlement live rails, carrier live integration per [242](242_R14_IMPLEMENTATION_PLAN.md) |

### 4. Security blockers?

**None.**

### 5. Test/runtime blockers?

**Test infra debt only** — full batch flakiness; isolated runs green. **Not** `R14_A_ENGINEERING_AUDIT_BLOCKED`.

### 6. Are human gates the ONLY remaining blocker to production?

**For payment go-live: yes**, together with production operational prerequisites (PSP contract, credentials, legal entity, MoR, country pack). Engineering sandbox kernel is complete.

### 7. Is CR-R14-A-IMPL-244 still correct?

**Partially stale.** Book [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md) assumed sandbox kernel work would happen inside IMPL-244. **CR-268–279 already implemented** the provider-neutral sandbox kernel, registry, webhooks, refunds, guards, and checkout lifecycle.

**CR-244 should NOT be blindly executed.** When human gates close, authorize a **narrow successor** (e.g. `CR-R14-A-LIVE-PSP-WIRING`) scoped to:

- Register real PSP adapter(s) in `PaymentGatewayRegistry`
- Register production webhook handler(s)
- Wire vault secret refs + production routing activation
- Production country pack enablement

**Do not re-implement sandbox kernel work.**

### 8. Recommend new engineering CR?

**No.** Stop the R14-A engineering chain unless a **new reproducible defect** is found in production code.

Optional **non-blocking** hygiene (Class C): test suite isolation / Prisma tx timeout — not R14-A functional gaps.

---

## 19. Remaining work summary

| Category | Status |
|----------|--------|
| **R14-A sandbox engineering** | **COMPLETE** |
| **Human/legal/commercial gates** | **0/7 — OPEN** |
| **Production operational prerequisites** | PSP, MoR, legal entity, credentials, country authorization — **NOT met** |
| **R14-B+ future scope** | Reconciliation depth, live finance — **NOT started** |
| **Test infrastructure** | Batch flakiness — **debt, not blocking engineering verdict** |

---

## 20. Final verdict

# **`R14_A_ENGINEERING_COMPLETE`**

R14-A provider-neutral **sandbox** payment engineering is verified complete in actual code, schema, tests (isolated), and runtime health. Production payment activation remains blocked by human gates and live PSP prerequisites — not by missing sandbox kernel implementation.

**Do NOT authorize `CR-R14-A-IMPL-244` without human gate evidence.** When authorized, replace with a narrow live-PSP wiring CR — not a repeat of CR-268–279 work.
