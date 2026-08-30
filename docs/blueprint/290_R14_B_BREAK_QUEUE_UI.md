# 290 — R14-B reconciliation break queue UI (CR-290)

**CR:** `CR-R14-B-BREAK-QUEUE-UI-290`  
**Verdict:** **`R14_B_BREAK_QUEUE_UI_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Extend finance-admin UI reusing CR-287 break APIs — no backend workflow duplication

**Boundaries respected:**

- CR-287 backend state machine unchanged
- No new break workflow service
- RBAC/RLS remain server-side authoritative
- R14-A human gates **0/7** unchanged
- No live PSP, no sensitive payload exposure

---

## A. PRE-AUDIT FINDINGS

| Area | Finding |
|------|---------|
| `ReconBreakService.listBreaks` | Filters: `workflow_status`, `domain`, `classification`, `country_id`, `source_kind`, `include_closed`, `limit` (max 100) |
| `GET /breaks/:id` | Full detail + `actions[]` already present |
| Action history | Embedded in list/get responses — **no separate endpoint needed** |
| Pagination | Backend: `limit` only — **no offset/cursor** |
| Date/search filters | **Not in backend** — reference search client-side on fetched rows |
| `finance-admin.tsx` (pre-290) | Flat list, load button, inline actions — no filters, detail, or history |
| Gap class | **UI-only** — no migration or service changes required |

---

## B. EXISTING BACKEND (REUSED)

```
GET  /admin/finance/breaks[?filters]
GET  /admin/finance/breaks/:id
POST /admin/finance/breaks/:id/investigate  (finance:reconcile)
POST /admin/finance/breaks/:id/resolve       (finance:reconcile)
POST /admin/finance/breaks/:id/close         (finance:reconcile)

State machine: OPEN → INVESTIGATING → RESOLVED → CLOSED
Idempotency: finance_recon_break_actions.idempotency_key
Country scope: loadAccessScope + assertCountryAccess + RLS (migration 138–140)
```

---

## C. UI CHANGES

| File | Change |
|------|--------|
| `finance-break-queue.tsx` | **New** — operational break queue panel |
| `finance-admin-api.ts` | Extended types, query params, `fetchFinanceBreakDetail` |
| `finance-admin.tsx` | Integrated `BreakQueuePanel`; removed inline break list |
| `finance-admin.spec.tsx` | 17 tests covering queue UX A–Q |

### Queue features

- Status filter (backend enum values)
- Source kind filter (`SETTLEMENT_IMPORT`, `PAYOUT`, `PSP`, `CARRIER`, `MANUAL`)
- Classification + country ID filters (server-side)
- Include closed checkbox
- Client-side reference search (ID, refs, detail)
- Client-side pagination (page size 5) over fetched rows (limit 100)
- Loading, empty, error, 403 states

### Detail panel

- Fetched via `GET /breaks/:id` on row select
- Safe fields: status, classification, source, country, amounts, timestamps, investigator/resolver metadata
- Action history from server `actions[]`

### Action UX

- Buttons gated by `workflow_status` + `finance:reconcile` permission
- POST to existing investigate/resolve/close endpoints
- On failure: show API error, **no optimistic state update**
- On success: refresh list + reload detail from server

---

## D. RBAC / COUNTRY ISOLATION

- List/read: `finance:read` (session permissions checked for reconcile actions)
- Transitions: backend enforces `finance:reconcile`
- UI hides action buttons without `finance:reconcile`; shows explanatory text
- 403 → permission denied state
- Cross-country detail → 404/403 from backend; UI shows error

---

## E. TESTS

| Suite | Result |
|-------|--------|
| `finance-admin.spec.tsx` | **17/17 PASS** |
| `r14b.recon-break.e2e` | PASS |
| R14-B finance regressions | **91/91 PASS** |
| `web-admin:typecheck` | PASS |
| No API changes | typecheck/build unchanged |

Test coverage: queue load, empty, loading, network error, 403, status/source filters, pagination, detail, action history, investigate/resolve/close, failed mutation, invalid transition guard, reference search, no secrets, read-only RBAC.

---

## F. RUNTIME VERIFICATION

| Check | Result |
|-------|--------|
| Postgres + Redis | healthy |
| Migration head | **142** (unchanged) |
| `/health/ready` | 200 |
| Backend | unchanged — no redeploy requirement beyond web-admin bundle |

---

## G. POST-IMPLEMENTATION AUDIT

| # | Check | Status |
|---|-------|--------|
| 1 | Uses existing break APIs | GREEN |
| 2 | No duplicate workflow | GREEN |
| 3 | Backend authoritative | GREEN |
| 4–6 | RBAC + RLS + country scope | GREEN |
| 7 | Server-derived action history | GREEN |
| 8–9 | No false UI state on failure; refresh after action | GREEN |
| 10 | Pagination/filter correct | GREEN |
| 11 | No sensitive leak | GREEN |
| 12 | CR-287 idempotency intact | GREEN |
| 13–14 | Settlement/payout breaks unchanged | GREEN |
| 15 | No duplicate journals | GREEN |
| 16–17 | No R14-A / gate fabrication | GREEN |
| 18–19 | Real UI paths tested; no dead code | GREEN |

---

## H. REMAINING R14-B GAPS (FRESH SOURCE SCAN)

After CR-284 through CR-290, **authorized R14-B sandbox finance engineering** covers:

| CR | Capability |
|----|------------|
| 284 | Foundation audit fixes |
| 285 | Settlement import port + pipeline |
| 286 | Payout execution ledger |
| 287 | Unified break workflow (backend) |
| 288 | Scheduled import worker |
| 289 | Schedule admin CRUD |
| 290 | Break queue UI (this CR) |

**R14-B provider-neutral sandbox scope is substantially complete.**

Highest-value **remaining** gaps (non-invented):

| Priority | Gap | Class |
|----------|-----|-------|
| 1 | Vendor payable adjustment on partial refund | F — ledger correctness |
| 2 | Affiliate/carrier payout kinds | F — payout rail breadth |
| 3 | Backend cursor/offset pagination for breaks (optional scale) | F — only if queue volume requires |
| 4 | Provider-specific settlement/payout adapters | E — post R14-A human gates |
| 5 | Tax/statutory hooks | E — R14-E track |
| 6 | Live payout rail | E — R14-C track |

**Recommendation:** Pause further R14-B invention until partial-refund payable gap is product-prioritized, or shift to **R14-C/E tracks** per implementation plan when human gates advance.

---

## I. NEXT CR (IF CONTINUING R14-B)

**Optional:** `CR-R14-B-PARTIAL-REFUND-PAYABLE-291` — vendor payable adjustment when partial refund affects settlement lines.

Only pursue if source audit confirms missing ledger path (not merely documentation).

---

## J. FINAL VERDICT

**`R14_B_BREAK_QUEUE_UI_COMPLETE`**

Finance-admin break queue is operationally usable with filters, pagination, detail, server-derived action history, backend-gated transitions, RBAC-aware UX, 17 UI tests green, and 91 R14-B API regressions green. No backend changes required.
