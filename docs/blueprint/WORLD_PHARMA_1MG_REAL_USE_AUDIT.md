# World-Pharma vs 1mg-class competitive parity & real-use readiness

**Type:** Audit only — no product code, schema, API, or UI changes  
**Scope:** Post–Sprint 37 repository ground truth (2026-09-03)  
**Verdict:** `AUDIT COMPLETE`  
**CR / index:** Book 335 in [00_MASTER_INDEX.md](00_MASTER_INDEX.md)

This document is a **current-state baseline**, not a roadmap authorization. It does **not** count route presence, Prisma models, seed rows, Jest mocks, or sandbox adapters as production capability.

**Four layers (do not collapse them):**

| Layer | Question |
| --- | --- |
| Software completeness | Is the domain workflow implemented with real state machines, auth, and persistence? |
| Production integration | Are live PSP, carrier, OTP, messaging, eRx, PACS, object storage wired? |
| Business network | Are there real pharmacies, labs, doctors, inventory, fleets, insurers? |
| Competitive parity | Would a mature public 1mg-class product still look substantially more complete to a customer? |

---

## ACCEPTANCE

**AUDIT COMPLETE**

Evidence is from this repository: apps, packages, Prisma (`251` models, `151` enums), `175` SQL migrations, Nest modules, partner apps, e2e specs, policy packs, and explicit fail-closed live gates. No live credentials, partner contracts, or production traffic were observed (none are present in-repo).

---

## CURRENT BASELINE

### Apps (26 project.json trees)

| App | Role | Domain status |
| --- | --- | --- |
| `apps/api` | NestJS kernel | **IMPLEMENTED** (sandbox-complete; live rails fail-closed) |
| `apps/web-customer` | Customer web | **PARTIAL** — broad 1mg-shaped surface; journeys depend on mock money/OTP/carrier and seed catalog |
| `apps/mobile` | Customer RN | **PARTIAL** / **EXTERNAL_GATED** (device stores, push) — Sprint 37 typecheck/deep-link work; not store-shipped |
| `apps/web-admin` | Central ops | **IMPLEMENTED** for sandbox control plane |
| `apps/web-vendor` | Marketplace seller | **PARTIAL** — order/return/catalog ops exist; payout **SANDBOX_ONLY** |
| `apps/web-store` + `apps/mobile-store` | Pharmacy staff | **PARTIAL** — pick/pack/dispense sandbox |
| `apps/web-doctor` + `apps/mobile-doctor` | Clinician | **PARTIAL** — consult/Rx sandbox; video mock/LiveKit optional |
| `apps/web-lab` + `apps/mobile-lab` | Lab ops | **PARTIAL** — accession/processing/report sandbox |
| `apps/web-pathologist` | Pathology | **PARTIAL** — digital report sandbox |
| `apps/mobile-phlebotomist` | Home collection | **PARTIAL** — CoC sandbox |
| `apps/web-radiology` + `apps/web-radiologist` | Imaging | **PARTIAL** — booking→report sandbox; PACS viewer **MISSING** / **EXTERNAL_GATED** |
| `apps/web-logistics` + `apps/mobile-delivery` | Last mile | **PARTIAL** — mock carrier, rider presence, POD hash |
| `apps/web-affiliate` | Affiliate | **PARTIAL** — attribution/commission sandbox; live payout gated |
| `apps/web-join` | Partner apply/KYC | **PARTIAL** — document KYC workflow; no identity-vendor |
| `apps/ds-web` | Design system | **IMPLEMENTED** (not a product surface) |

### Packages

| Package | Role |
| --- | --- |
| `@world-pharma/database` | Prisma schema + migrations |
| `@world-pharma/shared` | Shared types/utils |
| `@world-pharma/config` | Env parsing |
| `@world-pharma/ui-kit` | Web UI primitives |
| `@world-pharma/shell-core` | Mobile/API client shell |
| `@world-pharma/shell-web` | Web shell |

### Persistence

- **Models:** 251 (`schema.prisma`)
- **Enums:** 151
- **Migrations:** 175 SQL files under `packages/database/prisma/migrations/`
- **Tenancy:** country-scoped RLS (e2e: `apps/api/src/tenancy/rls.tenancy.e2e.spec.ts`)
- **Outbox/inbox:** durable domain events + in-app notification enqueue

Major model groups: identity/RBAC/MFA; `Country`/`PolicyPack`; partner/KYC; catalog/offers/inventory; cart/checkout; payment intents/refunds/webhooks; orders/fulfillment/shipments/POD/returns; ledger/settlement/payouts; doctor/appointment/encounter/video/prescription/eRx/dispense/refill; lab booking/sample/CoC/report; imaging study/series/instance/report; health artifacts/timeline/profile/family; CMS/support; CRM/campaigns; affiliate; loyalty/wishlist/reviews; search documents; analytics; notification country providers; R14-A human gates.

### API modules (wired in `apps/api/src/app/app.module.ts`)

Identity, policy, partner, catalog, inventory, cart, payment, orders, logistics, finance, clinical, delivery, store, lab, radiology, health, care-nav, CMS, CRM, affiliate, promo, wishlist, medication-reminder, family-member, loyalty, care-plan, speciality-care, corporate-wellness, health-packages, store-locator, reviews, personalization, search, discovery, recommendations, analytics, governance, platform, security, events.

**e2e density:** 158 `*.e2e.spec.ts` files under `apps/api` — these prove **sandbox closed loops**, not live providers.

### Shared infrastructure (local)

Evidence: `docker-compose.yml` — Postgres 16 + Redis 7; API optional compose profile. No HA, PITR, managed backups, or DR topology in compose. Object store: `LocalPrivateObjectStore` (`apps/api/src/partner/object-store.ts`) — filesystem under `var/private-objects`. Runtime self-report: `buildRuntimeProfile()` (`apps/api/src/common/runtime-profile.ts`) labels payments/carriers/storage as **sandbox**.

---

## 1. Domain classification (repository reality)

| Domain | Status | Evidence (not exhaustive) |
| --- | --- | --- |
| Identity / sessions / MFA / RBAC | **IMPLEMENTED** (software) | `identity/`; TOTP; `RateLimitService`; production OTP still **EXTERNAL_GATED** (`ConsoleOtpAdapter`) |
| Country policy packs | **PARTIAL** | `Country`/`PolicyPack`; operator UI (R15-A); IN/AE/US **demo** packs in `apps/api/src/dev/*-policy.ts`; healthcare licensing **NOT_MODELED** (`market-readiness.ts`) |
| Catalog / offers / substitutes | **IMPLEMENTED** (sandbox) | catalog + `MedicineSubstituteEdge`; e2e `medicine-substitute.e2e.spec.ts`; content depth is seed |
| Inventory / warehouse | **IMPLEMENTED** (sandbox) | lots, reservations, goods receipts |
| Cart / checkout | **IMPLEMENTED** (sandbox) | checkout session state R14-A; live pay **EXTERNAL_GATED** |
| Payments | **SANDBOX_ONLY** + **EXTERNAL_GATED** | `PaymentGatewayRegistry` registers **MOCK** only; `PAYMENT_LIVE_ENABLED`; R14-A gates 0/7 (`r14a-gate.ts` always `R14_A_LIVE_PRODUCTION_BLOCKED` until 7/7 + fresh audit) |
| Orders / pick-pack / returns | **IMPLEMENTED** (sandbox) | `OrderService` + `customer-order-to-delivery-real-use.e2e.spec.ts` |
| Logistics / delivery | **SANDBOX_ONLY** + **EXTERNAL_GATED** | `CarrierPort` → `MockCarrierAdapter` only (`logistics.module.ts`) |
| Pharmacy store ops | **PARTIAL** | store app + dispensing cases; no licensed retail network |
| Vendor marketplace | **PARTIAL** | KYC cases, listings, accept/fulfill; mock payout |
| Doctor / consult / Rx | **PARTIAL** | appointment/encounter e2e; `MockVideoProvider` default; `SandboxERxAdapter` |
| Lab diagnostics | **PARTIAL** | R7 A–F e2e loops; workforce sandbox |
| Imaging / radiology | **PARTIAL** | R8 A–F + sandbox DICOM JSON; **no clinical viewer**; `SandboxPacsAdapter` |
| Health record / family / timeline | **IMPLEMENTED** (sandbox) | R9/R10; Sprint 36 unified journey e2e |
| Care plans / packages | **PARTIAL** | persisted packages/memberships; billing `waived_until_live_psp`; speciality/corporate **hardcoded catalogs** |
| CMS / help / support | **IMPLEMENTED** (sandbox) | R11; in-app tickets; no live contact-center vendor |
| CRM / promo / loyalty / affiliate | **IMPLEMENTED** (sandbox) | R12; schedulers opt-in; affiliate liabilities not live-paid |
| Search / recs / analytics | **PARTIAL** | Postgres search documents (R13), deterministic co-occurrence recs — not 1mg-scale retrieval/ML |
| Notifications | **SANDBOX_ONLY** + **EXTERNAL_GATED** | in-app inbox; `safeSandboxBody()`; SMS/email/push/WhatsApp config refs only |
| Mobile customer | **PARTIAL** / **EXTERNAL_GATED** | Sprint 37 `mobile-platform-real-use.spec`; Expo; no store binaries in this audit |
| Physical retail / store locator | **PARTIAL** | locator + staff apps; payment_methods include `'insurance'` as **copy**, not TPA |
| Insurance / TPA / hospital HIS | **MISSING** (explicit product out-of-scope in master index) | |
| Live PSP / live carrier / live KYC vendor | **EXTERNAL_GATED** | market readiness always lists these gates |

---

## 2. REAL CUSTOMER JOURNEY AUDIT

**Legend for this section**

- **UI / API / DB / Auth / Transitions:** whether the step exists as software.
- **Sandbox:** proven with mock PSP/carrier/OTP and `DEV_SANDBOX_SEED`.
- **Production ready:** would survive real money, real identity proofing, real logistics, and real regulated Rx **without** swapping the entire adapter layer *and* without a commercial network. Almost nothing qualifies.
- **Primary class:** one of REAL | SANDBOX | EXTERNAL_GATED | PARTIAL | MISSING.

| Step | UI | API | Persist | Auth | State machine | Sandbox | Prod ready | External | Primary class |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- | --- |
| Discover | Y | Y | Y | public/session | n/a | Y (seed) | N | catalog content | **SANDBOX** |
| Search | Y | Y | search docs | public | index jobs | Y | N (quality) | none for kernel | **SANDBOX** |
| Product PDP | Y | Y | Y | public | n/a | Y | N (content) | | **SANDBOX** |
| Seller / offer | Y | Y | offers | Y | eligibility | Y | N | seller network | **SANDBOX** |
| Serviceability | Y | Y | zones | Y | zone active | Y | N | geo data | **SANDBOX** |
| Cart | Y | Y | Y | Y | quotes | Y | software-strong | | **SANDBOX** |
| Address | Y | Y | `CustomerAddress` | Y | n/a | Y | **closest to REAL software** | | **SANDBOX** |
| Rx (where required) | Y | Y | Rx + handoff | Y | verify/dispense | Y | N | eRx **EXTERNAL_GATED** | **SANDBOX** |
| Checkout | Y | Y | `CheckoutSession` | Y | PAID/FAILED | Y | N | | **SANDBOX** |
| Payment | Y (UPI panel sandbox) | Y | intents/attempts | Y | capture/refund | mock only | **N** | **PSP, PCI, MoR** | **EXTERNAL_GATED** |
| Order | Y | Y | `Order`+snapshots | Y | status machine | Y | software-strong | | **SANDBOX** |
| Vendor acceptance | vendor UI | Y | Y | seller RBAC | accept | Y | N | sellers | **SANDBOX** |
| Pick / pack | store UI | Y | pick/pack tasks | staff | Y | Y | N | pharmacies | **SANDBOX** |
| Shipment | Y | Y | `Shipment`+mock label | Y | Y | mock label | N | **carrier** | **SANDBOX** |
| Delivery | rider UI | Y | jobs/presence | rider | Y | mock | N | fleet/carrier | **EXTERNAL_GATED** |
| POD | Y | Y | `ProofOfDelivery` | Y | OTP hash | console OTP | N | **SMS OTP** | **EXTERNAL_GATED** |
| Delivered | Y | Y | status sync | Y | order↔shipment | Y | N | | **SANDBOX** |
| Return | Y | POST `/me/orders/:id/returns` | `ReturnRequest` | Y | vendor approve | Y | N | reverse logistics | **SANDBOX** |
| Refund | admin/finance | Y | `Refund`+ledger | finance | listener | mock PSP | N | **PSP refunds** | **EXTERNAL_GATED** |
| Review | Y | Y | `ProductReview` | Y | verified-purchase flag | Y | N | | **SANDBOX** |
| Reorder / buy-again | Y | Y | eligibility | Y | n/a | Y | N | | **SANDBOX** |

**Journey totals (21 steps, primary class):**

| Class | Count |
| --- | ---: |
| REAL (real customer, live rails, live network) | **0 / 21** |
| SANDBOX (closed loop with mocks + seed) | **16 / 21** |
| EXTERNAL_GATED (software exists; live vendor required) | **5 / 21** |
| MISSING (no implementation of the listed step) | **0 / 21** |

Payment, last-mile carrier, POD OTP, and refunds are **also** sandbox-testable; they are counted EXTERNAL_GATED because they cannot be offered to real paying customers as-is.

---

## 3. HEALTHCARE JOURNEY AUDIT

| Step | Primary class | Notes / evidence |
| --- | --- | --- |
| Health profile | **SANDBOX** | `CustomerHealthProfile` + allergies/conditions/vitals; web `/health/profile` |
| Family health | **SANDBOX** | `CustomerFamilyMember`; `customer-family-health.e2e.spec.ts` |
| Doctor discovery | **SANDBOX** | provider search documents; seed doctors |
| Appointment | **SANDBOX** | `Appointment` state; `appointment.e2e.spec.ts` |
| Consultation | **EXTERNAL_GATED** | encounter workflow **SANDBOX**; video default `MockVideoProvider`; LiveKit only if env configured — not production-evidenced |
| Prescription | **SANDBOX** | versions/lines; legal eRx **EXTERNAL_GATED** (`SandboxERxAdapter`, L-RX-01) |
| Medicine (Rx→order) | **SANDBOX** | `RxCommerceHandoff`; `rx-handoff.e2e.spec.ts` |
| Lab booking | **SANDBOX** | sandbox pay on booking |
| Sample collection | **SANDBOX** | phlebotomist + CoC e2e |
| Processing | **SANDBOX** | accession/processing |
| Lab report | **SANDBOX** | digital publish + health artifact; physical report logistics sandbox |
| Imaging booking | **SANDBOX** | R8-B |
| Study / acquisition | **SANDBOX** | sandbox DICOM-like JSON in local store (`dicom-uid.ts`: not Part 10) |
| Radiology interpretation | **SANDBOX** | SoD draft/verify |
| Imaging report | **PARTIAL** | text/PDF path sandbox; **viewer MISSING**; PACS **EXTERNAL_GATED** |
| Health timeline | **SANDBOX** | Sprint 36 `unified-healthcare-care-journey.e2e` |
| Care plan | **PARTIAL** | memberships exist; `billing: waived_until_live_psp` |
| Notifications | **EXTERNAL_GATED** | in-app **SANDBOX**; SMS/email/WhatsApp/push not dispatched live |

**Healthcare totals (18 steps, primary class):**

| Class | Count |
| --- | ---: |
| REAL | **0 / 18** |
| SANDBOX | **12 / 18** |
| PARTIAL | **2 / 18** |
| EXTERNAL_GATED | **4 / 18** |
| MISSING | **0 / 18** of listed steps (hospital/TPA still **MISSING** as products) |

End-to-end “customer books doctor → video → legal eRx → pays → pharmacy dispenses live stock → lab home collection by real phlebotomist → real PACS images” **does not exist**. Piecewise sandbox loops **do**.

---

## 4. 1mg-CLASS COMPETITIVE PARITY

Benchmark: **publicly observable** mature 1mg-class healthcare marketplace (pharmacy + diagnostics + consult + content + app convenience). Not 1mg’s private internals.

| Capability area | WP vs 1mg-class | Class |
| --- | --- | --- |
| Medicine discovery | Kernel + search docs + 1mg-shaped browse (ayurveda, salts, brands). Catalog **seed-scale**, not encyclopedia-scale. | **PARTIAL** |
| Generic/brand substitutes | Graph + UI (`medicine-substitute`). Not 1mg substitution richness. | **PARTIAL** |
| Multi-seller marketplace | Offers, eligibility, vendor accept. No real seller network. | **SANDBOX** |
| Rx / OTC | Restriction codes + verify/dispense. Live eRx gated. | **PARTIAL** |
| Medicine information (composition, warnings, storage) | Schema/fields exist; **content corpus missing**. | **PARTIAL** |
| Reviews / ratings | R12-F kernel. | **SANDBOX** |
| Offers / coupons | Promo + checkout. | **SANDBOX** |
| Wishlist / reorder / reminders / subscriptions | Implemented in sandbox (`RxSubscription`, reminders). | **SANDBOX** |
| Availability / serviceability | Zones + lots. Fake stock. | **SANDBOX** |
| Pharmacy network / physical stores | Locator + staff apps. No retail chain. | **MISSING** (network) |
| Lab discovery / packages / home collection | Full sandbox ops. No Thyrocare-class network. | **SANDBOX** |
| Doctor discovery / consult | Profiles + booking. Live video/legal Rx gated. | **PARTIAL** |
| Imaging | Stronger **ops workflow** than typical 1mg public imaging; weaker **acquisition/viewer**. | **PARTIAL** |
| Health platform | Profile/family/timeline/care nav — competitive **software**; empty of real records. | **PARTIAL** |
| Search quality / ML recs | Deterministic recs + SQL search. Far behind 1mg relevance/SEO. | **PARTIAL** |
| SEO / health content | CMS + sitemap + blog routes. Not a content business. | **PARTIAL** |
| Corporate / insurance | Corporate wellness **hardcoded program list**; insurance **MISSING**. | **MISSING** / **PARTIAL** |
| Admin / finance / KYC / CRM | **Ahead of typical public 1mg visibility** as software; still sandbox money. | **SANDBOX** |

---

## 5. GLOBAL READINESS AUDIT

**Overall global readiness: 22%**

Architecture is **country-pack oriented** (not an India fork). Activation math is honest: `computeMarketReadiness()` never claims healthcare regulation and **always** attaches live PSP/carrier/OTP/messaging/KYC external gates (`apps/api/src/platform/market-readiness.ts`).

### Policy countries in repo

| Country | Pack source | Current state | Blockers |
| --- | --- | --- | --- |
| **IN** | `buildIndiaPolicyDocument()` | Demo pack: INR, UPI/CARD/COD, `IN_GST_DEMO`, Asia/Kolkata, hi locale | Healthcare **NOT_MODELED**; mock gateway_refs; no live UPI PSP; no GST engine beyond profile **ref**; no pharmacy/doctor/lab licences |
| **AE** | `buildUaePolicyDocument()` | Demo: AED, CARD/COD, `AE_VAT_DEMO` | Same external gates; no UAE healthcare/telehealth legal model |
| **US** | `buildUsPolicyDocument()` | Demo: USD, CARD/WALLET, `US_SALES_TAX_DEMO` | No NPI/DEA/HIPAA operationalization; no sales-tax engine; wallet gated |
| Sandbox `XXX` | `buildSandboxPolicyDocument()` | Dev marketplace enablement | Not a market |

Sprint 35: activate/suspend + readiness UI — **sandbox commerce activation**, not production country go-live.

### Hardcode classification (India / INR / GST / UPI / IST)

| Occurrence | Class |
| --- | --- |
| `apps/api/src/dev/india-policy.ts` INR, UPI, GST ref, IST tz | **VALID INDIA POLICY/FIXTURE** |
| `payment-method-policy.ts` mapping UPI → `MOBILE_PAYMENT` + IN label | **VALID INDIA POLICY/FIXTURE** (family is global; label is IN) |
| Mock adapter UPI collect tests in INR | **VALID INDIA POLICY/FIXTURE** (sandbox scenario) |
| `global-hardcode-scan.spec.ts` (api/admin/shared) expecting no accidental IN defaults | Engineering control — **does not scan vendor/customer UIs** |
| `web-vendor/.../vendor-orders-panel.tsx` `currency ?? 'INR'` | **GLOBAL ARCHITECTURE VIOLATION** |
| `web-customer` UPI collect panel + checkout copy assuming UPI app | **PARTIAL** — India-shaped UX; should be pack-driven (risk of leaking IN UX into AE/US) |
| `packages/shared/src/site-chrome.ts` payment logos include UPI globally | **GLOBAL ARCHITECTURE VIOLATION** (chrome, not pack) |
| `family-page.tsx` placeholder `+91…` | **GLOBAL ARCHITECTURE VIOLATION** (UX) |
| `store-locator.service.ts` `'UPI Payments'` / `upi` in methods | **VALID** if IN store; **violation** if shown for all countries |
| `health-packages-catalog.service.ts` / care-plan seed `['IN','AE','US']` | **VALID** fixture set, not a silent India default |
| Sprint 37 mobile country clamp (no silent India default) | Mitigation — **VALID** direction |

**Data residency:** `Country.dataResidencyMode` default `"shared"` — **not** per-country isolation. **PARTIAL** / not production-evidenced.

**Consent:** customer privacy/consent pages + `ConsentGrant` for clinical access — **PARTIAL** software; not a legal DPIA/HIPAA/DPDP program.

---

## 6. PRODUCTION READINESS AUDIT

| Area | Status | Evidence |
| --- | --- | --- |
| **Payments** | **EXTERNAL_GATED** | Mock adapter only; webhooks/refunds/recon **sandbox-complete**; PCI SAQ gate empty; no merchant; `live_production_status` blocked even if flag flipped without 7/7 |
| **Delivery** | **EXTERNAL_GATED** | Mock carrier; mock labels (`labelFormat` default `MOCK`); tracking events simulated; GPS/OTP/POD **software**; no DHL/Delhivery/etc. |
| **Communications** | **EXTERNAL_GATED** | Inbox + prefs; dispatch in-app; provider matrix stores **vault paths**, not senders; production NODE_ENV marked **degraded** until matrix verified |
| **OTP** | **EXTERNAL_GATED** | `ConsoleOtpAdapter`; `AUTH_DEV_REVEAL_OTP` local-only |
| **Healthcare integrations** | **EXTERNAL_GATED** / **MISSING** | Sandbox eRx; mock/LiveKit video; sandbox PACS JSON; **no HL7/FHIR adapters** found as live integrations |
| **Storage** | **SANDBOX_ONLY** | Local private store; malware scanner **noop** `AllowAllMalwareScanner`; no KMS |
| **Infrastructure** | **PARTIAL** | Compose Postgres/Redis; BullMQ/outbox; `/health/ready`; metrics; **no** HA, PITR, backup operator, SLO/RPO/RTO, DR |
| **Security** | **PARTIAL** (software-strong, ops-weak) | RBAC, RLS, audit events, rate limits (OTP/pay), MFA code, secrets-not-in-gates. **No** pen-test evidence, no production secret manager, PHI in sandbox bodies stripped (`safeSandboxBody`) |
| **KYC** | **PARTIAL** / **EXTERNAL_GATED** | Internal case/document workflow; no Sumsub/Onfido; scanner noop |

Sprint 33 ops e2e (`production-operations-recovery.e2e.spec.ts`) exercises **engineering drills**, not a production SRE estate.

---

## 7. REAL-WORLD BUSINESS NETWORK GAP

**None of the following exist as commercial reality in this repository.** Seed/`DEV_SANDBOX_SEED` is **not** a network.

| Network | In-repo reality |
| --- | --- |
| Pharmacies / SKU inventory | Demo orgs + lots |
| Labs / phlebotomists / pathologists | Demo partners + apps |
| Imaging centers / radiologists | Demo + sandbox DICOM |
| Doctors | Demo profiles |
| Delivery fleet / carriers | Mock carrier seed (`seedMockCarrier`) |
| Corporate / insurance / hospitals | Hardcoded wellness copy; insurance **out of scope** |
| Payment provider | Mock |
| KYC provider | None |
| SMS/email/WhatsApp/push vendors | Config slots only |
| App stores / customer acquisition | Not shipped |

**Software can onboard partners; business cannot fulfill a real prescription today.**

---

## 8. SCORECARD

### Methodology (software / product parity)

Score = **implemented, user-reachable capability quality** vs a mature 1mg-class **product**, not vs “does a table exist”.

Deductions: mock-only money/logistics, empty content, no network, no live consult, thin search/SEO, hardcoded B2B, no insurance.

Weights kept as requested (sum 100%).

### A. SOFTWARE / PRODUCT PARITY

**Overall: 53%**

| Category | Weight | Score | Why |
| --- | ---: | ---: | --- |
| Pharmacy | 20% | **58** | Marketplace + Rx/OTC + substitutes + inventory software; seed catalog; no retail network; live Rx gated |
| Diagnostics | 12% | **55** | Full lab loop in sandbox; no network/accreditation ops |
| Doctor/Care | 12% | **50** | Booking/Rx/earnings software; video/eRx not live |
| Imaging | 8% | **40** | Ops loop exists; no viewer/PACS |
| Health Platform | 10% | **55** | Profile/family/timeline/care nav; empty PHI corpus |
| Commerce Convenience | 10% | **50** | Wishlist/reorder/reviews/promo/search; relevance/SEO far behind |
| Operations/Admin | 10% | **70** | Unusually complete admin/partner shells for this stage |
| Finance/Settlement | 6% | **50** | Ledger/recon/break queue software; mock PSP/payout |
| Growth/CMS/SEO/CRM | 5% | **35** | Kernels + schedulers; not a growth engine |
| Global Architecture | 7% | **50** | Packs + readiness honesty; healthcare NOT_MODELED; some IN UX leaks |

Weighted: `0.20×58 + 0.12×55 + 0.12×50 + 0.08×40 + 0.10×55 + 0.10×50 + 0.10×70 + 0.06×50 + 0.05×35 + 0.07×50` = **53.15 → 53%**.

### B. REAL-USE READINESS (stricter)

Question: **what fraction of the intended real-world product can operate for real users today** (real money, identity, regulated care, physical fulfillment)?

**Overall: 29%**

| Slice | Score | Why |
| --- | ---: | --- |
| Customer real-use | **22** | Can browse/login in sandbox; cannot pay, receive SMS, or get real delivery/Rx |
| Vendor/pharmacy real-use | **32** | Staff can run sandbox orders; cannot settle live or stock real SKUs |
| Doctor real-use | **28** | Charting/Rx in sandbox; cannot legally consult/prescribe on live rails |
| Lab real-use | **28** | Ops UI complete; no accredited lab or collectors |
| Imaging real-use | **18** | No PACS/viewer; sandbox images only |
| Delivery real-use | **22** | Rider app exists; mock carrier/OTP |
| Admin real-use | **50** | Operators can configure sandbox countries, CMS, finance **mock** ledgers |
| Finance real-use | **30** | Books work on mock captures; no bank/PSP |
| Global market real-use | **15** | Three demo packs; no country legally/operationally live |

Weights: customer 28, vendor 12, doctor 10, lab 10, imaging 6, delivery 8, admin 12, finance 8, global 6.  
Weighted ≈ **29%**.

Sandbox staff-pilot (fake money, known OTP, demo SKUs) would score **~55–65%** — **that is not this metric**.

---

## 9. CRITICAL GAP TABLE

| Capability | Implemented | Sandbox | Production Ready | External Gate | Business Network | Missing Work |
| --- | :---: | :---: | :---: | --- | --- | --- |
| Medicine catalog & PDP | Y | Y | N | — | Seed only | Real SKUs, content, manufacturers |
| Substitutes | Y | Y | N | — | Edges seed | Clinical substitution policy per country |
| Multi-seller offers | Y | Y | N | — | No sellers | Onboard pharmacies/vendors |
| Cart/checkout | Y | Y | Software-high | PSP | — | Live pay methods |
| Payments capture/refund/webhook | Y (mock) | Y | **N** | PSP, PCI, MoR, vault | No merchant | R14-A 7/7 + live adapter |
| Serviceability | Y | Y | N | geo/carrier | No zones of truth | Country geo packs |
| Rx upload/verify/dispense | Y | Y | N | eRx, licensing | No pharmacists | Legal eRx + licences |
| Order/fulfillment | Y | Y | Software-high | — | No warehouses | Live inventory |
| Carrier tracking/labels | Mock | Y | **N** | Carrier API | No SLA | Live adapter + webhooks |
| POD / delivery OTP | Hash/console | Y | **N** | SMS | No riders | SMS OTP + GPS policy |
| Returns | Y | Y | N | Reverse logistics | — | Policy + carrier returns |
| Reviews/wishlist/loyalty/promo | Y | Y | N | — | No shoppers | Content moderation at scale |
| Search/recommendations | Y (SQL) | Y | N | — | Thin index | Relevance, SEO corpus |
| Doctor booking | Y | Y | N | Licensing | No doctors | Credentialing |
| Video consult | Mock/LiveKit stub | Y | **N** | LiveKit/SFU, consent | — | Production video + recording policy |
| Lab booking→report | Y | Y | N | Lab LIS | No labs | LIS/HL7 optional; network |
| Imaging booking→report | Y | Y | **N** | PACS/DICOM | No centers | Real PACS + viewer |
| Health timeline/profile | Y | Y | N | Privacy law | No PHI | Retention/residency |
| Care plans / packages | Partial | Y | N | PSP billing | — | Paid memberships |
| CMS/help/support | Y | Y | N | Contact channels | — | Live email/SMS |
| CRM/campaigns | Y | Y | N | Messaging | — | ESP/SMS |
| Affiliate | Y | Y | N | Payout | No affiliates | Live payout |
| Admin control plane | Y | Y | Partial | — | — | Prod IAM/SSO |
| Ledger/settlement | Y | Y | N | Bank/PSP | — | Live import/payout |
| Partner KYC | Documents | Y | N | KYC vendor, AV | — | Vendor + malware |
| Country packs | Y | Y | N | Lawyers/regulators | — | Healthcare models |
| Insurance/TPA | N | N | N | Insurers | None | Explicitly out of scope |
| Physical 1mg-like retail | Locator only | Y | N | Real estate | None | Stores |
| Push/WhatsApp | Config only | N live | N | FCM/WABA | None | Providers |
| Object storage/KMS | Local | Y | N | Cloud storage | — | S3 + KMS |
| Postgres HA / DR | Compose single | n/a | N | Cloud DBA | — | HA/PITR/backups |

---

## 10. REMAINING WORK

Complexity: **S** days–1 week, **M** 1–4 weeks, **L** multi-sprint, **XL** program.

### P0 — Required before first real-market launch

| What | Why | Domain | Dependency | Eng | External/business? |
| --- | --- | --- | --- | --- | --- |
| Close R14-A 7/7 + live PSP adapter + merchant/MoR | Cannot take money | Payment | Owner evidence | L | **Yes** — PSP contract, PCI |
| Production OTP (SMS/email) replacing console | Cannot authenticate real users safely | Identity | OTP vendor | M | **Yes** |
| Live notification send (at least SMS+email) | Orders/Rx/delivery are unsafe without it | Platform | ESP/SMS | M | **Yes** |
| Live carrier **or** employed fleet with real tracking | Cannot deliver medicines | Logistics | Carrier/fleet | L | **Yes** |
| Production object storage + encryption | Rx images, KYC, reports | Storage | Cloud | M | **Yes** |
| First-country **healthcare legal pack** (Rx, pharmacy, telehealth, lab) | `healthcare: NOT_MODELED` blocks honest activation | Policy | Counsel | L | **Yes** — law |
| Real pharmacy + real SKU inventory in that country | Empty shelf | Commerce | Partners | XL | **Yes** |
| Licensed dispensing workflow in that country | Rx goods | Pharmacy | Licence | L | **Yes** |
| Secrets/KMS, disable `AUTH_DEV_REVEAL_OTP`, live flag discipline | Security | Infra | Vault | S–M | **Yes** ops |
| Postgres backups/PITR + restore drill in the **target** environment | Data loss | Infra | Cloud | M | **Yes** |
| Malware scan on uploads | KYC/Rx files | Partner | AV engine | M | **Yes** |

### P1 — Credible 1mg-class competitiveness

| What | Why | Domain | Dep | Eng | Ext? |
| --- | --- | --- | --- | --- | --- |
| Medicine content corpus (uses, SE, warnings) at catalog scale | 1mg PDP is a content product | Catalog/CMS | Medical writers | XL | Content |
| Search relevance + SEO landing pages | Acquisition | Search/CMS | — | L | Partial |
| Live video consult (configured LiveKit/equivalent) + recording policy | Care | Clinical | Video vendor | M | Yes |
| Legal eRx provider | Rx | Clinical | eRx | L | Yes |
| Lab network + home collection staffing | Diagnostics | Lab | Labs | XL | Yes |
| PACS + customer/radiologist viewer | Imaging | Radiology | PACS | XL | Yes |
| KYC vendor | Marketplace trust | Partner | KYC | M | Yes |
| Live payouts to vendors/doctors/labs | Supply stays | Finance | Bank/PSP | L | Yes |
| Remove IN currency/UPI chrome leaks | Global claim | All UIs | — | S–M | No |
| Push + WhatsApp (country-legal) | Retention | Comms | WABA/FCM | M | Yes |
| Real substitute/clinical rules | Safety | Catalog | Clinicians | L | Partial |
| App Store / Play shipping + device QA | Customer entry | Mobile | Apple/Google | M | Yes |

### P2 — Scale / optimization / expansion

| What | Why | Domain | Eng | Ext? |
| --- | --- | --- | --- | --- |
| ML recommendations | Convenience | Recs | L | Data |
| Insurance/TPA | 1mg-adjacent | — | XL | Yes — **scope change** |
| Hospital partnerships / HIS | Network | — | XL | Yes |
| Multi-region data residency | Global | Infra | XL | Yes |
| Physical retail chain | 1mg stores | Store | XL | Yes |
| Pen-test / ISO / HIPAA-or-DPDP program | Trust | Sec | L | Yes |
| HL7/FHIR lab/hospital | Interop | Lab | L | Yes |
| Loyalty at consumer scale | Growth | CRM | M | No |
| Observability SLO/on-call | Ops | SRE | M | Yes |

---

## 11. FIRST-MARKET READINESS

**The architecture can activate a sandbox country** (currency + published pack + payment/delivery policy + zones + settlement) **without assuming India**.

**The architecture cannot legally/operationally activate ANY country for real healthcare commerce today.** Healthcare items are hard-coded `NOT_MODELED`. Live rails are globally gated.

| | IN | AE | US |
| --- | --- | --- | --- |
| Current state | Demo pack + likely ACTIVE in sandbox seed | Demo pack | Demo pack |
| Regulatory model | GST **ref only**; Rx/pharmacy/telehealth **not modeled** | VAT ref; **not modeled** | Sales-tax ref; **not modeled** |
| Payment blocker | Mock; UPI is label on mock | Mock CARD | Mock CARD/WALLET |
| Delivery blocker | Mock carrier | Mock | Mock |
| Notification blocker | Matrix optional for sandbox; live SMS/WhatsApp gated | same | email-shaped pack; still no ESP |
| Settlement blocker | Mock payout/import | same | same |
| Healthcare policy blocker | **NOT_MODELED** (all six codes in `market-readiness.ts`) | same | same |

Do **not** treat India as the default launch country. Treat **“no country is production-ready”** as the baseline.

---

## 12. 1mg PARITY — HONEST CONCLUSION

### Where World-Pharma is already strong

- **Domain breadth:** pharmacy marketplace, lab, imaging ops, doctors, ledger, CRM, CMS, affiliates, policy packs — far beyond a simple pharmacy clone **in software**.
- **Honesty in gates:** live PSP cannot be accidentally enabled (`r14a-gate.ts`); market readiness lists external gates instead of greenwashing.
- **State machines:** order, payment, lab CoC, imaging SoD, KYC, refunds — real transitions with e2e, not empty screens.
- **Admin/operator surface:** unusually complete for a pre-revenue platform.

### Where World-Pharma is approximately at parity

- **Shape** of customer IA (search, PDP, lab, doctors, health, help, subscriptions, substitutes) **resembles** a 1mg-class super-app **if you ignore empty catalogs and fake money**.
- **Sandbox healthcare ops** (lab/imaging/consult) can **demo** a fuller loop than many public 1mg screens (especially radiology workflow) — still not clinical-grade.

### Where World-Pharma is materially behind

- **Catalog/content/SEO** (the actual 1mg customer magnet).
- **Live payments, OTP, SMS, delivery, payouts.**
- **Real supply** (pharmacies, labs, doctors, inventory).
- **Search quality and personalization.**
- **Legal eRx, production video, PACS viewer.**
- **App-store presence and brand trust.**
- **Insurance/corporate at 1mg marketing scale** (WP: hardcoded lists).

### What prevents real-world launch today

No live money, no live identity OTP, no live delivery, no licensed healthcare policy, no real inventory/partners, local disk for PHI-adjacent objects, compose-grade data plane.

### What prevents 1mg-class competitiveness

Even after live rails: empty medicine encyclopedia, no partner density, weak discovery/SEO, no consumer trust, no scale logistics.

### What prevents global operation

Healthcare **NOT_MODELED**; residency default shared; IN UX leaks; every local rail (PSP, tax, Rx, lab, messaging) still a **per-country program**, not a config toggle.

---

## 13. EVIDENCE INDEX (scores)

| Claim | Module / app | API / service | Model | Test / gate |
| --- | --- | --- | --- | --- |
| Mock-only payments | `payment/` | `PaymentGatewayRegistry`, `MockPaymentGatewayAdapter` | `PaymentIntent`, `R14AHumanGate` | `r14a-gate.ts`, `r14a.payment.e2e.spec.ts` |
| Mock-only carrier | `logistics/` | `MockCarrierAdapter` | `Carrier`, `ShipmentLabel` | `logistics.e2e.spec.ts` |
| Console OTP | `identity/` | `ConsoleOtpAdapter` | `OtpChallenge` | `.env.example` `AUTH_DEV_REVEAL_OTP` |
| In-app notif only | `platform/` | `NotificationDispatchService` | inbox | `notification-inbox.e2e.spec.ts` |
| Sandbox eRx | `clinical/` | `SandboxERxAdapter` | `PrescriptionErxSubmission` | R5-F comments L-RX-01 |
| Sandbox PACS | `radiology/` | `SandboxPacsAdapter` | `ImagingStudyInstance` | `imaging-study-pacs-foundation.e2e.spec.ts` |
| Healthcare not modeled | `platform/` | `computeMarketReadiness` | `PolicyPack` | `market-readiness.spec.ts` |
| Commerce loop | `orders/` `cart/` | `OrderService` | `Order`, `Shipment` | `customer-order-to-delivery-real-use.e2e.spec.ts` |
| Health journey | `health/` `clinical/` | projections | `HealthArtifact` | `unified-healthcare-care-journey.e2e` |
| Local storage | `partner/object-store.ts` | `LocalPrivateObjectStore` | object keys | runtime-profile |
| Mobile post-S37 | `apps/mobile` | shared APIs | — | `mobile-platform-real-use.spec.tsx` |
| INR vendor fallback | `web-vendor` | — | — | source `?? 'INR'` |
| Corporate/speciality mock | `corporate-wellness/` `speciality-care/` | in-memory `getMockPrograms` | little persistence | admin copy “not TPA” |

**Not counted:** empty-looking marketing hubs that only filter catalog (`cancer-care-page.tsx`, `pet-care-page.tsx`) as 1mg-grade specialty care; `getMockPrograms()` as a care program product.

---

## TOP 10 NEXT WORK ITEMS

Ranked by **business impact on first real launch**, not engineering convenience.

1. **Owner-complete R14-A + live PSP** in one chosen country (money).
2. **Live OTP + transactional SMS/email** (login and delivery).
3. **First-country legal/healthcare policy pack** (permission to operate).
4. **Contracted pharmacy + real inventory + licensed dispense**.
5. **Live last-mile** (carrier or employed fleet) with real POD.
6. **Production storage/KMS + backup/PITR**.
7. **KYC + malware** for partner onboarding.
8. **Live payouts** so supply is paid.
9. **Ship customer mobile** (stores) once 1–8 have a pilot city.
10. **Medicine content + search/SEO** so anyone other than staff would shop.

---

## BIGGEST RISK

**The platform is a high-fidelity sandbox of a healthcare super-app with no live economic, logistics, communications, or licensed clinical rails — and no commercial network.** Shipping UI or more domain modules will not create a 1mg competitor; **partners + regulators + PSP/carrier/OTP** will.

---

## FINAL VERDICT

**World-Pharma is currently at approximately 53% product parity with a mature 1mg-class platform and 29% real-use readiness.**

**53%** means: most 1mg-shaped **workflows exist as software** (often with serious state machines and operator UIs), but the **product a shopper meets** lacks catalog depth, live fulfillment, live care, and acquisition engine. It is not “half of 1mg in production.”

**29%** means: a small slice (admin configuration, authenticated browse, sandbox ops training) could be used by **internal operators** today; **essentially none** of the intended customer/partner real-world product can run without mock money, mock OTP, mock carriers, seed data, and unmodeled healthcare law.

**Global readiness 22%** means: multi-country **configuration** exists; multi-country **operation** does not.

---

## MASTER BACKLOG POINTER

Indexed as Book **335** in [00_MASTER_INDEX.md](00_MASTER_INDEX.md). Previous sprint rows are unchanged.
