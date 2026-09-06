# Sprint 93 — Production PACS / DICOM Imaging Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production PACS enabled:** **NO**  
**Production DICOM transmission:** **NO**  
**Provider:** `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED`  
**Transmission:** `SANDBOX_ONLY`  
**Viewer:** `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_PACS_PROVIDER`  
**Foundation:** Sprint 80 + Sprint 70  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**IMAGING REPORT ≠ DIAGNOSTIC PACS VIEWER**  
**SANDBOX STUDY ≠ PRODUCTION DICOM TRANSMISSION**  
**SANDBOX STORAGE ≠ PRODUCTION PRIVATE STORAGE / KMS**

`SandboxPacsAdapter` remains available for sandbox study/report workflows only.

---

## Current status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Adapter | Sandbox only |
| Sandbox | `SANDBOX_VERIFIED` |
| Transmission | `SANDBOX_ONLY` |
| Viewer | `EXTERNAL_GATED` |
| Object storage | `PRIVATE_STORAGE_EXTERNAL_GATED` (S82 dependency) |
| KMS | `KMS_EXTERNAL_GATED` |
| Malware scan | `MALWARE_SCAN_EXTERNAL_GATED` |
| Webhook | `EXTERNAL_GATED` |
| Backup/recovery | `EXTERNAL_GATED` |
| Force-launch | **false** |
| Native Android/iOS | `DEVICE_NOT_AVAILABLE` |

No PACS vendor, AE Titles, DICOM endpoints, certificates, studies, or diagnostic viewers were invented.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`.

---

## Required external configuration (references)

| Category | Example key |
|----------|-------------|
| Credential | `PACS_PROVIDER_SECRET_REF` |
| DICOM endpoint | `PACS_DICOM_ENDPOINT_REF` |
| AE Title | `PACS_AE_TITLE_REF` |
| TLS certificate | `PACS_TLS_CERT_REF` |
| Callback secret | `PACS_CALLBACK_SECRET_REF` |
| Market/legal pack | `PACS_MARKET_LEGAL_CONFIG_REF` |
| Viewer config | `PACS_VIEWER_CONFIG_REF` |

Also requires cleared S82 private storage + KMS + malware rails before production imaging objects.

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_PACS_PROVIDER`** (+ related **`NO_PRODUCTION_PACS_ADAPTER`**)

Granular: `PACS_PROVIDER_NOT_SELECTED`, `PACS_CREDENTIAL_REFERENCE_MISSING`, `PACS_DICOM_ENDPOINT_REFERENCE_MISSING`, `PACS_AE_TITLE_REFERENCE_MISSING`, `PACS_TLS_CERTIFICATE_REFERENCE_MISSING`, `PACS_CALLBACK_CONFIGURATION_MISSING`, `PACS_MARKET_LEGAL_CONFIGURATION_MISSING`, `PACS_VIEWER_CONFIGURATION_MISSING`, `PACS_STORAGE_KMS_DEPENDENCY_GATED`, `PACS_MALWARE_SCAN_DEPENDENCY_GATED`

---

## Study lifecycle

`SCHEDULED` → `CHECKED_IN` → `ACQUISITION_IN_PROGRESS` → `ACQUIRED`  
Exceptions: `ACQUISITION_FAILED` / `CANCELLED`

- Terminal overwrite forbidden  
- Duplicate ingest/events idempotent  
- Fake PACS ACK must never mark production transmitted  
- Synthetic UIDs are `SANDBOX_ONLY`

---

## PHI / security

- Customer: own reports only; cannot mutate clinician report authority  
- Radiologist: assigned/authorized studies only  
- Imaging operator: scoped operations  
- Admin activation ≠ universal image PHI access  
- No PHI/DICOM payloads/secrets in operational logs  

---

## Country / policy

Policy-driven evaluation markets: **GLOBAL / IN / AE / US**.  
Do not invent imaging legal rules; unmodeled requirements = policy/`LEGAL_GATED`.

---

## Sandbox limitations

- Sandbox study/report ≠ live PACS or diagnostic viewer  
- Responsive web (390/768/1024/1440) ≠ native testing (`DEVICE_NOT_AVAILABLE`)  
- Unscanned/untrusted content ≠ production-trusted  

---

## Required external approvals

1. Signed PACS/DICOM vendor contract + DPA  
2. Vault credential / endpoint / AE Title / TLS / webhook refs  
3. Site connectivity (VPN/private network)  
4. Clinical viewer authorization  
5. S82 private storage + KMS + malware scanner production readiness  
6. Market legal + retention packs  
7. Human `PROVIDER_APPROVED_PACS_DICOM` + healthcare live flag **after** enablement guard  

---

**PRODUCTION PACS ENABLED = NO**  
**PRODUCTION DICOM TRANSMISSION = NO**  
**CAN_PRODUCTION_LAUNCH = NO**
