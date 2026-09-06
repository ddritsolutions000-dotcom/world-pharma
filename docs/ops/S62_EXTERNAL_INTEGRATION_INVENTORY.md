# Sprint 62 — External integration inventory

**Authority:** engineering readiness for production integrations.  
**Not a claim of production launch.** Software rails + fail-closed gates ≠ live providers.

Last verified: Sprint 62 (sandbox runtime). R14-A human gates remain **0/7**.

Legend for **current status**:
- `IMPLEMENTED` — software boundary/adapter exists
- `SANDBOX_VERIFIED` — sandbox path exercised
- `PRODUCTION_CONFIG_READY` — env/refs/gates ready for real credentials (not live)
- `EXTERNAL_GATED` — live provider / cloud / human approval still required
- `NOT_VERIFIED` — not exercised this sprint

---

## 1. PSP / payments

| Field | Detail |
|-------|--------|
| Purpose | Capture/authorize customer payments; webhooks drive payment state |
| Interface | `PaymentRouter`, `SandboxWebhookAdapter`, `production-payment-gate.ts`, `PaymentService` |
| Config | `PAYMENT_ENVIRONMENT`, `PAYMENT_LIVE_ENABLED`, `PAYMENT_PRODUCTION_COUNTRIES`, `PAYMENT_GATEWAY_*_SECRET_REF` |
| Secrets | Gateway webhook/API secret refs (never in git); `PAYMENT_MOCK_WEBHOOK_SECRET` sandbox only |
| Sandbox | Mock gateway + signed sandbox webhooks |
| Production | Blocked until R14-A + VERIFIED non-mock `PAYMENT_PROVIDER` + live flags |
| Status | IMPLEMENTED · SANDBOX_VERIFIED · PRODUCTION_CONFIG_READY (refs) · **EXTERNAL_GATED** (live PSP) |
| Fail-closed | Missing/gated PSP → no false success; production webhook ingest → **503** `PRODUCTION_WEBHOOK_EXTERNAL_GATED` |
| Observability | Security events `PAYMENT_WEBHOOK_*`; Admin payments production-availability |
| Idempotency | `paymentWebhookEvent` unique `(gatewayId, providerEventId)`; duplicate → `{ duplicate: true }` |
| External needed | Approved PSP contract, merchant credentials, webhook secrets, R14-A owner evidence |

## 2. OTP / authentication messaging

| Field | Detail |
|-------|--------|
| Purpose | Login OTP delivery |
| Interface | `AuthService` + OTP adapters; `production-otp-gate.ts` |
| Config | `COMMUNICATION_ENVIRONMENT`, `OTP_LIVE_ENABLED`, OTP provider dependency |
| Secrets | Provider API keys via secret manager refs; `OTP_PEPPER`; `AUTH_DEV_REVEAL_OTP` **dev only** |
| Sandbox | Console/dev reveal OTP |
| Production | Requires VERIFIED `OTP_PROVIDER` + live flags |
| Status | IMPLEMENTED · SANDBOX_VERIFIED · **EXTERNAL_GATED** |
| Fail-closed | Production OTP assert → **409** blockers; must not claim send without provider |
| Observability | Security events OTP_REQUESTED/VERIFIED; ready runtime `otp: sandbox` |
| External needed | Production SMS/WhatsApp/email OTP vendor |

## 3. Transactional SMS / email / push

| Field | Detail |
|-------|--------|
| Purpose | Order/clinical/ops notifications |
| Interface | `production-messaging-gate.ts`, notification outbox/dispatch |
| Config | `COMMUNICATION_*`, messaging provider deps |
| Status | IMPLEMENTED · SANDBOX_VERIFIED · **EXTERNAL_GATED** |
| Fail-closed | Production messaging assert fail-closed; sandbox console OK |
| External needed | SMS/email/push providers per market |

## 4. Carrier / shipping

| Field | Detail |
|-------|--------|
| Purpose | Book/track shipments |
| Interface | `MockCarrierAdapter`, `production-logistics-gate.ts`, carrier webhooks |
| Config | `LOGISTICS_ENVIRONMENT`, `CARRIER_*`, `CARRIER_MOCK_WEBHOOK_SECRET` |
| Status | IMPLEMENTED · SANDBOX_VERIFIED · **EXTERNAL_GATED** (`NO_PRODUCTION_CARRIER_ADAPTER`) |
| Fail-closed | Production book blocked; production carrier webhook → **503** |
| Idempotency | Shipment outbox occurrence keys; webhook provider event uniqueness |
| External needed | Live carrier API + webhook signing secrets |

## 5. Affiliate payouts

| Field | Detail |
|-------|--------|
| Purpose | Settle affiliate liabilities to bank |
| Interface | `finance.service.ts` → `EXTERNAL_PAYOUT_GATED` |
| Status | IMPLEMENTED (accrual/settlement records) · **EXTERNAL_GATED** (live payout) |
| Fail-closed | No bank transfer execution; UI shows EXTERNAL_PAYOUT_GATED |
| External needed | Payout PSP / bank rail + KYC |

## 6. eRx

| Field | Detail |
|-------|--------|
| Purpose | Legally transmit electronic prescriptions |
| Interface | `ErxRouter` + sandbox/`NullERxAdapter`; healthcare production gate |
| Status | IMPLEMENTED (sandbox/null) · **EXTERNAL_GATED** |
| Fail-closed | Cannot represent as legally transmitted live eRx |
| External needed | Market eRx network credentials |

## 7. Telemedicine / video

| Field | Detail |
|-------|--------|
| Purpose | Live consult video |
| Interface | `MockVideoProvider`, optional LiveKit sandbox; `video-webhook.controller.ts` |
| Config | `VIDEO_PROVIDER`, `LIVEKIT_*` (sandbox optional) |
| Status | IMPLEMENTED (mock/sandbox) · **EXTERNAL_GATED** for production clinical |
| Fail-closed | No fake live production session; doctor UI EXTERNAL_GATED |
| External needed | Production video vendor + clinical policy |

## 8. PACS / DICOM

| Field | Detail |
|-------|--------|
| Purpose | Study image viewing / PACS |
| Interface | Healthcare catalog; radiology shells; interpretation DICOM viewer disabled reason |
| Status | Report workflow SANDBOX_VERIFIED · viewer **EXTERNAL_GATED** |
| Fail-closed | No fake PACS viewer |
| External needed | PACS/DICOM vendor + network |

## 9. Object / file storage

| Field | Detail |
|-------|--------|
| Purpose | Partner KYC/docs, clinical artifacts |
| Interface | `partner/object-store.ts`, `production-storage-gate.ts` |
| Config | `OBJECT_STORAGE_*`, `INFRASTRUCTURE_ENVIRONMENT` |
| Status | Local private store SANDBOX · production **EXTERNAL_GATED** (`NO_PRODUCTION_STORAGE_ADAPTER`) |
| Fail-closed | Production forbids local disk fallback |
| External needed | S3-compatible bucket + IAM |

## 10. KMS / secrets

| Field | Detail |
|-------|--------|
| Purpose | Secret material at rest / refs |
| Interface | `production-config.ts` `kms_secrets` |
| Config | `SECRET_MANAGER_REF`, `KMS_KEY_REF` |
| Status | Env refs only · **EXTERNAL_GATED** |
| External needed | Cloud KMS / secret manager |

## 11. Malware / file scanning

| Field | Detail |
|-------|--------|
| Purpose | Scan uploads before accept |
| Interface | `production-file-scanning-gate.ts` |
| Status | Noop/deterministic sandbox · production **EXTERNAL_GATED** |
| Fail-closed | Production forbids noop as live AV |
| External needed | AV endpoint |

## 12. KYC / document verification

| Field | Detail |
|-------|--------|
| Purpose | Partner identity/document verification |
| Interface | Partner onboarding + Admin KYC readiness (`external_gated`) |
| Status | Workflow IMPLEMENTED · live KYC **EXTERNAL_GATED** |
| External needed | KYC vendor |

## 13. Healthcare / provider verification

| Field | Detail |
|-------|--------|
| Purpose | Credential/attestation ops vs legal accreditation |
| Interface | `production-healthcare-gate.ts`, healthcare-network admin |
| Status | Software ops IMPLEMENTED · live registries/accreditation **EXTERNAL_GATED** |

## 14. Monitoring / alerting

| Field | Detail |
|-------|--------|
| Purpose | Ops visibility / paging |
| Interface | `/health`, `/health/ready`, `/metrics`, structured logs |
| Status | Software probes SANDBOX_VERIFIED · APM/pager **EXTERNAL_GATED** |

## 15. Database backup / PITR

| Field | Detail |
|-------|--------|
| Purpose | Recovery |
| Interface | `docs/ops/PRODUCTION_INFRASTRUCTURE.md`, backup scripts, ready payload |
| Status | Local backup tooling IMPLEMENTED · managed PITR **EXTERNAL_GATED**; RPO/RTO **NOT_YET_DEFINED** |

## 16. HL7 / FHIR (catalog)

| Field | Detail |
|-------|--------|
| Purpose | Clinical interoperability |
| Interface | Healthcare integration catalog |
| Status | Catalog EXTERNAL_GATED · no live adapters |

---

## Cross-cutting reliability (Sprint 61–62)

- Outbox `occurrenceKey` idempotent enqueue (`outbox.service.ts`)
- Order transition occurrence keys include history id (re-fulfillment safe)
- Payment webhook pre-check on provider event id (duplicate-safe)
- Production payment/carrier webhooks refuse ingest (503) without claiming success

## Secrets hygiene (Sprint 62 scan)

Pattern scan for live key material (`sk_live_`, PEM private keys, `AKIA…`, GitHub/Slack tokens): **0 file hits** in apps/packages/scripts/docs (excluding node_modules). Sandbox fixture secrets remain env-based (`.env.example` names only).
