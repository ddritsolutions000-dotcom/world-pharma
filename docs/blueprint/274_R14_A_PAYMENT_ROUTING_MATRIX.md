# 274 — R14-A payment routing matrix (CR-274)

**CR:** `CR-R14-A-PAYMENT-ROUTING-MATRIX-274`  
**Verdict:** **`R14_A_PAYMENT_ROUTING_MATRIX_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [273](273_R14_A_PAYMENT_ADMIN_OBSERVABILITY.md) (**R14_A_PAYMENT_ADMIN_OBSERVABILITY_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Provider-neutral, read-only sandbox payment routing matrix admin visibility and policy-alignment checks. **No live PSP. No schema changes. No human gate changes.**

---

## 1. Architecture discovered

| Component | Location | Role |
|-----------|----------|------|
| `PaymentRouter` | `router.ts` | Queries `paymentRoutingRule` + `paymentGateway` (+ accounts); ranks by priority; sandbox default |
| `PaymentRouter.explain()` | `router.ts` (CR-274) | Same loop as `candidates()` but returns ineligible gateways with fail-closed reasons |
| `PaymentGatewayRegistry` | `gateway.registry.ts` | Dispatches MOCK_* adapters; unknown codes fail closed; production MOCK forbidden |
| Policy pack | `document.ts` / `empty-pack.ts` | `payments.enabled`, `payments.gateway_refs`, `payments.methods`, `payments.currencies` |
| Submit path | `payment.service.ts` | Policy + router + registry alignment via `resolvePaymentSubmitRoute()` |
| Admin observability | CR-273 | List/detail/webhooks/reconciliation — extended, not duplicated |

**Sandbox seed:** `MOCK_PRIMARY` (priority 10), `MOCK_FALLBACK` (priority 20) with wildcard country/currency accounts.

**Defect fixed (CR-274):** Submit path now filters router candidates by policy `gateway_refs` (previously router could select gateways not listed in policy).

---

## 2. Routing matrix contract

Read-only matrix exposes per country/method:

- Country, method, currency, policy source, `gateway_refs`
- Rows: gateway code/environment, priority, capabilities, registry registration, policy allowance, router eligibility, status (`active` / `inactive` / `blocked`), fail-closed reason
- **Effective route** — first policy-aligned, registry-eligible sandbox candidate (matches submit path)
- **Production preview** — inactive; `live_payments_disabled`; MOCK_* shown as `mock_gateway_production_forbidden`
- Never exposes secrets, credentials, webhook signatures, PAN/CVV, or raw provider configuration

### Policy alignment checks

| Case | Matrix / runtime behavior |
|------|---------------------------|
| `payments.enabled = false` | No active route; `payments_disabled` |
| Unknown gateway | `unknown_gateway` / blocked |
| Unknown registry capability | `registry_fail_closed` / blocked |
| MOCK_* in sandbox | Allowed when policy + router permit |
| MOCK_* in production preview | `mock_gateway_production_forbidden` |
| Environment mismatch | Router ineligible / registry fail-closed |
| Country not authorized | `country_not_authorized` |
| Gateway not in policy refs | `policy_gateway_not_allowed` |
| Empty/invalid policy pack | `missing_routing_policy` or `empty_routing_policy` |
| Multiple gateways | Deterministic priority (lowest wins) |
| Matrix vs submit | `router_decision_matches` via shared `resolvePaymentSubmitRoute()` |

---

## 3. API surface

| Method | Route | Permission | Notes |
|--------|-------|------------|-------|
| GET | `/admin/payments/routing-matrix` | `payment:read` | Requires `country_code`; filters: `method`, `gateway`, `environment`, `active` |

Country scoping: `resolveCountryByCode` + `runWithTenant`. Cross-tenant/country isolation preserved.

---

## 4. Code changes

### Created

| File | Purpose |
|------|---------|
| `payment-routing-matrix.ts` | Matrix builder, submit-route resolver, sanitization |
| `payment-routing-matrix.spec.ts` | Unit tests |
| `payment-routing-matrix.e2e.spec.ts` | 14-scenario admin matrix e2e |

### Modified

| File | Purpose |
|------|---------|
| `router.ts` | Added `explain()` + `RoutingIneligible` types |
| `payment.service.ts` | `adminRoutingMatrix()`, policy-aligned submit filtering |
| `admin.controller.ts` | `GET routing-matrix` route |
| `payments-admin-api.ts` | Matrix client types + fetch |
| `payments-admin.tsx` | Read-only routing matrix section |
| `payments-admin.spec.tsx` | Matrix UI states |

---

## 5. Security / RBAC

- Unauthorized admin → **403** (verified in e2e)
- Country-specific matrix (WR vs XO) — verified
- No secrets in matrix output — `assertRoutingMatrixResponseSafe` + PCI scan green
- `PAYMENT_LIVE_ENABLED` remains **off**
- Production routing remains **inactive** (preview only)
- Human gates **0/7 unchanged**

---

## 6. Tests

### CR-274 focused (pass)

```bash
npx jest apps/api/src/payment/payment-routing-matrix.spec.ts apps/api/src/payment/payment-routing-matrix.e2e.spec.ts apps/api/src/payment/router.spec.ts apps/api/src/payment/pci.spec.ts apps/api/src/payment/payment-observability.spec.ts --config apps/api/jest.config.cts --runInBand
```

**30 passed, 0 failed**

### Web-admin

```bash
npx jest apps/web-admin/src/payments-admin.spec.tsx --config apps/web-admin/jest.config.cts
```

**10 passed, 0 failed**

### Full payment suite note

Full `apps/api/src/payment` e2e run reported checkout session **409** failures across several legacy e2e files (cart/checkout setup), unrelated to routing-matrix endpoints. CR-274 matrix e2e and unit suites pass independently. Recommend re-running full payment regression after test DB isolation reset if checkout 409 persists.

---

## 7. Typecheck / build

- `nx run api:typecheck` — **PASS**
- `nx run api:build` — **PASS**
- `nx run web-admin:typecheck` — **PASS**
- `nx run web-customer:typecheck` — **PASS**

---

## 8. Migrations

**128/128** on `worldpharma_test` — **no migration required** (read-only matrix uses existing policy + gateway tables).

---

## 9. Runtime

- **`/health/ready`:** HTTP **200** — postgres, redis, bullmq healthy (port 4000)

---

## 10. Human gates / production

- **Human gates:** **0/7** — unchanged
- **Production activation:** **DISABLED**
- **`CR-R14-A-IMPL-244`:** NOT authorized

---

## 11. Remaining R14-A engineering

1. Sandbox gateway **failover drill** — exercise MOCK_PRIMARY → MOCK_FALLBACK submit failover with regression harness
2. Real PSP adapter (blocked on human gates)
3. Production routing (blocked on human gates)

---

## 12. Next CR

**Engineering:** **`CR-R14-A-PAYMENT-SANDBOX-FAILOVER-275`** — sandbox gateway failover drill, policy-aligned routing regression harness, and admin visibility for attempt-level failover (provider-neutral; no live PSP).

**Human track (parallel):** Owner evidence via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → `CR-R14-A-IMPL-244` when gates are evidenced.
