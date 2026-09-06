# Sprint 63 — Disaster recovery & backup runbook

**Status:** targets and procedures documented. Managed PITR / off-site restore = **RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED**.

**Sprint 74 update:** activation contract `production-backup-first-onboarding.ts` + Admin Provider Activation card + timed sandbox restore evidence. Achievement remains **NOT_YET_PROVEN**.

## Recovery objectives (TARGET_DEFINED)

| Metric | Target | Achievement |
|--------|--------|-------------|
| RPO | **15 minutes** (Postgres primary) | **NOT_YET_PROVEN** until managed WAL/PITR |
| RTO | **4 hours** to `/health/ready` | **NOT_YET_PROVEN** until infra + production-class drill |
| Backup cadence | Continuous WAL + daily logical dump | Local `pnpm db:backup` = SANDBOX ONLY |

Source: `apps/api/src/ops/recovery-targets.ts`.

## Commands that exist today (AVAILABLE NOW / SANDBOX)

| Action | Command | Notes |
|--------|---------|-------|
| Logical backup | `pnpm db:backup` | Requires `DATABASE_URL`; writes `var/backups/*.sql.gz` + `.meta.json` |
| Restore | `pnpm db:restore` | Disposable/isolated DB only — never production (`CONFIRM_RESTORE=yes`) |
| Recovery drill | `pnpm db:recovery-drill` | Isolated DB + marker verify + writes `apps/test-results/s74-backup/sandbox-restore-drill.json` |
| Health | `GET /health` | Liveness |
| Ready | `GET /health/ready` | Postgres + Redis + infra category snapshot (app health ≠ production recovery ready) |
| Reliability | Admin `/reliability` + `GET /api/v1/admin/control-plane/reliability/snapshot` | Outbox counts, backup catalog, release gate |
| Backup onboarding | `GET /api/v1/admin/control-plane/production-backup-onboarding` | Sprint 74 activation snapshot |
| Release gate | `GET /api/v1/admin/control-plane/release-gate` | Final internal matrix |

## DATABASE

| Step | Availability |
|------|----------------|
| Logical dump/restore scripts | AVAILABLE NOW (sandbox/dev) |
| Migration apply (`prisma migrate`) | AVAILABLE NOW |
| Integrity via `/health/ready` migrations probe | AVAILABLE NOW |
| Managed PITR | EXTERNAL DEPENDENCY (`NO_PRODUCTION_MANAGED_BACKUP_PITR`) |
| Off-site encrypted retention | EXTERNAL DEPENDENCY (needs S73 KMS) |
| Object/file recovery | EXTERNAL DEPENDENCY (needs S73 private storage) |
| Last verified production restore | NOT VERIFIED |
| Last verified sandbox restore drill | See `apps/test-results/s74-backup/sandbox-restore-drill.json` |

## APPLICATION

1. Restore/config secrets from secret manager (EXTERNAL until KMS).
2. Start API + outbox dispatcher / workers.
3. Confirm `GET /health/ready` → `status: ready`.
4. Confirm outbox PENDING drains; review DEAD_LETTERED.
5. Confirm Admin + Customer OTP login; spot-check orders/health where sandbox data exists.
6. Confirm authorization/tenant isolation still holds after restore.

## STORAGE

- Production forbids local disk (`production-storage-gate`).
- Restore bucket + IAM (EXTERNAL).
- Database restore alone does **not** recover KYC/clinical files.
- Re-validate document ACLs; do not expose PHI in logs.

## EXTERNAL PROVIDERS

| Provider | Recovery note |
|----------|---------------|
| Payment | Sandbox mock only; production webhooks 503 until PSP secrets |
| Messaging/OTP | Console/sandbox; live vendor EXTERNAL |
| Carrier | Mock only; live adapter EXTERNAL |
| Healthcare (eRx/video/PACS) | Catalog EXTERNAL_GATED |

## OPERATIONAL RECONCILE (SANDBOX TODAY)

1. Identify last good backup metadata (`sha256`, `byte_size`, `created_at`).
2. Run `pnpm db:recovery-drill` (isolated DB) — capture `restore_elapsed_ms`.
3. After restore: migrate if needed → start API → `/health/ready`.
4. Outbox: list PENDING/PROCESSING/DEAD_LETTERED in Admin Reliability.
5. Payments/orders: use Admin Orders/Payments; do not invent paid without CAPTURED intent.
6. Settlements/payouts: EXTERNAL_PAYOUT_GATED — never mark bank-executed without provider.

## Migration / deployment safety

- Migrations live under `packages/database/prisma/migrations` (ordered timestamps).
- Prefer expand/contract for destructive changes; treat drop/rename as high-risk.
- `DEV_SANDBOX_SEED` / demo fixtures run **only** when `NODE_ENV=development` and never when `INFRASTRUCTURE_ENVIRONMENT=production` or `PAYMENT_ENVIRONMENT=production`.
- Do not promote `var/backups` or sandbox DB dumps into production.

## Emergency escalation

1. Declare incident; freeze risky schema changes if restore is compromised.
2. Prefer managed PITR to last known good once EXTERNAL infra is connected.
3. Do not delete live data as a response to backup failure.
4. Capture evidence (timestamps, checksums, `/health/ready`, Admin Reliability screenshot).
5. Escalate to Platform/DBA + Security for encrypted backup / KMS / object recovery gaps.

## Responsibility

| Area | Owner |
|------|-------|
| Targets / runbook | Engineering |
| Managed Postgres/PITR | Platform / cloud DBA (EXTERNAL) |
| Encrypted off-site + KMS | Platform / Security (EXTERNAL) |
| Object recovery | Platform / Security (EXTERNAL — S73) |
| Legal retention/residency | Legal / Compliance (EXTERNAL) |
