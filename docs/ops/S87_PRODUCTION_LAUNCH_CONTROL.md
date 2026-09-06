# Sprint 87 — Production launch control + external-gate orchestration

Aggregates existing S64–S86 provider activation rails into one Main Admin launch-control view. **Does not invent or enable any production provider.**

## Decision (this environment)

| Field | Value |
|-------|--------|
| Overall | **NOT_READY** |
| `CAN_PRODUCTION_LAUNCH` | **NO** |
| Force launch | **false** (no bypass) |
| Live providers enabled | **false** |

## Canonical rails (19)

PSP, OTP, SMS, EMAIL, PUSH, CARRIER, eRx, VIDEO, PACS, KYC/KYB, Private Storage, KMS, Malware Scanner, Managed Backup, PITR, DR Environment, APM, Monitoring, Alerting.

Grouped: Payments · Communications · Logistics · Clinical · Partner verification · Data security · Backup/DR · Observability.

## Fail-closed logic

Any **MANDATORY** (or unresolved **MARKET_SPECIFIC**) rail that is not ENABLED keeps launch = **NO**.

**NOT_APPLICABLE** rails (service-scoped config) do not block. **OPTIONAL** rails do not block.

`SANDBOX_VERIFIED ≠ PRODUCTION_READY` · `TARGET_DEFINED ≠ VERIFIED` · `NOT_SELECTED ≠ outage` · mock ≠ production.

## Service scopes (config-driven, not legal truth)

`GLOBAL` · `MEDICINE_COMMERCE` · `LABS` · `DOCTOR_CONSULTATION` · `ERX` · `IMAGING` · `DELIVERY` · `AFFILIATE`

Example: medicine marks PACS/eRx/video **NOT_APPLICABLE**; imaging marks PACS **MANDATORY**.

## Markets

Evaluator accepts market codes (e.g. GLOBAL / IN / AE / US). Missing legal packs remain visible as EXTERNAL/POLICY gates via underlying rails — no invented approvals.

## API

`GET /api/v1/admin/control-plane/production-launch-control?market=&service_scope=`  
Permission: `policy:read` (admin audience). No secrets in payload. No force-launch endpoint.

## Admin

`/launch-readiness` — **World-Pharma production launch control (Sprint 87)** panel above the existing first-country package UI.

## Exact tests

| Suite | Result |
|-------|--------|
| Unit S87 | **9/9** |
| Unit S64 / S65 / S85 | **10/10** / **8/8** / **9/9** |
| Unit S67 / S77 carrier | **14/14** / **12/12** |
| Unit S68 / S78 eRx | **15/15** / **11/11** |
| Unit S79 video / S80 PACS / S81 KYC | **12/12** / **10/10** / **10/10** |
| Unit S82 storage / S83 DR | **8/8** / **9/9** |
| Unit S84 observability / S86 + S76 OTP | **9/9** / **6/6** / **11/11** |
| Playwright S87 | **2/2** |

- Shots: `apps/test-results/s87-launch-control-shots/`
- Status: `apps/test-results/s87-launch-control/final-launch-control-status.json`
- Native: **DEVICE_NOT_AVAILABLE**
- Master Index: **#385**
