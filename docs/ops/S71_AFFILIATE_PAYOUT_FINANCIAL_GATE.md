# Sprint 71 — Affiliate payout legal / financial gate (human / external)

**Product claim:** This document does **not** assert compliance, certification, or production readiness.

| ID | Status | Owner | Evidence required | Blocker | Next action |
|----|--------|-------|-------------------|---------|-------------|
| provider_contract | EXTERNAL_GATED | Finance / Legal | Signed payout vendor contract + DPA | No production payout provider | Procure bank/wallet payout rail |
| kyc_aml | EXTERNAL_GATED | Compliance | KYC/AML provider + beneficiary verification | KYC_PROVIDER_EXTERNAL_GATED | Do not enable live payouts without KYC/AML |
| beneficiary_rails | EXTERNAL_GATED | Finance ops | Destination account/wallet rails per market | No production beneficiary rails | Configure country-policy payout methods |
| tax_reporting | EXTERNAL_GATED | Finance / Legal | Tax/withholding requirements per market | Tax reporting not production-attested | Complete tax/reporting review |
| dual_control | EXTERNAL_GATED | Finance ops | Maker-checker for disbursements | Dual-control not attested | Confirm dual-control before PAYOUT_LIVE_ENABLED |
| webhook_reconciliation | EXTERNAL_GATED | Platform / Finance | Signed webhooks + reconciliation runbook | Production webhook EXTERNAL_GATED | Wire signed callbacks + recon |
| country_currency_policy | EXTERNAL_GATED | Finance / Product | Per-country payout method + currency policy | Market methods not production-certified | Confirm policy packs; no single-market hardcode |

## Emergency disable

1. Set `PAYOUT_LIVE_ENABLED=false` and/or `PROVIDER_EMERGENCY_DISABLE_AFFILIATE_PAYOUT=true`.
2. Stop new production disbursements.
3. Preserve settlements, commissions, payout rows, and ledger history.
4. Do not mark unpaid balances as PAID.
5. Surfaces should show unavailable / EXTERNAL_GATED recovery path.
