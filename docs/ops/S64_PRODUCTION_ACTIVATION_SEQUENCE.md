# Sprint 64 — Production activation sequence

Executable go-live phases. Do **not** run all phases simultaneously.
Do **not** mark a phase complete without real credentials/contracts/approvals.

## PHASE 0 — Infrastructure / PITR

| | |
|--|--|
| **ENTRY** | Cloud account, VPC/network, Postgres target chosen |
| **ACTIVATION** | Provision managed DB; enable WAL/PITR; configure off-site retention |
| **VERIFICATION** | Metadata health; disposable restore drill (`docs/ops/S64_RESTORE_DRILL.md`) |
| **ROLLBACK** | Tear disposable targets only; never experiment on production data |
| **EXIT** | PITR evidence recorded; RPO/RTO targets still measured as actuals |

Status today: **EXTERNAL_GATED** (`RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED`).

## PHASE 1 — Storage / security

| | |
|--|--|
| **ENTRY** | Phase 0 DB reachable |
| **ACTIVATION** | Private object storage + KMS/secret manager + malware scanner |
| **VERIFICATION** | `node scripts/provider-verify.mjs storage kms scanner` (no secret print) |
| **ROLLBACK** | Disable live upload flags; refuse local-disk production fallback |
| **EXIT** | Storage+KMS+scanner VERIFIED_BUT_DISABLED until live flags approved |

## PHASE 2 — Authentication / messaging

| | |
|--|--|
| **ENTRY** | Phase 1 secret manager available |
| **ACTIVATION** | OTP + transactional SMS/email vendors; `AUTH_DEV_REVEAL_OTP=false` |
| **VERIFICATION** | `provider-verify otp messaging`; rate-limit + abuse checks |
| **ROLLBACK** | `OTP_LIVE_ENABLED=false` / `COMMUNICATION_LIVE_ENABLED=false` — no console fallback in production |
| **EXIT** | Messaging VERIFIED; human approval recorded |

## PHASE 3 — Payments

| | |
|--|--|
| **ENTRY** | Phase 2 OTP ready; R14-A checklist started |
| **ACTIVATION** | CONFIGURED → connectivity → merchant verify → test strategy → webhooks → reconcile → APPROVED → ENABLED |
| **VERIFICATION** | Payment gate + unsigned webhook deny + idempotency; **no fake live charge** |
| **ROLLBACK** | `PAYMENT_LIVE_ENABLED=false`; preserve intents/orders; **no sandbox fallback** |
| **EXIT** | Live PSP ENABLED only after real provider + R14-A |

## PHASE 4 — Carrier

| | |
|--|--|
| **ENTRY** | Phase 3 stable payments |
| **ACTIVATION** | Register live carrier adapter; serviceability; webhooks |
| **VERIFICATION** | Create/track/cancel against live adapter (when credentials exist) |
| **ROLLBACK** | `CARRIER_LIVE_ENABLED=false`; preserve shipments |
| **EXIT** | Live carrier ENABLED |

Today: **NO_PRODUCTION_CARRIER_ADAPTER**.

## PHASE 5 — Affiliate payouts

| | |
|--|--|
| **ENTRY** | Accrual ledger healthy; compliance ready |
| **ACTIVATION** | Separate accrual from execution; `PAYOUT_LIVE_ENABLED` explicit |
| **VERIFICATION** | Idempotent submit; hold on failure |
| **ROLLBACK** | Disable live payout; keep liabilities |
| **EXIT** | Payout rail ENABLED |

Today: **EXTERNAL_PAYOUT_GATED**.

## PHASE 6 — Healthcare integrations

| | |
|--|--|
| **ENTRY** | Legal/clinical approvals for market |
| **ACTIVATION** | eRx / video / PACS / KYC per contract |
| **VERIFICATION** | Adapter + clinical policy; UI must not claim sandbox is legal clinical service |
| **ROLLBACK** | Show unavailable; preserve clinical records |
| **EXIT** | Only approved rails ENABLED |

## PHASE 7 — Country activation

| | |
|--|--|
| **ENTRY** | Country policy pack valid + required providers + legal gates |
| **ACTIVATION** | Control-plane lifecycle → ACTIVE (human gate) |
| **VERIFICATION** | Activation dry-run first |
| **ROLLBACK** | Suspend country |
| **EXIT** | Country ACTIVE for controlled traffic |

Do **not** activate additional countries in this sprint.

## PHASE 8 — Controlled launch

| | |
|--|--|
| **ENTRY** | Phase 7 complete for first country |
| **ACTIVATION** | Limited cohort / rate limits / on-call |
| **VERIFICATION** | Order/payment/fulfillment reconciliation |
| **ROLLBACK** | Suspend country or disable live rails |
| **EXIT** | Stable limited production |

## PHASE 9 — Monitoring / reconciliation

| | |
|--|--|
| **ENTRY** | Controlled traffic flowing |
| **ACTIVATION** | APM + pager + finance reconcile jobs |
| **VERIFICATION** | Test page + break detection |
| **ROLLBACK** | Keep `/metrics`; disable pager noise |
| **EXIT** | Observability production-ready |

## Ops commands (safe)

```bash
node scripts/provider-verify.mjs
node scripts/provider-verify.mjs payments otp carrier payout
GET /api/v1/admin/control-plane/provider-activation
GET /api/v1/admin/control-plane/provider-activation/:id/verify
```

Never print API keys, tokens, or OTP values.
