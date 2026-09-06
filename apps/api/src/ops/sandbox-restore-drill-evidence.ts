/**
 * Sprint 74 — Read sandbox restore drill evidence written by scripts/db-recovery-drill.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type SandboxRestoreDrillEvidence = {
  status: 'SANDBOX_VERIFIED' | 'NOT_RUN' | 'FAILED';
  restore_elapsed_ms: number | null;
  table_count: number | null;
  migrations_present: boolean | null;
  marker_verified: boolean | null;
  evidence_path: string | null;
  note: string;
};

export function readSandboxRestoreDrillEvidence(
  cwd = process.cwd(),
): SandboxRestoreDrillEvidence {
  const candidates = [
    join(cwd, 'apps', 'test-results', 's74-backup', 'sandbox-restore-drill.json'),
    join(cwd, 'test-results', 's74-backup', 'sandbox-restore-drill.json'),
    join(cwd, 'var', 'backups', 'drill', 's74-restore-evidence.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      if (parsed['event'] !== 'recovery_drill_complete' && parsed['status'] !== 'SANDBOX_VERIFIED') {
        continue;
      }
      return {
        status: 'SANDBOX_VERIFIED',
        restore_elapsed_ms:
          typeof parsed['restore_elapsed_ms'] === 'number' ? parsed['restore_elapsed_ms'] : null,
        table_count: typeof parsed['table_count'] === 'number' ? parsed['table_count'] : null,
        migrations_present:
          typeof parsed['migrations_present'] === 'boolean' ? parsed['migrations_present'] : null,
        marker_verified:
          typeof parsed['marker_verified'] === 'boolean' ? parsed['marker_verified'] : null,
        evidence_path: path.replace(/\\/g, '/'),
        note: 'Sandbox logical dump/restore drill only — not production PITR.',
      };
    } catch {
      /* try next */
    }
  }
  return {
    status: 'NOT_RUN',
    restore_elapsed_ms: null,
    table_count: null,
    migrations_present: null,
    marker_verified: null,
    evidence_path: null,
    note: 'Run pnpm db:recovery-drill (isolated DB) to produce sandbox evidence.',
  };
}
