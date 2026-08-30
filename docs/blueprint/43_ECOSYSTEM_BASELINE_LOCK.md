# 43 — Ecosystem Baseline Lock

**Status:** LOCKED baseline (documentation only)  
**Effective:** 26 August 2026  
**Authority:** Master Blueprint review complete. This file freezes **what the product is**, not a new product.  
**Canonical:** [00](00_MASTER_INDEX.md) and books [01](01_PRODUCT_VISION.md)–[42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md)

This document does **not** add modules, domains, partner types, or technologies. It records the freeze of requirements already approved in the Master Blueprint and subsequent requirement additions already in those books.

---

## Governing statements

**Blueprint is the single source of truth.**

**New requirements require formal change review.**

**Existing requirements must not be silently removed or altered.**

**Core architecture must not be replaced without an approved architecture decision.**

If a later note, ticket, or implementation disagrees with a locked book, the **book wins** until a Change Request (CR) is accepted and the blueprint is updated.

---

## 1. Locked ecosystem scope

World Pharma is a **global healthcare super platform**: one identity, one customer profile, one health record, one ledger, and one logistics and payment kernel powering pharmacy, marketplace, telemedicine, diagnostics, and healthcare logistics across countries ([01](01_PRODUCT_VISION.md)).

It is **not** a single-country pharmacy clone, not a set of disconnected apps, and **not** a hospital HIS/EMR replacement.

### 1.1 In scope (locked)

| Area | Locked meaning |
| --- | --- |
| Identity | Single Person/Account model; multiple roles; OTP/session/MFA as specified |
| Customer super app | Medicine, marketplace, doctors, labs, wallet (country-gated), health record, support |
| Own pharmacy | Stores, warehouses, inventory, batch/expiry, Rx verification, billing |
| Vendor marketplace | KYC via partner engine, listings, orders, commission, settlement |
| Doctors | Onboarding, calendar, consults (video/audio/chat), digital Rx, earnings |
| Diagnostics | Catalog, bookings, samples, QC, pathologist, digital and physical reports |
| Logistics | Multi-type jobs on one engine (medicine, sample, report) |
| Payments | Multi-gateway orchestration; multi-currency; refunds; no in-house acquiring |
| Finance | Double-entry-style ledger, participant settlement, country-gated wallet |
| Growth | Affiliate, coupons, loyalty/membership (phased; country-gated) |
| CRM / support | Customer 360, campaigns, tickets |
| Health record | Artifacts + consent; doctors are not unrestricted |
| Admin / ERP | One admin web product with permission shells |
| Global | Countries, languages, currencies, Country Policy Packs |
| Platform | RBAC, search, notifications, audit, observability |
| Partner join | One Partner Onboarding Engine ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)) |

### 1.2 Explicitly out of scope (locked unless a CR opens them)

Hospital HIS replacement; insurance/TPA core; manufacturing serialization / full DSCSA track-and-trace; diagnostic AI that diagnoses; in-house card acquiring; in-house SFU from scratch; hardcoded single-country product; social network / content community as v1; autonomous drones / dark stores as v1.

B2B hospital supply, corporate health plans, and insurance-backed orders remain **OPEN DECISION** in [35](35_OPEN_DECISIONS.md) — they are **not** silently added to v1.

---

## 2. Locked application surfaces

Clients of **one kernel**. They must not embed a second identity, payment, or ledger ([04](04_APPLICATION_ARCHITECTURE.md)).

Admin experiences are **one Next.js app** with permission-based shells, not five codebases ([00](00_MASTER_INDEX.md) §4).

| ID | Surface | Clients |
| --- | --- | --- |
| APP-CUS-M | Customer Mobile | React Native Android/iOS |
| APP-CUS-W | Customer Web | Next.js |
| APP-PHARM | Store / Pharmacy | RN + Web |
| APP-VEND | Vendor App / Portal | RN + Web |
| APP-DOC | Doctor App | RN + Web |
| APP-LAB-W | Lab Management Portal | Web |
| APP-LAB-S | Lab Staff App | RN |
| APP-PHE | Phlebotomist App | RN |
| APP-PATH | Pathologist Portal | Web |
| APP-DEL | Delivery Partner App | RN |
| APP-JOIN-W | Join us / Become a partner | Next.js public + applicant ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)) |
| APP-ADM | Admin suite (super, country, ops, finance, CRM shells) | Next.js |

**Phase 0 constraint (locked):** no public Join activation, no partner dashboards, no pharmacy/doctor/lab/delivery/marketplace UI until the corresponding phase is authorized ([38](38_PHASE_0_DECISION_BOARD.md), [39](39_PHASE_0_IMPLEMENTATION_PLAN.md)).

Adding a new store listing, BFF, or standalone admin codebase is a CR.

---

## 3. Locked business domains

Kernel bounded contexts ([00](00_MASTER_INDEX.md) §5, [02](02_BUSINESS_ARCHITECTURE.md) §3):

`identity` · `iam` · `party` · `partner` · `catalog` · `inventory` · `order` · `prescription` · `care` · `video` · `diagnostics` · `logistics` · `payment` · `wallet` · `ledger` · `settlement` · `affiliate` · `crm` · `support` · `health` · `notification` · `search` · `compliance` · `cms` · `analytics`

Type-specific operating books ([06](06_PHARMACY_PLATFORM.md)–[16](16_HEALTH_RECORD.md), [14](14_AFFILIATE_PLATFORM.md)) own **post-ACTIVE** workflows. They must not invent a second registration, KYC, identity, payment, or ledger product.

A new commercial domain (insurance core, HIS, manufacturing, social, in-house acquiring, etc.) is a CR.

---

## 4. Locked partner types

Canonical catalog ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §3). Types are **catalog rows + Country Policy Pack overlay**, not separate user tables.

| Code | Typical subject |
| --- | --- |
| `DOCTOR` | Person (optional clinic membership) |
| `PHARMACY` | Organization |
| `VENDOR` | Organization |
| `LAB` | Organization |
| `DELIVERY_PARTNER` | Person or fleet organization |
| `PHLEBOTOMIST` | Person |
| `PATHOLOGIST` | Person (lab association to sign) |
| `CLINIC` | Organization |
| `HOSPITAL` | Organization |
| `AFFILIATE` | Person or organization |
| `HEALTHCARE_BUSINESS` | Organization |

Future types are allowed **only** by catalog + pack + type-specific profile referencing the canonical Partner model — **not** a second identity system and **not** a silent schema fork.

**OD-PTR-04** (HOSPITAL vs CLINIC subtype) remains an open decision. Until decided: keep **separate type codes**; packs enable each independently. Do not delete either code without a CR.

---

## 5. Locked global architecture principles

From [01](01_PRODUCT_VISION.md), [04](04_APPLICATION_ARCHITECTURE.md), [00](00_MASTER_INDEX.md) §10:

1. **Modular monolith first** (NestJS + TypeScript). Extract payment, video, search, tracking, or analytics only when scale, failure isolation, or residency requires it. Clients keep the same APIs (**OD-ARCH-01** confirmed).
2. **One kernel, many experience apps.**
3. **Country is a first-class dimension.** No country forks.
4. **Config over code.** Country Policy Packs; empty pack ≠ invented law.
5. **PostgreSQL** OLTP with `country_id` + RLS; UUID identifiers as specified; integer money; UTC storage.
6. **Redis + BullMQ** for cache/jobs; Kafka only if later evidence requires it (CR + ADR).
7. **OpenSearch** for search; no clinical notes in the index.
8. **S3-compatible** private objects for PHI; no public ACLs on Rx/KYC/reports.
9. **Outbox → domain events**; at-least-once + inbox.
10. **Single API**, no BFF in v1 (**OD-API-07** engineering default).
11. **Containers + managed Postgres/Redis**; not Kubernetes day one.
12. **Cloud:** AWS engineering default (**OD-CLOUD-01** still human-decidable); single cloud.
13. **Nx monorepo** engineering default.

Replacing the modular monolith with microservices-on-day-one, a second database as system of record, or a second identity stack requires an **approved architecture decision** (ADR) via the CR process below.

---

## 6. Locked security principles

From [27](27_SECURITY_ARCHITECTURE.md), [19](19_COMPLIANCE_FRAMEWORK.md), [03](03_USER_ROLES_AND_PERMISSIONS.md):

1. Security is a **kernel** concern, not an app feature.
2. **Health data is not marketplace data.**
3. **Never trust the client** for role, country, price, eligibility, or consent.
4. **Least privilege and deny-by-default** for clinical payload and money writes.
5. **Auditability by default** for sensitive mutations and health-payload reads.
6. **Do not invent law.** No HIPAA/GDPR/DPDP certification claims in engineering docs.
7. **No PAN/CVV** on platform; PSP tokens only.
8. **JWT + permission** on protected APIs; fail-closed policy resolver.
9. **ConsentGrant** required for health artifact access; support tooling has no clinical payload by default.
10. Video **recording default false**; consult continues if recording is denied.
11. KYC blobs are private object-store references, not public URLs, and not PostgreSQL file bytes.
12. **Platform/company management authority is exclusively company-controlled. Partner organization administration is organization-scoped and cannot escalate to platform authority** ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md), [03](03_USER_ROLES_AND_PERMISSIONS.md)).
13. **One global company-controlled platform.** Regions, countries, and legal entities are configuration, not separate identity systems or country forks ([87](87_GLOBAL_MNC_RETROFIT_AUDIT.md)).
14. **One application topology and company control plane.** Canonical clients are listed in [88](88_GLOBAL_APPLICATION_TOPOLOGY.md). Company hierarchy and partner boundaries are in [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md). No generic Partner App. Affiliate is web-first. No second identity, API, or event bus.

---

## 7. Locked financial architecture

From [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md):

1. Payment is **orchestration of licensed PSPs**, not in-house acquiring or a bank.
2. Ledger is the **system of record** for who is owed what; payment records instrument movement.
3. **Double-entry-style journal from Phase 2** — not postponed to ERP.
4. Journal is **immutable**; corrections are reversing entries.
5. Original transaction currency is **never destroyed**.
6. Integer minor units + ISO 4217; never float.
7. Wallet is **country-gated** stored value; not a global default.
8. Every fee, commission, tax, refund, COD, and payout is a ledger event.
9. Money POSTs are **idempotent**.
10. Affiliate and clinical fee-splitting are **country-gated**; illegal inducement is forbidden.

---

## 8. Locked warehouse / fulfillment architecture

From [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md):

1. Owned pharmacy Locations are `STORE` or `WAREHOUSE` (dark-store is **not v1**).
2. Default: **stores dispatch to customer**; warehouse **replenishes stores** (**OD-PHARM-01** still open for warehouse ship-to-customer).
3. A goods **Order** has exactly one selling Organization; owned-pharmacy lines never mix a vendor’s lines.
4. Logistics is a **kernel job engine**, not an app feature.
5. Locked job types: `MEDICINE_DELIVERY`, `SAMPLE_COLLECTION`, `SAMPLE_TRANSPORT`, `REPORT_DELIVERY`. `GENERIC_HEALTHCARE` is reserved, not v1.
6. `REPORT_DELIVERY` jobs **never** attach clinical PDFs.
7. Pharmacy staff never capture cards.
8. Multi-vendor **goods** order is **not v1**.

---

## 9. Locked healthcare architecture

From [08](08_DOCTOR_PLATFORM.md), [09](09_LAB_PLATFORM.md), [16](16_HEALTH_RECORD.md):

1. Health record is consent-governed artifacts + timeline — **not** a hospital HIS.
2. Commerce objects and clinical objects share identity and audit, with **stricter** access, consent, and retention for clinical.
3. Doctors remain clinically accountable; the platform does not diagnose.
4. Video: LiveKit SFU; platform chat is source of truth; recording off by default.
5. Lab chain of custody and pathologist sign-off are first-class; reports land in the health timeline.
6. Prescription verification remains a pharmacy responsibility unless a future CR + legal review changes pack policy (**OD-PHARM-04** default: still verify).
7. Partners may remain controllers of **their** original records; the platform holds copy or pointer (**OD-EHR-01/02** open legally, engineering must still support purpose limitation and residency flags).

---

## 10. Locked globalization architecture

From [18](18_GLOBALIZATION.md), [19](19_COMPLIANCE_FRAMEWORK.md):

1. **Config over code.** No country product forks.
2. **No invented law.** Pack keys exist; legal values empty until reviewed. Disabled services stay off.
3. **Do not hardcode a launch country.**
4. UTC persist, IANA display.
5. Residency is a **mode**, not a rewrite.
6. Wallet and WhatsApp are **not** global defaults.
7. Fail-closed policy resolver; unpublished / missing pack ⇒ deny regulated capability.
8. `join_public` remains pack-driven; Phase 0 empty pack is `false`.

---

## 11. Locked performance principles

From [28](28_PERFORMANCE_ARCHITECTURE.md):

1. Performance is a kernel quality attribute, not a late pass.
2. Cache public/slow-changing data; **never** cache authorization or clinical payload as public.
3. Cursor pagination for operational lists.
4. Read models for catalog/search/tracking; OLTP remains source of truth.
5. Async for work that is not the user’s next click.
6. Idempotency on money and state-machine transitions.
7. Residency before global CDN durable store for health blobs.
8. Directional engineering budgets (API read/write, search, video TTFF, webhooks) are **not** contractual SLAs until **OD-SLA-01**.

---

## 12. Phase 0–future development boundaries

Locked sequence ([33](33_DEVELOPMENT_ROADMAP.md), [00](00_MASTER_INDEX.md) §8–9):

| Phase | Boundary |
| --- | --- |
| **0** | Foundation: packs, identity kernel, partner **dark model**, design system, CI, observability. No customer pharmacy/doctor/lab/delivery/marketplace screens. No public Join. |
| **1** | Identity + customer shell + catalog + owned pharmacy **unpaid** |
| **2** | Orders + **payment kernel** + **ledger** + inventory + medicine delivery. Ledger is **not** postponed. |
| **3** | Vendor marketplace (requires Phase 2 money + jobs) |
| **4** | Doctor + video (consent + pay) |
| **5** | Lab + collection + reports |
| **6** | Logistics expansion |
| **7** | CRM + affiliate + loyalty |
| **8** | ERP depth + analytics warehouse |
| **9** | Second country / filled packs (not a fork) |
| **10** | Scale / **optional** service extraction |

**Hard rules (locked):**

- Production traffic for marketplace, doctor, or lab must not precede Phase 2 money.
- Microservices extraction is **not** a starting architecture and is not a substitute for Phase 0–2.
- Country enablement of regulated features is a **legal/compliance gate**, not a coding gate.
- Implementation notes [40](40_IDENTITY_IMPLEMENTATION_NOTES.md)–[42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md) record **how** authorized Phase 0 tasks were built; they do **not** expand product scope.

---

## Change Request process

No new core module, business domain, architecture pattern, or technology may enter the product without this path.

```
CR
  → Impact Analysis
  → Security / Compliance Review
  → Architecture Review
  → Decision
  → Blueprint Update
  → Implementation
```

| Step | Owner | Required output |
| --- | --- | --- |
| **CR** | Requestor (product, eng, ops, legal) | Problem, proposed change, why the baseline is insufficient, affected books |
| **Impact Analysis** | Product + engineering | Journeys, tables, APIs, packs, phases, cost/risk, what would be **removed** if anything |
| **Security / Compliance Review** | Security + compliance | Authz, PHI, KYC, money, residency, “do not invent law” check |
| **Architecture Review** | Architecture | Kernel vs app, monolith boundaries, data model, events; ADR if architecture changes |
| **Decision** | Named approvers (founder/product + architecture; legal/finance when money, clinical, or country law) | `ACCEPT` / `ACCEPT_WITH_CONDITIONS` / `REJECT` / `DEFER` |
| **Blueprint Update** | Architecture + product | Edit the **canonical book(s)** and [35](35_OPEN_DECISIONS.md) / this lock if scope changes. Index [00](00_MASTER_INDEX.md) if a new book is required |
| **Implementation** | Engineering | Only after the blueprint update is merged. Code must not precede the book |

### CR rules

- A CR **cannot** silently delete or weaken an existing requirement. Removals must be explicit in the CR and in the blueprint diff.
- Engineering defaults in [38](38_PHASE_0_DECISION_BOARD.md) may be used as **technical behavior**, not as law. Changing a `REQUIRES_HUMAN_DECISION` item still needs the human owner — a CR does not invent that answer.
- Implementation-only bugs (wrong code vs book) are **not** CRs; fix the code to match the blueprint.
- If code and blueprint diverge, **stop and reconcile via CR or defect** — do not “just change the book” in a task branch without review.

### Architecture Decision Records (ADR)

Any replacement of locked architecture (monolith → services, new system of record, new identity, new payment pattern, new video stack, new search engine as SoT) requires:

1. CR as above  
2. Written ADR referenced from [04](04_APPLICATION_ARCHITECTURE.md) / [35](35_OPEN_DECISIONS.md)  
3. Update of this lock file’s affected section  

---

## Known tensions (not silently “fixed”)

These are **documentation inconsistencies** already in the baseline. They stay visible until a CR or an open-decision close resolves them. This freeze does **not** pick a winner except where a book is already marked canonical.

| Tension | Sources | Freeze stance until CR |
| --- | --- | --- |
| Partner type codes (`PHARMACY` vs `PHARMACY`, `DELIVERY_PARTNER` vs `DELIVERY_PARTNER`, `PHLEBOTOMIST` vs `PHLEBOTOMIST`) | [00](00_MASTER_INDEX.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md), implementation notes | **[36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) is canonical** for onboarding types |
| Admin: one Next.js shell vs multiple APP-ADM-* IDs | [00](00_MASTER_INDEX.md) §4 vs [04](04_APPLICATION_ARCHITECTURE.md) inventory | **One admin codebase**, multiple permission shells / logical IDs |
| Index completeness row “repo is docs-only” vs Phase 0 implementation notes [40](40_IDENTITY_IMPLEMENTATION_NOTES.md)–[42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md) | [00](00_MASTER_INDEX.md) §14 vs notes | Blueprint remains SoT; notes describe authorized foundation work. **No new product modules** |
| Join web (APP-JOIN-W) vs Phase 0 dark partner (`join_public: false`) | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) vs [38](38_PHASE_0_DECISION_BOARD.md) | Surface is **in product scope**; **activation is phased**. Phase 0 must not enable public Join |
| `HOSPITAL` vs `CLINIC` subtype | **OD-PTR-04** | Keep **separate type codes**; packs enable independently |

---

## Post-lock change requests

| ID | Decision | Implementation | Canonical book |
| --- | --- | --- | --- |
| **CR-ECO-92** | **ACCEPT_WITH_CONDITIONS** — reserve missing platform slots (care navigation, radiology, expanded CMS/support, commerce extras, marketing/search/analytics completeness). Does **not** diagnose, auto-prescribe, or add microservices. | **Not authorized.** Docs only. | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **CR-ROAD-93** | **ACCEPT_WITH_CONDITIONS** — canonical execution overlay R0–R16 from current state. Does **not** weaken money-before-production-traffic or invent law. | **Not authorized.** Docs only. | [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) |
| **CR-R3-94** | **ACCEPT plan** — R3 Store / Delivery / Join / admin review. **Coding not authorized.** | **Not authorized.** | [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md) |
| **CR-RLS-96** | **ACCEPT plan** — production tenancy/RLS retrofit. **Coding not authorized.** Do not load real partner data until implemented. | **Not authorized.** | [96](96_MULTI_TENANT_RLS_RETROFIT_PLAN.md) |

Conditions: no diagnosis product; radiology ≠ pathology; one CMS; one notification kernel; affiliate **web-only**; vendor **web-only**; no generic Partner App; legal ODs stay open.

---

## What this freeze does **not** do

- It does **not** close open decisions in [35](35_OPEN_DECISIONS.md). Those remain open until decided through the board / CR.
- It does **not** authorize Phase 0 Task 5 or any later implementation task.
- It does **not** fill empty Country Policy Packs with legal rules.
- It does **not** choose brand, launch country, merchant of record, or controller vs processor.

---

## Related books

Vision [01](01_PRODUCT_VISION.md) · Business [02](02_BUSINESS_ARCHITECTURE.md) · Apps [04](04_APPLICATION_ARCHITECTURE.md) · Domains [05](05_CUSTOMER_PLATFORM.md)–[17](17_ADMIN_ERP.md) · Globalization [18](18_GLOBALIZATION.md) · Compliance [19](19_COMPLIANCE_FRAMEWORK.md) · Security [27](27_SECURITY_ARCHITECTURE.md) · Performance [28](28_PERFORMANCE_ARCHITECTURE.md) · Roadmap [33](33_DEVELOPMENT_ROADMAP.md) · Open decisions [35](35_OPEN_DECISIONS.md) · Partner engine [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) · Phase 0 [38](38_PHASE_0_DECISION_BOARD.md)–[42](42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md) · Completeness [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) · Execution overlay [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)
