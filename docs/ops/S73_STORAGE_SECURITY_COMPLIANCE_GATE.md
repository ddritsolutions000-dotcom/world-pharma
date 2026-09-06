# Sprint 73 — Storage security / compliance gate

Companion to `S73_PRODUCTION_PRIVATE_STORAGE.md`.

## Gate status

| Prerequisite | Status |
|--------------|--------|
| Private cloud bucket/container + IAM | **EXTERNAL_GATED** (`NO_PRODUCTION_PRIVATE_STORAGE`) |
| Cloud KMS + secret manager + rotation | **EXTERNAL_GATED** (`NO_PRODUCTION_KMS`) |
| Malware / AV scanning service | **EXTERNAL_GATED** (`NO_PRODUCTION_MALWARE_SCANNER`) |
| No local-disk production path | **SANDBOX_VERIFIED** (fail-closed gate) |
| Short-lived authorized access tickets | **SANDBOX_VERIFIED** |
| Retention / deletion / legal hold | **RETENTION_POLICY_REQUIRED** |
| Data residency / transfer | **LEGAL_REVIEW_REQUIRED** |
| Backup / PITR / DR (S63) | **EXTERNAL_GATED** |
| PHI vs KYC document separation | **SANDBOX_VERIFIED** (boundaries); production attestation pending |

## Explicit non-claims

- LocalPrivateObjectStore ≠ production private storage
- DeterministicSandboxMalwareScanner ≠ production AV
- Env secret refs ≠ production KMS
- Upload succeeded ≠ file is production-safe
