# 71 — Health record and consent

**Status:** Blueprint — not implemented  
**Related:** [16](16_HEALTH_RECORD.md) · [27](27_SECURITY_ARCHITECTURE.md) · [18](18_GLOBALIZATION.md)

Health data is **not** marketplace data. World Pharma is **not** a hospital EMR.

**OPEN:** Controller vs processor per country (OD-EHR-01/02). **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

## 1. Separation

| Lane | Examples | Search | CRM |
| --- | --- | --- | --- |
| Clinical | Notes, Rx, results, reports | **No payload** | **No payload** |
| Commerce | Orders, SKUs, prices | Allowed (non-clinical) | Allowed |
| Payment | Intents, refunds | No PAN | Tokens/ids only |
| CRM | Tickets, campaigns | Preferences | No artifacts |

---

## 2. Aggregates

HealthRecord (patient Person), ClinicalDocument, HealthArtifact (pointer + class), ClinicalAccessGrant, ConsentGrant, TimelineEvent (type + artifact_id, **no** body).

UUID v7. Encryption at rest for artifact bytes.

---

## 3. ConsentGrant

| Attribute | Rule |
| --- | --- |
| grantee | Doctor, lab, caregiver (future), support-break-glass |
| scope | ENCOUNTER, PRESCRIPTION, REPORT, RECORD_SHARE, TELECONSULT, RECORDING, MARKETING |
| version | Policy/text version |
| timestamps | granted_at, expires_at, revoked_at |
| country | Pack |
| revocable | Where pack allows |

Marketing consent ≠ clinical. Recording default deny ([66](66_TELEMEDICINE_VIDEO.md)).

Caregiver/family: **OD-CUS-04** not v1; delivery “on behalf of” is not EHR access.

---

## 4. Access algorithm

Allow if:

- Subject is the patient, **or**
- Relationship (appointment/booking) **and** matching ConsentGrant, **or**
- Break-glass: role + reason + time-box + audit (**LEGAL**)

Support staff: **no** automatic clinical payload. Reason-required fetch.

---

## 5. Patient control

Where pack allows: view grants, revoke, download (portability **OD-EHR-03**). Retention: pack; do not invent years.

---

## 6. OpenSearch / analytics

Index: “report available”, dates, lab name — **not** analytes, notes, Rx. Analytics events: event names + ids only.
