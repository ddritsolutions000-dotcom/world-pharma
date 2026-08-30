# 61 — Phase 1F logistics + mock carrier implementation

**Status:** Implemented (mock carrier only)  
**Date:** 26 August 2026  
**Authorization:** Phase 1F coding — **MOCK CARRIER ONLY**  
**Stop:** Do not start 1G. Do not enable live DHL/FedEx/UPS.

Plan: [60](60_PHASE_1F_LOGISTICS_CARRIER_IMPLEMENTATION_PLAN.md). Orders remain 1E. Payments remain sandbox ([57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md)).

**R5-D note:** Rx commercial delivery reuses mock logistics only — [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**; no live DHL).  
**R5-E note:** Refill shipments reuse this kernel per new Order — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**).

## Architecture

Module `apps/api/src/logistics/`. Domain talks to `CarrierPort` only. `MockCarrierAdapter` is the only adapter. No carrier SDK. No live HTTP to DHL/FedEx/UPS.

```
READY_TO_SHIP (1E)
  → booking job (inline in tests; BullMQ worker in non-test)
  → CarrierRouter (Country Policy fail-closed)
  → MockCarrierAdapter
  → shipment state + outbox
```

PostgreSQL is shipment SoT. Redis is not. Outbox + BullMQ only.

## Database

Additive migrations:

- `20260826260000_logistics_mock_carrier`
- `20260826261000_logistics_contracts`

UUID v7. BIGINT minor units. `country_id` + `seller_org_id`. RLS on shipments (customer person). Unique `booking_key` and `provider_ref`. Child tables: packages, labels, tracking events, delivery attempts, POD (hashed), carrier costs, reconciliations, quotes, cost adjustments, return shipments, logistics jobs (contracts).

## Carrier abstraction

`CarrierPort`: quote, createShipment, cancel, label, pickup, track, verifyWebhook, parseWebhook, fetchInvoice, createReturn.

`MockCarrierAdapter` simulates quote/book success/fail/timeout/unknown, label, track, invoice (including NULL actual cost), RTO. Zero network.

DHL exists only as a future adapter boundary. No credentials stored — `secret_ref` only. Environment: sandbox.

## Routing

Data-driven: coverage, capabilities, health/circuit, temperature, Country Policy. No India/DHL/INR hardcoding. Mock is the only active sandbox carrier; `MOCK_B` exists for failover tests.

Fail closed when policy is missing. International / RX require explicit pack flags. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

## Booking state machine

`READY → BOOKING → BOOKED → LABEL_CREATED → PICKUP_SCHEDULED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`

Failures: `BOOKING_FAILED`, `BOOKING_UNKNOWN`, cancel, `DELIVERY_FAILED`, `RETURN_TO_ORIGIN`, `LOST`, `DAMAGED`.

`DELIVERED` cannot become `IN_TRANSIT` via stale webhook.

## UNKNOWN / failover

Timeout after submit → `BOOKING_UNKNOWN`. No second carrier until recon confirms failure. Then a new booking may choose the next eligible carrier. One logical booking per shipment (`booking_key`).

## Quote vs cost

Customer shipping charge stays on the Order snapshot. Carrier quoted/actual costs are shipment rows. **NULL ≠ 0.** Posted costs are not rewritten; mismatches create reconciliation exceptions. No 1G P&L.

## Package / label / tracking / POD / RTO

One package per fulfillment group. Mock label is a test reference, not a PDF. Tracking is normalized. POD OTP is SHA-256 hashed. RTO uses `QUARANTINE` disposition — medicines are not auto-restocked.

## Webhooks

`POST /api/v1/webhooks/carriers/:carrierId` — HMAC, timestamp/replay window, provider event unique, duplicate = one logical transition, out-of-order cannot downgrade DELIVERED.

## Delivery partner

Backend boundary only: assigned job payload with masked contact + OTP. No rider production app. No clinical PDFs.

Job types: `MEDICINE_DELIVERY` participates now. `SAMPLE_COLLECTION`, `SAMPLE_TRANSPORT`, `REPORT_DELIVERY` are contracts only.

## APIs

Customer: `GET /me/shipments`, `GET /me/shipments/:id`, `GET /shipping/quotes`  
Vendor: `GET /vendor/shipments` (seller scoped)  
Admin: search, book, reconcile, RTO, OTP, partner-job (`logistics:read|manage|admin|reconcile`)  
Webhook: `POST /webhooks/carriers/:carrierId`

## Events

Outbox types: `SHIPMENT_*`, `CARRIER_COST_RECORDED`, `CARRIER_RECONCILIATION_EXCEPTION`. No `VENDOR_PAID` / `AFFILIATE_PAID` / settlement.

## Security

JWT + RBAC + RLS. Customer own shipments. Vendor own seller. Admin permissioned. No secrets/PHI in logs or tracking. OTP hashed.

## Tests

`logistics.e2e.spec.ts` and `state.spec.ts`: routing/policy, booking success, UNKNOWN dual-book block, recon then failover, duplicate webhook, DELIVERED no downgrade, isolation, NULL cost, OTP hash, RTO, admin permissions.

## Limitations

Mock only. No live labels/freight. No settlement/payout/P&L. No Lab/Doctor/rider app. No real COD cash. Customs/cold-chain are metadata + fail-closed policy, not legal rules.

## Open decisions

Remain OPEN from [60] §44: DHL contract, launch country, legal entity, MoR, customs/tax/FX, regulated shipping permissions, cold-chain quality system, COD remittance, split shipment, partner compensation, POD method, RTO restock.

## Stop

**Do not start Phase 1G.** **Do not enable live DHL.**
