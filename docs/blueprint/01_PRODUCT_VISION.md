# 01 — Product Vision

**Status:** Blueprint  
**Audience:** Founders, product, architecture, engineering, operations, compliance  
**Related:** [Master Index](00_MASTER_INDEX.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md)

---

## 1. Vision statement

World Pharma is a **global healthcare super platform**: one identity, one customer profile, one health record, one ledger, and one logistics and payment kernel powering pharmacy, marketplace, telemedicine, diagnostics, and healthcare logistics across countries.

The product is not a pharmacy clone, not a doctor-app clone, and not a lab-app clone. It is a **configurable healthcare operating system** that countries, organizations, and roles plug into.

**ASSUMPTION:** “World Pharma” is the working product name taken from the repository. Final brand, legal entity name, and market-facing names are an **OPEN DECISION**.

---

## 2. Problem

Healthcare demand is fragmented across:

- Medicine discovery and fulfillment
- Prescription capture and validation
- Doctor access and follow-up
- Laboratory testing, home collection, and reporting
- Last-mile healthcare logistics
- Payments, refunds, and multi-party settlement
- Country-specific regulation, language, tax, and privacy

Patients repeat identity, addresses, documents, and medical history in disconnected apps. Pharmacies, labs, doctors, and couriers cannot share operational state. Finance cannot reconcile multi-party healthcare commerce. Expansion into a new country typically means a rewrite because India-specific (or any single-country) assumptions were hardcoded.

World Pharma exists to collapse that fragmentation into **one platform with country policy packs**, not N disconnected products.

---

## 3. Product principles

1. **One platform, many experiences.** Customer, pharmacy, vendor, doctor, lab, phlebotomist, pathologist, delivery partner, affiliate, and admin apps are clients of the same kernel.
2. **Country is a first-class dimension.** Language, currency, tax, payments, catalog rules, professional licensing, logistics, and data residency are configuration, not forks.
3. **Health data is not marketplace data.** Commerce objects (cart, SKU, commission) and clinical objects (prescription, sample, report) share identity and audit, but have stricter access, consent, and retention.
4. **Money is never informal.** Every fee, commission, tax, refund, COD, and payout is a ledger event.
5. **Logistics is a capability, not an app feature.** Medicine delivery, sample movement, and report delivery are job types on one engine.
6. **Config over code.** Service availability, Rx rules, KYC, settlement cycles, and recording policy live in Country Policy Packs.
7. **Modular monolith first.** Bounded contexts with a path to extract services. Do not start with a microservice mesh.
8. **Do not invent law.** Regulatory specifics are flagged for legal review and encoded only after verification.
9. **Auditability by default.** Sensitive mutations are attributable, immutable in the audit trail, and country-scoped.
10. **Accessibility and trust.** Healthcare UX must work under poor networks, low literacy, and assistive technologies.

---

## 4. What we are building (scope in)

| Domain | What “in” means |
| --- | --- |
| Identity | Single account model; multiple roles; device and session security |
| Customer super app | Medicine, marketplace, doctors, labs, wallet, health record, support |
| Own pharmacy | Stores, warehouses, inventory, batch/expiry, Rx verification, billing |
| Vendor marketplace | KYC, listing, inventory, commission, settlement |
| Doctors | Onboarding, discovery, booking, video/audio/chat, digital Rx |
| Diagnostics | Test catalog, home collection, lab processing, pathologist, reports |
| Logistics | Partner network, assignment, tracking, OTP/POD, multi-job types |
| Payments | Multi-gateway orchestration, multi-currency, refunds, wallets |
| Ledger | Double-entry style journal, settlements, reconciliation |
| Affiliate | Attribution, configurable commissions, fraud controls |
| CRM | Customer 360, campaigns, tickets, lifecycle |
| Health record | Unified artifacts with consent |
| Admin / ERP | Country-aware operations, finance, CMS, compliance, analytics |
| Platform | Search, notifications, observability, RBAC, CMS |

---

## 5. What we are not building (scope out / later)

| Item | Reason |
| --- | --- |
| Hospital HIS/EMR replacement | Different product; may integrate later |
| Insurance adjudication / TPA core | **OPEN DECISION**; integration adapters only in early phases |
| Drug manufacturing / DSCSA full track-and-trace | Partner/compliance later; batch/expiry is in scope |
| Clinical decision support that diagnoses | Liability; doctors remain accountable |
| In-house video SFU from scratch | Use proven WebRTC infrastructure |
| In-house payment acquiring | Orchestrate licensed gateways |
| Autonomous drones / dark stores v1 | Future logistics, not Phase 1 |
| Social network / content community v1 | Not required for MVP commerce+care |
| Hardcoded single-country product | Explicitly forbidden |

**OPEN DECISION:** Whether B2B hospital supply, corporate health plans, or insurance-backed orders are in the 24-month roadmap.

---

## 6. Target users

| Persona | Primary jobs-to-be-done |
| --- | --- |
| Patient / caregiver | Find medicine, upload Rx, consult a doctor, book tests, receive reports, track delivery |
| Pharmacist / store manager | Verify Rx, pick/pack, inventory, expiry, dispatch |
| Vendor | List products, fulfill orders, view settlements |
| Doctor | Consult, access consented records, prescribe, earn |
| Lab operator | Capacity, samples, QC, reports, billing |
| Phlebotomist | Collect, barcode, chain of custody |
| Pathologist | Review, approve, sign reports |
| Delivery partner | Accept jobs, navigate, OTP, earn |
| Affiliate | Refer eligible services, track conversion |
| Country admin | Operate a country: catalog, KYC, compliance flags, settlements |
| Super admin | Global config, policy packs, break-glass |

---

## 7. Experience thesis

The customer should feel one healthcare home:

- Search once across medicines, tests, and doctors.
- A prescription can become a medicine order without re-entering identity.
- A doctor can request a lab test that the patient can book in-flow.
- Reports land in the same health timeline as prescriptions and consult notes.
- Tracking is as clear as a modern food-delivery product, with healthcare-grade identity checks.

Supply-side users should feel role-native apps (pharmacist vs pathologist vs rider) on **shared operational objects** (order, sample, job, encounter).

---

## 8. Global thesis

The platform must be correct in **more than one country** without a rewrite.

That requires:

- Country Policy Packs (see [18_GLOBALIZATION.md](18_GLOBALIZATION.md) and [19_COMPLIANCE_FRAMEWORK.md](19_COMPLIANCE_FRAMEWORK.md))
- Multi-currency money objects that never destroy the original currency
- Gateway and payment-method routing
- Service availability flags (e.g. UPI, WhatsApp, home collection, controlled medicines)
- Data residency hooks (logical tenancy now, physical split when legally required)

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country launch: pharmacy licensing, telemedicine, lab accreditation, e-prescription validity, data protection, e-commerce, payments, and advertising of medicines.

**ASSUMPTION:** Initial engineering proceeds with a “launch country TBD” policy pack that is empty of invented legal rules and filled with technical defaults (currency, timezone, language).

---

## 9. Success metrics (directional)

**OPEN DECISION:** Numeric targets. Directional categories:

| Category | Examples |
| --- | --- |
| Trust | Rx verification TAT, report turnaround, complaint rate, data incidents = 0 |
| Liquidity | Catalog coverage, doctor fill rate, lab slot utilization, rider acceptance |
| Reliability | Order success, payment success, video join success, sample rejection rate |
| Finance | Reconciliation breaks, settlement on-time %, refund cycle time |
| Global | Time-to-add-country (config vs code), % features gated by policy pack |
| Performance | p95 API, p95 search, video time-to-first-frame |

---

## 10. Non-goals of this blueprint stage

- Visual UI implementation
- Production APIs, migrations, or design tokens in code
- Choosing a single payment gateway as “the” processor
- Claiming HIPAA/GDPR/DPDP certification

This stage produces the **implementation-ready blueprint** so Phase 0 engineering has a single source of truth.

---

## 11. How to read the rest of the blueprint

1. [02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) — domains, journeys, traceability
2. [04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) — apps and kernel
3. Domain books 05–17 — product modules
4. [20_DATABASE_ARCHITECTURE.md](20_DATABASE_ARCHITECTURE.md) and [21_API_ARCHITECTURE.md](21_API_ARCHITECTURE.md) — implementation contracts
5. [33_DEVELOPMENT_ROADMAP.md](33_DEVELOPMENT_ROADMAP.md) — what to build when
6. [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md) — what must be decided before/during Phase 0
