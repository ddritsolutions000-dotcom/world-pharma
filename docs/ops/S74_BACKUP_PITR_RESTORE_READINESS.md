# Sprint 74 — Production backup / PITR / restore readiness

> **Sprint 83** stabilizes activation readiness on this foundation. See `S83_BACKUP_PITR_DR_ONBOARDING.md`.
> **Sprint 96** is the production activation-readiness pass. See `S96_PRODUCTION_BACKUP_PITR_DR_ACTIVATION_READINESS.md`.
> Primary blocker remains **`NO_PRODUCTION_MANAGED_BACKUP_PITR`** (also: `NO_PRODUCTION_MANAGED_BACKUP` / `NO_PRODUCTION_PITR` / `NO_PRODUCTION_DR_ENVIRONMENT`).

## Availability (this environment)

| Rail | Provider | Sandbox | Production | Enabled | Blocker |
|------|----------|---------|------------|---------|---------|
| Managed backup | **NOT_SELECTED** | **SANDBOX_VERIFIED** (`pnpm db:backup`) | **EXTERNAL_GATED** | false | **NO_PRODUCTION_MANAGED_BACKUP_PITR** |
| PITR | **NOT_SELECTED** | SANDBOX_ONLY (no WAL PITR) | **EXTERNAL_GATED** | false | **NO_PRODUCTION_MANAGED_BACKUP_PITR** |
| Restore | — | **SANDBOX_VERIFIED** (`pnpm db:recovery-drill`) | **EXTERNAL_GATED** | — | production-class drill required |

Local logical dump/restore ≠ managed cloud PITR.

## RPO / RTO

| Metric | Target | Achievement |
|--------|--------|-------------|
| RPO | **15m** | **TARGET_DEFINED / NOT_YET_PROVEN** |
| RTO | **4h** | **TARGET_DEFINED / NOT_YET_PROVEN** |

Sandbox restore elapsed time is recorded for evidence only — it does **not** prove the 15m/4h targets.

## Architecture boundaries

| Layer | Meaning |
|-------|---------|
| Migration history | Schema reproducibility — not a backup |
| Logical dump (`pg_dump`) | Sandbox/dev recovery artifact |
| Managed PITR | Production continuous recovery — **not present** |
| Object/file recovery | Depends on S73 private storage — **EXTERNAL_GATED** |
| Backup encryption | Depends on S73 KMS — **EXTERNAL_GATED** |

## Sandbox restore drill

```bash
pnpm db:recovery-drill
```

Creates an isolated DB, restores into it, verifies schema/marker/outbox/migrations, drops the drill DB, writes:

- `apps/test-results/s74-backup/sandbox-restore-drill.json`

Never targets production. Never uses real patient/KYC data.

## Admin

- `/provider-activation` — Backup / PITR / restore card
- `/reliability` — Recovery card with achievement wording
- `/launch-readiness`
- `GET /api/v1/admin/control-plane/production-backup-onboarding`

## Emergency / fail-closed

When managed backup/PITR is unavailable:

- launch readiness remains blocked
- do not claim recovery coverage
- do not delete application data
- `PITR_LIVE_ENABLED=false` / emergency disable flags keep enablement guard closed

## When real infrastructure is supplied

1. Managed Postgres with WAL/PITR + encrypted off-site retention.
2. Object-storage recovery (S73) + KMS (S73).
3. Production-class disposable restore drill with timed evidence.
4. Retention/residency legal review.
5. `PROVIDER_APPROVED_MANAGED_DB_PITR=true`.
6. `PITR_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
