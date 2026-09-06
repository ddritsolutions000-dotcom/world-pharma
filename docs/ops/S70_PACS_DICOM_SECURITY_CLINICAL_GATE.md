# Sprint 70 — PACS / DICOM security / clinical gate (human / external)

**Product claim:** This document does **not** assert compliance, certification, or production readiness.

| ID | Status | Owner | Evidence required | Blocker | Next action |
|----|--------|-------|-------------------|---------|-------------|
| provider_contract | EXTERNAL_GATED | Legal / Imaging IT | Signed PACS/DICOM vendor contract + DPA | No production PACS provider | Procure authorized PACS vendor |
| site_connectivity | EXTERNAL_GATED | Imaging IT | AE titles, private network, modality routing | No production DICOM endpoint | Configure connectivity after vendor selection |
| radiologist_credential | EXTERNAL_GATED | Clinical ops | Radiologist credential / privilege verification | Live credential registry EXTERNAL_GATED | Wire verification before live claims |
| viewer_authorization | EXTERNAL_GATED | Clinical / Security | Short-lived viewer session + PHI access audit | Clinical viewer EXTERNAL_GATED | Enable viewer only after PACS + auth gates |
| object_storage_kms | EXTERNAL_GATED | Platform / Security | Private bucket + encryption/KMS + signed access | OBJECT_STORAGE / KMS EXTERNAL_GATED | Never use local disk for production DICOM |
| retention_deletion | EXTERNAL_GATED | Legal / Privacy | Retention and deletion policy per market | Retention not production-attested | Complete retention review |
| country_imaging_rules | EXTERNAL_GATED | Legal | Per-country imaging/PACS legality memo | Market rules not certified in-product | Legal review per launch country |
| malware_scan | EXTERNAL_GATED | Security | Malware/file scanning for ingested objects | NO_PRODUCTION_SCANNER_ADAPTER | Register scanner before live ingestion |

## Emergency disable

1. Set `HEALTHCARE_LIVE_ENABLED=false` and/or `PROVIDER_EMERGENCY_DISABLE_PACS_DICOM=true`.
2. Stop new production PACS fetch/ingest/viewer sessions.
3. Preserve imaging studies, series/instance metadata, interpretations, and published reports.
4. Do not fabricate viewer access or study transmission.
5. Surfaces should show unavailable / EXTERNAL_GATED recovery path.
