# WORLD_PHARMA_S134 — Real Carrier + Logistics Production Activation

**Status:** COMPLETE (software activation path)  
**Master Index:** #430  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production logistics:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_CARRIER_ADAPTER`)  
**Real shipments / tracking / delivery:** NO  

## Implementation completed

Sprint 134 completes the **software-side production carrier + logistics activation path**, following the S132/S133 pattern. Production remains **fail-closed** until a real non-mock carrier, secrets-manager resolution, human verification/approval, and live flags exist.

### Reused (not duplicated)

| Component | Source |
| --- | --- |
| Carrier adapter contract | `carrier.port.ts` + `MockCarrierAdapter` |
| Shipment state machine | `state.ts` + S90 descriptive machines |
| Production logistics gate | `production-logistics-gate.ts` (S46) |
| Config validation | `production-carrier-requirements.ts` (S90) |
| Lifecycle / enablement | `carrier-first-onboarding.ts` (S67/S77/S90) |
| Real activation checklist | `carrier-real-activation-first-onboarding.ts` (S105) |
| Activation preparation | `carrier-logistics-activation-preparation.ts` (S122) |
| Vendor handoff | Existing orders fulfillment (S123) |
| Booking / webhooks / POD / RTO | `logistics.service.ts` |
| Admin control plane | existing Launch + Provider cards |

**S131 secrets-manager runtime resolver:** still **MISSING** — not invented.

### New / extended

1. **`carrier-logistics-production-activation-path.ts` (S134)**  
   - Live configuration reference inventory (credential refs only; never secret values)  
   - Lifecycle: `NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`  
   - CONFIGURED only when provider + required refs present  
   - VERIFIED/APPROVED only via explicit human status env markers  
   - ENABLED remains **false** (no non-mock adapter registered)  
   - `assertProductionCarrierShipmentInitiationAllowed` / `assertProductionCarrierWebhookIngestAllowed`  
   - Illegal transition + webhook/safety case catalogs  
   - Adapter capability contract (unsupported ≠ fake success)  

2. **`logistics.service.ts`** — production quote/booking/webhook call S134 fail-closed asserts before mock path.  

3. **Admin** — `GET …/carrier-logistics-production-activation-path`; S122 cards show S134 badges.  

4. **S122 report** embeds `s134_activation_path`.

## Files changed

- `apps/api/src/logistics/carrier-logistics-production-activation-path.ts` (new)
- `apps/api/src/logistics/s134-carrier-logistics-production-activation-path.spec.ts` (new)
- `apps/api/src/logistics/carrier-logistics-activation-preparation.ts`
- `apps/api/src/logistics/logistics.service.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s134-carrier-activation-path.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S134_REAL_CARRIER_LOGISTICS_ACTIVATION.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Tests

```text
# S134 + S122 (primary)
npx jest --testPathPatterns=s134-carrier-logistics-production-activation-path --testPathPatterns=s122-carrier-logistics-activation-preparation
# → Test Suites: 2 passed; Tests: 14 passed, 14 total

# Related regression (state + config + S123)
npx jest --testPathPatterns=state.spec --testPathPatterns=carrier.config.spec --testPathPatterns=s123-vendor-fulfillment
# → Test Suites: 4 passed; Tests: 21 passed, 21 total

# Web-customer S134 surface
npx jest --testPathPatterns=s134-carrier
# → Tests: 1 passed, 1 total
```

**Actual results:** S134+S122 **14/14 PASS**; related logistics/S123 regression **21/21 PASS**; web-customer S134 **1/1 PASS**.

## Provider status

| Capability | Status |
| --- | --- |
| Carrier | NOT_SELECTED / EXTERNAL_GATED |
| Serviceability | POLICY_DRIVEN / EXTERNAL_GATED |
| Shipment creation | BLOCKED in production |
| Tracking | EXTERNAL_GATED |
| Webhook | EXTERNAL_GATED |
| Label/waybill | EXTERNAL_GATED (no fake production waybills) |
| POD | SOFTWARE_READY_EXTERNAL_GATED |
| Returns/RTO | SOFTWARE_READY_EXTERNAL_GATED |
| Software path | COMPLETE |
| Production enabled | false |

## External blockers

1. **NO_PRODUCTION_CARRIER_ADAPTER** (umbrella)  
2. Carrier provider selection + credential/account/webhook **references**  
3. Secrets-manager runtime resolver **MISSING**  
4. Non-mock carrier adapter not registered  
5. Human verification + approval + live flags + security/deploy gates  

STOP — do not auto-start the next sprint.
