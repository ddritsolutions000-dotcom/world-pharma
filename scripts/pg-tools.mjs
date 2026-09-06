#!/usr/bin/env node
/**
 * Resolve pg_dump / psql / createdb on PATH or common Windows PostgreSQL installs.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const WIN_CANDIDATES = [
  'C:\\Program Files\\PostgreSQL\\18\\bin',
  'C:\\Program Files\\PostgreSQL\\17\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  'C:\\Program Files\\PostgreSQL\\15\\bin',
  'C:\\Program Files\\PostgreSQL\\14\\bin',
  'C:\\Program Files\\PostgreSQL\\13\\bin',
];

function which(cmd) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

export function resolvePgBin(name) {
  const onPath = which(name) ?? which(`${name}.exe`);
  if (onPath && existsSync(onPath)) {
    return onPath;
  }
  if (process.platform === 'win32') {
    for (const dir of WIN_CANDIDATES) {
      const candidate = join(dir, `${name}.exe`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(
    `${name} not found on PATH. Install PostgreSQL client tools or add them to PATH.`,
  );
}

export function parseDatabaseUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  const database = decodeURIComponent(u.pathname.replace(/^\//, '')).split('?')[0];
  if (!database) {
    throw new Error('DATABASE_URL must include a database name');
  }
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    schema: u.searchParams.get('schema') ?? 'public',
  };
}

export function withPgEnv(parsed) {
  return {
    ...process.env,
    PGHOST: parsed.host,
    PGPORT: String(parsed.port),
    PGUSER: parsed.user,
    PGPASSWORD: parsed.password,
  };
}

export function adminDatabaseUrl(databaseUrl, adminDb = 'postgres') {
  const u = new URL(databaseUrl);
  u.pathname = `/${adminDb}`;
  return u.toString();
}

export function swapDatabaseName(databaseUrl, databaseName) {
  const u = new URL(databaseUrl);
  u.pathname = `/${databaseName}`;
  return u.toString();
}
