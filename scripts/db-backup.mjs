#!/usr/bin/env node
/**
 * PostgreSQL logical backup for local/docker development.
 * Production PITR / managed backups remain an external infrastructure gate.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { parseDatabaseUrl, resolvePgBin, withPgEnv } from './pg-tools.mjs';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const environment = process.env['BACKUP_ENV'] ?? process.env['NODE_ENV'] ?? 'development';
const outDir = process.env['BACKUP_DIR'] ?? join(process.cwd(), 'var', 'backups');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, `worldpharma-${stamp}.sql.gz`);
const metafile = `${outfile}.meta.json`;

let pgDump;
try {
  pgDump = resolvePgBin('pg_dump');
} catch (err) {
  console.error(JSON.stringify({ event: 'db_backup_failed', error: err.message }));
  process.exit(1);
}

const parsed = parseDatabaseUrl(databaseUrl);
console.log(
  JSON.stringify({
    event: 'db_backup_start',
    outfile,
    environment,
    database: parsed.database,
    host: parsed.host,
  }),
);

const dump = spawnSync(
  pgDump,
  [
    '--no-owner',
    '--no-acl',
    '--format=plain',
    '--dbname',
    `postgresql://${parsed.user}@${parsed.host}:${parsed.port}/${parsed.database}`,
  ],
  {
    env: withPgEnv(parsed),
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
  },
);

if (dump.status !== 0) {
  console.error(
    JSON.stringify({
      event: 'db_backup_failed',
      status: dump.status,
      stderr: dump.stderr?.toString('utf8').slice(0, 2000) || null,
    }),
  );
  process.exit(dump.status ?? 1);
}

if (!dump.stdout || dump.stdout.length < 32) {
  console.error(JSON.stringify({ event: 'db_backup_failed', error: 'empty_dump' }));
  process.exit(1);
}

const gzip = createGzip();
const out = createWriteStream(outfile);
await pipeline(
  async function* () {
    yield dump.stdout;
  },
  gzip,
  out,
);

if (!existsSync(outfile) || statSync(outfile).size < 16) {
  console.error(JSON.stringify({ event: 'db_backup_failed', error: 'artifact_missing_or_tiny' }));
  process.exit(1);
}

const sha256 = createHash('sha256').update(readFileSync(outfile)).digest('hex');
const metadata = {
  event: 'db_backup_complete',
  outfile,
  metafile,
  environment,
  database: parsed.database,
  host: parsed.host,
  created_at: new Date().toISOString(),
  byte_size: statSync(outfile).size,
  sha256,
  tool: 'pg_dump',
  format: 'plain+gzip',
  note: 'Local logical dump only. Managed PITR is EXTERNAL_GATED.',
};
writeFileSync(metafile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(metadata));
