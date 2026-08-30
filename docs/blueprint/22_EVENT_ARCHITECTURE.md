# 22 — Event Architecture

**Status:** Blueprint  
**Audience:** Architecture, backend engineering, SRE, data, compliance  
**Requirement IDs:** REQ-OBS, REQ-NOT, REQ-SRCH, REQ-LED, REQ-PAY, REQ-ORD, REQ-RX, REQ-DOC, REQ-LAB, REQ-LOG, REQ-AFF, REQ-EHR  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health Record](16_HEALTH_RECORD.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Search](24_SEARCH_ARCHITECTURE.md)

Domain books 05–16 use mixed aliases (dotted names such as `checkout.session.paid`, PascalCase such as `AppointmentConfirmed`). Those names are **aliases**. This catalog is canonical **SCREAMING_SNAKE**.

---

## 1. Purpose

World Pharma is a modular monolith. Cross-module work (pay → order → ledger → notify → search) must not be a hidden in-process call chain. Domain modules persist state, write an **outbox row in the same database transaction**, and a dispatcher delivers at-least-once events to consumers.

Events integrate: notifications ([23](23_NOTIFICATION_ARCHITECTURE.md)), search ([24](24_SEARCH_ARCHITECTURE.md)), ledger ([13](13_LEDGER_SETTLEMENT.md)), CRM ([15](15_CRM_PLATFORM.md)), health metadata ([16](16_HEALTH_RECORD.md)), affiliate freeze/reverse ([14](14_AFFILIATE_PLATFORM.md)), analytics (no clinical payload).

**ASSUMPTION (A-EVT-01):** One logical event bus inside the monolith for Phase 0–3. Broker extraction is later ops, not a client-visible change.

---

## 2. Topology (now vs later)

```
  Domain module (same PG transaction)
        │  INSERT aggregate + outbox_event
        ▼
  Outbox dispatcher (poll / LISTEN)
        │
        ▼
  BullMQ on Redis  ──►  consumer workers (notification, search, ledger, CRM, …)
        │
        └── dead-letter queue + ops alert

  Later (OD-EVT-02): same outbox row → Kafka (or equivalent) topics.
  Envelope, event_id, and consumer inbox tables do not change.
```

| Horizon | Transport | Why |
| --- | --- | --- |
| **Now** | Transactional outbox in PostgreSQL → **BullMQ / Redis** | Matches [04](04_APPLICATION_ARCHITECTURE.md): one deployable API, simple ops, no silent drop of ledger-bound events |
| **Later** | Kafka (or cloud equivalent) **if needed** | Independent scale, multi-region fan-out, or compliance isolation of a consumer |

**Do not** start with Kafka. **Do not** call notification/search/ledger adapters synchronously from the HTTP request that mutates the aggregate (except read-your-write projections required for the response).

**OPEN DECISION (OD-EVT-02):** Kafka extraction trigger. Recommendation: extract when (a) a consumer needs independent deploy/scale, (b) cross-region fan-out is required, or (c) outbox lag SLO cannot be met. Until then, BullMQ.

**RISK:** Treating BullMQ as a source of truth. Source of truth is the **outbox table**. Redis is a delivery buffer. Rebuildable.

---

## 3. Envelope (normative)

Every published event uses this envelope. Payload is domain-specific (logical fields in §7–§8).

| Field | Type (logical) | Rules |
| --- | --- | --- |
| `event_id` | UUID v7 | Globally unique. Generated when the outbox row is inserted. Never reused. |
| `type` | string | Canonical type from this catalog (`ORDER_PAID`, …). |
| `occurred_at` | timestamptz UTC | Domain time of the business fact, not dispatch time. |
| `country_id` | UUID | Mandatory. Events are country-scoped. No global implicit country. |
| `producer` | string | Module id: `order`, `payment`, `logistics`, `care`, `diagnostics`, `prescription`, `ledger`, `affiliate`, `health`, `identity`, `inventory`, `catalog`, `crm`, `compliance`. |
| `aggregate_type` | string | `Order`, `PaymentIntent`, `LogisticsJob`, `Appointment`, `Encounter`, `Prescription`, `LabBooking`, `Sample`, `Report`, `Refund`, `SettlementBatch`, `AffiliateConversion`, `ConsentGrant`, … |
| `aggregate_id` | UUID | The aggregate the fact is about. |
| `payload` | object | Logical fields only. No gateway PAN, no Rx image bytes, no full clinical notes, no raw GPS trails. |
| `correlation_id` | UUID | Journey/checkout/session id that ties a fan-out (see §5). |

**ASSUMPTION (A-EVT-02):** Envelope **also** carries (implementation columns, not payload):

| Extra field | Why |
| --- | --- |
| `schema_version` | Integer; additive evolution only |
| `causation_id` | `event_id` of the causing event (webhook, prior domain event) |
| `actor_id` | User or `system:{worker}` |
| `legal_entity_id` | When known; required for money events ([13](13_LEDGER_SETTLEMENT.md)) |
| `partition_key` | `{country_id}:{aggregate_type}:{aggregate_id}` for later Kafka ordering |

**OPEN DECISION (OD-EVT-01):** Dual naming. Recommendation: **publish only SCREAMING_SNAKE** `type`. Keep an alias map in shared-types for domain-doc names. Do not emit two events for one fact.

---

## 4. Producer contract (outbox)

1. Mutate aggregate in PostgreSQL.
2. Insert `outbox_event` in the **same transaction**.
3. Commit.
4. Dispatcher marks `published_at` after the broker/queue ack.
5. Workers consume; they **never** update the producer aggregate except via explicit compensating commands.

### 4.1 Outbox row (logical)

| Column | Meaning |
| --- | --- |
| `event_id` | PK |
| `type`, `occurred_at`, `country_id`, `producer`, `aggregate_type`, `aggregate_id` | Envelope |
| `payload` | JSONB |
| `correlation_id` | |
| `schema_version` | |
| `occurrence_key` | Unique with `(aggregate_id, type, occurrence_key)` to stop duplicate facts |
| `created_at` | Insert time |
| `published_at` | Null until dispatcher succeeds |
| `publish_attempts` | Dispatcher retries |

**ASSUMPTION (A-EVT-03):** `occurrence_key` is typically `{aggregate_id}:{type}:{to_state}` or `{aggregate_id}:{type}:{version}`. State-change events are unique per transition, not per HTTP retry.

**RISK:** Dual-write without outbox (HTTP handler posts to Redis after commit). Process crash = lost event. Forbidden for money, clinical custody, and notification-of-record events.

---

## 5. Correlation and ordering

| Concept | Use |
| --- | --- |
| `correlation_id` | Usually `CheckoutSession.id` for paid commerce; else `order_id` / `booking_id` / `job_id` / support `ticket_id` |
| Per-aggregate order | Consumers that mutate a projection **must** process a given `aggregate_id` sequentially (BullMQ jobId / group, later Kafka partition) |
| Cross-aggregate | No global total order. Use `causation_id` and business ids |

**ASSUMPTION (A-EVT-04):** `ORDER_PAID` and `PAYMENT_SUCCESS` may both fire for one checkout. Consumers key idempotency on `event_id` **and** on business keys (`payment_intent_id`, `order_id`). See §7.1 vs §7.13.

**OPEN DECISION (OD-EVT-03):** Whether `ORDER_CREATED` is emitted at DRAFT persist or only when the order becomes commercially real (`PENDING_PAYMENT` / `PAID`). Recommendation: **emit at first persist of the Order aggregate** (usually `PENDING_PAYMENT`); do not emit for abandoned carts.

---

## 6. Delivery, retry, idempotency, failure (platform-wide)

These rules apply to every event unless a catalog row tightens them.

### 6.1 Delivery semantics

**At-least-once delivery. Exactly-once business effect.**

| Layer | Mechanism |
| --- | --- |
| Producer | Outbox unique `(aggregate_id, type, occurrence_key)` |
| Dispatcher | Retry publish until ack; then `published_at` |
| Queue | BullMQ attempts with exponential backoff |
| Consumer | Inbox table unique `(consumer_name, event_id)` |
| Side effects | Ledger `source_event_id` unique; notification `(template_id, aggregate_id, event_id)`; search document `version` |

**OPEN DECISION (OD-EVT-05):** Exactly-once broker vs at-least-once + inbox. Recommendation: **at-least-once + inbox**. Do not require Kafka transactions in Phase 0.

### 6.2 Retry (default)

| Step | Policy |
| --- | --- |
| Dispatcher | Immediate + backoff; unbounded until outbox lag alert; never drop ledger-class types |
| Worker | Exponential backoff: 15s, 1m, 5m, 15m, 1h (configurable) |
| Max attempts | **25** then DLQ (**OPEN DECISION OD-EVT-08** exact numbers) |
| Retryable | Timeouts, 429, 5xx of adapters, lock contention |
| Not retryable | Schema validation fail, unknown type (park), authorization “will never succeed” |

### 6.3 Poison / DLQ

| Queue | Contents |
| --- | --- |
| `events.dlq` | After max attempts or non-retryable |
| Alert | Pager for `producer` in `{payment, ledger, diagnostics, prescription}` |
| Replay | Ops replays by `event_id`; consumer inbox prevents double apply |

**RISK:** Silent drop of ledger events. Quality attribute from [04](04_APPLICATION_ARCHITECTURE.md): **zero silent drop**. DLQ is visible, not a trash can.

### 6.4 Failure handling (compensation vs retry)

| Class | Handling |
| --- | --- |
| **Transient** | Retry worker |
| **Compensation** | Emit a **new** event (`ORDER_CANCELLED`, `REFUND_CREATED`). Do not mutate history |
| **Notification fail** | Report/order still stored; retry notify; never un-release a signed report because push failed (J13) |
| **Search fail** | Stale index; retry; search is not source of truth |
| **Ledger fail** | P0 incident; payable/refund instruction must exist ([05](05_CUSTOMER_PLATFORM.md) payment-captured/child-fail) |

### 6.5 PII and residency

**LEGAL/COMPLIANCE REVIEW REQUIRED** for event payload retention and cross-border replication.

| Rule | |
| --- | --- |
| Minimize | Ids, status, money, reason codes. No Rx pixels, no report analytes, no chat body |
| Retention | Outbox/payload retention follows country pack + legal hold ([16](16_HEALTH_RECORD.md)) |
| Replication | **Default: no cross-country bus.** **OPEN DECISION (OD-EVT-06)** |

**RISK:** Analytics warehouse copying full payloads. Health events carry **metadata only**.

---

## 7. Required event catalog

For each event: producer, consumers, logical payload, retry, idempotency, failure.

Payload fields are **logical**. Persistence names live in later database docs. Money is always `{ amount_minor, currency }`.

### 7.1 `ORDER_CREATED`

| | |
| --- | --- |
| **When** | Order aggregate first persisted (typically `PENDING_PAYMENT`). Not a cart line add. |
| **Producer** | `order` |
| **Aggregate** | `Order` / `order_id` |
| **Journeys** | J01, J03, J08 |
| **Aliases** | `order.state.changed` (to PENDING_PAYMENT), create-side of checkout child confirm |

**Consumers**

| Consumer | Action |
| --- | --- |
| CRM | 360 open-order; abandoned-payment automation if unpaid |
| Analytics | Funnel |
| Notification | Usually **none** until paid (avoid “order placed” on unpaid hold) |
| Inventory | Soft hold already done in command; event is informational |
| Affiliate | Click already bound; conversion **not** earned yet |

**Payload (logical)**

| Field | Notes |
| --- | --- |
| `order_id`, `checkout_session_id` | |
| `customer_id`, `seller_org_id`, `fulfillment_location_id` | |
| `seller_type` | `PHARMACY_OWNED` \| `VENDOR` |
| `status` | `PENDING_PAYMENT` typical |
| `rx_required` | boolean |
| `line_count`, `currency`, `amount_minor` | Totals snapshot |
| `service_address_id` | Id only, not full address text in default payload |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default worker policy |
| **Idempotency** | `occurrence_key = order_id:ORDER_CREATED`. Inbox on `event_id` |
| **Failure** | CRM/analytics lag only. Must not block checkout response |

---

### 7.2 `ORDER_PAID`

| | |
| --- | --- |
| **When** | Order commercially committed: prepaid capture **or** COD commit per OD-CUS-02. Status `PAID` (then policy may move to `RX_REVIEW` / `ACCEPTED`). |
| **Producer** | `order` (after payment/COD policy applied). Often caused by `PAYMENT_SUCCESS` / `CheckoutSessionPaid`. |
| **Aggregate** | `Order` |
| **Journeys** | J01, J03, J08 |
| **Aliases** | `checkout.session.paid` (parent), `order.state.changed` (to PAID) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Pharmacy / vendor | Fulfillment queue |
| Inventory | Hard allocate if not already (owned pharmacy) |
| Prescription | Enqueue Rx review if `rx_required` |
| Logistics | Not yet; job requested at pack/dispatch |
| Notification | Customer “order confirmed”; seller “new order” |
| Ledger | Unearned / cash clearing per [13](13_LEDGER_SETTLEMENT.md) (often also from `PAYMENT_SUCCESS` — **must be idempotent**) |
| Affiliate | Freeze attribution window; conversion candidate |
| Search | Availability if allocation reduced sellable qty |
| CRM | 360 |

**Payload**

| Field | Notes |
| --- | --- |
| `order_id`, `checkout_session_id`, `payment_intent_id` | |
| `customer_id`, `seller_org_id`, `location_id` | |
| `payment_method` | `CARD` \| `APM` \| `WALLET` \| `COD` \| … |
| `amount_minor`, `currency` | |
| `rx_required`, `next_status` | `RX_REVIEW` or `ACCEPTED` |
| `cod` | boolean |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default; **ledger and inventory consumers are P0** |
| **Idempotency** | `occurrence_key = order_id:ORDER_PAID`. Ledger `source_event_id`. Allocation keyed by `order_id` |
| **Failure** | If payment captured and child confirm failed: compensation worker + `REFUND_CREATED` / ops. **RISK:** money without payable or refund |

---

### 7.3 `ORDER_CANCELLED`

| | |
| --- | --- |
| **When** | Order enters `CANCELLED` (customer, pharmacy, vendor reject, vendor accept SLA timeout, ops, payment expire). |
| **Producer** | `order` |
| **Aggregate** | `Order` |
| **Journeys** | J01, J03, J16 |
| **Aliases** | `order.state.changed` (CANCELLED), `vendor.accept.timeout`, `order.rejected.vendor` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Inventory | Release holds/allocations |
| Logistics | Cancel job if created |
| Notification | Customer + seller with **reason code**, not clinical detail |
| Payment / refund policy | Eligible → `REFUND_CREATED` |
| Affiliate | Reverse pending conversion |
| CRM | 360 |
| Search | Availability restore |

**Payload**

| Field | Notes |
| --- | --- |
| `order_id`, `from_status`, `reason_code` | `CUSTOMER`, `VENDOR_TIMEOUT`, `VENDOR_REJECT`, `RX_REJECT`, `PAYMENT_EXPIRED`, `OOS`, `OPS`, … |
| `refund_expected` | boolean hint; refund engine is source of truth |
| `actor_id` | |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default; inventory release must succeed or DLQ |
| **Idempotency** | One `ORDER_CANCELLED` per order (terminal). Replays no-op |
| **Failure** | Stuck allocation = oversell **RISK**. DLQ + ops. Do not emit a second cancel |

---

### 7.4 `DELIVERY_ASSIGNED`

| | |
| --- | --- |
| **When** | A logistics job is bound to a named partner (offer accepted **or** dispatcher force-assign). Covers medicine, sample collection/transport, report delivery. |
| **Producer** | `logistics` |
| **Aggregate** | `LogisticsJob` |
| **Journeys** | J04, J10, J14, J21 |
| **Aliases** | `LogisticsJobAccepted`, `logistics.job.updated` (ASSIGNED/ACCEPTED) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Order / diagnostics | Tracking projection (`OUT_FOR_DELIVERY` / `PHLEBOTOMIST_ASSIGNED` per job type) |
| Notification | Customer “partner assigned/arriving” (privacy-minimized); partner job offer already sent at OFFERED |
| CRM | Flag only |
| Analytics | Assignment SLA |

**Payload**

| Field | Notes |
| --- | --- |
| `job_id`, `job_type` | `MEDICINE_DELIVERY` \| `SAMPLE_COLLECTION` \| `SAMPLE_TRANSPORT` \| `REPORT_DELIVERY` |
| `partner_id`, `partner_role` | `delivery_partner` \| `phlebotomist` |
| `order_id` / `booking_id` / `sample_id` / `physical_report_id` | Whichever applies |
| `eta_at` | Optional |
| `geo_precision_policy` | Token, not raw trail |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | `occurrence_key = job_id:DELIVERY_ASSIGNED:{partner_id}` so **reassignment** is a new event |
| **Failure** | Customer map stale; job still assigned. Re-notify on retry |

**RISK:** Precise live location in payload. Customer channel gets **minimized** location via a separate realtime path, not this event body ([11](11_LOGISTICS_PLATFORM.md)).

---

### 7.5 `DELIVERY_COMPLETED`

| | |
| --- | --- |
| **When** | Job reaches successful terminal: OTP/POD success (`DELIVERED`). For collection visits, same engine state mapped to UX “collected/handed over” where applicable. |
| **Producer** | `logistics` |
| **Aggregate** | `LogisticsJob` |
| **Journeys** | J04, J15, J21; collection completion is usually `SAMPLE_COLLECTED` (diagnostics) — this event is the **job** completion |
| **Aliases** | `LogisticsJobDelivered`, `PhysicalReportDelivered` (when job_type report) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Order | `DELIVERED` |
| Diagnostics physical report | `DELIVERED` / POD stored (J15) |
| Ledger | Rider payable (J21); vendor payable recognition if policy is POD ([13](13_LEDGER_SETTLEMENT.md) OD-LED-08) |
| Notification | Customer delivered; partner earnings line |
| Affiliate | Hold-period clock may start on delivery per pack |
| CRM | Review invite eligible |

**Payload**

| Field | Notes |
| --- | --- |
| `job_id`, `job_type` | |
| `pod_type` | `OTP` \| `PHOTO` \| `SIGNATURE` \| `CONTACTLESS` |
| `cod_collected_minor`, `currency` | If COD; else omitted |
| `completed_at` | |
| Counterpart ids | `order_id` / `physical_report_id` |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Ledger consumer P0 |
| **Idempotency** | One successful complete per `job_id`. POD stored with job, not in payload blobs |
| **Failure** | If POD saved but event lost: outbox replay. Fake POD fraud → ops, not silent reverse |

---

### 7.6 `APPOINTMENT_BOOKED`

| | |
| --- | --- |
| **When** | Appointment `CONFIRMED` (paid, authorized hold, or zero-price/org-paid). |
| **Producer** | `care` |
| **Aggregate** | `Appointment` |
| **Journeys** | J05 |
| **Aliases** | `AppointmentConfirmed`, `booking.state.changed` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Notification | Customer + doctor calendar |
| Search | Fill-rate / next-slot projection (not clinical) |
| Ledger | Unearned consult fee per pack |
| Affiliate | Conversion candidate if category enabled |
| CRM | 360 |
| Video | May pre-create session shell |

**Payload**

| Field | Notes |
| --- | --- |
| `appointment_id`, `checkout_session_id`, `payment_intent_id` | |
| `customer_id`, `doctor_id`, `consult_type` | `VIDEO` \| `AUDIO` \| `CHAT` |
| `slot_start_at`, `slot_end_at`, `timezone` | |
| `amount_minor`, `currency` | May be 0 |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default; slot already committed in command |
| **Idempotency** | `appointment_id:APPOINTMENT_BOOKED` |
| **Failure** | Notify fail ≠ unbook. Slot stolen is a **command** failure, not this event |

---

### 7.7 `CONSULTATION_STARTED`

| | |
| --- | --- |
| **When** | Encounter enters `IN_CONSULT` (doctor admits / media or chat-only start). |
| **Producer** | `care` (optionally caused by `video.session.updated`) |
| **Aggregate** | `Encounter` (also reference `Appointment`) |
| **Journeys** | J06 |
| **Aliases** | `encounter.started`, appointment `IN_PROGRESS` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Notification | Usually suppress (user is in-app); optional other-party ping |
| Analytics | Time-to-join |
| Audit | Consult start (no media) |
| CRM | Flag |

**Payload**

| Field | Notes |
| --- | --- |
| `encounter_id`, `appointment_id`, `video_session_id` | Video id optional for chat-only (OD-DOC-08) |
| `doctor_id`, `customer_id` | |
| `recording_enabled` | Always default false; consent flags only |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | One start per encounter; reconnects do **not** re-emit |
| **Failure** | Analytics only. Media plane failures are video events, not this fact |

---

### 7.8 `PRESCRIPTION_CREATED`

| | |
| --- | --- |
| **When** | A prescription **record** exists: (a) customer upload case created, or (b) doctor structured Rx draft created. **Not** the same as verified/signed. |
| **Producer** | `prescription` or `care` |
| **Aggregate** | `Prescription` / `PrescriptionCase` |
| **Journeys** | J02, J07 |
| **Aliases** | `prescription.uploaded`, `prescription.submitted`, draft side of `PrescriptionSigned` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Pharmacy Rx desk | Queue if upload/submitted |
| Health | Artifact metadata for upload type ([16](16_HEALTH_RECORD.md) `PRESCRIPTION_UPLOAD`) |
| Notification | Customer “we received your Rx”; pharmacist queue ping |
| Search | **Do not** index Rx contents |

**Payload**

| Field | Notes |
| --- | --- |
| `prescription_id`, `source` | `UPLOAD` \| `DOCTOR_DRAFT` |
| `customer_id`, `encounter_id?`, `order_id?` | |
| `page_count` / `object_ids[]` | Object store ids, not bytes |
| `ocr_assist_used` | boolean; OCR is non-authoritative |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | Create once per `prescription_id` |
| **Failure** | Queue lag. Images already in object store |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** e-prescription validity; upload vs signed digital Rx.

---

### 7.9 `LAB_BOOKED`

| | |
| --- | --- |
| **When** | Lab booking confirmed after payment (or pack-allowed hold). Diagnostic case `CONFIRMED`. |
| **Producer** | `diagnostics` |
| **Aggregate** | `LabBooking` / `DiagnosticCase` |
| **Journeys** | J09 |
| **Aliases** | `LabBookingConfirmed`, `booking.state.changed` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Logistics / assignment | Home collection job if mode = home |
| Notification | Customer prep instructions **by test codes**, not results |
| Ledger | If bill-on-booking (OD-LAB-02 / OD-LED-01) |
| Affiliate | Conversion candidate if pack allows diagnostics |
| CRM | 360 |

**Payload**

| Field | Notes |
| --- | --- |
| `booking_id`, `case_id`, `checkout_session_id` | |
| `lab_org_id`, `lab_location_id?` | Per OD-LAB-03 assignment vs customer-select |
| `collection_mode` | `HOME` \| `CENTER` |
| `slot_start_at`, `address_id?` | |
| `test_codes[]` / `package_ids[]` | Catalog codes only |
| `fasting_required` | boolean |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Assignment consumer important for SLA |
| **Idempotency** | `booking_id:LAB_BOOKED` |
| **Failure** | Paid but unassigned: ops queue, not auto-refund unless policy |

---

### 7.10 `SAMPLE_COLLECTED`

| | |
| --- | --- |
| **When** | Specimen obtained after `PATIENT_VERIFIED`. Diagnostics state `SAMPLE_COLLECTED`. Chain-of-custody event also written. |
| **Producer** | `diagnostics` (command from phlebotomist app) |
| **Aggregate** | `Sample` |
| **Journeys** | J10 |
| **Aliases** | sample state `SAMPLE_COLLECTED`; `SampleCustodyChanged` (subset) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Notification | Customer “sample collected” — **no results** |
| Logistics | May start transport job if separate courier |
| Analytics | Collection success |
| Health | Not a report yet |

**Payload**

| Field | Notes |
| --- | --- |
| `sample_id`, `case_id`, `booking_id` | |
| `container_type`, `barcode_token` | Platform sample id, not patient name on bag if pack forbids |
| `phlebotomist_id`, `job_id` | |
| `offline_flag` | If queued on device |
| `geo` | Precision policy; optional |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default; custody must not fork |
| **Idempotency** | `sample_id:SAMPLE_COLLECTED` plus client `client_event_id` for offline |
| **Failure** | Offline replay conflict → manual ops. **RISK:** duplicate sample ids |

Wrong-patient collection is prevented **before** this event (hard stop). Do not emit this event on `IDENTITY_MISMATCH`.

---

### 7.11 `SAMPLE_RECEIVED`

| | |
| --- | --- |
| **When** | Lab scans sample in (`LAB_RECEIVED` / accession). Same `sample_id` as collect. |
| **Producer** | `diagnostics` |
| **Aggregate** | `Sample` |
| **Journeys** | J11 |
| **Aliases** | state `LAB_RECEIVED`; `SampleCustodyChanged` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Notification | Optional “arrived at lab”; delay SLA copy later |
| Ledger | If bill-on-accession (OD-LAB-02) |
| Lab portal | Accession worklist already command-updated |
| Analytics | Transport TAT |

**Payload**

| Field | Notes |
| --- | --- |
| `sample_id`, `case_id`, `lab_location_id` | |
| `accession_no` | Lab-local |
| `temperature?`, `reject_hold?` | Flags only |
| `received_by` | Staff id |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | `sample_id:SAMPLE_RECEIVED`. Barcode mismatch is a **command** reject, not this event |
| **Failure** | Gap in custody **RISK** (09). Ops if PICKED_UP without receive past SLA |

---

### 7.12 `REPORT_GENERATED`

| | |
| --- | --- |
| **When** | Signed report artifact generated (PDF/structured) **after** pathologist approval. Diagnostics: `REPORT_GENERATED`. **Customer may not yet have access** until release. |
| **Producer** | `diagnostics` |
| **Aggregate** | `Report` |
| **Journeys** | J12 |
| **Aliases** | state `REPORT_GENERATED`; precursor to `ReportReleased` / `health.artifact.created` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Health | Create `LAB_REPORT` artifact (may wait for `REPORT_RELEASED` — **OD-EVT-09**) |
| Notification | **Not** customer until released (avoid “ready” before `report:release`) |
| Search | **Metadata only** after release (patient search is not global OpenSearch) |
| Ledger | If bill-on-report, prefer `REPORT_RELEASED` |

**Payload**

| Field | Notes |
| --- | --- |
| `report_id`, `case_id`, `booking_id`, `customer_id` | |
| `version`, `language`, `template_id` | |
| `object_id` | PDF in object store |
| `panic_flag` | boolean **without analyte values** |
| `pathologist_id` | Signer |
| `hash` | Integrity |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Artifact write P0 |
| **Idempotency** | `(report_id, version):REPORT_GENERATED` |
| **Failure** | Signed clinically but unpublished: ops. Do not SMS results |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Validity of electronic signature (OD-LAB-08).

**OPEN DECISION (OD-EVT-09):** Collapse `REPORT_GENERATED` + `REPORT_RELEASED` vs two events. Recommendation: **two events**. Generation ≠ customer delivery (09 state machine).

---

### 7.13 `PAYMENT_SUCCESS`

| | |
| --- | --- |
| **When** | Payment domain: capture succeeded **or** authorized per method, **or** COD authorized as commercial commit. Payment-intent success, not order projection. |
| **Producer** | `payment` |
| **Aggregate** | `PaymentIntent` |
| **Journeys** | J01, J03, J05, J09, J14 |
| **Aliases** | `PaymentCaptured`, `checkout.session.paid` (session-level), `payment.intent.updated` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Order / care / diagnostics | Confirm children of CheckoutSession |
| Ledger | Cash / clearing / unearned |
| Notification | Receipt (no full PAN; last4 ok if PCI-safe) |
| Wallet | If wallet was source |
| Affiliate | Attribution freeze |
| CRM | 360 |

**Payload**

| Field | Notes |
| --- | --- |
| `payment_intent_id`, `checkout_session_id` | |
| `amount_minor`, `currency`, `fx_snapshot_id?` | Original currency preserved |
| `method`, `gateway`, `gateway_event_id` | Adapter names, not secrets |
| `customer_id` | |
| `child_refs[]` | Order/booking ids if known |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Webhook ingest already idempotent on gateway event id ([12](12_PAYMENT_PLATFORM.md)) |
| **Idempotency** | `gateway_event_id` + `payment_intent_id` + type. Inbox `event_id` |
| **Failure** | Child confirm fail → compensation, not a second capture. **RISK:** double capture — remaining amount + idempotency |

---

### 7.14 `PAYMENT_FAILED`

| | |
| --- | --- |
| **When** | Decline, fraud hard-fail, gateway error after policy retries, or checkout expired unpaid. |
| **Producer** | `payment` |
| **Aggregate** | `PaymentIntent` |
| **Journeys** | J01, J05, J09 |
| **Aliases** | `PaymentFailed`, `checkout.session.failed` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Order / booking | Release inventory/slot holds; order `CANCELLED` or session `FAILED` |
| Notification | Customer retry CTA; **no** raw gateway dump |
| CRM | Abandoned payment automation |
| Analytics | Funnel |

**Payload**

| Field | Notes |
| --- | --- |
| `payment_intent_id`, `checkout_session_id` | |
| `failure_class` | `DECLINED` \| `EXPIRED` \| `FRAUD` \| `GATEWAY` \| `NETWORK` |
| `retryable` | boolean for UI |
| `amount_minor`, `currency` | |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Event delivery default; **do not** retry the capture itself from this consumer |
| **Idempotency** | Multiple fail events possible (attempts); `occurrence_key` includes `attempt_id` |
| **Failure** | Stuck hold is the **RISK** — release consumer must DLQ-alert |

---

### 7.15 `REFUND_CREATED`

| | |
| --- | --- |
| **When** | Refund policy engine creates a Refund instruction (instrument and/or wallet). Not yet PSP-acked. |
| **Producer** | `payment` or `order` (request) — **ASSUMPTION (A-EVT-05):** `payment` owns the Refund aggregate and emits this after policy accept |
| **Aggregate** | `Refund` |
| **Journeys** | J16 |
| **Aliases** | `refund.requested`, `refund.updated` (CREATED) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Ledger | Reserve / reversing entries per [13](13_LEDGER_SETTLEMENT.md) |
| Notification | Customer “refund started” |
| Affiliate | Reverse pending/approved unpaid commission |
| Order | `refund_ids[]` / status overlay (OD-PHARM-03) |
| CRM | 360 |

**Payload**

| Field | Notes |
| --- | --- |
| `refund_id`, `payment_intent_id`, `order_id` / `booking_id` | |
| `amount_minor`, `currency` | Original payment currency |
| `destination` | `ORIGINAL_INSTRUMENT` \| `WALLET` \| `PAYABLE_QUEUE` |
| `reason_code` | `CANCEL` \| `RX_REJECT` \| `OOS` \| `COLLECTION_FAIL` \| `GOODWILL` \| … |
| `partial` | boolean |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Ledger P0 |
| **Idempotency** | `refund_id:REFUND_CREATED` |
| **Failure** | Gateway refund fail later → `REFUND_FAILED` + `AP_CUSTOMER_REFUND`. COD collected → `REFUND_UNAVAILABLE_COD` path |

Emit **also** `REFUND_SUCCEEDED` / `REFUND_FAILED` (§8). Do not collapse PSP outcome into `REFUND_CREATED`.

---

### 7.16 `SETTLEMENT_CREATED`

| | |
| --- | --- |
| **When** | A `SettlementBatch` is created (OPEN → PREVIEW). Not payout execution. |
| **Producer** | `ledger` / `settlement` |
| **Aggregate** | `SettlementBatch` |
| **Journeys** | J17–J21 |
| **Aliases** | `settlement.batch.updated` (CREATED/PREVIEW) |

**Consumers**

| Consumer | Action |
| --- | --- |
| Notification | Finance ops; optional vendor “statement ready” (not “paid”) |
| Vendor / doctor / lab / rider / affiliate apps | Statement projection |
| CRM | Not customer-facing |
| Analytics | Finance |

**Payload**

| Field | Notes |
| --- | --- |
| `settlement_batch_id`, `participant_type`, `participant_id` | `VENDOR` \| `DOCTOR` \| `LAB` \| `RIDER` \| `AFFILIATE` \| internal pharmacy |
| `period_start`, `period_end` | |
| `currency`, `gross_minor`, `fees_minor`, `net_minor` | |
| `legal_entity_id`, `country_id` | |
| `status` | `OPEN` \| `PREVIEW` |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | `settlement_batch_id:SETTLEMENT_CREATED` |
| **Failure** | Dashboards stale. Journal already posted independently |

Payout success is `PAYOUT_COMPLETED` (§8), not this event.

---

### 7.17 `AFFILIATE_CONVERSION`

| | |
| --- | --- |
| **When** | An attributed paid conversion is recorded after attribution rules (typically on `PAYMENT_SUCCESS` / child confirm). Commission is **pending**, not payable. |
| **Producer** | `affiliate` |
| **Aggregate** | `AffiliateConversion` |
| **Journeys** | J17 (sources J01, J03, J05, J09, membership) |
| **Aliases** | `AttributionBound` (earlier), `AffiliateCommissionPending` |

**Consumers**

| Consumer | Action |
| --- | --- |
| Affiliate dashboard | Pending line |
| Analytics | |
| Ledger | **Not yet** AP (14: pending is not payable) |
| Notification | Optional affiliate “conversion tracked” — no customer PII |

**Payload**

| Field | Notes |
| --- | --- |
| `conversion_id`, `affiliate_id`, `click_id` | |
| `source_type` | `ORDER` \| `APPOINTMENT` \| `LAB_BOOKING` \| `MEMBERSHIP` |
| `source_id` | Commercial id only |
| `category`, `commission_bps`, `amount_minor`, `currency` | Snapshot of rule version |
| `hold_until` | |
| `customer_id` | Hashed or omitted on affiliate-facing projections |

**Retry / idempotency / failure**

| | |
| --- | --- |
| **Retry** | Default |
| **Idempotency** | One conversion per `(affiliate_id, source_id)` unless pack allows line-level (A-AFF-03) |
| **Failure** | Missing conversion ≠ extra pay. Cancel/refund must still find the row via `source_id` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Clinical inducement; categories default OFF ([14](14_AFFILIATE_PLATFORM.md)).

---

## 8. Additional important events

Same contract as §7. Compact tables; workers still use envelope + inbox.

### 8.1 Commerce and inventory

#### `CHECKOUT_SESSION_PAID`

| | |
| --- | --- |
| **When** | CheckoutSession envelope `PAID`; children confirmed in same unit of work (outbox). Fan-out hub. |
| **Producer** | `order` (checkout) |
| **Consumers** | Same as `PAYMENT_SUCCESS` + child modules |
| **Payload** | `checkout_session_id`, `customer_id`, `children[]` (`ORDER` \| `BOOKING_DOCTOR` \| `BOOKING_LAB`), amounts |
| **Retry / idemp / fail** | `checkout_session_id:CHECKOUT_SESSION_PAID`. Child confirm fail → `PARTIALLY_FAILED` + compensation |
| **Aliases** | `checkout.session.paid`, `CheckoutSessionPaid` |

#### `ORDER_ACCEPTED` / `ORDER_REJECTED`

| | |
| --- | --- |
| **When** | Seller accepts (or auto-accept) / vendor reject. |
| **Producer** | `order` |
| **Consumers** | Notification, inventory hard-allocate, SLA timers cancel, CRM |
| **Payload** | `order_id`, `seller_org_id`, `reason_code?` |
| **Retry / idemp / fail** | Unique per order+decision. Timeout uses `ORDER_CANCELLED` with `VENDOR_TIMEOUT` |
| **Aliases** | `order.accepted`, `order.rejected.vendor` |

#### `INVENTORY_AVAILABILITY_CHANGED`

| | |
| --- | --- |
| **When** | Sellable qty / offer availability projection changes. |
| **Producer** | `inventory` |
| **Consumers** | **Search indexer (P1)**, cart validation cache, CRM none |
| **Payload** | `offer_id`, `location_id`, `sellable_qty` or `availability_status`, `reason` (`SALE`, `ADJUST`, `EXPIRY`, `RECALL`) |
| **Retry / idemp / fail** | Versioned; last-write-wins on `occurred_at`/`version`. Stale search = oversell **RISK** |
| **Aliases** | `inventory.availability.changed`, `offer.updated` (partial) |

#### `CATALOG_ITEM_PUBLISHED` / `OFFER_UPDATED`

| | |
| --- | --- |
| **When** | Item or offer becomes customer-searchable or price/attrs change. |
| **Producer** | `catalog` |
| **Consumers** | Search, CMS caches |
| **Payload** | `catalog_item_id` / `offer_id`, `item_type`, `publish_state` — indexer reads catalog store by id |
| **Retry / idemp / fail** | Indexer may fetch-by-id; event is invalidation |
| **Aliases** | `catalog.item.published`, `offer.updated` |

---

### 8.2 Prescription desk

#### `RX_VERIFIED`

| | |
| --- | --- |
| **When** | Pharmacist (or policy) sets verification `VERIFIED`; structured items exist. |
| **Producer** | `prescription` |
| **Consumers** | Order (PAID/RX_REVIEW → ACCEPTED), health artifact `PRESCRIPTION_STRUCTURED`, notification customer confirm-items, search none |
| **Payload** | `prescription_id`, `order_id?`, `pharmacist_id`, `item_count`, `substitution_proposed` |
| **Retry / idemp / fail** | `prescription_id:RX_VERIFIED`. Order allocate fail → cancel/refund path |
| **Aliases** | `prescription.verification.updated` (VERIFIED) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Substitution, controlled drugs.

#### `RX_REJECTED`

| | |
| --- | --- |
| **When** | Verification rejected (unreadable, expired, identity mismatch, controlled-drug block). |
| **Producer** | `prescription` |
| **Consumers** | Order cancel/refund policy, notification with **reason code**, CRM ticket optional |
| **Payload** | `prescription_id`, `order_id?`, `reason_code` — no lecture of diagnosis |
| **Retry / idemp / fail** | Terminal per case; resubmit creates new case id |
| **Aliases** | `prescription.verification.updated` (REJECTED) |

#### `PRESCRIPTION_SIGNED`

| | |
| --- | --- |
| **When** | Doctor signs structured Rx (J07). Distinct from `PRESCRIPTION_CREATED` draft. |
| **Producer** | `care` |
| **Consumers** | Health, customer notify, optional pharmacy mapping (OD-DOC-10), search none |
| **Payload** | `prescription_id`, `encounter_id`, `doctor_id`, `customer_id`, `signed_at` |
| **Retry / idemp / fail** | Unsigned drafts never customer-visible |
| **Aliases** | `PrescriptionSigned`, `prescription.signed` |

---

### 8.3 Care extras

#### `APPOINTMENT_CANCELLED`

| | |
| --- | --- |
| **When** | Any cancel/no-show terminal except completed. |
| **Producer** | `care` |
| **Consumers** | Slot release, refund policy, notification both parties, search fill-rate |
| **Payload** | `appointment_id`, `reason_code`, `cancelled_by` |
| **Retry / idemp / fail** | Slot double-book **RISK** if release fails |
| **Aliases** | `AppointmentCancelled` |

#### `CONSULTATION_COMPLETED`

| | |
| --- | --- |
| **When** | Encounter `COMPLETED`. |
| **Producer** | `care` |
| **Consumers** | Doctor payable (J19), review invite, health note publish if signed, notification |
| **Payload** | `encounter_id`, `appointment_id`, `duration_sec` — **no** consult note body |
| **Retry / idemp / fail** | Ledger P0 for earnings |
| **Aliases** | `EncounterCompleted` |

#### `RECORDING_CONSENT_DENIED`

| | |
| --- | --- |
| **When** | Recording offered and denied; consult continues without recording. |
| **Producer** | `video` / `care` |
| **Consumers** | Analytics (no clinical body), audit |
| **Payload** | `session_id`, `appointment_id` |
| **Retry / idemp / fail** | Default |
| **Aliases** | `RecordingConsentDenied` |

---

### 8.4 Diagnostics extras

#### `SAMPLE_SEALED` / `SAMPLE_CUSTODY_CHANGED` / `SAMPLE_REJECTED`

| Type | When | Consumers | Payload notes |
| --- | --- | --- | --- |
| `SAMPLE_SEALED` | Label/seal complete | Transport job create, audit | `sample_id`, barcode |
| `SAMPLE_CUSTODY_CHANGED` | Any custody scan | Tracking, audit, **not** customer SMS spam | `from_actor`, `to_actor`, `event_type`, `offline_flag` |
| `SAMPLE_REJECTED` | Pre-analytical / lab reject | Recollection, refund policy, customer notify | `reason_code`, `recollection_required` |

**Idempotency:** custody rows include `client_event_id`. Mismatch scan = command fail.

**Aliases:** `SampleCustodyChanged`, `SampleRejected`.

#### `REPORT_RELEASED`

| | |
| --- | --- |
| **When** | Customer can access artifact (`DELIVERED_DIGITAL`). |
| **Producer** | `diagnostics` / `health` |
| **Consumers** | Notification J13, CRM flag only, ledger if bill-on-report, doctor **only if** consent |
| **Payload** | `report_id`, `artifact_id`, `customer_id`, `panic_flag` — **no analytes** |
| **Retry / idemp / fail** | Push fail does **not** retract report |
| **Aliases** | `ReportReleased`, `health.artifact.created` / `HealthArtifactReleased` |

#### `REPORT_AMENDED`

| | |
| --- | --- |
| **When** | New report version after release. |
| **Producer** | `diagnostics` |
| **Consumers** | Notify customer; retain previous version; do not rewind case to PROCESSING |
| **Payload** | `report_id`, `version`, `supersedes_version` |
| **Retry / idemp / fail** | Version unique |
| **LEGAL/COMPLIANCE REVIEW REQUIRED** | Customer visibility of amendments (OD-LAB-06) |

#### `REPORT_PRINTED`

| | |
| --- | --- |
| **When** | Lab print job succeeded for hard copy (J14). |
| **Producer** | `diagnostics` |
| **Consumers** | Logistics `REPORT_DELIVERY` job if not yet created; notification “printed, packing” |
| **Payload** | `physical_report_id`, `report_id`, `print_station_id?` |
| **Retry / idemp / fail** | Print fail stays in print queue; no job until packed |
| **Aliases** | `report.print.updated` |

#### `PHYSICAL_REPORT_DELIVERED`

| | |
| --- | --- |
| **When** | Report delivery job POD (J15). May coincide with `DELIVERY_COMPLETED`. |
| **Producer** | `diagnostics` or `logistics` |
| **Consumers** | Notification, ledger if print fee recognition pending |
| **Payload** | `physical_report_id`, `job_id` |
| **ASSUMPTION (A-EVT-06):** Prefer **one** `DELIVERY_COMPLETED` plus diagnostics projection; emit this type only if diagnostics needs a distinct occurrence_key |

#### `PANIC_VALUE_DETECTED`

| | |
| --- | --- |
| **When** | QC/result entry sets panic/critical flag (before or at sign). |
| **Producer** | `diagnostics` |
| **Consumers** | Pathologist queue priority; **ops playbook hook**; notification per OD-LAB-05 |
| **Payload** | `case_id`, `sample_id`, `panic_flag=true` — **never full results in SMS** |
| **Retry / idemp / fail** | Dual-channel; phone escalation is adapter + human SOP, not email-only |
| **OPEN DECISION (OD-EVT-10)** vs OD-LAB-05 channels |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Critical-value notification duties.

---

### 8.5 Logistics extras

#### `LOGISTICS_JOB_CREATED`

| | |
| --- | --- |
| **When** | Job `CREATED`. |
| **Producer** | `logistics` |
| **Consumers** | Assignment worker, counterpart tracking |
| **Payload** | `job_id`, `job_type`, counterpart ids, `cod_amount_minor?` |
| **Aliases** | `LogisticsJobCreated`, `logistics.job.requested` |

#### `JOB_FAILED`

| | |
| --- | --- |
| **When** | Logistics job `FAILED`. Platform worker poison after retries should use distinct `WORKER_JOB_FAILED` (**OD-EVT-11**). |
| **Producer** | `logistics` (job) or `platform` (worker) |
| **Consumers** | Order/diagnostics exception; notification; ops; **not** auto-refund without policy |
| **Payload** | `job_id` or `worker_job_id`, `reason_code`, `reassignable` |
| **Retry / idemp / fail** | Reassignment emits new `DELIVERY_ASSIGNED` |
| **Aliases** | `LogisticsJobFailed` |

**OPEN DECISION (OD-EVT-11):** Separate `WORKER_JOB_FAILED` for BullMQ DLQ vs logistics `JOB_FAILED`. Recommendation: **two types**.

#### `JOB_CANCELLED`

| | |
| --- | --- |
| **When** | Job cancelled before success. |
| **Producer** | `logistics` |
| **Consumers** | Counterpart state, earnings clawback rules |
| **Payload** | `job_id`, `reason_code` |

#### `COD_COLLECTED`

| | |
| --- | --- |
| **When** | Rider records COD cash/scan at POD. |
| **Producer** | `logistics` |
| **Consumers** | Payment COD remittance, ledger undeposited COD, finance recon |
| **Payload** | `job_id`, `order_id`, `amount_minor`, `currency`, `shortage_flag` |
| **Retry / idemp / fail** | Shortage → exception; cash leakage **RISK** |
| **Aliases** | `CodCollected` |

---

### 8.6 Money extras

#### `REFUND_SUCCEEDED` / `REFUND_FAILED`

| | |
| --- | --- |
| **Producer** | `payment` |
| **Consumers** | Ledger settle refund, order, affiliate reverse, notification, wallet if destination wallet |
| **Payload** | `refund_id`, `gateway_refund_id?`, `destination` |
| **Idempotency** | Gateway refund id |
| **Aliases** | `RefundSucceeded`, `RefundFailed`, `refund.updated` |

#### `WALLET_BALANCE_CHANGED`

| | |
| --- | --- |
| **Producer** | `wallet` |
| **Consumers** | Ledger liability, CRM amount only, notification on credit |
| **Payload** | `wallet_id`, `customer_id`, `delta_minor`, `balance_minor`, `reason` — no bank account |
| **Aliases** | `WalletBalanceChanged`, `wallet.updated` |

#### `PAYOUT_COMPLETED` / `PAYOUT_FAILED`

| | |
| --- | --- |
| **When** | Settlement line rail result. |
| **Producer** | `settlement` |
| **Consumers** | Participant notify, finance, batch `PARTIAL_FAILED` |
| **Payload** | `settlement_batch_id`, `line_id`, `participant_id`, `amount_minor` |
| **Retry** | New attempt id, same line ([13](13_LEDGER_SETTLEMENT.md)) |
| **Aliases** | `payout.updated` |

#### `DISPUTE_OPENED` / `DISPUTE_CLOSED`

| | |
| --- | --- |
| **Producer** | `payment` |
| **Consumers** | Ledger hold, order/vendor notify, ops |
| **Payload** | `dispute_id`, `payment_intent_id`, `amount_minor` — no PAN |
| **Aliases** | `DisputeOpened`, `DisputeClosed` |

---

### 8.7 Affiliate extras

#### `AFFILIATE_COMMISSION_APPROVED`

| | |
| --- | --- |
| **When** | Hold elapsed, fraud checks pass → payable. |
| **Producer** | `affiliate` |
| **Consumers** | **Ledger AP_AFFILIATE**, affiliate notify, dashboard |
| **Payload** | `commission_id`, `conversion_id`, `amount_minor` |
| **Aliases** | `AffiliateCommissionApproved` |

#### `AFFILIATE_COMMISSION_REVERSED`

| | |
| --- | --- |
| **When** | Cancel/refund/fraud after pending or approved. |
| **Producer** | `affiliate` |
| **Consumers** | Ledger reverse or `AR_AFFILIATE` clawback if paid |
| **Payload** | `commission_id`, `reason_code` |
| **Aliases** | `AffiliateCommissionReversed` |

---

### 8.8 Health and consent

#### `HEALTH_ARTIFACT_CREATED` / `HEALTH_ARTIFACT_RELEASED`

| | |
| --- | --- |
| **Producer** | `health` |
| **Consumers** | Timeline indexer, patient notify on **release**, search **metadata only** (never notes/results) |
| **Payload** | `artifact_id`, `type` (`PRESCRIPTION_*`, `LAB_REPORT`, `CONSULT_NOTE`, …), `object_id`, `customer_id` |
| **Aliases** | `HealthArtifactCreated`, `HealthArtifactReleased`, `health.artifact.created` |

#### `CONSENT_GRANTED` / `CONSENT_REVOKED`

| | |
| --- | --- |
| **When** | ConsentGrant `ACTIVE` / revoked (J13 share-with-doctor). |
| **Producer** | `health` |
| **Consumers** | **Authz cache invalidation (P0 on revoke)**, doctor app, audit, notify patient |
| **Payload** | `grant_id`, `customer_id`, `grantee_id`, `purpose`, `artifact_ids[]`, `expires_at` |
| **Retry / idemp / fail** | Revoke must not wait on notify. **RISK:** stale ACL |
| **Aliases** | `ConsentGrantActivated`, `ConsentGrantRevoked`, `consent.granted`, `consent.revoked` |

#### `HEALTH_PAYLOAD_READ`

| | |
| --- | --- |
| **Producer** | `health` |
| **Consumers** | Audit/SIEM only. Not CRM, not search |
| **Payload** | `artifact_id`, `actor_id`, `purpose` — no clinical body |
| **Aliases** | `HealthPayloadRead` |

#### `LEGAL_HOLD_SET`

| | |
| --- | --- |
| **Producer** | `compliance` |
| **Consumers** | Erase jobs blocked, retention |
| **Payload** | `hold_id`, `subject_type`, `subject_id` |
| **Aliases** | `LegalHoldSet` |

---

### 8.9 Identity, KYC, catalog of people

#### `KYC_STATUS_CHANGED`

| | |
| --- | --- |
| **Producer** | `party` / `compliance` |
| **Consumers** | App gating, payout hold, notification professional, search **unpublish** if suspended |
| **Payload** | `case_id`, `party_id`, `from_status`, `to_status`, `party_type` |
| **Aliases** | `kyc.updated`, `vendor.approved`, `DoctorActivated` (narrower) |

Partner onboarding uses **application** events below. `KYC_STATUS_CHANGED` remains the nested document-case signal. Do not emit two “approved” facts for one button click.

| Event | Producer | Consumers | Payload (logical) |
| --- | --- | --- | --- |
| `PARTNER_REGISTERED` | `partner` | Notify, CRM | `application_id`, `partner_type`, `country_id` |
| `PARTNER_APPLICATION_SUBMITTED` | `partner` | Admin queue, SLA | `application_id` |
| `PARTNER_DOCUMENT_UPLOADED` | `partner` | Scan, KYC | `document_id`, `version` |
| `PARTNER_DOCUMENT_REJECTED` | `partner` | Notify applicant | `document_id`, `reason_code` |
| `PARTNER_REVIEW_STARTED` | `partner` | Notify, SLA | `application_id`, `reviewer_id` |
| `PARTNER_INFORMATION_REQUESTED` | `partner` | Notify | `application_id`, `reason_codes[]` |
| `PARTNER_VERIFIED` | `partner` | Approval queue | `application_id` |
| `PARTNER_APPROVED` | `partner` | Search (if gates), notify | `partner_id`, `type` |
| `PARTNER_REJECTED` | `partner` | Notify | `application_id`, `reason_code` |
| `PARTNER_SUSPENDED` | `partner` | Unpublish, payout hold | `partner_id`, `reason` |
| `PARTNER_REACTIVATED` | `partner` | Search, notify | `partner_id` |
| `PARTNER_DOCUMENT_EXPIRING` | scheduler | Notify, admin | `document_id`, `expires_on` |
| `PARTNER_ACTIVATED` | `partner` | Search insert, type apps | `partner_id` |
| `PARTNER_INVITE_SENT` / `PARTNER_INVITE_ACCEPTED` | `partner` | Notify | `invitation_id` |

#### `DOCTOR_ACTIVATED` / `VENDOR_APPROVED`

| | |
| --- | --- |
| **Producer** | `care` / `party` |
| **Consumers** | **Search index insert**, notification |
| **Payload** | Profile ids, `country_id`, public fields pointer |
| **Aliases** | `DoctorActivated`, `vendor.approved` |

#### `ACCOUNT_DISABLED` / `SESSION_REVOKED`

| | |
| --- | --- |
| **Producer** | `identity` |
| **Consumers** | Session kill, notification, CRM |
| **Payload** | `user_id`, `reason_class` |
| **Aliases** | `account.disabled`, `session.revoked` |

---

### 8.10 CRM / support

#### `TICKET_OPENED`

| | |
| --- | --- |
| **Producer** | `support` |
| **Consumers** | Notification staff, SLA timers. **Not** order mutation |
| **Payload** | `ticket_id`, `customer_id`, `linked_ids`, `category` — no Rx images |
| **Aliases** | `TicketOpened`, `ticket.created` |

---

## 9. Alias map (domain books → canonical)

| Domain alias | Canonical |
| --- | --- |
| `checkout.session.paid` / `CheckoutSessionPaid` | `CHECKOUT_SESSION_PAID` (+ child `ORDER_PAID` / `APPOINTMENT_BOOKED` / `LAB_BOOKED`) |
| `PaymentCaptured` | `PAYMENT_SUCCESS` |
| `PaymentFailed` | `PAYMENT_FAILED` |
| `order.state.changed` | Specific `ORDER_*` by `to_status` |
| `AppointmentConfirmed` | `APPOINTMENT_BOOKED` |
| `EncounterCompleted` | `CONSULTATION_COMPLETED` |
| `PrescriptionSigned` | `PRESCRIPTION_SIGNED` |
| `LabBookingConfirmed` | `LAB_BOOKED` |
| `ReportReleased` | `REPORT_RELEASED` |
| `LogisticsJobAccepted` | `DELIVERY_ASSIGNED` |
| `LogisticsJobDelivered` | `DELIVERY_COMPLETED` |
| `LogisticsJobFailed` | `JOB_FAILED` |
| `AffiliateCommissionPending` | `AFFILIATE_CONVERSION` |
| `ConsentGrantRevoked` | `CONSENT_REVOKED` |

---

## 10. Consumer registry (workers)

| Consumer name | Events (primary) | Side effect store | Idempotency key |
| --- | --- | --- | --- |
| `notification.dispatch` | Most customer/partner-facing types | Notification outbox ([23](23_NOTIFICATION_ARCHITECTURE.md)) | `(template_id, event_id)` |
| `search.index` | Catalog, offer, inventory, doctor/lab/pharmacy publish | OpenSearch | `(index, doc_id, version)` |
| `ledger.post` | Payment, refund, delivery complete, consult complete, report released, commission approved | Journal | `source_event_id` |
| `crm.project` | Identity, order, booking, job, payment, ticket | CRM read model | `event_id` |
| `health.timeline` | Artifact + consent | Timeline | `artifact_id`+version |
| `affiliate.attr` | Payment success, cancel, refund | Conversion rows | `source_id` |
| `iam.consent_cache` | Consent grant/revoke | Authz cache | `grant_id`+status |
| `analytics.ingest` | Funnel subset | Warehouse | `event_id` — **metadata only** |

Modules must not post ledger rows inside payment adapters ([12](12_PAYMENT_PLATFORM.md)).

---

## 11. BullMQ queue layout (now)

| Queue | Purpose |
| --- | --- |
| `evt.notify` | Channel dispatch |
| `evt.search` | Index upsert/delete |
| `evt.ledger` | Posting rules |
| `evt.crm` | Projections + automations request notify (do not SMS from CRM) |
| `evt.affiliate` | Attribution |
| `evt.ops` | Assignment, compensation, DLQ handler |
| `evt.dlq` | Poison |

**ASSUMPTION (A-EVT-07):** One Redis per environment; queue names prefixed by env. Country is a **payload field**, not a Redis cluster per country, until residency requires split (OD-EVT-06).

---

## 12. Observability

| Signal | Use |
| --- | --- |
| Outbox lag (`created_at` − `published_at`) | SLO; page if ledger-class lag |
| Queue depth / retry count | |
| Consumer inbox hit rate | Duplicate delivery (expected > 0) |
| Trace | `correlation_id` + `event_id` in logs |
| Never log | Rx bytes, PAN, report analytes, OTP codes |

Targets: payment webhook processing p95 under 10s ([04](04_APPLICATION_ARCHITECTURE.md)); outbox publish p95 should be seconds, not minutes.

---

## 13. What not to put on the bus

- Card PAN / CVV
- Full consult notes or chat transcripts
- Lab result values (panic **flag** only)
- Precise 24/7 GPS trails
- “Delete this person” as a silent payload — use compliance workflows
- UI analytics clicks as **domain** events (those are product analytics, separate pipeline)

---

## 14. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| **OD-EVT-01** | Dual event names vs single catalog | Publish SCREAMING_SNAKE only; alias map in shared-types |
| **OD-EVT-02** | When to extract Kafka | Scale / region / isolation trigger; BullMQ until then |
| **OD-EVT-03** | `ORDER_CREATED` timing | First persist of Order, not cart |
| **OD-EVT-04** | Outbox payload retention / PII | Country pack + legal; minimize now |
| **OD-EVT-05** | Broker exactly-once | At-least-once + inbox |
| **OD-EVT-06** | Cross-country event replication | Default none |
| **OD-EVT-07** | Search via events vs CDC | **Events + fetch-by-id** for catalog (this doc + [24](24_SEARCH_ARCHITECTURE.md)) |
| **OD-EVT-08** | Max attempts / backoff numbers | 25 / exponential; tune in ops |
| **OD-EVT-09** | `REPORT_GENERATED` vs `REPORT_RELEASED` | Keep both |
| **OD-EVT-10** | Panic event vs notification-only | Dedicated `PANIC_VALUE_DETECTED` |
| **OD-EVT-11** | Logistics `JOB_FAILED` vs worker DLQ | Two types |

Also [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md).

---

## 15. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-EVT-01 | ASSUMPTION | Modular monolith + outbox; no Kafka day one |
| A-EVT-02 | ASSUMPTION | Envelope extras: schema_version, causation_id, actor_id, legal_entity_id, partition_key |
| A-EVT-03 | ASSUMPTION | occurrence_key prevents duplicate facts on HTTP retry |
| A-EVT-04 | ASSUMPTION | ORDER_PAID and PAYMENT_SUCCESS can both exist; consumers dual-key |
| A-EVT-05 | ASSUMPTION | payment module emits REFUND_CREATED |
| A-EVT-06 | ASSUMPTION | PHYSICAL_REPORT_DELIVERED may alias DELIVERY_COMPLETED |
| A-EVT-07 | ASSUMPTION | Single Redis until residency split |
| | RISK | Dual-write without outbox |
| | RISK | Money captured, child confirm fail |
| | RISK | Stale ACL after CONSENT_REVOKED |
| | RISK | Oversell from stale search / failed allocation release |
| | RISK | Clinical or PAN data on the bus or in warehouse |
| | LEGAL | Event retention, e-Rx, panic notify duties, affiliate inducement, WhatsApp not in this bus |

Implementation: NestJS modules write outbox; workers live in the same deployable until a context is extracted behind the same APIs ([04](04_APPLICATION_ARCHITECTURE.md)).
