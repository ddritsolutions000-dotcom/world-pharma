# 02 — Business Architecture

**Status:** Blueprint  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Master Index](00_MASTER_INDEX.md)

---

## 1. Business model (directional)

World Pharma is a **multi-sided healthcare commerce and care network**.

| Revenue stream | Who pays | Notes |
| --- | --- | --- |
| Own-pharmacy product margin | Customer | Owned inventory |
| Marketplace commission | Vendor | Configurable % or flat; category/country rules |
| Delivery / convenience fees | Customer and/or vendor | Country policy |
| Doctor booking commission or SaaS fee | Doctor and/or customer | **OPEN DECISION** take-rate vs subscription |
| Lab marketplace commission | Lab | Per test/package |
| Home collection fee | Customer | May be waived by promo |
| Physical report fee | Customer | Optional |
| Membership / loyalty | Customer | **OPEN DECISION** |
| Affiliate funded by take-rate | Platform P&L | Must not create illegal inducement |
| SaaS for pharmacy/lab chains | Organization | Later |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine advertising, referral fees for clinical services, kickbacks, and professional fee-splitting are restricted in many jurisdictions. Affiliate and doctor commission rules must be country-gated.

**ASSUMPTION:** Platform can operate both **first-party pharmacy** and **third-party marketplace** in the same country, subject to licensing.

---

## 2. Operating model

```
                    ┌─────────────────────────────────────┐
                    │         COUNTRY POLICY PACK         │
                    │  services, tax, Rx, KYC, payments    │
                    └─────────────────┬───────────────────┘
                                      │
     ┌─────────────┬─────────────┬────┴─────┬──────────────┬────────────┐
     ▼             ▼             ▼          ▼            ▼            ▼
  Pharmacy      Marketplace    Doctors     Labs      Logistics      Finance
  (owned)       (vendors)      (network)  (network) (partners)    (ledger)
     │             │             │          │            │            │
     └─────────────┴──────┬──────┴──────────┴────────────┴────────────┘
                          │
                          ▼
              PLATFORM KERNEL (identity, order/booking,
              payment, ledger, notification, search,
              health record, CRM, audit, compliance)
                          │
                          ▼
              CUSTOMER SUPER APP  +  ROLE APPS  +  ADMIN
```

---

## 3. Bounded contexts (business)

| Context | Owns | Does not own |
| --- | --- | --- |
| Identity & IAM | Accounts, roles, sessions, devices | Clinical content |
| Party | Customer, org, location, KYC case | Payments |
| Catalog | Medicines, products, tests, packages, content | Inventory quantity |
| Inventory | Stock, batch, expiry, transfer | Customer pricing display rules (shared) |
| Order | Pharmacy/marketplace orders, returns | Lab bookings, appointments |
| Prescription | Uploads, structured Rx, verification cases | Inventory reservation until verified |
| Care | Doctors, slots, encounters, consult notes | Video media plane |
| Video | Sessions, consent, quality, recording flags | Clinical notes |
| Diagnostics | Bookings, samples, accession, reports | Rider geo |
| Logistics | Jobs, assignment, tracking, POD | Inventory |
| Payment | Intents, captures, refunds, gateway events | Ledger posting rules (emits events) |
| Ledger & settlement | Journal, accounts, payouts | Gateway tokens |
| Wallet | Customer store-of-value | Bank accounts of vendors |
| Affiliate | Links, attribution, commission states | Payment execution |
| CRM & support | Segments, campaigns, tickets | Order mutation (requests only) |
| Health record | Artifacts, timeline, consent | Source-of-truth clinical systems of partners (copies + refs) |
| Notification | Templates, dispatch, preferences | Business decisioning |
| Search | Indexes, synonyms | Pricing source of truth |
| Compliance | Policy packs, holds, residency flags | Legal advice |

---

## 4. Core commercial objects

| Object | Use |
| --- | --- |
| **CatalogItem** | Medicine, OTC, device, lab test, package, consult product |
| **Offer** | Item + seller + location + country + price + tax + availability |
| **Cart** | Customer intent; may mix pharmacy items; lab/doctor are bookings not mixed into medicine cart **ASSUMPTION:** separate checkout per fulfillment type in v1 |
| **Order** | Paid/COD commercial order for goods |
| **Booking** | Doctor appointment or lab collection |
| **Fulfillment** | Pick/pack/dispatch unit |
| **LogisticsJob** | Physical movement |
| **PaymentIntent** | Money capture attempt |
| **LedgerTransaction** | Balanced financial event |
| **Encounter** | Consult session |
| **Sample** | Physical specimen with chain of custody |
| **HealthArtifact** | Rx, report, document |

**OPEN DECISION:** Whether a single “super checkout” can mix medicines + lab in one payment. Recommendation: **one payment can cover multiple domain orders** via a **CheckoutSession** that creates child orders/bookings. See [12_PAYMENT_PLATFORM.md](12_PAYMENT_PLATFORM.md).

---

## 5. Value flows (simplified)

### 5.1 Medicine (owned pharmacy)

Customer → Platform (payment) → Pharmacy fulfills → Rider delivers → Ledger: revenue, COGS (ops), delivery fee, tax, rider payable.

### 5.2 Marketplace

Customer → Platform (merchant of record **OPEN DECISION**) or vendor as seller → commission + tax + delivery → vendor payable.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Marketplace operator vs marketplace facilitator vs pharmacy marketplace licensing per country.

### 5.3 Doctor

Customer pays consult fee (or doctor paid by org) → video → optional digital Rx → optional pharmacy conversion → doctor payable minus platform fee.

### 5.4 Lab

Customer books test → collection job → lab processes → pathologist signs → digital report (and optional print job) → lab payable minus commission; phlebotomist/rider payables.

---

## 6. End-to-end journeys (minimum set)

Each journey lists happy path, failure/edge cases, primary modules, and owning docs. Detailed screens live in [25_UI_UX_ARCHITECTURE.md](25_UI_UX_ARCHITECTURE.md).

### J01 — Customer buys medicine (OTC / non-Rx)

**Happy:** Search → product → offer (own or ranked) → cart → address → payment → order → pharmacy accept → pack → logistics job → OTP deliver → complete.

**Failures:** Payment fail, out of stock after pay (cancel/substitute **OPEN DECISION**), address out of service, rider fail, duplicate checkout (idempotency), fraud hold.

**Modules:** Catalog, Cart, Order, Payment, Inventory, Logistics, Notification.

### J02 — Customer uploads prescription

**Happy:** Upload images/PDF → OCR assist (non-authoritative) → pharmacist/Rx desk review → structured items → customer confirms → order as J01.

**Failures:** Unreadable image, controlled drug requiring in-person **LEGAL REVIEW**, expired Rx, identity mismatch, substitution needed, reject with reason.

### J03 — Customer orders from vendor

**Happy:** Marketplace offer selected → vendor SLA → vendor accept → pack → job → deliver.

**Failures:** Vendor timeout auto-cancel, vendor reject, split-ship **OPEN DECISION** (v1: no split across vendors in one order).

### J04 — Customer tracks medicine delivery

**Happy:** Live job status + map (privacy-minimized) → ETA → OTP → POD.

**Failures:** GPS stale, rider reassignment, customer unavailable, OTP fail, contactless country rules **LEGAL REVIEW**.

### J05 — Customer books doctor

**Happy:** Discover → profile → slot → pay/hold → appointment confirmed.

**Failures:** Slot stolen (optimistic lock), payment fail, doctor cancelled, country teleconsult ineligible.

### J06 — Customer attends video consultation

**Happy:** Waiting room → identity check as required → media connect → consult timer → complete.

**Failures:** Network, device permission, no-show either side, reconnect, recording consent denied (consult continues without recording).

### J07 — Doctor creates prescription

**Happy:** Encounter in progress or completed → structured Rx → sign → patient artifact → optional pharmacy routing.

**Failures:** Missing license for country, incomplete Rx fields, drug not in country formulary, unsigned draft.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Electronic signature and Rx validity.

### J08 — Customer orders prescribed medicine

**Happy:** Artifact → “Order medicines” → mapped SKUs → J01/J02.

**Failures:** Unmapped drug, strength mismatch, partial fill.

### J09 — Customer books lab test

**Happy:** Test/package → prep instructions → home vs center **OPEN DECISION** (home-first) → slot → address → pay → booking.

**Failures:** Fasting conflict, slot full, age/gender restrictions, service not in geo.

### J10 — Phlebotomist collects sample

**Happy:** Job assign → accept → navigate → arrive → patient verify → collect → barcode → seal → chain of custody event.

**Failures:** Patient unavailable, consent fail, insufficient sample, damage, wrong patient (hard stop), unsafe environment.

### J11 — Sample reaches lab

**Happy:** Transport job or phlebotomist handover → lab receive → accession → reject/accept → processing.

**Failures:** Temperature excursion, lost sample, barcode mismatch, delay SLA.

### J12 — Pathologist approves report

**Happy:** Results entered → QC → pathologist review → digital signature → report generate → notify.

**Failures:** Panic values workflow, amendment after release, signer unavailable.

### J13 — Customer receives digital report

**Happy:** Push/email/in-app → health record → share-with-doctor via consent.

**Failures:** Delivery of notification fail (report still stored), unauthorized family access.

### J14 — Customer requests hard copy

**Happy:** Pay print fee if any → lab print → pack → REPORT_DELIVERY job → OTP → deliver.

**Failures:** Print fail, address fail, re-delivery, lost package (re-print policy **OPEN DECISION**).

### J15 — Hard copy delivered

Covered by J14 terminal state + POD stored.

### J16 — Customer receives refund

**Happy:** Eligible cancel/return/failed collection → refund policy engine → payment reverse and/or wallet → ledger.

**Failures:** Gateway refund fail (payable queue), FX refund rules, partial refund, COD already collected (reverse logistics + cash handling).

### J17 — Affiliate receives commission

**Happy:** Attributed conversion after attribution window → pending → hold period → approved → settlement.

**Failures:** Self-referral, coupon stacking fraud, cancellation reverse, clinical inducement block.

### J18 — Vendor settlement

**Happy:** Delivered + return window → net commission/tax/fees → batch payout.

**Failures:** Chargebacks, missing KYC, payout account fail.

### J19 — Doctor settlement

Same pattern; consult completed and not refunded; **LEGAL REVIEW** on fee-split.

### J20 — Lab settlement

Same pattern; report delivered or policy “bill on accession”. **OPEN DECISION:** bill-on-booking vs bill-on-report.

### J21 — Delivery partner earnings

**Happy:** Job complete → earnings rules (distance, job type, surge) → weekly payout.

**Failures:** Customer dispute, fake POD, multi-account fraud.

### J22 — Partner joins (any PartnerType)

**Happy:** Join us → type + country → account/OTP → profile → pack documents → review → additional info (optional) → verified → approved → ACTIVE → type dashboard.

**Failures:** Type disabled in pack; incomplete profile; document reject; SoD (self-approve); duplicate identity; invite expired; license expiry after ACTIVE → suspend.

Canonical engine: [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md).

---

## 7. Requirement traceability (summary)

Full matrix: [00_MASTER_INDEX.md](00_MASTER_INDEX.md#requirement-traceability-matrix). Domain IDs:

| ID | Requirement | Primary docs |
| --- | --- | --- |
| REQ-ID | Identity, auth, OTP, social | 03, 05, 21, 27 |
| REQ-CUST | Customer super app modules | 05, 25 |
| REQ-PHARM | Own pharmacy ERP-lite | 06, 17, 20 |
| REQ-VEND | Vendor marketplace | 07, 13 |
| REQ-ORD | Orders, tracking, returns | 05, 06, 11, 12 |
| REQ-RX | Prescription upload/verify/digital | 06, 08, 16 |
| REQ-DOC | Doctor discovery, booking | 08 |
| REQ-VID | Video/audio/chat consult | 08, 29 |
| REQ-LAB | Lab marketplace + LIMS-lite | 09 |
| REQ-PHE | Phlebotomist jobs | 10, 11 |
| REQ-PATH | Pathologist workflow | 09 |
| REQ-REP | Digital + physical reports | 09, 11, 16 |
| REQ-LOG | Multi-type logistics engine | 11 |
| REQ-PAY | Multi-gateway payments | 12 |
| REQ-FX | Multi-currency | 12, 13, 18 |
| REQ-LED | Ledger + settlements | 13 |
| REQ-WAL | Wallet | 12, 13 |
| REQ-AFF | Affiliate | 14 |
| REQ-PTR-001–009 | Partner onboarding engine | 36, 17, 19, 20, 21 |
| REQ-LAB-001 | Physical report delivery | 09, 11 |
| REQ-PAY-001/002 | Multi-gateway / multi-currency | 12, 13 |
| REQ-CRM | CRM + support | 15 |
| REQ-EHR | Health record + consent | 16, 27 |
| REQ-ADM | Admin ERP | 17 |
| REQ-RBAC | RBAC + scopes | 03 |
| REQ-I18N | Globalization | 18 |
| REQ-CMP | Compliance framework | 19 |
| REQ-NOT | Notifications | 23 |
| REQ-SRCH | Global search | 24 |
| REQ-ANL | Analytics / BI | 17, 30 |
| REQ-SEC | Security | 27 |
| REQ-OBS | Observability | 30 |
| REQ-SUP | Customer support | 15, 17 |

---

## 8. Organization types

| organization_type | Examples |
| --- | --- |
| PLATFORM | World Pharma operator |
| PHARMACY_OWNED | First-party stores/warehouses |
| VENDOR | Third-party pharmacy/seller |
| CLINIC | Doctor group (optional) |
| LAB | Diagnostic provider |
| LOGISTICS_FLEET | In-house or 3PL |
| AFFILIATE_ORG | Agency affiliates |

A **Person** (user) may hold memberships in multiple orgs with different roles. Customers are persons with `CUSTOMER` role and optional other roles (careful separation of clinical vs commerce identities in audit).

**RISK:** Staff using personal customer accounts for test orders in production. Control via environment and policy.

---

## 9. State-machine catalog (index)

| Machine | Document |
| --- | --- |
| Order | [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md) |
| Prescription verification | [06](06_PHARMACY_PLATFORM.md) |
| Appointment / encounter | [08](08_DOCTOR_PLATFORM.md) |
| Video session | [08](08_DOCTOR_PLATFORM.md) |
| Lab booking + sample | [09](09_LAB_PLATFORM.md) |
| Physical report | [09](09_LAB_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md) |
| Logistics job | [11](11_LOGISTICS_PLATFORM.md) |
| Payment intent | [12](12_PAYMENT_PLATFORM.md) |
| Refund | [12](12_PAYMENT_PLATFORM.md) |
| Settlement batch | [13](13_LEDGER_SETTLEMENT.md) |
| Affiliate commission | [14](14_AFFILIATE_PLATFORM.md) |
| KYC case | [19](19_COMPLIANCE_FRAMEWORK.md) |
| Support ticket | [15](15_CRM_PLATFORM.md) |
| Consent grant | [16](16_HEALTH_RECORD.md) |

---

## 10. Cross-domain dependency map

```
Identity ──┬── all apps
Party/KYC ─┼── Vendor, Doctor, Lab, Rider, Affiliate, Pharmacy staff
Catalog ───┼── Pharmacy, Vendor, Lab, Search
Inventory ─┴── Order (goods)
Prescription ── Order (Rx goods) ── Health record
Doctor ── Appointment ── Video ── Prescription ── Order
Lab booking ── Sample ── Report ── Health record
All paid flows ── Payment ── Ledger ── Settlement
Physical movement ── Logistics job
All state changes ── Notification + Audit + Analytics events
```

---

## 11. Assumptions affecting business architecture

| ID | Statement |
| --- | --- |
| A-BIZ-01 | v1 does not mix multiple vendors in one goods order |
| A-BIZ-02 | Lab and doctor are bookings; CheckoutSession may still take one payment for multiple children |
| A-BIZ-03 | Platform wallet is stored value, not a bank; country-gated |
| A-BIZ-04 | First-party pharmacy and marketplace can coexist |
| A-BIZ-05 | Clinical advice is always a licensed professional’s responsibility |

See [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md) for unresolved commercial questions.
