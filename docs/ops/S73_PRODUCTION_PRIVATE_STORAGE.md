# Sprint 73 — Production private storage + KMS + malware scanning activation readiness

> **Sprint 82** stabilizes activation readiness on this foundation. See `S82_PRIVATE_STORAGE_KMS_MALWARE_ONBOARDING.md`.
> **Sprint 95** is the production activation-readiness pass. See `S95_PRODUCTION_STORAGE_KMS_MALWARE_ACTIVATION_READINESS.md`.
> Blockers remain **NO_PRODUCTION_PRIVATE_STORAGE** / **NO_PRODUCTION_KMS** / **NO_PRODUCTION_MALWARE_SCANNER**.

## Availability (this environment)

| Rail | Provider | Sandbox | Production | Enabled | Blocker |
|------|----------|---------|------------|---------|---------|
| Private object storage | **NOT_SELECTED** | **SANDBOX_VERIFIED** (LocalPrivateObjectStore + opaque tickets) | **EXTERNAL_GATED** | false | **NO_PRODUCTION_PRIVATE_STORAGE** |
| KMS / encryption | **NOT_SELECTED** | **SANDBOX_ONLY** (env refs) | **EXTERNAL_GATED** | false | **NO_PRODUCTION_KMS** |
| Malware scanning | **NOT_SELECTED** | **SANDBOX_ONLY** (DeterministicSandboxMalwareScanner) | **EXTERNAL_GATED** | false | **NO_PRODUCTION_MALWARE_SCANNER** |

No cloud bucket, KMS, or AV vendor was invented. Local disk is **never** a production fallback.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Bucket refs / env flags alone **never** imply production enablement. Guard requires all three rails + legal/privacy + backup/PITR + residency + human approvals + live flags.

## Private access model

- Objects are private; access via opaque short-lived tickets (not permanent public URLs)
- Authorization + tenant/object scope before ticket issue
- Paths/credentials never returned as HTTP URLs
- Classification: PUBLIC / PRIVATE / SENSITIVE / CLINICAL_PHI

## Malware scan lifecycle

`UPLOAD → QUARANTINE → MALWARE_SCAN → CLEAN | REJECTED → AVAILABLE`

Statuses: `CLEAN`, `INFECTED`, `SCAN_FAILED`, `QUARANTINED`

Sandbox deterministic scan is **SANDBOX_ONLY**. Production must not mark unscanned files clean.

## KMS gate

Application env secret refs ≠ production KMS. Encryption-at-rest, rotation, and key ACL remain **EXTERNAL_GATED** until a real KMS is connected. Never log keys.

## Retention / residency / DR

| Concern | Status |
|---------|--------|
| Retention / deletion / legal hold | **RETENTION_POLICY_REQUIRED** |
| Data residency | **POLICY_DRIVEN** / **LEGAL_REVIEW_REQUIRED** |
| Backup / PITR (S63) | **EXTERNAL_GATED** |

Do not invent country retention periods or hardcode India/IN/INR/₹/UPI/+91/IST.

## Emergency disable

`OBJECT_STORAGE_LIVE_ENABLED=false` / `KMS_LIVE_ENABLED=false` / `FILE_SCANNING_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_*`:

- fail closed for unsafe production uploads
- preserve metadata/history
- do not delete documents
- do not expose private objects
- do not mark unscanned files clean

## Admin

- `/provider-activation` — Private storage / KMS / Malware cards
- `/reliability` + `/launch-readiness`
- `GET /api/v1/admin/control-plane/production-storage-onboarding`

## When real infrastructure is supplied

1. Register non-local private object storage adapter + private ACL + encryption.
2. Connect cloud KMS + secret manager + rotation.
3. Register malware scanner endpoint + quarantine.
4. Clear legal/privacy, residency, retention; attest backup/PITR.
5. Set `PROVIDER_APPROVED_OBJECT_STORAGE` / `KMS` / `MALWARE_SCANNER`.
6. Enable live flags only after enablement guard `can_enable=true`.
7. Never treat local sandbox store as production-secure.
