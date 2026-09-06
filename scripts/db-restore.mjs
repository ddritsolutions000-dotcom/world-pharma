#!/usr/bin/env node
/**
 * Restore PostgreSQL from a gzipped pg_dump produced by scripts/db-backup.mjs.
 * DESTRUCTIVE — drops and recreates the public schema before restore.
 * Fails non-zero if import or post-restore integrity checks fail.
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { parseDatabaseUrl, resolvePgBin, withPgEnv } from './pg-tools.mjs';

const databaseUrl = process.env['DATABASE_URL'];
const backupFile = process.argv[2];
if (!databaseUrl || !backupFile) {
  console.error('Usage: DATABASE_URL=... node scripts/db-restore.mjs <path-to-backup.sql.gz>');
  process.exit(1);
}

if (process.env['CONFIRM_RESTORE'] !== 'yes') {
  console.error('Set CONFIRM_RESTORE=yes to acknowledge destructive restore.');
  process.exit(1);
}

if (!existsSync(backupFile)) {
  console.error(JSON.stringify({ event: 'db_restore_failed', error: 'backup_missing', backupFile }));
  process.exit(1);
}

const metaPath = `${backupFile}.meta.json`;
if (existsSync(metaPath)) {
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (meta.sha256) {
      const actual = createHash('sha256').update(readFileSync(backupFile)).digest('hex');
      if (actual !== meta.sha256) {
        console.error(
          JSON.stringify({
            event: 'db_restore_failed',
            error: 'checksum_mismatch',
            expected: meta.sha256,
            actual,
          }),
        );
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'db_restore_failed', error: 'metadata_invalid', detail: err.message }),
    );
    process.exit(1);
  }
}

let psql;
try {
  psql = resolvePgBin('psql');
} catch (err) {
  console.error(JSON.stringify({ event: 'db_restore_failed', error: err.message }));
  process.exit(1);
}

const parsed = parseDatabaseUrl(databaseUrl);
console.log(
  JSON.stringify({
    event: 'db_restore_start',
    backupFile,
    database: parsed.database,
    host: parsed.host,
  }),
);

const drop = spawnSync(
  psql,
  [
    '--dbname',
    `postgresql://${parsed.user}@${parsed.host}:${parsed.port}/${parsed.database}`,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
  ],
  { env: withPgEnv(parsed), encoding: 'utf8' },
);
if (drop.status !== 0) {
  console.error(
    JSON.stringify({
      event: 'db_restore_failed',
      stage: 'drop_schema',
      stderr: drop.stderr?.slice(0, 2000) || null,
    }),
  );
  process.exit(drop.status ?? 1);
}

const child = spawn(
  psql,
  [
    '--dbname',
    `postgresql://${parsed.user}@${parsed.host}:${parsed.port}/${parsed.database}`,
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { env: withPgEnv(parsed), stdio: ['pipe', 'inherit', 'inherit'] },
);

/** pg_dump from newer clients may emit GUCs unknown to the restore server (e.g. PG16). */
function stripUnsupportedDumpSetCommands() {
  let carry = '';
  return new Transform({
    transform(chunk, _enc, cb) {
      const text = carry + chunk.toString('utf8');
      const parts = text.split('\n');
      carry = parts.pop() ?? '';
      const kept = parts.filter((line) => !/^\s*SET\s+transaction_timeout\b/i.test(line));
      cb(null, kept.join('\n') + (parts.length ? '\n' : ''));
    },
    flush(cb) {
      if (carry && !/^\s*SET\s+transaction_timeout\b/i.test(carry)) {
        this.push(carry);
      }
      cb();
    },
  });
}

try {
  await pipeline(createReadStream(backupFile), createGunzip(), stripUnsupportedDumpSetCommands(), child.stdin);
} catch (err) {
  console.error(JSON.stringify({ event: 'db_restore_failed', stage: 'import', error: err.message }));
  process.exit(1);
}

const code = await new Promise((resolve) => child.on('close', resolve));
if (code !== 0) {
  console.error(JSON.stringify({ event: 'db_restore_failed', stage: 'psql', status: code }));
  process.exit(code ?? 1);
}

const integrity = spawnSync(
  psql,
  [
    '--dbname',
    `postgresql://${parsed.user}@${parsed.host}:${parsed.port}/${parsed.database}`,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
     SELECT to_regclass('public._prisma_migrations') IS NOT NULL;
     SELECT to_regclass('public.outbox_events') IS NOT NULL;`,
  ],
  { env: withPgEnv(parsed), encoding: 'utf8' },
);

if (integrity.status !== 0) {
  console.error(
    JSON.stringify({
      event: 'db_restore_failed',
      stage: 'integrity',
      stderr: integrity.stderr?.slice(0, 2000) || null,
    }),
  );
  process.exit(integrity.status ?? 1);
}

const lines = integrity.stdout
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
const tableCount = Number(lines[0] ?? 0);
const hasMigrations = lines[1] === 't' || lines[1] === 'true' || lines[1] === '1';
const hasOutbox = lines[2] === 't' || lines[2] === 'true' || lines[2] === '1';

if (!Number.isFinite(tableCount) || tableCount < 10 || !hasMigrations || !hasOutbox) {
  console.error(
    JSON.stringify({
      event: 'db_restore_failed',
      stage: 'integrity_assert',
      tableCount,
      hasMigrations,
      hasOutbox,
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    event: 'db_restore_complete',
    backupFile,
    database: parsed.database,
    table_count: tableCount,
    has_prisma_migrations: hasMigrations,
    has_outbox_events: hasOutbox,
  }),
);
