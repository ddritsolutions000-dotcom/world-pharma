# 11 — Logistics Platform

**Status:** Blueprint  
**Audience:** Product, logistics engineering, operations, finance, privacy, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Payments](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Open Decisions](35_OPEN_DECISIONS.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

Rider join: `PartnerType=DELIVERY_PARTNER`. `REPORT_DELIVERY` jobs never attach clinical PDFs.

**Requirement IDs:** REQ-LOG, REQ-ORD, REQ-REP, REQ-PHE, REQ-PAY, REQ-LED

Journeys: J01/J03/J04 (medicine), J10–J11 (samples), J14–J15 (physical reports), J21 (partner earnings).

---

## 1. Purpose

Logistics is a **kernel capability**, not an app feature ([01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) principle 5). One engine assigns, tracks, and settles physical movement for:

| `job_type` | What moves | Typical counterpart |
| --- | --- | --- |
| `MEDICINE_DELIVERY` | Pharmacy/vendor fulfillment to customer | `Order` / `Fulfillment` |
| `SAMPLE_COLLECTION` | Phlebotomist visit to patient | `DiagnosticCase` |
| `SAMPLE_TRANSPORT` | Sealed sample to lab | `Sample` |
| `REPORT_DELIVERY` | Physical report copy | `PhysicalReportRequest` |
| `GENERIC_HEALTHCARE` | Future healthcare errands | Reserved; **not implemented in v1** |

Inspiration: food-delivery liquidity (presence, offer, accept, ETA, OTP, POD) with **healthcare-grade identity, custody, and privacy**.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Courier licensing, medical specimen transport, controlled-medicine delivery, contactless delivery, and COD cash handling per country. Do not invent those rules.

---

## 2. Applications

| App ID | Surface | Role |
| --- | --- | --- |
| APP-DEL | RN Android/iOS | `delivery_partner` |
| APP-PHE | RN | `phlebotomist` (jobs with `PHLEBOTOMY`) |
| APP-OPS / APP-ADM | Web | `operations`, `fleet_dispatcher`, `country_admin` |
| APP-CUS-* | Customer | Track own jobs (privacy-minimized) |

Auth for riders: phone OTP + device bind + PIN/biometric. MFA email model is for staff, not field ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §7).

---

## 3. Partner onboarding

### 3.1 Registration and KYC

`organization_type` may be `LOGISTICS_FLEET` or individual partner (`organization_id` null).

Status: `DRAFT` → `SUBMITTED` → `KYC_IN_REVIEW` → `VEHICLE_REVIEW` (if pack requires) → `APPROVED` → `ACTIVE`, plus `SUSPENDED`, `REJECTED`, `NEEDS_RESUBMISSION`.

KYC: identity documents from **country pack**, vehicle/insurance fields **only if pack requires**, payout account, background check **only via adapter if pack requires**.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** What may be collected about couriers.

### 3.2 Capabilities

| Capability | Job types |
| --- | --- |
| `PARCEL` | `MEDICINE_DELIVERY`, `REPORT_DELIVERY` |
| `PHLEBOTOMY` | `SAMPLE_COLLECTION` |
| `BIO_SPECIMEN` | `SAMPLE_TRANSPORT` (training / packaging rules per pack) |
| `COLD_CHAIN` | Offers with cold requirement |
| `COD_CASH` | Jobs with `cod_amount > 0` |
| `RX_ID_CHECK` | Medicine delivery requiring ID at door (pack) |

**OPEN DECISION (OD-LOG-12):** Dual role phlebotomist + delivery. Capabilities still apply per job.

### 3.3 Availability and presence

Same pattern as phlebotomist: shifts, `ONLINE` / `OFFLINE` / `BUSY`, service polygons, vehicle type.

Going `OFFLINE` with an active job is blocked or requires dispatcher handoff.

---

## 4. Reusable `LogisticsJob` model

### 4.1 Identity and references

| Field | Notes |
| --- | --- |
| `job_id` | Globally unique |
| `country_id` | First-class; no default country |
| `job_type` | Enum above |
| `state` | §6 |
| `reference_type` | `ORDER_FULFILLMENT`, `DIAGNOSTIC_CASE`, `SAMPLE`, `PHYSICAL_REPORT`, `GENERIC` |
| `reference_id` | Counterpart id |
| `parent_job_id` | e.g. collection job spawns transport |
| `organization_id` | Pickup org (pharmacy, lab, vendor) |

### 4.2 Parties and locations

| Field | Notes |
| --- | --- |
| `customer_id` | For customer tracking auth |
| `partner_id` | Assigned person |
| `offer_batch_id` | Broadcast/sequential offer wave |
| `pickup` | Address snapshot, geocode, instructions, window_start/end, contact **masked** |
| `dropoff` | Same |
| `requirements[]` | Capabilities, vehicle, scan-mandatory, OTP-mandatory, cold |

Snapshots of address at job creation: later customer address edits do not silently mutate in-flight jobs (ops recreates or patches with audit).

### 4.3 SLA, ETA, money

| Field | Notes |
| --- | --- |
| `sla_at` | Latest successful complete |
| `eta_pickup` / `eta_dropoff` | Computed; customer sees dropoff ETA only when appropriate |
| `distance_m` / `duration_s` estimates | From maps adapter |
| `quote_currency` + `partner_payout_amount` | Earning quote |
| `cod_amount` + `cod_currency` | Zero if prepaid |
| `cod_collected_amount` | At POD |
| `platform_delivery_fee_snapshot` | What customer was charged |

### 4.4 Proof and security

| Field | Notes |
| --- | --- |
| `otp_hash` | Never store raw OTP |
| `pod` | Photo object id, signature object id, OTP success flag, timestamp |
| `scan_events[]` | Barcode/package/sample scans |
| `failure_reason_code` | Closed set |
| `rating_customer` / `rating_partner` | After complete |
| `privacy_mode` | `MINIMIZED` default for customer map |

### 4.5 What the partner app is allowed to show

| Job type | Partner sees |
| --- | --- |
| `MEDICINE_DELIVERY` | Name, phone (masked/proxy), address, item **count**, handling flags (fragile, keep upright). **Not** full Rx image, **not** diagnosis |
| `SAMPLE_COLLECTION` | Identity fields needed to verify + kit list ([10_PHLEBOTOMIST_PLATFORM.md](10_PHLEBOTOMIST_PLATFORM.md) §9) |
| `SAMPLE_TRANSPORT` | Bag/sample ids, lab address, temperature flag. **Not** result values (none yet) |
| `REPORT_DELIVERY` | Addressee, package id. **Not** report PDF contents |

**RISK:** Printing clinical PDFs on the rider device. Mitigation: `REPORT_DELIVERY` is a sealed package; rider never downloads the report artifact.

---

## 5. Integration with order, sample, and report

| Counterpart | Creates job when | Terminal coupling |
| --- | --- | --- |
| Pharmacy/vendor fulfillment packed | Pack complete + ready to dispatch | Order cannot `DELIVERED` without job `DELIVERED` (or policy exception) |
| Diagnostic case confirmed (home) | Assignment requested | Case `PHLEBOTOMIST_ASSIGNED` |
| Sample `SAMPLE_SEALED` needing courier | Transport requested | Case `PICKED_UP` / `IN_TRANSIT` |
| Physical report `PACKAGED` | Delivery requested | Physical report `JOB_CREATED` onward ([09_LAB_PLATFORM.md](09_LAB_PLATFORM.md) §12) |

Domain events (outbox):

- `LogisticsJobCreated` → counterpart may move to assigned-pending
- `LogisticsJobAccepted` → case/order tracking
- `LogisticsJobArrivedPickup` / `PickedUp` / `ArrivedDropoff` / `Delivered`
- `LogisticsJobFailed` / `Cancelled`
- `CodCollected` / `CodShortage`

Logistics **does not** mutate clinical results or order line items. It emits events; order/diagnostics apply their own guards.

**ASSUMPTION (A-LOG-01):** v1 is **one dropoff per job** except OD-LOG-10 multi-stop. Batching multiple pickups is OD-LOG-03.

---

## 6. Job state machine

### 6.1 States

| State | Meaning |
| --- | --- |
| `CREATED` | Job exists, not offered |
| `OFFERED` | One or more partners currently offered |
| `ASSIGNED` | Named partner, not yet accepted (if dispatcher force-assign) |
| `ACCEPTED` | Partner accepted |
| `EN_ROUTE_PICKUP` | To pickup |
| `ARRIVED_PICKUP` | At pickup |
| `PICKED_UP` | Custody of parcel/sample/package |
| `EN_ROUTE_DROPOFF` | To dropoff |
| `ARRIVED_DROPOFF` | At dropoff |
| `OTP_PENDING` | OTP/POD in progress |
| `DELIVERED` | Success terminal (for delivery-like jobs) |
| `COMPLETED` | Alias for collection visits where “delivered” is not the customer metaphor; **use `DELIVERED` for engine unity** and map UX labels per job type |
| `FAILED` | Failed; see reason |
| `CANCELLED` | Cancelled before success |
| `RETURN_IN_PROGRESS` | Returning to origin (failed dropoff with goods still in hand) |
| `RETURNED` | Back at origin; origin scanned in |

For `SAMPLE_COLLECTION`, map diagnostics states onto this engine:

| Diagnostics (09) | Logistics job |
| --- | --- |
| `PHLEBOTOMIST_ASSIGNED` | `OFFERED` or `ASSIGNED` |
| `ACCEPTED` | `ACCEPTED` |
| `ARRIVING` | `EN_ROUTE_DROPOFF` **if pickup is partner start** — **ASSUMPTION (A-LOG-02):** collection jobs use **dropoff = patient**, pickup = partner home/base **or** a virtual pickup. Simpler: collection jobs set **pickup = patient** as the first stop (`EN_ROUTE_PICKUP` = arriving at patient). Then there is **no parcel until seal**; after seal, either complete collection job and spawn `SAMPLE_TRANSPORT`, or extend with second stop = lab. |

**ASSUMPTION (A-LOG-03) recommended v1:**

1. `SAMPLE_COLLECTION` job: patient is **pickup** (visit). Terminal success = `DELIVERED` meaning **visit complete / sample sealed** (diagnostics `SAMPLE_SEALED`). No customer OTP for blood draw; identity verification replaces OTP.
2. `SAMPLE_TRANSPORT` job: pickup = phlebotomist handover or drop-box; dropoff = lab. Lab scan = POD analog (`LAB_RECEIVED`).
3. `MEDICINE_DELIVERY` / `REPORT_DELIVERY`: classic pickup store/lab → customer OTP.

### 6.2 Core transitions (all job types unless noted)

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| (none) | `CREATED` | domain system | counterpart ready | serviceable geo; requirements known |
| `CREATED` | `OFFERED` | assignment | offers sent | eligible partners exist |
| `CREATED` | `ASSIGNED` | dispatcher | force assign | `fleet_dispatcher`; partner capable |
| `OFFERED` | `ACCEPTED` | partner | accept | offer still valid; `job:accept` |
| `ASSIGNED` | `ACCEPTED` | partner | accept | named partner |
| `OFFERED` | `CREATED` | system | all offers expire / all reject | retry with expanded radius |
| `OFFERED` | `CANCELLED` | counterpart / ops | no capacity | |
| `ACCEPTED` | `EN_ROUTE_PICKUP` | partner | start | |
| `EN_ROUTE_PICKUP` | `ARRIVED_PICKUP` | partner | arrive | geofence assist |
| `ARRIVED_PICKUP` | `PICKED_UP` | partner + origin | pickup scan if required | medicine: pack code; sample: `sample_id`; report: package id |
| `PICKED_UP` | `EN_ROUTE_DROPOFF` | partner | | |
| `EN_ROUTE_DROPOFF` | `ARRIVED_DROPOFF` | partner | | |
| `ARRIVED_DROPOFF` | `OTP_PENDING` | partner | start handover | job types that require OTP |
| `OTP_PENDING` | `DELIVERED` | partner + recipient | OTP match + POD | attempts remaining |
| `ARRIVED_DROPOFF` | `DELIVERED` | partner | collection identity pass + seal **or** lab scan | job-type specific; OTP skipped if not required |
| `ACCEPTED` … `OTP_PENDING` | `CANCELLED` | ops / counterpart | policy | if `PICKED_UP`, must go `RETURN_*` not silent cancel |
| `PICKED_UP` / `EN_ROUTE_DROPOFF` / `ARRIVED_DROPOFF` / `OTP_PENDING` | `FAILED` | partner / system | cannot complete | reason; if goods in hand → prefer `RETURN_IN_PROGRESS` |
| `FAILED` (goods in hand) | `RETURN_IN_PROGRESS` | system | | |
| `RETURN_IN_PROGRESS` | `RETURNED` | origin staff | scan in | |
| `RETURNED` | — | | terminal for this job; counterpart may recreate | |
| `DELIVERED` | — | | terminal | |
| `CANCELLED` | — | | terminal | |

### 6.3 Reject (offer-level, not job terminal)

Reject is on **offer**, not a job state. Partner declines → offer record `REJECTED`; job stays `OFFERED` or returns `CREATED`.

### 6.4 Failed delivery and re-delivery

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `OTP_PENDING` / `ARRIVED_DROPOFF` | `FAILED` | partner | customer unavailable, OTP exhausted, refused | |
| `FAILED` | `OFFERED` or `CREATED` | ops / customer | re-delivery | new window; **new job_id recommended** with `parent_job_id` |
| `FAILED` | `RETURN_IN_PROGRESS` | system | perishable / Rx / specimen rules | specimens: do not leave unattended; return to lab |

Medicine customer unavailable: order policy may reschedule. Sample transport fail: diagnostics `SAMPLE_DAMAGED` / investigation, not a silent customer redelivery of bio specimens to a home.

### 6.5 Job-type OTP / POD matrix

| Type | Pickup proof | Dropoff proof |
| --- | --- | --- |
| `MEDICINE_DELIVERY` | Pack/fulfillment scan | OTP + optional photo; ID check if `RX_ID_CHECK` |
| `SAMPLE_COLLECTION` | N/A or kit check | Identity verification + barcode + seal; **not** customer delivery OTP |
| `SAMPLE_TRANSPORT` | Sample/bag scan + handover ack | Lab accession scan |
| `REPORT_DELIVERY` | Package scan | OTP (+ photo if pack) |
| `GENERIC_HEALTHCARE` | TBD | Future |

**OPEN DECISION (OD-LOG-09):** Contactless delivery without OTP. Default **OTP required** for medicine and reports until country pack allows alternative POD. Never assume a market’s postal rules.

### 6.6 Forbidden transitions

- `CREATED` → `DELIVERED`
- `DELIVERED` → `PICKED_UP` rewind
- `CANCELLED` → `ACCEPTED` (new job)
- Partner self-assign jobs they were not offered (unless dispatcher)
- Completing `SAMPLE_TRANSPORT` without matching `sample_id` scan

---

## 7. Assignment algorithm (high level)

Not a coded formula. Configurable weights in country/ops pack.

### 7.1 Candidate set

Partners who are `ACTIVE`, `ONLINE`, not exceeding concurrent jobs, in polygon, with **all** `requirements[]` capabilities, not blocked by fraud holds, with valid KYC.

### 7.2 Offer strategy

**OPEN DECISION (OD-LOG-02):** Sequential (best candidate first, short timeout) vs broadcast to N vs hybrid.

Recommendation: **sequential with small N broadcast** (e.g. top 3) to protect SLA without spamming the whole city.

### 7.3 Ranking signals (directional)

| Signal | Direction |
| --- | --- |
| Distance to pickup | Closer better |
| Time to pickup ETA | |
| Acceptance rate / completion rate | |
| Job-type experience | Specimen vs parcel |
| Current load | |
| Surge / idle time | OD-LOG-08 |
| Fairness | Avoid starving new partners |

**Do not** rank by kickback to a pharmacy or lab. **LEGAL/COMPLIANCE REVIEW REQUIRED** if any seller-paid “priority dispatch”.

### 7.4 Timeouts and expansion

Offer TTL → expand radius / relax non-safety filters (never relax `PHLEBOTOMY` or `BIO_SPECIMEN`). Then dispatcher queue. Then fail job → counterpart cancellation/refund policy.

### 7.5 Multi-stop / batching

**OPEN DECISION (OD-LOG-03)** batch pickups. **OPEN DECISION (OD-LOG-10)** multi-drop routes in v1. Recommendation: **single stop pair in v1** for clinical specimens; medicine batching later.

Route optimization: maps adapter; platform stores waypoint list only if OD-LOG-10 is yes.

---

## 8. Dispatch, tracking, ETA, navigation

| Concern | Behavior |
| --- | --- |
| Dispatch | Ops can reassign before pickup; after pickup, reassignment requires mid-job handover scan |
| Live tracking | WebSocket + Redis pub/sub ([04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §8) |
| ETA | Maps adapter + traffic; refresh on ping; never invent a single vendor as hardcoded |
| Navigation | Deep link to provider (OD-LOG-01) |
| Stale GPS | Mark `location_stale`; customer UI honest; dispatcher alert |

**OPEN DECISION (OD-LOG-01):** Maps/ETA vendor (Google, Mapbox, local). Adapter mandatory.

**OPEN DECISION (OD-LOG-05):** Ping interval vs battery vs privacy. Recommendation: tighter pings only `EN_ROUTE_*`; coarse when idle.

---

## 9. Privacy of live location

| Rule | Detail |
| --- | --- |
| Purpose limitation | Location used for assignment, ETA, geofence, fraud — not advertising |
| Customer map | Only while job is in trackable states; **reduced precision** (e.g. snapped to route or geohash) **OPEN DECISION (OD-LOG-06)** |
| After complete | Stop publishing; retain operational pings per retention pack, not a public history on the profile |
| Partner app | Partner sees own location; not other partners |
| Support | Masked; full trace is compliance/ops with reason |
| Idle partners | Not shown to customers |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Employee/contractor location monitoring laws.

**RISK:** Raw high-frequency tracks in analytics warehouses. Mitigation: downsample; separate from clinical data.

---

## 10. COD handling and ledger events

COD is **first-class money**, never a chat note ([01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) principle 4).

### 10.1 When COD is allowed

Country pack + job type. **OPEN DECISION (OD-LAB-16)** lab COD default off. Medicine COD: payment method on `Order`.

Job carries `cod_amount` snapshot. Partner must have `COD_CASH` capability.

### 10.2 At the door

1. OTP/POD as required.
2. Partner enters `cod_collected_amount` (must equal snapshot unless ops-authorized partial — **OPEN DECISION OD-LOG-13**, recommend **no partial** in v1).
3. Event `CodCollected`.
4. Order payment state becomes collected-pending-deposit, not “settled”.

If customer cannot pay: `FAILED` reason `COD_REFUSED`; goods return path; order not `DELIVERED`.

### 10.3 Ledger events (names directional)

Posted by ledger module from logistics/payment events ([13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md)):

| Event | Intent |
| --- | --- |
| `COD_DUE` | When job created with COD (receivable) |
| `COD_COLLECTED` | Cash now with partner (partner cash clearing) |
| `COD_SHORTAGE` | Declared collected ≠ due |
| `COD_DEPOSITED` | Partner deposited to platform/cash-in point |
| `COD_REMITTED` | Applied against order; revenue/settlement as for prepaid |
| `COD_WRITEOFF` | Finance only, dual control |
| `DELIVERY_FEE_ACCRUED` | Partner earning |
| `DELIVERY_FEE_REVERSED` | Failed/cancelled after accrue |
| `PARTNER_PAYOUT` | Settlement batch |
| `SAMPLE_TRANSPORT_FEE_*` / `REPORT_DELIVERY_FEE_*` | Same pattern, `rule_id` distinguishes |

**OPEN DECISION (OD-LOG-04):** Cash deposit SLA and cash-in network. Until closed: earning hold if undeposited COD exceeds threshold.

**RISK:** Fake POD + fake COD. Mitigation: OTP, photo, anomaly (duration, GPS), device bind, payout holds.

FX: COD currency = order currency. No ad-hoc conversion in the field.

---

## 11. Earnings, payout, ratings, support

### 11.1 Earnings

Rules engine: distance, job type, duration, surge (OD-LOG-08), wait-time, cancellation after accept.

Journey J21. Weekly (or pack) payout via settlement. Missing KYC blocks payout.

### 11.2 Ratings

Customer rates partner after `DELIVERED`. Partner may rate **dropoff difficulty** not the patient’s health. Public doctor-style reputation is **not** copied onto riders’ clinical skill.

### 11.3 Support

Tickets from partner app: job, pay, harassment, unsafe. Ops tools: reassign, cancel, OTP regenerate (audited, rate-limited), never reveal clinical PDF.

Customer support: tracking, failed delivery, re-delivery — masked clinical data.

---

## 12. Partner app UX spine (implementation)

Online toggle → offers → accept/reject → navigate pickup → scan → navigate dropoff → OTP/POD → earnings.

Offline: queue GPS and status like phlebotomist; **cannot** complete OTP match offline (server verifies). Cannot collect COD confirmation offline without later reconciliation flag.

---

## 13. Country policy hooks

| Key | Default |
| --- | --- |
| `logistics.enabled` | false until ops |
| `logistics.job_types[]` | empty until enabled per type |
| `logistics.cod.enabled` | false until legal/payments |
| `logistics.otp.required` | true recommended |
| `logistics.contactless` | false (OD-LOG-09) |
| `logistics.specimen_transport.enabled` | false until legal |

**Do not hardcode a country.** Service polygons, helmet laws, vehicle types: pack data.

---

## 14. Notifications

Offer push, cancel, reassign, customer “partner arriving”, OTP, deposit reminders, payout. No specimen results in rider notifications.

---

## 15. Open decisions (this document)

| ID | Question |
| --- | --- |
| OD-LOG-01 | Maps / ETA provider |
| OD-LOG-02 | Sequential vs broadcast assignment |
| OD-LOG-03 | Multi-pickup batching |
| OD-LOG-04 | COD deposit SLA and cash-in |
| OD-LOG-05 | Location ping interval |
| OD-LOG-06 | Customer map precision |
| OD-LOG-07 | In-house vs 3PL mix (fleet orgs) |
| OD-LOG-08 | Surge pricing for partner payout and/or customer fee |
| OD-LOG-09 | Contactless / no-OTP POD |
| OD-LOG-10 | Multi-stop routes in v1 |
| OD-LOG-11 | `SAMPLE_COLLECTION` always a logistics job vs diagnostics-only assignment |
| OD-LOG-12 | Same person phlebotomist + delivery_partner |
| OD-LOG-13 | Partial COD collection |

**OD-LOG-11 recommendation:** Use logistics jobs for all four implemented types so assignment, tracking, and earnings stay one engine (A-PHE-01).

Also [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md).
