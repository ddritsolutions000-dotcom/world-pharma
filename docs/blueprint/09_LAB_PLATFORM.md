# 09 — Lab Platform

**Status:** Blueprint  
**Audience:** Product, diagnostics engineering, lab operations, pathologists, finance, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payments](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Health Record](16_HEALTH_RECORD.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Open Decisions](35_OPEN_DECISIONS.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

Lab/pathologist **join/KYC** uses the shared partner engine. Physical copy is **REQ-LAB-001** (§12): print → pack → `REPORT_DELIVERY` → OTP/POD. Rider never receives the PDF.

**Requirement IDs:** REQ-LAB, REQ-PHE, REQ-PATH, REQ-REP, REQ-LOG (transport/report delivery), REQ-EHR, REQ-PAY, REQ-LED

---

## 1. Purpose

The Lab Platform is the **diagnostics bounded context**: test and package catalog, home-collection bookings, sample chain of custody, lab processing (LIMS-lite), pathologist review and signature, digital reports, optional physical report delivery, QC, billing, and settlement.

Logistics movement (sample transport, report delivery) is executed by the **logistics engine** ([11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md)). Phlebotomist field work is specified in [10_PHLEBOTOMIST_PLATFORM.md](10_PHLEBOTOMIST_PLATFORM.md). This document owns the **diagnostic case and sample lifecycle**, including the complete sample state machine.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country enables diagnostic marketplace operation, home collection, e-reports as official results, pathologist electronic signatures, or advertising of tests. This document does not invent those rules.

---

## 2. Scope

### 2.1 In

Customer journey J09, J10–J15, J20 ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md)).

Lab organization onboarding through settlement. Pathologist worklist through signed report. Physical report as a child fulfillment of a generated report.

### 2.2 Out

| Item | Owner |
| --- | --- |
| Full hospital LIS/HIS replacement | Scope out |
| Rider geo tracking UI internals | Logistics |
| Payment capture | Payments |
| Unrestricted doctor access to reports | Health + ConsentGrant ([08_DOCTOR_PLATFORM.md](08_DOCTOR_PLATFORM.md) §12) |
| Invented accreditation marks | Compliance / legal fill of country pack |

---

## 3. Applications

| App ID | Surface | Roles |
| --- | --- | --- |
| APP-CUS-* | Customer RN + web | Book, prep, track, reports, hard-copy request |
| APP-LAB-W | Lab management portal (web) | `lab_owner`, `lab_manager`, `lab_staff` |
| APP-LAB-S | Lab staff RN (optional) | Accession, processing on the floor |
| APP-PATH | Pathologist portal (web) | `pathologist` |
| APP-PHE | Phlebotomist RN | Collection (see 10) |
| APP-DEL | Delivery RN | SAMPLE_TRANSPORT, REPORT_DELIVERY |
| APP-ADM | Ops / country admin | KYC, incidents, refunds, catalog publish |

Auth: lab and pathologist = email + password + **MFA**. Phlebotomist = phone OTP + device bind ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §7).

---

## 4. Aggregate model

**ASSUMPTION (A-LAB-01):** Operational tracking uses a **DiagnosticCase** as the customer-visible spine. A case has:

| Child | Cardinality | Notes |
| --- | --- | --- |
| `LabBooking` | 1 | Commercial booking (a `Booking`) |
| `BookingLine` | 1..N | Tests and/or packages |
| `Sample` | 1..N | Physical specimens (tubes/containers) |
| `CollectionAssignment` | 0..1 per visit | Phlebotomist job; may map to `LogisticsJob` type `SAMPLE_COLLECTION` |
| `LogisticsJob` | 0..N | `SAMPLE_TRANSPORT`, `REPORT_DELIVERY` |
| `Result` | 0..N | Per test/analyte |
| `Report` | 1..N | Versions; one current released |
| `PhysicalReportRequest` | 0..N | Hard copy |

**OPEN DECISION (OD-LAB-04):** Customer status rollup when samples diverge (one rejected, one processing). Recommendation: case shows the **least-progressed non-terminal sample**, plus explicit exception banners per sample.

The state machine in §10 is the **case operational status** when there is a **single sample**, and the **per-sample status** always. Multi-sample rollup is OD-LAB-04.

---

## 5. Customer experience

Home collection is the v1 emphasis. Center walk-in is **OPEN DECISION (OD-LAB-01)** (business recommended home-first).

### 5.1 Test catalogue

| Object | Behavior |
| --- | --- |
| `TestDefinition` | Platform canonical test (code, specimen type, fasting, TAT target, gender/age constraints as **data**, not hardcoded demographics) |
| Publication | Country pack + lab offer must both be active |
| Search | [24_SEARCH_ARCHITECTURE.md](24_SEARCH_ARCHITECTURE.md); clinical synonyms without claiming diagnosis |
| Details | Why the test exists (CMS), specimen, prep, TAT, limitations — **LEGAL REVIEW** for medical claims |

Lab-specific methods (instrument) may display as “performed at {lab display name}” without exposing cost plus.

### 5.2 Packages

`TestPackage` = bundle of `TestDefinition` ids, optional price vs sum of parts, shared specimen rules (one draw vs multiple containers).

**OPEN DECISION (OD-LAB-15):** Whether a package may be split across labs. **v1 recommendation: no.** One lab fulfills the package.

### 5.3 Pricing

`Offer` = test or package + lab location (or lab network hub) + country + price + tax class + home-collection eligibility.

Home collection fee and physical report fee are **separate offer lines**, waivable by promo ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) §1).

Currency = booking country. No implicit FX in catalog.

### 5.4 Prep instructions

`PrepInstruction` bound to tests/packages: fasting hours, medication pause **as lab-authored content**, hydration, menstrual/timing notes where clinically relevant.

**OPEN DECISION (OD-LAB-10):** Fasting/prep conflict: **hard block** checkout vs warning + acknowledgement.

**ASSUMPTION (A-LAB-02):** Platform does not give medical advice. Prep text is the performing lab’s responsibility; platform requires acknowledgement checkbox.

### 5.5 Home collection vs lab selection

| Step | Rule |
| --- | --- |
| Serviceability | Address in geo where at least one lab (or platform phlebotomy network) serves the specimen types |
| Lab selection | **OPEN DECISION (OD-LAB-03):** customer picks lab vs platform ranks/assigns |
| Ranking inputs (if platform-assign) | Coverage, TAT, price, capacity, QC holds — not kickbacks |
| Slot | Collection window at address timezone; capacity from lab or network pool |
| Address | Saved customer addresses; access notes (gate, floor) are logistics-sensitive PII |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Referral fees for steering patients to a lab.

### 5.6 Slot, payment, booking

Checkout is a `Booking`, not a medicine `Order` ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) §4). `CheckoutSession` may still pay doctor + lab together (OD in payments).

Payment success (or COD if pack allows diagnostics COD — **OPEN DECISION OD-LAB-16**, default **no COD for labs** until decided) → case `BOOKED` → `CONFIRMED`.

### 5.7 Collection and report tracking

Customer sees **case status** plus map only when a live `LogisticsJob` exists and privacy rules allow ([11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md) §9). Phlebotomist live location follows the same privacy minimization.

Digital report: health artifact + notification (J13). Failure of push does not mean report is missing.

### 5.8 Digital vs physical reports

Digital is the default completion (`DELIVERED_DIGITAL`). Physical is an **optional paid/unpaid add-on** (§12).

---

## 6. Lab organization experience

### 6.1 Onboarding and KYC

Lab is `organization_type = LAB` ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) §8).

Professional status (org): `DRAFT` → `SUBMITTED` → `KYC_IN_REVIEW` → `ACCREDITATION_REVIEW` → `APPROVED` → `ACTIVE`, plus `SUSPENDED`, `REJECTED`, `NEEDS_RESUBMISSION`.

KYC: org identity, beneficial owners as required by **country pack**, payout account. **Do not invent local company-law documents.**

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may operate a diagnostic laboratory and list tests on a marketplace.

Accreditation/quality certificates: uploaded evidence; platform **does not** confer accreditation. Display of marks only after compliance review.

### 6.2 Locations

`LabLocation`: geo, timezone, reception hours, accession hours, home-collection catchment, capabilities (specimen types, cold chain, on-site draw).

A network has one org, many locations. Accession location may differ from branded storefront.

### 6.3 Catalogue, packages, pricing (lab-authored)

Lab proposes offers; `catalog:publish` may require `country_admin` for marketplace ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §4.2).

Price changes: future-dated `FeeSchedule`; in-flight bookings keep booked price.

### 6.4 Capacity and collection slots

| Resource | Meaning |
| --- | --- |
| Collection slots | Phlebotomy windows per geo cluster or location |
| Lab bench capacity | Daily accession caps per specimen type (soft/hard) |
| Pathologist capacity | Review queue SLA |

**OPEN DECISION (OD-LAB-12):** Overbooking percentage. Recommendation: configurable per location, default 0 until ops sets.

### 6.5 Staff

Memberships: `lab_owner`, `lab_manager`, `lab_staff`, `pathologist` (org or location scope). Phlebotomists may be org employees or platform network (**OPEN DECISION OD-PHE-01**).

SoD: result enter vs report sign ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §10). **OPEN DECISION (OD-LAB-17):** whether small labs may allow the same person both roles when local law allows. Default platform: **separate users** until pack relaxes.

### 6.6 Sample management and barcode

See §9 and §10. Lab staff: receive, accession, reject, aliquot, process, enter results, QC.

### 6.7 Billing and settlement

Journey J20. **OPEN DECISION (OD-LAB-02):** bill-on-booking vs bill-on-accession vs bill-on-report.

Until closed: model `revenue_recognition_event` on the offer. Ledger posts according to that flag. Refunds follow collection/report failure policies.

---

## 7. Pathologist experience

| Step | Permission | Notes |
| --- | --- | --- |
| Login | MFA | Org-scoped worklist |
| Assigned tests | `report:sign` queue | Filter by location, TAT, panic |
| Results | Read `result:enter` output | May not silently overwrite without amendment trail |
| Review | Accept, send back to processing, request recollection | Reason codes |
| Approval | `APPROVED` | All required analytes present; QC passed |
| Digital signature | `report:sign` | Country-pack signature mechanism — **do not invent legal form** |
| Report generation | System | Template i18n, version, hashes |
| Audit | Automatic | Who saw PHI, who signed |

Panic / critical values: **OPEN DECISION (OD-LAB-05)** notification channels (in-app + SMS vs phone escalation). Platform must support a **panic flag** and ops playbook hook without claiming it satisfies every local clinical laboratory standard.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether a digital signature on the platform is a valid professional release of a laboratory report.

Amendment after release: new `Report.version`; previous version retained; customer notified; state does **not** rewind `DELIVERED_DIGITAL` to `PROCESSING`. Use `AMENDED` flag on report.

---

## 8. QC

| Control | When |
| --- | --- |
| Pre-analytical | Identity, labeling, volume, hemolysis/lipemia flags, temperature (OD-LAB-14) |
| Analytical | Lab-staff QC runs as records attached to batch; platform stores pass/fail, not instrument drivers in v1 |
| Post-analytical | Pathologist review; delta checks **OPEN DECISION (OD-LAB-18)** |
| Hold | `compliance` hold blocks `report:release` |

Failed QC → `SAMPLE_REJECTED` or return to `PROCESSING`, not silent release.

---

## 9. Sample identity, barcode, chain of custody

### 9.1 Identifiers

| ID | Scope |
| --- | --- |
| `case_id` | DiagnosticCase |
| `sample_id` | Globally unique |
| `accession_no` | Lab-local, assigned at `LAB_RECEIVED` / accession |
| Barcode payload | Platform `sample_id` (and human-readable short code) |

**OPEN DECISION (OD-LAB-13):** Barcode symbology and whether labs may stick **only** local accession barcodes. Recommendation: **platform barcode at collection**; lab accession as additional label; both linked.

### 9.2 Chain of custody event

Every custody change writes `ChainOfCustodyEvent`: `sample_id`, `from_actor`, `to_actor` (or location), `event_type`, `geo` (precision policy), `photo_object_id` optional, `temperature` optional, `note`, `occurred_at`, `offline_flag`.

Actors: phlebotomist, delivery_partner, lab_staff, system.

**RISK:** Gaps in custody. Mitigation: `PICKED_UP` and `LAB_RECEIVED` require scan of the **same** `sample_id`; mismatch is hard stop.

---

## 10. Complete sample / diagnostic-case state machine

Legend:

- **Actor** is the authorized role or `system`.
- **Guard** must all pass.
- Exception states are **first-class**. They are not informal notes on the happy path.

### 10.1 State catalog

#### Happy path (ordered)

| State | Meaning |
| --- | --- |
| `BOOKED` | Booking row created; payment not yet successful or waiting confirm |
| `CONFIRMED` | Paid/authorized per policy; slot reserved; lab offer locked |
| `PHLEBOTOMIST_ASSIGNED` | Collection assignment offered or assigned to a named phlebotomist |
| `ACCEPTED` | Phlebotomist accepted the job |
| `ARRIVING` | En route to patient |
| `ARRIVED` | On-site (geo and/or manual) |
| `PATIENT_VERIFIED` | Identity verification succeeded |
| `SAMPLE_COLLECTED` | Specimen drawn/obtained |
| `SAMPLE_SEALED` | Container labeled, sealed, bagged |
| `PICKED_UP` | Transport custody started (phlebotomist-as-courier or logistics partner) |
| `IN_TRANSIT` | Moving to lab |
| `LAB_RECEIVED` | Lab scanned in |
| `PROCESSING` | Accession accepted; analysis in progress |
| `PATHOLOGIST_REVIEW` | Results ready for professional review |
| `APPROVED` | Pathologist approved |
| `REPORT_GENERATED` | Report artifact generated (not yet customer-delivered) |
| `DELIVERED_DIGITAL` | Customer can access artifact; notifications attempted |

#### Exception / money states

| State | Meaning |
| --- | --- |
| `PATIENT_UNAVAILABLE` | Patient not present or refused access at visit |
| `SAMPLE_REJECTED` | Lab or pre-analytical reject (label, quality, identity, policy) |
| `SAMPLE_DAMAGED` | Physical damage / leak / breakage |
| `SAMPLE_INSUFFICIENT` | Volume/quality insufficient for ordered tests |
| `COLLECTION_FAILED` | Visit failed for operational/safety/consent/identity mismatch |
| `RECOLLECTION_REQUIRED` | New collection needed; case not finished |
| `PROCESSING_DELAYED` | SLA breach or hold while remaining in lab |
| `CANCELLED` | Case cancelled; no further clinical processing |
| `REFUND_PENDING` | Refund policy engine running |
| `REFUNDED` | Money returned (gateway and/or wallet) |

`PROCESSING_DELAYED` is **concurrent-capable**: implementation stores `delay_flag` **or** explicit state. This machine uses **explicit state** as requested; resume returns to `PROCESSING`.

### 10.2 Happy-path transitions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| (none) | `BOOKED` | customer | booking created | tests serviceable; age/gender constraints pass or acknowledged (OD-LAB-11); address in catchment if home; slot hold |
| `BOOKED` | `CONFIRMED` | payment / system | payment captured or authorized; or zero-price | slot still held; lab still `ACTIVE`; idempotent intent |
| `CONFIRMED` | `PHLEBOTOMIST_ASSIGNED` | logistics/diagnostics assignment | partner selected | collection mode home (or center staff assigned if OD-LAB-01); job type `SAMPLE_COLLECTION`; partner capability phlebotomy |
| `PHLEBOTOMIST_ASSIGNED` | `ACCEPTED` | phlebotomist | `job:accept` | offered to this user; within accept SLA; device bound |
| `ACCEPTED` | `ARRIVING` | phlebotomist | start navigation | not cancelled; geo permission as required |
| `ARRIVING` | `ARRIVED` | phlebotomist / system | arrive | optional geofence; manual override audited |
| `ARRIVED` | `PATIENT_VERIFIED` | phlebotomist | verify identity | match against booking identity policy; **mismatch cannot proceed** (§10.5) |
| `PATIENT_VERIFIED` | `SAMPLE_COLLECTED` | phlebotomist | collect | patient consent for draw (acknowledgement); correct kit; `sample:collect` |
| `SAMPLE_COLLECTED` | `SAMPLE_SEALED` | phlebotomist | seal | barcode printed/scanned; container type matches test; photo if OD-PHE-07 |
| `SAMPLE_SEALED` | `PICKED_UP` | phlebotomist or delivery_partner | custody pickup | scan `sample_id`; if separate rider, job type `SAMPLE_TRANSPORT` accepted |
| `PICKED_UP` | `IN_TRANSIT` | same courier | start to lab | destination = accession location |
| `IN_TRANSIT` | `LAB_RECEIVED` | lab_staff | accession scan | barcode matches; location scope; `sample:accession` |
| `LAB_RECEIVED` | `PROCESSING` | lab_staff | accept into process | checks pass; accession_no assigned |
| `PROCESSING` | `PATHOLOGIST_REVIEW` | lab_staff / system | results entered + QC pass | all required results; SoD if pack requires different signer |
| `PATHOLOGIST_REVIEW` | `APPROVED` | pathologist | approve | `report:sign` not yet; professional review complete |
| `APPROVED` | `REPORT_GENERATED` | system | generate PDF/structured | signature applied per pack; template for language/country |
| `REPORT_GENERATED` | `DELIVERED_DIGITAL` | system | publish artifact | health artifact written; `report:release`; notify |

### 10.3 Payment and cancel from early states

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `BOOKED` | `CANCELLED` | customer / system | cancel or payment never completes | unpaid or hold expired → no refund needed |
| `BOOKED` | `EXPIRED` | system | hold TTL | treat as cancel unpaid; if this status is not in the user list, map to `CANCELLED` |
| `CONFIRMED` | `CANCELLED` | customer / ops / lab | cancel | cutoff policy; if captured → also `REFUND_PENDING` (may be sequential: cancel first) |
| `PHLEBOTOMIST_ASSIGNED` | `CONFIRMED` | system | reject, timeout, unassign | offer SLA exceeded; re-queue assignment |
| `PHLEBOTOMIST_ASSIGNED` | `CANCELLED` | customer / ops | cancel | same refund rules as confirmed |
| `ACCEPTED` / `ARRIVING` / `ARRIVED` | `CANCELLED` | ops (restricted) / customer if policy | cancel | after phlebotomist en route, customer cancel **OPEN DECISION (OD-LAB-19)** |

**ASSUMPTION (A-LAB-03):** Unpaid timeout uses `CANCELLED` with reason `PAYMENT_EXPIRED` rather than a separate state, to keep the published catalog finite.

### 10.4 Reassignment (still happy path)

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `PHLEBOTOMIST_ASSIGNED` | `PHLEBOTOMIST_ASSIGNED` | system | reassign | previous offer expired or rejected; new `partner_id`; custody not started |
| `ACCEPTED` | `PHLEBOTOMIST_ASSIGNED` | phlebotomist / ops | withdraw / dispatcher override | before `ARRIVED`; reason; earnings clawback rules |

### 10.5 Identity mismatch (hard stop)

Identity verification is a **hard stop** on mismatch ([10_PHLEBOTOMIST_PLATFORM.md](10_PHLEBOTOMIST_PLATFORM.md)).

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `ARRIVED` | `COLLECTION_FAILED` | phlebotomist / system | `IDENTITY_MISMATCH` | recorded reason `IDENTITY_MISMATCH`; **no** `PATIENT_VERIFIED`; **no** collection UI |
| `ARRIVED` | `COLLECTION_FAILED` | phlebotomist | patient refuses identity check | reason `ID_REFUSED` |

There is **no** transition from mismatch to `PATIENT_VERIFIED` without a new verification event that passes. Ops cannot “skip ID” without break-glass + reason + ticket (**RISK** of wrong-patient draw).

### 10.6 Visit exceptions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `ACCEPTED` / `ARRIVING` / `ARRIVED` | `PATIENT_UNAVAILABLE` | phlebotomist | patient not found / no access | attempt evidence (call log flag, geo at pin, wait minutes config) |
| `PATIENT_VERIFIED` | `COLLECTION_FAILED` | phlebotomist | unsafe environment, clinical contraindication declared by patient, equipment fail | no sample created, or voided |
| `PATIENT_VERIFIED` | `COLLECTION_FAILED` | phlebotomist | patient withdraws collection consent | |
| `PATIENT_UNAVAILABLE` | `CONFIRMED` | customer / ops | reschedule slot | new slot; same case id **or** successor visit id linked |
| `PATIENT_UNAVAILABLE` | `PHLEBOTOMIST_ASSIGNED` | system | same-day reattempt | policy allows; new assignment |
| `PATIENT_UNAVAILABLE` | `COLLECTION_FAILED` | system | max attempts | |
| `PATIENT_UNAVAILABLE` | `CANCELLED` | customer / ops | give up | |
| `COLLECTION_FAILED` | `RECOLLECTION_REQUIRED` | ops / system | eligible retry | not identity fraud hold |
| `COLLECTION_FAILED` | `CANCELLED` | ops / customer | no retry | |
| `COLLECTION_FAILED` / `PATIENT_UNAVAILABLE` / `CANCELLED` | `REFUND_PENDING` | system | money captured and policy refunds | refund engine ([12_PAYMENT_PLATFORM.md](12_PAYMENT_PLATFORM.md)) |

### 10.7 Pre-analytical sample exceptions (field)

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `SAMPLE_COLLECTED` | `SAMPLE_INSUFFICIENT` | phlebotomist | insufficient volume before seal | may collect additional container (new sample) **or** fail |
| `SAMPLE_COLLECTED` | `SAMPLE_DAMAGED` | phlebotomist | container broken at chair | |
| `SAMPLE_SEALED` | `SAMPLE_DAMAGED` | phlebotomist / partner | damaged in bag | scan still required to record which sample |
| `SAMPLE_INSUFFICIENT` | `RECOLLECTION_REQUIRED` | system / phlebotomist | tests cannot run | |
| `SAMPLE_DAMAGED` | `RECOLLECTION_REQUIRED` | system | | |
| `SAMPLE_INSUFFICIENT` / `SAMPLE_DAMAGED` | `REFUND_PENDING` | system | no recollection offered or customer declines | policy |

If some tests in a package can still run from remaining samples, **OD-LAB-04** partial report vs full recollection.

### 10.8 Transport exceptions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `PICKED_UP` / `IN_TRANSIT` | `SAMPLE_DAMAGED` | partner / lab | leak, breakage, temperature excursion (if logged) | evidence; chain event |
| `IN_TRANSIT` | `COLLECTION_FAILED` | ops | lost in transit **not preferred**; use `SAMPLE_REJECTED` reason `LOST` after investigation | do not silently cancel |
| `IN_TRANSIT` | `SAMPLE_REJECTED` | ops | lost / custody gap confirmed | after investigation ticket |
| `PICKED_UP` / `IN_TRANSIT` | `LAB_RECEIVED` | lab_staff | receive | even if damaged — receive **then** reject (preferred) so custody closes |

**OPEN DECISION (OD-LAB-14):** Which specimen types require temperature logging. Until decided, field is optional; if present and out of range → `SAMPLE_DAMAGED` or `SAMPLE_REJECTED` with reason `TEMPERATURE_EXCURSION`.

### 10.9 Lab receive and processing exceptions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `LAB_RECEIVED` | `SAMPLE_REJECTED` | lab_staff | reject | unlabeled, barcode mismatch, wrong specimen, hemolyzed, clotted, leaked, unlabeled photo evidence |
| `LAB_RECEIVED` | `SAMPLE_INSUFFICIENT` | lab_staff | volume check fail | |
| `LAB_RECEIVED` | `SAMPLE_DAMAGED` | lab_staff | received damaged | |
| `LAB_RECEIVED` | `RECOLLECTION_REQUIRED` | lab_staff | reject with retry | skip `SAMPLE_REJECTED` only if pack collapses them — **prefer explicit `SAMPLE_REJECTED` then recollection** |
| `SAMPLE_REJECTED` | `RECOLLECTION_REQUIRED` | lab_manager / system | retry allowed | customer consent to recollect |
| `SAMPLE_REJECTED` | `REFUND_PENDING` | system | no retry | |
| `PROCESSING` | `PROCESSING_DELAYED` | lab_staff / system | delay | reason (reagent, instrument, staffing, confirmatory test); SLA clock |
| `PROCESSING_DELAYED` | `PROCESSING` | lab_staff | resume | |
| `PROCESSING_DELAYED` | `RECOLLECTION_REQUIRED` | pathologist / lab_manager | cannot complete | |
| `PROCESSING_DELAYED` | `SAMPLE_REJECTED` | lab_staff | QC fail during delay | |
| `PROCESSING` | `SAMPLE_REJECTED` | lab_staff | analytical failure / QC fail | |
| `PROCESSING` | `RECOLLECTION_REQUIRED` | lab_staff | | |

Barcode mismatch at receive: **hard stop** — cannot `PROCESSING`. Must `SAMPLE_REJECTED` reason `BARCODE_MISMATCH` or hold for ops. Never “type in” another patient’s accession.

### 10.10 Pathologist exceptions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `PATHOLOGIST_REVIEW` | `PROCESSING` | pathologist | send back | missing values, need repeat assay on **same** sample |
| `PATHOLOGIST_REVIEW` | `RECOLLECTION_REQUIRED` | pathologist | sample unfit | |
| `PATHOLOGIST_REVIEW` | `SAMPLE_REJECTED` | pathologist | unfit, no retry | |
| `APPROVED` | `REPORT_GENERATED` | system | only forward | no skip of generation |
| `REPORT_GENERATED` | `DELIVERED_DIGITAL` | system / lab_manager override | release | lab_manager override audited (`report:release`) |

### 10.11 Recollection

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `RECOLLECTION_REQUIRED` | `CONFIRMED` | system | new slot booked (fee **OD-LAB-20**) | previous sample terminal exception; new `CollectionAssignment` |
| `RECOLLECTION_REQUIRED` | `PHLEBOTOMIST_ASSIGNED` | system | auto-assign if slot already held | |
| `RECOLLECTION_REQUIRED` | `CANCELLED` | customer / ops | decline recollection | |
| `RECOLLECTION_REQUIRED` | `REFUND_PENDING` | system | cancel or ineligible | |

Recollection creates **new Sample** ids. Old samples remain in their exception state for audit. Case status becomes the new sample’s status after slot confirm.

**OPEN DECISION (OD-LAB-20):** Whether recollection is free, partial fee, or full rebill.

### 10.12 Money terminal path

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `CANCELLED` | `REFUND_PENDING` | system | captured amount > 0 and refundable | policy |
| `CANCELLED` | (terminal) | system | nothing to refund | unpaid or non-refundable fee **only if** OD and legal allow. Default: refund unused clinical service |
| `REFUND_PENDING` | `REFUNDED` | payment | refund success | ledger `LAB_REFUND` |
| `REFUND_PENDING` | `REFUND_PENDING` | payment | gateway fail | retry queue; payable ops |
| `DELIVERED_DIGITAL` | `REFUND_PENDING` | finance / policy | goodwill or wrong-patient incident | **does not** delete report; access controls may quarantine |

`REFUNDED` is terminal for money. Clinical artifacts remain under retention policy.

### 10.13 Forbidden transitions (explicit)

Do **not** implement:

- `PATIENT_VERIFIED` → `LAB_RECEIVED` (skip collection)
- `IDENTITY_MISMATCH` → any collected state
- `SAMPLE_REJECTED` → `APPROVED`
- `CANCELLED` → `PROCESSING`
- `REFUNDED` → `CONFIRMED` (create a new case)
- `DELIVERED_DIGITAL` → `APPROVED` rewind (use amendment version)
- Any state → `DELIVERED_DIGITAL` without `REPORT_GENERATED` (except never)

### 10.14 Actor × permission map for transitions

| Transition group | Permission |
| --- | --- |
| Book / pay | `lab_booking:create` |
| Customer cancel | `lab_booking:cancel` (self) + policy |
| Assign / reassign | logistics assigner / `operations` |
| Accept / arrive / collect / seal | `sample:collect` on assigned job |
| Transport pickup | `job:accept` + scan |
| Accession / process / result enter | `sample:accession`, `result:enter` |
| Sign / approve | `report:sign` |
| Release override | `report:release` |
| Refund execute | `payment:refund` / finance |

---

## 11. Center collection (if enabled)

**OD-LAB-01.** If center visit is on:

- Skip `PHLEBOTOMIST_ASSIGNED` … `ARRIVING` **or** map center staff as a phlebotomist user at location.
- Recommended mapping: still use `ACCEPTED` (staff claims token), `ARRIVED` = patient checked in at location, then `PATIENT_VERIFIED` onward unchanged.

Do not fork a second incompatible machine.

---

## 12. Physical report delivery

Digital path can complete without this flow. Physical is a **child** `PhysicalReportRequest` + `LogisticsJob` type `REPORT_DELIVERY`.

### 12.1 Prerequisites

- Case has `REPORT_GENERATED` or `DELIVERED_DIGITAL`
- Customer (or eligible caregiver) requests hard copy
- Address serviceable
- Physical report fee charged if offer requires (promo may waive)

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether printed copies, envelopes, and unattended delivery are allowed for clinical reports.

### 12.2 Physical report states

| State | Meaning |
| --- | --- |
| `REQUESTED` | Customer requested |
| `FEE_PENDING` | Extra payment required |
| `FEE_PAID` | Fee settled or waived |
| `PRINT_QUEUED` | Lab print queue |
| `PRINTED` | Printed |
| `PACKAGED` | Envelope/package, sample-id not required; `report_id` + copy count |
| `JOB_CREATED` | `LogisticsJob` `REPORT_DELIVERY` created |
| `PARTNER_ASSIGNED` | Partner assigned |
| `PICKED_UP` | Partner collected package from lab |
| `IN_TRANSIT` | To customer |
| `OTP_PENDING` | At door |
| `DELIVERED` | OTP/POD success |
| `PRINT_FAILED` | Print error |
| `DELIVERY_FAILED` | Failed delivery |
| `REDELIVERY_SCHEDULED` | New attempt |
| `CANCELLED` | Request cancelled |
| `REFUND_PENDING` / `REFUNDED` | Fee refund |

### 12.3 Physical transitions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `REPORT_GENERATED` or `DELIVERED_DIGITAL` | `REQUESTED` | customer | request hard copy | policy allows physical reports |
| `REQUESTED` | `FEE_PENDING` | system | fee > 0 | |
| `REQUESTED` | `FEE_PAID` | system | fee = 0 or waived | |
| `FEE_PENDING` | `FEE_PAID` | payment | capture | |
| `FEE_PENDING` | `CANCELLED` | customer / TTL | | |
| `FEE_PAID` | `PRINT_QUEUED` | system | | lab location print capability |
| `PRINT_QUEUED` | `PRINTED` | lab_staff | print complete | copies, stationery |
| `PRINT_QUEUED` | `PRINT_FAILED` | lab_staff / system | | retry or cancel |
| `PRINT_FAILED` | `PRINT_QUEUED` | lab_staff | retry | |
| `PRINT_FAILED` | `CANCELLED` | ops | | fee refund path |
| `PRINTED` | `PACKAGED` | lab_staff | pack | tamper-evident envelope **if pack requires**; addressee only |
| `PACKAGED` | `JOB_CREATED` | system | create job | pickup = lab; dropoff = customer |
| `JOB_CREATED` | `PARTNER_ASSIGNED` | logistics | assign | partner **no clinical payload**; label is “document” not result values |
| `PARTNER_ASSIGNED` | `PICKED_UP` | delivery_partner | pickup scan of package id | |
| `PICKED_UP` | `IN_TRANSIT` | partner | | |
| `IN_TRANSIT` | `OTP_PENDING` | partner | arrive dropoff | |
| `OTP_PENDING` | `DELIVERED` | partner + customer | OTP + POD | `job:pod` |
| `OTP_PENDING` | `DELIVERY_FAILED` | partner | no answer / OTP fail exceeded | |
| `IN_TRANSIT` / `OTP_PENDING` | `DELIVERY_FAILED` | partner / system | | |
| `DELIVERY_FAILED` | `REDELIVERY_SCHEDULED` | customer / ops | new window | **OPEN DECISION OD-LAB-07** reprint vs same package |
| `REDELIVERY_SCHEDULED` | `JOB_CREATED` or `PARTNER_ASSIGNED` | system | new or reused job | |
| `DELIVERY_FAILED` | `CANCELLED` | ops | | |
| `DELIVERED` | — | | terminal | |
| fee states | `REFUND_PENDING` → `REFUNDED` | payment | lost package after print | **OD-LAB-07** reprint policy |

Tracking: customer sees delivery status + logistics tracking privacy rules. Printing status is visible to customer as coarse states (`PRINTING`, `DISPATCHED`) without lab-internal QC notes.

POD: photo/signature/OTP per logistics job, stored with job, not inside the PDF.

**OPEN DECISION (OD-LAB-07):** Lost package: reprint + resend vs refund only vs customer pickup at lab.

---

## 13. Notifications (diagnostics)

| Trigger | Audience |
| --- | --- |
| Booking confirmed, slot reminders, prep | customer |
| Phlebotomist assigned / arriving | customer (privacy-minimized) |
| Collection done | customer |
| Report ready | customer; doctor **only if** ConsentGrant |
| Panic values | OD-LAB-05; never via unsecured SMS body with full results if pack forbids |
| Rejection / recollection | customer |
| Settlement | lab org |
| Print/delivery | customer |

Report **body** is not placed in SMS/email if country pack forbids. Link to authenticated app.

---

## 14. Earnings (lab)

Per OD-LAB-02 recognition event:

- Commission, home collection fee split (lab vs platform vs phlebotomist), physical report fee, tax.
- Phlebotomist and rider payables are **not** lab revenue; separate earning lines ([10_PHLEBOTOMIST_PLATFORM.md](10_PHLEBOTOMIST_PLATFORM.md), [11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md)).

---

## 15. Country policy hooks

| Key | Default technical |
| --- | --- |
| `diagnostics.enabled` | false until legal |
| `diagnostics.home_collection` | false until legal |
| `diagnostics.center_visit` | OD-LAB-01 |
| `diagnostics.cod` | false (OD-LAB-16) |
| `report.physical.enabled` | false until legal |
| `report.signature.mode` | unset until legal |
| `barcode.platform_required` | true recommended |

**Do not hardcode a country.** Specimen legality (what may be collected at home) is country-pack data after legal review.

---

## 16. Domain events

| Event | Consumers |
| --- | --- |
| `LabBookingConfirmed` | assignment, notification, ledger (if bill-on-booking) |
| `SampleCustodyChanged` | tracking, audit |
| `SampleRejected` | recollection, refund, lab QC analytics |
| `ReportReleased` | health, notification, settlement (if bill-on-report) |
| `PhysicalReportDelivered` | notification, ledger if fee |

---

## 17. Open decisions (this document)

| ID | Question |
| --- | --- |
| OD-LAB-01 | Home-first only vs center visit in v1 |
| OD-LAB-02 | Bill-on-booking vs accession vs report |
| OD-LAB-03 | Customer selects lab vs platform assignment |
| OD-LAB-04 | Multi-sample customer status rollup and partial reports |
| OD-LAB-05 | Panic-value notification channels |
| OD-LAB-06 | Amendment / versioned report visibility to the customer |
| OD-LAB-07 | Lost hard copy: reprint vs refund vs pickup |
| OD-LAB-08 | Pathologist electronic signature mechanism (country pack after legal) |
| OD-LAB-09 | Lab may reject a confirmed booking for capacity (vs must honor) |
| OD-LAB-10 | Prep conflict hard block vs warning |
| OD-LAB-11 | Age/gender restriction hard block vs warning |
| OD-LAB-12 | Capacity overbooking % |
| OD-LAB-13 | Platform vs lab-local barcode as primary |
| OD-LAB-14 | Temperature logger required by specimen type |
| OD-LAB-15 | Split package across labs (v1 no) |
| OD-LAB-16 | COD for diagnostics |
| OD-LAB-17 | Same user result-enter and sign |
| OD-LAB-18 | Automated delta checks |
| OD-LAB-19 | Customer cancel after phlebotomist en route |
| OD-LAB-20 | Recollection pricing |

Also [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md).
