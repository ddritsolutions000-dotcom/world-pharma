# WORLD_PHARMA S149 — Affiliate Payout + Partner Settlement Production Workflow Closure

**Sprint:** 149  
**Master backlog:** #446  
**Status:** COMPLETE (software) — production affiliate payout remains **EXTERNAL_GATED**  
**CAN_PRODUCTION_LAUNCH:** NO

## Objective

Complete the **software-side** affiliate payout and partner settlement production workflow.

Does **not** invent PSP/bank credentials, execute real money, or claim production payouts. MockPayoutAdapter ≠ production proof.

## Money flow (existing model)

```
customer/order → attribution → commission eligibility → calculation → pending
→ validation/hold → payable → settlement batch → payout instruction
→ provider confirmation → paid → reconciliation
```

No duplicate commission/settlement systems.

## Payout lifecycle

```
ELIGIBLE → HELD → PAYABLE → SUBMITTED → PROCESSING → PAID
```

Failure/recovery: `FAILED` / `REVERSED` / `ADJUSTED`.

Illegal: `PAID → PAYABLE|PROCESSING|PAID` (duplicate money movement forbidden).

Current evaluated production payout lifecycle: **HELD / EXTERNAL_GATED**. Enabled: **false**.

## PSP / KYC gating

Requires production PSP (S132), S142 secret refs, verification, approval/live enablement. Absent → `AFFILIATE_PAYOUT_EXTERNAL_GATED` / `NO_PRODUCTION_PAYOUT_ADAPTER`.

KYC/KYB: identity ≠ approval ≠ payout eligibility ≠ production enablement. Verified document ≠ automatic payout authorization.

## Idempotency

Idempotency key + settlement identity + provider/reconciliation refs. Retries must not duplicate money. Client/browser cannot create arbitrary payouts.

## Global currency policy

No hardcoding of India / INR / GST / UPI / PAN / IST. Policy-driven country/market/currency. Customer market, affiliate market, and provider jurisdiction remain distinguishable.

## Admin / Affiliate portal

Admin: readiness, commission, settlement, payable (server-computed), payout/provider/KYC/reconciliation states, blockers. SoD: affiliate cannot self-approve, change amount, mark paid, bypass KYC/PSP, or modify reconciliation.

Affiliate portal: own commissions/statements/payouts only — no PHI, other affiliates, PSP secrets, or reconciliation credentials.

## Authoritative module

`apps/api/src/finance/affiliate-payout-settlement-production-workflow-closure.ts`

Composes S71 + S132 + KYC (S124/S135) + S142–S148.

## Tests

```bash
npx nx test api --testPathPatterns="s149-affiliate-payout-settlement" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 9 passed, 9 total

npx nx test api --testPathPatterns="s149-affiliate-payout|s71-affiliate-payout|s128-psp|s132-psp|s124-kyc|s135-pharmacy|s142-secrets|s143-observability|s148-production-security" --skip-nx-cache
# Test Suites: 9 passed, 9 total | Tests: 75 passed, 75 total
```

## Runtime evidence (2026-09-05)

API rebuilt and **restarted**. Admin `:3001`. Affiliate portal `:3010`.

| Check | Result |
| --- | --- |
| `GET /health` | **200** |
| `GET /health/ready` | **200** |
| `GET /health/version` | **200** |
| `GET …/affiliate-payout-settlement-production-workflow-closure` (no auth) | **401** |
| `GET …/affiliate-payout-onboarding` (no auth) | **401** |
| Admin UI `/` + `/provider-activation` | **200** |
| Affiliate portal `http://127.0.0.1:3010/` | **200** |

Payout execution remains **EXTERNAL_GATED** (no real PSP). No fake payout.

Authenticated Admin: **AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED** (OTP/MFA). Do not claim Browser PASS.

## Remaining external blockers

- `NO_PRODUCTION_PAYOUT_ADAPTER`
- `NO_PRODUCTION_AFFILIATE_PAYOUT`
- `NO_PRODUCTION_PSP`
- `NO_PRODUCTION_KYC_KYB_PROVIDER`
- `AFFILIATE_PAYOUT_EXTERNAL_GATED`

**Explicit:** Affiliate commission software flow complete? **YES**. Affiliate settlement software flow complete? **YES**. Real PSP payout provider configured? **NO**. Real payout executed? **NO**. Production affiliate payout enabled? **NO**. Production launch allowed? **NO**.

**Software completion ≠ real money movement.**

**STOP after S149.**
