# 57 — Phase 1D payment implementation (sandbox)

**Status:** Implemented (sandbox / test adapters only)  
**Date:** 26 August 2026  
**Authorization:** Phase 1D coding — **sandbox only**  
**Stop:** Do not start 1E Orders, 1F DHL, or 1G settlement.

Plan: [56](56_PHASE_1D_PAYMENT_IMPLEMENTATION_PLAN.md). Lock: [43](43_ECOSYSTEM_BASELINE_LOCK.md).

**R5-D note:** CAPTURED / AUTHORIZED_COD Order gate is reused for Rx handoff — [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**; no live PSP).  
**R5-E note:** Each refill needs a **new** PaymentIntent; UNKNOWN/FAILED → zero Order — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**).

## Architecture

Modular kernel `apps/api/src/payment/`. Domain uses `PaymentGatewayPort`. First adapter: `MockPaymentGatewayAdapter` (TEST/SANDBOX). No live PSP SDK, no production credentials, no real money.

Routing is data-driven (`PaymentRouter`) from gateway accounts, capabilities, health, priority, and country policy. No hardcoded country branches.

## Database (additive)

Migration `20260826240000_payments_sandbox`. Entities: PaymentGateway, PaymentGatewayAccount, PaymentGatewayCapability, PaymentMethod, PaymentRoutingRule, PaymentIntent, PaymentAttempt, PaymentTransaction, Refund, RefundAttempt, PaymentWebhookEvent, PaymentReconciliation, PaymentFxSnapshot.

Money is BIGINT minor units. Original currency is preserved. Secrets are `secret_ref` only. No PAN/CVV/raw card data. No Order / Settlement / VendorPayout / AffiliatePayout tables.

Customer-owned payment rows use RLS (`app.bypass_rls` / `app.person_id`).

## Intent and quote

`POST /api/v1/me/checkout/sessions/:id/pay` binds to the frozen 1C quote. Client `amount_minor` is rejected. Amount and currency come from the quote. Country policy must `payments.enabled` with `gateway_refs`.

## State machine

Intent: CREATED, REQUIRES_ACTION, PROCESSING, AUTHORIZED, AUTHORIZED_COD, CAPTURED, FAILED, CANCELLED, EXPIRED, UNKNOWN.  
Attempt: CREATED, SUBMITTED, SUCCEEDED, FAILED, UNKNOWN.  
Refund: REQUESTED, PROCESSING, REFUNDED, FAILED.  
Illegal transitions are rejected.

## Failover and UNKNOWN

Gateway B is allowed only **before** submit. After submit (including timeout), attempt is UNKNOWN. No automatic second gateway. Reconcile via status query / webhook. Dual-charge tests assert a single submitted attempt after timeout.

## 3DS / SCA

`next_action` may be redirect, challenge, or frictionless. Browser return is not success. Completion requires verified webhook and/or gateway status.

## Webhooks

`POST /api/v1/webhooks/payments/:gatewayId` — HMAC verify, timestamp/replay via provider event id, persist ciphertext (HMAC of body), process once. Duplicate webhooks are no-ops.

## Refunds

Sandbox full/partial refunds. Remaining refundable = captured − refunded. Over-refund blocked. Idempotent. No vendor settlement.

## COD

Payment-method abstraction only when Country Policy allows. No cash collection, no Order.

## Risk / PCI

`RiskPort` + allowlist stub. No ML. No CHD in DB, logs, events, or metrics. Hosted/tokenized fields are the production path; this phase uses mock tokens. **Do not claim PCI compliance.**

## APIs

Customer: methods, pay, get intent, confirm, capture, refund (Idempotency-Key on money POST).  
Admin: `payment:read|refund|admin|reconcile` — search, detail, UNKNOWN queue, reconcile. No secrets.

## UI

Customer checkout: sandbox success/failure/unknown. Never labeled as a live charge.  
Admin `/payments`: intent list and UNKNOWN queue.

## Events

PAYMENT_INTENT_CREATED, PAYMENT_REQUIRES_ACTION, PAYMENT_PROCESSING, PAYMENT_AUTHORIZED, PAYMENT_CAPTURED, PAYMENT_FAILED, PAYMENT_CANCELLED, PAYMENT_EXPIRED, PAYMENT_UNKNOWN, PAYMENT_REFUND_REQUESTED, PAYMENT_REFUNDED, PAYMENT_RECONCILED.

Not emitted: ORDER_CREATED, ORDER_PAID, VENDOR_PAID, AFFILIATE_PAID.

## Reconciliation

Compare internal transaction vs mock gateway ledger. Breaks: amount, currency, missing. Historical payment rows are not rewritten.

## Limits

Sandbox only. No real PSP. No real money. No Order. No DHL. No settlement. MoR (OD-PAY-01) remains OPEN. Live adapter requires separate authorization.

## Stop

Phase 1E–1G are not started.
