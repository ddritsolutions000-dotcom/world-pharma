# 47 — CI/CD and production-readiness implementation notes

**Status:** Phase 0 Task 8 — implemented  
**Canonical:** [32](32_DEVOPS_CICD.md), [29](29_INFRASTRUCTURE_ARCHITECTURE.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

CI, local compose, and release *process* only. **No production deploy. No AWS. No Kubernetes. No product UI.**

---

## Toolchain pin

| Item | Value |
| --- | --- |
| Node | **22** (`.nvmrc`, `engines.node`: `>=22 <23`, CI `node-version-file: .nvmrc`, Docker `node:22-alpine`) |
| pnpm | **10.15.1** (`packageManager` + Corepack + `pnpm/action-setup`) |
| Lockfile | `pnpm-lock.yaml` — CI uses `--frozen-lockfile` |
| Postgres | **16** (Compose + CI service) |
| Redis | **7.x** (`redis:7-alpine`, host port **56379** so host Redis 3.x on 6379 is unused) |

---

## CI (GitHub Actions)

`.github/workflows/ci.yml`

1. checkout (fetch-depth 0)  
2. pnpm 10.15.1 + Node 22  
3. `pnpm install --frozen-lockfile`  
4. `prisma validate` + `prisma generate`  
5. `prisma migrate deploy` against ephemeral Postgres 16  
6. schema vs DB drift check (`scripts/ci/check-migrations.mjs`)  
7. lint, typecheck, tests (coverage reporters text)  
8. `nx build api`, `nx build ds-web`  
9. Redis INFO must start with `7.`  
10. `scripts/ci/audit.mjs`  
11. Gitleaks (`zricethezav/gitleaks:v8.24.3`)

Permissions: `contents: read`. No deploy job. No cloud secrets. Fork PRs never receive production secrets because none are configured.

---

## Tests in CI

- Unit + e2e via `nx run-many -t test` against CI Postgres 16 and Redis 7  
- Dedicated `apps/api/src/app/ci-smoke.e2e.spec.ts`: `/health`, `/health/ready` (Redis 7), `/health/version`, `GET /api/v1/me` 401, `GET /api/v1/countries` 200, unauthenticated partner admin 401  
- Coverage is **reported**, not gated on a percentage  
- Outbox/BullMQ tests remain in the API suite

---

## Prisma / migrations

| Environment | Command |
| --- | --- |
| Local dev | `pnpm prisma:migrate` (`migrate dev`) |
| CI / test | `prisma migrate deploy` on empty Postgres 16 |
| Staging / production | `migrate deploy` only, after backup + review — **never** from PR CI |

Prisma migrations are **forward-only**. They are **not** automatically reversible. Prefer expand → deploy → contract. Rollback of a bad migration is a **forward-fix** migration plus application rollback of the API image, not `migrate down`.

---

## Docker

- `docker compose up -d` — Postgres 16 + Redis 7 only  
- `docker compose --profile app up` — also builds `Dockerfile` API (uses compose DNS `postgres` / `redis`, not localhost)  
- API image: Node 22 alpine, non-root `app` user, no `.env` copied  
- Do not point `REDIS_URL` at host `:6379`

---

## Environment

`NODE_ENV`: `development` | `test` | `staging` | `production`  

Staging is production-like: CORS allowlist required, `AUTH_DEV_REVEAL_OTP` forbidden. Secrets stay in GitHub Environments / secret manager later — never in git. `.env.example` holds placeholders only.

---

## Dependency security

`pnpm audit` is parsed by `scripts/ci/audit.mjs`.

**Known (not hidden):** listed in `scripts/ci/known-advisories.json`. Includes `deepmerge-ts` **GHSA-ggr8-5vv4-36mx** (Prisma CLI), PostCSS via Next 15.5.24, `brace-expansion` via Nx, `image-size` via webpack Less / RN Metro. None were force-upgraded. **deepmerge-ts** is the only item marked review-before-prod. New GHSAs fail CI.

---

## Secret scanning

Gitleaks with `.gitleaks.toml`. Allowlist is local placeholders in `.env.example` and the lockfile. Production credentials must never be committed.

---

## Release identifier

`GET /health/version` → `{ status, version, git_sha, built_at }` from `APP_VERSION`, `GIT_SHA`, `BUILD_TIME`. `/health` remains `{ status: "ok" }`.

No production release pipeline yet. Future: tag git SHA → build image → staging `migrate deploy` → smoke → promote. **Not implemented.**

---

## Rollback

- **App:** redeploy previous image/SHA.  
- **DB:** not the same as app rollback. Use expand/contract. No down-migrations on money/health tables (none of those tables exist yet).

---

## Backup / restore (process only)

Production values are **not** invented.

Checklist when a host exists: automated Postgres backups, encrypted at rest, retention per legal later, restore test on a copy, document RPO/RTO as a **hosting decision**. Redis is cache/queue — not the system of record.

---

## Disaster recovery (future)

Documented failures: Postgres, Redis, region, container, queue, object storage, PSP. **No multi-region now.** Redis loss: workers reconnect; outbox remains in Postgres. Postgres loss: restore from backup.

---

## Observability / security release gates

Must exist before any live traffic: `/health`, `/health/ready`, JSON logs, correlation ids, metrics, no secret/PHI in logs, rate limits, CORS allowlist, Redis 7, RLS not globally disabled. Error tracker vendor (**OD-OBS-01**) still open.

Full checklist: authentication, authorization, rate limit, secrets, CORS, headers, DB, Redis, KYC access (dark), PHI/payment boundaries (no product yet), redaction, dependency review, container user, backup, monitoring.

---

## Windows Prisma EPERM

When `pnpm install` / `prisma generate` hits `EPERM` renaming `query_engine-windows.dll.node`, a running **API or worker** has the Prisma engine loaded.

**Workflow (not “fixed in code”):** stop `nx serve api` and any Node process using Prisma → `pnpm prisma:generate` → restart. Do not delete `node_modules` while the API is running.

---

## Graceful shutdown

`app.enableShutdownHooks()` in `main.ts`. Dispatcher, worker, Prisma, Redis implement `onModuleDestroy` (`quit`/`$disconnect`). Tests cover idle destroy. SIGTERM from an orchestrator will close Nest.

---

## Future load tests (not built)

Store, search, checkout, delivery tracking, video, lab, high-volume APIs. Foundation now: `startup_ms` log on boot, health latency via existing metrics.

---

## Phase 0 DoD vs this task

This task **does not** auto-sign Phase 0. Customer/admin/mobile **product shells** are still absent (Task 7 delivered a DS playground, not those apps). Hosted `dev` is blocked on a cloud account.

---

## Deferred

AWS/ECS deploy, OIDC, preview environments, secret manager, multi-region, load tests, Prisma major upgrade for `deepmerge-ts`.
