# 261 — R14-A engineering hardening

**CR:** `CR-R14-A-ENGINEERING-HARDENING-261`  
**Verdict:** **`R14_A_ENGINEERING_HARDENING_COMPLETE`**  
**Date:** 30 August 2026  
**Prior prep:** [259](259_R14_A_ENGINEERING_PREPARATION.md) (**R14_A_ENGINEERING_PREP_COMPLETE**)  
**Human gates:** [260](260_R14_A_GATE_INTAKE.md) — **0/7 NOT EVIDENCED** (unchanged)

PSP-neutral payment hardening only. **No live PSP SDK, no human gate fabrication, no production activation.**

---

## 1. Executive summary

Deep hardening pass on the sandbox payment kernel identified **five genuine defects** in idempotency, webhook handling, and environment safety. All were fixed without schema changes or live PSP work.

**Human authorization remains 0/7. R14-A live implementation is NOT authorized.**

---

## 2. Defects found and fixes applied

| # | Defect | Fix |
|---|--------|-----|
| 1 | **`applyStatus` not idempotent** — duplicate webhooks with same target status created duplicate capture transactions and re-entered post-capture side effects | Early return when `intent.status === mapped` (no-op) |
| 2 | **Webhook illegal transitions surfaced as errors** — stale callbacks (e.g. `failed` after `CAPTURED`) could fail ingestion | Catch `ILLEGAL_PAYMENT_TRANSITION` in `ingestWebhook`; accept event, ignore transition |
| 3 | **Gateway environment hardcoded `'sandbox'`** in service dispatch | `RoutingDecision.gatewayEnvironment` + `resolveAttemptGateway()` reads frozen routing JSON / DB |
| 4 | **Mock gateway could bind to production environment row** | `assertSandboxGatewayCode()` — `MOCK_*` forbidden when `gatewayEnvironment !== 'sandbox'` |
| 5 | **No optional webhook replay skew check** | Optional `x-sandbox-timestamp` header (300s skew); absent header preserves existing sandbox contract |

---

## 3. Files changed

| File | Change |
|------|--------|
| `apps/api/src/payment/payment.service.ts` | Idempotent `applyStatus`; webhook transition swallow; environment-aware gateway resolve |
| `apps/api/src/payment/router.ts` | `gatewayEnvironment` on routing decision + routing JSON |
| `apps/api/src/payment/gateway-code.ts` | `gatewayEnvironmentFromRouting()` |
| `apps/api/src/payment/gateway.registry.ts` | `assertSandboxGatewayCode` before resolve |
| `apps/api/src/payment/payment.config.ts` | `isMockGatewayCode`, `assertSandboxGatewayCode` |
| `apps/api/src/payment/hmac.ts` | Optional `verifySandboxTimestamp` |
| `apps/api/src/payment/sandbox.webhook.adapter.ts` | Timestamp verification in verify path |
| `apps/api/src/payment/webhook.controller.ts` | Forward `x-sandbox-timestamp` header |
| `apps/api/src/payment/state-machine.spec.ts` | Expanded terminal/idempotency tests |
| `apps/api/src/payment/hmac.spec.ts` | **New** — timestamp + signature tests |
| `apps/api/src/payment/router.spec.ts` | **New** — sandbox-only gateway query |
| `apps/api/src/payment/payment.config.spec.ts` | Mock-gateway production forbid tests |
| `apps/api/src/payment/gateway.registry.spec.ts` | Updated production mock test |
| `apps/api/src/payment/payment.e2e.spec.ts` | Replay webhook idempotency assertion |

**Not changed:** Prisma schema/migrations, Book 247/35, clinical search, R14-B–G, live PSP code.

---

## 4. Architecture verification (§1 CR)

| Check | Result |
|-------|--------|
| `PaymentService` uses registry only (no direct mock) | **PASS** |
| Unknown gateway fails closed | **PASS** (`UNKNOWN_PAYMENT_GATEWAY`) |
| Missing adapter fails closed | **PASS** |
| Sandbox behavior preserved | **PASS** (e2e) |
| `RiskPort` abstraction injected | **PASS** (unchanged from CR-259) |
| `PaymentRouter` sandbox-only filter | **PASS** (router.spec + unchanged filter) |

---

## 5. Tests added / updated

| Suite | Tests |
|-------|-------|
| `state-machine.spec.ts` | +2 (terminal states, same-status idempotency) |
| `hmac.spec.ts` | +4 (new file) |
| `router.spec.ts` | +1 (new file) |
| `payment.config.spec.ts` | +2 |
| `payment.e2e.spec.ts` | +1 scenario (captured replay webhook) |

---

## 6. Exact test results

| Suite | Result |
|-------|--------|
| **Payment** (8 suites, **22 tests**) | **ALL PASS** |
| **Order e2e** (1 suite, 1 test) | **PASS** |
| **Catalog e2e** (1 suite, 1 test) | **PASS** |
| **R12-C promo e2e** (1 suite, 4 tests) | **PASS** |
| **R13-B discovery e2e** (1 suite, 3 tests) | **PASS** |
| **R13-C provider search e2e** (1 suite, 1 test) | **PASS** |
| **API typecheck** | **PASS** |
| **web-customer typecheck** | **PASS** |
| **web-admin typecheck** | **PASS** |
| **mobile typecheck** | **PASS** |

**CR-261 executed total:** 32 API tests — **0 failures**

**Note:** `nx build api` requires Nx workspace context (pre-existing infra limitation per Book 253). Typecheck validates compile correctness.

---

## 7. Security results

| Check | Status |
|-------|--------|
| No PAN/CVV introduced | **PASS** (`pci.spec.ts`) |
| No secrets committed | **PASS** |
| No live PSP SDK | **PASS** |
| Mock forbidden in production env rows | **PASS** (new guard) |
| Live mode cannot activate accidentally | **PASS** (`PAYMENT_LIVE_ENABLED` required) |
| Webhook signature required | **PASS** |
| Optional timestamp replay skew | **PASS** (when header sent) |
| Human gates unchanged | **PASS** (0/7) |
| Clinical search unchanged | **PASS** |
| Production country disabled | **PASS** (`empty-pack`) |

---

## 8. Runtime results

| Check | Result |
|-------|--------|
| `/health/ready` | **200** |
| Postgres dev migrations | **128/128 up to date** |
| Postgres test migrations | **128/128 up to date** |
| Sandbox payment e2e | **PASS** |

---

## 9. Database consistency (§9)

| Item | Finding |
|------|---------|
| Schema changes | **None required** |
| `payment_intents.idempotency_key` | `@unique` — sufficient |
| `payment_webhook_events (gatewayId, providerEventId)` | `@@unique` — dedupe sufficient |
| `orders.payment_intent_id` | `@unique` — prevents duplicate orders |
| `refunds.idempotency_key` | `@unique` — sufficient |
| RLS | Unchanged — no defect found |

---

## 10. Intentionally deferred (provider-specific / human-gated)

| Item | Reason |
|------|--------|
| Live PSP adapter + SDK | Gate 1 — no named PSP |
| Live webhook signature formats | Gate 1 + live enablement |
| Order `requestRefund` → payment intent orchestration | OD-PAY-01 / chargeback owner TBD |
| Production fraud/risk vendor | No vendor selected |
| Mandatory webhook timestamp (breaking change) | Optional only — documented skew window |
| Full concurrent load/idempotency stress suite | Out of scope; DB unique constraints + Redis lock exist |

---

## 11. Remaining R14-A work (after human gates)

1. Owner supplies **7/7** gate evidence  
2. Populate Book 247 + Book 35 `DECIDED`  
3. **`CR-PRE-R14-A-GATE-258`** → `R14_A_GATES_GREEN`  
4. **`CR-R14-A-IMPL-244`** — register live adapter + webhook handler + production env

---

## 12. Final verdict

### Verdict

**`R14_A_ENGINEERING_HARDENING_COMPLETE`**

### Authorization

**R14-A live PSP implementation is NOT complete or authorized.**

Human gates: **0/7 — NOT EVIDENCED**
