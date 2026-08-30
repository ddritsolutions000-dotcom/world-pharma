# 259 — R14-A engineering preparation

**CR:** `CR-R14-A-ENGINEERING-PREP-259`  
**Verdict:** **`R14_A_ENGINEERING_PREP_COMPLETE`**  
**Date:** 30 August 2026  
**Human gates:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) / [258](258_R14_A_GATE_BLOCKER_RESOLUTION.md) — **0/7 NOT EVIDENCED** (unchanged)  
**Prior:** [255](255_PRE_R14_FULL_REGRESSION_HYGIENE.md) (**PRE_R14_REGRESSION_GREEN**)

Engineering preparation only. **No live PSP SDK, no production payment activation, no human gate fabrication.**

---

## 1. Executive summary

Payment architecture refactored so `PaymentService` dispatches through **`PaymentGatewayPort`** via a PSP-neutral **`PaymentGatewayRegistry`**, with provider-neutral webhook and configuration boundaries. Sandbox mock behavior is **fully preserved**. Unknown gateways and live environments **fail closed** without explicit enablement.

**R14-A live PSP implementation remains NOT authorized.** Human gates remain **0/7**.

---

## 2. Architecture before / after

### Before

| Component | Behavior |
|-----------|----------|
| `PaymentService` | Injected `MockPaymentGatewayAdapter` directly; 8 call sites used `this.mock` |
| Webhooks | HMAC verification inline in `PaymentService.ingestWebhook` |
| Refunds | Called `this.mock.refund` directly (bypassed gateway-code dispatch) |
| Risk | Injected `AllowlistRiskAdapter` concrete class |
| Config | No explicit payment environment contract |

### After

| Component | Behavior |
|-----------|----------|
| `PaymentService` | Injects `PaymentGatewayRegistry` + `PaymentWebhookRegistry`; resolves adapter by **gateway code** from routing/attempt |
| `PaymentGatewayRegistry` | DI-friendly map: `MOCK`, `MOCK_PRIMARY`, `MOCK_FALLBACK`, `MOCK_SECONDARY` → mock adapter; unknown → `UNKNOWN_PAYMENT_GATEWAY`; production env → `LIVE_PAYMENTS_DISABLED` unless `PAYMENT_LIVE_ENABLED=true` |
| `PaymentWebhookRegistry` + `SandboxWebhookAdapter` | Provider-neutral `PaymentWebhookPort`; sandbox HMAC preserved |
| `payment.config.ts` | Environment separation, fail-closed live runtime, safe secret-ref contract (paths only) |
| Refunds | Flow through `gateways.resolve(gatewayCode).refund(...)` using attempt routing metadata |
| Risk | Injected via `RiskPort` abstraction token (`useExisting: AllowlistRiskAdapter`) |

**Unchanged:** `PaymentRouter` sandbox filter (`environment: 'sandbox'`), state machine, idempotency, seed data, policy `payments.enabled: false` on empty pack.

---

## 3. Files changed

| File | Change |
|------|--------|
| `apps/api/src/payment/payment.service.ts` | Gateway registry dispatch; webhook registry; refund via port; `resolveAttemptGatewayCode` helper |
| `apps/api/src/payment/payment.module.ts` | Register registry, webhook adapter, `RiskPort` token |
| `apps/api/src/payment/gateway.registry.ts` | **New** — adapter registry |
| `apps/api/src/payment/gateway.registry.spec.ts` | **New** — registry unit tests |
| `apps/api/src/payment/gateway-code.ts` | **New** — routing JSON helper |
| `apps/api/src/payment/payment.config.ts` | **New** — environment + secret-ref contracts |
| `apps/api/src/payment/payment.config.spec.ts` | **New** — config unit tests |
| `apps/api/src/payment/webhook.port.ts` | **New** — webhook abstraction |
| `apps/api/src/payment/sandbox.webhook.adapter.ts` | **New** — sandbox HMAC handler |
| `apps/api/src/payment/webhook.registry.ts` | **New** — webhook dispatch |
| `apps/api/src/payment/webhook.registry.spec.ts` | **New** — webhook unit tests |
| `apps/api/src/payment/webhook.controller.ts` | Pass headers to webhook ingest |
| `.env.example` | Commented payment env placeholders (no secrets) |

**Not changed:** Book 247, Book 35, Prisma schema, migrations, `PaymentRouter`, `mock.adapter.ts`, clinical search, R14-B–G.

---

## 4. Tests run and exact results

| Suite | Result |
|-------|--------|
| `src/payment/` (6 suites, 13 tests) | **PASS** |
| — `gateway.registry.spec.ts` (3) | PASS |
| — `payment.config.spec.ts` (3) | PASS |
| — `webhook.registry.spec.ts` (3) | PASS |
| — `payment.e2e.spec.ts` (1) | PASS |
| — `pci.spec.ts` (1) | PASS |
| — `state-machine.spec.ts` (2) | PASS |
| `src/promo/r12c.promo.e2e.spec.ts` (R12-C) | **PASS** |
| `src/discovery/r13b.discovery.e2e.spec.ts` (R13-B) | **PASS** |
| `src/orders/order.e2e.spec.ts` (order/payment) | **PASS** |
| API typecheck (`tsc -p apps/api`) | **PASS** |
| Dev DB migrations | **128/128 up to date** |
| Test DB migrations | **128/128 up to date** |

**Note:** `nx build api` / direct `webpack-cli` require Nx workspace context (pre-existing infra limitation per Book 253). Typecheck validates compile correctness.

### Verified by new tests

- `PaymentService` uses `PaymentGatewayPort` via registry (no direct mock injection in service)
- Mock adapter still works (payment e2e)
- Unknown gateway fails closed (`UNKNOWN_PAYMENT_GATEWAY`)
- Production environment fails closed without `PAYMENT_LIVE_ENABLED` (`LIVE_PAYMENTS_DISABLED`)
- Router remains sandbox-only (unchanged code; e2e exercises routing)
- Webhook idempotency + sandbox HMAC preserved (payment e2e)
- State machine transitions preserved (`state-machine.spec.ts` + e2e)
- Refunds consistent through gateway port (payment e2e partial refund)

---

## 5. Security verification

| Check | Status |
|-------|--------|
| No PAN/CVV handling introduced | **PASS** (`pci.spec.ts`) |
| No secrets committed | **PASS** (`.env.example` comments only) |
| No live PSP SDK | **PASS** |
| No production payment routing | **PASS** (router sandbox filter + config fail-closed) |
| No production country enablement | **PASS** |
| No clinical-search changes | **PASS** |
| No R14-B–G work | **PASS** |
| Human gate status unchanged | **PASS** (0/7) |

---

## 6. Intentionally deferred (requires human/PSP decision)

| Item | Reason |
|------|--------|
| Live PSP adapter implementation | Gate 1 — named PSP not evidenced |
| Production gateway DB rows | Gates 1, 6 — no vault/credentials |
| Live webhook formats (Stripe/Razorpay signatures) | Gate 1 + live enablement |
| `PAYMENT_LIVE_ENABLED=true` path | All 7 human gates |
| Production country policy packs | Gate 2 |
| Production fraud/risk provider | No vendor selected; `AllowlistRiskAdapter` unchanged |
| Order `requestRefund` → payment intent orchestration | Order transition only marks `REFUND_PENDING`; full payment-refund coupling deferred to R14-A impl when MoR/chargeback rules decided (OD-PAY-01) |

---

## 7. Remaining R14-A work (after human gates)

1. Owner supplies 7/7 gate evidence → Book 247 + Book 35 `DECIDED`
2. **`CR-PRE-R14-A-GATE-258`** final verification → `R14_A_GATES_GREEN`
3. **`CR-R14-A-IMPL-244`:** register live PSP adapter in `PaymentGatewayRegistry`; add live webhook handler in `PaymentWebhookRegistry`; wire production env + vault secret refs; extend router for production environment when authorized
4. Country pack enablement for launch ISO2
5. PCI SAQ attestation record (gate 7)

---

## 8. Final verdict

### Verdict

**`R14_A_ENGINEERING_PREP_COMPLETE`**

### Authorization status

**R14-A live PSP implementation is NOT authorized.** Human gates remain **0/7 — NOT EVIDENCED**.
