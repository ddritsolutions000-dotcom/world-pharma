# 287 — R14-B reconciliation break workflow (CR-287)

**CR:** `CR-R14-B-RECON-BREAK-WORKFLOW-287`  
**Verdict:** **`R14_B_RECON_BREAK_WORKFLOW_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Provider-neutral unified break queue + OPEN→INVESTIGATING→RESOLVED→CLOSED workflow

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** (no live PSP, no human-gate re-audit)
- R14-A human gates **0/7** — not repeated ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md))
- No live payout rail, no production credentials
- Do **not** execute CR-R14-A-IMPL-244 unchanged
- Resolve/close are **workflow-only** — no automatic journal fabrication

---

## A. PRE-IMPLEMENTATION CODE AUDIT

| Area | Finding |
|------|---------|
| `FinanceReconciliation` | Had `MATCHED \| BREAK \| INVESTIGATE` only; no workflow fields; **no `country_id`** |
| RLS (migration 137 era) | `finance_reconciliations_app_all` used **`USING(true)`** — permissive |
| Settlement import | Created breaks for UNMATCHED/PARTIAL via private helper; INVALID not wired to finance break |
| Payout UNKNOWN | Updated payout status only — **no finance break** |
| Admin API | `listFinanceReconciliations` existed; no investigate/resolve/close |
| Admin UI | `finance-admin.tsx` dashboard-only |
| Idempotency | No break action table; duplicate transitions possible |

**Safe additions identified:** extend existing `FinanceReconciliation` domain; unified list/get + three POST actions; idempotent `FinanceReconBreakAction`; country-scoped RLS; outbox audit events.

---

## B. ARCHITECTURE BEFORE

```
Settlement import UNMATCHED/PARTIAL → FinanceReconciliation (status=BREAK/INVESTIGATE)
Payout UNKNOWN → Payout.status only
Admin: GET reconciliations (legacy shape)
No workflow transitions; permissive RLS on finance_reconciliations
```

---

## C. ARCHITECTURE AFTER

```
Break sources:
  Settlement import UNMATCHED/PARTIAL/INVALID → ReconBreakService.createBreak()
  Payout UNKNOWN → FinanceService.executePayout → ensurePayoutUnknownBreak()

Lifecycle (FinanceReconWorkflowStatus):
  OPEN → INVESTIGATING → RESOLVED → CLOSED

Admin API (/admin/finance/breaks):
  GET list/get — finance:read
  POST investigate/resolve/close — finance:reconcile
  Idempotency via finance_recon_break_actions.idempotency_key

Audit: FINANCE_BREAK_INVESTIGATE | RESOLVE | CLOSE outbox events
Financial safety: resolve/close do NOT post journals
```

---

## D. IMPLEMENTATION PERFORMED

### Migrations (head **140**)

| Migration | Purpose |
|-----------|---------|
| `20260830193000_r14b_recon_break_workflow` | Workflow enums/fields; `finance_recon_break_actions` |
| `20260830193100_r14b_recon_break_rls` | Replace `USING(true)`; FORCE RLS; break actions RLS |
| `20260830193200_r14b_recon_break_rls_writes` | Country-scoped WITH CHECK for workflow writes |

### Services / API

| File | Change |
|------|--------|
| `recon-break.service.ts` | **New** — createBreak, list/get, investigate/resolve/close, idempotent transitions |
| `settlement-import.service.ts` | Delegates `createFinanceRecon` → `createBreak`; INVALID breaks |
| `finance.service.ts` | `ensurePayoutUnknownBreak` on UNKNOWN execute; extended list filters |
| `admin.controller.ts` | Break queue + action endpoints |
| `envelope.ts` | `FINANCE_BREAK_*` event types |
| `scope.ts` | `loadAccessScope` resolves active memberships (fixes platform scope when JWT predates membership) |

### Admin UI

| File | Change |
|------|--------|
| `finance-admin-api.ts` | Break fetch + action helpers |
| `finance-admin.tsx` | Unified break list, filters via load, investigate/resolve/close buttons |
| `finance-admin.spec.tsx` | Focused UI tests (queue, 403, no secrets) |

---

## E. ACCOUNTING SAFETY ANALYSIS

| Rule | Enforcement |
|------|-------------|
| No journal on resolve | `transition()` updates workflow fields only |
| No fabricated match | Settlement amounts/classifications unchanged |
| UNKNOWN ≠ PAID | `executePayout` does not promote UNKNOWN; test S verifies payout status + zero payout journals |
| Duplicate journals | Test K/P — journal count unchanged across resolve/replay |
| Explicit financial adjustment | Not in scope — would require separate authorized journal primitive |

---

## F. TESTS

### Focused: `r14b.recon-break.e2e.spec.ts` — **19/19 PASS**

| ID | Scenario | Result |
|----|----------|--------|
| A | UNMATCHED in break queue | PASS |
| B | PARTIAL in break queue | PASS |
| C | Payout UNKNOWN in break queue | PASS |
| D | OPEN → INVESTIGATING | PASS |
| E | INVESTIGATING → RESOLVED | PASS |
| F | RESOLVED → CLOSED | PASS |
| G | Illegal transition → 409 | PASS |
| H–J | Duplicate investigate/resolve/close idempotent | PASS |
| K | Resolution no duplicate journals | PASS |
| L | Country isolation → 403 | PASS |
| M | Cross-country filter → 403 | PASS |
| N | Unauthorized → 403 | PASS |
| O | Invalid break → 404 | PASS |
| P | Replay resolution — no financial side effect | PASS |
| Q | Audit trail safe metadata | PASS |
| R | Unresolved break visible | PASS |
| S | UNKNOWN payout cannot become PAID via break resolve | PASS |

### Regressions — **35/35 PASS**

- `finance.e2e.spec.ts`
- `r14b.settlement-import.e2e.spec.ts`
- `r14b.reconciliation.e2e.spec.ts`
- `r14b.payout-ledger.e2e.spec.ts`
- `r6e.vendor.e2e.spec.ts` (finance paths)

### Build / typecheck

- `api:typecheck` — PASS
- `api:build` — PASS
- `web-admin` finance-admin.spec — PASS (see runtime verification)

---

## G. POST-IMPLEMENTATION CODE AUDIT

| # | Check | Evidence |
|---|-------|----------|
| 1 | All break sources reach unified workflow | Settlement import + payout UNKNOWN call `createBreak` / `ensurePayoutUnknownBreak` |
| 2 | Tenant/country isolation | RLS migrations 139–140; tests L/M |
| 3 | RBAC server-side | `@RequirePermissions` on controller; test N |
| 4 | Illegal transitions rejected | `WORKFLOW_ALLOWED_FROM`; test G |
| 5 | Idempotent actions | `finance_recon_break_actions` unique key; tests H–J |
| 6 | No duplicate journals on resolve | tests K/P |
| 7 | UNKNOWN cannot → PAID via resolve | test S |
| 8 | PARTIAL/UNMATCHED preserved | classification on break row; tests A/B |
| 9 | No secrets in audit payload | outbox payload: action, actor, note; test Q |
| 10 | FORCE RLS intact | migration 139–140 |
| 11 | No `USING(true)` on finance_reconciliations | migration 139 drops `finance_reconciliations_app_all` |
| 12 | R14-A guards unchanged | No payment kernel edits |
| 13 | No live PSP | sandbox flags; MOCK adapters only |
| 14 | Tests hit production service paths | HTTP e2e through admin controller |
| 15 | No dead code | ReconBreakService wired in module |
| 16 | Accounting semantics preserved | No new posting rules |

**Audit verdict:** GREEN

---

## H. DEFECTS FOUND & FIXED DURING CR

| Defect | Fix |
|--------|-----|
| RLS WITH CHECK blocked country-scoped writes | Migration 140 — country-scoped WITH CHECK |
| `loadAccessScope` relied on JWT `membershipId` only | Query all active memberships; derive `isPlatform` |
| Tests picked stale break rows from queue | `latestBreak()` helper filters by country/classification/breakType |
| Test S counted global payout journals | Scoped count to `sourceEventId: payout:{id}` |
| Cross-country GET returned 404 under RLS | `getBreak` returns 403 when scoped admin cannot see row |

---

## I. DB / RLS VERIFICATION

- Migration head: **140** (`20260830193200_r14b_recon_break_rls_writes`)
- `finance_reconciliations`: ENABLE + FORCE RLS; country-scoped USING/WITH CHECK
- `finance_recon_break_actions`: ENABLE + FORCE RLS; join to parent recon for scope
- Idempotency: unique `idempotency_key` on break actions
- Dev + test DB migrated successfully

---

## J. RUNTIME VERIFICATION

```
nx test api --testPathPatterns=r14b.recon-break --runInBand  → 19/19
nx test api --testPathPatterns=r14b.*|finance.e2e --runInBand → 35/35 regressions
nx run api:typecheck → PASS
nx run api:build → PASS
web-admin finance-admin.spec.tsx → PASS
```

---

## K. REMAINING R14-B ENGINEERING

| Priority | Work | Class |
|----------|------|-------|
| 1 | Scheduled settlement import worker (cron/poll) | F |
| 2 | Break queue UI depth (detail drawer, date filters) | F |
| 3 | Vendor payable adjustment on partial refund | F |
| 4 | Affiliate/carrier payout kinds | F |
| 5 | Provider-specific settlement/payout adapters | E (post gates) |
| 6 | Tax/statutory hooks | E (R14-E) |
| 7 | Live payout rail + `AST_BANK` | E (R14-C) |

---

## L. HUMAN/LEGAL BLOCKERS

Unchanged — **0/7** R14-A gates ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md)).

---

## M. NEXT CR

**Recommended:** `CR-R14-B-SETTLEMENT-IMPORT-WORKER-288`

**Prompt:**

> Implement provider-neutral scheduled settlement import worker: poll or cron-triggered batch fetch via existing `SettlementImportRegistry`/`SettlementImportService`, enqueue normalized batches for match pipeline, respect country RLS and MOCK fail-closed gates, add idempotent worker occurrence keys, and create `r14b.settlement-import-worker.e2e.spec.ts`. No live PSP. Build on CR-285 import port + CR-287 break workflow. Preserve sandbox-only behavior.

---

## N. FINAL VERDICT

**`R14_B_RECON_BREAK_WORKFLOW_COMPLETE`**

Unified reconciliation break workflow is implemented with country-scoped RLS, RBAC-protected idempotent transitions, no automatic journals on resolve, full e2e coverage A–S, regressions green, and post-implementation audit GREEN.
