# 326 — R14-A engineering configuration store (DEV placeholders)

**CR:** `CR-326-R14-A-ENGINEERING-CONFIG`  
**Date:** 31 August 2026  
**Type:** Authorized configuration/admin slice — **not** live PSP, **not** Book-263 production evidence  
**Verdict:** **`R14_A_ENGINEERING_CONFIG_READY`** · **`R14_A_LIVE_PRODUCTION_BLOCKED`**

**Does not:** connect a real PSP, set `PAYMENT_LIVE_ENABLED=true`, execute CR-244, or mark Book 247/263/owner checklist as EVIDENCED.

---

## Roadmap requirement

| Source | Why this slice is in scope |
| ------ | -------------------------- |
| [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) | Seven gate **fields** must exist as a storeable configuration contract |
| [259](259_R14_A_ENGINEERING_PREPARATION.md) / [268](268_R14_A_ENGINEERING_FOUNDATION.md) | Fail-closed live runtime; configuration boundaries without live adapter |
| [17](17_ADMIN_ERP.md) | Company admin payment configuration; partners never receive `payment:admin` |
| This CR body | Explicit authorization to develop/test the **workflow** with marked NON-PRODUCTION placeholders |

This is **not** R15 control-plane depth and **not** R14-A live implementation.

---

## Scope (smallest slice)

1. Persist the seven gates with `PLACEHOLDER` vs `OWNER_EVIDENCED`.
2. Seed obvious DEV/DEMO values (`DEV_PLACEHOLDER_*`, country `ZZ`).
3. Admin GET/PUT + revision audit + verify that **rejects** placeholders.
4. Live-payment guards treat missing/PLACEHOLDER gates as **not** production-ready even if `PAYMENT_LIVE_ENABLED` is forced on.
5. Admin UI read-only status on the existing payments panel.

**Migration required:** yes — new `r14a_human_gates` + append-only `r14a_human_gate_revisions`, FORCE RLS, CHECK that `OWNER_EVIDENCED` cannot hold PLACEHOLDER/DEV/ZZ/XX/TQ values.

---

## Security constraints

- No secrets, PAN/CVV, API keys, or certs in gate `value_text` (API reject + length cap).
- PUT always remains `PLACEHOLDER` until a **different** reviewer verifies a **non-placeholder** value.
- Placeholders never count as Book-263 evidence (`book_263_production_evidence: NOT_CLAIMED`).
- `PAYMENT_LIVE_ENABLED` unchanged (fail-closed, not set true).
- Sandbox mock kernel unmodified.

---

## Acceptance

| Criterion | How verified |
| --------- | ------------- |
| Placeholders work in development | Seed + GET returns 7 rows |
| Placeholders cannot unlock live | `assertHumanGatesAllowLive` / `assertLiveProductionPrerequisites` throw `HUMAN_GATES_NOT_PRODUCTION_READY` |
| Replacing values is auditable | `r14a_human_gate_revisions` + GET `.../revisions` |
| Unverified gates remain blocked | Verify on DEV values → `PLACEHOLDER_NOT_OWNER_EVIDENCE` |
| Sandbox payments remain green | Existing `payment.e2e` / `r14a.payment.e2e` sandbox paths |

---

## Status distinction

| Status | Meaning |
| ------ | ------- |
| **`R14_A_ENGINEERING_CONFIG_READY`** | Seven gate rows exist; admin/config workflow can be developed and tested |
| **`R14_A_LIVE_PRODUCTION_READY`** | **Not claimed.** Requires 7/7 `OWNER_EVIDENCED` non-placeholder values **and** `PAYMENT_LIVE_ENABLED=true` **and** a later live-PSP IMPL CR (not 244) |

Owner checklist [R14_A_OWNER_GATE_CHECKLIST.md](R14_A_OWNER_GATE_CHECKLIST.md) remains **0/7 PENDING**.

---

## Addendum — provider catalog (Main Admin, existing tables)

Authorized by [12](12_PAYMENT_PLATFORM.md) §3.1 (config-selected adapters) and [17](17_ADMIN_ERP.md) Configuration “gateways”. **No new CR number. No new migration.**

`r14a_human_gates` remains the seven-gate **evidence** store. It is **not** the PSP catalog.

The provider catalog is the existing `payment_gateways` / `payment_gateway_accounts` / `payment_gateway_capabilities` rows. Main Admin may **list/update existing codes only** (`GET/PUT /api/v1/admin/payments/providers`). Creating a new PSP code, selecting a real PSP, storing secrets, or setting `environment=production` is rejected. Registry dispatch stays by gateway code through `PaymentGatewayPort` — no `if provider === stripe|razorpay|adyen` in product code.

Admin configuration **cannot** authorize live payments. Live still requires 7/7 OWNER_EVIDENCED gates + `PAYMENT_LIVE_ENABLED=true` + runtime guards. CR-244 stays closed.

Main Admin provider configuration (existing `PUT /api/v1/admin/payments/providers/:code`) also exposes account applicability that the API already stored: `countries_csv`, `currencies_csv`, `methods_csv`, plus a **write-only** vault/env path (never rendered from the catalog) and `GET .../providers/:code/audit` (actor / time / outcome only). This is configuration for **registered** sandbox codes. It is not a live PSP, not a new adapter, and not Book-263 evidence.
