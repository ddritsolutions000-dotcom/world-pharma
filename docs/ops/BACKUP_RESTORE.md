# Backup & Restore — World-Pharma

This document describes **what exists in the repository** versus **what production requires**. Do not treat local scripts as production DR without cloud/provider setup.

## Current capability (repository)

| Item | Status |
|------|--------|
| Automated cloud backup | **Not in repo** — external dependency |
| Point-in-time recovery (PITR) | **EXTERNAL_GATED** — requires managed Postgres |
| Local logical backup script | **Available** — `pnpm db:backup` / `node scripts/db-backup.mjs` |
| Local restore script | **Available** — `pnpm db:restore -- <file>` / `node scripts/db-restore.mjs` (destructive) |
| Isolated recovery drill | **Available** — `pnpm db:recovery-drill` / `node scripts/db-recovery-drill.mjs` |
| Backup metadata (timestamp/env/sha256) | **Available** — sidecar `*.meta.json` |
| Encrypted off-site retention | **External dependency** |

## Local backup (development / sandbox)

Prerequisites: PostgreSQL client tools (`pg_dump`, `psql`) on PATH or under common Windows install paths; Docker Postgres or local Postgres reachable via `DATABASE_URL`.

```bash
# From repo root — uses DATABASE_URL from environment
pnpm db:backup
# equivalent: node scripts/db-backup.mjs
```

Backups are written to `var/backups/worldpharma-<timestamp>.sql.gz` unless `BACKUP_DIR` is set.
Each successful backup also writes `worldpharma-<timestamp>.sql.gz.meta.json` with `created_at`, `environment`, `database`, `byte_size`, and `sha256`.
Backup failure exits non-zero.

Optional: `BACKUP_ENV=staging` to label metadata.

## Local restore (destructive)

**Warning:** drops the `public` schema before import. Always restore to an **isolated** database.

```bash
CONFIRM_RESTORE=yes DATABASE_URL="postgresql://.../isolated_db" pnpm db:restore -- var/backups/worldpharma-....sql.gz
# optional after restore if schema drift is suspected:
npx prisma migrate deploy
```

Restore validates:
- optional metadata checksum match
- `ON_ERROR_STOP=1` during import
- strips `SET transaction_timeout` from dumps so newer `pg_dump` clients can restore onto older servers
- post-restore presence of public tables, `_prisma_migrations`, and `outbox_events`

Partial/invalid restores exit non-zero.

## Isolated recovery drill

```bash
# Uses DATABASE_URL as source; creates/drops a temporary drill database
DRILL_PROVE_FAILURE=yes pnpm db:recovery-drill
```

Flow: marker row → backup → (optional bogus restore failure proof) → restore to isolated DB → schema/record checks → cleanup.

**Never restore onto production.** The restore script refuses production-looking database names. Record drill results (backup timestamp, restore timestamp, target environment, result, verification summary) in the ops ticket — do not store secrets in the record.

Sprint 47 admin reliability snapshot lists local `*.meta.json` artifacts (basename + checksum presence only). `last_verified_restore` is not persisted in-app (ops-owned).

## RPO / RTO

| Environment | RPO | RTO | Notes |
|-------------|-----|-----|-------|
| Local docker / sandbox | Last successful manual/drill backup | Manual (hours) | No continuous archiving |
| Contractual production targets | **NOT_YET_DEFINED** | **NOT_YET_DEFINED** | Hosting decision pending |
| Engineering aspiration (OD-DR-01) | Provider PITR (often ≤ 5–15 min) | Provider runbook (hours) | Not evidenced in this repo |

## Production requirements (external)

- Managed PostgreSQL with automated backups and PITR
- Encrypted backup storage with retention policy
- Quarterly restore drill to non-production
- Secrets rotation independent of backup files
- Object storage backup for private objects / S3 bucket

## What we do not claim

- Local dump/restore is **not** production PITR.
- Redis data is **not** included in SQL dumps — cache/queue state is rebuildable from outbox where designed.
