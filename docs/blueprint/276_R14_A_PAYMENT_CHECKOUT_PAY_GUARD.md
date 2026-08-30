# 276 — R14-A checkout pay guard (CR-276)

**CR:** `CR-R14-A-PAYMENT-CHECKOUT-PAY-GUARD-276`  
**Verdict:** **`R14_A_PAYMENT_CHECKOUT_PAY_GUARD_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [275](275_R14_A_PAYMENT_SANDBOX_FAILOVER.md) (**R14_A_PAYMENT_SANDBOX_FAILOVER_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Prevent duplicate `PaymentIntent` creation when a checkout session already has a successful payment and the client submits pay again with a **different** idempotency key. **No live PSP. No new payment kernel. No human gate changes.**

---

## 1. Root cause (CR-275 limitation)

| Symptom | Repeat `POST /me/checkout/sessions/:id/pay` on a **CAPTURED** checkout with a **new** `Idempotency-Key` created a second intent |
|---------|---|
| Path | `CartController.pay` → `PaymentService.payCheckout` → `withIdempotency(personId, key)` → `createAndSubmit` → unconditional `paymentIntent.create` |
| Why | Idempotency is scoped to `(personId, idempotencyKey)` only; checkout session stays `READY_FOR_PAYMENT` after capture; no session-level pay guard existed before intent creation |
| Impact | Second gateway submit, second attempt, duplicate capture/order/event risk |

---

## 2. Guard design

### Classification (`checkout-pay-guard.ts`)

| Existing intent status | Action |
|------------------------|--------|
| `CAPTURED`, `AUTHORIZED_COD` | **Return existing** intent (already paid) |
| `REQUIRES_ACTION`, `AUTHORIZED`, `UNKNOWN` | **Return existing** (client continuation) |
| `CREATED`, `PROCESSING` | **409** `PAYMENT_IN_FLIGHT` |
| `FAILED`, `CANCELLED`, `EXPIRED` | **Proceed** — legitimate retry |
| None | **Proceed** — first pay |

Refunds are modeled on `Refund` records, not `PaymentIntentStatus`; captured intents remain `CAPTURED`. No new pay on the same checkout session is allowed once successful.

### Guard location (`PaymentService.prepareCheckoutPayment`)

Applied inside `createAndSubmit()` immediately before intent creation (CARD and COD paths):

1. `SELECT checkout_sessions … FOR UPDATE` (row lock)
2. Load checkout-linked intents
3. `resolveCheckoutPayGuard()`
4. Return existing presentation, reject in-flight, or create intent inside the same DB transaction

Gateway submission runs **after** the transaction commits, so in-flight `CREATED` intents block parallel pays.

### Concurrency strategy

| Layer | Mechanism |
|-------|-----------|
| Application | Checkout session row lock + guard in one `$transaction` |
| Database | Partial unique index: one `CAPTURED` / `AUTHORIZED_COD` intent per `checkout_session_id` |
| Idempotency | Existing `(personId, key)` replay unchanged — complementary, not replaced |

Legacy duplicate successful rows in dev/test are deduped (extras marked `FAILED`) before index creation in migration `20260830170000`.

---

## 3. API contract

| Case | HTTP | Code | Body |
|------|------|------|------|
| Already paid (`CAPTURED` / `AUTHORIZED_COD`) | **201** | — | Existing payment intent presentation (same as idempotent replay; least disruptive) |
| In flight (`CREATED` / `PROCESSING`) | **409** | `PAYMENT_IN_FLIGHT` | Problem detail |
| Continuation (`REQUIRES_ACTION` / `AUTHORIZED` / `UNKNOWN`) | **201** | — | Existing intent |
| Legitimate retry after `FAILED` / `CANCELLED` / `EXPIRED` | **201** | — | New intent |
| Same idempotency key replay | **201** | — | Cached idempotency body (unchanged) |

No gateway call, no second `PaymentAttempt`, no duplicate capture transaction, order, or outbox event when returning an existing captured payment.

---

## 4. Code changes

| File | Change |
|------|--------|
| `checkout-pay-guard.ts` | Pure guard classification |
| `checkout-pay-guard.spec.ts` | Unit tests (7) |
| `payment.service.ts` | `prepareCheckoutPayment()`; wired in CARD + COD paths |
| `payment-checkout-pay-guard.e2e.spec.ts` | 14 mandatory e2e scenarios |
| `migrations/20260830170000_r14a_checkout_session_successful_pay_guard` | Dedupe + partial unique index |

---

## 5. Tests

### Focused (`checkout-pay-guard` + `payment-checkout-pay-guard`)

1. First pay → one intent  
2. Same idempotency key → no duplicate  
3. Different idempotency key on captured → no second intent  
4. Different session → independent payment  
5. Failed payment → retry allowed  
6. Transient pre-submit failover → one captured intent  
7. Captured → gateway not called again  
8. Captured → no second attempt  
9. Captured → no duplicate `PAYMENT_CAPTURED` outbox event  
10. Captured → no duplicate order  
11. Concurrent duplicate pay → one captured intent  
12. DB replay after capture → guarded  
13. Cross-customer pay → 403  
14. Admin observability → one attempt, no sensitive fields  

### Regression

| Suite | Result |
|-------|--------|
| `apps/api/src/payment` (22 suites) | **164/164 pass** |
| `cart.e2e.spec.ts`, `order.e2e.spec.ts` | pass |
| CR-270 refund listener | included in payment suite |
| CR-271 order refund status | included in payment suite |
| CR-272 webhook recon | included in payment suite |
| CR-273 observability | included in payment suite + e2e test 14 |
| CR-274 routing matrix | included in payment suite |
| CR-275 sandbox failover | included in payment suite (18/18) |
| `api:typecheck` | pass |

---

## 6. Migration state

| Item | Value |
|------|-------|
| Head | **134** migrations (`20260830170000_r14a_checkout_session_successful_pay_guard`) |
| Dev/test | aligned; no pending migrations |
| Schema change | Partial unique index only; Prisma schema unchanged |

---

## 7. Runtime

| Check | Result |
|-------|--------|
| Postgres + Redis | healthy (docker compose) |
| `GET /health/ready` | **HTTP 200** (`http://127.0.0.1:4000/health/ready`) |

---

## 8. Security / isolation

- No PAN/CVV/secrets in responses or admin observability  
- `PAYMENT_LIVE_ENABLED` off; production routing/country packs disabled  
- MOCK_* production guard unchanged  
- RLS / FORCE RLS intact; tenant/country isolation on pay + admin reads  
- RBAC unchanged for authorized customer flow  

---

## 9. Human gates

**0/7 — unchanged.** `CR-R14-A-IMPL-244` **NOT authorized** from this CR.

---

## 10. Remaining R14-A engineering

| Priority | CR / track |
|----------|------------|
| Failed-attempt audit persistence | **`CR-R14-A-PAYMENT-FAILED-ATTEMPT-AUDIT-277`** — persist pre-submit failure attempts outside request transaction rollback for full fail-closed observability |
| Failed-pay reservation release | **`CR-R14-A-PAYMENT-FAILED-RESERVATION-RELEASE-278`** — release checkout inventory reservation when payment fails |
| Human track (parallel) | Owner evidence [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → `CR-R14-A-IMPL-244` when 7/7 gates evidenced |

**Next engineering CR:** **`CR-R14-A-PAYMENT-FAILED-RESERVATION-RELEASE-278`**
