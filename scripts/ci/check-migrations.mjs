#!/usr/bin/env node
/**
 * After `prisma migrate deploy`, fail if the live schema still differs
 * from schema.prisma (missing migration).
 */
import { spawnSync } from 'node:child_process';

const schema = 'packages/database/prisma/schema.prisma';
const url =
  process.env.DATABASE_URL ??
  'postgresql://worldpharma:worldpharma@127.0.0.1:5432/worldpharma';

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    url,
    '--to-schema-datamodel',
    schema,
    '--exit-code',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status === 2) {
  console.error('Database is missing migrations relative to schema.prisma.');
  process.exit(1);
}
if (result.status !== 0 && result.status !== null) {
  process.exit(result.status);
}
console.log('Applied migrations match schema.prisma.');
