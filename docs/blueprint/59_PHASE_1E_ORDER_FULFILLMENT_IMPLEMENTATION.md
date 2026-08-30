# 59 — Phase 1E orders + fulfillment implementation

**Status:** Implemented (sandbox payment only)  
**Date:** 26 August 2026  
**Authorization:** Phase 1E coding  
**Stop:** Do not start 1F carriers or 1G settlement.

Plan: [58](58_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION_PLAN.md). Payment remains sandbox ([57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md)).

**R5-D note:** Order-from-Rx reuses this Order/fulfillment kernel; inventory consume-once vs R5-C dispense PICK is **ED-R5D-01 Option B** in [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**).  
**R5-E note:** Each refill creates a **new** Order on a **new** `dispenseEventId` — never mutate prior Orders — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**).

## Architecture

Module `apps/api/src/orders/`. Order is a separate bounded context. 1D writes payment facts only. 1E is the only writer of `orders`. `CarrierPort` is a no-op stub (zero network).

## Database

Additive migrations `20260826250000_orders_fulfillment`. UUID v7 ids. BIGINT minor money. Unique `payment_intent_id`. Customer-facing `order_number`. RLS on `orders`. No Order rewrite of historical snapshots.

## State machine

Happy path: CONFIRMED → ALLOCATED (at create) → PICKING → PICKED → PACKING → PACKED → READY_TO_SHIP.  
Internal SHIPPED / OUT_FOR_DELIVERY / DELIVERED exist but **no carrier events**.  
Side paths: ON_HOLD, CANCEL_REQUESTED, CANCELLED, RETURN_*, REFUND_*, FAILED.  
Illegal transitions 409 `ILLEGAL_ORDER_TRANSITION`.

## Payment boundary

Prepaid: `CAPTURED` → Order. COD: `AUTHORIZED_COD` + country pack methods include COD.  
Not created from CREATED, REQUIRES_ACTION, PROCESSING, UNKNOWN, FAILED, or client redirects.  
After capture, factory is invoked; retries via `POST /me/orders`. Unique payment intent + idempotency keys.

## Inventory

Checkout `CHECKOUT` reservations are locked and consumed once (`CONSUMED`). PICK movement: reserved and on-hand decrease. Expired/quarantine/inactive lots rejected. FEFO remains a pack hint (`inventory.fefo_required`). **LEGAL/COMPLIANCE REVIEW REQUIRED.** No silent location reroute.

## Fulfillment

One fulfillment group, one location (STORE / WAREHOUSE / VENDOR_WAREHOUSE). PickTask + PackTask. Over-pick rejected. Ready-to-ship writes internal Shipment `READY` and calls `CarrierPort.createShipment` which **refuses** dispatch.

## Snapshots

Frozen at create: items, address, pricing, tax, promo, affiliate, shipping (actual cost **null**), payment, economics (platform take 0 — no hardcoded %). Not recalculated from live catalog.

## APIs

Customer: `/me/orders`, detail, create from payment, cancel, return, refund request.  
Vendor: `/vendor/orders` (own seller org). Pick/pack/ready.  
Admin: `/admin/orders` with `order:read|manage|cancel|fulfill|admin`.

## Events

Outbox + BullMQ: ORDER_CREATED, CONFIRMED, ON_HOLD, ALLOCATED, PICKING, PICKED, PACKING, PACKED, READY_FOR_SHIPMENT, CANCELLED, RETURN_REQUESTED, RETURNED, REFUND_PENDING, REFUNDED.  
Not emitted: ORDER_SHIPPED, ORDER_OUT_FOR_DELIVERY, ORDER_DELIVERED, VENDOR_PAID, AFFILIATE_PAID.

## UI

Customer `/orders` and `/orders/[orderNumber]`. Vendor `/vendor/orders`. Admin `/orders`. Tracking is a placeholder. No DHL.

## Limits

Sandbox PSP only. No DHL/FedEx/UPS. No settlement or payouts. No multi-seller or split-location. No rider app. No production COD collection. MoR remains OPEN.

## Stop

1F and 1G require separate authorization.
