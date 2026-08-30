# 19 — Compliance Framework

**Status:** Blueprint  
**Audience:** Architecture, engineering, operations, finance, legal/compliance  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health Record](16_HEALTH_RECORD.md) · [Admin](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md)

**Requirement IDs:** REQ-CMP, REQ-RBAC, REQ-EHR, REQ-PAY, REQ-LED

---

## 1. Purpose

Compliance is a **configurable kernel**, not a hardcoded “one country act.” The platform supplies:

- Policy Pack **hooks** (empty until legal fills them)
- KYC/AML **cases** (process, not invented document lists)
- Consent, retention, legal hold, residency **modes**
- Audit logs and **export jobs**
- Country restrictions (sanctions/geo **flags**, not a homemade embargo law)

Engineering **must not** invent pharmacy acts, telemedicine statutes, data-protection regimes, or tax codes. Where a rule is unknown, the feature stays **off** or **review-queued**.

**LEGAL/COMPLIANCE REVIEW REQUIRED** appears on every domain below. That marker means: do not ship enabled in a country until counsel/compliance signs the pack.

This document is **not** a certification that HIPAA, GDPR, or any named law applies.

---

## 2. Principles

1. **Safe defaults.** Telemedicine, recording, wallet, clinical affiliate, controlled-substance visibility, marketplace Rx: **off** until pack + legal.
2. **SoD.** Submitter ≠ approver for KYC, refund vs payout above threshold, result-enter vs report-sign ([03](03_USER_ROLES_AND_PERMISSIONS.md) §10).
3. **Health ≠ commerce.** CRM/support do not get clinical payloads ([16](16_HEALTH_RECORD.md)).
4. **Ledger never deleted.** Retention ≠ erase for journal ([13](13_LEDGER_SETTLEMENT.md)).
5. **Legal hold beats deletion.** Erase jobs skip held records.
6. **Audit is attributable.** Actor, membership, country, reason, request id.
7. **Config over code.** Country Policy Pack ([18](18_GLOBALIZATION.md)) is the switchboard.

---

## 3. Compliance domains (configurable)

Each subsection: what the platform **can** encode; what legal must fill; default engineering behavior.

### 3.1 Pharmacy regulation

| Platform capability | Pack hooks | Default |
| --- | --- | --- |
| Store license field schema | `pharmacy.license_fields[]` | Empty schema → cannot mark location `FULFILLING` |
| Who may verify Rx | `rx.verify.role` | `pharmacist` at location |
| Returns of medicines | `return.medicine_allowed` | Off until filled |
| Price-control display | `pricing.floor_enforced` | Off |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may operate a pharmacy, e-pharmacy, and display of license numbers.

**Do not invent** license types or a national formulary.

### 3.2 Prescription rules

| Capability | Pack | Default |
| --- | --- | --- |
| Upload Rx | `rx.upload.enabled` | Off until pharmacy live |
| Digital Rx | `rx.digital.enabled` | **false** |
| Validity window | `rx.validity_days` | **null** (no invented expiry) |
| Reuse | `rx.reuse_allowed` | **null** |
| Controlled visibility | `catalog.controlled_substance_visible` | **false** |
| Skip pharmacist if platform-signed | `rx.skip_review_if_platform_signed` | **false** (OD-PHARM-04) |
| Identity match | `rx.identity_match_required` | Pack |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Electronic signature validity, controlled substances, substitution, in-person requirements, validity periods.

OCR is **non-authoritative** ([06](06_PHARMACY_PLATFORM.md)).

### 3.3 Doctor licensing and telemedicine

| Capability | Pack | Default |
| --- | --- | --- |
| Teleconsult | `telemedicine.enabled` | **false** |
| License issuer codes | `doctor.license.issuers[]` | Empty → cannot `ACTIVE` |
| Cross-border consult | `cross_border.consult` | **false** |
| Recording | `video.recording.allowed` | **false** |
| Fee-split vs SaaS | commercial pack | **LEGAL** (OD-DOC-04) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Title protection, advertising, e-Rx, recording, standard of care, identity at consult.

### 3.4 Lab requirements

| Capability | Pack | Default |
| --- | --- | --- |
| Marketplace labs | `labs.enabled` | **false** |
| Home collection | `lab.home_collection.enabled` | **false** |
| Accreditation evidence fields | `lab.accreditation.fields[]` | Empty; platform **does not confer** accreditation |
| Digital signature of reports | `report.signature.mechanism` | Placeholder |
| Panic notification | `lab.panic.channels[]` | Flag + ops hook (OD-LAB-05) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who may run a lab, home phlebotomy, e-report as official result, pathologist signature, referral fees.

### 3.5 Patient consent

| Capability | Notes |
| --- | --- |
| Legal notices | Versioned CMS docs; `consent.legal.accepted` at registration |
| Health `ConsentGrant` | [16](16_HEALTH_RECORD.md) machine |
| Recording consent | Separate; consult continues if denied |
| Marketing | Default **no promo** without recorded allow (OD-CRM-06) |
| Caregiver/proxy | **Off v1** (OD-RBAC-03, OD-EHR-05) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Age of digital consent, marketing, health-data consent language, caregiver.

State machine: §6.2 (legal notices) and [16](16_HEALTH_RECORD.md) for artifacts.

### 3.6 Privacy and data protection

The platform implements **capabilities**: access, export, restrict, erase-request, residency flags. **Whether a named statute applies is not asserted here.**

**OPEN DECISION (OD-CMP-01 / OD-EHR-01):** Controller vs processor (or local equivalent) per country and purpose.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Lawful basis, DPIA, children’s accounts, social login IdP sharing (OD-CUS-05).

### 3.7 Data retention

Retention is **class × country pack**, not a global number of years invented by engineering.

| Class (illustrative) | Typical objects | Engineering default until legal fills |
| --- | --- | --- |
| `IDENTITY` | Account, sessions | Pack; session TTL technical |
| `COMMERCE` | Order, cart | Pack |
| `PAYMENT` | Intents, webhooks | Pack; often longer than marketing |
| `LEDGER` | Journal | **Never delete** |
| `HEALTH` | Artifacts | `retention_status` on artifact; legal years **empty** |
| `KYC` | Documents | Pack; **LEGAL** |
| `AUDIT` | AuditLog | Pack; append-only |
| `MARKETING` | Campaign sends | Pack |
| `SUPPORT` | Tickets | Pack; no clinical payload stored |

Jobs: `RetentionJob` selects rows where `retain_until < now()` AND **no legal hold** AND pack class allows. Health prefers **supersede** over physical delete (OD-EHR-07).

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Statutory retention for pharmacy, labs, financial books, health records. **Do not invent years.**

### 3.8 Data residency

Modes: `shared` | `pinned_region` | `dedicated_db` ([18](18_GLOBALIZATION.md) §11).

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Transfer, localization, subprocessors (PSP, SMS, video, OCR).

Recording media and report blobs follow the country’s mode. Default: **no global replication of clinical blobs** (OD-EHR-08).

### 3.9 Tax

Tax **profile id** + engine interface. Amounts posted to ledger as given.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** VAT/GST/sales tax, e-invoicing, marketplace tax role. **Do not invent GST/VAT rules.**

### 3.10 Payments and financial compliance

| Topic | Default | Review |
| --- | --- | --- |
| PSP orchestration | Required | PCI scope minimization |
| Wallet | **Off** | Stored-value / e-money license |
| COD | Pack | Cash handling, Rx COD |
| Chargeback ownership | OD-PAY-12 | Marketplace MOR vs facilitator |
| SCA/step-up | Follow PSP | OD-PAY-07 |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Acquiring, stored value, marketplace facilitator, medicine payments, unclaimed property.

### 3.11 Financial / AML-adjacent

KYC cases for vendors, doctors, labs, riders, affiliates. Sanctions/PEP **optional adapter** — do not invent local AML lists.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** KYC/AML, payout as wage vs vendor, withholding.

Payout blocked if KYC not `APPROVED`.

### 3.12 Audit

Every sensitive mutation: `AuditLog` ([20](20_DATABASE_ARCHITECTURE.md)). Health payload reads: `HealthPayloadRead`.

Export: §8.

### 3.13 Country restrictions

Pack may set `country.status = SUSPENDED`, `services.* = false`, `payments.methods` empty, geo deny-lists for logistics.

**OPEN DECISION (OD-CMP-02):** Sanctions screening vendor. Until selected, **manual** hold flags on orgs; no homemade “banned country” law table presented as law.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Export controls, sanctions, advertising bans.

---

## 4. Actors and SoD

| Role | Compliance duties |
| --- | --- |
| `super_admin` | Pack publish (regulated keys), break-glass; dual control |
| `global_admin` | Day-to-day; **not** secret rotation / regulated pack publish (OD-ADM-09) |
| `country_admin` | KYC queues, incidents; limited pack keys |
| `compliance_officer` | Holds, retention, audit export, KYC policy |
| `finance` | Refunds/payouts; not clinical |
| `operations` | KYC review (not always approve) |
| Submitter of KYC | Cannot approve same case |

**OPEN DECISION (OD-CMP-03 / OD-RBAC-01):** Dual control for doctor KYC. Recommendation: **two distinct reviewers** in production.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Local SoD for pharmacies and labs.

---

## 5. KYC case state machine

Shared `KycCase` for: vendor, doctor, lab org, pharmacy staff (if pack), phlebotomist, delivery partner, affiliate, clinic/hospital, optional customer (wallet thresholds).

**Orchestration:** Supply-side join is owned by `PartnerApplication` ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)). `KycCase` is the **nested document-verification subprocess** (`subject_type=PartnerApplication`). Do not run a second KYC product per partner type. Pack `partner_types.{CODE}.*` supplies field/document **codes**; this framework still forbids invented statute lists.

**ASSUMPTION (A-CMP-01):** One case machine; `subject_type` + `subject_id` + `country_id` discriminate. Document types come **from pack**, not a global ID catalog.

### 5.1 States

| State | Meaning |
| --- | --- |
| `DRAFT` | Subject started; not submitted |
| `SUBMITTED` | Package submitted; SoD: submitter frozen from approve |
| `IN_REVIEW` | Assigned reviewer; automated checks may run |
| `NEEDS_RESUBMISSION` | Reviewer requested more evidence |
| `APPROVED` | Eligible for next onboarding gate (payout / `ACTIVE`) |
| `REJECTED` | Terminal for this application; new case policy applies |
| `ON_HOLD` | Legal/fraud/sanctions hold |
| `EXPIRED` | Evidence TTL (pack) or license-linked expiry for **re-KYC** |
| `REVOKED` | Previously approved; privileges withdrawn |
| `CANCELLED` | Subject withdrew before decision |

### 5.2 Transitions

```
DRAFT → SUBMITTED → IN_REVIEW
                      ↳ NEEDS_RESUBMISSION ⇄ IN_REVIEW
                      ↳ APPROVED
                      ↳ REJECTED
                      ↳ ON_HOLD ⇄ IN_REVIEW
SUBMITTED / IN_REVIEW / NEEDS_RESUBMISSION → CANCELLED
APPROVED → REVOKED | EXPIRED (re-KYC)
ON_HOLD → REJECTED | IN_REVIEW | REVOKED
```

| From | To | Actor | Guards |
| --- | --- | --- | --- |
| (none) | `DRAFT` | subject | org/person exists; country pack `kyc.*.documents[]` may still be empty → cannot submit |
| `DRAFT` | `SUBMITTED` | subject | required pack documents present; virus scan passed; submitter ≠ system auto-approve |
| `SUBMITTED` | `IN_REVIEW` | system / ops | case assigned; auto-checks started |
| `IN_REVIEW` | `NEEDS_RESUBMISSION` | reviewer | reason codes; cannot be submitter |
| `NEEDS_RESUBMISSION` | `IN_REVIEW` | subject | new attachments |
| `IN_REVIEW` | `APPROVED` | approver | **≠ submitter**; dual control if pack `kyc.*.dual_control`; checks not `FAIL` unless override + reason |
| `IN_REVIEW` | `REJECTED` | approver | reason codes; notify |
| `IN_REVIEW` | `ON_HOLD` | compliance | sanctions/fraud/legal |
| `ON_HOLD` | `IN_REVIEW` | compliance | hold released |
| `DRAFT`/`SUBMITTED`/`IN_REVIEW`/`NEEDS_RESUBMISSION` | `CANCELLED` | subject / ops | before approval |
| `APPROVED` | `REVOKED` | compliance / country_admin | reason; suspend org/profile |
| `APPROVED` | `EXPIRED` | system | pack re-KYC clock **if legal filled**; else no auto-expire |
| `EXPIRED` | `SUBMITTED` | subject | new case or reopen **OD-CMP-04** |

**Forbidden:** `DRAFT` → `APPROVED`; self-approve; approve with empty required document list **if** pack lists required docs.

### 5.3 Dual control

If `kyc.doctor.dual_control` (or vendor/lab analog) is true:

- Reviewer A: `IN_REVIEW` → `PENDING_SECOND` (**OPEN DECISION OD-CMP-05:** extra state vs two signatures on `IN_REVIEW`)
- Recommendation: **two signature records** on the case; state stays `IN_REVIEW` until `signature_count >= 2` distinct users, then `APPROVED`.

Staging/dev may use single reviewer (OD-DOC-03).

### 5.4 Attachments and PII

- MIME allow-list, malware scan, object store.
- **LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether ID photos may be stored vs one-time match ([10](10_PHLEBOTOMIST_PLATFORM.md)).
- KYC images are **not** HealthArtifacts (R-EHR: mixing KYC into EHR forbidden).

### 5.5 Customer KYC

Default `registration.kyc_at_signup = false`. Wallet/payout thresholds may open a customer `KycCase`. **LEGAL** for stored-value.

---

## 6. Other compliance state machines

### 6.1 Legal hold

`LegalHold` applies to: Person, Organization, Order, HealthArtifact, Ticket, KycCase, etc.

| State | Meaning |
| --- | --- |
| `ACTIVE` | Erase/retention skip; optional freeze of destructive ops |
| `RELEASED` | Hold ended; retention clocks resume (do not backdate erase) |

| Field | Meaning |
| --- | --- |
| `hold_id` | UUID v7 |
| `scope_type` / `scope_id` | |
| `country_id` | |
| `reason_code` | Legal process — **not** invented statute names as if certified |
| `ticket_id` / `external_ref` | |
| `set_by` / `released_by` | Dual control to release **OD-CMP-06** |

Health artifacts: `status` includes `LEGAL_HOLD` / `legal_hold` flag ([16](16_HEALTH_RECORD.md)).

### 6.2 Legal notice consent (product)

| State | Meaning |
| --- | --- |
| `REQUIRED` | New version published |
| `ACCEPTED` | Version + timestamp stored |
| `WITHDRAWN` | Account close path |

Not the same as `ConsentGrant`.

### 6.3 Break-glass clinical access

Creates audited grant purpose `break_glass` ([16](16_HEALTH_RECORD.md)). Time box, ticket, reason, post-review. **LEGAL** whether patient must be notified (OD-EHR-06).

---

## 7. Configurable retention

### 7.1 Model

```
RetentionPolicy (per country pack)
  class: IDENTITY | COMMERCE | PAYMENT | LEDGER | HEALTH | KYC | AUDIT | MARKETING | SUPPORT
  retain_for: duration | “indefinite” | null (unset = do not auto-purge)
  action: ANONYMIZE | HARD_DELETE | SUPERSEDE_ONLY | NOTHING
```

Until legal fills `retain_for`, jobs **do not** purge that class (safe default). Ledger action is always `NOTHING` (no delete).

HealthArtifact `retention_status`: `ACTIVE` | `EXPIRED_PENDING` | `HELD` | `PURGED_POINTER` (metadata remains, blob gone) | `LEGAL_HOLD`.

**OPEN DECISION (OD-CMP-07):** Anonymize vs hard-delete for identity after pack allows. Recommendation: **anonymize operational PII**; keep financial/ledger ids.

### 7.2 Subject requests (export / delete)

| Request | Behavior |
| --- | --- |
| Export | Job builds machine-readable bundle (OD-EHR-04 structured JSON v1) |
| Delete | Queued; blocked by legal hold, ledger, in-flight orders, health class |
| Portability | Same export path |

Admin: [17](17_ADMIN_ERP.md) Compliance module. Customer: [05](05_CUSTOMER_PLATFORM.md) Settings.

---

## 8. Audit exports

| Property | Rule |
| --- | --- |
| Trigger | Compliance officer / super_admin + reason + optional legal process id |
| Dual control | **OD-ADM-05 / OD-CMP-08** for bulk PII or health **metadata** |
| Contents | Filter: country, time, actor, resource; **payloads of health only if** break-glass + pack |
| Format | JSONL + manifest hash; optional encrypted object |
| Delivery | Download time-boxed URL; not email attachment of clinical files |
| Integrity | Hash stored on `AuditExportJob` |

States: `REQUESTED` → `RUNNING` → `READY` | `FAILED` → `EXPIRED` (link TTL).

Support **cannot** run clinical exports.

---

## 9. Country restrictions (product)

| Mechanism | Use |
| --- | --- |
| Country `SUSPENDED` | Hard stop checkouts/bookings |
| Service flags | Hide modules |
| Geo deny | Logistics serviceability |
| Catalog blocklists | `search.blocklist_terms` — not a legal advice engine |
| Org `SUSPENDED` | KYC revoke path |

---

## 10. Pharmacovigilance / medical complaints

CRM tickets with topic medical quality **escalate** to compliance/pharmacy. CRM is **intake**, not a validated safety database.

**LEGAL/COMPLIANCE REVIEW REQUIRED** for pharmacovigilance duties. Do not claim the ticket tool is a regulatory PV system.

---

## 11. Events

| Event | Consumers |
| --- | --- |
| `kyc.submitted` / `kyc.updated` | Notify, admin queues |
| `kyc.approved` / `kyc.rejected` / `kyc.revoked` | Party status, payout gate |
| `legal_hold.set` / `legal_hold.released` | Retention jobs |
| `retention.job.completed` | Compliance |
| `audit.export.requested` / `audit.export.ready` | |
| `policy_pack.published` | Cache |
| `consent.legal.accepted` | Identity |
| `break_glass.opened` | SIEM, patient notify if pack |

---

## 12. Pack keys (compliance index)

See also [18](18_GLOBALIZATION.md) §10.4.

| Key | Default |
| --- | --- |
| `kyc.*.documents[]` | empty |
| `kyc.*.dual_control` | true recommended for doctors/labs |
| `kyc.payout_account_types[]` | pack |
| `privacy.deletion_process` | placeholder |
| `health.residency` | shared |
| `health.retention_class_map` | empty → no auto purge |
| `audit.export.legal_process` | required reason |
| `video.recording.allowed` | false |
| `affiliate.eligible_services[]` | no clinical |
| `wallet.enabled` | false |

---

## 13. Implementation notes

- Nest `compliance` module: packs, KYC, holds, retention scheduler, export jobs.
- Object storage for KYC/health with separate keys ([16](16_HEALTH_RECORD.md) §8).
- Idempotency on KYC submit, hold set, export request.
- Never log Rx bytes, PAN, or raw ID images in app logs.

---

## 14. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-CMP-01 | Invented law in pack | Legal sign-off class; empty keys |
| R-CMP-02 | Self-approved KYC | SoD |
| R-CMP-03 | Erase during hold | Hold check in job |
| R-CMP-04 | Ledger “cleanup” | Forbidden |
| R-CMP-05 | Support EHR | No permission |
| R-CMP-06 | Export over email | Time-boxed object URL |
| R-CMP-07 | Recording on by flag | Pack precedence |
| R-CMP-08 | Clinical affiliate | Default off |

---

## 15. Assumptions

| ID | Statement |
| --- | --- |
| A-CMP-01 | Shared KYC machine |
| A-CMP-02 | Unset retention = no auto-purge |
| A-CMP-03 | Platform does not confer medical accreditation |

---

## 16. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-CMP-01 | Controller vs processor per country | Encode after legal (OD-EHR-01) |
| OD-CMP-02 | Sanctions vendor | Adapter later; manual holds v1 |
| OD-CMP-03 | Dual control doctor KYC | Yes in production |
| OD-CMP-04 | Re-KYC: new case vs reopen | New case id; link `supersedes_case_id` |
| OD-CMP-05 | Explicit `PENDING_SECOND` state | Two signatures on `IN_REVIEW` |
| OD-CMP-06 | Dual control to **release** legal hold | Yes |
| OD-CMP-07 | Anonymize vs delete identity | Anonymize when pack allows |
| OD-CMP-08 | Dual control audit export | Yes for bulk PII/health metadata |
| OD-CMP-09 | Customer KYC at wallet threshold | Pack after stored-value legal |
| OD-CMP-10 | Evidence TTL auto `EXPIRED` | Only if legal fills clock |
