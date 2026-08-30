# 33 — Development Roadmap

**Status:** Blueprint  
**Execution overlay:** From the current implemented state forward, the canonical build order is **[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)** (waves R0–R16). This book remains **historical dependency law** (packs before commerce; money kernel before marketplace/doctor/lab **production traffic**; ledger not postponed). Do not treat colliding “Phase 2” names as a second product.  
**Audience:** Founders, product, architecture, engineering, operations, finance, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · Domain books [05](05_CUSTOMER_PLATFORM.md)–[16](16_HEALTH_RECORD.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Testing](31_TESTING_STRATEGY.md) · [DevOps](32_DEVOPS_CICD.md) · [Risk](34_RISK_REGISTER.md) · [Open decisions](35_OPEN_DECISIONS.md) · [Phase 0 board](38_PHASE_0_DECISION_BOARD.md) · [Phase 0 plan](39_PHASE_0_IMPLEMENTATION_PLAN.md)

---

## 1. How to read this roadmap

This is a **dependency-aware build order**, not a promise of calendar dates or headcount. Calendar estimates are **OPEN DECISION (OD-ROAD-01)** after team size is known.

**Hard sequencing rules:**

1. **Country Policy Pack scaffolding in Phase 0** — even if the first pack is empty of legal rules.
2. **Payment kernel thin slice + double-entry ledger in Phase 2** — before marketplace, before doctor take-rate, before lab settlement. Do **not** postpone the journal “until ERP.”
3. Marketplace (Phase 3) **requires** Phase 2 money + inventory + logistics jobs.
4. Video (Phase 4) **requires** identity, consent hooks, and payment hold/capture.
5. Lab (Phase 5) **requires** logistics job types + payment + health artifact + consent.
6. Do **not** start microservices extraction as a phase. Extraction is a **Phase 10 option** when a bounded context forces it ([04](04_APPLICATION_ARCHITECTURE.md) §1).
7. **Do not invent law.** A phase may ship **technical defaults**; country enablement of regulated features is a **LEGAL/COMPLIANCE REVIEW** gate, not a coding gate.

**Duration (directional, single squad-of-squads):** Phase 0 ~6–10 weeks; Phases 1–5 ~8–14 weeks each; 6–10 overlap. **OD-ROAD-01** to replace with a staffing model.

---

## 2. Dependency graph (condensed)

```
P0 Foundation (packs, identity kernel, DS, CI, obs, security baseline)
        │
        ▼
P1 Identity + customer shell + catalog + owned pharmacy (no paid live orders)
        │
        ▼
P2 Orders + PAYMENT KERNEL + LEDGER + inventory allocate + delivery jobs
        │
        ├── P3 Vendor marketplace (uses P2 money + jobs + catalog)
        ├── P4 Doctor + appointments + video (uses P2 pay + P0 consent hooks)
        └── P5 Lab + collection + reports (uses P2 jobs + pay + P0 health)
                    │
                    ▼
        P6 Logistics expansion (needs P2–P5 job types in the wild)
        │
        ▼
P7 CRM + affiliate + loyalty (needs live conversion events from P2+)
P8 ERP depth + analytics warehouse (needs ledger history from P2)
P9 Second country / globalization (needs packs actually filled)
P10 Scale / extract / optimize
```

**Allowed overlap:** design and KYC queues for P3–P5 can start while P2 is in test, but **production traffic** for P3–P5 must not precede P2 exit criteria.

---

## 3. Cross-cutting (every phase)

| Track | Always in |
| --- | --- |
| Policy pack | New keys versioned; empty ≠ invented law |
| RBAC | New permissions added to [03](03_USER_ROLES_AND_PERMISSIONS.md) catalog |
| Audit | Sensitive writes + health reads |
| Outbox | Domain events for new aggregates |
| i18n | String keys; no hardcoded copy in domain |
| Observability | Metrics for new machines ([30](30_OBSERVABILITY.md)) |
| Tests | State machine + journey rows ([31](31_TESTING_STRATEGY.md)) |
| Feature flags | Runtime flags + pack gates |

---

Phase 0 **decision classification and DoD:** [38](38_PHASE_0_DECISION_BOARD.md). **Workstreams (planning only until authorized):** [39](39_PHASE_0_IMPLEMENTATION_PLAN.md).

## PHASE 0 — Architecture + design system + foundation

### Goals

A team can run the monorepo, deploy a “hello” API+web+RN shell to `dev`, authenticate a test user, and attach an **empty** country pack. No commercial healthcare features.

### Modules (kernel scaffolding)

`identity` (sessions, OTP adapter, devices), `iam` (seed roles), `compliance` (pack loader), `notification` (adapter stubs), `audit`, `analytics` (event envelope), `cms` (empty), `shared-types`, outbox dispatcher.

### Apps

Monorepo, design-system package, Next.js customer **shell**, Next.js admin **shell**, RN workspace **shell**. No store listing required.

### Events

`UserRegistered` (synthetic), `SessionRevoked`, `PackPublished` (empty).

### Exit criteria

- [04](04_APPLICATION_ARCHITECTURE.md) module boundaries enforced in CI (**OD-MONO-01** closed enough to work)
- Environments: local, dev, staging skeleton ([32](32_DEVOPS_CICD.md))
- Secrets via cloud manager; no secrets in git
- OTel + error tracker live on API ([30](30_OBSERVABILITY.md))
- Policy pack schema + technical defaults (currency/timezone/language **placeholders**, not a named country’s law)
- Threat-model lite reviewed ([27](27_SECURITY_ARCHITECTURE.md) §16)
- Synthetic data package exists
- **OD-CLOUD-01** and **OD-ORCH-01** decided or explicitly time-boxed with a default (AWS + managed containers)

### Dependencies

Blueprint 01–04; this book 27–32. Staff: tech lead, 2–4 engineers, design.

### OUT of phase

Catalog, pharmacy, payments, any PHI store, LiveKit, PSP contracts, mobile store release, “we are HIPAA/GDPR compliant.”

---

## PHASE 1 — Identity + customer + catalog + pharmacy

### Goals

Customers can register/login (OTP), browse a **country-scoped** catalog, view owned-pharmacy inventory **availability**, and pharmacy staff can manage SKUs, locations, batches (no live paid checkout). Pharmacist Rx **desk can exist in UAT** but paid Rx flow waits for P2.

### Modules

`party` (customer profile, addresses), `partner` (onboarding engine **scaffold** + internal pharmacy staff invite; public Join types stay pack-off until legal fills documents), `catalog`, `inventory` (owned), `cms` (banners), `search` (index catalog), `prescription` (upload store **encrypted**, verify UI — **no** dispense-for-money), `notification` (OTP + transactional email/SMS adapters).

### Apps

Customer web+RN: home, search, PDP, profile, addresses, Rx upload **draft**. Pharmacy web/RN: catalog, stock, expiry. Admin: country catalog publish, CMS, user lookup (masked).

### Events

`CatalogItemPublished`, `OfferChanged`, `StockAdjusted`, `PrescriptionUploaded`, `PrescriptionVerified` (no order yet).

### Exit criteria

- One identity across apps; `aud` split customer vs partner vs admin
- MFA path for professional/admin ([03](03_USER_ROLES_AND_PERMISSIONS.md) §7)
- Catalog + search p95 budgets in staging ([28](28_PERFORMANCE_ARCHITECTURE.md))
- Batch/expiry constraints enforced
- Rx images private bucket + signed URL + malware scan
- Professional KYC **queue** exists (approve may wait dual-control **OD-RBAC-01**)
- No PAN; no wallet; no LiveKit

### Dependencies

Phase 0. **OD-COUNTRY-01** should be **narrowed** (even if pack still empty of law) so locales/currency placeholders are coherent. Maps adapter stub (**OD-CUS-06** / **OD-LOG-01**).

### OUT of phase

Checkout, PSP, ledger postings, marketplace vendors, doctors, labs, affiliates, COD, settlements. **Do not** take real customer money.

---

## PHASE 2 — Orders + payments + inventory + delivery

### Goals

**First live commercial loop:** J01 (OTC), J02 (Rx → order), J04 (track), J16 (refund), J21 (rider earnings **accrual**). Owned pharmacy only.

**This phase is the money kernel.** Marketplace must not start without it.

### Modules

`order`, `payment` (CheckoutSession, PaymentIntent, one PSP adapter, webhooks, COD if pack), `wallet` **off** unless **OD-PAY-05** legal yes (default off), `ledger` (**double-entry from day one**), `settlement` (rider AP at least; vendor/doctor/lab AP **tables exist**, unused), `logistics` (MEDICINE_DELIVERY job), `inventory` allocate/FEFO, `notification` order/job.

### Apps

Customer checkout, order history, tracking. Pharmacy: accept, pack, handoff. Delivery RN. Admin/finance: recon dashboard v0, refund dual-control.

### Events

`CheckoutSessionPaid`, `PaymentCaptured`, `PaymentFailed`, `RefundSucceeded`, `OrderPlaced`, `OrderCancelled`, `InventoryReserved`, `LogisticsJobCompleted`, `LedgerPosted`.

### Exit criteria

- Idempotent money POSTs; webhook signature + replay tests **green** ([31](31_TESTING_STRATEGY.md) §11)
- Outbox: **zero silent drop** of ledger events in soak
- Journal balanced for capture, refund, COD receivable, rider AP
- Daily PSP file recon **process** exists (even if manual finance confirm)
- OTP POD on delivery (**OD-LOG-09** default OTP on)
- J01, J02, J04, J16 e2e on synthetic
- PCI minimization: hosted fields / redirect only
- Wallet remains **off** until legal pack

### Dependencies

Phase 1 catalog+inventory+identity. PSP contract (**OD-PAY-01** merchant of record **must be at least provisionally decided** for the launch entity). Ledger **OD-LED-04** default (one store, entity_id).

### OUT of phase

Vendors, doctors, labs, affiliates, loyalty, ERP procurement, multi-vendor cart, BNPL, multi-region. **Do not** skip ledger “until we have accountants.”

---

## PHASE 3 — Vendor marketplace

### Goals

J03 vendor order, J18 vendor settlement. KYC, listing queue, commission, SLA accept.

### Modules

`party` vendor org, `catalog` vendor offers, `inventory` vendor, `order` seller = vendor org, `settlement` vendor AP (**OD-LED-08** POD recognition default), `support` vendor tickets.

### Apps

Vendor RN/web. Admin: KYC, listing moderation, commission config. Customer: vendor badge, SLA copy.

### Events

`VendorKycApproved`, `ListingPublished`, `VendorOrderAccepted`, `VendorOrderTimeout`, `VendorPayableRecognized`.

### Exit criteria

- v1 **one vendor per goods order** (A-CUS-02)
- Timeout auto-cancel + refund path reuses P2 J16
- Vendor cannot see other vendors’ stock/cost
- Chargeback reserve hook (**OD-PAY-12** follows **OD-PAY-01**)
- Authenticity / license flags as **ops queue**, not a claimed drug-track-and-trace network
- J03, J18 e2e

### Dependencies

**Phase 2 exit.** Legal marketplace operator vs facilitator (**OD-PAY-01**). **OD-VEND-01** Rx by vendor default **owned pharmacy only**.

### OUT of phase

Multi-vendor cart, vendor self-delivery unless **OD-VEND-07** flips, DSCSA-class traceability, B2B hospital supply.

---

## PHASE 4 — Doctor + appointments + video

### Goals

J05 book, J06 video/audio/chat, J07 digital Rx (if pack), J08 order-from-Rx, J19 doctor settlement.

### Modules

`care`, `video` (LiveKit adapter), platform **chat SoT**, `prescription` structured sign, `health` artifacts + **ConsentGrant**, `payment` AUTH vs CAPTURE per **OD-PAY-02**, `ledger` doctor AP.

### Apps

Doctor RN/web, customer doctor discover/slots/waiting room, admin medical reviewer if pack.

### Events

`AppointmentConfirmed`, `EncounterCompleted`, `PrescriptionSigned`, `VideoSessionEnded`, `ConsentGrantActivated`.

### Exit criteria

- Recording **default false**; consult continues if denied
- Consent: booking ≠ historic record dump ([16](16_HEALTH_RECORD.md))
- Slot optimistic lock; no double book
- TTFF p95 staging under good-network profile
- Chat survives SFU drop
- Doctor KYC + license queue; dual control per **OD-RBAC-01** default prod
- No automatic financial no-show penalty until **OD-DOC-02** pack
- J05–J08, J19 e2e; chaos: LiveKit down → degrade
- **LEGAL/COMPLIANCE REVIEW** before enabling telemedicine in a named country

### Dependencies

Phase 2 payment (auth/capture). Phase 0 consent/health table stubs. **OD-VID-01**. Maps not required for video.

### OUT of phase

PSTN (**OD-VID-07**), hospital EMR, CDS diagnosis, insurance TPA, caregiver accounts (**OD-CUS-04** / **OD-RBAC-03**).

---

## PHASE 5 — Lab + home collection + reports

### Goals

J09–J13 (and J14–J15 if print is in scope). Home-first if pack. Chain of custody. Pathologist sign. Health artifact report. J20 lab settlement per **OD-LAB-02** / **OD-LED-01**.

### Modules

`diagnostics`, logistics `SAMPLE_COLLECTION` + `SAMPLE_TRANSPORT` + `REPORT_DELIVERY`, `health` reports, `notification` (panic **flag** only unless pack).

### Apps

Lab portal, pathologist, phlebotomist RN, customer lab book/report, admin lab KYC.

### Events

`LabBookingConfirmed`, `SampleCollected`, `SampleAccessioned`, `SampleRejected`, `ReportSigned`, `ReportReleased`, `PanicFlagRaised`.

### Exit criteria

- Barcode mismatch **hard stop**
- SoD enter vs sign unless pack relaxes (**OD-LAB-17** default separate)
- No results in insecure SMS if pack forbids
- Bill recognition matches **OD-LED-01** default (cash unearned at book; AP on report) until legal says otherwise
- COD labs **default off** (**OD-LAB-16**)
- J09–J13 e2e; J14–J15 if print fee in pack
- **LEGAL REVIEW** lab marketplace + e-sign report

### Dependencies

Phase 2 jobs+pay+ledger. Phase 4 optional for “doctor ordered tests” **deep link**; not a blocker for customer-booked labs.

### OUT of phase

Split package across labs (**OD-LAB-15** no), LIS replacement for large chains, genomic interpretation, insurance adjudication.

---

## PHASE 6 — Logistics expansion

### Goals

Reliability and density: batching, better assignment (**OD-LOG-02**), 3PL adapter, sample+medicine+report job mixing on one engine (already typed; now operationalize), cash-in COD, capacity heatmaps.

### Modules

`logistics` depth, `settlement` rider calendars (**OD-LED-12**), maps/ETA production grade.

### Apps

Dispatcher console, fleet org, delivery app polish (battery, offline GPS queue).

### Events

`JobReassigned`, `CodRemitted`, `SlaBreached`.

### Exit criteria

- Single-stop pair still default for specimens until **OD-LOG-10**
- COD remittance recon vs ledger
- Fake POD metrics + ops queue
- Dual role phlebotomist+rider gated by capability (**OD-LOG-12**)

### Dependencies

P2–P5 job types actually used. **OD-LOG-01** maps vendor.

### OUT of phase

Drones, dark stores, full network optimization research lab.

---

## PHASE 7 — CRM + affiliate + loyalty

### Goals

J17 affiliate. Tickets without clinical payload. Campaigns with **marketing opt-in**. Loyalty/membership only if **OD-CUS-12/13** and legal inducement review pass; else **coupons only**.

### Modules

`crm`, `support`, `affiliate`, optional `loyalty` subledger.

### Apps

APP-CRM, affiliate portal, customer referral screen (if pack).

### Events

`TicketOpened`, `CampaignSent`, `AffiliateConversionAttributed`, `CommissionApproved`, `CommissionReversed`.

### Exit criteria

- Support **cannot** load Rx images by default (**OD-RBAC-02**)
- Affiliate clinical categories **default off** (**OD-AFF-03**)
- Self-referral and coupon stacking rules
- WhatsApp marketing ≠ transactional OTP path (**OD-CRM-02**)
- J17 e2e

### Dependencies

P2+ conversion events. **LEGAL REVIEW** referral fees / inducement.

### OUT of phase

Full CDX/marketing cloud, household accounts, insurance CRM.

---

## PHASE 8 — ERP + analytics

### Goals

Admin ERP depth: procurement (owned pharmacy), period close, tax mapping **after legal**, G/L export (**OD-LED-14**), warehouse of **business** events, country ops dashboards.

### Modules

`ledger` close, `cms` depth, procurement (new or under inventory), `analytics` warehouse sink.

### Apps

APP-FIN, APP-OPS depth, analyst read models (no clinical payload).

### Events

`PeriodClosed`, `PayoutBatchExecuted`, `ReconBreakOpened`.

### Exit criteria

- Period close dual control ([03](03_USER_ROLES_AND_PERMISSIONS.md) SoD)
- Warehouse contract: metadata only
- Custom org roles **subsets only** (03 §9)

### Dependencies

Ledger history from P2+. Tax engine **OD-LED-02**.

### OUT of phase

Full statutory accounting product, manufacturing MRP, HIS.

---

## PHASE 9 — Globalization + country expansion

### Goals

Second country (or first **real** pack fill if launch was TBD). Residency pin if required. New PSP/methods. i18n completeness. Time-to-add-country measured as **config vs code**.

### Modules

`compliance` packs, payment routing, notification adapters, tax tables **filled by legal**.

### Apps

Same binaries; pack-driven. Optional white-label **still out**.

### Events

`CountryPackActivated`, `ResidencyPinEnabled`.

### Exit criteria

- No `country = IN` (or any code) hardcoded
- Second pack does not fork the monolith
- Data pin runbook if legal requires
- Telemedicine/Rx/lab flags independently gated

### Dependencies

**OD-COUNTRY-01** and a **second** country decision. Legal reviews per [19](19_COMPLIANCE_FRAMEWORK.md).

### OUT of phase

Rewrite-per-country. Assuming one messenger (WhatsApp) globally.

---

## PHASE 10 — Scale + optimization

### Goals

Meet p95 under real load; extract **only** proven hot/compliance domains (candidates: payment orchestration, video, search, logistics tracking, analytics ingest). Cost, chaos in prod (controlled), DR drill.

### Modules

Same; optional extract behind **same APIs**.

### Apps

Performance; maybe store listing split.

### Events

Unchanged contracts.

### Exit criteria

- Load/chaos goals ([28](28_PERFORMANCE_ARCHITECTURE.md), [31](31_TESTING_STRATEGY.md))
- Extraction RFC only with SRE+domain owners
- No microservice mesh as fashion

### Dependencies

Production traffic. **OD-SLA-01** if selling SLAs.

### OUT of phase

Big-bang rewrite; in-house SFU; in-house acquirer.

---

## 4. Journey coverage by phase

| Journeys | First production-capable phase |
| --- | --- |
| J01, J02, J04, J16, J21 | 2 |
| J03, J18 | 3 |
| J05–J08, J19 | 4 |
| J09–J13, J20; J14–J15 if print | 5 |
| J17 | 7 |

---

## 5. Staffing / parallelization (guidance)

- After P2, **P3 / P4 / P5** can be **three workstreams** if staffing allows, sharing payment/ledger/logistics owners.
- Do not run three streams that each invent a second payment service.
- Policy pack and identity remain a **platform** team.

---

## 6. Open decisions that **block** a phase

| Phase | Blocking ODs (examples) |
| --- | --- |
| 0 | OD-CLOUD-01, OD-ORCH-01, OD-MONO-01 |
| 1 | OD-COUNTRY-01 (direction), OD-CUS-05 social |
| 2 | OD-PAY-01 MoR, PSP selection (vendor, not invented law), OD-PAY-02 capture mode |
| 3 | OD-PAY-01, OD-VEND-01 Rx, OD-LED-08 |
| 4 | OD-VID-01, OD-DOC-02 before **paid** penalties, OD-RBAC-01 |
| 5 | OD-LAB-02 / OD-LED-01, OD-LAB-08 e-sign legal |
| 7 | OD-AFF-03, OD-CUS-12 membership |
| 9 | Second country legal pack |

Full catalog: [35](35_OPEN_DECISIONS.md).

---

## 7. Risks of skipping sequence

| Skip | Likely failure |
| --- | --- |
| Ledger after marketplace | Unreconcilable vendor AP ([34](34_RISK_REGISTER.md) R-PAY recon) |
| Marketplace before payment kernel | Double charge, no refund path |
| Video before consent/identity | Unbounded PHI in SFU |
| Second country by fork | Rewrite pressure (R-GLOB) |
| k8s in P0 | Delivery stall (R-ARCH premature services) |
