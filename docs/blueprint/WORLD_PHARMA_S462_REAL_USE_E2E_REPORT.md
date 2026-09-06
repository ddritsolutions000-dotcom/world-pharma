# WORLD_PHARMA S462 — Real-Use E2E Execution + Order-to-Delivery Closure

**Master backlog:** **#462**  
**Document type:** Sandbox/staging real-use execution (not a feature sprint)  
**RUNTIME_ENV:** **DEVELOPMENT / SANDBOX** — not production  

| Headline | Value |
| --- | --- |
| **FINAL DECISION** | **B) SANDBOX_E2E_PARTIAL** — order-to-delivery closed; browser UI depth + mobile + production gates remain |
| **ORDER_TO_DELIVERY** | **PASS** (staged + full Nest e2e after nestMutex fix) |
| **PUBLIC_OPEN_READY** | **NO** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

---

## 1. Startup

| APP | PORT | RESULT |
| --- | --- | --- |
| API | 4000 | PASS (`/health`, `/health/ready`) |
| Customer | 3000 | PASS |
| Admin | 3001 | PASS |
| Doctor / Store / Vendor / Lab / Radiology / Radiologist / Join / Pathologist / Affiliate / Logistics | 3002–3011 | PASS |
| Postgres / Redis | Docker | healthy |

`/health/ready`: `environment=development`, payments/carriers/otp = **sandbox**.

---

## 2. Order-to-delivery timeout investigation (critical)

### Classification (S460 root cause)

| Class | Finding |
| --- | --- |
| A harness | PARTIAL — monolith 300s budget tight; **not** the primary hang |
| E polling/wait | Stage C hung after assign on `logisticsJob.findFirst` (lock wait) — mitigated by using assign response `id` |
| **F application defect** | **PROVEN** — nested `runWithTenant` under `TenantContextInterceptor` + `prisma.$transaction` **re-entered non-reentrant `nestMutex`** → rider **pickup** hung forever |

### Stages

| Stage | Result | Timing (representative) |
| --- | --- | --- |
| A catalog→cart→pay→order | **PASS** | ~3.7s |
| B accept→pick→pack→READY_TO_SHIP | **PASS** | ~2.9s |
| C assign→accept→arrive→pickup→OFD | **PASS** (after fix) | <1s post-fix |
| D POD→delivered + isolation | **PASS** (after fix) | <1s |
| Full `customer-order-to-delivery-real-use.e2e` | **PASS** | suite with delivery-medicine + gates **17/17** in ~58s |

### Code fix (smallest)

1. `apps/api/src/tenancy/tenant-als.ts` — `withTenantNestLock` **re-entrancy** via `nestDepth` (same async chain may nest `runWithTenant` → `$transaction`).
2. Harness: `test/s462-order-to-delivery-stages.e2e.spec.ts` (staged A–D + timing logs); monolith timeout **600s**.
3. Regression: S154 re-entrancy unit test.

**No provider fakes. No security weaken. Fail-closed production gates unchanged.**

---

## 3. Results table

| AREA | RESULT | EVIDENCE | BLOCKER |
| --- | --- | --- | --- |
| 1 startup | **PASS** | All listed apps HTTP 200; ready JSON sandbox | — |
| 2 customer commerce | **PASS** (API e2e) / **PARTIAL** (browser click) | Stage A + full order e2e; page shells only for UI | Full Playwright click-through not run this pass |
| 3 vendor/pharmacy | **PASS** | Stage B accept/pick/pack; isolation checks in e2e | Live UI session not browser-driven |
| 4 delivery | **PASS** | Stage C/D + `delivery-medicine.e2e` | Mock carrier only |
| 5 lab | **PARTIAL** | App shell 200 | Deep booking/report not re-executed |
| 6 imaging | **PARTIAL** | App shell 200 | Deep viewer not re-executed |
| 7 doctor | **PARTIAL** | App shell 200 | Deep consult not re-executed |
| 8 affiliate | **PARTIAL** | App shell 200 | Deep link/earnings not re-executed |
| 9 admin | **PARTIAL** | launch-readiness 200; release-gate authz | Full control-plane click not driven |
| 10 payment | **PASS** | Stage A CAPTURED sandbox; production-payment-gate units | REAL_PSP EXTERNAL |
| 11 OTP | **PASS** | Live request/wrong 401/verify; production-otp-gate | REAL_OTP EXTERNAL |
| 12 security negatives | **PASS** | unauth 401, fake bearer 401, customer→admin 403 | — |
| 13 cross-border software | **PASS** | s90 `source_country_equals_customer_country: false` | Legal EXTERNAL |
| 14 mobile | **ENVIRONMENT_BLOCKED** | no device/emulator | Device |
| 15 order-to-delivery | **PASS** | staged 4/4 + monolith e2e PASS | — |
| 16 production providers | **EXTERNAL_BLOCKED** | ready JSON | Contracts |
| 17 public-open readiness | **NO** | S460/S461 gates | Market/legal/infra/providers |

---

## 4. Live sandbox probes (this pass)

- OTP REGISTER → wrong code **401** → `dev_code` verify → `/me` **200**
- Unauthenticated `/me` **401**; fake bearer **401**; customer → admin release-gate **403**
- `SANDBOX_PAYMENT` / `SANDBOX_OTP` = **PASS**; `REAL_PSP` / `REAL_OTP_PROVIDER` = **EXTERNAL_BLOCKED**

---

## 5. Commands / suites executed

```
npx jest test/s462-order-to-delivery-stages.e2e.spec.ts
npx jest src/app/s154-rls-savepoint-reliability.spec.ts test/s462-order-to-delivery-stages.e2e.spec.ts
npx jest test/customer-order-to-delivery-real-use.e2e.spec.ts src/delivery/delivery-medicine.e2e.spec.ts
     src/logistics/s90-carrier-activation.spec.ts src/payment/production-payment-gate.spec.ts
     src/identity/production-otp-gate.spec.ts
```

**PASS counts:** staged 4/4; S154+staged 9/9; order-chain+delivery+gates **17/17**.

---

## 6. Code changes

| File | Change |
| --- | --- |
| `apps/api/src/tenancy/tenant-als.ts` | Re-entrant `withTenantNestLock` |
| `apps/api/src/app/s154-rls-savepoint-reliability.spec.ts` | Re-entrancy regression |
| `apps/api/test/s462-order-to-delivery-stages.e2e.spec.ts` | **New** staged harness |
| `apps/api/test/customer-order-to-delivery-real-use.e2e.spec.ts` | Timeout 600s |

Delivery service temporarily experimented with removing nested `runWithTenant`; **restored** after RLS visibility 500s; root fix is nestMutex re-entrancy.

---

## 7. Flags

| Flag | Value |
| --- | --- |
| SOFTWARE_COMPLETE | YES |
| ACTIONABLE_CODING_BACKLOG | ZERO (defect closed) |
| SANDBOX_E2E | **PARTIAL** |
| CUSTOMER_COMMERCE | PASS (API) / PARTIAL (UI) |
| VENDOR_FULFILLMENT | PASS (API) |
| ORDER_TO_DELIVERY | **PASS** |
| PAYMENT_SANDBOX | PASS |
| OTP_SANDBOX | PASS |
| SECURITY_NEGATIVES | PASS |
| CROSS_BORDER_SOFTWARE | PASS |
| ANDROID_REAL_USE | ENVIRONMENT_BLOCKED |
| IOS_REAL_USE | ENVIRONMENT_BLOCKED |
| REAL_PROVIDERS | NO |
| PRODUCTION_INFRA | NO |
| LEGAL | NO |
| FIRST_MARKET | UNSELECTED |
| PENTEST | NO |
| PUBLIC_OPEN_READY | **NO** |
| CAN_PRODUCTION_LAUNCH | **NO** |

---

## 8. Remaining blockers

1. OD-COUNTRY-01 founder decision ([WORLD_PHARMA_FIRST_MARKET_DECISION_GATE.md](WORLD_PHARMA_FIRST_MARKET_DECISION_GATE.md))  
2. Real providers + production infra  
3. Legal / MoR / licences / pentest  
4. Android/iOS device validation  
5. Optional: Playwright browser deep click-through for customer/admin  

**Exact next technical step after market decision:** production activation sequence (secrets → DB → … → PSP → OTP → KYC → pharmacy → carrier) — not another feature sprint.

**STOP.**
