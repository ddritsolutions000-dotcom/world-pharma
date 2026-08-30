const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const {
  applyTestIsolation,
  toAdminUrl,
  testDatabaseName,
} = require('./isolate-runtime.cjs');

function loadDotenv() {
  try {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../.env'), 'utf8');
    for (const line of src.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq < 1) {
        continue;
      }
      const key = trimmed.slice(0, eq);
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // CI supplies env.
  }
}

module.exports = async function globalSetup() {
  loadDotenv();
  applyTestIsolation();
  const testUrl = process.env.DATABASE_URL;
  const adminUrl = toAdminUrl(testUrl);
  const dbName = testDatabaseName(testUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const found = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`,
    );
    if (!Array.isArray(found) || found.length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
  const root = path.resolve(__dirname, '../../../..');
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'packages/database/prisma/schema.prisma'],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: 'inherit',
    },
  );
};
