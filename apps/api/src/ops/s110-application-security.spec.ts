/**
 * Sprint 110 — Application security hardening contract
 * (authorization / IDOR / BOLA / tenant — no parallel auth framework).
 */
import {
  APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_PENTEST_REQUIRED,
  evaluateApplicationSecurityHardening,
  buildApplicationSecuritySurfaces,
} from './application-security-hardening';
import {
  assertSamePerson,
  forbidCrossObjectAccess,
  rejectClientTenantSpoof,
} from '../identity/object-authorization';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S110 application security hardening contract', () => {
  it('reports Sprint 110 / EXTERNAL_PENTEST_REQUIRED / launch NO', () => {
    const report = evaluateApplicationSecurityHardening();
    expect(report.sprint).toBe(110);
    expect(report.parallel_security_framework_created).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        EXTERNAL_PENTEST_REQUIRED,
        APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
      ]),
    );
    expect(report.control_plane).toBe('S100_REUSED');
    expect(report.foundation_plane).toBe('S101_REUSED');
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.security_statement).toMatch(/External penetration testing required/i);
    expect(report.security_statement).not.toMatch(/hack-proof|100% secure|cannot be hacked/i);
  });

  it('exposes surfaces and documents fixed vulns', () => {
    const report = evaluateApplicationSecurityHardening();
    expect(buildApplicationSecuritySurfaces().length).toBeGreaterThanOrEqual(12);
    expect(report.idor_bola).toBe('HARDENED');
    expect(report.logistics_authorization).toBe('HARDENED');
    expect(report.tenant_manipulation).toBe('HARDENED');
    expect(report.admin_privilege_isolation).toBe('PASS_WITH_EXISTING_CONTROLS');
    expect(report.vulnerabilities_fixed.map((v) => v.id)).toEqual(
      expect.arrayContaining(['S110-HARDEN-1', 'S110-FIX-1', 'S110-FIX-2']),
    );
    expect(report.vulnerabilities_found.every((v) => v.status === 'FIXED')).toBe(true);
    expect(report.architecture_reused).toEqual(
      expect.arrayContaining(['JwtAuthGuard', 'AudienceGuard', 'PermissionsGuard']),
    );
  });
});

describe('S110 object-authorization helpers', () => {
  it('assertSamePerson allows owner and denies foreign person', () => {
    expect(() => assertSamePerson('p1', 'p1')).not.toThrow();
    expect(() => assertSamePerson('p1', 'p2')).toThrow();
  });

  it('forbidCrossObjectAccess always denies', () => {
    expect(() => forbidCrossObjectAccess()).toThrow();
  });

  it('rejectClientTenantSpoof ignores empty claim and rejects foreign org', () => {
    expect(() => rejectClientTenantSpoof(undefined, ['org-a'])).not.toThrow();
    expect(() => rejectClientTenantSpoof('org-a', ['org-a'])).not.toThrow();
    expect(() => rejectClientTenantSpoof('org-evil', ['org-a'])).toThrow();
  });
});

describe('S110 security + launch integration', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateApplicationSecurityHardening()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
  });

  it('no hardcoded India-specific or invented vendor brands', () => {
    const blob = JSON.stringify(evaluateApplicationSecurityHardening());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@|BEGIN PRIVATE KEY/);
  });
});
