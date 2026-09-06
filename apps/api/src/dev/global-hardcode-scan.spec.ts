import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../..');

const ALLOWLIST_PATHS = [
  'apps/api/src/dev/',
  'apps/api/src/dev/',
  'packages/database/prisma/migrations/',
  'apps/api/src/logistics/serviceability.ts',
  'apps/api/src/logistics/serviceability-zone.service.ts',
  'apps/api/src/care-plan/care-plan-catalog.ts',
  'apps/api/src/policy/',
  'apps/web-admin/src/working-country.ts',
  '.spec.',
  '.e2e.spec.',
  'india-policy',
  'uae-policy',
  'us-policy',
  'sandbox-policy',
  'market-policy',
];

const SUSPICIOUS_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'INR fallback', re: /['"]INR['"]/ },
  { label: 'India string', re: /['"]India['"]/ },
  { label: 'GST literal', re: /['"]GST['"]/ },
  { label: 'IST literal', re: /['"]IST['"]/ },
  { label: '122001 pincode', re: /122001/ },
  { label: 'isoAlpha2 IN default', re: /isoAlpha2\s*[=:]\s*['"]IN['"]/ },
  { label: 'country_code IN default', re: /country_code\s*[=:]\s*['"]IN['"]/ },
  { label: 'workingCountry IN', re: /workingCountry\([^)]*\)\s*\?\?\s*['"]IN['"]/ },
  { label: 'resolveMarketCountry IN', re: /resolveMarketCountry\([^)]*\)\s*\?\?\s*['"]IN['"]/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.nx') {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(rel: string): boolean {
  return ALLOWLIST_PATHS.some((part) => rel.includes(part.replace(/\\/g, '/')));
}

describe('global India hardcode scan', () => {
  const hits: Array<{ file: string; label: string; line: string }> = [];

  beforeAll(() => {
    const roots = [
      join(REPO_ROOT, 'apps/api/src'),
      join(REPO_ROOT, 'apps/web-admin/src'),
      join(REPO_ROOT, 'packages/shared/src'),
    ];
    for (const root of roots) {
      for (const file of walk(root)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
        if (isAllowlisted(rel)) {
          continue;
        }
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.re.test(line)) {
              hits.push({ file: `${rel}:${index + 1}`, label: pattern.label, line: line.trim() });
            }
          }
        });
      }
    }
  });

  it('has no accidental global India/INR defaults outside allowlisted policy/dev/test paths', () => {
    const accidental = hits.filter(
      (hit) =>
        !hit.file.includes('/dev/') &&
        !hit.file.includes('policy') &&
        !hit.file.includes('.spec.') &&
        !hit.file.includes('serviceability') &&
        hit.file !== 'apps/web-admin/src/working-country.ts',
    );
    expect(accidental).toEqual([]);
  });
});
