# Sprint 122 — Real Carrier + Logistics Activation Preparation

**Status:** COMPLETE (activation preparation — no real carrier / no real shipments)  
**Master Index:** #420  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| Carrier | **NOT_SELECTED** / sandbox **SANDBOX_VERIFIED** |
| Production credentials | **MISSING** / **EXTERNAL_GATED** |
| Webhook | **NOT_CONFIGURED** / **EXTERNAL_GATED** |
| Serviceability | **EXTERNAL_GATED** |
| Verification / Approval | **NOT_VERIFIED** / **NOT_APPROVED** |
| Enablement | **DISABLED** / **EXTERNAL_GATED** |
| Production logistics | **BLOCKED** |

**Security statement:** S90/S105 carrier lifecycle reused — no second carrier/shipment/tracking/webhook/idempotency framework. Mock forbidden in production. Unsigned webhooks rejected. Cross-border medicine remains LEGAL_GATED. No real shipment/tracking/POD.

## Goal

Prepare existing World-Pharma carrier/logistics architecture for connection to a real production carrier later — by configuration references — without rewriting.

## Authoritative source

`apps/api/src/logistics/carrier-logistics-activation-preparation.ts` composes:

- S7/S26/S34/S61 delivery & fulfillment rails (existing)
- S67/S77/S90/S105 carrier activation (lifecycle + production requirements)
- S87 launch control
- S116 security gate
- S117–S119 foundation / release / deployment target
- S120 payment context
- S121 communications context

## 1. Current carrier state

- Lifecycle: **NOT_SELECTED**
- Production: **EXTERNAL_GATED**
- Sandbox mock: **SANDBOX_VERIFIED** (sandbox only)
- Enabled: **false**
- Remaining blocker: **NO_PRODUCTION_CARRIER_ADAPTER**

## 2. Existing logistics architecture reused

| Concern | Source |
|---------|--------|
| Carrier abstraction / lifecycle | `carrier-first-onboarding.ts` (S90) |
| Real activation readiness | `carrier-real-activation-first-onboarding.ts` (S105) |
| Production config validators | `production-carrier-requirements.ts` |
| Env / mock detection | `carrier.config.ts` |
| Shipment + tracking machines | Existing S90 builders |
| Provider enablement guard | `evaluateCarrierEnablementGuard` |
| Webhooks / idempotency / POD / RTO | Existing logistics rails (not duplicated) |

## 3. Carrier lifecycle

Unchanged:

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`

Current production state remains **NOT_SELECTED** / **EXTERNAL_GATED**. No second lifecycle.

## 4. Production configuration references

Reference slots only (no secret values in source or logs):

- provider identity, production endpoint ref, credential/secret ref, account ref
- webhook endpoint + signing-secret ref
- markets, serviceability, pickup locations, shipment modes
- tracking / cancellation / returns / RTO / COD / label / POD capability refs
- logistics environment identity

All slots: `value_present: false`, `invented: false`.

## 5. Shipment lifecycle

Existing machine reused. Integrity rules enforced in report:

- UNPAID / FAILED → cannot become paid fulfillment
- Fulfillment not READY → cannot ship
- Shipment not confirmed → cannot become delivered

Production shipment creation while carrier NOT_SELECTED: **BLOCKED**.

## 6. Tracking lifecycle

Existing tracking event machine reused (created / pickup / in transit / out for delivery / delivered / exception / cancelled / returned/RTO). Customer UI must not show delivery states unsupported by shipment/event data. No false production tracking numbers.

## 7. Webhook security

Existing webhook security reused:

- signature verification required
- unsigned/invalid rejected
- replay / idempotency via existing occurrence-key rails
- no invented carrier-specific signing algorithm without a real provider
- production webhook status: **EXTERNAL_GATED**

## 8. Idempotency

Existing occurrence-key infrastructure:

- repeated shipment request → one logical shipment
- repeated webhook → no duplicate state transition
- repeated tracking/delivery events → no duplicate side effects

## 9. Serviceability

Policy-driven (market, origin/destination, postal, product/Rx constraints, carrier capability, cross-border eligibility). **No** global India hardcoding (IN/INR/₹/+91/IST stay in India policy).

## 10. Cross-border model

Architecture can represent customer market ≠ source/vendor country ≠ carrier operating country. Medicine import routes remain **LEGAL_GATED** — not claimed legally approved.

## 11. POD / security

Existing POD + S110 authorization reused. Native rider: **DEVICE_NOT_AVAILABLE**. No fake rider validation.

## 12. Returns / RTO

Existing cancellation / return / RTO / failed-delivery / refund-handoff architecture reused. Delivery events do not auto-create arbitrary financial outcomes. Central financial control preserved.

## 13–15. Experiences

| Surface | Result |
|---------|--------|
| Customer | Sandbox tracking OK; production false shipped/tracking forbidden |
| Vendor | Fulfillment / READY_TO_SHIP; cannot spoof delivered or bypass controls |
| Logistics | Existing queue/state/exception/RTO surfaces; no full UI redesign |

## 16. Sandbox vs production

- Sandbox mock carrier: allowed
- Production mock / sandbox-pointing-to-prod: **BLOCKED**
- `LOGISTICS_ENVIRONMENT` read from existing config

## 17. Fail-closed behavior

Cases: not selected, credentials missing, not verified/approved/enabled, mock in production, webhook unverified, security unresolved — all **production_shipping_blocked: true**.

## 18. Exact external carrier inputs still required

1. Real carrier contract + account + production endpoint/credential **references**
2. Webhook endpoint + signing-secret **references**
3. Market / serviceability / pickup configuration
4. Tracking / cancellation / returns / RTO / POD capability confirmation
5. Human verification + approval
6. Security certification (`EXTERNAL_PENTEST_REQUIRED`)
7. Production environment / deployment target (S117–S119) before live enablement

## 19. Verification / approval requirements

Lifecycle advance only after CONFIGURED → VERIFIED → APPROVED → ENABLED with human approval and non-mock adapter. Force-enable / force-launch: **unavailable**.

## 20. Remaining launch blockers

Primary: **NO_PRODUCTION_CARRIER_ADAPTER** (plus credential/webhook/market/serviceability/tracking refs, pentest, foundation). Broader launch still **NO** (PSP, OTP, deploy target, etc.).

## 21. Explicit launch state

**`CAN_PRODUCTION_LAUNCH = NO`**

Do **not** claim: real carrier active, real shipment booked, real tracking number, real delivery, real POD, production logistics enabled, or cross-border medicine legally approved.

## Admin

- Launch: “why can’t we ship?” (Sprint 122)
- Provider Activation: Sprint 122 card
- API: `GET /api/v1/admin/control-plane/carrier-logistics-activation-preparation`

## Tests

| Suite | Result |
|-------|--------|
| Unit S122 | **4/4** |
| Playwright S122 | **3/3** |
| Regression S67+S77+S90+S105+S116+S120+S121+S122 | **52/52** |
| Screenshots | `apps/test-results/s122-carrier-shots/` (**9**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native / rider | **DEVICE_NOT_AVAILABLE** |

## STOP

Sprint 122 complete. Do **not** invent a carrier. Do **not** book real shipments. Do **not** auto-start Sprint 123.
