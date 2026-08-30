#!/usr/bin/env node
/**
 * Runs `pnpm audit --json` and fails on any GHSA not listed in
 * scripts/ci/known-advisories.json. Known items are printed, never hidden.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const allow = JSON.parse(readFileSync(join(root, 'scripts/ci/known-advisories.json'), 'utf8'));
const allowedIds = new Set(allow.map((item) => item.id));

const result = spawnSync('pnpm', ['audit', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const stdout = (result.stdout ?? '').replace(/^\uFEFF/, '');
let report;
try {
  report = JSON.parse(stdout);
} catch {
  console.error('pnpm audit did not return JSON.');
  console.error(stdout.slice(0, 500));
  console.error(result.stderr);
  process.exit(1);
}

const found = [];
const advisories = report.advisories ?? {};
for (const value of Object.values(advisories)) {
  if (!value || typeof value !== 'object') {
    continue;
  }
  const url = typeof value.url === 'string' ? value.url : '';
  const fromUrl = url.match(/GHSA-[0-9a-z-]+/i)?.[0];
  found.push({
    id: value.github_advisory_id ?? value.github_advisory_id ?? fromUrl ?? String(value.id ?? ''),
    module: value.module_name ?? value.module_name ?? value.moduleName,
    severity: value.severity,
    title: value.title,
  });
}

const unexpected = [];
for (const item of found) {
  if (item.id && allowedIds.has(item.id)) {
    const known = allow.find((entry) => entry.id === item.id);
    console.warn(
      `[known] ${item.id} ${item.module} (${item.severity}): ${known?.reason ?? item.title} blocker=${known?.release_blocker}`,
    );
    continue;
  }
  unexpected.push(item);
}

if (unexpected.length) {
  console.error('New dependency advisories (not in known-advisories.json):');
  for (const item of unexpected) {
    console.error(JSON.stringify(item, null, 2));
  }
  process.exit(1);
}

console.log(`Audit complete. Known GHSAs: ${allow.length}. Unexpected: 0.`);
