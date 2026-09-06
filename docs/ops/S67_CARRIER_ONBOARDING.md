# Sprint 67 — Carrier / logistics production onboarding readiness

> **Sprint 77** stabilizes this rail for final operational activation readiness. See `docs/ops/S77_CARRIER_LOGISTICS_ONBOARDING.md`. Remaining blocker remains `NO_PRODUCTION_CARRIER_ADAPTER` until a real carrier is supplied.

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (MockCarrierAdapter only) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** |
| Production | **EXTERNAL_GATED** |
| Webhook | **SANDBOX_ONLY** |
| Serviceability | **POLICY_DRIVEN** (country zones/coverage; live carrier EXTERNAL_GATED) |
| Tracking | **SANDBOX_VERIFIED** |
| POD / native rider | **DEVICE_NOT_AVAILABLE** |
| Remaining blocker | `NO_PRODUCTION_CARRIER_ADAPTER` |

No DHL/FedEx/Shiprocket/Delhivery (or other) SDK or live credentials were introduced.

## Safe path verified

1. Sandbox MockCarrierAdapter remains available for vendor fulfillment / tracking.
2. Production fail-closed: `LOGISTICS_ENVIRONMENT=production` without `CARRIER_LIVE_ENABLED` → `LOGISTICS_LIVE_DISABLED`.
3. Production booking never falls back to mock (`never_fallback_to_mock`, `NO_PRODUCTION_CARRIER_ADAPTER`).
4. Enablement guard requires non-mock adapter + production env + live flag + human approval + production webhook (credentials alone ≠ ENABLED).
5. Production carrier webhooks remain EXTERNAL_GATED until a live adapter is registered.
6. Emergency disable: `CARRIER_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_CARRIER` — preserve shipment/order records; do not invent delivery.
7. Native Android/iOS rider/POD = DEVICE_NOT_AVAILABLE (390px web ≠ native).

## Admin

- `/provider-activation` — Carrier / logistics onboarding card
- `GET /api/v1/admin/control-plane/carrier-onboarding`

## Lifecycle

`CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Ops-manual via secret manager. Ordinary Admin with `policy:read` can inspect only.

## When a real carrier is supplied

1. Register non-mock carrier adapter (create/track/cancel + webhook verify).
2. Vault secret refs; account/merchant id; origin/pickup; services; country coverage.
3. Production webhook signing secrets.
4. `PROVIDER_APPROVED_CARRIER=true`.
5. Set `LOGISTICS_ENVIRONMENT=production` + `CARRIER_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** create a real production shipment without explicit authorization.
