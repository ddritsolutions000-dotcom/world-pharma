# Sprint 77 — Production logistics / carrier + delivery operations final activation readiness

Stabilization of the **Sprint 67** carrier-first onboarding path. No carrier vendor was invented.

## Provider status (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (MockCarrierAdapter only) |
| Environment | sandbox |
| Configured / Verified / Approved / Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** |
| Production | **EXTERNAL_GATED** |
| Shipment creation | **SANDBOX_ONLY** |
| Tracking | **SANDBOX_VERIFIED** / SANDBOX_ONLY |
| Webhook | **SANDBOX_ONLY** (production **EXTERNAL_GATED**) |
| Serviceability | **POLICY_DRIVEN** |
| Carrier coverage | **CARRIER_COVERAGE_EXTERNAL_GATED** |
| POD / rider | **DEVICE_NOT_AVAILABLE** |
| COD | **NOT_INVENTED** (do not invent cash collection) |
| Returns | **POLICY_REQUIRED** where business rules incomplete |
| Remaining blocker | **NO_PRODUCTION_CARRIER_ADAPTER** |

No DHL/FedEx/Shiprocket/Delhivery credentials or live shipments were introduced.

## Activation lifecycle (S64 / S67)

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Configured ≠ ENABLED. Production requires adapter + vault refs + webhook + approval + coverage + enablement guard.

## Shipment lifecycle

`ORDER → ALLOCATED → PICKING → PACKED → READY_TO_SHIP → SHIPMENT_CREATED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`

Exceptions: `CANCELLED` | `FAILED` | `RETURN_REQUESTED` | `RETURNED` | `LOST` | `UNDELIVERABLE`

Booking uses deterministic idempotency keys — duplicate create/retry must not spawn multiple authoritative shipments.

## Tracking events

`LABEL_CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`

Exceptions: `FAILED` | `EXCEPTION` | `UNDELIVERABLE` | `RETURNING` | `RETURNED`

Duplicates are harmless; terminal states must not be overwritten by older events.

## Webhook security

Sandbox mock webhooks require signature verification, event id / idempotency, replay window, audit.

Unsigned/invalid → fail-closed.

Production webhooks remain **EXTERNAL_GATED** without a real carrier.

Do not log full sensitive payloads.

## Delivery / POD

POD requires authorized confirmation (actor, timestamp, shipment id, audit). Shipment existence ≠ DELIVERED.

Native rider Android/iOS = **DEVICE_NOT_AVAILABLE**. 390px web = **RESPONSIVE_WEB_VERIFIED** only.

## Notifications (S76)

Architecture can enqueue sandbox notifications for shipment milestones. Real SMS/email/push remain **EXTERNAL_GATED**.

## Observability (S75)

Critical logistics events should carry correlation ID + safe status. NOT_SELECTED must not raise false carrier-outage alerts.

## Serviceability

Policy-driven. No hardcoded India / IN / INR / ₹ / UPI / +91 / IST in the carrier rail.

## Emergency disable

- `CARRIER_LIVE_ENABLED=false`
- or `PROVIDER_EMERGENCY_DISABLE_CARRIER`

Preserve shipment/order records; do not invent delivery.

## Admin

- `/provider-activation` — Carrier / logistics activation readiness (Sprint 77)
- `/logistics` — ops console
- `GET /api/v1/admin/control-plane/carrier-onboarding`

## Production activation sequence

1. Register non-mock carrier adapter (create/track/cancel + webhook verify).
2. Vault secret refs; account; origin/pickup; services; country coverage.
3. Production webhook signing secrets.
4. Legal/compliance + coverage clearance.
5. `PROVIDER_APPROVED_CARRIER=true`.
6. `LOGISTICS_ENVIRONMENT=production` + `CARRIER_LIVE_ENABLED=true` only after `can_enable=true`.
7. Do **not** create a real production shipment without explicit authorization.

## Explicit blockers

- **NO_PRODUCTION_CARRIER_ADAPTER**
- Production = **EXTERNAL_GATED**
- Do **not** mark World-Pharma production-ready while carrier and other external gates remain open.
