# Sprint 63 — Migration & deployment safety

## Ordering

- Migrations live in `packages/database/prisma/migrations/` with timestamp prefixes.
- Apply with `pnpm prisma:migrate:deploy` (production/staging) or `pnpm prisma:migrate` (dev).
- Check status: `pnpm prisma:migrate:status`.

## Determinism

- Prisma migration SQL is the source of truth; do not hand-edit applied migration folders after deploy.
- Expand/contract for destructive changes (drop/rename columns only after dual-write windows).

## Application / schema compatibility

- Prefer additive columns with defaults or nullable first.
- API must start against current schema; `/health/ready` reports `database.migrations`.
- Outbox/idempotency tables are durable — restore + migrate before restarting workers.

## Rollback expectations

- Prefer forward-fix migrations.
- Logical restore via `pnpm db:restore` is **sandbox/isolated only** — never against production.
- Managed PITR rollback = **EXTERNAL DEPENDENCY** (`RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED`).

## Seed / demo fixture safety

- `DEV_SANDBOX_SEED` / demo journeys run only when `NODE_ENV=development`.
- Guard (`apps/api/src/ops/demo-fixture-guard.ts`) also skips when any of:
  - `INFRASTRUCTURE_ENVIRONMENT=production`
  - `PAYMENT_ENVIRONMENT=production`
  - `COMMUNICATION_ENVIRONMENT=production`
  - `LOGISTICS_ENVIRONMENT=production`
- Production deploys must not set `DEV_SANDBOX_SEED=true`.

## Disposable verification

- Run migrate + API boot against a disposable DB (local Docker Postgres) before cutover.
- Do **not** run destructive experiments against staging/production data.
