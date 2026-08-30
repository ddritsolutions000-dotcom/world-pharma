# 00 — Master Index

**World Pharma — Global Healthcare Super Platform**  
**Status:** Master Blueprint (single source of truth) — **ecosystem baseline LOCKED**  
**Lock:** [43_ECOSYSTEM_BASELINE_LOCK.md](43_ECOSYSTEM_BASELINE_LOCK.md)  
**Stage:** Documentation is the product contract. Implementation proceeds only by authorized Phase 0+ tasks and must not expand locked scope.

This index is the entry point for every subsequent design and implementation decision. If a topic is not linked here, it is not yet in the source of truth.

**Blueprint is the single source of truth.** New requirements require formal change review ([43](43_ECOSYSTEM_BASELINE_LOCK.md)). Existing requirements must not be silently removed or altered. Core architecture must not be replaced without an approved architecture decision.

---

## How to use this blueprint

1. Read [01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) and [02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md).
2. Confirm kernel and apps in [04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md).
3. Use domain books [05](05_CUSTOMER_PLATFORM.md)–[17](17_ADMIN_ERP.md) for module behavior. Supply-side join/KYC is centralized in [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md).
4. Treat [20](20_DATABASE_ARCHITECTURE.md) and [21](21_API_ARCHITECTURE.md) as implementation contracts.
5. Do not start a phase without its **exit criteria** in [33_DEVELOPMENT_ROADMAP.md](33_DEVELOPMENT_ROADMAP.md). Classify and execute Phase 0 via [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md), [38_PHASE_0_DECISION_BOARD.md](38_PHASE_0_DECISION_BOARD.md), and [39_PHASE_0_IMPLEMENTATION_PLAN.md](39_PHASE_0_IMPLEMENTATION_PLAN.md).
6. Never invent country law. Encode only reviewed rules into **Country Policy Packs** ([18](18_GLOBALIZATION.md), [19](19_COMPLIANCE_FRAMEWORK.md)).
7. After [43](43_ECOSYSTEM_BASELINE_LOCK.md), any new module, domain, partner type, architecture pattern, or technology follows **CR → Impact → Security/Compliance → Architecture → Decision → Blueprint update → Implementation**.

**Markers used everywhere:** `ASSUMPTION` · `OPEN DECISION` · `LEGAL/COMPLIANCE REVIEW REQUIRED` · `RISK`

---

## 1. Project vision

World Pharma is a **global healthcare super platform**: one identity, one customer profile, one health record, one ledger, and one logistics and payment kernel powering:

- Own pharmacy and multi-vendor marketplace
- Medicine ordering and prescription management
- Doctor discovery, booking, and video/audio/chat consultation
- Laboratory marketplace, home collection, pathologist workflow, digital and physical reports
- Food-delivery-grade logistics for medicines, samples, and reports
- Multi-gateway, multi-currency payments, wallet, refunds
- Double-entry-style ledger and participant settlement
- Affiliate, CRM, loyalty, admin ERP, search, notifications, analytics

It is **not** a single-country pharmacy clone and **not** a set of disconnected apps.

Full statement: [01_PRODUCT_VISION.md](01_PRODUCT_VISION.md).

**ASSUMPTION:** “World Pharma” is the working title from the repository. Legal brand is **OD-BRAND-01**.

---

## 2. Scope

### 2.1 In scope (platform)

| Area | In scope |
| --- | --- |
| Customer super app | Mobile (RN Android/iOS) + responsive web |
| Own pharmacy | Stores, warehouse, inventory, batch/expiry, Rx verification, billing |
| Vendor marketplace | KYC, listings, orders, commission, settlement |
| Doctors | Onboarding, calendar, consults, digital Rx, earnings |
| Video | WebRTC (LiveKit), waiting room, quality, optional recording **off by default** |
| Labs | Catalog, bookings, samples, QC, pathologist, reports |
| Phlebotomists | Field collection, barcode, chain of custody |
| Logistics | Multi-type jobs, assignment, tracking, OTP/POD, COD |
| Payments | Orchestration, multi-currency, refunds, webhooks |
| Finance | Wallet (country-gated), ledger, settlements |
| Growth | Affiliate, coupons, loyalty/membership (later phases) |
| CRM / support | Customer 360, campaigns, tickets |
| Health record | Artifacts + consent (doctors are not unrestricted) |
| Admin / ERP | One web admin, permission shells |
| Global | Countries, languages, currencies, policy packs |
| Platform | RBAC, search, notifications, audit, observability |

### 2.2 Out of scope (explicit)

Hospital HIS replacement, insurance/TPA core, manufacturing serialization, diagnostic AI that “diagnoses”, in-house card acquiring, in-house SFU from scratch, hardcoding a single country.

Detail: [01](01_PRODUCT_VISION.md) §5, [02](02_BUSINESS_ARCHITECTURE.md).

---

## 3. Canonical glossary

| Term | Meaning |
| --- | --- |
| **Platform kernel** | Shared identity, IAM, profile, catalog, order/booking backbone, payment, ledger, logistics, notifications, CRM, health record, search, analytics, audit, compliance |
| **Country Policy Pack** | Versioned configuration for a country (services, payments, tax profile, residency, recording, Rx placeholders). Not source-code forks |
| **Person** | Human user (`user_id`) |
| **Organization** | Pharmacy, vendor, lab, clinic, fleet, affiliate org |
| **Location** | Store, warehouse, lab site, clinic |
| **CatalogItem** | Medicine, OTC, device, lab test, package, consult product |
| **Offer** | Priced availability of an item at a seller/location/country |
| **Cart** | Customer goods intent |
| **CheckoutSession** | Payment umbrella that can create child **Order** and/or **Booking** |
| **Order** | Commercial goods order (pharmacy/marketplace) |
| **Booking** | Doctor appointment or lab collection reservation |
| **Encounter** | Doctor–patient consult session |
| **LogisticsJob** | Physical movement/collection work unit |
| **Sample** | Specimen with chain of custody |
| **HealthArtifact** | Rx, report, document in the health record |
| **ConsentGrant** | Time-bound, purpose-bound access to health artifacts |
| **PaymentIntent** | Capture/authorize attempt via gateway adapters |
| **JournalEntry / JournalLine** | Immutable double-entry posting |
| **Participant** | Platform, pharmacy, vendor, doctor, lab, delivery partner, affiliate |
| **Partner** | Supply-side participation of a Person in a country + PartnerType (optional Organization). Not a second login. Canonical onboarding: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| **PartnerApplication** | Unified join/KYC/approval case (`DRAFT` … `ACTIVE`) |
| **PartnerType** | Extensible catalog (`DOCTOR`, `VENDOR`, `LAB`, `CLINIC`, `HOSPITAL`, …) overlayed by Country Policy Pack |

---

## 4. All applications

Admin experiences are **one Next.js app** with permission-based shells, not five codebases.

| ID | Application | Clients | Users | Primary docs |
| --- | --- | --- | --- | --- |
| APP-CUS-M | Customer Mobile | RN Android, iOS | Customer | [05](05_CUSTOMER_PLATFORM.md), [25](25_UI_UX_ARCHITECTURE.md) |
| APP-CUS-W | Customer Web | Next.js | Customer | [05](05_CUSTOMER_PLATFORM.md) |
| APP-PHARM | Store / Pharmacy | RN + Web | Pharmacy staff | [06](06_PHARMACY_PLATFORM.md) |
| APP-VEND | Vendor App / Portal | RN + Web | Vendor | [07](07_VENDOR_PLATFORM.md) |
| APP-DOC | Doctor App | RN + Web | Doctor | [08](08_DOCTOR_PLATFORM.md) |
| APP-LAB-W | Lab Management Portal | Web | Lab owner/manager/staff | [09](09_LAB_PLATFORM.md) |
| APP-LAB-S | Lab Staff App | RN | Lab staff | [09](09_LAB_PLATFORM.md) |
| APP-PHE | Phlebotomist App | RN | Phlebotomist | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| APP-PATH | Pathologist Portal | Web | Pathologist | [09](09_LAB_PLATFORM.md) |
| APP-DEL | Delivery Partner App | RN | Rider | [11](11_LOGISTICS_PLATFORM.md) |
| APP-ADM | Admin suite (Super, Country, Ops, Finance, CRM) | Next.js shells | Admin roles | [17](17_ADMIN_ERP.md) |
| APP-JOIN-W | Join us / Become a partner | Next.js public + applicant | Applicants | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md), [25](25_UI_UX_ARCHITECTURE.md) |

---

## 5. All modules (API bounded contexts)

| Module | Owns | Doc |
| --- | --- | --- |
| `identity` | Auth, OTP, sessions, devices, MFA | [05](05_CUSTOMER_PLATFORM.md), [27](27_SECURITY_ARCHITECTURE.md) |
| `iam` | Roles, permissions, memberships | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| `party` | Persons, orgs, locations, KYC | [06](06_PHARMACY_PLATFORM.md)–[14](14_AFFILIATE_PLATFORM.md) |
| `partner` | Partner types, applications, documents, invitations (onboarding engine; lives with `party` until extract) | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| `catalog` | Items, offers, CMS-linked content | [05](05_CUSTOMER_PLATFORM.md)–[09](09_LAB_PLATFORM.md) |
| `inventory` | Stock, batch, expiry, transfers | [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| `order` | Carts, orders, returns | [05](05_CUSTOMER_PLATFORM.md)–[07](07_VENDOR_PLATFORM.md) |
| `prescription` | Uploads, verification, structured Rx | [06](06_PHARMACY_PLATFORM.md), [08](08_DOCTOR_PLATFORM.md), [16](16_HEALTH_RECORD.md) |
| `care` | Doctors, slots, appointments, encounters | [08](08_DOCTOR_PLATFORM.md) |
| `video` | Sessions, tokens, quality, recording flags | [08](08_DOCTOR_PLATFORM.md) |
| `diagnostics` | Tests, bookings, samples, reports, print | [09](09_LAB_PLATFORM.md) |
| `logistics` | Jobs, assignment, tracking, POD | [11](11_LOGISTICS_PLATFORM.md) |
| `payment` | Intents, adapters, refunds, webhooks | [12](12_PAYMENT_PLATFORM.md) |
| `wallet` | Stored value (country-gated) | [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md) |
| `ledger` | Journal, accounts | [13](13_LEDGER_SETTLEMENT.md) |
| `settlement` | Batches, payouts | [13](13_LEDGER_SETTLEMENT.md) |
| `affiliate` | Attribution, commissions | [14](14_AFFILIATE_PLATFORM.md) |
| `crm` | 360, segments, campaigns | [15](15_CRM_PLATFORM.md) |
| `support` | Tickets | [15](15_CRM_PLATFORM.md) |
| `health` | Artifacts, timeline, consent | [16](16_HEALTH_RECORD.md) |
| `notification` | Templates, dispatch | [23](23_NOTIFICATION_ARCHITECTURE.md) |
| `search` | Indexes, query | [24](24_SEARCH_ARCHITECTURE.md) |
| `compliance` | Policy packs, holds, retention | [19](19_COMPLIANCE_FRAMEWORK.md) |
| `cms` | Banners, help | [17](17_ADMIN_ERP.md) |
| `analytics` | Event sink / BI | [17](17_ADMIN_ERP.md), [30](30_OBSERVABILITY.md) |

---

## 6. Architecture map

```
 Apps (RN + Next.js)
        │
        ▼
 WAF / API Gateway  →  AuthN, rate limit, TLS
        │
        ▼
 World Pharma API  (NestJS modular monolith)
   identity iam party catalog inventory order prescription
   care video diagnostics logistics payment wallet
   ledger settlement affiliate crm support health
   notification search compliance cms analytics
        │
        ├── PostgreSQL 16 (RLS, country_id)
        ├── Redis + BullMQ (cache, jobs, pub/sub)
        ├── Outbox → domain events
        ├── OpenSearch
        ├── S3-compatible objects (private for PHI)
        └── Adapters: PSP, SMS, email, WhatsApp BSP, LiveKit, maps
```

**Style decision:** Modular monolith first. Extract payment, video, search, tracking, or analytics only when scale, failure isolation, or residency requires it. Clients keep the same APIs.

Details: [04](04_APPLICATION_ARCHITECTURE.md), [29](29_INFRASTRUCTURE_ARCHITECTURE.md).

---

## 7. Document map

| Doc | Title | Contents |
| --- | --- | --- |
| [00](00_MASTER_INDEX.md) | Master Index | This file |
| [01](01_PRODUCT_VISION.md) | Product Vision | Problem, principles, scope |
| [02](02_BUSINESS_ARCHITECTURE.md) | Business Architecture | Model, journeys J01–J22, bounded contexts |
| [03](03_USER_ROLES_AND_PERMISSIONS.md) | Roles & Permissions | RBAC, scopes, SoD |
| [04](04_APPLICATION_ARCHITECTURE.md) | Application Architecture | Apps, kernel, stack, monorepo |
| [05](05_CUSTOMER_PLATFORM.md) | Customer Platform | Super-app modules |
| [06](06_PHARMACY_PLATFORM.md) | Pharmacy Platform | Owned stores, inventory, Rx desk |
| [07](07_VENDOR_PLATFORM.md) | Vendor Platform | Marketplace |
| [08](08_DOCTOR_PLATFORM.md) | Doctor Platform | Care + video |
| [09](09_LAB_PLATFORM.md) | Lab Platform | Diagnostics, pathologist, reports, sample machine |
| [10](10_PHLEBOTOMIST_PLATFORM.md) | Phlebotomist Platform | Field collection |
| [11](11_LOGISTICS_PLATFORM.md) | Logistics Platform | Job engine |
| [12](12_PAYMENT_PLATFORM.md) | Payment Platform | Orchestration, FX, wallet |
| [13](13_LEDGER_SETTLEMENT.md) | Ledger & Settlement | Journal, payouts |
| [14](14_AFFILIATE_PLATFORM.md) | Affiliate Platform | Attribution, commissions |
| [15](15_CRM_PLATFORM.md) | CRM Platform | 360, campaigns, tickets |
| [16](16_HEALTH_RECORD.md) | Health Record | Artifacts, consent |
| [17](17_ADMIN_ERP.md) | Admin / ERP | Ops, finance, CMS, config |
| [18](18_GLOBALIZATION.md) | Globalization | Policy packs, i18n, geo |
| [19](19_COMPLIANCE_FRAMEWORK.md) | Compliance Framework | Configurable controls, legal flags |
| [20](20_DATABASE_ARCHITECTURE.md) | Database Architecture | Conceptual model, tenancy |
| [21](21_API_ARCHITECTURE.md) | API Architecture | Domain APIs |
| [22](22_EVENT_ARCHITECTURE.md) | Event Architecture | Outbox, catalog |
| [23](23_NOTIFICATION_ARCHITECTURE.md) | Notification Architecture | Channels, templates |
| [24](24_SEARCH_ARCHITECTURE.md) | Search Architecture | OpenSearch |
| [25](25_UI_UX_ARCHITECTURE.md) | UI/UX Architecture | IA per app (no visual UI yet) |
| [26](26_DESIGN_SYSTEM_SPEC.md) | Design System Spec | Tokens, a11y (future DS) |
| [27](27_SECURITY_ARCHITECTURE.md) | Security Architecture | Auth, encryption, threat model |
| [28](28_PERFORMANCE_ARCHITECTURE.md) | Performance Architecture | Cache, video, mobile |
| [29](29_INFRASTRUCTURE_ARCHITECTURE.md) | Infrastructure Architecture | Stack evaluation |
| [30](30_OBSERVABILITY.md) | Observability | Logs, metrics, traces, SLOs |
| [31](31_TESTING_STRATEGY.md) | Testing Strategy | J01–J22, state machines |
| [32](32_DEVOPS_CICD.md) | DevOps / CI/CD | Monorepo, environments |
| [33](33_DEVELOPMENT_ROADMAP.md) | Development Roadmap | Phases 0–10 |
| [34](34_RISK_REGISTER.md) | Risk Register | Program risks |
| [35](35_OPEN_DECISIONS.md) | Open Decisions | Living decision log |
| [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) | Partner Onboarding Ecosystem | Join us, types, KYC, orgs, invitations, dashboards |
| [37](37_BLUEPRINT_AUDIT_REPORT.md) | Blueprint Audit Report | Second-pass audit, gaps, partner engine |
| [38](38_PHASE_0_DECISION_BOARD.md) | Phase 0 Decision Board | Classification of all ODs, engineering defaults, P0 DoD |
| [39](39_PHASE_0_IMPLEMENTATION_PLAN.md) | Phase 0 Implementation Plan | Workstreams, order, rollback |
| [40](40_IDENTITY_IMPLEMENTATION_NOTES.md) | Identity Implementation Notes | Phase 0 Task 2 kernel: OTP, session, RBAC |
| [41](41_COUNTRY_POLICY_IMPLEMENTATION_NOTES.md) | Country Policy Implementation Notes | Phase 0 Task 3: packs, resolver, fail-closed |
| [42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md) | Partner Model Implementation Notes | Phase 0 Task 4: dark partner/org/KYC |
| [43](43_ECOSYSTEM_BASELINE_LOCK.md) | Ecosystem Baseline Lock | Locked scope, apps, domains, partners, principles, CR process |
| [44](44_EVENT_IMPLEMENTATION_NOTES.md) | Event Implementation Notes | Phase 0 Task 5: outbox, BullMQ, inbox |
| [45](45_SECURITY_OBSERVABILITY_IMPLEMENTATION_NOTES.md) | Security / Observability Implementation Notes | Phase 0 Task 6: headers, CORS, rate limits, logs, metrics |
| [46](46_DESIGN_SYSTEM_IMPLEMENTATION_NOTES.md) | Design System Implementation Notes | Phase 0 Task 7: tokens, web/RN primitives, playground |
| [47](47_CICD_PRODUCTION_READINESS_IMPLEMENTATION_NOTES.md) | CI/CD + production-readiness notes | Phase 0 Task 8: GitHub Actions, Docker, Prisma, audit |
| [48](48_APPLICATION_SHELL_IMPLEMENTATION_NOTES.md) | Application shell notes | Phase 0 Task 9: customer/admin/mobile empty shells |
| [49](49_PHASE_0_FINAL_AUDIT.md) | Phase 0 final audit | Technical sign-off pack; not legal/business approval |
| [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) | Phase 1 Commerce / Store blueprint | Catalog, inventory, cart, pay, DHL, settlement **design only** |
| [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md) | Phase 1A implementation notes | Catalog + pricing only; no cart/pay/order |
| [52](52_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION_PLAN.md) | Phase 1B inventory/warehouse plan | Plan; implementation in [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) |
| [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) | Phase 1B inventory/warehouse implementation | Inventory + warehouse only; no cart/pay/order |
| [54](54_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION_PLAN.md) | Phase 1C cart + checkout plan | Plan; implementation in [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) |
| [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) | Phase 1C cart + checkout implementation | Cart + quote only; no pay/order |
| [56](56_PHASE_1D_PAYMENT_IMPLEMENTATION_PLAN.md) | Phase 1D global multi-gateway payment plan | Plan; implementation in [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) |
| [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) | Phase 1D payment implementation | Sandbox kernel only; no live PSP/order/DHL |
| [58](58_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION_PLAN.md) | Phase 1E orders + fulfillment plan | Plan; implementation in [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) |
| [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) | Phase 1E orders + fulfillment implementation | Sandbox payment only; no DHL/settlement |
| [60](60_PHASE_1F_LOGISTICS_CARRIER_IMPLEMENTATION_PLAN.md) | Phase 1F global logistics + carrier plan | Plan; implementation in [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) |
| [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) | Phase 1F logistics + mock carrier implementation | Mock only; no live DHL/settlement |
| [62](62_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_PLAN.md) | Phase 1G settlement + ledger + profitability plan | Plan; implementation in [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) |
| [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) | Phase 1G settlement + ledger + profitability implementation | Sandbox/mock payout only; no live money |
| [64](64_PHASE_2_MASTER_PLAN.md) | Phase 2 Healthcare Ecosystem master plan | Plan only; care + diagnostics; no code |
| [65](65_DOCTOR_ECOSYSTEM.md) | Doctor / clinic / hospital ecosystem | Plan; not HIS |
| [66](66_TELEMEDICINE_VIDEO.md) | Telemedicine / video | Plan; SFU vendor; recording off |
| [67](67_PRESCRIPTION_ECOSYSTEM.md) | Prescription ecosystem | Domain overview; R5 execution SoT = [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) |
| [68](68_LAB_ECOSYSTEM.md) | Lab catalog, booking, processing | Plan; not LIS/HIS |
| [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) | Sample collection + CoC | Plan; not parcel logistics |
| [70](70_PATHOLOGY_REPORTING.md) | Pathology + reports | Plan; immutable published reports |
| [71](71_HEALTH_RECORD_CONSENT.md) | Health record + consent | Plan; not EMR replacement |
| [72](72_HEALTHCARE_CRM.md) | Healthcare CRM | Plan; no clinical payload |
| [73](73_HEALTHCARE_PAYMENTS_SETTLEMENT.md) | Healthcare payments / settlement | Reuse 1D/1G; mock payout |
| [74](74_HEALTHCARE_LOGISTICS.md) | Healthcare logistics job types | Reuse 1F jobs |
| [75](75_HEALTHCARE_SECURITY_COMPLIANCE.md) | Healthcare security / compliance | Fail-closed; no invented law |
| [76](76_HEALTHCARE_DATABASE.md) | Healthcare logical data model | Plan; no migration |
| [77](77_HEALTHCARE_API_EVENTS.md) | Healthcare API + events | Outbox + BullMQ only |
| [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md) | App IA / UX | Separate apps; no UI code |
| [79](79_HEALTHCARE_TEST_STRATEGY.md) | Healthcare test strategy | Plan |
| [80](80_PHASE_2_ROADMAP.md) | P2-HC implementation slices | Plan; not a calendar |
| [81](81_PHASE_2_OPEN_DECISIONS.md) | P2-HC open decisions | Must stay OPEN |
| [82](82_PHASE_2_RISK_REGISTER.md) | P2-HC risk register | Blueprint |
| [83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md) | P2-HC-1 doctor / clinical partner foundation | Implemented; no appointments/video/Rx |
| [84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md) | P2-HC-2 appointment + consultation foundation | Implemented; no video/Rx |
| [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md) | Company-owned admin authority | Implemented; partners cannot escalate to platform admin |
| [87](87_GLOBAL_MNC_RETROFIT_AUDIT.md) | Global MNC retrofit of existing system | Additive; no country forks; no invented legal entities |
| [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) | Global application topology | Canonical mobile/web map; planned ≠ implemented |
| [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) | Company governance and authorization | Company hierarchy; partners are not company admins |
| [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) | Final ecosystem completeness audit | CR-ECO-92; slots only; no implementation |
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) | Global implementation roadmap | Canonical execution overlay R0–R16; no code |
| [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md) | R3 partner operations clients plan | Store / Delivery / Join; plan |
| [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md) | R3 partner operations implementation | CR-R3-IMPLEMENT + CR-R3-HARDEN-99; functional foundation |
| [95](95_GLOBAL_CURRENT_STATE_AUDIT.md) | Global current-state audit | Repo vs Blueprint; no code |
| [96](96_MULTI_TENANT_RLS_RETROFIT_PLAN.md) | Multi-tenant RLS retrofit plan | Tenancy/RLS design |
| [97](97_MULTI_TENANT_RLS_RETROFIT_IMPLEMENTATION.md) | Multi-tenant RLS retrofit implementation | CR-RLS-96-IMPL; `worldpharma_app`; FORCE RLS; complete |

---

## 8. Dependencies (build order)

```
P0 Foundation (packs, identity kernel, design system, CI, obs)
 → P1 Identity + customer shell + catalog + owned pharmacy (unpaid)
 → P2 Orders + PAYMENT KERNEL + LEDGER + inventory + MEDICINE_DELIVERY
      → P3 Vendor marketplace
      → P4 Doctor + video (consent + pay)
      → P5 Lab + collection + reports (jobs + health artifacts)
 → P6 Logistics expansion (all job types in the wild)
 → P7 CRM + affiliate + loyalty
 → P8 ERP depth + analytics warehouse
 → P9 Second country / filled policy packs
 → P10 Scale / optional service extraction
```

**Hard rules:** Ledger is **not** postponed to ERP. Marketplace/doctor/lab production traffic must not precede Phase 2 money. Policy pack scaffolding is Phase 0. Extraction of microservices is Phase 10 optional, not a starting architecture.

Full: [33_DEVELOPMENT_ROADMAP.md](33_DEVELOPMENT_ROADMAP.md).

---

## 9. Development phases (summary)

| Phase | Name | Exit (abbreviated) |
| --- | --- | --- |
| 0 | Foundation | Monorepo, empty policy pack, auth hello, CI, obs, DS tokens |
| 1 | Identity + catalog + pharmacy masters | Browse catalog, pharmacy staff inventory, no live paid orders |
| 2 | Orders + pay + ledger + delivery | Paid OTC/Rx order, refund, journal balanced, rider POD |
| 3 | Marketplace | Vendor KYC, listing, commission, vendor settlement |
| 4 | Doctor + video | Book, consult, consented EHR, digital Rx, doctor payable |
| 5 | Lab | Home collection CoC, pathologist sign, digital + physical report |
| 6 | Logistics expansion | Multi-job optimization, COD maturity, SLA tooling |
| 7 | CRM + affiliate + loyalty | 360, campaigns, country-gated commissions |
| 8 | ERP + analytics | Period close, warehouse BI |
| 9 | Globalization | Second country via packs, not a fork |
| 10 | Scale | Extract services only if evidence requires |

---

## 10. Confirmed architectural decisions

| Decision | Choice |
| --- | --- |
| Architecture style | Modular monolith (NestJS + TypeScript), extract later |
| Mobile | React Native, one workspace, separate store listings |
| Web | Next.js (customer + partner + one admin) |
| OLTP | PostgreSQL 16, UUID v7, integer money, `country_id` + RLS |
| Cache / jobs | Redis + BullMQ; Kafka later if needed |
| Search | OpenSearch; no clinical notes in index |
| Video | LiveKit SFU; recording **default false** + consent |
| Chat | Platform chat is source of truth |
| Payments | Adapter orchestration; no PAN/CVV on platform |
| Ledger | Immutable journal; reversing entries only; from Phase 2 |
| Health access | ConsentGrant required; support no clinical payload by default |
| Tenancy | Shared DB now; residency pin/split when legally required |
| Infra start | Containers + managed Postgres/Redis; not Kubernetes day one |
| Cloud | AWS default (**OD-CLOUD-01** still open); single cloud |
| Time / money | UTC storage; never destroy original transaction currency |

---

## 11. Open decisions (must-read)

The living catalog is [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md). Nothing below replaces that file.

**Phase 0 board (close or explicitly defer)** — IDs from [35](35_OPEN_DECISIONS.md) §10:

| ID | Topic |
| --- | --- |
| OD-ARCH-01 | Modular monolith boundaries (confirmed — implement) |
| OD-CLOUD-01 | AWS vs GCP |
| OD-ORCH-01 | Container orchestrator (not Kubernetes day one) |
| OD-MONO-01 | Nx vs Turborepo |
| OD-CI-01 | CI provider |
| OD-SEC-05 | Secrets manager |
| OD-CDN-01 | CDN / WAF |
| OD-OBS-01 | Telemetry vendor |
| OD-COUNTRY-01 | First launch country (region; legal may still be TBD) |
| OD-BRAND-01 | Legal brand (does not block code; blocks store listing) |

**Later blockers (not Phase 0 code, but live traffic):** OD-PAY-01 merchant of record before Phase 2 go-live; OD-PAY-05 wallet; OD-EHR-01 controller vs processor; OD-VID-01 video hosting; OD-LAB-02 lab billing trigger.

**Do not invent:** pharmacy licensing, telemedicine rules, e-Rx validity, lab accreditation, medicine advertising, referral/kickback, stored-value, WhatsApp, recording, data-retention clocks.

---

## 12. Risks (headline)

Full register: [34_RISK_REGISTER.md](34_RISK_REGISTER.md).

| ID | Risk |
| --- | --- |
| R-SEC-PHI | Healthcare data breach |
| R-PAY-RECON | Payment / ledger reconciliation breaks |
| R-LAB-COC | Sample chain of custody break |
| R-CARE-LIAB | Teleconsult / recording / cross-border liability |
| R-MKT-AUTH | Marketplace medicine authenticity |
| R-GLOB-REWRITE | Country fork / India-hardcoded rewrite pressure |
| R-ARCH-MS | Premature microservices |
| R-VID-LOCK | Video vendor/TURN/quality |
| R-NTF-WA | WhatsApp assumed globally |

---

## 13. User journeys (index)

| ID | Journey | Primary docs |
| --- | --- | --- |
| J01 | Customer buys medicine | [05](05_CUSTOMER_PLATFORM.md), [06](06_PHARMACY_PLATFORM.md) |
| J02 | Customer uploads prescription | [05](05_CUSTOMER_PLATFORM.md), [06](06_PHARMACY_PLATFORM.md) |
| J03 | Customer orders from vendor | [07](07_VENDOR_PLATFORM.md) |
| J04 | Customer tracks medicine delivery | [11](11_LOGISTICS_PLATFORM.md) |
| J05 | Customer books doctor | [08](08_DOCTOR_PLATFORM.md) |
| J06 | Customer attends video consultation | [08](08_DOCTOR_PLATFORM.md) |
| J07 | Doctor creates prescription | [08](08_DOCTOR_PLATFORM.md), [16](16_HEALTH_RECORD.md) |
| J08 | Customer orders prescribed medicine | [05](05_CUSTOMER_PLATFORM.md), [06](06_PHARMACY_PLATFORM.md) |
| J09 | Customer books lab test | [09](09_LAB_PLATFORM.md) |
| J10 | Phlebotomist collects sample | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| J11 | Sample reaches lab | [09](09_LAB_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md) |
| J12 | Pathologist approves report | [09](09_LAB_PLATFORM.md) |
| J13 | Customer receives digital report | [16](16_HEALTH_RECORD.md) |
| J14 | Customer requests hard copy | [09](09_LAB_PLATFORM.md) |
| J15 | Hard copy is delivered | [11](11_LOGISTICS_PLATFORM.md) |
| J16 | Customer receives refund | [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md) |
| J17 | Affiliate receives commission | [14](14_AFFILIATE_PLATFORM.md) |
| J18 | Vendor receives settlement | [13](13_LEDGER_SETTLEMENT.md), [07](07_VENDOR_PLATFORM.md) |
| J19 | Doctor receives settlement | [13](13_LEDGER_SETTLEMENT.md), [08](08_DOCTOR_PLATFORM.md) |
| J20 | Lab receives settlement | [13](13_LEDGER_SETTLEMENT.md), [09](09_LAB_PLATFORM.md) |
| J21 | Delivery partner receives earnings | [13](13_LEDGER_SETTLEMENT.md), [11](11_LOGISTICS_PLATFORM.md) |
| J22 | Partner joins (any type) | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |

Narrative + failures: [02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) §6. UX: [25](25_UI_UX_ARCHITECTURE.md). Tests: [31](31_TESTING_STRATEGY.md).

---

## 14. Requirement traceability matrix

Every major product requirement maps to module, apps, services, data, API, UI, security, and tests. Detail lives in the linked docs; this matrix prevents silent dropouts.

| Req | Requirement | Module | Applications | Backend | Entities (core) | API domain | UI | Security | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-ID | Identity, registration, login, OTP, social (gated), MFA | identity, iam | All | identity, iam | User, Account, Device, Session, Membership | Auth, Users | Auth screens all apps | Tokens, MFA, device bind | Auth e2e, OTP brute-force |
| REQ-CUST | Customer super app | order, catalog, health, … | APP-CUS-M/W | multiple | CustomerProfile, Address, Cart | Customers | [05](05_CUSTOMER_PLATFORM.md) | self scope | J01–J16 |
| REQ-PHARM | Own pharmacy ERP-lite | inventory, order, prescription | APP-PHARM, APP-ADM | inventory, order, prescription | Location, InventoryLot, Order, Prescription | Pharmacy, Inventory, Orders, Prescription | Pharmacy + admin | location scope, Rx access | Order + Rx machines |
| REQ-VEND | Vendor marketplace | party, catalog, inventory, settlement | APP-VEND, APP-ADM | party, catalog, settlement | Organization, Offer, Commission | Vendors, Catalog | Vendor portal | org isolation, KYC | J03, J18 |
| REQ-ORD | Orders, tracking, returns | order, logistics | APP-CUS, PHARM, VEND, DEL, ADM | order, logistics | Order, OrderItem, Fulfillment | Orders, Logistics | Cart, tracking | idempotency | J01–J04, J08 |
| REQ-RX | Upload, verify, digital Rx | prescription, health | APP-CUS, PHARM, DOC | prescription, health | Prescription, HealthArtifact | Prescription | Upload, Rx desk, doctor Rx | PHI encrypt, consent | J02, J07, J08 |
| REQ-DOC | Doctor discovery, booking | care, catalog | APP-CUS, APP-DOC | care | DoctorProfile, Slot, Appointment | Doctor, Appointment | Discovery, calendar | license KYC, country | J05 |
| REQ-VID | Video/audio/chat | video, care | APP-CUS, APP-DOC | video | VideoSession, Encounter | Video | Waiting room, consult | consent, recording off | J06, reconnect |
| REQ-LAB | Lab marketplace + LIMS-lite | diagnostics | APP-CUS, APP-LAB-W/S, APP-PATH | diagnostics | LabTest, LabBooking, Sample, Report | Lab, Test, Sample, Report | Catalog, lab portal | SoD enter vs sign | J09–J13 |
| REQ-PHE | Phlebotomist jobs | diagnostics, logistics | APP-PHE | diagnostics, logistics | LogisticsJob (SAMPLE_COLLECTION), SampleEvent | Sample, Logistics | Phlebo app | identity hard-stop | J10 |
| REQ-PATH | Pathologist workflow | diagnostics | APP-PATH | diagnostics | LabResult, Report | Report | Pathologist portal | digital sign, audit | J12 |
| REQ-REP | Digital + physical reports | diagnostics, health, logistics | APP-CUS, LAB, DEL | diagnostics, health, logistics | Report, PrintRequest, Job REPORT_DELIVERY | Report, Logistics | Reports, print, tracking | artifact ACL | J13–J15 |
| REQ-LOG | Multi-type logistics | logistics | APP-DEL, OPS | logistics | LogisticsJob, JobEvent | Logistics | Rider + ops dispatch | geo privacy, OTP | J04, J10, J11, J15, J21 |
| REQ-PAY | Multi-gateway payments | payment | APP-CUS, FIN | payment | CheckoutSession, PaymentIntent, GatewayWebhook | Payment | Checkout | PCI via PSP, webhooks | Pay success/fail, replay |
| REQ-FX | Multi-currency | payment, ledger | APP-CUS, FIN | payment, ledger | FxRate, amounts+currency on money rows | Payment, Ledger | Currency display | original currency retained | FX refund cases |
| REQ-WAL | Wallet | wallet | APP-CUS, FIN | wallet, ledger | Wallet, WalletTxn | Wallet | Wallet | step-up, country gate | Credit/debit/idempotency |
| REQ-LED | Ledger + settlement | ledger, settlement | APP-FIN | ledger, settlement | LedgerAccount, JournalEntry, SettlementBatch | Ledger, Settlement | Finance admin | immutable journal, dual control | Posting examples, recon |
| REQ-AFF | Affiliate | affiliate | APP-CUS, ADM | affiliate | Affiliate, ReferralAttribution, Commission | Affiliate | Referral, dashboards | fraud, clinical OFF default | J17 |
| REQ-CRM | CRM + lifecycle | crm, support | APP-CRM | crm, support | Segment, Campaign, Ticket | CRM, Support | CRM shells | no clinical payload default | Abandoned cart, tickets |
| REQ-EHR | Health record + consent | health | APP-CUS, DOC | health | HealthArtifact, ConsentGrant | (health via customers/doctor) | Timeline, share | consent reload, encrypt | Consent revoke, break-glass |
| REQ-ADM | Admin ERP | all read/write per IAM | APP-ADM | all | Config, CMS, AuditLog | Compliance, Analytics, … | Admin IA | break-glass, SoD | Permission tests |
| REQ-RBAC | RBAC + scopes | iam | All | iam | Role, Permission, Membership | Authz on every route | Permission empty states | [03](03_USER_ROLES_AND_PERMISSIONS.md) | Scope isolation |
| REQ-I18N | Globalization | compliance + all | All | compliance | Country, PolicyPack, translations | Compliance (public subset) | Locale, RTL later | residency | Pack-gated features |
| REQ-CMP | Compliance framework | compliance | APP-ADM | compliance | KycCase, LegalHold, retention | Compliance | KYC queues, holds | audit export | KYC machine |
| REQ-NOT | Notifications | notification | All | notification | Notification, Template, Preference | Notifications | In-app inbox, prefs | PII-minimized SMS | Template locale |
| REQ-SRCH | Global search | search | APP-CUS | search | OpenSearch indexes | Search | Home search | no clinical notes | Typo, geo, filters |
| REQ-ANL | Analytics / BI | analytics | APP-ADM | analytics | Event sink, later warehouse | Analytics | Dashboards | no PHI in warehouse default | Event completeness |
| REQ-SEC | Security baseline | identity, iam, compliance | All | all | AuditLog, secrets | all | MFA, device mgmt | [27](27_SECURITY_ARCHITECTURE.md) | Abuse, replay, RLS |
| REQ-SUP | Customer support | support | APP-CUS, APP-CRM | support | Ticket | Support | Tickets | masked PII | Ticket SLA |
| REQ-OBS | Observability | (platform) | n/a | platform | — | n/a | n/a | audit vs app logs | Alert routes |
| REQ-PTR-001 | Central partner onboarding | partner, party, identity | APP-JOIN-W, type apps, APP-ADM | partner, party, identity | Partner, PartnerApplication | Partner | Join wizard | aud isolation, SoD | State machine tests |
| REQ-PTR-002 | Partner type selection | partner | APP-JOIN-W | partner | PartnerType | Partner | Type picker | pack-gated types | Disabled type hidden |
| REQ-PTR-003 | KYC/document workflow | partner, compliance | APP-JOIN, APP-ADM | partner, compliance | PartnerDocument, KycCase | Partner, Compliance | Upload, reviewer | KYC ACL, encryption | Resubmit versions |
| REQ-PTR-004 | Partner verification | partner, compliance | APP-ADM | partner, compliance | PartnerApplication VERIFIED | Partner admin | Verify action | dual control pack | Cannot self-verify |
| REQ-PTR-005 | Approval/rejection | partner | APP-ADM | partner | PartnerStatusHistory | Partner admin | Approve/reject | SoD vs submit | Reason required |
| REQ-PTR-006 | Partner dashboard | type modules | Type apps | domain modules | type profiles | type APIs | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §14 | membership scope | Permission empty |
| REQ-PTR-007 | Organization/staff model | iam, party | Type web | iam, party | Organization, Membership, Location | Partner org/members | Staff admin | org RLS | Invite least privilege |
| REQ-PTR-008 | Partner invitations | partner | Type web, APP-JOIN | partner | PartnerInvitation | Partner invitations | Invite/accept | token hash, expiry | Expired token |
| REQ-PTR-009 | Country-specific onboarding | compliance, partner | APP-JOIN | compliance, partner | PolicyPack.partner_types | Public requirements | Pack-driven forms | empty pack cannot ACTIVE regulated | Cross-country no leak |
| REQ-LAB-001 | Physical report delivery | diagnostics, logistics, payment | APP-CUS, APP-LAB-W, APP-DEL | diagnostics, logistics, payment | PrintRequest, LogisticsJob REPORT_DELIVERY | Report, Logistics | Request copy, track, OTP | rider no PDF | J14–J15, reprint |
| REQ-PAY-001 | Multi-gateway payment | payment | APP-CUS, FIN | payment | PaymentIntent, GatewayWebhook | Payment | Checkout | PCI via PSP, fallback | Failover without double capture |
| REQ-PAY-002 | Multi-currency payment | payment, ledger | APP-CUS, FIN | payment, ledger | FxRate, money+currency | Payment | Currency display | original currency retained | FX refund cases |

---

## 15. State machines (index)

| Machine | Document |
| --- | --- |
| Order / return / refund flags | [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| Prescription verification | [06](06_PHARMACY_PLATFORM.md) |
| Appointment / encounter / video | [08](08_DOCTOR_PLATFORM.md) |
| Lab booking + **sample lifecycle (full transitions)** | [09](09_LAB_PLATFORM.md) |
| Physical report | [09](09_LAB_PLATFORM.md) §12, [11](11_LOGISTICS_PLATFORM.md) |
| Logistics job | [11](11_LOGISTICS_PLATFORM.md) |
| PaymentIntent / refund | [12](12_PAYMENT_PLATFORM.md) |
| Settlement batch | [13](13_LEDGER_SETTLEMENT.md) |
| Affiliate commission | [14](14_AFFILIATE_PLATFORM.md) |
| KYC case | [19](19_COMPLIANCE_FRAMEWORK.md) |
| Partner application | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) |
| Support ticket | [15](15_CRM_PLATFORM.md) |
| Consent grant | [16](16_HEALTH_RECORD.md) |

---

## 16. Events (index)

Canonical list and payload contracts: [22_EVENT_ARCHITECTURE.md](22_EVENT_ARCHITECTURE.md).

Minimum set: `ORDER_CREATED`, `ORDER_PAID`, `ORDER_CANCELLED`, `DELIVERY_ASSIGNED`, `DELIVERY_COMPLETED`, `APPOINTMENT_BOOKED`, `CONSULTATION_STARTED`, `PRESCRIPTION_CREATED`, `LAB_BOOKED`, `SAMPLE_COLLECTED`, `SAMPLE_RECEIVED`, `REPORT_GENERATED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `REFUND_CREATED`, `SETTLEMENT_CREATED`, `AFFILIATE_CONVERSION`, plus `RX_VERIFIED`, `JOB_FAILED`, `CONSENT_REVOKED`, `REPORT_PRINTED`, `PARTNER_REGISTERED`, `PARTNER_APPROVED`, `PARTNER_DOCUMENT_REJECTED`, and others in that book.

Transport: **transactional outbox → BullMQ** now; Kafka later if volume/isolation requires.

---

## 17. Blueprint completion checklist

Verified against the original master brief. Each item is covered in the linked document (not merely named).

| # | Requirement | Covered in | Status |
| --- | --- | --- | --- |
| 1 | Major product requirements | This matrix + [02](02_BUSINESS_ARCHITECTURE.md) | Done |
| 2 | Every application | §4, [04](04_APPLICATION_ARCHITECTURE.md), [25](25_UI_UX_ARCHITECTURE.md) | Done |
| 3 | Every user role | [03](03_USER_ROLES_AND_PERMISSIONS.md) | Done |
| 4 | Major workflows + failures | [02](02_BUSINESS_ARCHITECTURE.md) §6, domain books | Done |
| 5 | Own pharmacy | [06](06_PHARMACY_PLATFORM.md) | Done |
| 6 | Vendor marketplace | [07](07_VENDOR_PLATFORM.md) | Done |
| 7 | Doctor ecosystem | [08](08_DOCTOR_PLATFORM.md) | Done |
| 8 | Video consultation (recording not assumed) | [08](08_DOCTOR_PLATFORM.md) | Done |
| 9 | Lab platform | [09](09_LAB_PLATFORM.md) | Done |
| 10 | Home collection | [09](09_LAB_PLATFORM.md), [10](10_PHLEBOTOMIST_PLATFORM.md) | Done |
| 11 | Phlebotomist | [10](10_PHLEBOTOMIST_PLATFORM.md) | Done |
| 12 | Pathologist | [09](09_LAB_PLATFORM.md) | Done |
| 13 | Digital reports | [09](09_LAB_PLATFORM.md), [16](16_HEALTH_RECORD.md) | Done |
| 14 | Physical report delivery | [09](09_LAB_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md) | Done |
| 15 | Delivery partner system | [11](11_LOGISTICS_PLATFORM.md) | Done |
| 16 | Payments | [12](12_PAYMENT_PLATFORM.md) | Done |
| 17 | Multiple gateways | [12](12_PAYMENT_PLATFORM.md) | Done |
| 18 | Multi-currency | [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md) | Done |
| 19 | Affiliate | [14](14_AFFILIATE_PLATFORM.md) | Done |
| 20 | CRM | [15](15_CRM_PLATFORM.md) | Done |
| 21 | Health records + consent | [16](16_HEALTH_RECORD.md) | Done |
| 22 | Globalization | [18](18_GLOBALIZATION.md) | Done |
| 23 | Security | [27](27_SECURITY_ARCHITECTURE.md) | Done |
| 24 | Compliance architecture (no invented law) | [19](19_COMPLIANCE_FRAMEWORK.md) | Done |
| 25 | Database architecture | [20](20_DATABASE_ARCHITECTURE.md) | Done |
| 26 | API architecture | [21](21_API_ARCHITECTURE.md) | Done |
| 27 | Event architecture | [22](22_EVENT_ARCHITECTURE.md) | Done |
| 28 | UI/UX architecture (no visual UI built) | [25](25_UI_UX_ARCHITECTURE.md), [26](26_DESIGN_SYSTEM_SPEC.md) | Done |
| 29 | Development roadmap | [33](33_DEVELOPMENT_ROADMAP.md) | Done |
| 30 | Requirement traceability | This §14 | Done |
| 31 | Notifications | [23](23_NOTIFICATION_ARCHITECTURE.md) | Done |
| 32 | Search | [24](24_SEARCH_ARCHITECTURE.md) | Done |
| 33 | Ledger and settlements | [13](13_LEDGER_SETTLEMENT.md) | Done |
| 34 | Observability, testing, DevOps | [30](30_OBSERVABILITY.md)–[32](32_DEVOPS_CICD.md) | Done |
| 35 | Risks + open decisions | [34](34_RISK_REGISTER.md), [35](35_OPEN_DECISIONS.md) | Done |
| 36 | No premature production code | Repo is docs-only (+ this index README) | Done |
| 37 | Central partner onboarding engine | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) | Done (audit 2) |
| 38 | Physical report delivery explicit | [09](09_LAB_PLATFORM.md) §12, REQ-LAB-001 | Done |
| 39 | Multi-gateway + multi-currency payments | [12](12_PAYMENT_PLATFORM.md), REQ-PAY-001/002 | Done |
| 40 | Phase 0 decision board + classification | [38](38_PHASE_0_DECISION_BOARD.md) | Done |
| 41 | Phase 0 implementation plan (no code) | [39](39_PHASE_0_IMPLEMENTATION_PLAN.md) | Done |
| 42 | Partner dark model notes (Phase 0 Task 4) | [42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md) | Done |
| 43 | Ecosystem baseline lock + CR process | [43](43_ECOSYSTEM_BASELINE_LOCK.md) | Done |
| 44 | Event outbox / BullMQ foundation (Phase 0 Task 5) | [44](44_EVENT_IMPLEMENTATION_NOTES.md) | Done |
| 45 | Security / observability foundation (Phase 0 Task 6) | [45](45_SECURITY_OBSERVABILITY_IMPLEMENTATION_NOTES.md) | Done |
| 46 | Design system foundation (Phase 0 Task 7) | [46](46_DESIGN_SYSTEM_IMPLEMENTATION_NOTES.md) | Done |
| 47 | CI/CD + production-readiness (Phase 0 Task 8) | [47](47_CICD_PRODUCTION_READINESS_IMPLEMENTATION_NOTES.md) | Done |
| 48 | Application shells (Phase 0 Task 9) | [48](48_APPLICATION_SHELL_IMPLEMENTATION_NOTES.md) | Done |
| 49 | Phase 0 final audit / human sign-off pack | [49](49_PHASE_0_FINAL_AUDIT.md) | Done (engineering); human approval pending |
| 50 | Phase 1 Commerce / Store blueprint | [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) | Done (design) |
| 51 | Phase 1A Catalog + Pricing implementation | [51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md) | Done (1A only) |
| 52 | Phase 1B inventory + warehouse implementation plan | [52](52_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION_PLAN.md) | Plan |
| 53 | Phase 1B inventory + warehouse implementation | [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) | Done (1B only) |
| 54 | Phase 1C cart + checkout implementation plan | [54](54_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION_PLAN.md) | Plan |
| 55 | Phase 1C cart + checkout implementation | [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) | Done (1C only) |
| 56 | Phase 1D global multi-gateway payment implementation plan | [56](56_PHASE_1D_PAYMENT_IMPLEMENTATION_PLAN.md) | Plan |
| 57 | Phase 1D payment implementation (sandbox) | [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) | Done (sandbox only) |
| 58 | Phase 1E orders + fulfillment implementation plan | [58](58_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION_PLAN.md) | Plan |
| 59 | Phase 1E orders + fulfillment implementation | [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) | Done (sandbox pay; no DHL) |
| 60 | Phase 1F global logistics + carrier implementation plan | [60](60_PHASE_1F_LOGISTICS_CARRIER_IMPLEMENTATION_PLAN.md) | Plan |
| 61 | Phase 1F logistics + mock carrier implementation | [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) | Done (mock only; no live DHL) |
| 62 | Phase 1G settlement + ledger + profitability plan | [62](62_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_PLAN.md) | Plan |
| 63 | Phase 1G settlement + ledger + profitability implementation | [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) | Done (sandbox/mock payout only) |
| 64 | Phase 2 Healthcare Ecosystem master plan | [64](64_PHASE_2_MASTER_PLAN.md) | Plan only |
| 65 | Doctor / clinic / hospital ecosystem | [65](65_DOCTOR_ECOSYSTEM.md) | Plan |
| 66 | Telemedicine / video | [66](66_TELEMEDICINE_VIDEO.md) | Plan |
| 67 | Prescription ecosystem | [67](67_PRESCRIPTION_ECOSYSTEM.md) | Domain plan; execution → [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) |
| 68 | Lab ecosystem | [68](68_LAB_ECOSYSTEM.md) | Plan |
| 69 | Sample collection + chain of custody | [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) | Plan |
| 70 | Pathology + reporting | [70](70_PATHOLOGY_REPORTING.md) | Plan |
| 71 | Health record + consent | [71](71_HEALTH_RECORD_CONSENT.md) | Plan |
| 72 | Healthcare CRM | [72](72_HEALTHCARE_CRM.md) | Plan |
| 73 | Healthcare payments / settlement | [73](73_HEALTHCARE_PAYMENTS_SETTLEMENT.md) | Plan |
| 74 | Healthcare logistics | [74](74_HEALTHCARE_LOGISTICS.md) | Plan |
| 75 | Healthcare security / compliance | [75](75_HEALTHCARE_SECURITY_COMPLIANCE.md) | Plan |
| 76 | Healthcare database (logical) | [76](76_HEALTHCARE_DATABASE.md) | Plan |
| 77 | Healthcare API + events | [77](77_HEALTHCARE_API_EVENTS.md) | Plan |
| 78 | Healthcare UI/UX / app IA | [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md) | Plan |
| 79 | Healthcare test strategy | [79](79_HEALTHCARE_TEST_STRATEGY.md) | Plan |
| 80 | P2-HC roadmap | [80](80_PHASE_2_ROADMAP.md) | Plan |
| 81 | P2-HC open decisions | [81](81_PHASE_2_OPEN_DECISIONS.md) | Open |
| 82 | P2-HC risk register | [82](82_PHASE_2_RISK_REGISTER.md) | Plan |
| 83 | P2-HC-1 doctor foundation implementation | [83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md) | Done (foundation only) |
| 84 | P2-HC-2 appointment + consultation implementation | [84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md) | Done (no video/Rx) |
| 86 | Company-owned admin authority | [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md) | Done (security amendment) |
| 87 | Global MNC retrofit audit | [87](87_GLOBAL_MNC_RETROFIT_AUDIT.md) | Done (additive retrofit) |
| 88 | Global application topology | [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) | Done (topology + guards; not go-live) |
| 89 | Company governance and authorization | [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) | Done (hierarchy + isolation tests) |
| 92 | Final ecosystem completeness audit | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) | Done (CR-ECO-92 docs only; no code) |
| 93 | Global implementation roadmap | [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) | Done (CR-ROAD-93 docs only; no code) |
| 94 | R3 partner operations clients plan | [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md) | Plan (superseded for scope by 98) |
| 98 | R3 partner operations implementation | [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md) | Done (CR-R3-HARDEN-99 functional) |
| 95 | Global current-state audit | [95](95_GLOBAL_CURRENT_STATE_AUDIT.md) | Audit only; no implementation |
| 96 | Multi-tenant RLS retrofit plan | [96](96_MULTI_TENANT_RLS_RETROFIT_PLAN.md) | Plan; implemented by 97 |
| 97 | Multi-tenant RLS retrofit implementation | [97](97_MULTI_TENANT_RLS_RETROFIT_IMPLEMENTATION.md) | Done (sandbox RLS) |
| 100 | Global UI/UX completeness audit | [100](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md) | Audit only (CR-UI-AUDIT-100; no code) |
| 101 | Pre-R4 foundation hardening | [101](101_PRE_R4_FOUNDATION_IMPLEMENTATION.md) | Done (CR-PRE-R4-FOUNDATION-101) |
| 103 | Pre-R4 engineering blockers | [103](103_PRE_R4_ENGINEERING_BLOCKERS_IMPLEMENTATION.md) | Done (CR-R4-PREP-103) |
| 105 | Pre-R4 final engineering blockers | [105](105_PRE_R4_ENGINEERING_BLOCKERS_IMPLEMENTATION.md) | Done (CR-PRE-R4-FIX-105) |
| 106 | R4 telemedicine implementation plan | [106](106_R4_TELEMEDICINE_IMPLEMENTATION_PLAN.md) | Plan ready (CR-R4-AUTH-106) |
| 107 | R4 telemedicine sandbox implementation | [107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md) | Done (CR-R4-IMPL-107); **sandbox only — production NOT enabled** |
| 108 | Post-R4 sandbox + ecosystem audit | [108](108_POST_R4_ECOSYSTEM_AUDIT.md) | Audit only (CR-POST-R4-AUDIT-108); **ECOSYSTEM_AUDIT_WITH_BLOCKERS** |
| 109 | Post-R4 ecosystem hardening | [109](109_POST_R4_ECOSYSTEM_HARDENING.md) | Done (CR-POST-R4-FIX-109); **ECOSYSTEM_HARDENING_WITH_BLOCKERS** — R5 NOT authorized |
| 110 | Global pre-R5 readiness audit | [110](110_PRE_R5_READINESS_AUDIT.md) | Gate only (CR-PRE-R5-GATE-110); **PRE_R5_GREEN** — does **not** authorize R5 coding |
| 111 | R5 Rx + pharmacy implementation plan | [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) | Plan only (CR-R5-AUTH-111); **R5_PLAN_READY** — does **not** authorize R5 coding |
| 112 | R5-A prescription foundation | [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) | Done (CR-R5-IMPL-112); **R5_A_IMPLEMENTED** — R5-B…F NOT authorized at time of 112 |
| 113 | R5-B prescribing UX plan | [113](113_R5_B_PRESCRIBING_UX_PLAN.md) | Plan (CR-R5-B-AUTH-113); coding authorized via **CR-R5-B-IMPL-114** |
| 114 | R5-B prescribing UX implementation | [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) | Done (CR-R5-B-IMPL-114); **R5_B_IMPLEMENTED** |
| 115 | R5-C pharmacy dispensing plan | [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) | Plan (CR-R5-C-AUTH-115); coding via **CR-R5-C-IMPL-116** |
| 116 | R5-C pharmacy dispensing implementation | [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) | Done (CR-R5-C-IMPL-116); **R5_C_IMPLEMENTED** |
| 117 | R5-D Order-from-Rx commercial handoff plan | [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) | Plan (CR-R5-D-AUTH-117); coding via **CR-R5-D-IMPL-118** |
| 118 | R5-D Order-from-Rx commercial handoff implementation | [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) | Done (CR-R5-D-IMPL-118); **R5_D_IMPLEMENTED** |
| 119 | R5-E refill / subscription plan | [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) | Plan (CR-R5-E-AUTH-119); coding via **CR-R5-E-IMPL-120** |
| 120 | R5-E refill / subscription implementation | [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md) | Done (CR-R5-E-IMPL-120); **R5_E_IMPLEMENTED** — **R5-F engineering kernel COMPLETE** (Aug 2026; sandbox only; live provider **HUMAN_BLOCKED** L-RX-01); see [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R5 |
| 121 | Post-R5 global ecosystem audit | [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) | Audit only (CR-POST-R5-FULL-ECOSYSTEM-AUDIT-121); **ECOSYSTEM_WITH_BLOCKERS** — R6 NOT started at audit time; **§22 R5-F reconciliation** updates kernel status |
| 122 | Pre-R6 global readiness audit | [122](122_PRE_R6_GLOBAL_READINESS_AUDIT.md) | Gate only (CR-PRE-R6-GATE-122); **PRE_R6_WITH_BLOCKERS** — **READY FOR R6 PLANNING**; does **not** authorize R6 coding |
| 123 | Pre-R6 blocker repair | [123](123_PRE_R6_BLOCKER_REPAIR_IMPLEMENTATION.md) | Done (CR-PRE-R6-REPAIR-123); **PRE_R6_BLOCKERS_CLOSED** claimed — superseded gate [124](124_PRE_R6_FINAL_VERIFICATION.md) |
| 124 | Pre-R6 final blocker verification | [124](124_PRE_R6_FINAL_VERIFICATION.md) | Gate only (CR-PRE-R6-VERIFY-124); **PRE_R6_WITH_BLOCKERS** at time of gate — P1-2 later closed by [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) |
| 125 | Pre-R6 test determinism fix | [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) | Done (CR-PRE-R6-DETERMINISM-FIX-125); **PRE_R6_DETERMINISTIC** — R6 NOT started |
| 126 | R6 Vendor / Marketplace implementation plan | [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) | Plan only (CR-R6-AUTH-126); **R6_PLAN_READY** — does **not** authorize R6 coding |
| 127 | Pre-R6-A implementation gate | [127](127_PRE_R6_A_IMPLEMENTATION_GATE.md) | Gate only (CR-PRE-R6-IMPLEMENTATION-GATE-127); **R6_A_READY_FOR_IMPLEMENTATION** — does **not** start R6-A coding |
| 128 | R6-A Vendor foundation implementation | [128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md) | Done (CR-R6-A-IMPL-128); **R6_A_IMPLEMENTED** — R6-B+ NOT started |
| 129 | Post-R6-A regression & R6-B readiness audit | [129](129_POST_R6_A_AUDIT.md) | Gate only (CR-POST-R6-A-AUDIT-129); **R6_A_GREEN_R6_B_READY** — R6-B NOT started |
| 130 | R6-B Vendor catalog & commercial UX | [130](130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md) | Done (CR-R6-B-IMPL-130); **R6_B_IMPLEMENTED** — R6-C+ NOT started |
| 131 | Post-R6-B regression & R6-C readiness audit | [131](131_POST_R6_B_AUDIT.md) | Gate only (CR-POST-R6-B-AUDIT-131); **R6_B_GREEN_R6_C_READY** — unlocked R6-C |
| 132 | R6-C Vendor inventory operations | [132](132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md) | Done (CR-R6-C-IMPL-132); **R6_C_IMPLEMENTED** — unlocked R6-D gate |
| 133 | Post-R6-C hygiene & R6-D readiness audit | [133](133_POST_R6_C_CODEBASE_HYGIENE_AND_R6_D_READINESS.md) | Gate only (CR-POST-R6-C-FILE-HYGIENE-133); **R6_C_GREEN_R6_D_READY** — unlocked R6-D |
| 134 | R6-D Vendor order detail & fulfillment | [134](134_R6_D_VENDOR_ORDER_FULFILLMENT_IMPLEMENTATION.md) | Done (CR-R6-D-IMPL-134); **R6_D_IMPLEMENTED** — unlocked R6-E gate |
| 135 | Post-R6-D regression & R6-E readiness audit | [135](135_POST_R6_D_AUDIT.md) | Gate only (CR-POST-R6-D-AUDIT-135); **R6_D_GREEN_R6_E_READY** — unlocked R6-E |
| 136 | R6-E Vendor settlements + support/notifications | [136](136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md) | Done (CR-R6-E-IMPL-136); **R6_E_IMPLEMENTED** — unlocked R6-F gate |
| 137 | Post-R6-E regression & R6-F readiness audit | [137](137_POST_R6_E_AUDIT.md) | Gate only (CR-POST-R6-E-AUDIT-137); **R6_E_GREEN_R6_F_READY** — unlocked R6-F |
| 138 | R6-F Vendor marketplace attestation + pack gates + acceptance | [138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md) | Done (CR-R6-F-IMPL-138); **R6_F_IMPLEMENTED** — final R6 vendor sub-phase |
| 139 | Post-R6 global ecosystem audit | [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) | Audit only (CR-POST-R6-GLOBAL-AUDIT-139); **ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING** — R7 NOT started |
| 140 | R7 Laboratory diagnostics implementation plan | [140](140_R7_IMPLEMENTATION_PLAN.md) | Plan only (CR-R7-AUTH-140); **R7_PLAN_READY** — R7 IMPL NOT started |
| 141 | R7-A Diagnostics foundation + Lab partner | [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) | Done (CR-R7-A-IMPL-141); **R7_A_IMPLEMENTED** — R7-B NOT started |
| 142 | Post-R7-A regression & UI completeness audit | [142](142_POST_R7_A_AUDIT.md) | Gate only (CR-POST-R7-A-AUDIT-142); **R7_A_GREEN_R7_B_READY** |
| 143 | R7-B Customer lab booking + sandbox payment | [143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md) | Done (CR-R7-B-IMPL-143); **R7_B_IMPLEMENTED** |
| 144 | R7-C Phlebotomist + SAMPLE_COLLECTION + CoC | [144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md) | Done (CR-R7-C-IMPL-144); **R7_C_IMPLEMENTED** — R7-D/E/F NOT started |
| 145 | R7-D Transport + accession + lab processing | [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) | Done (CR-R7-D-IMPL-145); **R7_D_IMPLEMENTED** — R7-E/F NOT started |
| 146 | R7-E Pathology + digital diagnostic report | [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) | Done (CR-R7-E-IMPL-146); **R7_E_IMPLEMENTED** — R7-F NOT started |
| 147 | Post-R7-E pathology + digital report audit | [147](147_POST_R7_E_PATHOLOGY_DIGITAL_REPORT_AUDIT.md) | Audit only (CR-POST-R7-E-AUDIT-147); **R7_E_WITH_BLOCKERS** — R7-F NOT started |
| 148 | R7-E audit blockers fix | [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) | Done (CR-R7-E-FIX-148); **R7_E_BLOCKERS_CLOSED** — R7-F NOT started |
| 149 | R7-F Physical report + sandbox finance plan | [149](149_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION_PLAN.md) | Plan (CR-R7-F-AUTH-149); **R7_F_PLAN_READY** |
| 150 | R7-F Physical report + sandbox finance implementation | [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md) | Done (CR-R7-F-IMPL-150); **R7_F_IMPLEMENTED** — **R7 COMPLETE** |
| 151 | Post-R7 global ecosystem audit (final) | [151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md) | Audit only (CR-POST-R7-GLOBAL-AUDIT-151); **R7_GLOBAL_WITH_BLOCKERS** — R8 NOT started |
| 152 | R7 global audit blockers fix | [152](152_R7_GLOBAL_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) | Done (CR-R7-GLOBAL-FIX-152); **R7_GLOBAL_BLOCKERS_CLOSED** — R8 NOT started |
| 153 | R7 final video regression fix | [153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) | Done (CR-R7-FINAL-VIDEO-FIX-153); **R7_FINAL_REGRESSION_GREEN** — R8 NOT started |
| 154 | Post-R7 final closure audit | [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) | Audit only (CR-POST-R7-FINAL-CLOSURE-154); **R7_CLOSED_R8_READY_FOR_PLANNING** — R8 coding NOT authorized |
| 155 | R8 Radiology / imaging implementation plan | [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) | Plan only (CR-R8-AUTH-155); **R8_PLAN_READY** — R8 IMPL NOT started |
| 156 | R8-A Radiology foundation implementation | [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md) | Done (CR-R8-A-IMPL-156); **R8_A_IMPLEMENTED** — R8-B/C/D/E/F NOT started |
| 157 | Post-R8-A audit | [157](157_POST_R8_A_AUDIT.md) | Audit only (CR-POST-R8-A-AUDIT-157); **R8_A_GREEN_R8_B_READY** — R8-B NOT started |
| 158 | R8-B Customer imaging booking + sandbox pay | [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) | Done (CR-R8-B-IMPL-158); **R8_B_IMPLEMENTED** — R8-C/D/E/F NOT started |
| 159 | Post-R8-B audit | [159](159_POST_R8_B_AUDIT.md) | Audit only (CR-POST-R8-B-AUDIT-159); **R8_B_WITH_BLOCKERS** — R8-C NOT started |
| 160 | R8-B RN parity fix | [160](160_R8_B_RN_PARITY_FIX_IMPLEMENTATION.md) | Done (CR-R8-B-FIX-160); **R8_B_BLOCKERS_CLOSED** — R8-C NOT started |
| 161 | Post-R8-B final re-audit | [161](161_POST_R8_B_FINAL_REAUDIT.md) | Audit only (CR-POST-R8-B-REAUDIT-161); **R8_B_GREEN_R8_C_READY** — R8-C NOT started |
| 162 | R8-C Radiology acquisition + technician workflow | [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md) | Done (CR-R8-C-IMPL-162); **R8_C_IMPLEMENTED** — R8-D/E/F NOT started |
| 163 | Post-R8-C audit | [163](163_POST_R8_C_AUDIT.md) | Audit only (CR-POST-R8-C-AUDIT-163); **R8_C_GREEN_R8_D_READY** — R8-D NOT started |
| 164 | R8-D Radiologist interpretation + SoD | [164](164_R8_D_RADIOLOGIST_INTERPRETATION_IMPLEMENTATION.md) | Done (CR-R8-D-IMPL-164); **R8_D_IMPLEMENTED** — R8-E/F NOT started |
| 165 | Post-R8-D audit | [165](165_POST_R8_D_AUDIT.md) | Audit only (CR-POST-R8-D-AUDIT-165); **R8_D_GREEN_R8_E_READY** — R8-E NOT started |
| 166 | R8-E Imaging digital report publication | [166](166_R8_E_IMAGING_REPORT_PUBLICATION_IMPLEMENTATION.md) | Done (CR-R8-E-IMPL-166); **R8_E_IMPLEMENTED** — R8-F NOT started |
| 167 | Post-R8-E audit | [167](167_POST_R8_E_AUDIT.md) | Audit only (CR-POST-R8-E-AUDIT-167); **R8_E_GREEN_R8_F_READY** |
| 168 | R8-F Physical imaging report delivery + sandbox finance | [168](168_R8_F_PHYSICAL_REPORT_DELIVERY_FINANCE_IMPLEMENTATION.md) | Done (CR-R8-F-IMPL-168); **R8_F_IMPLEMENTED** |
| 169 | Post-R8-F audit | [169](169_POST_R8_F_AUDIT.md) | Audit only (CR-POST-R8-F-AUDIT-169); **R8_F_GREEN_R9_READY_FOR_PLANNING** |
| 170 | R9 Health record + consent UX implementation plan | [170](170_R9_IMPLEMENTATION_PLAN.md) | Plan only (CR-R9-AUTH-170); **R9_PLAN_READY** — R9 IMPL NOT started |
| 171 | R9-A Health record kernel implementation | [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md) | Done (CR-R9-A-IMPL-171); **R9_A_IMPLEMENTED** — R9-B NOT started |
| 172 | Post-R9-A audit | [172](172_POST_R9_A_AUDIT.md) | Audit only (CR-POST-R9-A-AUDIT-172); **R9_A_GREEN_R9_B_READY** |
| 173 | R9-B Customer Health UI | [173](173_R9_B_CUSTOMER_HEALTH_UI_IMPLEMENTATION.md) | Done (CR-R9-B-IMPL-173); **R9_B_IMPLEMENTED** — R9-C NOT started |
| 174 | Post-R9-B audit | [174](174_POST_R9_B_AUDIT.md) | Audit only (CR-POST-R9-B-AUDIT-174); **R9_B_GREEN_R9_C_READY** |
| 175 | R9-C Consent scope enforcement | [175](175_R9_C_CONSENT_SCOPE_IMPLEMENTATION.md) | Done (CR-R9-C-IMPL-175); **R9_C_IMPLEMENTED** — R9-D NOT started |
| 176 | Post-R9-C audit | [176](176_POST_R9_C_AUDIT.md) | Audit only (CR-POST-R9-C-AUDIT-176); **R9_C_GREEN_R9_D_READY** |
| 177 | R9-D Doctor Health workflow | [177](177_R9_D_DOCTOR_HEALTH_IMPLEMENTATION.md) | Done (CR-R9-D-IMPL-177); **R9_D_IMPLEMENTED** — R9-E NOT started |
| 178 | Post-R9-D audit | [178](178_POST_R9_D_AUDIT.md) | Audit only (CR-POST-R9-D-AUDIT-178); **R9_D_GREEN_R9_E_READY** |
| 179 | R9-E Prescription health artifact projection | [179](179_R9_E_PRESCRIPTION_HEALTH_ARTIFACT_IMPLEMENTATION.md) | Done (CR-R9-E-IMPL-179); **R9_E_IMPLEMENTED** — R9-F NOT started |
| 180 | Post-R9-E audit | [180](180_POST_R9_E_AUDIT.md) | Audit only (CR-POST-R9-E-AUDIT-180); **R9_E_GREEN_R9_F_READY** |
| 181 | R9-F Health governance + break-glass | [181](181_R9_F_HEALTH_GOVERNANCE_IMPLEMENTATION.md) | Done (CR-R9-F-IMPL-181); **R9_F_IMPLEMENTED** — verified CR-R9-F-VERIFY-ENV-001 |
| 182 | Post-R9 final closure audit | [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) | Audit only (CR-POST-R9-F-AUDIT-182); **R9_GREEN_CLOSED_R10_READY_FOR_PLANNING** |
| 183 | R10 Care navigation implementation plan | [183](183_R10_IMPLEMENTATION_PLAN.md) | Plan only (CR-R10-PLANNING-183); **R10_PLAN_READY** |
| 184 | Post-R10 plan audit | [184](184_POST_R10_PLAN_AUDIT.md) | Audit only (CR-POST-R10-PLAN-AUDIT-184); **R10_PLAN_GREEN_R10_A_READY** |
| 185 | R10-A Care navigation kernel | [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md) | Done (CR-R10-A-IMPL-185); **R10_A_IMPLEMENTED** — R10-B NOT started |
| 187 | R10-B Customer Care Navigation UI | [187](187_R10_B_CUSTOMER_CARE_NAVIGATION_UI_IMPLEMENTATION.md) | Done (CR-R10-B-IMPL-187); **R10_B_IMPLEMENTED** — R10-C NOT started |
| 188 | Post-R10-B audit | [188](188_POST_R10_B_AUDIT.md) | Audit only (CR-POST-R10-B-AUDIT-188); **R10_B_GREEN_R10_C_READY** |
| 189 | R10-C Provider match + handoff | [189](189_R10_C_PROVIDER_MATCH_HANDOFF_IMPLEMENTATION.md) | Done (CR-R10-C-IMPL-189); **R10_C_IMPLEMENTED** — R10-D NOT started |
| 190 | Post-R10-C audit | [190](190_POST_R10_C_AUDIT.md) | Audit only (CR-POST-R10-C-AUDIT-190); **R10_C_GREEN_R10_D_READY** |
| 191 | R10-D Admin audit + override | [191](191_R10_D_ADMIN_OVERRIDE_IMPLEMENTATION.md) | Done (CR-R10-D-IMPL-191); **R10_D_IMPLEMENTED** — R10-E/F NOT started |
| 192 | Post-R10-D closure audit | [192](192_POST_R10_D_AUDIT.md) | Audit only (CR-POST-R10-D-AUDIT-192-REVERIFY); **R10_GREEN_CLOSED_R11_READY_FOR_PLANNING** |
| 193 | R11 CMS + Help Center + Support Desk plan | [193](193_R11_IMPLEMENTATION_PLAN.md) | Plan only (CR-R10-PLAN-R11-193); **R11_PLAN_READY** — R11 IMPL NOT started |
| 194 | Post-R11 plan audit | [194](194_POST_R11_PLAN_AUDIT.md) | Audit only (CR-POST-R11-PLAN-AUDIT-194); **R11_PLAN_GREEN_R11_A_READY** |
| 195 | R11-A CMS + Support backend kernel | [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) | Done (CR-R11-A-IMPL-195); **R11_A_IMPLEMENTED** — R11-B/C/D/E NOT started |
| 196 | Post-R11-A audit | [196](196_POST_R11_A_AUDIT.md) | Audit only (CR-POST-R11-A-AUDIT-196); **R11_A_GREEN_R11_B_READY** |
| 197 | R11-B Admin CMS UI | [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md) | Done (CR-R11-B-IMPL-197); **R11_B_IMPLEMENTED** — R11-C/D/E NOT started |
| 198 | Post-R11-B audit | [198](198_POST_R11_B_AUDIT.md) | Audit only (CR-POST-R11-B-AUDIT-198); **R11_B_GREEN_R11_C_READY** |
| 199 | R11-C Customer Help Center | [199](199_R11_C_CUSTOMER_HELP_CENTER_IMPLEMENTATION.md) | Done (CR-R11-C-IMPL-199); **R11_C_IMPLEMENTED** — R11-D/E NOT started |
| 200 | Post-R11-C audit | [200](200_POST_R11_C_AUDIT.md) | Audit only (CR-POST-R11-C-AUDIT-200); **R11_C_GREEN_R11_D_READY** |
| 201 | R11-D Support Desk agent UI | [201](201_R11_D_SUPPORT_DESK_IMPLEMENTATION.md) | Done (CR-R11-D-IMPL-201); **R11_D_IMPLEMENTED** — R11-E NOT started |
| 202 | Post-R11-D audit | [202](202_POST_R11_D_AUDIT.md) | Audit only (CR-POST-R11-D-AUDIT-202); **R11_D_GREEN_R11_E_READY** |
| 203 | R11-E closure / regression | [203](203_R11_E_CLOSURE_IMPLEMENTATION.md) | Done (CR-R11-E-IMPL-203); **R11_E_IMPLEMENTED** — R12 NOT started |
| 204 | Post-R11-E final closure audit | [204](204_POST_R11_E_AUDIT.md) | Audit only (CR-POST-R11-E-AUDIT-204); **R11_GREEN_CLOSED_R12_READY_FOR_PLANNING** |
| 205 | R12 CRM, marketing, loyalty, affiliate plan | [205](205_R12_IMPLEMENTATION_PLAN.md) | Plan only (CR-R12-PLAN-205); **R12_PLAN_READY** — R12 IMPL NOT started |
| 206 | Post-R12 plan audit | [206](206_POST_R12_PLAN_AUDIT.md) | Audit only (CR-POST-R12-PLAN-AUDIT-206); **R12_PLAN_GREEN_R12_A_READY** |
| 207 | R12-A CRM kernel + marketing prefs | [207](207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md) | Done (CR-R12-A-IMPL-207); **R12_A_IMPLEMENTED** — R12-B NOT started |
| 208 | Post-R12-A audit | [208](208_POST_R12_A_AUDIT.md) | Audit only (CR-POST-R12-A-AUDIT-208); **R12_A_GREEN_R12_B_READY** |
| 209 | R12-B marketing campaigns + consent-gated send | [209](209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md) | Done (CR-R12-B-IMPL-209); **R12_B_IMPLEMENTED** — R12-C NOT started |
| 210 | Post-R12-B audit | [210](210_POST_R12_B_AUDIT.md) | Audit only (CR-POST-R12-B-AUDIT-210); **R12_B_GREEN_R12_C_READY** |
| 211 | R12-C promo admin + checkout UX | [211](211_R12_C_PROMO_IMPLEMENTATION.md) | Done (CR-R12-C-IMPL-211); **R12_C_IMPLEMENTED** — R12-D NOT started |
| 212 | Post-R12-C audit | [212](212_POST_R12_C_AUDIT.md) | Audit only (CR-POST-R12-C-AUDIT-212); **R12_C_GREEN_R12_D_READY** |
| 213 | R12-D affiliate web + referral | [213](213_R12_D_AFFILIATE_IMPLEMENTATION.md) | Done (CR-R12-D-IMPL-213); **R12_D_IMPLEMENTED** — R12-E NOT started |
| 214 | Post-R12-D audit | [214](214_POST_R12_D_AUDIT.md) | Audit only (CR-POST-R12-D-AUDIT-214); **R12_D_GREEN_R12_E_READY** |
| 215 | R12-E wishlist + loyalty | [215](215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md) | Done (CR-R12-E-IMPL-215); **R12_E_IMPLEMENTED** — R12-F NOT started |
| 216 | Post-R12-E audit | [216](216_POST_R12_E_AUDIT.md) | Audit only (CR-POST-R12-E-AUDIT-216); **R12_E_GREEN_R12_F_READY** |
| 217 | R12-F reviews/Q&A + personalization | [217](217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md) | Done (CR-R12-F-IMPL-217); **R12_F_IMPLEMENTED** |
| 218 | Post-R12-F audit | [218](218_POST_R12_F_AUDIT.md) | Audit only (CR-POST-R12-F-AUDIT-218); **R12_F_GREEN_R12_G_READY** |
| 219 | R12-G refill/reorder marketing hooks | [219](219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md) | Done (CR-R12-G-IMPL-219); **R12_G_IMPLEMENTED** |
| 220 | Post-R12-G audit | [220](220_POST_R12_G_AUDIT.md) | Audit only (CR-POST-R12-G-AUDIT-220); **R12_G_GREEN_R12_H_READY** |
| 221 | R12-H closure / regression | [221](221_R12_H_CLOSURE_IMPLEMENTATION.md) | Done (CR-R12-H-IMPL-221); **R12_H_IMPLEMENTED** |
| 222 | Post-R12-H final closure audit | [222](222_POST_R12_H_AUDIT.md) | Audit only (CR-POST-R12-H-AUDIT-222); **R12_GREEN_CLOSED_R13_READY_FOR_PLANNING** |
| 223 | R13 search, recommendations, analytics/BI plan | [223](223_R13_IMPLEMENTATION_PLAN.md) | Plan only (CR-R13-PLAN-223); **R13_PLAN_READY** — R13-A implemented [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md) |
| 224 | Post-R13 plan audit | [224](224_POST_R13_PLAN_AUDIT.md) | Audit only (CR-POST-R13-PLAN-AUDIT-224); **R13_PLAN_GREEN_R13_A_READY** |
| 225 | R13-A search indexing kernel | [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md) | Done (CR-R13-A-IMPL-225); **R13_A_IMPLEMENTED** — R13-B NOT started |
| 226 | Post-R13-A audit | [226](226_POST_R13_A_AUDIT.md) | Audit only (CR-POST-R13-A-AUDIT-226); **R13_A_GREEN_R13_B_READY** |
| 227 | R13-B discovery API + customer UI | [227](227_R13_B_DISCOVERY_IMPLEMENTATION.md) | Done (CR-R13-B-IMPL-227); **R13_B_IMPLEMENTED** — R13-C NOT started |
| 228 | Post-R13-B audit | [228](228_POST_R13_B_AUDIT.md) | Audit only (CR-POST-R13-B-AUDIT-228); **R13_B_GREEN_R13_C_READY** |
| 229 | R13-C provider discovery indexes | [229](229_R13_C_PROVIDER_DISCOVERY_IMPLEMENTATION.md) | Done (CR-R13-C-IMPL-229); **R13_C_IMPLEMENTED** — R13-D NOT started |
| 230 | Post-R13-C audit | [230](230_POST_R13_C_AUDIT.md) | Audit only (CR-POST-R13-C-AUDIT-230); **R13_C_GREEN_R13_D_READY** |
| 231 | R13-D deterministic commerce recommendations | [231](231_R13_D_DETERMINISTIC_RECOMMENDATIONS_IMPLEMENTATION.md) | Done (CR-R13-D-IMPL-231); **R13_D_IMPLEMENTED** — R13-E NOT started |
| 232 | Post-R13-D audit | [232](232_POST_R13_D_AUDIT.md) | Audit only (CR-POST-R13-D-AUDIT-232); **R13_D_GREEN_R13_E_READY** |
| 233 | R13-E analytics foundation | [233](233_R13_E_ANALYTICS_FOUNDATION_IMPLEMENTATION.md) | Done (CR-R13-E-IMPL-233); **R13_E_IMPLEMENTED** — R13-F NOT started |
| 234 | Post-R13-E audit | [234](234_POST_R13_E_AUDIT.md) | Audit only (CR-POST-R13-E-AUDIT-234); **R13_E_GREEN_R13_F_READY** |
| 235 | R13-F admin analytics BI shell | [235](235_R13_F_ANALYTICS_BI_IMPLEMENTATION.md) | Done (CR-R13-F-IMPL-235); **R13_F_IMPLEMENTED** — R13-G NOT started |
| 236 | Post-R13-F audit | [236](236_POST_R13_F_AUDIT.md) | Audit only (CR-POST-R13-F-AUDIT-236); **R13_F_GREEN_R13_G_READY** |
| 237 | R13-G clinical/PHI search | [237](237_R13_G_CLINICAL_SEARCH_IMPLEMENTATION.md) | Done (CR-R13-G-IMPL-237); **R13_G_IMPLEMENTED** — R13-H NOT started |
| 238 | Post-R13-G audit | [238](238_POST_R13_G_AUDIT.md) | Audit only (CR-POST-R13-G-AUDIT-238); **R13_G_GREEN_R13_H_READY** |
| 239 | R13-H closure / regression | [239](239_R13_H_CLOSURE_IMPLEMENTATION.md) | Done (CR-R13-H-IMPL-239); **R13_H_IMPLEMENTED** |
| 240 | Post-R13-H final audit | [240](240_POST_R13_H_AUDIT.md) | Audit only (CR-POST-R13-H-AUDIT-240); **R13_GREEN_CLOSED** — R14 go-live gate next (human authorization) |
| 241 | Full project audit (pre-R14) | [241](241_FULL_PROJECT_AUDIT.md) | Audit only (CR-FULL-PROJECT-AUDIT-241); next: **CR-R14-PLAN-242** |
| 242 | R14 live finance & carriers plan | [242](242_R14_IMPLEMENTATION_PLAN.md) | Plan only (CR-R14-PLAN-242); **R14_PLAN_READY** — IMPL NOT authorized |
| 243 | Post-R14-plan audit | [243](243_POST_R14_PLAN_AUDIT.md) | Audit only (CR-POST-R14-PLAN-AUDIT-243); **R14_PLAN_GREEN** — next **CR-R14-A-IMPL-244** (human-gate hold) |
| 244 | R14-A live PSP implementation | [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md) | **BLOCKED** (CR-R14-A-IMPL-244); **R14_A_IMPLEMENTATION_BLOCKED** — human gates not evidenced |
| 245 | Pre-R14-A gate verification | [245](245_PRE_R14_A_GATE_VERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-245); **R14_A_GATES_BLOCKED** — all mandatory gates NOT EVIDENCED |
| 246 | Pre-R14-A gate re-verification | [246](246_PRE_R14_A_GATE_REVERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-246); **R14_A_GATES_BLOCKED** — no new evidence since Book 245 |
| 247 | R14-A human gate evidence intake | [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) | Evidence intake (CR-247…**252**); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; supply owner decisions |
| 248 | Pre-R14-A gate re-verification (post-intake) | [248](248_PRE_R14_A_GATE_REVERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-248); **R14_A_GATES_BLOCKED** — 0/7 gates evidenced |
| 250 | R14-A pre-implementation audit | [250](250_R14_A_PREIMPLEMENTATION_AUDIT.md) | Audit only (CR-R14-A-PREIMPLEMENTATION-AUDIT-250); **R14_A_ENGINEERING_READY_HUMAN_GATES_BLOCKED** |
| 251 | Pre-R14-A final gate verification | [251](251_PRE_R14_A_FINAL_GATE_VERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-251); **R14_A_GATES_BLOCKED** — 0/7; **CR-R14-A-IMPL-244 NOT authorized** |
| 253 | Full codebase ground-truth audit | [253](253_FULL_CODEBASE_AUDIT.md) | Audit only (CR-FULL-CODEBASE-AUDIT-253); **ECOSYSTEM_SANDBOX_COMPLETE_R14_A_NOT_STARTED** — 34 local migrations pending; mock-only payments |
| 254 | R14 pre-A engineering hygiene | [254](254_R14_PRE_A_ENGINEERING_HYGIENE.md) | Done (CR-R14-PRE-A-ENGINEERING-HYGIENE-254); **R14_PRE_A_HYGIENE_PARTIAL** — typecheck green, dev DB parity; 1 R13-B e2e DB-pollution flake |
| 255 | Pre-R14 full regression hygiene | [255](255_PRE_R14_FULL_REGRESSION_HYGIENE.md) | Done (CR-PRE-R14-FULL-REGRESSION-HYGIENE-255); **PRE_R14_REGRESSION_GREEN** — 230 tests pass; discovery e2e pollution fixed |
| 256 | Pre-R14-A final human gate verification | [256](256_PRE_R14_A_FINAL_GATE_VERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-256); **R14_A_GATES_BLOCKED** — 0/7; **CR-R14-A-IMPL-244 NOT authorized** |
| 257 | R14-A human gate evidence intake | [257](257_R14_A_HUMAN_GATE_EVIDENCE.md) | Evidence intake (CR-R14-A-HUMAN-GATE-EVIDENCE-257); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; no owner decisions supplied |
| 258 | R14-A gate blocker resolution | [258](258_R14_A_GATE_BLOCKER_RESOLUTION.md) | Blocker resolution (CR-R14-A-GATE-BLOCKER-RESOLUTION-258); **R14_A_HUMAN_GATES_STILL_BLOCKED** — 0/7; repo search found no authoritative evidence |
| 259 | R14-A engineering preparation | [259](259_R14_A_ENGINEERING_PREPARATION.md) | Done (CR-R14-A-ENGINEERING-PREP-259); **R14_A_ENGINEERING_PREP_COMPLETE** — PSP-neutral registry; human gates 0/7 unchanged |
| 260 | R14-A gate intake | [260](260_R14_A_GATE_INTAKE.md) | Gate intake (CR-R14-A-GATE-INTAKE-260); **R14_A_GATE_INTAKE_STILL_BLOCKED** — 0/7; owner must supply decisions |
| 261 | R14-A engineering hardening | [261](261_R14_A_ENGINEERING_HARDENING.md) | Done (CR-R14-A-ENGINEERING-HARDENING-261); **R14_A_ENGINEERING_HARDENING_COMPLETE** — idempotency/webhook/env fixes; human gates 0/7 unchanged |
| 262 | R14-A human gate resolution | [262](262_R14_A_HUMAN_GATE_RESOLUTION.md) | Gate resolution (CR-R14-A-HUMAN-GATE-RESOLUTION-262); **R14_A_HUMAN_GATES_STILL_BLOCKED** — 0/7; owner must supply decisions |
| 263 | R14-A human approval handoff | [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) | Handoff (CR-R14-A-HUMAN-APPROVAL-HANDOFF-263); **R14_A_WAITING_FOR_HUMAN_APPROVAL** — 0/7; stakeholder intake form |
| 264 | Pre-R14-A final human gate verification | [264](264_PRE_R14_A_FINAL_GATE_VERIFICATION.md) | Gate only (CR-PRE-R14-A-GATE-264); **R14_A_GATES_BLOCKED** — 0/7; **CR-R14-A-IMPL-244 NOT authorized** |
| 265 | R14-A human gate evidence intake | [265](265_R14_A_HUMAN_GATE_EVIDENCE.md) | Evidence intake (CR-R14-A-HUMAN-GATE-EVIDENCE-265); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; engineering on HOLD |
| 266 | R14-A human gate evidence intake | [266](266_R14_A_HUMAN_GATE_EVIDENCE.md) | Evidence intake (CR-R14-A-HUMAN-GATE-EVIDENCE-266); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; R14-A blocked |
| 267 | R14-A human gate evidence intake | [267](267_R14_A_HUMAN_GATE_EVIDENCE.md) | Evidence intake (CR-R14-A-HUMAN-GATE-EVIDENCE-267); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; waiting on human approval |
| 268 | R14-A engineering foundation | [268](268_R14_A_ENGINEERING_FOUNDATION.md) | Engineering (CR-R14-A-ENGINEERING-FOUNDATION-268); **ENGINEERING_FOUNDATION_COMPLETE**; human gates 0/7 unchanged |
| 269 | R14-A refund listener | [269](269_R14_A_REFUND_LISTENER_IMPLEMENTATION.md) | Engineering (CR-R14-A-REFUND-LISTENER-269); **R14_A_REFUND_LISTENER_COMPLETE** — verified [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md) |
| 270 | R14-A refund listener verification | [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md) | Verification (CR-R14-A-REFUND-LISTENER-VERIFY-270); **R14_A_REFUND_LISTENER_COMPLETE** — 72/72 tests pass; runtime healthy |
| 271 | R14-A order refund status | [271](271_R14_A_ORDER_REFUND_STATUS.md) | Engineering (CR-R14-A-ORDER-REFUND-STATUS-271); **R14_A_ORDER_REFUND_STATUS_COMPLETE** — PAYMENT_REFUNDED → order sync |
| 272 | R14-A payment webhook recon | [272](272_R14_A_PAYMENT_WEBHOOK_RECON.md) | Engineering (CR-R14-A-PAYMENT-WEBHOOK-RECON-272); **R14_A_PAYMENT_WEBHOOK_RECON_COMPLETE** — webhook idempotency + reconcile |
| 273 | R14-A payment admin observability | [273](273_R14_A_PAYMENT_ADMIN_OBSERVABILITY.md) | Engineering (CR-R14-A-PAYMENT-ADMIN-OBSERVABILITY-273); **R14_A_PAYMENT_ADMIN_OBSERVABILITY_COMPLETE** — admin webhook/recon/audit views |
| 274 | R14-A payment routing matrix | [274](274_R14_A_PAYMENT_ROUTING_MATRIX.md) | Engineering (CR-R14-A-PAYMENT-ROUTING-MATRIX-274); **R14_A_PAYMENT_ROUTING_MATRIX_COMPLETE** — sandbox routing matrix admin + policy alignment |
| 275 | R14-A payment sandbox failover | [275](275_R14_A_PAYMENT_SANDBOX_FAILOVER.md) | Engineering (CR-R14-A-PAYMENT-SANDBOX-FAILOVER-275); **R14_A_PAYMENT_SANDBOX_FAILOVER_COMPLETE** — checkout 409 fix, failover drill, attempt admin UI |
| 276 | R14-A checkout pay guard | [276](276_R14_A_PAYMENT_CHECKOUT_PAY_GUARD.md) | Engineering (CR-R14-A-PAYMENT-CHECKOUT-PAY-GUARD-276); **R14_A_PAYMENT_CHECKOUT_PAY_GUARD_COMPLETE** — block duplicate pay on captured checkout sessions |
| 277 | R14-A failed attempt audit | [277](277_R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT.md) | Engineering (CR-R14-A-PAYMENT-FAILED-ATTEMPT-AUDIT-277); **R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT_COMPLETE** — durable pre-submit failure audit survives HTTP rollback |
| 278 | R14-A failed reservation release | [278](278_R14_A_PAYMENT_FAILED_RESERVATION_RELEASE.md) | Engineering (CR-R14-A-PAYMENT-FAILED-RESERVATION-RELEASE-278); **R14_A_PAYMENT_FAILED_RESERVATION_RELEASE_COMPLETE** — release checkout inventory on pre-submit payment failure |
| 279 | R14-A checkout session state | [279](279_R14_A_PAYMENT_CHECKOUT_SESSION_STATE.md) | Engineering (CR-R14-A-PAYMENT-CHECKOUT-SESSION-STATE-279); **R14_A_PAYMENT_CHECKOUT_SESSION_STATE_COMPLETE** — align checkout session PAID/FAILED with payment outcomes |
| 280 | R14-A final code audit | [280](280_R14_A_FINAL_CODE_AUDIT.md) | Audit only (CR-R14-A-FINAL-CODE-AUDIT-280); **R14_A_ENGINEERING_COMPLETE** — code-first verification; sandbox kernel complete; human gates 0/7 |
| 281 | R14-A human gate evidence close | [281](281_R14_A_HUMAN_GATE_EVIDENCE_CLOSE.md) | Evidence intake (CR-R14-A-HUMAN-GATE-EVIDENCE-CLOSE-281); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7; no owner decisions supplied |
| 282 | R14-A production-readiness baseline | [282](282_R14_A_PRODUCTION_READINESS_BASELINE.md) | Baseline freeze (CR-R14-A-PRODUCTION-READINESS-BASELINE-282); **R14_A_PRODUCTION_BASELINE_COMPLETE_HUMAN_GATES_BLOCKED** — engineering frozen; human gates 0/7; CR-244 partially stale |
| 283 | R14-A human approval intake | [283](283_R14_A_HUMAN_APPROVAL_INTAKE.md) | Evidence intake (CR-R14-A-HUMAN-APPROVAL-INTAKE-283); **R14_A_HUMAN_GATES_INCOMPLETE** — 0/7; owner must supply all seven gate blocks |
| 284 | R14-B foundation audit | [284](284_R14_B_FOUNDATION_AUDIT.md) | Engineering (CR-R14-B-FOUNDATION-AUDIT-284); **R14_B_FOUNDATION_SLICE_COMPLETE** — refund/settlement + reconcile→finance fixes; r14b.reconciliation.e2e |
| 285 | R14-B settlement import port | [285](285_R14_B_SETTLEMENT_IMPORT_PORT.md) | Engineering (CR-R14-B-SETTLEMENT-IMPORT-PORT-285); **R14_B_SETTLEMENT_IMPORT_PORT_COMPLETE** — port/staging/pipeline/match/ledger; migrations 136–137; r14b.settlement-import.e2e 14/14 |
| 286 | R14-B payout execution ledger | [286](286_R14_B_PAYOUT_LEDGER.md) | Engineering (CR-R14-B-PAYOUT-LEDGER-286); **R14_B_PAYOUT_LEDGER_COMPLETE** — PAID→AP→clearing journal; idempotent; r14b.payout-ledger.e2e 12/12 |
| 287 | R14-B reconciliation break workflow | [287](287_R14_B_RECON_BREAK_WORKFLOW.md) | Engineering (CR-R14-B-RECON-BREAK-WORKFLOW-287); **R14_B_RECON_BREAK_WORKFLOW_COMPLETE** — unified break queue + OPEN→CLOSED workflow; migrations 138–140; r14b.recon-break.e2e 19/19 |
| 288 | R14-B settlement import worker | [288](288_R14_B_SETTLEMENT_IMPORT_WORKER.md) | Engineering (CR-R14-B-SETTLEMENT-IMPORT-WORKER-288); **R14_B_SETTLEMENT_IMPORT_WORKER_COMPLETE** — scheduled poll worker + port listAvailableBatches; migration 141; r14b.settlement-import-worker.e2e 22/22; regressions 76/76 |
| 289 | R14-B settlement schedule admin | [289](289_R14_B_SETTLEMENT_SCHEDULE_ADMIN.md) | Engineering (CR-R14-B-SETTLEMENT-SCHEDULE-ADMIN-289); **R14_B_SETTLEMENT_SCHEDULE_ADMIN_COMPLETE** — schedule CRUD + RLS writes; migration 142; r14b.settlement-schedule-admin.e2e 20/20; regressions 96/96 |
| 290 | R14-B break queue UI | [290](290_R14_B_BREAK_QUEUE_UI.md) | Engineering (CR-R14-B-BREAK-QUEUE-UI-290); **R14_B_BREAK_QUEUE_UI_COMPLETE** — finance-admin break queue filters/detail/history/actions; finance-admin.spec 17/17; R14-B regressions 91/91 |
| 291 | R14-B vendor payable partial refund | [291](291_R14_B_VENDOR_PAYABLE_PARTIAL_REFUND.md) | Engineering (CR-R14-B-VENDOR-PAYABLE-PARTIAL-REFUND-291); **R14_B_VENDOR_PAYABLE_PARTIAL_REFUND_COMPLETE** — refund→AP_VENDOR adjustment + payable sync; no migration; r14b.vendor-payable-refund.e2e 15/15; regressions 128/128 |
| 292 | R14 post-R14B closure verification | [292](292_R14_POST_R14B_CLOSURE_VERIFICATION.md) | Verification (CR-R14-POST-R14B-CLOSURE-VERIFICATION-292); **R14_B_SANDBOX_FINANCE_ENGINEERING_CLOSED** — runtime /health/ready 200; migrations 142/142; regressions 153/153; source audit GREEN; R14-A 0/7 unchanged |
| 293 | R3 partner support entry | [293](293_R3_PARTNER_SUPPORT_ENTRY.md) | Engineering (CR-R3-PARTNER-SUPPORT-ENTRY-293); **R3_PARTNER_SUPPORT_ENTRY_COMPLETE** — store/delivery/join scoped support controllers + client UI; r3.partner-support.e2e 4/4; no migration |
| 294 | R3 mobile-store support parity | [294](294_R3_MOBILE_STORE_SUPPORT_PARITY.md) | Engineering (CR-R3-MOBILE-STORE-SUPPORT-PARITY-294); **R3_MOBILE_STORE_SUPPORT_PARITY_COMPLETE** — mobile-store More→Get help wired to store/support API; R3 support matrix complete; no migration |
| 295 | R3 partner support closure | [295](295_R3_PARTNER_SUPPORT_CLOSURE.md) | Verification (CR-R3-PARTNER-SUPPORT-CLOSURE-295); **R3_PARTNER_SUPPORT_FUNCTIONAL_COMPLETE** — source matrix verified; security/isolation GREEN; regressions 27/27; migrations 142/142; health 200; support CR chain closed |
| 296 | Next authorized engineering wave audit | [296](296_NEXT_AUTHORIZED_ENGINEERING_WAVE.md) | Verification (CR-NEXT-AUTHORIZED-ENGINEERING-WAVE-296); **ROADMAP_ENGINEERING_PAUSE** — all candidate tracks audited; no authorized unblocked gap; regressions 27/27; migrations 142/142; health 200; R14-A 0/7 unchanged |
| 297 | R10-E health document upload | [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) | Engineering (CR-R10-E-IMPL-AUTHORIZED-WAVE-297); **R10_E_IMPLEMENTATION_COMPLETE** — HealthUploadService + POST /health/uploads + payload delegate; migrations 143–144; r10e 4/4; web-customer upload UI; R10-F NOT started |
| 298 | R10-E mobile upload parity | [298](298_R10_E_MOBILE_UPLOAD_PARITY.md) | Engineering (CR-R10-E-MOBILE-UPLOAD-PARITY-298); **R10_E_MOBILE_UPLOAD_PARITY_COMPLETE** — mobile Health upload → existing POST /health/uploads; health-upload-parity 8/8; no migration; R10-F NOT started |
| 299 | R10-F consult-note projection | [299](299_R10_F_CONSULT_NOTE_PROJECTION.md) | Engineering (CR-R10-F-IMPL-299); **R10_F_IMPLEMENTATION_COMPLETE** — CONSULT_NOTE + CONSULT_COMPLETED + encounter_consult_notes; HealthConsultProjectionService; migrations 145–146; r10f 8/8; R10 optional track complete |
| 300 | Post-R10 roadmap audit | [300](300_POST_R10_ROADMAP_AUDIT.md) | Verification (CR-POST-R10-ROADMAP-AUDIT-300); **ROADMAP_ENGINEERING_PAUSE** — fresh code-first audit after R10-E/F; no authorized unblocked gap; migrations 146/146; health 200; R14-A 0/7 unchanged |
| 301 | R14-A human gate closure intake | [301](301_R14_A_HUMAN_GATE_CLOSURE.md) | Human intake (CR-R14-A-HUMAN-GATE-CLOSURE-301); **R14_A_GATE_EVIDENCE_INCOMPLETE** — 0/7 gates; template only; no Book 35 DECIDED updates; production blocked |
| 302 | Next unblocked engineering wave audit | [302](302_NEXT_UNBLOCKED_ENGINEERING_WAVE.md) | Verification (CR-302-NEXT-UNBLOCKED-ENGINEERING-WAVE); **ROADMAP_ENGINEERING_PAUSE** — fresh source audit; no authorized unblocked gap; r10/r14b/r3 regressions PASS; migrations 146/146; health 200; R14-A 0/7 unchanged |
| 303 | Whole ecosystem code-first audit | [303](303_WHOLE_ECOSYSTEM_CODE_FIRST_AUDIT.md) | Verification (CR-303-WHOLE-ECOSYSTEM-CODE-FIRST-AUDIT); **ROADMAP_ENGINEERING_PAUSE** — post R5-F kernel reconciliation; migrations 148/148; r5f 9/9 + regressions 125/125; stale R11/R13 headers fixed in [93]; R14-A 0/7 unchanged |
| 304 | Deep unblocked gap audit + implement | [304](304_DEEP_UNBLOCKED_ENGINEERING_GAP_AUDIT.md) | Engineering (CR-304-DEEP-UNBLOCKED-ENGINEERING-GAP-AUDIT-IMPLEMENT); **R13_G_CLINICAL_PUBLISH_INDEX_COMPLETE** — outbox `LAB_REPORT_PUBLISHED`/`IMAGING_REPORT_PUBLISHED` → clinical index; r13g 8/8; no migration; R14-A 0/7 unchanged |
| 305 | TD-R13E-01 analytics rollup scheduler | [305](305_TD_R13E_01_ANALYTICS_ROLLUP_SCHEDULER.md) | Engineering (CR-305-TD-R13E-01-ANALYTICS-ROLLUP-SCHEDULER); **R13_E_ROLLUP_SCHEDULER_COMPLETE** — `ANALYTICS_DAILY_ROLLUP` outbox scheduler; r13e 10/10; no migration; R14-A 0/7 unchanged |
| 306 | Whole ecosystem audit after CR-305 | [306](306_WHOLE_ECOSYSTEM_AUDIT_AFTER_CR305.md) | Engineering (CR-306-WHOLE-ECOSYSTEM-AUDIT-AFTER-CR-305); **CRM_PERSONALIZATION_PURGE_SCHEDULER_COMPLETE** — `CRM_PERSONALIZATION_PURGE` daily dispatch; r13e 12/12; no migration; R14-A 0/7 unchanged |
| 307 | R2 doctor availability summary fix | [307](307_R2_DOCTOR_AVAILABILITY_SUMMARY_FIX.md) | Engineering (CR-307-R2-DOCTOR-AVAILABILITY-SUMMARY-FIX); **R2_AVAILABILITY_SUMMARY_FIX_COMPLETE** — summary derives from `ScheduleService.list()`; 6/6 e2e; no migration; R14-A 0/7 unchanged |
| 308 | Whole ecosystem deep audit | [308](308_WHOLE_ECOSYSTEM_DEEP_AUDIT.md) | Engineering (CR-308-WHOLE-ECOSYSTEM-DEEP-AUDIT); **APPOINTMENT_COMPLETE_OPTIONAL_BODY_FIX_COMPLETE** — bodyless complete no longer 500; appointment.e2e 1/1; no migration; R14-A 0/7 unchanged |
| 309 | LAB_REPORT_AMENDED notification parity | [309](309_LAB_REPORT_AMENDED_NOTIFICATION_PARITY.md) | Engineering (CR-309-LAB-REPORT-AMENDED-NOTIFICATION-PARITY); **LAB_REPORT_AMENDED_NOTIFICATION_PARITY_COMPLETE** — outbox + customer notification; r7e 2/2 + r8e 4/4; no migration; R14-A 0/7 unchanged |
| 310 | TD-R12G-02 CRM automation scheduler | [310](310_R12G_02_CRM_AUTOMATION_SCHEDULER.md) | Engineering (CR-310-R12G-02-CRM-AUTOMATION-SCHEDULER); **CRM_AUTOMATION_SCHEDULER_COMPLETE** — opt-in daily `CRM_AUTOMATION_DAILY_EVALUATE`; scheduler e2e 6/6 + r12g 10/10; no migration; R14-A 0/7 unchanged |
| 311 | TD-R12B-02 scheduled campaign auto-send | [311](311_TD_R12B_02_SCHEDULED_CAMPAIGN_AUTO_SEND.md) | Engineering (CR-311-TD-R12B-02-SCHEDULED-CAMPAIGN-AUTO-SEND); **CAMPAIGN_SCHEDULED_AUTO_SEND_COMPLETE** — opt-in `CRM_CAMPAIGN_SCHEDULED_SEND_SCAN`; scheduler e2e 7/7 + r12b 7/7; no migration; R14-A 0/7 unchanged |
| 312 | TD-R12B-01 abandoned-cart CRM recovery | [312](312_TD_R12B_01_ABANDONED_CART_CRM_RECOVERY.md) | Engineering (CR-312-TD-R12B-01-ABANDONED-CART-CRM-RECOVERY); **CART_ABANDON_RECOVERY_COMPLETE** — analytics ingest → `CRM_CART_ABANDON_RECOVERY` outbox → `AutomationRunService`; migration 149; e2e 8/8; R14-A 0/7 unchanged |
| 313 | LAB_REPORT_PUBLISHED notification parity | [313](313_LAB_REPORT_PUBLISHED_NOTIFICATION_PARITY.md) | Engineering (CR-313-LAB-REPORT-PUBLISHED-NOTIFICATION-PARITY); **LAB_REPORT_PUBLISHED_NOTIFICATION_PARITY_COMPLETE** — `customer_person_id` in publish outbox; r7e + r8e 6/6; no migration; R14-A 0/7 unchanged |
| 315 | LAB CoC sample transport notification parity | [315](315_LAB_COC_SAMPLE_TRANSPORT_NOTIFICATION_PARITY.md) | Engineering (CR-315-LAB-COC-NOTIFICATION-RECIPIENT-PARITY); **LAB_COC_NOTIFICATION_RECIPIENT_PARITY_COMPLETE** — `customer_person_id` on sample CoC outbox payloads; r7c + r7d 2/2; no migration; R14-A 0/7 unchanged |
| 316 | Whole ecosystem final gap audit | [316](316_WHOLE_ECOSYSTEM_FINAL_GAP_AUDIT.md) | Engineering (CR-316-WHOLE-ECOSYSTEM-FINAL-GAP-AUDIT); **SHIPMENT_NOTIFICATION_RECIPIENT_FIX_COMPLETE** — audit + `customer_person_id` on shipment transition outbox; logistics e2e; no migration; R14-A 0/7 unchanged |

---

## 18. Recommended next step

Ecosystem requirements are **LOCKED**. See [43](43_ECOSYSTEM_BASELINE_LOCK.md). New core modules, domains, architecture patterns, or technologies require a Change Request.

1. Humans review [49](49_PHASE_0_FINAL_AUDIT.md). Engineering status is **TECHNICALLY READY FOR HUMAN SIGN-OFF**, not “Phase 0 fully approved”.
2. Close or explicitly defer `REQUIRES_HUMAN_DECISION` items in [38](38_PHASE_0_DECISION_BOARD.md) §9 (country, brand, controller/processor, cloud, OTP vendor, MoR, PSP, licenses, OD-OBS-01).
3. Phase 1A–1G are implemented ([51](51_PHASE_1A_CATALOG_PRICING_IMPLEMENTATION.md), [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md), [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md), [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md), [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md), [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md), [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md)). **Mock carrier and mock payout only.** **Live DHL/PSP/payout require separate authorization.**
4. Phase 2 Healthcare Ecosystem: **R5-A…F engineering implemented** (R5-F **kernel COMPLETE** — `ErxRouter` + `ErxSubmissionService` + sandbox adapter only; **live provider HUMAN_BLOCKED** L-RX-01). **OD-RX-REFILL** remains unresolved as law; automatic refill stays OFF.
5. R6 complete; R7-A implemented ([141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md)); post-R7-A audit [142](142_POST_R7_A_AUDIT.md) (**R7_A_GREEN_R7_B_READY**). **R7-B** implemented ([143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md) **R7_B_IMPLEMENTED**). **R7-C** implemented ([144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md) **R7_C_IMPLEMENTED**). **R7-D** implemented ([145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) **R7_D_IMPLEMENTED**). **R7-E** implemented ([146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) **R7_E_IMPLEMENTED**); audit [147](147_POST_R7_E_PATHOLOGY_DIGITAL_REPORT_AUDIT.md); blockers closed [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) (**R7_E_BLOCKERS_CLOSED**). **R7-F** implemented [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md) (**R7_F_IMPLEMENTED**). Post-R7 global audit [151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md) (**R7_GLOBAL_WITH_BLOCKERS**); blockers closed [152](152_R7_GLOBAL_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) (**R7_GLOBAL_BLOCKERS_CLOSED**); video regression [153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) (**R7_FINAL_REGRESSION_GREEN**); final closure audit [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) (**R7_CLOSED_R8_READY_FOR_PLANNING**). **R8 plan** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) (**R8_PLAN_READY**). **R8-A** implemented [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md) (**R8_A_IMPLEMENTED**); audit [157](157_POST_R8_A_AUDIT.md) (**R8_A_GREEN_R8_B_READY**). **R8-B** implemented [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) (**R8_B_IMPLEMENTED**); audit [159](159_POST_R8_B_AUDIT.md) (**R8_B_WITH_BLOCKERS**); RN fix [160](160_R8_B_RN_PARITY_FIX_IMPLEMENTATION.md) (**R8_B_BLOCKERS_CLOSED**); final re-audit [161](161_POST_R8_B_FINAL_REAUDIT.md) (**R8_B_GREEN_R8_C_READY**). **R7 CLOSED (A–F)** in sandbox; **R8-C+ NOT started**.

Do **not** implement random UI or APIs, and do **not** expand locked scope, without a CR plus authorization.
