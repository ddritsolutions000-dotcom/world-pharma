# 10 — Phlebotomist Platform

**Status:** Blueprint  
**Audience:** Product, diagnostics and logistics engineering, field operations, compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Health Record](16_HEALTH_RECORD.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Performance](28_PERFORMANCE_ARCHITECTURE.md) · [Open Decisions](35_OPEN_DECISIONS.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

Join/KYC: `PartnerType=PHLEBOTOMIST` in [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). This book owns field collection after `ACTIVE`.

**Requirement IDs:** REQ-PHE, REQ-LAB, REQ-LOG, REQ-ID

Journey: J10, J11 (handover), J21 (earnings pattern analog).

---

## 1. Purpose

The Phlebotomist Platform is the **field collection experience** on top of diagnostics + logistics:

- Professional registration and KYC
- Certification and capability flags
- Availability and presence
- Job assignment, accept/reject, navigation
- Patient identity verification (**hard stop on mismatch**)
- Sample collection, barcode, packaging, seal
- Handover and chain of custody
- Offline-tolerant **status** queue
- Job history and earnings

It is **not** a separate identity, payment, or ledger system. Collection jobs are diagnostic assignments executed through the **central logistics engine** where movement and dispatch are required ([11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md)).

**LEGAL/COMPLIANCE REVIEW REQUIRED** before a country allows home phlebotomy, who may collect venous/capillary samples, and what identity evidence may be processed. This document does not invent those rules.

---

## 2. Relationship to logistics and lab

**ASSUMPTION (A-PHE-01):** There is one `LogisticsJob` engine. Home collection is job type `SAMPLE_COLLECTION` and requires partner capability `PHLEBOTOMY`. After `SAMPLE_SEALED`:

- If the same person transports to the lab, they continue into `SAMPLE_TRANSPORT` **or** the same job gains a transport leg (**OPEN DECISION OD-PHE-06**).
- If a different courier takes the bag, a child job `SAMPLE_TRANSPORT` is created. Phlebotomist performs **handover scan**.

Clinical state of the sample remains owned by diagnostics ([09_LAB_PLATFORM.md](09_LAB_PLATFORM.md) §10). The phlebotomist app calls **diagnostics commands** authorized by assignment, and **logistics commands** for accept/arrive/tracking.

**OPEN DECISION (OD-PHE-01):** Employment model: lab employee, platform network, fleet, or mixed. Data model supports all via `organization_id` nullable (platform network) vs lab org membership.

**OPEN DECISION (OD-LOG-12):** Whether the same person may hold `phlebotomist` and `delivery_partner` roles. If yes, capabilities still gate job types (a rider without `PHLEBOTOMY` cannot collect).

---

## 3. Application

| App ID | Clients | Role |
| --- | --- | --- |
| APP-PHE | React Native Android **and** iOS | `phlebotomist` |

Auth: phone OTP + **device bind** + device PIN/biometric ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §7). JWT `aud` = phlebotomist client.

**RISK:** Sideloaded debug builds posting collection complete without GPS. Mitigation: attestation/device bind; server rejects status jumps that skip required scans.

No social login. No web-first collection (ops may view jobs in admin; they cannot fake field scans without break-glass).

---

## 4. Domain objects

| Object | Owner | Notes |
| --- | --- | --- |
| `PhlebotomistProfile` | party/care-adjacent | User, org, countries, languages, photo |
| `PhlebotomistCertification` | party | Type from **country pack**, issuer, expiry, evidence object ids |
| `PhlebotomistCapability` | logistics | `PHLEBOTOMY`, `PEDIATRIC_DRAW`, `COLD_CHAIN`, `GENDER_PREF_MATCH`, etc. |
| `Presence` | logistics | `ONLINE` / `OFFLINE` / `BUSY` |
| `AvailabilityRule` | logistics | Shift windows, timezone |
| `LogisticsJob` | logistics | Type `SAMPLE_COLLECTION` (+ optional transport) |
| `DiagnosticCase` / `Sample` | diagnostics | Clinical spine |
| `IdentityVerificationAttempt` | diagnostics | Pass/fail, method, **no raw ID images in rider-like logs** |
| `ChainOfCustodyEvent` | diagnostics | See lab doc |
| `PhlebotomistEarningLine` | care/logistics emit | Ledger posts |
| `KycCase` | party | Shared KYC |

### 4.1 PhlebotomistProfile fields

| Field | Notes |
| --- | --- |
| `user_id` | Person |
| `organization_id` | Lab or fleet or null (platform) |
| `country_id` | Operating country (selected); not hardcoded |
| `status` | Onboarding machine |
| `home_geo` / service polygons | Where they may receive offers |
| `languages[]` | BCP-47 for patient communication |
| `device_id` | Bound device |
| `payout_profile_id` | Settlement |

---

## 5. Registration, KYC, certification

### 5.1 Status machine

`DRAFT` → `SUBMITTED` → `KYC_IN_REVIEW` → `CERTIFICATION_IN_REVIEW` → `APPROVED` → `ACTIVE`, plus `NEEDS_RESUBMISSION`, `REJECTED`, `SUSPENDED`, `CERT_EXPIRED`.

**SoD:** cannot approve own KYC.

**OPEN DECISION (OD-PHE-02):** Selfie / liveness cadence (onboarding only vs periodic vs each shift). Recommendation: onboarding + random challenge; not every job (friction vs fraud).

### 5.2 KYC

Shared `KycCase`. Document types from country pack. Optional KYC vendor adapter.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Lawful ID capture, retention, and whether ID photos may be stored versus one-time match.

### 5.3 Certification

| Step | Guard |
| --- | --- |
| Upload | MIME allow-list, malware scan |
| Type | Country-pack list of recognized collection qualifications — **empty until legal fills**; platform does not invent titles |
| Expiry job | `CERT_EXPIRED` → cannot receive new jobs; in-flight jobs **OPEN DECISION (OD-PHE-09)** |

**ASSUMPTION (A-PHE-02):** Certification verification is a platform trust process, not a government license by itself.

### 5.4 Activation gate

`ACTIVE` requires: KYC approved, at least one valid certification if pack requires, payout method (or OD-PHE-10 allow jobs before payout), device bind, country tele-phlebotomy/home collection flag true.

---

## 6. Availability, online/offline, geo

| Signal | Use |
| --- | --- |
| Shift `AvailabilityRule` | Offer windows |
| `ONLINE` | Eligible for new offers |
| `OFFLINE` | No new offers; finish in-flight |
| `BUSY` | On a job |
| Geo pings | Same privacy engine as delivery partners ([11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md) §9) |

Phlebotomist live location is **job-scoped**. Customer sees minimized location only after `ACCEPTED`/`ARRIVING` and until `SAMPLE_SEALED` or visit exception. Not a 24-hour tracker.

**OPEN DECISION (OD-PHE-08):** Gender-preference matching for home collection (patient request). If enabled, it is a **capability/filter**, not a clinical judgment. Legal review for discrimination/employment law per country.

---

## 7. Job assignment and accept

High-level algorithm lives in logistics ([11_LOGISTICS_PLATFORM.md](11_LOGISTICS_PLATFORM.md) §7). Extra filters for `SAMPLE_COLLECTION`:

- Capability `PHLEBOTOMY`
- Kit / specimen types in job `requirements[]`
- Catchment
- Language optional boost
- OD-PHE-08 preference
- Not exceeding concurrent job cap (**OPEN DECISION OD-PHE-11**, recommend 1 active collection visit)

| Action | Actor | Guard |
| --- | --- | --- |
| Offer | system | partner `ONLINE`, cert valid |
| Accept | phlebotomist | `job:accept`; SLA timer |
| Reject | phlebotomist | reason; reject rate monitored (fraud / gaming) |
| Timeout | system | reoffer; case stays `CONFIRMED` or `PHLEBOTOMIST_ASSIGNED` per lab machine |
| Dispatcher override | `fleet_dispatcher` / `operations` | audited |

Accept moves diagnostic case `PHLEBOTOMIST_ASSIGNED` → `ACCEPTED` ([09_LAB_PLATFORM.md](09_LAB_PLATFORM.md) §10.2).

---

## 8. Navigation and on-site

| Step | Behavior |
| --- | --- |
| Navigate | Deep link to maps provider adapter (**OPEN DECISION OD-LOG-01**); platform still owns ETA |
| `ARRIVING` | Explicit button + ping cadence |
| `ARRIVED` | Geofence assist + manual confirm; never silent auto-collect |
| Access issues | Reason codes (gate, unsafe, pets) → `COLLECTION_FAILED` or wait |

Customer phone: masked calling / in-app call proxy **OPEN DECISION (OD-PHE-12)** so the partner does not retain the number.

---

## 9. Patient verification (hard stop)

Wrong-patient collection is a **never event**.

### 9.1 Verification methods (country pack)

Configure **methods**, do not hardcode a national ID scheme:

| Method code (illustrative) | Behavior |
| --- | --- |
| `NAME_DOB_MATCH` | Confirm name + date of birth against booking |
| `OTP_TO_BOOKING_PHONE` | Patient OTP |
| `PHOTO_ID_MATCH` | Visual check; optional image **only if** pack allows storage |
| `CARE_GIVER_PRESENT` | Extra attestation; does not skip patient identity when the patient is the subject |

**OPEN DECISION (OD-PHE-13):** Which methods are mandatory per country. Until legal fills the pack, technical default: **at least two factors** (name+DOB **and** OTP to booking phone) where a phone exists.

### 9.2 Outcomes

| Result | State / command |
| --- | --- |
| Pass | `PATIENT_VERIFIED`; collection UI unlocks |
| Fail / mismatch | **Hard stop.** `COLLECTION_FAILED` reason `IDENTITY_MISMATCH`. Collection, barcode, and seal screens stay disabled. |
| Patient refuses ID | `COLLECTION_FAILED` reason `ID_REFUSED` |
| No patient | `PATIENT_UNAVAILABLE` |

Ops break-glass to skip ID: dual control + ticket + `X-Reason`. Default **deny**. Logged as **RISK**.

Phlebotomist must not see unrelated EHR. They see **job identity fields only** (name, age/DOB as needed, sex if specimen rules require, address, phone masked, test names needed for kit — **not** full reports, not prior diagnoses).

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Minimum identity data for safe collection vs data minimization.

---

## 10. Collection, barcode, packaging

Unlocked only after `PATIENT_VERIFIED`.

| Step | Rules |
| --- | --- |
| Kit check | Ordered tests → required containers from catalog; expiry of tubes |
| Consent | On-device acknowledgement of collection (not a substitute for legal informed consent forms if pack requires wet-ink) |
| Collect | `SAMPLE_COLLECTED`; one `Sample` per container |
| Insufficient | `SAMPLE_INSUFFICIENT` or additional container |
| Barcode | Print or pre-print scan of **platform `sample_id`** (OD-LAB-13); scan-back required |
| Label | Human-readable short code + patient initials **per pack** (avoid full name on bag if pack forbids) |
| Seal | Tamper-evident; `SAMPLE_SEALED` |
| Photo | **OPEN DECISION (OD-PHE-07)** sealed-bag photo required |
| Notes | Pre-analytical flags (fasting confirmed Y/N as declared, last meal time as declared — not medical advice) |

Unsafe environment, needle-stick, or clinical red flags: stop → `COLLECTION_FAILED`; incident ticket. Platform is not an emergency service; show local emergency guidance **from country pack CMS**, not hardcoded numbers for one market.

---

## 11. Handover and chain of custody

| Scenario | Events |
| --- | --- |
| Phlebotomist transports (OD-PHE-06) | `PICKED_UP` (self) → `IN_TRANSIT` → lab `LAB_RECEIVED` |
| Handover to rider | Both scan `sample_id` / bag id; events `HANDOVER_FROM_PHLEBOTOMIST` / `PICKED_UP` on `SAMPLE_TRANSPORT` |
| Lab drop box | Scan drop-box id + sample; dual timestamp |

Every step writes `ChainOfCustodyEvent`. Offline events carry `client_event_id` for idempotency.

---

## 12. Offline queue for **status** (not clinical bypass)

Per [04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §7 and [28_PERFORMANCE_ARCHITECTURE.md](28_PERFORMANCE_ARCHITECTURE.md):

| Allowed offline | Forbidden offline |
| --- | --- |
| GPS pings | Creating a new collection without prior server-assigned job |
| `ARRIVING` / `ARRIVED` status if job already accepted | `PATIENT_VERIFIED` success **without** later server confirmation |
| Draft notes | Marking `SAMPLE_COLLECTED` without barcode payload queued |
| Queue status + scans | Skipping identity after a known mismatch |

**OPEN DECISION (OD-PHE-03):** Whether identity OTP can be verified offline. **Recommendation: no.** OTP and mismatch decisions require server. Status queue may store **intent** (“arrived”) and flush.

Conflict resolution: server is source of truth; last-write-wins only for GPS; **monotonic state** for sample (never move backward on flush). If server already `CANCELLED`, flush of `ARRIVED` is rejected and UI notified.

---

## 13. Job history

Phlebotomist sees own jobs: dates, statuses, earning, exception reasons. No customer clinical reports. Search limited to own `self` scope.

Admin/ops see network-wide with PII minimization.

---

## 14. Earnings

**OPEN DECISION (OD-PHE-05):** Per-visit vs per-sample vs salary vs hybrid vs surge.

Until decided: `PhlebotomistEarningLine` with `rule_id`, `job_id`, `amount+currency`, `status` (`ACCRUED`, `REVERSED`, `IN_SETTLEMENT`, `PAID`).

Triggers (directional):

- Visit complete (`SAMPLE_SEALED` or policy “on lab receive”)
- Recollection may pay a reduced rule
- `COLLECTION_FAILED` / no-show: **OPEN DECISION (OD-PHE-14)** show-up fee
- Fraud / fake POD analog (fake collect): clawback + suspend

Payout via settlement batches ([13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md)). Ledger events never informal.

---

## 15. Notifications

New offer, reassign, cancel, lab rejection (if they still hold the sample), payout, cert expiry, identity of next slot reminder (no result values).

---

## 16. Permissions (field)

| Permission | Use |
| --- | --- |
| `job:accept` | Offers |
| `sample:collect` | Assigned only |
| `job:track` | Self |
| `health_artifact:read` | **Not granted** |

---

## 17. Country policy hooks

| Key | Default |
| --- | --- |
| `phlebotomy.home.enabled` | false until legal |
| `phlebotomy.identity.methods` | empty until legal; tech fallback in OD-PHE-13 |
| `phlebotomy.min_certifications` | pack |
| `phlebotomy.offline.collect` | false |

**Do not hardcode a country.**

---

## 18. Open decisions (this document)

| ID | Question |
| --- | --- |
| OD-PHE-01 | Lab employee vs platform network vs mixed |
| OD-PHE-02 | Liveness / selfie frequency |
| OD-PHE-03 | Offline identity verification (recommend no) |
| OD-PHE-04 | Device attestation required vs bind-only |
| OD-PHE-05 | Earnings model |
| OD-PHE-06 | Same person transports vs mandatory handover to rider |
| OD-PHE-07 | Sealed-bag photo required |
| OD-PHE-08 | Gender-preference matching |
| OD-PHE-09 | In-flight jobs when cert expires mid-shift |
| OD-PHE-10 | Jobs before payout profile complete |
| OD-PHE-11 | Concurrent collection job cap |
| OD-PHE-12 | Masked calling vs raw number |
| OD-PHE-13 | Mandatory identity methods |
| OD-PHE-14 | Show-up fee on failed visit |

Also [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md).
