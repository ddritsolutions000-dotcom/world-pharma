# WORLD_PHARMA_S135 — Pharmacy / Vendor Network + Onboarding Closure

**Status:** COMPLETE (software network lifecycle)  
**Master Index:** #431  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production pharmacy/vendor network:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_PHARMACY_VENDOR_NETWORK`)  
**Real licensed pharmacies invented:** NO  

## Implementation completed

Sprint 135 closes the **software-side pharmacy/vendor marketplace lifecycle** into one coherent control surface, without inventing KYC providers or licensed pharmacies. Production partner verification remains **EXTERNAL_GATED** (S124).

### Lifecycle (mapped onto existing PartnerStatus)

PROSPECT → APPLICATION → DOCUMENTS → VERIFICATION → APPROVED → CATALOG/INVENTORY SETUP → ENABLED → ORDER FULFILLMENT → SETTLEMENT → SUSPENDED/EXPIRED

**Separation enforced:** DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.

### Reused (not duplicated)

| Component | Source |
| --- | --- |
| PartnerStatus SM | `partner/state-machine.ts` |
| KYC docs / cases | S72/S124 rails |
| Pharmacy licence / commercial | S40/S43 |
| Vendor readiness | `vendor-activation-readiness.service.ts` |
| Marketplace purchasability | `partner-operations.service.ts` |
| Fulfillment | S123 Accept→Pick→Pack→READY_TO_SHIP |
| Catalog / inventory access | `catalog/access.ts`, inventory ownership |
| Vendor team | `vendor-team.service.ts` |
| Settlements | finance vendor controllers (read-only for vendor) |
| Admin partners queue | existing `partners-admin.tsx` |

### New / extended

1. **`pharmacy-vendor-network-closure.ts` (S135)** — authoritative report, phase map, gates, fail-closed catalog, settlement invariants, partner fulfillment eligibility helper.  
2. **`order.service.ts` `assertVendorCanFulfill`** — PartnerStatus + KYC expiry fail-closed (in addition to org ACTIVE).  
3. **Admin** — `GET …/pharmacy-vendor-network-closure`; Provider + Launch cards.  

## Files changed

- `apps/api/src/partner/pharmacy-vendor-network-closure.ts` (new)
- `apps/api/src/partner/s135-pharmacy-vendor-network-closure.spec.ts` (new)
- `apps/api/src/orders/order.service.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s135-pharmacy-vendor-network.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S135_PHARMACY_VENDOR_NETWORK_CLOSURE.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Tests

```text
# S135 + S123 + S124
npx jest --testPathPatterns=s135-pharmacy-vendor-network-closure --testPathPatterns=s123-vendor-fulfillment --testPathPatterns=s124-kyc
# → Test Suites: 3 passed; Tests: 12 passed, 12 total

# Related (S127 + partner lifecycle)
npx jest --testPathPatterns=s127-lab-partner --testPathPatterns=partner-lifecycle
# → Test Suites: 2 passed; Tests: 8 passed, 8 total

# Web-customer S135 surface
npx jest --testPathPatterns=s135-pharmacy
# → Tests: 1 passed, 1 total
```

**Actual results:** S135+S123+S124 **12/12 PASS**; S127/partner-lifecycle **8/8 PASS**; web-customer S135 **1/1 PASS**.

## Production / vendor status

| Area | Status |
| --- | --- |
| Software onboarding lifecycle | COMPLETE |
| Sandbox vendor fulfillment | SANDBOX_VERIFIED (S123) |
| Production KYC/KYB | EXTERNAL_GATED (S124) |
| Production pharmacy network | BLOCKED |
| Fake licensed pharmacies | Forbidden |

## External blockers

1. **NO_PRODUCTION_PHARMACY_VENDOR_NETWORK** (umbrella)  
2. **NO_PRODUCTION_KYC_KYB_PROVIDER** (S124)  
3. Production PSP / carrier when live settlement payouts / shipping required  
4. Human SoD verification + market licence evidence refs  
5. Security / deploy gates  

STOP — do not auto-start the next sprint.
