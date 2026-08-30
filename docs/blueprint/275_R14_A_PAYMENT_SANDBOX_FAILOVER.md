# 275 — R14-A payment sandbox failover (CR-275)

**CR:** `CR-R14-A-PAYMENT-SANDBOX-FAILOVER-275`  
**Verdict:** **`R14_A_PAYMENT_SANDBOX_FAILOVER_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [274](274_R14_A_PAYMENT_ROUTING_MATRIX.md) (**R14_A_PAYMENT_ROUTING_MATRIX_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Sandbox gateway failover drill, checkout 409 baseline repair, attempt-level admin visibility. **No live PSP. No new routing kernel. No human gate changes.**

---

## 1. Checkout 409 root cause (CR-274 baseline)

**Classification:** **G + transactional side-effect (mixed)** — not a routing-matrix defect.

| Symptom | `POST /me/checkout/sessions` → **409** `Insufficient available quantity` |
|---------|---|
| Fresh lot pick | `app.reservable_lot_for_checkout` selected the correct GRN-seeded lot |
| Failure lot | Stale lot from polluted expired reservations (worker-visible globally) |
| Trigger | `commitCheckoutReservation()` → `expireDue()` → `releaseReservation()` → `apply()` with `delta: { reserved: -qty }` when `balance.reserved = 0` |
| Bucket check | `next.reserved < 0` → validation rejected (correct oversell guard) |

**Fix (application layer):** `releaseReservation()` clamps release quantity to `min(reservation.qty, balance.reserved)` using authoritative `app.get_balance_for_update()` before `apply()`. Orphaned/stale reservations are marked expired without driving buckets negative.

**Prior inventory hardening preserved (CR-275 continuation):** SECURITY DEFINER lot pick (`reservable_lot_for_checkout`), bucket-formula `available_qty`, `get_balance_for_update`, GRN-based payment e2e fixtures.

**Migrations (133 head, no new migration in final fix):** `20260830153000`–`20260830162000` (worker/platform lot read, reservable lots, bucket formula, balance lock).

---

## 2. Failover architecture (existing kernel)

| Component | Role |
|-----------|------|
| `PaymentRouter` + `resolvePaymentSubmitRoute()` | Ordered sandbox candidates, policy `gateway_refs` filter |
| `PaymentGatewayRegistry` | MOCK_PRIMARY / MOCK_FALLBACK dispatch |
| `PaymentService.createAndSubmit()` | Failover loop; stops on `PRE_SUBMIT_PERMANENT`; retries transient pre-submit |
| `presentAttemptHistory()` | CR-273 observability surface for admin |

**New sandbox scenario:** `pre_submit_fail_all` — all candidates receive transient pre-submit failure (test harness).

**Failover rules verified:**

- Primary success → no fallback attempt
- Primary transient → fallback success (deterministic priority)
- Both pre-submit fail → 409 fail-closed
- Permanent primary → no blind fallback
- Policy/router/registry restrictions → fail-closed (country, currency, method, gateway_refs, unknown gateway, payments disabled, production preview inactive)

---

## 3. Code changes

### Inventory / checkout

| File | Change |
|------|--------|
| `inventory.service.ts` | Safe TTL release clamp; removed temporary debug throws |

### Payment failover

| File | Change |
|------|--------|
| `gateway.port.ts` | `pre_submit_fail_all` scenario |
| `payment.service.ts` | `scenarioForGatewayAttempt()` helper |
| `payment-sandbox-failover.e2e.spec.ts` | 18-scenario failover drill |

### Admin UI

| File | Change |
|------|--------|
| `payments-admin-api.ts` | `PaymentAttemptHistory` type |
| `payments-admin.tsx` | Gateway attempts section (order, gateway, environment, outcome, failure class, fallback indicator) |
| `payments-admin.spec.tsx` | Attempt history unit tests |

### Tests / fixtures

| File | Change |
|------|--------|
| `payment.e2e.spec.ts` | Insufficient-inventory negative test (two-customer reservation race); debug removed |
| `seed-checkout-inventory.ts` | GRN seed helper (used across payment e2e) |

---

## 4. Verification

| Suite | Result |
|-------|--------|
| `apps/api/src/payment` (20 suites) | **143/143 pass** |
| `payment-sandbox-failover.e2e.spec.ts` | 18/18 pass |
| `cart.e2e.spec.ts`, `order.e2e.spec.ts` | pass |
| `api:typecheck`, `web-admin:typecheck` | pass |
| `web-admin` payment admin tests | 14/14 pass |
| Migrations | **133** applied (dev/test); no drift |
| Postgres + Redis | healthy (docker compose) |
| `GET /health/ready` | **HTTP 200** (`http://127.0.0.1:4000/health/ready`) |

---

## 5. Security

- No PAN/CVV/secrets in observability or admin UI
- `PAYMENT_LIVE_ENABLED` off; production routing/country packs disabled
- MOCK_* cannot execute in production (`mock_gateway_production_forbidden`)
- RLS / FORCE RLS intact; no `USING(true)` policies
- Tenant/country isolation preserved on admin payment reads

---

## 6. Known limitations (documented, not CR-275 blockers)

1. **Failed pay request rollback:** HTTP tenant transaction rolls back payment intents when `createAndSubmit()` throws (all-pre-submit-fail). Successful failover paths persist attempts for admin observability.
2. **Repeat pay on captured session:** Second pay with a new idempotency key on an already-captured checkout session can create a second intent (existing behavior); idempotent key replay returns the same result.

---

## 7. Human gates

**0/7 — unchanged.** `CR-R14-A-IMPL-244` **NOT authorized** from this CR.

---

## 8. Remaining R14-A engineering

| Priority | CR / track |
|----------|------------|
| Checkout session pay guard | **`CR-R14-A-PAYMENT-CHECKOUT-PAY-GUARD-276`** — reject second pay on captured checkout sessions (prevent duplicate intents) |
| Failed-attempt audit persistence | **`CR-R14-A-PAYMENT-FAILED-ATTEMPT-AUDIT-277`** — persist pre-submit failure attempts outside request transaction for full fail-closed observability |
| Human track (parallel) | Owner evidence [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → `CR-R14-A-IMPL-244` when 7/7 gates evidenced |

**Next engineering CR:** **`CR-R14-A-PAYMENT-CHECKOUT-PAY-GUARD-276`**
