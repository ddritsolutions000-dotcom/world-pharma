# Sprint 68 — eRx legal / clinical gate (human / external)

**Product claim:** This document does **not** assert compliance, certification, or production readiness.

| ID | Status | Owner | Evidence required | Blocker | Next action |
|----|--------|-------|-------------------|---------|-------------|
| provider_contract | EXTERNAL_GATED | Legal / Clinical ops | Signed eRx vendor contract + DPA | No real eRx provider selected | Procure market-authorized eRx vendor |
| doctor_credential_verification | EXTERNAL_GATED | Clinical ops | License/credential verification vs market registry | Live credential registry EXTERNAL_GATED | Wire verification after provider selection |
| market_erx_legality | EXTERNAL_GATED | Legal | Per-country legality memo (IN/AE/US as applicable) | Market legality not certified in-product | Complete legal review per launch country |
| pharmacy_network | EXTERNAL_GATED | Pharmacy ops | Pharmacy network / routing agreement | No live pharmacy network | Configure network after vendor onboarding |
| prescription_signing | EXTERNAL_GATED | Clinical / Security | Signing requirements + key custody | Legal e-signature EXTERNAL_GATED | Define signing path with selected vendor |
| data_protection | EXTERNAL_GATED | Privacy / Security | DPIA / PHI handling for eRx rail | Production PHI path not authorized | Complete privacy review before enablement |
| controlled_medications | EXTERNAL_GATED | Legal / Clinical | Controlled-substance capability authorization | Controlled prescribing LEGAL_GATED | Do not enable without regulatory approval |
| provider_certification | EXTERNAL_GATED | Clinical ops | Vendor certification / go-live attestation | NO_PRODUCTION_CLINICAL_ADAPTER | Register non-mock adapter after certification |

## Emergency disable

1. Set `HEALTHCARE_LIVE_ENABLED=false` and/or `PROVIDER_EMERGENCY_DISABLE_ERX=true`.
2. Stop new external transmission attempts.
3. Preserve `Prescription` / `PrescriptionErxSubmission` / encounter records.
4. Do not mark prescriptions as legally transmitted.
5. Surfaces should show unavailable / EXTERNAL_GATED recovery path.
