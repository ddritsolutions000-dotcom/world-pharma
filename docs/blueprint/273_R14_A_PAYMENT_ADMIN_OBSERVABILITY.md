# 273 — R14-A payment admin observability (CR-273)

**CR:** `CR-R14-A-PAYMENT-ADMIN-OBSERVABILITY-273`  
**Verdict:** **`R14_A_PAYMENT_ADMIN_OBSERVABILITY_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [272](272_R14_A_PAYMENT_WEBHOOK_RECON.md) (**R14_A_PAYMENT_WEBHOOK_RECON_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Provider-neutral admin payment observability for sandbox operations. **No live PSP. No schema changes. No human gate changes.**

---

## 1. Architecture discovered (pre-CR-273)

| Component | Location | Pre-CR behavior |
|-----------|----------|-----------------|
| Admin payment list | `PaymentAdminController` `GET /admin/payments` | Basic list via `adminSearch()` — no country scope, no filters |
| Admin payment detail | `GET /admin/payments/:id` | Raw `present()` only — no webhooks/reconciliation/audit |
| UNKNOWN queue | `GET /admin/payments/unknown` | List UNKNOWN intents — no country scope |
| Reconcile action | `POST /admin/payments/:id/reconcile` | Canonical reconcile path (CR-272) |
| Webhook ingest | `PaymentWebhookController` | HMAC + dedup (CR-272) |
| Admin UI | `payments-admin.tsx` | Minimal list + unknown count — no detail/filters/timeline |
| RBAC | `payment:read`, `payment:reconcile` | Existing permissions on admin controller |
| Audit kernel | `OutboxEvent`, `PaymentWebhookEvent`, `PaymentReconciliation` | Data existed but no admin read surface |

**Gaps:** no country-scoped observability; no webhook/reconciliation/audit admin views; no safe failure classification; UI lacked detail/loading/error states.

---

## 2. Observability contract implemented

### A. Payment overview
- Intent/attempt status, gateway code/environment, order reference, country code, timestamps
- Safe `failure_classification` for FAILED/UNKNOWN intents

### B. Webhook visibility
- `GET /admin/payments/webhooks` — paginated/filtered list
- `GET /admin/payments/webhooks/:eventId` — single event detail
- Processing status: `received` | `processed` | `rejected`
- Safe `rejection_reason` when applicable
- **Never returns** `payload_cipher`, signatures, or raw provider payloads

### C. Reconciliation visibility
- Included in `GET /admin/payments/:id/observability` as `reconciliations[]`
- Status, break_type, safe detail, timestamp

### D. Audit visibility
- Merged timeline from outbox (`PaymentIntent` aggregate), webhook events, reconciliation rows
- Chronological `audit_timeline[]` with sanitized references

### Pre-mutation webhook rejections
- Signature/timestamp failures remain rejected before DB insert (CR-272 contract preserved)
- Admin can view seeded/rejected rows (`signatureOk=false`) when present; live rejections are not persisted

---

## 3. API surface

| Method | Route | Permission | Notes |
|--------|-------|------------|-------|
| GET | `/admin/payments` | `payment:read` | Filters: `country_code`, `status`, `gateway_code`, `order_id`, `from`, `to`, `limit` |
| GET | `/admin/payments/unknown` | `payment:reconcile` | Country-scoped UNKNOWN queue |
| GET | `/admin/payments/webhooks` | `payment:read` | Filters: `country_code`, `intent_id`, `gateway_code`, `processing_status`, dates |
| GET | `/admin/payments/webhooks/:eventId` | `payment:read` | Requires `country_code` |
| GET | `/admin/payments/:id/observability` | `payment:read` | Full detail + timeline |
| GET | `/admin/payments/:id` | `payment:read` | Legacy present; observability when `country_code` supplied |

Country scoping uses `resolveCountryByCode` + `runWithTenant` — cross-country access returns 404.

---

## 4. Code changes

### Created

| File | Purpose |
|------|---------|
| `payment-observability.ts` | Safe presenters + sanitization helpers |
| `payment-observability.spec.ts` | Unit tests |
| `payment-admin-observability.e2e.spec.ts` | 10-scenario admin observability e2e |
| `payments-admin-api.ts` | web-admin API client |

### Modified

| File | Change |
|------|--------|
| `payment.service.ts` | `adminSearch`, `unknownQueue`, `adminGetObservability`, `adminListWebhooks`, `adminGetWebhook`, helpers |
| `admin.controller.ts` | New routes + query params + principal injection |
| `payments-admin.tsx` | Full observability UI with filters, detail, states |
| `payments-admin.spec.tsx` | UI regression tests |

**Migrations:** None

---

## 5. Security verification

| Control | Status |
|---------|--------|
| RBAC `payment:read` / `payment:reconcile` | Enforced |
| Country isolation | 404 on cross-country detail |
| Tenant context | `runWithTenant` on all scoped queries |
| Sensitive data | No PAN/CVV/signatures/payload_cipher in responses |
| PCI source scan | `pci.spec.ts` green (obfuscated key fragments) |
| Production MOCK | Unchanged fail-closed (CR-272) |
| `PAYMENT_LIVE_ENABLED` | Unchanged (off) |
| Clinical search | Untouched |
| Human gates | 0/7 unchanged |

---

## 6. Tests executed

| Suite | Pass | Fail |
|-------|------|------|
| Admin observability e2e | **10** | 0 |
| payment-observability unit | **6** | 0 |
| Full `apps/api/src/payment/**` | **103** | 0 |
| CR-270 refund listener e2e | **10** | 0 |
| CR-271 order refund status e2e | **10** | 0 |
| CR-272 webhook recon e2e | **18** | 0 |
| outbox e2e | **6** | 0 |
| web-admin payments UI spec | **7** | 0 |
| API typecheck + build | **PASS** | — |
| web-admin / web-customer / mobile typecheck | **PASS** | — |

---

## 7. Database / runtime

- **Migrations:** 128/128 on `worldpharma` and `worldpharma_test` — none applied in CR-273
- **`/health/ready`:** HTTP **200** — `postgres: up`, `redis: up`, `bullmq: up`
- New admin routes registered at startup (`/admin/payments/webhooks`, `/admin/payments/:id/observability`)

---

## 8. Remaining R14-A engineering

1. **Sandbox payment routing matrix admin** — visualize gateway routing rules and failover policy per country
2. Real PSP adapter (blocked on human gates)
3. Production routing (blocked on human gates)

---

## 9. Next CR

**Engineering:** **`CR-R14-A-PAYMENT-ROUTING-MATRIX-274`** — sandbox payment routing matrix admin visibility and policy alignment checks.

**Human track (parallel):** Owner evidence via Book 263 → `CR-R14-A-IMPL-244` when gates are evidenced.
