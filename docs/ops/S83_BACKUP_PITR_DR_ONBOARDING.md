# Sprint 83 — Production backup / PITR / disaster recovery activation readiness

Stabilization of the **Sprint 74** backup-first onboarding path. No managed DB, cloud PITR, or DR environment was invented.

> **Sprint 96** continues activation readiness without inventing providers. See `S96_PRODUCTION_BACKUP_PITR_DR_ACTIVATION_READINESS.md`. Production remains **EXTERNAL_GATED**. RPO/RTO remain **NOT_YET_PROVEN**.

## Provider status (this environment)

| Rail | Provider | Sandbox | Production | Blocker |
|------|----------|---------|------------|---------|
| Managed backup | **NOT_SELECTED** | **SANDBOX_VERIFIED** (`pnpm db:backup`) | **EXTERNAL_GATED** | **NO_PRODUCTION_MANAGED_BACKUP** |
| PITR | **NOT_SELECTED** | SANDBOX_ONLY (no WAL PITR) | **EXTERNAL_GATED** | **NO_PRODUCTION_PITR** |
| DR environment | **NOT_SELECTED** | isolated `db:recovery-drill` only | **EXTERNAL_GATED** | **NO_PRODUCTION_DR_ENVIRONMENT** |
| Primary composite | — | — | **EXTERNAL_GATED** | **NO_PRODUCTION_MANAGED_BACKUP_PITR** |

Local logical dump/restore ≠ managed cloud PITR.

## RPO / RTO

| Metric | Target | Achievement |
|--------|--------|-------------|
| RPO | **15m** | **TARGET_DEFINED / NOT_YET_PROVEN** |
| RTO | **4h** | **TARGET_DEFINED / NOT_YET_PROVEN** |

Sandbox restore elapsed time is evidence only — it does **not** prove the 15m/4h targets.

## Architecture boundaries

| Layer | Meaning |
|-------|---------|
| Migration history | Schema reproducibility — not a backup |
| Logical dump (`pg_dump`) | Sandbox/dev recovery artifact |
| Managed PITR | Production continuous recovery — **not present** |
| Object/file recovery | Depends on S82 private storage — **PRIVATE_STORAGE_EXTERNAL_GATED** |
| Backup encryption | Depends on S82 KMS — **KMS_EXTERNAL_GATED** |

## Isolated restore

```bash
pnpm db:recovery-drill
```

Creates an isolated DB, restores into it, verifies schema/marker/outbox/migrations, drops the drill DB. Never targets the active development database.

Evidence: `apps/test-results/s74-backup/sandbox-restore-drill.json` (reused) and S83 shots.

## DR runbook

Reuse `S63_DISASTER_RECOVERY_RUNBOOK.md` — 14-step sequence from detect → restore → validate → communicate. Production-class restore remains EXTERNAL_GATED.

## Admin

- `/provider-activation` — Backup / PITR / DR activation readiness (Sprint 83)
- `/reliability` · `/launch-readiness`
- `GET /api/v1/admin/control-plane/production-backup-onboarding`

## Exact tests performed

- Unit S83: `s83-production-backup-onboarding.spec.ts` **9/9**
- Regression: S74 **16/16**, S64 **10/10**, S75 **15/15**, S82 **8/8**, S77 **12/12**, S78 **11/11**, S79 **12/12**, S80 **10/10**, S81 **10/10**
- Isolated restore: `node scripts/db-recovery-drill.mjs` → **SANDBOX_VERIFIED** (265 tables, restore ~5374ms; RPO/RTO still NOT_YET_PROVEN)
- Playwright: S83 **3/3**, S74 **3/3**
- Browser evidence: `apps/test-results/s83-dr-shots/`
- Status artifact: `apps/test-results/s83-dr/final-dr-status.json`
- Native Android/iOS: **DEVICE_NOT_AVAILABLE** (390px = RESPONSIVE_WEB_VERIFIED only)

See also: `S74_BACKUP_PITR_RESTORE_READINESS.md`, `S63_DISASTER_RECOVERY_RUNBOOK.md`.
