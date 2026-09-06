import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isValidPermissionCode, permissionsForCompanyRole } from './authority';

const REPO_ROOT = join(__dirname, '../../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) {
      continue;
    }
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function extractRequirePermissions(source: string): string[] {
  const found: string[] = [];
  const re = /@RequirePermissions\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    found.push(match[1]);
  }
  return found;
}

function extractPermissionLiterals(source: string): string[] {
  const found: string[] = [];
  const re = /permissions\.includes\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    found.push(match[1]);
  }
  return found;
}

describe('RBAC repository scan', () => {
  const apiRoot = join(REPO_ROOT, 'apps/api/src');
  const webRoot = join(REPO_ROOT, 'apps/web-admin/src');
  const files = [...walk(apiRoot), ...walk(webRoot)];

  const backendPermissions = new Map<string, string[]>();
  const frontendPermissions = new Map<string, string[]>();

  beforeAll(() => {
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      const src = readFileSync(file, 'utf8');
      for (const perm of extractRequirePermissions(src)) {
        const list = backendPermissions.get(perm) ?? [];
        list.push(rel);
        backendPermissions.set(perm, list);
      }
      const relNorm = rel.replace(/\\/g, '/');
      if (relNorm.startsWith('apps/web-admin')) {
        for (const perm of extractPermissionLiterals(src)) {
          const list = frontendPermissions.get(perm) ?? [];
          list.push(rel);
          frontendPermissions.set(perm, list);
        }
      }
    }
  });

  it('every @RequirePermissions code is catalog-valid', () => {
    const invalid = [...backendPermissions.keys()].filter((code) => !isValidPermissionCode(code));
    expect(invalid).toEqual([]);
  });

  it('every frontend permission gate is catalog-valid', () => {
    const invalid = [...frontendPermissions.keys()].filter((code) => !isValidPermissionCode(code));
    expect(invalid).toEqual([]);
  });

  it('company-only permissions are not granted to org_owner by default', () => {
    const orgPerms = new Set(permissionsForCompanyRole('org_owner', []));
    const companyOnly = [
      'rbac:grant_company',
      'security:break_glass',
      'policy:publish',
      'payment:admin',
      'finance:admin',
      'lab:review',
    ];
    for (const code of companyOnly) {
      expect(orgPerms.has(code)).toBe(false);
    }
  });

  it('reports permission usage counts for audit', () => {
    expect(backendPermissions.size).toBeGreaterThan(20);
    expect(frontendPermissions.size).toBeGreaterThan(5);
  });
});
