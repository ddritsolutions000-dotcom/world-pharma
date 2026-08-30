# 30 — Observability

**Status:** Blueprint  
**Audience:** Engineering, SRE, finance ops, clinical ops, security  
**Requirement IDs:** REQ-OBS, REQ-SEC, REQ-PAY, REQ-LAB, REQ-VID, REQ-LOG  
**Related:** [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Health record](16_HEALTH_RECORD.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Performance](28_PERFORMANCE_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Testing](31_TESTING_STRATEGY.md) · [DevOps](32_DEVOPS_CICD.md) · [Risk](34_RISK_REGISTER.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

Observability answers: **is the platform healthy, is money consistent, are samples and consults safe, and can we debug without leaking health data?**

It is not a substitute for the **audit log** ([27](27_SECURITY_ARCHITECTURE.md) §12) or the **ledger** ([13](13_LEDGER_SETTLEMENT.md)). Those are systems of record. Observability is how operators **see** health, latency, errors, and business flow.

**Principle:** default logs/traces/metrics contain **identifiers and statuses**, not payloads (no Rx bytes, report values, KYC images, PAN, OTP codes, full addresses in free text).

**OPEN DECISION (OD-OBS-01):** Vendor stack. Recommendation: OpenTelemetry + cloud metrics + Sentry (or equivalent) in Phase 0. See [29](29_INFRASTRUCTURE_ARCHITECTURE.md) §5.12.

---

## 2. Pillars

| Pillar | Tooling class | Use |
| --- | --- | --- |
| Logs | Structured JSON → log store | Debug, request correlation |
| Metrics | Time series | SLOs, capacity, queues |
| Traces | OpenTelemetry | Cross-module latency in the monolith and out to PSP/LiveKit |
| Errors | Error tracker | Grouped exceptions, release health |
| Audit | Append-only audit store | Security/compliance — **not** the log pile |
| Product analytics | Event sink | Funnels — **metadata only** |

---

## 3. Correlation

Every request and async job carries:

| Field | Meaning |
| --- | --- |
| `trace_id` / `span_id` | W3C trace context |
| `correlation_id` | Public-facing support id (safe to put on tickets) |
| `country_id` | Pack / tenancy |
| `actor_id` / `membership_id` | When authenticated |
| `aggregate_type` / `aggregate_id` | order, booking, job, sample, intent — **ids only** |

Mobile and web send `traceparent` where possible. Webhooks: generate a server `correlation_id` and store the provider event id.

---

## 4. Logs vs audit logs

| | Application logs | Audit logs |
| --- | --- | --- |
| Purpose | Debug, ops | Who did what to whom |
| Mutability | Retained then expired | Append-only; stricter retention class |
| PHI | **Forbidden** in default | May record **that** a payload was read (artifact id), not the bytes |
| Access | Engineers (prod via break-glass) | Compliance + super_admin |
| Examples | “PaymentIntent captured, intent=…, 243 ms” | “user U read artifact A purpose treatment grant G deny/allow” |

Mixing them causes either **unsearchable audit** or **PHI in Datadog**. That is **R-OBS-01**.

Support tickets store `correlation_id` and object ids — not Rx images (**OD-RBAC-02**).

---

## 5. Metrics (technical)

Golden signals per service/process (API, worker, web, LiveKit adapter):

| Signal | Examples |
| --- | --- |
| Latency | Gateway p50/p95/p99 by route class (read, search, money, upload) |
| Traffic | RPS, WS connections, webhook ingest |
| Errors | 5xx, 4xx by class (auth vs validation vs conflict), handler exceptions |
| Saturation | CPU, DB connections, Redis memory, queue depth, disk |

Route **classes** not raw URLs with ids (cardinality).

**SLOs (engineering, not OD-SLA-01 contracts):** align with [28](28_PERFORMANCE_ARCHITECTURE.md) §2. Alert on **burn rate**, not single blips.

---

## 6. Traces (OpenTelemetry)

| Rule | Detail |
| --- | --- |
| Instrument | HTTP in/out, DB, Redis, queue consume, PSP adapter, LiveKit token mint, object I/O |
| Sample | Always-on for money and health-payload routes at higher rate; default sample elsewhere |
| Attributes | Route template, country, PSP id, outcome; **not** body |
| DB | Statement **templates**; never bind PHI literals into span names |
| Headers | Incoming `traceparent`; outgoing to internal workers |

When a module is extracted later ([04](04_APPLICATION_ARCHITECTURE.md) §1), traces already span the boundary.

---

## 7. Error tracking

- Release version / git SHA on events
- User id **hash or internal id**, not phone
- Group by fingerprint
- PII scrubbing in the SDK (headers, cookies, extra)
- **Do not** attach Rx files or report JSON to Sentry

Source maps for Next.js: upload in CI; restrict download.

---

## 8. Alerting

Alerts must be **actionable** and routed by function.

| Severity | Meaning | Example |
| --- | --- | --- |
| P1 | Customer-wide or money/clinical safety | Checkout 5xx burn; webhook pipeline stalled; outbox lag; LiveKit join fail spike; sample accession mismatch rate |
| P2 | Degraded | Search p95; one PSP down but fallback works; SMS delay |
| P3 | Hygiene | Disk, certificate expiry approaching |

**Noise rules:** no alert without runbook; no paging on staging; night pages only P1.

Suggested P1 list (engineering):

1. API availability below SLO  
2. Outbox / ledger consumer lag (silent drop is **never** OK — [04](04_APPLICATION_ARCHITECTURE.md) §11)  
3. Payment webhook fail rate / age of oldest unprocessed  
4. Redis queue dead or memory eviction on the **queue** instance  
5. Postgres replica lag / PITR window at risk  
6. WAF blocking a false-positive of checkout (watch with PSP)  
7. Error-tracker spike on a new release (rollback candidate — [32](32_DEVOPS_CICD.md))

---

## 9. Business metrics (product + ops)

These are **metrics/events**, not a second EHR.

| Domain | Metrics (illustrative) |
| --- | --- |
| Trust | Rx verification TAT, report turnaround, complaint rate, data incidents = 0 ([01](01_PRODUCT_VISION.md) §9) |
| Liquidity | Catalog coverage, doctor fill rate, lab slot utilization, rider acceptance |
| Reliability | Order success, payment success, video join success, sample rejection rate |
| Finance | Recon breaks, settlement on-time %, refund cycle time |
| Global | Time-to-add-country (config vs code); % features gated by pack |
| Funnel | Search→pdp→cart→pay (goods); discover→slot→pay (care/lab) |

**OPEN DECISION (OD-PROD-04):** Numeric targets. This file only names **categories**.

Warehouse: **no clinical payload**. Funnel events: ids + amounts in **minor units + currency** already on commercial objects — finance warehouse access is role-gated ([03](03_USER_ROLES_AND_PERMISSIONS.md)).

---

## 10. Service health

| Check | Expose |
| --- | --- |
| `/health/live` | Process up |
| `/health/ready` | Postgres, Redis, critical adapters |
| Dependency | PSP `health`, LiveKit, SMS, OpenSearch, object store |
| Degrade flags | Search down → exact-id fallback; maps down → list without live map; video down → chat-only if pack |

Status page: **no PHI**. External status is optional Phase 10.

Admin “ops wall”: queue depths, Rx desk SLA, unassigned jobs, panic flags **counts** not values.

---

## 11. Payment monitoring

From [12](12_PAYMENT_PLATFORM.md):

| Watch | Why |
| --- | --- |
| Intent success / fail / require_action by PSP and method | Routing (**OD-PAY-09**) |
| Webhook age, duplicate rate, signature fail | R-PAY-01 replay / miss |
| Capture vs order confirm mismatch | Money without child (**R-PAY** compensation) |
| Refund fail queue (`AP_CUSTOMER_REFUND`) | J16 |
| Recon `AMOUNT_BREAK` / `MISSING_*` | Daily finance |
| COD collected vs remitted | Cash leakage |
| Wallet ops vs `LIAB_WALLET` | Nightly match ([13](13_LEDGER_SETTLEMENT.md)) |
| Idempotency conflict 409 rate | Client bugs / attacks |

**Never** log PAN, raw webhook bodies with card data, or 3DS HTML.

Finance UI consumes **domain APIs**, not Grafana, for breaks that need journals.

---

## 12. Delivery / logistics monitoring

| Watch | Why |
| --- | --- |
| Assignment accept rate / time | Liquidity |
| Reassignment count | Rider fail |
| GPS stale (job en route, last ping age) | **OD-LOG-05** |
| OTP fail / POD fail | Fraud + UX |
| COD short / fake POD flags | R-PAY-07 |
| SLA breach by job type | MEDICINE vs SAMPLE vs REPORT |

Map precision: ops may see more than the customer (**OD-LOG-06**) — still not a 24h tracker.

---

## 13. Lab processing monitoring

| Watch | Why |
| --- | --- |
| TAT vs pack promise (ops KPI, not a legal TAT) | Customer comms |
| Accession mismatch / barcode fail | Chain of custody **hard stop** |
| Rejection / hemolysis / temperature excursion rates | Pre-analytical |
| Panic flag volume and ack time | **OD-LAB-05** — flag only; not values in Slack |
| Pathologist queue age | J12 |
| Recollection rate | **OD-LAB-20** |
| Report sign → customer notify delay | J13 |

Panic: dedicated P1 **ops** path. Channel body must obey pack (no unsecured full results).

---

## 14. Video quality monitoring

| Watch | Why |
| --- | --- |
| Join success, TTFF p95 | [28](28_PERFORMANCE_ARCHITECTURE.md) |
| Reconnect rate, incomplete encounters | **OD-VID-08/09** |
| TURN usage | Cost + carrier issues |
| Room create fail / token fail | Adapter |
| Recording jobs (should be ~0 until pack) | Default off |

**OPEN DECISION (OD-VID-06):** Quality telemetry as clinical audit vs ops-only. Default: **ops-only** until legal says otherwise. Do not store decoded media in APM.

---

## 15. Privacy of telemetry

| Allowed | Forbidden |
| --- | --- |
| Object ids, status enums, latencies, country | Result tables, Rx images, chat bodies, GPS high-precision history beyond job window |
| Hashed user id in error tracker | Phone, email in log lines |
| “artifact read deny” metric | Reason that includes diagnosis |

Log redaction library in the API **before** exporters. CI test: fixtures with fake PHI do not appear in captured log snapshots ([31](31_TESTING_STRATEGY.md)).

---

## 16. Retention (engineering)

Do **not** invent statutory years. Packs fill legal retention ([19](19_COMPLIANCE_FRAMEWORK.md)). Engineering defaults:

| Store | Directional default until pack |
| --- | --- |
| Debug logs | Days–weeks |
| Metrics | High resolution short; downsampled long |
| Traces | Days |
| Error events | Weeks–months |
| Audit | Align with security/compliance pack |
| Ledger | **Not** expired by observability jobs |

---

## 17. Dashboards (minimum set)

1. **Platform:** golden signals, versions, error spike  
2. **Money:** intents, webhooks, recon breaks, outbox  
3. **Fulfillment:** pharmacy TAT, jobs, COD  
4. **Care:** join/TTFF, no-show states (counts)  
5. **Lab:** TAT, mismatch, panic ack  
6. **Security:** auth fail, OTP velocity, break-glass count, WAF  

Access: least privilege; production log query is break-glass.

---

## 18. Risks and assumptions

| ID | Statement |
| --- | --- |
| R-OBS-01 | PHI in logs | Redaction + tests + warehouse ban |
| R-OBS-02 | Alert fatigue | Burn-rate + runbooks |
| R-OBS-03 | Observability cost > API | Sampling + no payload |
| A-OBS-01 | Audit ≠ logs |
| A-OBS-02 | Vendor via OTel; OD-OBS-01 |

---

## 19. Open decisions

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-OBS-01 | APM/log vendor | OTel + Sentry + cloud metrics |
| OD-SLA-01 | Contractual SLO | Not this file’s numbers |
| OD-VID-06 | Video telemetry class | Ops-only until legal |
| OD-PROD-04 | Numeric business KPIs | Categories only |
