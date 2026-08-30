# 254 — R14 pre-A engineering hygiene

**CR:** `CR-R14-PRE-A-ENGINEERING-HYGIENE-254`  
**Verdict:** **`R14_PRE_A_HYGIENE_PARTIAL`**  
**Date:** 30 August 2026  
**Prior audit:** [253](253_FULL_CODEBASE_AUDIT.md)  
**Human gates:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) — **0/7 evidenced** (unchanged)

Pre-R14-A engineering preconditions only. **No R14-A live PSP work. No human gate approvals invented.**

---

## 1. Initial failures (Book 253 / CR-254 entry)

| ID | Finding | Source |
|----|---------|--------|
| TD-WEB-TC-01 | `web-customer:typecheck` FAIL — `store-home.tsx:174` invalid `onRetry` on `NetworkErrorState` | Book 253 §12 |
| DB-PARITY-01 | Local `worldpharma` DB **34 migrations behind** repo head (R12-C…R13-G) | Book 253 §15 |
| ENV-JEST-01 | API jest `global-setup.cjs` required `pnpm` on PATH — blocked e2e in audit shell | Book 253 §13 |

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/web-customer/src/store-home.tsx` | Fix `NetworkErrorState` prop contract |
| `apps/web-customer/src/store-home.spec.tsx` | Add network-retry test; refactor mocks |
| `apps/api/src/test/global-setup.cjs` | Invoke Prisma CLI via `node` (no `pnpm` dependency) |

**Not changed:** migrations, payment code, policy packs, human gate books, R14-A scope.

---

## 3. Exact fixes

### 3.1 TD-WEB-TC-01

**Before:**
```tsx
<NetworkErrorState onRetry={() => void runDiscovery(query)} />
```

**After:**
```tsx
<NetworkErrorState
  action={{ label: 'Retry', onClick: () => void runDiscovery(query) }}
/>
```

Aligns with `packages/ui-kit/src/web/states.tsx` — `NetworkErrorState` accepts `action?: { label, onClick }` only.

**Test added:** `retries discovery search from network error state` — verifies Retry button re-invokes `fetchDiscoverySearch`.

### 3.2 DB-PARITY-01

Investigation:
- **Dev DB:** `postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma` (from `.env`)
- **Test DB:** `worldpharma_test` (jest isolation via `isolate-runtime.cjs`)
- **Pending:** 34 migrations (R12-C promo through R13-G clinical search)
- **Destructive ops:** None found (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE` absent in pending SQL)
- **Order:** Valid sequential timestamps; all additive schema + RLS + grants

**Action taken:** `prisma migrate deploy` on local dev `worldpharma` — all 34 applied successfully.

**Test DB:** Already at 128/128 (no pending) before and after dev deploy.

**After:** `Database schema is up to date!` on `worldpharma`.

**Production/staging:** Not mutated. Operators must run:
```bash
prisma migrate deploy --schema packages/database/prisma/schema.prisma
```
against each environment's `DATABASE_URL` during authorized release windows.

### 3.3 ENV-JEST-01

**Before:** `global-setup.cjs` called `pnpm exec prisma migrate deploy`.

**After:** Calls `node node_modules/prisma/build/index.js migrate deploy` — works on Windows paths with spaces, no `pnpm` PATH requirement.

---

## 4. Migration state before/after

| Database | Before | After |
|----------|--------|-------|
| `worldpharma` (dev) | 94 applied, **34 pending** | **128 applied, 0 pending** |
| `worldpharma_test` | 128 applied | 128 applied |

**Pending migrations applied (dev):**
`20260829220000_r12c_promo_schema` … `20260829300200_r13g_clinical_search_grants` (34 total).

---

## 5. Tests run

| Command | Scope |
|---------|-------|
| `tsc -p apps/api/tsconfig.app.json` | API typecheck |
| `nx run api:build` | API build |
| `tsc -p apps/web-customer/tsconfig.json` | web-customer typecheck |
| `tsc -p apps/web-admin/tsconfig.json` | web-admin typecheck |
| `tsc -p apps/web-affiliate/tsconfig.json` | web-affiliate typecheck |
| `tsc -p apps/mobile/tsconfig.json` | mobile typecheck |
| `jest --testPathPatterns=store-home` (web-customer) | StoreHome unit tests |
| `jest --testPathPatterns=r12` (api) | R12 regression |
| `jest --testPathPatterns=r13` (api) | R13 regression |
| `jest --testPathPatterns=payment` (api) | Payment e2e |

---

## 6. Test results

| Suite | Result | Detail |
|-------|--------|--------|
| API typecheck | **PASS** | |
| API build | **PASS** | webpack compiled successfully |
| web-customer typecheck | **PASS** | TD-WEB-TC-01 closed |
| web-admin typecheck | **PASS** | |
| web-affiliate typecheck | **PASS** | |
| mobile typecheck | **PASS** | |
| web-customer `store-home.spec.tsx` | **PASS** | 2/2 |
| API R12 e2e | **PASS** | 7 suites, 32 tests |
| API payment e2e | **PASS** | 3 suites, 4 tests |
| API R13 e2e | **PARTIAL** | 7/8 suites pass; **1 failure** (see §6.1) |

### 6.1 R13 failure classification

| Test | Failure | Classification |
|------|---------|----------------|
| `r13b.discovery.e2e.spec.ts` — unified discovery expects `commerce` + `help` in results for `q=R13B` | Received only `commerce` (20+ commerce rows) | **DB POLLUTION** |

**Analysis:** `DiscoverySearchService` merges all matching types, sorts, then paginates (limit 20). The shared test DB (`worldpharma_test`) accumulates catalog items matching `R13B` from prior runs. Help content is indexed correctly via `CmsSearchService.upsertPublishedDocument` on publish, but commerce pollution fills the result page before help appears.

**Not introduced by CR-254.** Isolated re-run of `r13b.discovery.e2e.spec.ts` reproduces failure.

**Remediation (future CR, not this scope):** test isolation cleanup, per-run unique query tokens, or type-fair pagination in discovery merge.

---

## 7. Runtime results (actually performed)

| Check | Result |
|-------|--------|
| Docker Postgres | Up, healthy (`world-pharma-postgres`, port 55432) |
| Docker Redis | Up, healthy (`world-pharma-redis`, port 56379) |
| `GET /health/ready` | **200** — `{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}` |
| `prisma migrate status` (dev) | **Up to date** (128/128) |
| API startup | Process responding on localhost:4000 (pre-existing dev server) |

---

## 8. Remaining blockers

| Blocker | Status |
|---------|--------|
| R14-A human gates (PSP, country, legal entity, MoR, contract, vault, PCI) | **0/7 evidenced** — unchanged |
| `r13b.discovery.e2e` DB pollution flake | **OPEN** — pre-existing |
| Staging/production DB migration deploy | **Operator action** — not auto-applied |
| R14-A live PSP implementation | **NOT STARTED** — out of scope |

---

## 9. R14-A readiness after this CR

| Dimension | Verdict |
|-----------|---------|
| **Engineering preconditions (Book 253 items)** | **Largely closed** — typecheck green, dev DB at parity, jest global-setup fixed |
| **Engineering can start R14-A adapter work** | **Yes** — after human authorization of `CR-R14-A-IMPL-244` |
| **Human gates permit R14-A** | **No** — 0/7 evidenced |
| **Operational parity** | **Dev green**; staging/prod require operator `migrate deploy` |

---

## 10. Final verdict

**`R14_PRE_A_HYGIENE_PARTIAL`**

**Fixed:**
- TD-WEB-TC-01 (web-customer typecheck)
- Dev database migration parity (34 migrations applied)
- Jest global-setup `pnpm` PATH dependency
- R12 full regression (32 tests)
- Payment e2e (4 tests)
- All requested typechecks

**Remains:**
- One R13-B discovery e2e failure (DB pollution — pre-existing)
- Human gates 0/7
- R14-A implementation not authorized

**Next CR:** **`CR-R14-A-IMPL-244`** — only after human gates evidenced and explicitly authorized. Optional parallel: **`CR-TEST-R13B-ISOLATION-255`** (or similar) to fix discovery e2e DB pollution — not blocking R14-A engineering start.

**No fake human approvals. No R14-A implementation in CR-254.**
