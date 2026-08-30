# 16 — Health Record

**Status:** Blueprint  
**Audience:** Product, architecture, clinical ops, security, compliance  
**Requirement IDs:** REQ-EHR, REQ-RX, REQ-REP, REQ-RBAC (consent scope)  
**Journeys:** J02, J07, J08, J12, J13, J14; consent overlay on all care; J06 recording is **not** default EHR content  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Pharmacy/Rx](06_PHARMACY_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Open decisions](35_OPEN_DECISIONS.md) · **R5 plan** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md)

---

## 1. Purpose

The health record is the **unified, consent-governed** store of patient health artifacts and a timeline across pharmacy, doctors, and diagnostics.

It is **not**:

- A hospital HIS/EMR replacement (01 scope out)
- A substitute for a partner lab’s or clinic’s legal medical record when they are independent professionals
- A CRM 360 dump
- Automatically visible to every doctor on the network

**Principle from vision:** Health data is not marketplace data. Commerce objects and clinical objects share identity and audit, but have stricter access, consent, and retention.

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| `HealthArtifact`, timeline, `ConsentGrant`, access logs | Source-of-truth clinical systems of partners (stores **copies + references**) |
| Artifact encryption classification, retention class | Country statutory text (compliance pack) |
| Patient-facing health tab in the super app | Video media plane (care/video); recording files only if policy + consent create an artifact |
| Share-with-doctor flows | Doctor discovery catalog |

**ASSUMPTION (A-EHR-01):** Partners may remain controllers of **their** original records. The platform holds a copy or pointer for the patient’s unified view. **OD-EHR-01 / OD-EHR-02**.

---

## 3. Data subject vs platform role

The **patient (Person as customer/patient)** is the **data subject** of health artifacts about them.

Whether World Pharma’s legal entity is a **controller**, **processor**, **joint controller**, or an equivalent local role is **not** a global constant.

**OPEN DECISION (OD-EHR-01):** Controller vs processor (or local equivalent) **per country and per processing purpose**.

**OPEN DECISION (OD-EHR-02):** Whether partner labs and doctors are independent controllers of encounter/report source records while the platform is processor for hosting, or joint controllers. **LEGAL/COMPLIANCE REVIEW REQUIRED** per country. Engineering must support: purpose limitation, processor clauses, and residency flags regardless of the legal label.

This document does **not** claim GDPR, HIPAA, or any other regime applies or is certified (01 §10).

---

## 4. Unified artifact model

### 4.1 HealthArtifact

| Field (logical) | Meaning |
| --- | --- |
| `artifact_id` | Stable |
| `patient_id` | Data subject |
| `country_id` | Policy, residency hint |
| `type` | See catalog |
| `source_module` | prescription, care, diagnostics, customer upload, immunization import |
| `source_id` | Encounter, report, order verify case |
| `status` | `DRAFT` / `ACTIVE` / `AMENDED` / `SUPERSEDED` / `REDACTED` / `LEGAL_HOLD` |
| `sensitivity` | `STANDARD_HEALTH` / `HIGHLY_SENSITIVE` (pack may subdivide; do not invent special categories as law) |
| `storage_uri` | Encrypted object |
| `metadata` | Non-payload index (dates, specialty, lab name) safe for constrained lists |
| `legal_hold` | Blocks deletion |
| `retention_class` | Pointer to 19 |

**NEVER** put full clinical payload in CRM, tickets, affiliate dashboards, rider apps, or analytics warehouses by default.

### 4.2 Type catalog (v1)

| Type | Source | Notes |
| --- | --- | --- |
| `PRESCRIPTION_UPLOAD` | Customer images/PDF | OCR assist is non-authoritative (J02) |
| `PRESCRIPTION_STRUCTURED` | Pharmacist verify or doctor sign (J07) | |
| `CONSULT_NOTE` | Doctor encounter | |
| `CONSULT_SUMMARY_PATIENT` | Patient-visible summary if distinct from note | **OD-EHR-09** |
| `LAB_REPORT` | Pathologist signed (J12/J13) | |
| `LAB_REPORT_AMENDMENT` | Amendment after release | |
| `MEDICATION_LIST` | Derived/confirmed meds | Optional projection |
| `ALLERGY` | Patient or clinician attested | |
| `VACCINATION` | Customer or clinician | |
| `DOCUMENT` | Customer upload (insurance card is **not** automatically health; classify) | |
| `PHYSICAL_REPORT_POD` | Logistics of hard copy | Operational proof; may be lower sensitivity |

Video **recording** is not an EHR type unless country pack + encounter consent explicitly archive it. Default recording off ([04](04_APPLICATION_ARCHITECTURE.md)).

### 4.3 Timeline

A **HealthTimeline** is an ordered, patient-visible feed of artifacts + major care events (consult completed, sample collected, report released) **without** leaking payloads in list APIs.

List APIs return: date, type, title (non-sensitive), status. Payload fetch is a **separate** authorized read with consent check and access log.

---

## 5. Source systems vs copy

| Artifact | Authoritative clinical act | Platform copy |
| --- | --- | --- |
| Digital Rx | Doctor signature in care module | Artifact + pharmacy consume |
| Lab report | Pathologist sign in diagnostics | Generated PDF/FHIR-like blob **OD-EHR-04** |
| Upload Rx | Patient blob; pharmacist structures a **verification** object | Both linked |
| Partner-originated | External id | Pointer + optional cached file |

Amendments: **do not overwrite**. New artifact `SUPERSEDES` previous (`OD-EHR-07`). J12 failures include amendment after release.

---

## 6. Consent and access control

Doctors **do not** automatically get unrestricted access to the patient’s unified record. Membership role `doctor` is necessary but **not sufficient**.

Authorization (03): permission `health_artifact:read` + scope `consented` + **active ConsentGrant** whose purpose matches the request + artifact in scope + not expired + not revoked. Server **re-loads** grants; JWT is not enough (03 §8).

### 6.1 ConsentGrant

| Field (logical) | Meaning |
| --- | --- |
| `grant_id` | |
| `patient_id` | Grantor (or legal proxy — **OD-EHR-05**) |
| `grantee_type` | `DOCTOR` / `CLINIC` / `LAB` / `PHARMACY_LOCATION` / `PLATFORM_BREAK_GLASS` |
| `grantee_id` | |
| `purpose` | `treatment` / `second_opinion` / `pharmacy_dispense` / `lab_processing` / `customer_export` / `break_glass` |
| `artifact_scope` | `ALL_ACTIVE` (discouraged) / `TYPES[]` / `ARTIFACT_IDS[]` / `ENCOUNTER_ID` / `TIME_RANGE` |
| `created_at` / `expires_at` | |
| `status` | See machine |
| `revoked_at` / `revoke_reason` | |
| `notice_version` | What the patient agreed to |

State machine (ConsentGrant):

| Status | Meaning |
| --- | --- |
| `PENDING` | Patient must confirm (e.g. share flow) |
| `ACTIVE` | Valid |
| `EXPIRED` | Time ended |
| `REVOKED` | Patient or proxy revoked |
| `SUPERSEDED` | Replaced by a narrower/wider grant |
| `DENIED` | Never accepted |

**Revoke** is immediate for **new** reads. In-flight encounter: doctor retains access to **that encounter’s own notes** they authored; they lose access to **other** artifacts pulled via the grant. **OD-EHR-10** on whether they keep a copy they already downloaded. Recommendation: **server-side fetch only; no bulk download in v1**; revoke stops API reads.

**OPEN DECISION (OD-EHR-03):** Default consent duration (encounter-only vs 24h vs 30d vs until revoked). Recommendation: **encounter + short tail (hours) for treatment purpose**; explicit longer grant for “share with my GP.”

### 6.2 Implied vs explicit grants

| Situation | Grant |
| --- | --- |
| Doctor on **this** appointment | Purpose `treatment`, scope **this encounter** + artifacts the doctor creates; not the whole timeline |
| Pharmacy verifying an uploaded Rx | Purpose `pharmacy_dispense`, scope those images + structured Rx, location-scoped |
| Pathologist signing | Scope that sample/report; not the patient’s other labs by default |
| Patient taps “share report with doctor” (J13) | Explicit grant, scoped to those artifacts |
| Support | **No grant**. Tickets use ids (15) |
| Affiliate / rider | Never |

**ASSUMPTION (A-EHR-02):** Booking a doctor does **not** open historic lab reports or other doctors’ notes.

### 6.3 Caregiver / proxy

**OPEN DECISION (OD-EHR-05):** Family/caregiver proxy (with **OD-CRM-01**, **OD-RBAC-03**).

Until decided: only the patient account reads the unified record. **LEGAL/COMPLIANCE REVIEW REQUIRED** for minors and incapacitated adults. Do not ship a “family switcher” that copies artifacts.

### 6.4 Break-glass

`super_admin` (and only roles listed in 03) clinical access: reason, ticket id, time box, post-review. Creates `ConsentGrant` purpose `break_glass` that is **audited as if it were consent** even though the patient did not grant it. Notify patient when legally required — **LEGAL/COMPLIANCE REVIEW REQUIRED**; do not assume a global notification duty.

**OPEN DECISION (OD-EHR-06):** Break-glass workflow details (who besides super_admin, patient notification).

---

## 7. Patient rights (product capabilities)

Implement as **capabilities**; legal conditions per country pack (19):

| Capability | Behavior |
| --- | --- |
| Access | Patient reads own artifacts |
| Export | Machine-readable bundle **OD-EHR-04** |
| Rectification | Request amendment; clinical authors issue `AMENDED` artifacts, not silent CRM edits |
| Restrict / withhold from a doctor | Revoke grant |
| Erase | Blocked by `LEGAL_HOLD` and financial/medical retention classes; otherwise process via 19 |

**OPEN DECISION (OD-EHR-04):** FHIR (or equivalent) export in roadmap. Recommendation: **structured JSON export in v1**; FHIR R4 export when a country pack needs interoperability — not a v1 blocker for commerce.

**OPEN DECISION (OD-EHR-08):** Cross-border access when the patient travels. Default: artifacts remain under **origin country** residency and policy; a second country doctor needs a new grant **and** residency rules may forbid pulling the blob. Do not auto-replicate globally.

---

## 8. Encryption, keys, access logs

Details in [27_SECURITY_ARCHITECTURE.md](27_SECURITY_ARCHITECTURE.md). This module **requires**:

| Control | Requirement |
| --- | --- |
| At rest | Artifacts encrypted; application-level encryption for highly sensitive blobs **recommended** |
| In transit | TLS |
| Key access | Domain services decrypt for authorized reads only; CRM/support keys do not exist |
| Access log | Every payload read: actor, membership, grant_id, purpose, artifact_id, time, result (allow/deny) |
| Logs | Access logs are themselves sensitive; retain per 19; immutable |

Denied reads are also logged (abuse detection).

Pharmacist Rx images: permitted under dispense grant; still logged.

---

## 9. Retention and legal hold

See [19_COMPLIANCE_FRAMEWORK.md](19_COMPLIANCE_FRAMEWORK.md). Health retention **≠** payment/ledger retention (13).

| Concept | Behavior |
| --- | --- |
| Retention class | Per artifact type × country pack (not hardcoded to one country) |
| Legal hold | `LEGAL_HOLD` status; erase jobs skip |
| Supercede vs delete | Prefer supersede; delete only via compliance job |
| Partner copy | Deleting the platform copy does not claim the lab destroyed theirs |

**Do not invent** statutory retention years. Packs are filled after legal review.

---

## 10. Clinical vs commerce coupling

| Flow | Health record | Commerce |
| --- | --- | --- |
| J02 upload | `PRESCRIPTION_UPLOAD` | Order waits on verify |
| J07 digital Rx | `PRESCRIPTION_STRUCTURED` | Optional pharmacy routing J08 |
| J08 order from Rx | Map SKUs | Order; artifact unchanged |
| J12/J13 report | `LAB_REPORT` | Booking complete; notify |
| Affiliate | No artifact access | Commission on booking/order if pack allows (14) |
| CRM | Pointers only | 360 |

OCR is assistive and **non-authoritative**. It must not silently become a signed Rx.

---

## 11. Vaccinations, allergies, documents

- Patient-attested allergies/vaccinations are **unverified** until a clinician attests; UI must show attestation state.
- Uploaded “documents” need a classifier: insurance, ID, and clinical scans have different retention and access. ID documents are **KYC/party**, not EHR, unless attached as health.
- **RISK:** Mixing KYC images into the health timeline. Forbidden.

---

## 12. Apps and APIs

| App | Access |
| --- | --- |
| Customer super app | Self: timeline + payload |
| Doctor app | Encounter-scoped + grants |
| Pharmacist | Dispense-scoped Rx |
| Pathologist | Assigned reports |
| Phlebotomist | Collection notes / identity verify — **not** historic reports |
| Delivery | No clinical payload |
| Support CRM | No payload (15) |
| Analyst | No payload |

API: separate `GET artifact metadata` vs `GET artifact payload`. Idempotent GETs still **log payload access**.

---

## 13. Events

| Event | Consumers |
| --- | --- |
| `HealthArtifactCreated` | Timeline, search (metadata only), notify patient |
| `HealthArtifactReleased` | Patient notify (J13); CRM flag |
| `ConsentGrantActivated` / `Revoked` | Authz cache invalidation |
| `HealthPayloadRead` | Audit/SIEM (27/30) |
| `LegalHoldSet` | Erase jobs |

Search ([24_SEARCH_ARCHITECTURE.md](24_SEARCH_ARCHITECTURE.md), module in [04](04_APPLICATION_ARCHITECTURE.md)) indexes **metadata**, not result values, for global search.

---

## 14. Country Policy Pack keys

| Key | Purpose |
| --- | --- |
| `health.controller_role` | Filled after OD-EHR-01 (engineering reads flags, not a legal memo) |
| `health.residency` | Pin / forbid cross-border fetch |
| `health.consent.default_ttl` | OD-EHR-03 |
| `health.recording.archive` | Default false |
| `health.export.fhir` | OD-EHR-04 |
| `health.proxy.minors` | OD-EHR-05 |
| `health.break_glass.notify_patient` | After legal |

---

## 15. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-EHR-01 | Doctors see all patients’ unified records | ConsentGrant mandatory; encounter-only default |
| R-EHR-02 | Support/CRM as shadow EHR | No payload permission |
| R-EHR-03 | Overwrite reports | Immutable versions; supersede |
| R-EHR-04 | Global replication of blobs | Residency flags; OD-EHR-08 deny by default |
| R-EHR-05 | Family account sharing passwords | No household switch; future proxy grants |
| R-EHR-06 | OCR treated as signed Rx | Non-authoritative flag |
| R-EHR-07 | Analytics warehouse full reports | Metadata/events only |
| R-EHR-08 | Break-glass without audit | Forced grant + ticket + time box |

---

## 16. Assumptions

| ID | Statement |
| --- | --- |
| A-EHR-01 | Platform stores copies/pointers; partners may keep source records |
| A-EHR-02 | Booking a doctor does not grant historic artifacts |
| A-EHR-03 | Patient is data subject; legal role of platform is per country (open) |
| A-EHR-04 | Recording-off by default; not in timeline unless archived under consent |

---

## 17. Open decisions

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-EHR-01 | Platform controller vs processor (or local equivalent) per country | Encode per pack after legal; architecture supports both |
| OD-EHR-02 | Partner doctors/labs independent controllers vs joint | Legal per country; keep source_id pointers |
| OD-EHR-03 | Default ConsentGrant TTL | Encounter + short tail; explicit share for more |
| OD-EHR-04 | FHIR export timing | Structured export v1; FHIR when a pack needs it |
| OD-EHR-05 | Caregiver/proxy | Off in v1; legal model with OD-CRM-01 / OD-RBAC-03 |
| OD-EHR-06 | Break-glass who/notify | super_admin + reason + time box; notify if pack requires |
| OD-EHR-07 | Amendment model | New artifact supersedes; no in-place edit |
| OD-EHR-08 | Cross-border artifact access | Deny replication by default |
| OD-EHR-09 | Separate patient-visible consult summary | Optional; doctor note may remain clinician-only |
| OD-EHR-10 | Offline copies after revoke | No bulk download v1; revoke stops fetches |

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country launch: health-data processing role, e-prescription validity, lab report legal form, retention, cross-border transfer, and caregiver access. Do not treat this file as a determination that any named privacy statute applies.
