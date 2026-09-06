# Real production activation — World Pharma

This repo is the **software product**. Sandbox proves flows. **Live money / SMS / carriers are not enabled** until vendors + secrets are wired. `CAN_PRODUCTION_LAUNCH` stays **NO** until gates below clear.

## Already built (do not rebuild)

- Marketplace: nearest warehouse → pack → nearest rider → photo/OTP POD → live track → returns
- Partner wallet self-withdraw (live bank payout still EXTERNAL_GATED)
- Password + mobile OTP login path
- Platform fee + separate affiliate marketing commission
- Join docs / KYC ticket viewer / pharmacy licence handoff
- Admin launch-control rails (honest EXTERNAL_GATED status)

## Must procure before “real” go-live

| Rail | Need | Until then |
|------|------|------------|
| Payments (PSP) | One live gateway + webhook secrets | Mock/sandbox only |
| OTP / SMS / email | Production messaging provider | Console OTP / reveal blocked in prod |
| Carrier | Live carrier adapter + tracking webhooks | Mock carrier |
| KYC | Live vendor or formal manual-only policy | Sandbox review |
| Private storage / KMS / AV | Cloud object store + KMS + malware | Local private store |
| Secrets manager | Vault/SM injection at runtime | Env files (dev only) |
| Backup / PITR / DR | Managed Postgres + proven RPO/RTO | Local dumps |
| Deploy target | Staging + production hosts + release pipeline | Local/Docker only |

## Hard rules

1. Production host must set `NODE_ENV=production` and must **fail closed** if sandbox/mock adapters are selected for money or OTP reveal.
2. Never commit `.env`, keys, or live credentials — use secrets manager.
3. Do not invent hospital backends or claim live Razorpay/carriers until adapters are registered and launch-control shows ENABLED.

## Suggested activation order

1. Staging environment + secrets manager  
2. SMS/email OTP (kill `AUTH_DEV_REVEAL_OTP` in staging/prod)  
3. One PSP (sandbox mode → live mode)  
4. Carrier tracking  
5. KYC + private storage/KMS  
6. Human launch gates (legal, ops, R14-A evidence)

Admin **Launch readiness** / production-launch-control is the source of truth in-app.
