# 75 — Healthcare security and compliance

**Status:** Blueprint — not implemented  
**Related:** [27](27_SECURITY_ARCHITECTURE.md) · [19](19_COMPLIANCE_FRAMEWORK.md) · [18](18_GLOBALIZATION.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md)

**Do not invent law.** Every enablement: **LEGAL/COMPLIANCE REVIEW REQUIRED**.

---

## 1. Stronger isolation than commerce

| Control | Healthcare |
| --- | --- |
| TLS in transit | Yes |
| Encryption at rest | Artifact store + DB TDE as infra |
| Field-level | Notes, results, Rx payloads |
| RLS | Patient, lab, doctor org |
| RBAC | Fine permissions |
| ABAC | Relationship + consent |
| Break-glass | Reason, TTL, audit |
| MFA | Doctors, labs, pathologists, finance |
| Rate limits | Token mint, OTP, download |
| Anomaly | Unusual report mass-download |

---

## 2. Never log / never index

Clinical notes, prescriptions, lab reports, diagnostic values, OTP, passwords, PAN/CVV, payment secrets, KYC images, recording URLs.

Correlation IDs + object ids only in telemetry ([30](30_OBSERVABILITY.md)).

---

## 3. Compliance matrix (template — empty until legal fill)

| Theme | Pack key | Status |
| --- | --- | --- |
| Telemedicine | `telehealth.enabled` | Empty |
| Doctor licensing | credential types | Empty |
| Lab licensing | lab credentials | Empty |
| Prescription / controlled | Rx flags | Empty |
| Health privacy | residency, retention | Empty |
| Consent | grant/revoke rules | Empty |
| Specimen transport | courier class | Empty |
| Report signature | e-sign vs wet | Empty |
| Payment / refund | healthcare tax class | Empty |
| Marketing / affiliate | clinical OFF | Default deny |
| Cross-border data | residency mode | Empty |

Unknown = **deny feature**.

---

## 4. Sessions / devices

Device bind for field apps (PHE, DEL). Session revoke. Step-up for Rx publish and report publish.

---

## 5. Certification claims

Do **not** claim HIPAA/GDPR/ISO certification in product copy until OD-BRAND and legal say so.
