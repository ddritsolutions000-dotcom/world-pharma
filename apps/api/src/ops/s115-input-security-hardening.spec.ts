/**
 * Sprint 115 — Input security hardening contract + source regressions.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXTERNAL_PENTEST_REQUIRED,
  INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  buildInputSecuritySurfaces,
  evaluateInputSecurityHardening,
} from './input-security-hardening';
import { assertSafeObjectKey, resolveObjectPathUnderRoot } from '../partner/object-store';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S115 input security contract', () => {
  it('reports Sprint 115 / EXTERNAL_PENTEST required / launch NO', () => {
    const report = evaluateInputSecurityHardening();
    expect(report.sprint).toBe(115);
    expect(report.parallel_security_framework_created).toBe(false);
    expect(report.parallel_validation_system_created).toBe(false);
    expect(report.invented_security_vendor).toBe(false);
    expect(report.sql_orm_injection).toBe('TESTED');
    expect(report.nosql_injection).toBe('NOT_APPLICABLE');
    expect(report.command_injection).toBe('NOT_APPLICABLE');
    expect(report.ssrf).toBe('TESTED');
    expect(report.ssrf_private_network).toBe('TESTED');
    expect(report.ssrf_metadata_endpoint).toBe('TESTED');
    expect(report.path_traversal).toBe('TESTED');
    expect(report.archive_traversal).toBe('NOT_APPLICABLE');
    expect(report.unsafe_redirect).toBe('HARDENED');
    expect(report.prototype_pollution).toBe('HARDENED');
    expect(report.unsafe_deserialization).toBe('NOT_APPLICABLE');
    expect(report.sensitive_error_leakage).toBe('PROTECTED');
    expect(report.external_pentest).toBe('REQUIRED');
    expect(report.external_pentest_passed).toBe('NO');
    expect(report.production_security_certified).toBe('NO');
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        EXTERNAL_PENTEST_REQUIRED,
        INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      ]),
    );
    expect(report.security_statement).not.toMatch(
      /hack-proof|injection-proof|SSRF-proof|100% secure/i,
    );
    expect(report.secrets_printed).toBe(false);
  });

  it('exposes surfaces and documents fixes', () => {
    const report = evaluateInputSecurityHardening();
    expect(buildInputSecuritySurfaces().length).toBeGreaterThanOrEqual(10);
    expect(report.vulnerabilities_fixed.map((v) => v.id)).toEqual(
      expect.arrayContaining(['S115-FIX-1', 'S115-FIX-2', 'S115-FIX-3', 'S115-FIX-4']),
    );
    expect(report.vulnerabilities_found.every((v) => v.status === 'FIXED')).toBe(true);
  });
});

describe('S115 path + source regressions', () => {
  it('rejects traversal and escapes under object-store root', () => {
    expect(() => assertSafeObjectKey('../secret')).toThrow('invalid_object_key');
    expect(() => assertSafeObjectKey('/etc/passwd')).toThrow('invalid_object_key');
    expect(() => assertSafeObjectKey('C:\\windows')).toThrow('invalid_object_key');
    expect(() => assertSafeObjectKey('a%2e%2eb/x')).toThrow('invalid_object_key');
    const root = path.join(process.cwd(), 'var', 'private-objects-test-s115');
    expect(() => resolveObjectPathUnderRoot(root, '../secret')).toThrow('invalid_object_key');
    expect(resolveObjectPathUnderRoot(root, 'kyc/abc')).toContain('kyc');
  });

  it('admin uses safeInternalPath; vendor assets use url-safety; no second ValidationPipe framework', () => {
    const adminAuth = fs.readFileSync(
      path.join(__dirname, '../../../web-admin/src/admin-enterprise-auth.tsx'),
      'utf8',
    );
    const vendor = fs.readFileSync(
      path.join(__dirname, '../catalog/vendor.controller.ts'),
      'utf8',
    );
    const inputMod = fs.readFileSync(
      path.join(__dirname, 'input-security-hardening.ts'),
      'utf8',
    );
    expect(adminAuth).toMatch(/safeInternalPath/);
    expect(vendor).toMatch(/isSafeExternalHttpUrl/);
    expect(inputMod).not.toMatch(/class\s+InputSecurityFramework/);
    expect(inputMod).not.toMatch(/hack-proof|injection-proof|SSRF-proof/i);
  });
});

describe('S115 security + launch', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateInputSecurityHardening()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
  });

  it('no India hardcoding or invented vendors', () => {
    const blob = JSON.stringify(evaluateInputSecurityHardening());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@/);
  });
});
