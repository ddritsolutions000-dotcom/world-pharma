# 289 — R14-B settlement import schedule admin (CR-289)

**CR:** `CR-R14-B-SETTLEMENT-SCHEDULE-ADMIN-289`  
**Verdict:** **`R14_B_SETTLEMENT_SCHEDULE_ADMIN_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Admin CRUD on existing `settlement_import_schedules` + RLS write fix; reuses CR-288 worker unchanged

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** (no live PSP, no human-gate re-audit)
- R14-A human gates **0/7**
- No duplicate scheduler — CR-288 `SettlementImportWorkerService` unchanged in architecture
- MOCK provider production-blocked; live import fail-closed
- No per-schedule cadence field invented — poll interval remains global env (`SETTLEMENT_IMPORT_WORKER_POLL_MS`)

---

## A. PRE-AUDIT FINDINGS

| Area | Finding |
|------|---------|
| `SettlementImportSchedule` schema | `countryId`, `providerCode`, `currency`, `enabled`, timestamps — **no cadence column** |
| Uniqueness | `(countryId, providerCode)` unique — one schedule per country+provider |
| Worker | `pollOnce` reads `enabled: true` schedules only — no second scheduler |
| Migration 141 RLS | `WITH CHECK (worker OR platform)` — **blocked country-scoped admin writes** |
| Admin API (pre-CR-289) | Worker runs list only — **no schedule CRUD** |
| RBAC | `finance:read` list/get; `finance:reconcile` create/update (matches manual import) |
| Audit | Outbox pattern used elsewhere (`FINANCE_BREAK_*`) — extended for schedules |

**No new migration for schema fields.** Migration **142** required for RLS writes only.

---

## B. ARCHITECTURE

```
Admin API (SettlementImportScheduleService)
  → validate provider/country/RBAC
  → settlement_import_schedules CRUD
  → outbox FINANCE_SETTLEMENT_SCHEDULE_*

CR-288 worker (unchanged entry point)
  → findMany enabled schedules
  → SettlementImportPort.fetchBatch / listAvailableBatches
  → SettlementImportService.importBatch + processImportReceived
  → CR-287 breaks when applicable
```

---

## C. API DESIGN

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/finance/settlement-import-schedules` | `finance:read` |
| GET | `/admin/finance/settlement-import-schedules/:id` | `finance:read` |
| POST | `/admin/finance/settlement-import-schedules` | `finance:reconcile` |
| PATCH | `/admin/finance/settlement-import-schedules/:id` | `finance:reconcile` |

**Create body:** `country_id`, `provider_code`, `currency`, `enabled?`  
**Update body:** `currency?`, `enabled?` (soft disable — no destructive DELETE)

**Response metadata:** `worker_poll_ms` (read-only global), `last_run`, `sandbox`, `live_psp: false`

---

## D. SCHEDULE VALIDATION (SERVER-SIDE)

- Country exists + `assertCountryAccess`
- Provider registered via `SettlementImportRegistry`
- `assertSandboxSettlementProvider` + `assertSettlementImportAllowed`
- Currency: 3-letter ISO
- Duplicate `(countryId, providerCode)` → **409 `SETTLEMENT_SCHEDULE_DUPLICATE`**
- Unknown provider → **503 `SETTLEMENT_PROVIDER_NOT_CONFIGURED`**
- Production MOCK → **409 `MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN`**

Cadence is **not** per-schedule — global poll minimum 5s prevents runaway loops via existing worker config.

---

## E. WORKER INTEGRATION

- Admin enables schedule → worker `pollOnce` discovers on next cycle
- Admin disables → excluded from `where: { enabled: true }`
- In-flight run completes via existing claim/execute semantics
- **Fix (CR-289):** `claimWorkerRun` skips `FAILED_TRANSIENT` on schedule path — retry loop owns retries (prevents double import in one poll)

---

## F. RBAC / COUNTRY ISOLATION

Migration **142** — country-scoped `WITH CHECK` (mirrors CR-287 recon break pattern):

```sql
WITH CHECK (
  app.is_worker() OR app.is_platform()
  OR (country_id IS NOT NULL AND app.can_country(country_id) AND scope in country/region/legal_entity/platform)
)
```

Controller: `loadAccessScope` + `countryFilter` + `assertCountryAccess`  
No `USING(true)`.

---

## G. IDEMPOTENCY / CONCURRENCY

| Scenario | Guarantee |
|----------|-----------|
| Duplicate create | 409 via unique constraint |
| Concurrent create | One 201, one 409 |
| Enable/disable twice | Idempotent PATCH state |
| Worker + schedule | Existing worker run / batch idempotency unchanged |
| Retry vs schedule poll | FAILED_TRANSIENT skipped on schedule claim |

---

## H. UI

Extended `finance-admin.tsx`:

- Schedule list + create form (country, provider, currency)
- Enable/disable toggle
- Worker poll interval shown as read-only metadata
- Permission/error/empty states

---

## I. AUDIT / OBSERVABILITY

Outbox events:

- `FINANCE_SETTLEMENT_SCHEDULE_CREATED`
- `FINANCE_SETTLEMENT_SCHEDULE_UPDATED`
- `FINANCE_SETTLEMENT_SCHEDULE_ENABLED`
- `FINANCE_SETTLEMENT_SCHEDULE_DISABLED`

Payload: country, provider, currency, enabled, actor_person_id — **no secrets**.

---

## J. TESTS

| Suite | Result |
|-------|--------|
| `r14b.settlement-schedule-admin.e2e.spec.ts` | **20/20 PASS** (A–T) |
| R14-B finance regressions | **96/96 PASS** |
| `web-admin` finance-admin | **5/5 PASS** |
| `api:typecheck` + `api:build` | PASS |

---

## K. RUNTIME VERIFICATION

| Check | Result |
|-------|--------|
| Postgres | healthy |
| Redis | healthy |
| Migration head | **142** |
| `/health/ready` | 200 (port 4000) |
| Worker | unchanged CR-288 registration |

---

## L. POST-IMPLEMENTATION AUDIT

| # | Check | Status |
|---|-------|--------|
| 1 | Uses existing schedule model | GREEN |
| 2 | No duplicate scheduler | GREEN |
| 3 | Worker reads admin schedules | GREEN |
| 4 | Server-side validation | GREEN |
| 5–7 | RBAC + RLS + country scope | GREEN |
| 8–10 | Fail-closed provider/MOCK/live | GREEN |
| 11 | No runaway per-schedule cadence (global poll min 5s) | GREEN |
| 12–15 | Idempotency preserved | GREEN |
| 16 | CR-287 breaks intact | GREEN |
| 17 | No sensitive leak | GREEN |
| 18 | UI conventions | GREEN |
| 19 | Real service paths in tests | GREEN |
| 20 | No dead code | GREEN |
| 21 | No R14-A changes | GREEN |

---

## M. DEFECTS FIXED

1. **RLS blocked admin writes** — migration 142 country-scoped WITH CHECK
2. **Worker double-import on poll** — skip `FAILED_TRANSIENT` on schedule claim path
3. **Worker test G/I pollution** — isolate schedules when testing retry poll (regression)

---

## N. REMAINING R14-B GAPS (FRESH SOURCE SCAN)

After CR-285–289, authorized R14-B sandbox finance kernel covers:

- Settlement import port + staging + match/ledger (285)
- Payout execution ledger (286)
- Unified recon break workflow (287)
- Scheduled import worker (288)
- Schedule admin CRUD (289)

**Highest-value remaining engineering gaps:**

| Priority | Gap | Class |
|----------|-----|-------|
| 1 | Break queue UI depth (filters, detail drawer, workflow history) | F |
| 2 | Vendor payable adjustment on partial refund | F |
| 3 | Affiliate/carrier payout kinds beyond vendor | F |
| 4 | Per-country settlement batch discovery scoping in live adapters | E (post R14-A gates) |
| 5 | Provider-specific settlement adapters | E (post gates) |
| 6 | Tax/statutory hooks | E (R14-E) |
| 7 | Live payout rail | E (R14-C) |

**R14-B sandbox engineering for settlement import is substantially complete** for the current authorized scope. Further R14-B work shifts to adjacent finance gaps (break UI depth, partial refund payable) or awaits R14-A human gates for live adapters.

---

## O. NEXT CR

**Recommended:** `CR-R14-B-BREAK-QUEUE-UI-290` — break list filters, detail view, action history from `finance_recon_break_actions`, country-scoped RBAC.

---

## P. FINAL VERDICT

**`R14_B_SETTLEMENT_SCHEDULE_ADMIN_COMPLETE`**

Operators can manage settlement import schedules via admin API/UI without DB seeding. Worker integration, validation, RBAC, RLS, idempotency, tests, and post-audit are GREEN.
