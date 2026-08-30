# 56 — Phase 1D Global multi-gateway payment (implementation plan)

**Status:** Plan only — **not implemented**  
**Date:** 26 August 2026  
**Authorization:** Phase 1D **planning** only  
**Forbidden in this task:** production code, migrations, PSP SDKs, live keys, live charges, Order rows, DHL, vendor/affiliate payout, P&L  

Canonical: [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md), [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §12 / 1D, [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md), [20](20_DATABASE_ARCHITECTURE.md) §5.38–5.40, [21](21_API_ARCHITECTURE.md) §21, [22](22_EVENT_ARCHITECTURE.md) §7.13–7.14, lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

1C already ends at `READY_FOR_PAYMENT` with `POST .../pay` → **409 `PAYMENTS_DISABLED`**. This plan is the contract to **replace that stub** with a real payment kernel **when a later coding task is authorized**. It does **not** create Orders (1E) or settlement (1G).

---

## 0. Boundary

| In 1D (when coded later) | Out of 1D |
| --- | --- |
| `PaymentGatewayPort` + adapters | Live PSP contracts / production keys |
| Routing, failover **before** submit | Blind retry after unknown submit |
| Intent / attempt / transaction / refund objects | `orders` table |
| Webhook ingest + recon **foundation** | Vendor/doctor/lab/affiliate **payouts** |
| COD as a **method** + policy | Cash collection at door (fulfillment) |
| Fee capture as **facts** | Contribution margin / P&L |
| Customer pay UX + admin payment console | Wallet stored value (OD-PAY-05 **off**) |

**Sandbox/test adapters** (no live money) are in 1D coding scope. **Choosing Stripe/Adyen/Razorpay/etc. as “the” processor is not architecture** ([12] §6, [50] §12). Vendor names belong in config/runbooks after **LEGAL/FINANCE REVIEW**.

**1C → 1D:** frozen `CheckoutQuote` + session `READY_FOR_PAYMENT` → `PaymentPort.createIntent`.  
**1D → 1E:** `PAYMENT_CAPTURED` / COD-confirmed intent → Order create. **1D must not insert orders.**  
**1D → 1G:** payment facts + recon → journal. **1D must not post vendor AP.**

---

## 1. Architecture

Kernel module `payment` (modular monolith). Domain services call **ports**, never PSP SDKs.

```
Country Policy Pack
  → method catalog
  → eligible gateway accounts
  → PaymentRouter (deterministic)
  → PaymentIntent
  → PaymentAttempt (one gateway submit)
  → PaymentGatewayPort
  → Adapter (sandbox | future licensed PSP)
```

| Object | Role |
| --- | --- |
| `PaymentGateway` | Catalog of processors (coverage, methods, capabilities, priority, health) |
| `PaymentGatewayAccount` | Merchant account per entity×env; **secret_ref** only |
| `PaymentMethod` | Family + country pack flags (card, bank, wallet, local, COD, BNPL-if-legal) |
| `PaymentRoutingRule` | Deterministic match + priority |
| `PaymentIntent` | One money-move chain for one checkout session |
| `PaymentAttempt` | One submit to one gateway |
| `PaymentTransaction` | Normalized auth/capture/void/refund facts |
| `Refund` / `RefundAttempt` | Instrument refunds |
| `WebhookEvent` | Inbound PSP events (immutable ingest) |
| `PaymentReconciliation` | Internal vs gateway report breaks |

**Money:** `BIGINT` minor + ISO 4217 + exponent. **No float.** Original `payment_currency` is never overwritten ([12] §4).

Domain **must not** import a PSP SDK. Adapters live behind `PaymentGatewayPort`.

---

## 2. `PaymentGatewayPort`

| Operation | Notes |
| --- | --- |
| `createIntent` | Map checkout quote → PSP session |
| `confirm` / `startNextAction` | 3DS/SCA/redirect |
| `authorize` | If distinct |
| `capture` | Remaining authorized only |
| `void` | Unused auth |
| `refund` | Full/partial |
| `getStatus` | Pull truth |
| `verifyWebhook` | Mandatory; reject unsigned |
| `parseWebhook` | → `GatewayEvent` |
| `fetchTransaction` | Timeout / UNKNOWN |
| `listSettlementItems` | Recon files |
| `health` | Routing demotion |

Missing capability → `UNSUPPORTED` (router skips). **PayoutPort is separate** (OD-PAY-06). 1D does not implement participant payout.

---

## 3. Multi-gateway model

Each gateway (config, not code forks):

- `gateway_id`, display name  
- country coverage, currencies, method families  
- capabilities: `{ authorize, capture, void, partial_capture, partial_refund, 3ds, webhooks, settlement_file }`  
- priority, `active`, environment (`sandbox`/`live`)  
- `credentials_secret_ref` (vault/KMS — **never plaintext in Postgres**)  
- webhook path + signing secret ref  
- health: success rate, latency, webhook lag, circuit  

Multiple gateways **active at once**. Live vendor selection remains **OPEN**.

---

## 4. Routing

Inputs (all data-driven; **no `if (country === 'IN')`**):

country, currency, method, amount_minor, merchant/entity, gateway coverage, capabilities, health, pack mandates, risk decision.

Algorithm (deterministic):

1. Pack: payments enabled? methods allowed?  
2. Filter gateways by country×currency×method×amount×capability.  
3. Exclude inactive / circuit-open.  
4. Sort by pack mandate, then priority, then health (OD-PAY-09: success rate then cost).  
5. Persist **routing snapshot** on the attempt (`rule_id`, candidates, chosen `gateway_id`, reason).

**Do not change gateway after an attempt is submitted.**

---

## 5. Failover

| When | Allowed |
| --- | --- |
| **Before** any gateway accept (create failed cleanly, `UNSUPPORTED`, health deny) | Next eligible gateway |
| After submit, **UNKNOWN** / timeout | **No** second gateway until recon/`getStatus`/webhook |
| Terminal `FAILED` on attempt, pack allows retry | **New** `PaymentAttempt` or **new** `PaymentIntent` (`supersedes_intent_id`); never silent dual charge |

Customer retry = new intent id, same checkout session ([12] §7).

---

## 6. State machines

### PaymentIntent

`CREATED` → `REQUIRES_ACTION` → `PROCESSING` → `AUTHORIZED` → `CAPTURED`  
Also: `FAILED` | `CANCELLED` | `EXPIRED` | `UNKNOWN`

Illegal: `CAPTURED` → `AUTHORIZED`; `FAILED` → `CAPTURED` without a new intent.

1C must **not** jump here from `READY_FOR_PAYMENT` until 1D coding exists.

### Attempt

`CREATED` → `SUBMITTED` → `SUCCEEDED` | `FAILED` | `UNKNOWN`

### Refund

`REQUESTED` → `PROCESSING` → `SUCCEEDED` | `FAILED`  
Partial: multiple refunds until `refundable_remaining = 0`. Over-refund rejected.

---

## 7. Authorize / capture

Capability matrix per gateway×method. Goods/lab default **capture on success** (OD-PAY-02). Consult later: auth then capture. Partial capture: **yes for goods** if capability (OD-PAY-08); remainder voided. COD: no PSP capture (see §9).

---

## 8. 3DS / SCA

Policy-driven, not global. `next_action`: `{ type: REDIRECT | CHALLENGE | FRICTIONLESS | NONE, return_url }`. Completion = **webhook + fetch**, not redirect alone. OD-PAY-07: follow PSP `next_action`; legal encodes mandates. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

## 9. Methods (capability catalog)

Families: `CARD`, `BANK_TRANSFER`, `LOCAL_BANK`, `WALLET`, `MOBILE`, `BNPL`, `COD`.  
Not every family is implemented on day one. Empty catalog → checkout stay blocked.

Wallet: **off** until stored-value legal (OD-PAY-05). BNPL: out of v1 (OD-PAY-13).

---

## 10. COD

A **payment method**, not a global default. Pack controls: enabled, max amount, geo, customer eligibility, fee, Rx restrictions (**LEGAL/COMPLIANCE REVIEW REQUIRED** for prescription COD).

Intent may sit `AUTHORIZED_COD` until 1E POD. **Cash collection and remittance are 1E/ops**, not 1D. OD-PAY-04 remittance SLA stays open.

---

## 11. Currency / FX

Roles: display, order, payment, settlement, accounting ([12] §4.1). Persist all; never drop original payment currency.

FX snapshot immutable on the intent. Convert **per line**, store original + converted. Refunds in **payment currency** unless PSP requires otherwise (then persist both). OD-FX-01..06 remain open. Until then: refund original payment-currency amount; FX delta is a **future ledger** fact, not a silent customer haircut.

---

## 12. Fees

On transaction/recon (when gateway provides): customer_amount, gateway_amount, gateway_fee, tax_on_fee (if provided), platform_gross. **Do not** compute vendor net or contribution margin in 1D.

---

## 13. Merchant of record

**OD-PAY-01 OPEN.** Model `legal_entity_id` / `merchant_account_id` on gateway accounts so platform-MoR, vendor-MoR, or country-specific structure can be configured later. Invoice/tax seller is **not** hardcoded. **LEGAL/FINANCE REVIEW REQUIRED.**

---

## 14. PCI / card security

**Never store:** PAN, CVV, track data, gateway secret keys.  
Hosted fields / PSP tokenization / redirect only. Platform PCI boundary = no CHD in our DB, logs, or metrics. SAQ type and AoC: **LEGAL/COMPLIANCE/SECURITY REVIEW REQUIRED**. Do not claim PCI compliance by shipping this design.

Secrets: vault references, rotation window (dual secret).

---

## 15. Webhooks

`POST /api/v1/webhooks/payments/{gateway_id}` — raw body + signature headers.

| Rule | |
| --- | --- |
| Verify signature + timestamp window | Else 401 (PSP retries) |
| Dedupe `(gateway_id, provider_event_id)` | Duplicate → 200 no-op |
| Late / out-of-order | Apply with version/clock; never decrease captured without fetch |
| Redirect vs webhook | Webhook + `fetchTransaction` authoritative |
| Payload | Encrypt at rest; redact in logs |

---

## 16. Idempotency

All money POSTs: `Idempotency-Key` (person/system + route + key). Same key → same financial effect. TTL OD-PAY-14 (24–72h). Webhooks key on **provider event id**, not client key.

---

## 17. UNKNOWN state (critical)

If HTTP times out **after** the gateway may have accepted:

1. Attempt → `UNKNOWN` / intent `PROCESSING`  
2. **Do not** route to gateway B  
3. `fetchTransaction` + wait for webhook  
4. Recon job  
5. Only then: mark FAILED (safe new attempt) or SUCCEEDED  

Customer close-browser: poll + webhook; do not assume failure.

---

## 18. Refunds

Full, partial, multi-partial if capability. Track requested vs gateway amounts, currency, reason, timestamps. Target: original instrument (wallet later). COD: `REFUND_UNAVAILABLE_COD` → future payable, not a PSP refund. **No vendor settlement reversal in 1D.**

---

## 19. Reconciliation

Compare internal transactions vs gateway settlement/report. Breaks: missing, duplicate, amount, currency, refund, fee, unknown inbound txn. Status: `MATCHED` | `BREAK` | `INVESTIGATE`. **Do not silently rewrite historical payment rows**; add recon adjustments.

---

## 20. Ledger boundary

1D **emits** facts (`PAYMENT_CAPTURED`, fee, refund). 1G posts journal (cash clearing, unearned, AP). 1D must not: vendor payout, affiliate AP, rider pay, contribution margin.

---

## 21. Order boundary

```
CheckoutQuote (1C, frozen)
  → PaymentIntent (1D)
  → CAPTURED or COD confirmed
  → Order (1E)
```

Invariants (enforced later in 1E): no Order without valid payment/COD policy; no CAPTURED intent without a follow-up Order job (ops alert). **1D coding must not insert `orders`.**

---

## 22. Fraud hooks

Port `RiskPort.score(intent)` → ALLOW / REVIEW / DENY. Signals: velocity, device/IP (hashed), BIN vs ship country, COD abuse, PSP risk score. No in-house ML in 1D. Never log PAN. **LEGAL/COMPLIANCE REVIEW REQUIRED** for automated deny.

---

## 23. Customer UX

Methods for country → choose method → `REQUIRES_ACTION` (redirect/challenge) or processing → status. Show: status, attempt count, public reference, refund status. **Hide:** gateway secrets, internal routing, raw risk scores.

Pay from 1C: replace `PAYMENTS_DISABLED` only when 1D coding is authorized. Until then 1C stays disabled.

---

## 24. Admin console

Search, detail, attempts, gateway, webhooks, recon, unknown queue, refund (permission `payment:refund`, dual-control where pack requires). No default “finance sees all.” RLS + explicit RBAC.

---

## 25. Database (plan — no migration now)

UUID v7 ids. BIGINT minors. Tables (illustrative): `payment_gateways`, `payment_gateway_accounts`, `payment_gateway_capabilities`, `payment_routing_rules`, `payment_methods`, `payment_intents`, `payment_attempts`, `payment_transactions`, `refunds`, `refund_attempts`, `webhook_events`, `payment_reconciliations`, `fx_snapshots`.

FK: `checkout_sessions.id` (1C). **No** `orders` FK required in 1D (1E adds it). Unique: intent idempotency; `(gateway_id, provider_event_id)`.

---

## 26. API (plan)

Customer (`/api/v1`): `GET /payments/methods`, `POST /me/checkout/sessions/{id}/pay` (create intent), `GET /payments/intents/{id}`, `POST .../confirm`, `POST /me/refunds` (policy).  
Admin: search/detail/refund/recon/webhook diagnostics.  
Webhooks: `/webhooks/payments/{gateway}`.  
Never accept PAN JSON. RFC 7807 errors: `PAYMENTS_DISABLED` (until coded), `QUOTE_STALE`, `GATEWAY_UNAVAILABLE`, `PAYMENT_UNKNOWN`, `REFUND_EXCEEDS_CAPTURE`.

---

## 27. Events (existing outbox + BullMQ only)

`PAYMENT_INTENT_CREATED` · `PAYMENT_REQUIRES_ACTION` · `PAYMENT_PROCESSING` · `PAYMENT_AUTHORIZED` · `PAYMENT_CAPTURED` · `PAYMENT_FAILED` · `PAYMENT_CANCELLED` · `PAYMENT_EXPIRED` · `PAYMENT_REFUND_REQUESTED` · `PAYMENT_REFUNDED` · `PAYMENT_UNKNOWN` · `PAYMENT_RECONCILED`

Aliases to catalog `PAYMENT_SUCCESS` / `PAYMENT_FAILED` ([22]). Idempotent consumers. **No `ORDER_PAID` / `ORDER_CREATED` from 1D.**

---

## 28. Observability

Metrics: auth rate, capture rate, fail rate, gateway latency, webhook delay, UNKNOWN count, refund success, recon breaks — labels: gateway_id, country, method, **never PAN/secrets**. Correlation ids on intent/attempt.

---

## 29. Performance

Idempotent, transactional, non-blocking recon (async jobs). Do not hold HTTP on settlement-file parse. Postgres SoT; Redis for health cache / idempotency TTL only.

---

## 30. Tests (when coding authorized)

Adapters (sandbox): success, fail, timeout, UNKNOWN. Routing: country/currency/method/amount. Failover allowed vs prohibited. 3DS next_action. Duplicate/out-of-order webhooks. Idempotent capture/refund. Partial refund. Auth+capture. COD pack on/off. RLS. PCI: no PAN in DB/logs. Recon breaks. Dual-control refund.

---

## 31. Failure scenarios (required behavior)

| Scenario | Behavior |
| --- | --- |
| PSP timeout after possible accept | UNKNOWN; fetch; no gateway B |
| Customer closes browser | Poll + webhook |
| Webhook delayed / duplicate / before redirect / after | Dedupe; fetch if conflict |
| Success on PSP, API timeout | UNKNOWN then CAPTURED via fetch |
| Failure after temp success | Recon; do not auto-refund without policy |
| Partial capture/refund | Remaining tracked |
| Duplicate refund key | Same refund row |
| Gateway outage before submit | Next gateway |
| Amount/currency mismatch | BREAK; do not silent-fix |
| Recon mismatch | INVESTIGATE row |

---

## 32. Globalization

No hardcoded India, INR, UPI, GST, Razorpay, Stripe, DHL. Packs + adapters + config only.

---

## 33. Open decisions (do not invent)

| ID | Topic |
| --- | --- |
| OD-PAY-01 | MoR / facilitator / vendor-as-seller |
| Launch country, legal entity, licenses | Human |
| PSP / gateway contracts | Adapter yes; vendor no |
| Tax provider, FX provider | Ports only |
| OD-PAY-02/08 | Auth vs capture; partial capture |
| OD-PAY-04 | COD remittance |
| OD-PAY-05 | Wallet |
| OD-PAY-06 | Acquiring vs payout vendor |
| OD-PAY-07 | SCA thresholds |
| OD-PAY-09/10/14 | Routing objective, retry UX, idempotency TTL |
| OD-FX-01..06 | Refund FX, lock timing, customer currency, rounding, wallet FX |
| Controller/processor | OD-PRIV |
| Settlement currency / vendor calendar | 1G |

**LEGAL/FINANCE/COMPLIANCE/SECURITY REVIEW REQUIRED** before live money.

---

## 34. Phase 1D coding acceptance (later task — not this audit)

1. Port + ≥1 **sandbox** adapter; **no live keys** in repo  
2. Routing recorded on attempts; no `if country ===`  
3. UNKNOWN never dual-charges  
4. Webhooks signed, idempotent  
5. Refunds cannot exceed captured  
6. Original currency retained  
7. `PAYMENTS_DISABLED` removed only behind pack `payments.enabled`  
8. **Zero Order rows**  
9. **No vendor/affiliate payout**  
10. No PAN/secrets in DB/logs  
11. Tests in §30 pass  
12. 1C cart/checkout regression still green  

---

## Related

[12](12_PAYMENT_PLATFORM.md) · [13](13_LEDGER_SETTLEMENT.md) · [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) · [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) · [21](21_API_ARCHITECTURE.md) · [35](35_OPEN_DECISIONS.md)
