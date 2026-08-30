# 123 — Pre-R6 blocker repair implementation

**Status:** Implemented (three Book 122 blockers only)  
**Change ID:** **CR-PRE-R6-REPAIR-123**  
**Date:** 27 August 2026  
**FINAL STATUS:** **PRE_R6_BLOCKERS_CLOSED**

**Sources:** [122](122_PRE_R6_GLOBAL_READINESS_AUDIT.md) · [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) · [109](109_POST_R4_ECOSYSTEM_HARDENING.md) · [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority boundary:** Repair **P1-1**, **P1-2**, **P1-4** only. **R6 NOT STARTED.** No CMS/CRM/Lab/Radiology. No live PSP/DHL/payout. No automatic refill. No production LiveKit. No new architecture.

---

## 0. Confirmations

| Item | Status |
|------|--------|
| P1-1 FORCE RLS | **CLOSED** |
| P1-2 api:test flakiness | **CLOSED** (3 consecutive clean runs; no open-handle hang) |
| P1-4 topology R4 status drift | **CLOSED** |
| R6 coding | **NOT STARTED** |
| Auto refill / live money / production LiveKit / recording / live e-Rx | **Remain OFF** |

---

## 1. P1-1 — FORCE RLS

### Root cause

Tables created **after** `20260827180000_multi_tenant_rls` received `ENABLE ROW LEVEL SECURITY` in their creating migrations but **not** `FORCE ROW LEVEL SECURITY`. The retrofit wave applied FORCE only to tables present at that moment.

Additionally, `rider_presence` had an RLS policy `TO worldpharma_app` but **never received** `GRANT SELECT, INSERT, UPDATE, DELETE` (unlike R5 tables which granted in-create). That left app-role access as `permission denied` rather than RLS filter-empty — fixed additively.

### Exact tables receiving FORCE RLS

1. `rider_presence`  
2. `prescriptions`  
3. `prescription_versions`  
4. `prescription_lines`  
5. `prescription_status_history`  
6. `dispensing_cases`  
7. `dispense_events`  
8. `dispense_line_mappings`  
9. `rx_commerce_handoffs`  
10. `refill_requests`  
11. `refill_request_history`  
12. `rx_subscriptions`

### Migrations

| Migration | Purpose |
|-----------|---------|
| `20260827195000_pre_r6_force_rls` | `FORCE ROW LEVEL SECURITY` on the 12 tables above; policies unchanged |
| `20260827195100_pre_r6_rider_presence_grant` | `GRANT` DML on `rider_presence` to `worldpharma_app` |

**Preserved:** existing tenant policies; fail-closed GUCs; worker/platform exceptions in policies; `worldpharma_app` **NOSUPERUSER** + **NOBYPASSRLS**; **no** `USING (true)`.

### Negative isolation tests added

In `apps/api/src/tenancy/rls.tenancy.e2e.spec.ts`:

- Catalog assert: all 12 tables `relrowsecurity` + `relforcerowsecurity`  
- Role assert: `worldpharma_app` still NOSUPERUSER / NOBYPASSRLS  
- `rider_presence`: missing tenant context → 0 rows; cross-person denied; cross-org denied; worker + platform scopes preserved  

Existing suites still cover: R3 location/org/rider/store (`r3.isolation.e2e`), clinical customer/doctor (`prescription` / `dispensing` / `refill` e2e), headers non-authoritative, company authority.

---

## 2. P1-2 — Test flakiness

### Root cause

1. **Shared module-level `PrismaClient` (`prisma.service.ts`)** was `$disconnect()`’d on **every** Nest `app.close()` across 20+ e2e suites. Later suites raced reconnect → intermittent failures; engine handle often remained → Jest “did not exit” / Nx **flaky task**.  
2. Not fixed by retries. Open-handle noise was lifecycle, not random assertion flake.

### Lifecycle / cleanup fix

| Change | Location |
|--------|----------|
| Skip shared Prisma disconnect on Nest destroy in test / `WP_TEST_ISOLATED` | `apps/api/src/app/prisma.service.ts` |
| Export `disconnectSharedPrisma()` for one-shot worker teardown | same |
| `setupFilesAfterEnv` `jest-after-env.ts` calls disconnect once after all suites | `apps/api/src/test/jest-after-env.ts` |
| `forceExit: false` explicit | `apps/api/jest.config.cts` |
| Redis never-connected clients: `disconnect()` instead of `quit()` | `apps/api/src/app/redis.service.ts` |
| Exclude `jest-after-env.ts` from `tsconfig.app.json` | typecheck hygiene |

### Consecutive `api:test` evidence (no retry)

| Run | Suites | Tests | Open-handle warning | Nx flaky | Exit |
|-----|--------|-------|---------------------|----------|------|
| 1 | **52 passed / 52** | **136 passed / 136** | **No** | **No** | 0 |
| 2 | **52 passed / 52** | **136 passed / 136** | **No** | **No** | 0 |
| 3 | **52 passed / 52** | **136 passed / 136** | **No** | **No** | 0 |
| 4 (post typecheck exclude) | **52 passed / 52** | **136 passed / 136** | **No** | — | 0 |

Prior failed attempt (before rider GRANT) was deterministic permission error on new test — not flake; fixed by `20260827195100`.

---

## 3. P1-4 — Topology status

### Correction

`apps/api/src/identity/app-topology.ts` doctor mobile + doctor web `futureStatus` no longer say “R4 not started” / “video shell only until R4”.

Accurate wording now states:

- R4 telemedicine **sandbox implemented** (mock default)  
- production LiveKit **NOT enabled**  
- production telemedicine **NOT ready**  
- R5 Rx/refill under pack gates  

### Regression test

`app-topology.spec.ts` — `records R4 sandbox as implemented without claiming production telemedicine` asserts both doctor apps reject “r4 not started”, require sandbox + LiveKit-not-enabled + telemedicine-not-ready, and do not claim production-ready.

---

## 4. Security / RLS results

| Suite | Result |
|-------|--------|
| `rls.tenancy.e2e.spec.ts` (incl. FORCE + rider isolation) | **PASS** (in 136) |
| `r3.isolation.e2e.spec.ts` | **PASS** |
| `company-authority.e2e.spec.ts` / partner isolation | **PASS** |
| R5 prescription / dispensing / rx-handoff / refill e2e | **PASS** |

**Invariants held:** MNC hierarchy unchanged; partners cannot gain company admin; client headers non-authoritative; doctor access remains relationship+consent+policy+RLS; store/vendor org isolation held.

---

## 5. Full regression results

| Check | Result |
|-------|--------|
| Workspace `nx run-many -t test` (11 projects) | **Success** — api **52/136**; non-api suites unchanged green |
| API consecutive runs | **4× green** (§2) |
| Typecheck 11 projects | **Success** (after excluding jest-after-env from app tsconfig) |
| Web builds 6 projects | **Success** (compiled) |
| Mobile typechecks | **Success** (store builds not claimed) |

Migrations applied on test DB: **43** total; latest `20260827195100_pre_r6_rider_presence_grant`.

---

## 6. Remaining blockers

| Item | Status vs R6 IMPL |
|------|-------------------|
| Book 122 P1-1 / P1-2 / P1-4 | **Closed** |
| Business Unit membership | Still open — **R15 / funded** (not these three blockers) |
| Live money / carriers / production video / auto-refill | Correctly **OFF** — not closed as “enabled” |
| R6 plan CR | Still required before R6 coding |

---

## 7. Production boundaries (explicit)

| Boundary | State |
|----------|-------|
| Payment | Sandbox / mock |
| Carrier / DHL | Mock |
| Payout | Mock |
| LiveKit production | **OFF** |
| Recording | **OFF** |
| Automatic refill execution | **OFF** (`tryExecuteDueSubscriptions` inert) |
| Live e-Rx | **OFF** (`NullERxAdapter`) |

---

## 8. R6

**R6 was NOT started.** No marketplace vendor implementation CR, no new vendor product scope beyond topology metadata accuracy.

---

## Final declaration

**FINAL STATUS: PRE_R6_BLOCKERS_CLOSED**

**R6: NOT STARTED**

**STOP.**
