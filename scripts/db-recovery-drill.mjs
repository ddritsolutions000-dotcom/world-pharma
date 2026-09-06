#!/usr/bin/env node
/**
 * Isolated recovery drill:
 * 1) ensure a known marker row exists in source DB
 * 2) run backup
 * 3) verify backup artifact + metadata
 * 4) restore into an isolated database
 * 5) verify schema + representative records
 * 6) optionally prove restore failure detection
 * 7) drop isolated database / clean artifacts
 *
 * Never targets production. Local dump ≠ cloud PITR.
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adminDatabaseUrl,
  parseDatabaseUrl,
  resolvePgBin,
  swapDatabaseName,
  withPgEnv,
} from './pg-tools.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const sourceUrl = process.env['DATABASE_URL'];
if (!sourceUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const drillDb =
  process.env['DRILL_DATABASE'] ?? `worldpharma_restore_drill_${Date.now().toString(36)}`;
const parsed = parseDatabaseUrl(sourceUrl);
if (parsed.database === drillDb) {
  console.error('DRILL_DATABASE must differ from source database');
  process.exit(1);
}
if (/prod|production/i.test(parsed.database) && process.env['ALLOW_PROD_DRILL'] !== 'yes') {
  console.error(
    'Refusing drill against production-looking database name without ALLOW_PROD_DRILL=yes',
  );
  process.exit(1);
}

const proveFailure = process.env['DRILL_PROVE_FAILURE'] === 'yes';
const keepArtifacts = process.env['DRILL_KEEP_ARTIFACTS'] === 'yes';
const backupDir = process.env['BACKUP_DIR'] ?? join(root, 'var', 'backups', 'drill');
mkdirSync(backupDir, { recursive: true });
const evidenceDir =
  process.env['S74_EVIDENCE_DIR'] ?? join(root, 'apps', 'test-results', 's74-backup');
mkdirSync(evidenceDir, { recursive: true });
const drillStartedAt = Date.now();

let psql;
try {
  psql = resolvePgBin('psql');
} catch (err) {
  console.error(JSON.stringify({ event: 'recovery_drill_failed', error: err.message }));
  process.exit(1);
}

function runScript(script, args, env) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', script), ...(args ?? [])], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    cwd: root,
  });
  return result;
}

function psqlAdmin(sql) {
  const adminUrl = adminDatabaseUrl(sourceUrl, 'postgres');
  const adminParsed = parseDatabaseUrl(adminUrl);
  // One statement per invocation — DROP DATABASE cannot run in a multi-statement transaction.
  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  let stdout = '';
  for (const statement of statements) {
    const result = spawnSync(
      psql,
      [
        '--dbname',
        `postgresql://${adminParsed.user}@${adminParsed.host}:${adminParsed.port}/${adminParsed.database}`,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        statement,
      ],
      { env: withPgEnv(adminParsed), encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`psql admin failed: ${result.stderr || result.stdout}`);
    }
    stdout += result.stdout ?? '';
  }
  return stdout;
}

function psqlDb(databaseUrl, sql) {
  const p = parseDatabaseUrl(databaseUrl);
  const result = spawnSync(
    psql,
    [
      '--dbname',
      `postgresql://${p.user}@${p.host}:${p.port}/${p.database}`,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    { env: withPgEnv(p), encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`psql query failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function isTrue(value) {
  return value === 't' || value === 'true' || value === '1';
}

console.log(
  JSON.stringify({
    event: 'recovery_drill_start',
    source_database: parsed.database,
    drill_database: drillDb,
    rpo: process.env['OPS_RPO'] ?? '15m',
    rto: process.env['OPS_RTO'] ?? '4h',
    rpo_achievement: 'NOT_YET_PROVEN',
    rto_achievement: 'NOT_YET_PROVEN',
  }),
);

const markerId = randomUUID();
let markerOk = false;
try {
  psqlDb(
    sourceUrl,
    `INSERT INTO countries (
       id, iso3166_a2, iso3166_a3, name_i18n, status, default_locale,
       default_currency, default_timezone, data_residency_mode, created_at, updated_at
     ) VALUES (
       '${markerId}'::uuid,
       'Z9',
       'ZZ9',
       '{"en":"Restore drill marker"}'::jsonb,
       'ACTIVE',
       'en',
       'XXX',
       'UTC',
       'shared',
       NOW(),
       NOW()
     )
     ON CONFLICT (iso3166_a2) DO UPDATE SET updated_at = NOW();`,
  );
  markerOk = psqlDb(
    sourceUrl,
    `SELECT iso3166_a2 FROM countries WHERE iso3166_a2 = 'Z9' LIMIT 1;`,
  ).includes('Z9');
} catch (err) {
  console.log(
    JSON.stringify({
      event: 'recovery_drill_marker_skipped',
      detail: String(err.message ?? err).slice(0, 300),
    }),
  );
}

const backup = runScript('db-backup.mjs', [], {
  DATABASE_URL: sourceUrl,
  BACKUP_DIR: backupDir,
  BACKUP_ENV: 'recovery-drill',
});
if (backup.status !== 0) {
  console.error(
    JSON.stringify({
      event: 'recovery_drill_failed',
      stage: 'backup',
      detail: (backup.stderr || backup.stdout || '').slice(0, 2000),
    }),
  );
  process.exit(backup.status ?? 1);
}

const backupLine = (backup.stdout || '')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.startsWith('{'))
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .find((row) => row.event === 'db_backup_complete');

if (!backupLine?.outfile || !existsSync(backupLine.outfile) || statSync(backupLine.outfile).size < 16) {
  console.error(JSON.stringify({ event: 'recovery_drill_failed', stage: 'backup_artifact' }));
  process.exit(1);
}

if (proveFailure) {
  const bogus = join(backupDir, `bogus-${Date.now()}.sql.gz`);
  writeFileSync(bogus, 'not-a-valid-gzip-backup');
  writeFileSync(`${bogus}.meta.json`, JSON.stringify({ sha256: 'deadbeef', outfile: bogus }, null, 2));
  const fail = runScript('db-restore.mjs', [bogus], {
    DATABASE_URL: swapDatabaseName(sourceUrl, drillDb),
    CONFIRM_RESTORE: 'yes',
  });
  if (fail.status === 0) {
    console.error(JSON.stringify({ event: 'recovery_drill_failed', stage: 'expected_restore_failure' }));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: 'recovery_drill_restore_failure_detected',
      status: fail.status,
    }),
  );
  try {
    unlinkSync(bogus);
    unlinkSync(`${bogus}.meta.json`);
  } catch {
    /* ignore */
  }
}

psqlAdmin(`DROP DATABASE IF EXISTS "${drillDb}"; CREATE DATABASE "${drillDb}";`);
const drillUrl = swapDatabaseName(sourceUrl, drillDb);

const restoreStartedAt = Date.now();
const restore = runScript('db-restore.mjs', [backupLine.outfile], {
  DATABASE_URL: drillUrl,
  CONFIRM_RESTORE: 'yes',
});
const restoreElapsedMs = Date.now() - restoreStartedAt;
if (restore.status !== 0) {
  console.error(
    JSON.stringify({
      event: 'recovery_drill_failed',
      stage: 'restore',
      restore_elapsed_ms: restoreElapsedMs,
      detail: (restore.stderr || restore.stdout || '').slice(0, 2000),
    }),
  );
  try {
    psqlAdmin(`DROP DATABASE IF EXISTS "${drillDb}";`);
  } catch {
    /* ignore */
  }
  process.exit(restore.status ?? 1);
}

const tableCount = Number(
  psqlDb(drillUrl, `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';`)[0] ??
    0,
);
const outboxExists = isTrue(
  psqlDb(drillUrl, `SELECT to_regclass('public.outbox_events') IS NOT NULL;`)[0],
);
const migrationsExist = isTrue(
  psqlDb(drillUrl, `SELECT to_regclass('public._prisma_migrations') IS NOT NULL;`)[0],
);

let restoredMarker = false;
if (markerOk) {
  try {
    restoredMarker = psqlDb(
      drillUrl,
      `SELECT iso3166_a2 FROM countries WHERE iso3166_a2 = 'Z9' LIMIT 1;`,
    ).includes('Z9');
  } catch {
    restoredMarker = false;
  }
}

if (tableCount < 10 || !outboxExists || !migrationsExist) {
  console.error(
    JSON.stringify({
      event: 'recovery_drill_failed',
      stage: 'verify',
      tableCount,
      outboxExists,
      migrationsExist,
    }),
  );
  process.exit(1);
}

if (markerOk && !restoredMarker) {
  console.error(JSON.stringify({ event: 'recovery_drill_failed', stage: 'marker_missing' }));
  process.exit(1);
}

const meta = existsSync(backupLine.metafile)
  ? JSON.parse(readFileSync(backupLine.metafile, 'utf8'))
  : null;

psqlAdmin(`DROP DATABASE IF EXISTS "${drillDb}";`);

if (!keepArtifacts) {
  try {
    unlinkSync(backupLine.outfile);
    if (backupLine.metafile) unlinkSync(backupLine.metafile);
  } catch {
    /* ignore */
  }
}

const evidence = {
  event: 'recovery_drill_complete',
  status: 'SANDBOX_VERIFIED',
  sprint: 74,
  source_database: parsed.database,
  drill_database: drillDb,
  table_count: tableCount,
  outbox_present: outboxExists,
  migrations_present: migrationsExist,
  marker_verified: markerOk ? restoredMarker : null,
  backup_sha256: meta?.sha256 ?? null,
  restore_elapsed_ms: restoreElapsedMs,
  total_elapsed_ms: Date.now() - drillStartedAt,
  rpo_target: process.env['OPS_RPO'] ?? '15m',
  rto_target: process.env['OPS_RTO'] ?? '4h',
  rpo_achievement: 'NOT_YET_PROVEN',
  rto_achievement: 'NOT_YET_PROVEN',
  production_pitr: 'EXTERNAL_GATED',
  object_recovery: 'EXTERNAL_GATED',
  note: 'Local logical dump/restore only. Cloud PITR remains EXTERNAL_GATED. Sandbox drill does not prove RPO/RTO.',
};
const evidencePath = join(evidenceDir, 'sandbox-restore-drill.json');
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
writeFileSync(join(backupDir, 's74-restore-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ ...evidence, evidence_path: evidencePath.replace(/\\/g, '/') }));
