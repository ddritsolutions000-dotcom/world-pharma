# 04 — Application Architecture

**Status:** Blueprint  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md)

---

## 1. Architectural style (decision)

**Decision: Modular monolith first**, with **extractable bounded contexts**.

| Option | Verdict |
| --- | --- |
| Microservices on day 1 | Rejected. Cross-domain transactions (pay → order → ledger → notify) plus small team risk. |
| Distributed monolith (hidden) | Rejected. |
| **Modular monolith (NestJS modules or equivalent)** | **Selected.** One deployable API, strict module boundaries, internal events via outbox. |
| Headless + BFF per app | Optional BFFs later; v1 single API + clients. |

**Transition strategy:** When a context has independent scale, failure domain, or compliance isolation (typical candidates: **Payment orchestration**, **Video**, **Search**, **Logistics tracking**, **Analytics ingest**), extract it behind the same domain APIs. Clients should not care.

See [29_INFRASTRUCTURE_ARCHITECTURE.md](29_INFRASTRUCTURE_ARCHITECTURE.md) and [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md) OD-ARCH-01.

---

## 2. Platform kernel vs experience apps

### 2.1 Kernel (shared, mandatory)

Identity, IAM, Party/KYC, **Partner onboarding engine**, Customer profile, Catalog read models, Orders/Bookings backbone, Payments, Wallet, Ledger, Notifications, Logistics jobs, CRM core, Health record + consent, Search indexes, Analytics events, Audit, Compliance/policy packs.

### 2.2 Experience apps (clients)

All apps consume the kernel. They **must not** embed a second identity, payment, or ledger.

```
┌──────── Customer RN + Customer Next.js ────────┐
┌──────── Join us / Become a partner (Next.js) ───┐
┌── Pharmacy RN/Web ─ Vendor RN/Web ─ Doctor RN/Web ─┐
┌── Lab Web ─ Lab Staff RN ─ Phlebotomist RN ─ Pathologist Web ─┐
┌── Delivery RN ──────────────────────────────────────────────┐
┌── Admin Next.js (role shells + partner verification) ─────────┐
                         │
                    HTTPS / TLS
                         │
              ┌──────────▼──────────┐
              │  API Gateway / WAF  │
              │  (authn, rate limit) │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  World Pharma API     │
              │  Modular monolith    │
              │  + Outbox dispatcher │
              └──────────┬──────────┘
         ┌───────┬───────┼───────┬───────┐
         ▼       ▼       ▼       ▼       ▼
       PG     Redis   OpenSearch  S3    Providers
                                      (pay, SMS, video)
```

---

## 3. Application inventory

| ID | Application | Clients | Primary users |
| --- | --- | --- | --- |
| APP-CUS-M | Customer Mobile | Android, iOS (React Native) | Customer |
| APP-CUS-W | Customer Web | Next.js responsive | Customer |
| APP-PHARM | Store / Pharmacy App | RN + Web | Pharmacy staff |
| APP-VEND | Vendor App / Portal | **Web only** (canonical [88](88_GLOBAL_APPLICATION_TOPOLOGY.md); RN vendor **not** in inventory — **CR-ECO-92**) | Vendor |
| APP-DOC | Doctor App | RN + Web | Doctor |
| APP-LAB-W | Lab Management Portal | Web | Lab owner/manager/staff |
| APP-LAB-S | Lab Staff App | RN | Lab staff (optional overlap with web) |
| APP-PHE | Phlebotomist App | RN | Phlebotomist |
| APP-PATH | Pathologist Portal | Web | Pathologist |
| APP-DEL | Delivery Partner App | RN | Delivery partner |
| APP-JOIN-W | Join us / Become a partner | Next.js public + applicant | All partner applicants | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| APP-ADM-S | Super / Global Admin | Web | Super/global admin |
| APP-ADM-C | Country Admin | Web | Country admin |
| APP-OPS | Operations | Web | Operations |
| APP-FIN | Finance | Web | Finance |
| APP-CRM | CRM / Support | Web | Support, CRM |

Admin experiences are **one Next.js admin app with permission-based shells**, not five codebases. URLs and nav differ by role. See [17_ADMIN_ERP.md](17_ADMIN_ERP.md).

**ASSUMPTION:** Pharmacy and doctor share RN + web. **Vendor is web-only.** Affiliate is **web-only**. No generic Partner App. Canonical client list: [88](88_GLOBAL_APPLICATION_TOPOLOGY.md), [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md).

---

## 4. Recommended technology (summary)

Full evaluation: [29_INFRASTRUCTURE_ARCHITECTURE.md](29_INFRASTRUCTURE_ARCHITECTURE.md).

| Layer | Choice | Why | Main alternatives |
| --- | --- | --- | --- |
| Mobile | React Native | Required; one team for many role apps | Flutter (not selected; RN mandated) |
| Customer/SEO web | Next.js App Router | Catalog/doctor/lab SEO, SSR, one React skill | Remix, plain Vite SPA |
| Admin/portals | Next.js | Shared design system, auth | Vite SPA |
| API | NestJS + TypeScript | Module boundaries, DI, same language as clients | Spring Boot, .NET, Go |
| OLTP | PostgreSQL 16 | Integrity, JSON, GIS, RLS | MySQL, Cockroach (later) |
| Cache / queue | Redis + BullMQ | Cache, geo, jobs; simple ops | RabbitMQ, SQS |
| Search | OpenSearch | Synonyms, filters, self-host option | Algolia, Elasticsearch, Typesense |
| Objects | S3-compatible | Rx images, reports, KYC | GCS, Azure Blob |
| CDN | Cloudflare or CloudFront | Assets + WAF option | Fastly |
| Video | LiveKit (SFU) | WebRTC, recording optional, OSS path | Twilio, Agora, Daily |
| Realtime tracking | WebSocket (API) + Redis pub/sub | Rider GPS, job updates | MQTT, Ably |
| Notifications | Adapter layer | FCM, APNs, email, SMS, WhatsApp BSP | Direct vendor SDKs in domain code (forbidden) |

**Vendor lock-in:** Payment and SMS will have some lock-in; isolate behind adapters. Prefer S3 API, Postgres, and LiveKit OSS to retain mobility.

---

## 5. Monorepo layout (target, not implemented yet)

```
/apps
  /api                 NestJS modular monolith
  /web-customer        Next.js
  /web-join           Next.js (public Join us + applicant wizard)
  /web-admin           Next.js (all admin/ops/finance/crm + partner verification)
  /web-pharmacy        Next.js (or route group in partner-web)
  /web-partner         Next.js (vendor, lab, pathologist, doctor, clinic/hospital web)
  /mobile              React Native (workspaces: customer, pharmacy, vendor, doctor, lab-staff, phlebotomist, delivery)
/packages
  /ui-kit              Design system
  /shared-types        API contracts, enums, state machines
  /eslint-config
/docs
  /blueprint           THIS documentation
```

**OPEN DECISION:** One RN app with build flavors vs multiple RN apps sharing packages. Recommendation: **one RN workspace with flavors** (customer vs partner) to control store listings, but **separate store listings** per audience.

---

## 6. Module map inside the API

| Module | Directory (logical) | Doc |
| --- | --- | --- |
| `identity` | auth, sessions, MFA, devices | 05, 27 |
| `iam` | roles, permissions, memberships | 03 |
| `party` | persons, orgs, locations, KYC | 06–11, 14 |
| `partner` | applications, types, invitations, partner documents | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| `catalog` | items, offers, CMS content | 05–09 |
| `inventory` | stock, batch, transfers | 06, 07 |
| `order` | carts, orders, returns | 05–07 |
| `prescription` | uploads, verification, structured Rx | 06, 08, 16 |
| `care` | doctors, slots, appointments, encounters | 08 |
| `video` | sessions, tokens, quality, recording flags | 08 |
| `diagnostics` | tests, bookings, samples, reports | 09, 10 |
| `logistics` | jobs, assignment, tracking, POD | 11 |
| `payment` | intents, gateways, refunds | 12 |
| `wallet` | balances, holds | 12, 13 |
| `ledger` | journal, accounts | 13 |
| `settlement` | batches, payouts | 13 |
| `affiliate` | attribution, commissions | 14 |
| `crm` | 360, segments, campaigns | 15 |
| `support` | tickets | 15 |
| `health` | artifacts, timeline, consent | 16 |
| `notification` | templates, dispatch | 23 |
| `search` | indexing, query | 24 |
| `compliance` | policy packs, holds | 19 |
| `cms` | banners, help, **education/news/SEO (expanded slot CR-ECO-92)** | 17, [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `analytics` | event sink / later warehouse | 30, [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `care_navigation` | symptom intake orchestration (**not diagnosis**) | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `clinical_triage` | urgency / red-flag routing | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `specialist_matching` | specialty + geo + availability match | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `radiology` | imaging orders/studies/reports (not pathology) | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `marketing` | campaigns/attribution (dispatch via `notification`) | 15, [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| `loyalty` / `subscription` | membership, refill (pack-gated) | 05, [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |

**Rule:** Modules communicate via **public application services + domain events**. No deep import of another module’s tables. **CR-ECO-92 modules are architectural slots — not implemented and not authorized to code.**

---

## 7. Client architecture rules

1. **No business logic duplication** of pricing, eligibility, or Rx rules on the client. Clients may cache display rules.
2. **Offline:** Customer app caches catalog fragments and order history; **cannot** confirm paid orders offline. Rider/phlebotomist: queue GPS and status with conflict resolution. See [28_PERFORMANCE_ARCHITECTURE.md](28_PERFORMANCE_ARCHITECTURE.md).
3. **Feature flags:** Country Policy Pack + runtime flags (LaunchDarkly or open-source equivalent).
4. **Deep links:** Orders, reports, consults, referral codes.
5. **White-label:** Not v1. Structure org theming later without forking.

---

## 8. Realtime surfaces

| Surface | Transport |
| --- | --- |
| Order / job tracking | WebSocket channels scoped to `job_id` / `order_id` |
| Consult chat | Video provider data channel **or** platform chat (must survive video disconnect) **Decision:** platform chat as source of truth |
| Consult video/audio | WebRTC via LiveKit |
| Support | Tickets primarily async; optional live chat later |
| Admin dashboards | Polling + SSE for queues |

---

## 9. Integration architecture

All third parties are **provider adapters**:

- Payments: Stripe, Adyen, Razorpay, local (config)
- SMS / WhatsApp: aggregator + BSP
- Maps / ETA: Google / Mapbox / local **OPEN DECISION**
- KYC/AML: optional vendor
- OCR for Rx: assist only
- Tax: engine interface (internal table v1)

---

## 10. Environment topology

| Env | Purpose |
| --- | --- |
| `local` | Developers |
| `dev` | Shared integration |
| `staging` | Prod-like, fake gateways, fake video |
| `prod` | Live; country routing |

Data residency: see [18_GLOBALIZATION.md](18_GLOBALIZATION.md). Default one regional prod cluster; **country pin** when policy requires.

---

## 11. Quality attributes (targets, not SLAs yet)

**OPEN DECISION:** Contractual SLAs.

Directional:

- API p95 read < 200 ms cached, < 500 ms uncached (ex-search)
- Search p95 < 300 ms
- Video join p95 < 5 s under good network
- Payment webhook processing < 10 s p95
- Zero silent drop of ledger events (outbox)

---

## 12. What not to build in Phase 0 code

- Per-app backends
- Direct gateway SDKs in UI
- Hardcoded country = IN
- Separate user tables per app
- Recording-on-by-default video
- Autonomous diagnosis product
- Radiology folded into pathology
- Second CMS or second notification engine
- Generic Partner App / affiliate mobile (unless a future CR)
