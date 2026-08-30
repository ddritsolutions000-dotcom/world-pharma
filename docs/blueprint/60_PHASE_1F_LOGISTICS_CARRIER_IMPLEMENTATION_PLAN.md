# 60 — Phase 1F global logistics, carriers, and delivery (implementation plan)

**Status:** Plan — implemented as mock-only in [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md)  
**Date:** 26 August 2026  
**Authorization:** Phase 1F **planning** only  
**Forbidden in this task:** production code, Prisma migrations, live DHL/FedEx/UPS, real credentials, real labels, real freight charges, settlement/P&L, vendor/affiliate payout, rider production app, lab/doctor product, Phase 1G

Canonical: [11](11_LOGISTICS_PLATFORM.md), [43](43_ECOSYSTEM_BASELINE_LOCK.md), [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §13–15 / 1F, [20](20_DATABASE_ARCHITECTURE.md) §5.36–5.37, [21](21_API_ARCHITECTURE.md) delivery/jobs, [22](22_EVENT_ARCHITECTURE.md), [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md), [18](18_GLOBALIZATION.md)

1E ends at **READY_TO_SHIP** + internal `Shipment` draft + **no-op** `CarrierPort`. This plan is the contract to operate **physical movement** when a later coding task is authorized. First **code** slice must use **MockCarrierAdapter**. Live DHL requires a **separate** authorization after contracts/credentials/compliance.

---

## 0. Boundary

| In 1F (when coded later) | Out of 1F |
| --- | --- |
| `CarrierPort` + MockCarrierAdapter | Live DHL/FedEx/UPS SDKs and production keys |
| Planned DHL adapter **interface** (not live) | Real labels, tracking numbers from DHL |
| Carrier catalog, accounts, capabilities, health | Hardcoded DHL in Order tables |
| ShippingQuote vs customer charge vs actual cost | Treating missing cost as 0 |
| Shipment booking lifecycle + idempotency | Duplicate bookings / double labels |
| Tracking events + signed webhooks | Trusting customer browser callbacks |
| LogisticsJob contracts for MEDICINE_DELIVERY, SAMPLE_COLLECTION, SAMPLE_TRANSPORT, REPORT_DELIVERY | Lab/doctor/phlebotomy **product** |
| Delivery-partner / rider **data contracts** | Production rider app, employment model |
| Carrier cost capture + recon exceptions | Settlement journal, vendor/affiliate payout, P&L |
| Customer/vendor/admin shipment UIs | Internal routing secrets, PHI in tracking |

**1E → 1F:** fulfillment `READY_TO_SHIP` → book execution (`PLATFORM_FLEET` job **or** `CARRIER` shipment).  
**1F → 1G:** recorded customer shipping charge + quoted/actual carrier cost + surcharges + currency/FX facts. **1F must not post settlement.**

**Do not** capture payment, create Orders, or rewrite 1E commercial snapshots.

---

## 1. Logistics architecture

Two **execution modes** ([50] §13), one logistics kernel ([11]):

```
Country Policy + Fulfillment (1E READY_TO_SHIP)
        ↓
  ExecutionRouter
   ├── PLATFORM_FLEET  → LogisticsJob  → DeliveryPartner / internal fleet
   └── CARRIER          → Shipment      → CarrierPort → Mock | DHL* | FedEx | UPS | Local
```

\*DHL is the **first planned external adapter**, not a core entity name.

| Layer | Owns |
| --- | --- |
| Order / Fulfillment (1E) | What to ship, origin location, frozen customer shipping charge |
| Logistics kernel | Job type, assignment, OTP/POD, partner privacy, MEDICINE_DELIVERY / sample / report jobs |
| Carrier orchestration | Quote, book, label, track, invoice cost for parcel networks |
| Adapters | Provider SDKs behind `CarrierPort` |

**SoT:** PostgreSQL. Redis may cache carrier metadata and rate-limit webhooks; **not** shipment SoT.

**No carrier HTTP inside the 1E order-create transaction.** Booking is async (BullMQ) after READY_TO_SHIP.

---

## 2. Carrier abstraction (`CarrierPort`)

Domain never imports DHL/FedEx/UPS packages. Port operations ([50] §13), capability-gated:

| Operation | Notes |
| --- | --- |
| `health` | Circuit / demote |
| `quote` | Returns **carrier** cost, not customer charge |
| `createShipment` | Idempotent client key |
| `cancelShipment` | If capability |
| `getLabel` | Reference + format, not arbitrary PHI docs |
| `schedulePickup` | If capability |
| `getStatus` / `track` | Pull truth |
| `verifyWebhook` / `parseWebhook` | Mandatory for inbound |
| `fetchInvoiceItems` | Actual cost lines |
| `createReturn` | RTO / inbound if capability |

Missing capability → `UNSUPPORTED` (router skips).

### 2.1 First adapters (planned)

| Adapter | When |
| --- | --- |
| **MockCarrierAdapter** | **First implementation** — simulate quote/book/timeout/unknown/label/track/fail/RTO/invoice |
| DhlCarrierAdapter | **After** contract + sandbox credentials + **separate live-DHL authorization** |
| FedEx / UPS / Local / InternalFleet | Later adapters; same port |

Internal fleet is **not** a fake DHL; it creates `LogisticsJob` (`fulfillment_mode = PLATFORM_FLEET`).

---

## 3. Capabilities

Capability flags on account/service (not every carrier has all):

`pickup`, `quote`, `create_shipment`, `cancel`, `label`, `tracking`, `pod`, `returns`, `domestic`, `international`, `cod`, `dangerous_goods`, `temperature_controlled`, `signature`, `otp_handover`

Router **must** check capability **before** quote/book. Fail closed if Country Policy requires a capability the carrier lacks.

---

## 4. Carrier configuration

| Entity | Role |
| --- | --- |
| `Carrier` | Catalog code (e.g. `DHL`, `MOCK`) — display/config, not domain ifs |
| `CarrierAccount` | Per legal entity × env; `credential_secret_ref` only |
| `CarrierCapability` | Flags §3 |
| `CarrierService` | Maps to generic SLA (STANDARD, EXPRESS, …) |
| `CarrierCountryCoverage` | Origin/dest countries, lanes |
| `CarrierHealth` | Success rate, latency, webhook lag, circuit |

Secrets: vault/KMS **references**. Never plaintext in Postgres or git. Environments: `sandbox` / `staging` / `production`. 1F first code: **sandbox + mock only**.

---

## 5. Service levels

Generic SLAs: `STANDARD`, `EXPRESS`, `SAME_DAY`, `NEXT_DAY`, `ECONOMY`, `INTERNATIONAL`.

Country Policy enables the subset. Map to carrier service codes **in the adapter**, not in Order.

---

## 6. Shipping quote vs customer charge

`ShippingQuote` (ephemeral at checkout; freeze customer side on Order in 1E):

| Field | Meaning |
| --- | --- |
| `customer_charge_minor` | What the customer pays (already on Order shipping snapshot) |
| `carrier_quoted_cost_minor` | What the carrier **says** it will cost (nullable until 1F quote) |
| `platform_subsidy_minor` / `vendor_subsidy_minor` | Explicit funding |
| tax, currency, SLA, ETA, origin, destination, weight/dims | |

**Invariant:** customer charge ≠ carrier actual cost. **Missing carrier cost is NULL, never 0.**

---

## 7–8. Cost flow (for 1G)

```
Checkout (1C) → customer shipping charge frozen on Order (1E)
READY_TO_SHIP → 1F quote/book
Carrier invoice/webhook → actual cost + surcharges (immutable cost rows)
1G reads Order charge + Shipment costs → contribution (not in 1F)
```

Shipment economics (BIGINT minors + currency; FX snapshot if converted):

- quoted carrier cost  
- actual carrier cost  
- fuel / remote / other surcharges  
- tax / duties **as provided** (no invented customs law)  
- correction rows (`CarrierCostAdjustment`) — **no UPDATE** of posted actuals  

---

## 9. Routing

Deterministic, data-driven (no `if (country === 'IN')`, no `if (carrier === 'DHL')` in domain):

Inputs: country pack, origin location, destination, weight/dims, SLA, regulated flags, capabilities, health, cost, merchant/account, `fulfillment_mode`.

Algorithm:

1. Pack: shipping enabled? domestic/cross-border allowed?  
2. Filter by coverage × capability × SLA × regulated constraints.  
3. Exclude inactive / circuit-open.  
4. Sort by pack mandate, then SLA fit, then health, then quoted cost.  
5. Persist **routing snapshot** on the shipment (candidates, chosen account, reason).

**Do not change carrier after `BOOKED`.** Failover only **before** accepted booking (§10).

---

## 10. Failover (no dual book)

| When | Allowed |
| --- | --- |
| Quote fail, `UNSUPPORTED`, health deny, **clean** create reject | Next eligible carrier |
| After submit, timeout / UNKNOWN | **No** second create until `getStatus` / webhook / recon |
| Confirmed `BOOKING_FAILED` | New shipment attempt (new id) if pack allows |

Same dual-charge rule as 1D: timeout after possible accept → `BOOKING_UNKNOWN`, reconcile, then maybe retry. Tests must forbid two live carrier shipments for one fulfillment package.

---

## 11. Shipment state machine (carrier mode)

Derived from [11] job engine + parcel booking; **not** a UI copy.

Happy path:

`READY_TO_SHIP` → `BOOKING` → `BOOKED` → `LABEL_CREATED` → `PICKUP_SCHEDULED` → `PICKED_UP` → `IN_TRANSIT` → `OUT_FOR_DELIVERY` → `DELIVERED`

Failure / exception:

`BOOKING_FAILED` | `BOOKING_UNKNOWN` | `CANCEL_REQUESTED` → `CANCELLED` | `DELIVERY_FAILED` | `RETURN_TO_ORIGIN` | `RETURNED` | `LOST` | `DAMAGED`

Guards:

- No skip from `BOOKING` to `DELIVERED` without track or webhook.  
- `DELIVERED` does not revert to `IN_TRANSIT` except a **trusted correction** event type (admin + carrier correction), never a late stale webhook.  
- After `BOOKED`, no second `createShipment` to another carrier.

**Fleet mode** uses [11] §6 job states (`CREATED` → … → `DELIVERED` / `RETURNED`) on `LogisticsJob`, not DHL statuses.

---

## 12–14. Tracking, webhooks, idempotency

`ShipmentTrackingEvent`: carrier code, **normalized** code, time, location (coarse), description, provider event id, sequence, source (`webhook` | `poll` | `ops`).

Customer sees normalized: picked up, in transit, out for delivery, delivered, exception.

`POST /api/v1/webhooks/carriers/:carrierId` (follow existing `/api/v1/webhooks/payments/:gatewayId` pattern):

verify signature → timestamp/replay → dedupe `(carrier_id, provider_event_id)` → persist → async process.

Do not trust app deep links. Out-of-order: apply only if sequence/time is newer **and** transition is legal. Duplicate webhook → one transition.

---

## 15–16. Labels and packages

Label: URL or object-store ref, format, tracking number, carrier/service, package id, created_at. No unnecessary documents.

`Package` / `PackageItem`: weight, dims, declared value + currency, type, temperature **requirement** (capability, not a claim).

**v1:** one shipment / one package per fulfillment group unless a CR opens split shipment (align OD-PHARM-02 / 1E: no silent split). Schema may allow N packages later.

---

## 17. Origin

Origin = 1E fulfilling location (`STORE` | `WAREHOUSE` | `VENDOR_WAREHOUSE`). Not a new vendor identity.

Do not reroute after allocation. If origin cannot ship (carrier coverage fail), exception queue — **not** silent warehouse hop.

---

## 18–21. International, customs, regulated, cold chain

Country Policy: `shipping.domestic`, `shipping.cross_border`, carrier allow-list, medicine `can_ship`. Default **fail closed** for cross-border medicines ([50] §15).

Customs **abstraction only**: commercial invoice, HS, origin country, declared value, duties **UNKNOWN** until legal. **LEGAL/COMPLIANCE REVIEW REQUIRED.** Do not assume medicine export/import is lawful.

Regulated: RX / controlled / restricted / temp-sensitive flags from catalog + pack. Missing policy → do not book.

Temperature: `AMBIENT` | `REFRIGERATED` | `FROZEN` | `MONITORED` as **requirements**. Carrier must advertise matching capability. **QUALITY/COMPLIANCE REVIEW REQUIRED** for real cold-chain. Do not claim all carriers support it.

---

## 22–27. Jobs, partners, rider boundary

Partner types already exist: `DELIVERY_PARTNER`, `PHLEBOTOMIST` ([36]).

| Job type ([11] names) | 1F coding | Notes |
| --- | --- | --- |
| `MEDICINE_DELIVERY` | In 1F **when authorized** (fleet and/or carrier) | Order/Fulfillment reference; OTP/POD per pack |
| `SAMPLE_COLLECTION` | **Contract only** | Lab product not in 1F |
| `SAMPLE_TRANSPORT` | Contract only | Chain of custody ids; no results |
| `REPORT_DELIVERY` | Contract only | Sealed package; **never** attach clinical PDF to rider ([11]) |

Rider app (APP-DEL): **plan only** — OTP login, KYC, availability, offers, navigate handoff, pickup/delivery, POD, fail, incidents, COD **where pack allows**. **Do not build the app in 1F first slice.** Data contract: assigned job, pickup/dropoff snapshots, masked contact, handling flags. **No payment secrets, other vendors, diagnosis, Rx image, lab PDF.**

POD methods: OTP (hash at rest), signature, photo, geo/time. Country pack selects. Default OTP for medicine/report until OD-LOG-09.

---

## 28–29. Failure and RTO

Reasons: unavailable, bad address, restricted, damaged, lost, carrier fail, refusal, COD fail.

Policy: retry (new job/shipment id recommended), RTO, cancel, refund **via 1D/1E** — 1F does not auto-refund.

`DELIVERY_FAILED` → `RETURN_TO_ORIGIN` → `RETURNED`. Disposition of goods: quarantine / inspect / destroy / restock — **pack + pharmacy**, not logistics inventing restock of medicines.

---

## 30. Carrier cost reconciliation

Compare internal shipment vs mock/carrier invoice: missing, amount, currency, duplicate, surcharge, service, weight.

Exceptions stored; **never rewrite** posted `CarrierCost`. 1G consumes matched rows.

---

## 31. Events (existing outbox + BullMQ)

No second bus.

Carrier shipment: `SHIPMENT_CREATED`, `SHIPMENT_BOOKED`, `SHIPMENT_LABEL_CREATED`, `SHIPMENT_PICKUP_SCHEDULED`, `SHIPMENT_PICKED_UP`, `SHIPMENT_IN_TRANSIT`, `SHIPMENT_OUT_FOR_DELIVERY`, `SHIPMENT_DELIVERED`, `SHIPMENT_FAILED`, `SHIPMENT_RETURNED`, `SHIPMENT_LOST`, `SHIPMENT_DAMAGED`, `CARRIER_COST_RECORDED`, `CARRIER_RECONCILIATION_EXCEPTION`.

Fleet jobs keep [11]/[22] `LOGISTICS_JOB_*` names. Idempotent occurrence keys. Do not emit `VENDOR_PAID`, `AFFILIATE_PAID`, `SETTLEMENT_COMPLETED`.

---

## 32–33. Order / settlement boundaries

Shipping does not capture pay or create Order. It consumes 1E facts.

1F records shipping charge (already frozen), quote, actual, subsidy, surcharges, currency, FX snapshot if needed.

1G later: customer paid, vendor payable, gateway fee, promo, affiliate, tax, **actual freight**, refunds → contribution. **1F does not compute company profit.**

---

## 34–37. UI (when coding)

**Customer:** shipment status, tracking number, carrier/service (when appropriate), ETA, normalized timeline, attempts, exceptions, return status. No routing internals.

**Vendor:** own seller READY_TO_SHIP / in transit / delivered / exceptions. No other vendors.

**Admin:** search, carrier, webhooks, costs, recon, RTO. Permissions: `logistics:read`, `logistics:manage`, `logistics:admin`, `logistics:reconcile`.

**Delivery partner (future app):** assigned jobs only.

---

## 38–39. Performance and security

Timeouts, retries, circuit breakers, rate limits, idempotency keys, async workers. No carrier I/O in order insert txn.

Credentials: secret refs. Webhook signatures. RLS: customer own, vendor own seller, partner assigned, admin permissioned. Minimize PHI in tracking JSON. Hash OTPs.

---

## 40. Database plan (logical — **no migration in this task**)

`carriers`, `carrier_accounts`, `carrier_capabilities`, `carrier_services`, `carrier_coverages`, `shipping_quotes`, `shipments` (extend 1E), `packages`, `package_items`, `shipment_labels`, `tracking_events`, `delivery_attempts`, `proof_of_delivery`, `carrier_costs`, `carrier_cost_adjustments`, `carrier_reconciliations`, `return_shipments`, `logistics_jobs`, `logistics_job_events`.

UUID v7. BIGINT minors. Original currency preserved.

---

## 41. API plan (conventions: `/api/v1/...`)

| Surface | Examples |
| --- | --- |
| Customer | `GET /me/shipments`, `GET /me/shipments/:id`, `GET /me/shipments/:id/tracking` |
| Vendor | `GET /vendor/shipments`, `GET /vendor/shipments/:id` |
| Admin | `GET /admin/shipments`, retry/cancel POSTs, recon |
| Partner (later) | `GET /delivery/jobs/offers`, accept/pickup/otp/deliver ([21]) |
| Webhook | `POST /webhooks/carriers/:carrierId` |

Exact paths follow existing `me` / `vendor` / `admin` prefixes.

---

## 42. Mock first

**First coding authorization for 1F must implement MockCarrierAdapter** simulating: quote, book success/fail/timeout/unknown, label, pickup, in transit, OFD, delivered, fail, RTO, invoice.

**Do not** call real DHL in that slice. Live DHL = later authorization (account, countries, legal, sandbox then prod keys).

---

## 43. Test plan (when coding)

Routing, capabilities, pack, quotes, booking idempotency, timeout UNKNOWN, failover **before** book only, duplicate webhook, out-of-order track, labels, POD, RTO, costs, recon, currency/FX, RLS, isolation, fail-closed regulated, cold-chain capability skip, international pack.

**Critical:**

A. A fails **before** book → B allowed  
B. A timeout after submit → no B until recon  
C. Duplicate webhook → one transition  
D. DELIVERED ↛ IN_TRANSIT via stale webhook  
E. Missing actual cost stays NULL, not 0  
F. Invoice mismatch → recon exception  
G. Vendor A ↛ vendor B shipment  
H. Customer A ↛ customer B  
I. Partner sees assigned job only  
J. No PHI in tracking metadata  
K. Mock path makes **zero** DHL HTTP calls  

---

## 44. Open decisions (remain OPEN)

DHL contract and countries; carrier pricing; launch country; legal entity; MoR; customs/tax/FX vendors; regulated shipping permissions; cold-chain quality system; COD remittance; store vs warehouse origin (OD-PHARM-01); split shipment; partial fulfillment; partner compensation; rider employment vs contractor; POD method (OD-LOG-09); RTO restock; OD-LOG-* from [11] (multi-stop, dual role, contactless).

---

## 45. Acceptance (future coding)

See checklist in the coding authorization. **Must include** MockCarrierAdapter, dual-book prevention, NULL≠0 cost, RLS.  

**Must remain absent** until extra auth: live DHL/FedEx/UPS, live keys, settlement, payouts, P&L, lab/doctor products, production rider app, real COD cash collection.

---

## 46. Stop

After a coding task meets §45 with **mock only**: **STOP.** Do not enable live DHL. Do not start 1G.
