# Sprint 72 — KYC security / compliance gate

Companion to `S72_KYC_KYB_ONBOARDING.md`.

## Gate status

| Prerequisite | Status |
|--------------|--------|
| Real KYC / KYB vendor contract + DPA | **EXTERNAL_GATED** |
| Country coverage by partner type | **EXTERNAL_GATED** / **LEGAL_REVIEW_REQUIRED** |
| Live accreditation / medical license registries | **EXTERNAL_GATED** |
| Production private object storage (no local-disk prod path) | **EXTERNAL_GATED** |
| KMS / encryption at rest for evidence | **EXTERNAL_GATED** |
| Malware / file scanning for uploads | **EXTERNAL_GATED** (`NO_PRODUCTION_SCANNER_ADAPTER`) |
| Privacy retention / deletion for identity evidence | **EXTERNAL_GATED** |
| Reviewer SoD / dual-control for high-risk approvals | **EXTERNAL_GATED** |
| Audit trail without raw documents / secrets / PHI | **SANDBOX_VERIFIED** (event shapes) |

## Hard blocker

**NO_PRODUCTION_KYC_PROVIDER**

Ordinary Admin users cannot bypass this gate via UI. Enablement is ops/manual after human approval + secret-manager live flags.

## Explicit non-claims

- Sandbox document upload ≠ production KYC
- Admin “verified” in sandbox ≠ legally attested license
- Partner approved ≠ production clinical rails enabled
- Affiliate KYC sandbox ≠ payout live
