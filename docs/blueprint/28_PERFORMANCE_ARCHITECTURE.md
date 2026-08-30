# 28 — Performance Architecture

**Status:** Blueprint  
**Audience:** Architecture, engineering, SRE, product  
**Requirement IDs:** REQ-PERF, REQ-SRCH, REQ-VID, REQ-API  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Doctor / video](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [Testing](31_TESTING_STRATEGY.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

Performance is a **quality attribute of the kernel**, not a late optimization pass. Healthcare commerce fails in the field when search is slow, checkout double-submits, riders lose GPS, or video never shows a first frame.

This document sets **directional engineering targets** (not contractual SLAs — **OD-SLA-01**), caching and data-access patterns, pagination, search, background work, realtime, mobile offline, and video latency design.

**ASSUMPTION (A-PERF-01):** Targets in §2 apply to a single-region production cluster under expected Phase 2–4 load. Multi-country split and contractual SLOs are later.

---

## 2. Targets (directional)

From [04](04_APPLICATION_ARCHITECTURE.md) §11. These are **engineering budgets**, not customer-facing SLAs.

| Surface | Target | Notes |
| --- | --- | --- |
| API read p95 (cached) | **< 200 ms** | Catalog fragments, session, feature flags; exclude search |
| API read p95 (uncached OLTP) | **< 500 ms** | Order get, booking get; exclude search and report PDF generate |
| API write p95 (non-money) | **< 700 ms** | Cart, address, slot hold |
| Money POST p95 (platform time) | **< 800 ms** | Excludes PSP round-trip; record PSP time separately |
| Search p95 | **< 300 ms** | Query + filter; exclude cold index rebuild |
| Video time-to-first-frame (TTFF) p95 | **< 5 s** | Good network (Wi-Fi / solid LTE); waiting-room join after token issued |
| Payment webhook processing p95 | **< 10 s** | Ingest → idempotent apply → outbox |
| Outbox dispatch p95 | **< 5 s** | After commit; zero silent drop of ledger events |
| Rider / phlebotomist location ingest p95 | **< 400 ms** | Ingest + fan-out to subscribers of that job |
| Notification enqueue p95 | **< 2 s** | Enqueue only; provider delivery is best-effort |

**OPEN DECISION (OD-SLA-01):** Contractual SLAs / credits. Do not publish these numbers as legal SLAs until commercial and legal review.

**ASSUMPTION (A-PERF-02):** p95 is measured at the API edge (gateway) excluding client render. Video TTFF is measured client-side from “join success” to first decoded frame.

---

## 3. Performance principles

1. **Cache what is public or slowly changing; never cache authorization or clinical payload as if it were public.**
2. **Cursor pagination** for operational lists; offset pagination is forbidden for large, moving sets.
3. **Read models** for catalog, search, and tracking; source of truth remains OLTP.
4. **Async for anything that is not the user’s next click** (search index, notifications, settlement, recon, analytics).
5. **Idempotency on money and state-machine transitions** so retries are cheap and safe.
6. **Residency before global CDN for health blobs.** Performance must not copy Rx/reports to a non-resident POP as a durable store.
7. **Degrade, don’t lie.** If maps or video SFU is degraded, show stale/limited UI; do not invent ETAs or fake “connected.”

---

## 4. CDN and edge

| Asset class | CDN? | Cache |
| --- | --- | --- |
| App static (JS/CSS, design-system, public images) | Yes | Long cache + fingerprint |
| Public catalog images (OTC pack shots, doctor public photo if pack allows) | Yes | Medium TTL; invalidate on publish |
| Rx images, KYC, lab reports, consult recordings | **No public CDN cache** | Origin private bucket; short-lived signed URL after authz ([27](27_SECURITY_ARCHITECTURE.md) §6.4) |
| Map tiles | Provider CDN | Not our origin |
| Next.js public pages (SEO category) | Yes, with short HTML TTL or ISR | Country/locale vary; do not cache logged-in HTML |

Edge WAF sits with CDN ([27](27_SECURITY_ARCHITECTURE.md) §10). Logged-in APIs generally **bypass** HTML cache.

**OPEN DECISION (OD-CDN-01):** Cloudflare vs CloudFront vs cloud-native. See [29](29_INFRASTRUCTURE_ARCHITECTURE.md). Recommendation: **one vendor for CDN+WAF** in Phase 0.

---

## 5. Caching layers (Redis)

| Layer | Contents | TTL / invalidation | Forbidden |
| --- | --- | --- | --- |
| **L0 CDN** | Public static + public catalog media | Fingerprint / purge on publish | Health blobs |
| **L1 Redis — session & authz assist** | Session, refresh family meta, `sid` denylist, rate-limit counters | Session lifetime; denylist until JWT expiry | Storing consent as the **only** authz source (reload grants; short cache OK) |
| **L2 Redis — read-through** | Feature flags, country pack snapshot, method catalog, CMS fragments | Pack publish invalidates; seconds-to-minutes | Prices that can change mid-checkout without version |
| **L3 Redis — geo / realtime** | Rider last point, job pub/sub, waiting-room presence | Seconds; job-scoped | 24h tracking of field staff ([11](11_LOGISTICS_PLATFORM.md)) |
| **L4 Redis — idempotency & locks** | Idempotency records, slot holds, stock reservation tokens | Align with checkout TTL | Using locks instead of DB constraints for money |
| **Process memory** | Tiny hot config (optional) | Seconds | PHI, tokens, prices |

**Offer / price:** Checkout must pin **Offer version** (or snapshot) at session start so a cache hit cannot charge a stale price. Catalog list may be slightly stale; checkout recency is mandatory.

**Consent cache:** Optional Redis hint with TTL of **seconds**. Domain still reloads `ConsentGrant` on payload read ([16](16_HEALTH_RECORD.md), [27](27_SECURITY_ARCHITECTURE.md)).

**Stampede:** Single-flight / lock around expensive catalog rebuilds. Never stampede OpenSearch.

---

## 6. Database optimization

Postgres is the OLTP system of record ([04](04_APPLICATION_ARCHITECTURE.md), [20](20_DATABASE_ARCHITECTURE.md)).

| Practice | Rule |
| --- | --- |
| Indexes | Access-path indexes for state-machine queries (order by org+status, job by partner+status, sample by barcode) |
| RLS | Country / org isolation without application-only filters ([27](27_SECURITY_ARCHITECTURE.md)) |
| Hot rows | Avoid updating a single “god” order row for GPS; tracking points are append-only |
| JSONB | Allowed for pack config and sparse metadata; not for money amounts or state |
| Read replicas | Allowed for heavy admin lists and analytics **extract**; not for checkout confirm or consent |
| Partitioning | Time/country partitions when volume requires (jobs, audit, GPS, webhook inbox) — not day one unless evidence |
| N+1 | Module list endpoints use joins or batched read models |
| Transactions | Short; no PSP HTTP inside a DB transaction |
| Outbox | Same transaction as the state change |

Heavy search is **not** Postgres ILIKE across the catalog. Operational “find this order id” may be OLTP.

---

## 7. API performance

| Pattern | Rule |
| --- | --- |
| BFF | v1 single API; do not add per-app backends that duplicate queries ([04](04_APPLICATION_ARCHITECTURE.md)) |
| Payload | List endpoints return summaries; payload (Rx bytes, report PDF) is a second authorized GET |
| Compression | TLS + gzip/br for JSON; do not compress already-compressed images |
| Timeouts | Gateway timeout > handler timeout > DB statement timeout, documented |
| Bulk | Admin exports are async jobs, not synchronous 10k-row GETs |
| Graph nesting | If GraphQL is added later, query cost limits; v1 REST/JSON as in [21](21_API_ARCHITECTURE.md) |

---

## 8. Image and document optimization

| Kind | Optimization | Caution |
| --- | --- | --- |
| Catalog / CMS | Resize variants (thumb, card, detail); WebP/AVIF where clients allow | Health claims on images: **LEGAL REVIEW** for ads |
| Doctor public photo | Same as catalog | Pack may forbid public photo |
| **Rx images** | Server-side decode for pharmacist viewer; optional downscale **working copy**; **retain original** for clinical/legal pack | Do **not** strip originals; do **not** public CDN; no aggressive client cache; OCR is non-authoritative |
| KYC docs | No public variants; malware scan | Field-level encrypt ([27](27_SECURITY_ARCHITECTURE.md)) |
| Lab reports (PDF) | Generate once; store; signed download | Do not inline PHI in push notifications |
| POD photos | Moderate size; retain per pack | Not clinical EHR by default |

Lazy-load catalog grids. Never lazy-load away from a pharmacist’s need to see the **full** Rx page they are verifying.

---

## 9. Pagination

**Decision: cursor (keyset) pagination** for orders, jobs, tickets, settlements, catalog admin, and event feeds.

| Use | Method |
| --- | --- |
| Customer order history, job lists, finance journals | Cursor on `(created_at, id)` or monotonic id |
| Search | Search-engine `search_after` / cursor; do not deep-offset |
| Tiny enums | Offset OK (e.g. 20 countries) |
| Infinite map markers | Geo query + limit; not “page 50 of riders” |

Cursor tokens are **opaque and HMAC-signed** so clients cannot scan other tenants ([27](27_SECURITY_ARCHITECTURE.md) §9).

---

## 10. Search

Index lives in OpenSearch ([04](04_APPLICATION_ARCHITECTURE.md), [24](24_SEARCH_ARCHITECTURE.md)).

| Rule | Detail |
| --- | --- |
| Index what | Catalog offers, doctors (public fields), lab tests/packages, help CMS — **metadata only** for health artifacts |
| Do not index | Result values, Rx image bytes, KYC, full consult notes |
| Freshness | Async indexer from outbox; p95 search assumes warm index |
| Synonyms | Country pack + pharmacy thesaurus; not hardcoded to one language |
| Ranking | Own-pharmacy vs vendor boost is **OD-CUS-07** (pack-configurable) |
| Suggest | Prefix on public names; rate-limited ([27](27_SECURITY_ARCHITECTURE.md) §10) |
| Fail | If search is down, degrade to OLTP exact SKU/id lookup for ops; customer home shows cached modules |

---

## 11. Background jobs and queues

**BullMQ on Redis** (or equivalent) for:

- Outbox dispatcher
- Search index
- Notifications
- Settlement batch generation
- Payment recon file import
- Image variant + malware scan
- Slot generation (doctors)
- Expiry of holds and OTPs

| Rule | Detail |
| --- | --- |
| Priorities | Money/outbox > clinical notifications (panic flag) > search > analytics |
| Retry | Exponential backoff; poison queue; never infinite money retry without idempotency |
| Ordering | Per aggregate id (order, sample, intent) where required |
| Idempotency | Job key = domain event id |
| Observability | Queue lag SLOs in [30](30_OBSERVABILITY.md) |

PSP and SMS **provider** latency is not BullMQ; adapters have their own timeouts and circuit breakers.

---

## 12. WebSocket / realtime

| Channel | Transport | Scale note |
| --- | --- | --- |
| Job / order tracking | WebSocket + Redis pub/sub | Room = `job_id` / `order_id`; authz on subscribe |
| Consult chat | Platform chat as source of truth ([04](04_APPLICATION_ARCHITECTURE.md) §8) | Must survive video disconnect |
| Waiting room | Presence via API + WS | |
| Admin queues | Polling + SSE | Do not WS-broadcast all country orders to every admin |

**Rules:** Authenticate subscribe; no PHI in presence payloads; reconnect with last event id; backpressure: drop GPS if burst exceeds budget (keep latest).

Horizontal API instances share Redis pub/sub. Sticky sessions are **not** required if every node can subscribe.

---

## 13. Mobile offline and cache

| App | Offline allowed | Forbidden offline |
| --- | --- | --- |
| Customer | Browse cached catalog fragments; read past orders/reports **metadata**; draft Rx upload queued | Confirm paid checkout; mark POD; grant consent that the server never saw |
| Pharmacy | Local pick list cache while in store | Approve Rx without server (unless pack later defines a legal offline dispense — **do not invent**) |
| Rider / phlebotomist | Queue GPS and **non-identity** status (“en route”); print already-issued barcode | Identity OTP verify (**OD-PHE-03** recommend **no**); fake POD |
| Doctor | Draft notes local encrypted | Sign Rx / complete encounter without server clock |

Conflict: server wins for money and clinical sign; last-write-wins only for GPS with timestamp.

Encrypted at rest on device for cached health metadata. Remote wipe on logout / revoke ([27](27_SECURITY_ARCHITECTURE.md) §4.3).

---

## 14. Video (LiveKit) low-latency

Targets: **TTFF p95 < 5 s** on good networks. Poor networks: degrade to audio, then chat; consult continues ([08](08_DOCTOR_PLATFORM.md)).

| Control | Design |
| --- | --- |
| SFU | LiveKit (or adapter-equivalent). Clients never talk to a second undocumented SFU |
| TURN | Mandatory in production; some mobile carriers fail without it. Budget TURN bandwidth |
| Simulcast / SVC | On; subscriber chooses layer by bandwidth |
| Token | Short-lived room token from platform after appointment authz; not a reusable API key in the app |
| Recording | **Default off**; if pack+consent ever on, recording is a **second** path and must not delay TTFF |
| Region | Media nodes in the same region class as the appointment’s country pin when required |
| Chat | Platform chat is SoT; do not wait for SFU to send clinical text |
| Quality telemetry | Ops metrics (join time, packet loss, TTFF) — **OD-VID-06** whether this is clinical audit vs ops-only |

**OPEN DECISION (OD-VID-01):** LiveKit Cloud vs self-hosted vs hybrid. Performance implication: Cloud reduces ops; self-host may be needed for residency. Adapter hides this from clients.

PSTN bridge is **out of v1** (**OD-VID-07**).

Load test rooms and TURN before doctor launch ([31](31_TESTING_STRATEGY.md)).

---

## 15. Payments and ledger (latency vs correctness)

- Do not hold a DB transaction while calling the PSP.
- Webhook: verify, persist, apply idempotently; p95 < 10 s.
- Ledger post is **synchronous with the outbox consumer** for that event, not “later tonight” — delayed post is a **break** ([13](13_LEDGER_SETTLEMENT.md)).
- Recon file import is batch; does not block checkout.

---

## 16. Lab and logistics specifics

| Flow | Performance note |
| --- | --- |
| Barcode scan | Local scan + server confirm; mismatch is a **hard stop**, not a retry storm ([09](09_LAB_PLATFORM.md)) |
| Report PDF | Pre-generate on sign; customer open should be signed-URL GET, not live render |
| Panic flag | Notification path is high priority; still **no full results in SMS** if pack forbids |
| Multi-sample status | Rollup is cheap read-model (**OD-LAB-04**) |

---

## 17. What not to do

- Microservices “for scale” in Phase 0–4 ([04](04_APPLICATION_ARCHITECTURE.md), [34](34_RISK_REGISTER.md)).
- Cache Rx images on a public CDN to hit image p95.
- Offset page 200 of live jobs.
- Chatty GPS every 100 ms for idle riders (**OD-LOG-05**).
- Search-all-PHI.
- Fake video “connected” without a decoded frame.

---

## 18. Verification

Load, soak, and chaos: [31](31_TESTING_STRATEGY.md). Dashboards and SLOs: [30](30_OBSERVABILITY.md).

---

## 19. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-SLA-01 | Contractual SLAs | Engineering targets only until commercial/legal |
| OD-CDN-01 | CDN/WAF vendor | Single vendor; see [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| OD-VID-01 | LiveKit hosting | Adapter; Cloud until residency forbids |
| OD-CUS-07 | Search boost own vs vendor | Pack-configurable |
| OD-PHE-03 | Offline OTP | No |
| OD-LOG-05 | GPS ping interval | Tight only when en-route |
