/**
 * Sprint 47 — Backup metadata catalog (local logical dumps). Not cloud PITR.
 * Sprint 74 — Surfaces last sandbox restore drill evidence when present.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRecoveryObjectives } from './recovery-targets';
import { readSandboxRestoreDrillEvidence } from './sandbox-restore-drill-evidence';

export type BackupCatalogRow = {
  created_at: string | null;
  environment: string | null;
  database: string | null;
  byte_size: number | null;
  sha256: string | null;
  artifact_name: string | null;
  pitr: 'EXTERNAL_GATED';
  verified: boolean;
};

function backupDir(): string {
  return process.env['BACKUP_DIR'] ?? join(process.cwd(), 'var', 'backups');
}

export function listBackupCatalog(limit = 10): {
  data: BackupCatalogRow[];
  pitr: 'EXTERNAL_GATED';
  rpo: 'TARGET_DEFINED';
  rto: 'TARGET_DEFINED';
  rpo_target: string;
  rto_target: string;
  rpo_achievement: 'NOT_YET_PROVEN' | 'PROVEN';
  rto_achievement: 'NOT_YET_PROVEN' | 'PROVEN';
  recovery_infrastructure_status: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED';
  last_verified_restore: string | null;
  sandbox_restore: 'SANDBOX_VERIFIED' | 'NOT_RUN' | 'FAILED';
} {
  const recovery = getRecoveryObjectives();
  const drill = readSandboxRestoreDrillEvidence();
  const empty = {
    data: [] as BackupCatalogRow[],
    pitr: 'EXTERNAL_GATED' as const,
    rpo: 'TARGET_DEFINED' as const,
    rto: 'TARGET_DEFINED' as const,
    rpo_target: recovery.rpo_target,
    rto_target: recovery.rto_target,
    rpo_achievement: recovery.rpo_achievement,
    rto_achievement: recovery.rto_achievement,
    recovery_infrastructure_status: recovery.infrastructure_status,
    last_verified_restore:
      drill.status === 'SANDBOX_VERIFIED'
        ? `sandbox_drill elapsed_ms=${drill.restore_elapsed_ms ?? 'n/a'}`
        : null,
    sandbox_restore: drill.status,
  };
  const dir = backupDir();
  if (!existsSync(dir)) {
    return empty;
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.meta.json'))
    .sort()
    .reverse()
    .slice(0, limit);
  const data: BackupCatalogRow[] = files.map((name) => {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const artifact =
        typeof parsed['outfile'] === 'string'
          ? parsed['outfile'].replace(/\\/g, '/').split('/').pop() ?? null
          : name.replace(/\.meta\.json$/, '');
      return {
        created_at: typeof parsed['created_at'] === 'string' ? parsed['created_at'] : null,
        environment: typeof parsed['environment'] === 'string' ? parsed['environment'] : null,
        database: typeof parsed['database'] === 'string' ? parsed['database'] : null,
        byte_size: typeof parsed['byte_size'] === 'number' ? parsed['byte_size'] : null,
        sha256: typeof parsed['sha256'] === 'string' ? parsed['sha256'] : null,
        artifact_name: artifact,
        pitr: 'EXTERNAL_GATED',
        verified: Boolean(parsed['sha256'] && parsed['byte_size']),
      };
    } catch {
      return {
        created_at: null,
        environment: null,
        database: null,
        byte_size: null,
        sha256: null,
        artifact_name: name,
        pitr: 'EXTERNAL_GATED',
        verified: false,
      };
    }
  });
  return { ...empty, data };
}

export function verifyBackupMetadata(meta: {
  sha256?: unknown;
  byte_size?: unknown;
  created_at?: unknown;
}): { ok: boolean; reason: string | null } {
  if (typeof meta.sha256 !== 'string' || meta.sha256.length < 32) {
    return { ok: false, reason: 'sha256_missing' };
  }
  if (typeof meta.byte_size !== 'number' || meta.byte_size < 16) {
    return { ok: false, reason: 'byte_size_invalid' };
  }
  if (typeof meta.created_at !== 'string' || !meta.created_at) {
    return { ok: false, reason: 'created_at_missing' };
  }
  return { ok: true, reason: null };
}
