# Sprint 69 — Telemedicine / video legal / clinical gate (human / external)

**Product claim:** This document does **not** assert compliance, certification, or production readiness.

| ID | Status | Owner | Evidence required | Blocker | Next action |
|----|--------|-------|-------------------|---------|-------------|
| provider_contract | EXTERNAL_GATED | Legal / Clinical ops | Signed video vendor contract + DPA | No production video provider selected | Procure market-authorized telemedicine vendor |
| doctor_credential_verification | EXTERNAL_GATED | Clinical ops | Doctor license/credential verification | Live credential registry EXTERNAL_GATED | Wire verification after provider selection |
| patient_consent | EXTERNAL_GATED | Clinical / Privacy | Telemedicine consent policy per market | Production consent policy not certified | Confirm consent pack rules before live video |
| privacy_data_processing | EXTERNAL_GATED | Privacy / Security | DPIA / media processing terms | Production PHI/media path not authorized | Complete privacy review before enablement |
| recording_consent | EXTERNAL_GATED | Legal / Clinical | Recording consent + retention (if enabled) | Recording DISABLED / EXTERNAL_GATED | Keep recording off until storage/KMS + consent |
| country_telemedicine_rules | EXTERNAL_GATED | Legal | Per-country telemedicine legality memo | Market rules not certified in-product | Complete legal review per launch country |
| data_residency | EXTERNAL_GATED | Security / Legal | Media region / residency attestation | Production media residency EXTERNAL_GATED | Confirm vendor regions with launch countries |
| provider_certification | EXTERNAL_GATED | Clinical / Platform | Vendor certification / go-live attestation | NO_PRODUCTION_CLINICAL_ADAPTER | Register production adapter after certification |
| emergency_care_limitations | EXTERNAL_GATED | Clinical ops | Emergency/out-of-scope workflow | Not production-attested | Publish clinical escalation runbook |

## Emergency disable

1. Set `HEALTHCARE_LIVE_ENABLED=false` and/or `PROVIDER_EMERGENCY_DISABLE_VIDEO=true`.
2. Stop new live session creation.
3. Preserve appointments, encounters, clinical notes, and video session rows.
4. Do not mark consultations completed solely due to provider outage.
5. Surfaces should show unavailable / EXTERNAL_GATED recovery path.
