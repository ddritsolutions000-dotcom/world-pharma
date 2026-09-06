/**
 * Sprint 113 — API abuse / rate-limit hardening contract.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
  buildAbuseProtectionClasses,
  evaluateApiAbuseHardening,
} from './api-abuse-hardening';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S113 API abuse hardening contract', () => {
  it('reports Sprint 113 / EXTERNAL_WAF required / launch NO', () => {
    const report = evaluateApiAbuseHardening();
    expect(report.sprint).toBe(113);
    expect(report.parallel_rate_limit_framework_created).toBe(false);
    expect(report.invented_waf_edge_vendor).toBe(false);
    expect(report.otp_abuse_protection).toBe('TESTED');
    expect(report.authentication_abuse_protection).toBe('TESTED');
    expect(report.webhook_protection).toBe('HARDENED');
    expect(report.public_api_protection).toBe('HARDENED');
    expect(report.admin_api_protection).toBe('HARDENED');
    expect(report.distributed_enforcement).toBe('REDIS_BACKED_SOFTWARE');
    expect(report.external_waf_edge_protection).toBe('EXTERNAL_GATED');
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
        NO_PRODUCTION_EDGE_WAF,
        DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
        API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.otp_printed).toBe(false);
    expect(report.security_statement).not.toMatch(/hack-proof|DDoS-proof|100% secure/i);
  });

  it('exposes protection classes and documents fixed vulns', () => {
    const report = evaluateApiAbuseHardening();
    expect(buildAbuseProtectionClasses().length).toBeGreaterThanOrEqual(6);
    expect(report.vulnerabilities_fixed.map((v) => v.id)).toEqual(
      expect.arrayContaining(['S113-FIX-1', 'S113-FIX-2', 'S113-FIX-3']),
    );
    expect(report.vulnerabilities_found.every((v) => v.status === 'FIXED')).toBe(true);
  });
});

describe('S113 rate-limit source regression', () => {
  it('retains carrier/video webhook + discovery + admin budgets', () => {
    const logistics = fs.readFileSync(
      path.join(__dirname, '../logistics/logistics.service.ts'),
      'utf8',
    );
    const video = fs.readFileSync(path.join(__dirname, '../clinical/video.service.ts'), 'utf8');
    const discovery = fs.readFileSync(
      path.join(__dirname, '../discovery/discovery-customer.controller.ts'),
      'utf8',
    );
    const crm = fs.readFileSync(path.join(__dirname, '../crm/customer360.service.ts'), 'utf8');
    const adminHealth = fs.readFileSync(
      path.join(__dirname, '../health/admin-health.service.ts'),
      'utf8',
    );
    expect(logistics).toMatch(/webhook:carrier:/);
    expect(video).toMatch(/webhook:video:/);
    expect(discovery).toMatch(/discovery:search:ip:/);
    expect(discovery).toMatch(/discovery:suggest:ip:/);
    expect(crm).toMatch(/admin:pii-reveal:/);
    expect(adminHealth).toMatch(/admin:break-glass:/);
  });
});

describe('S113 security + launch', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateApiAbuseHardening()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
  });

  it('no India hardcoding or invented WAF brands', () => {
    const blob = JSON.stringify(evaluateApiAbuseHardening());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@/);
    expect(blob).not.toMatch(/\bCloudflare\b|\bAkamai\b|\bAWS WAF\b|\bFastly\b/i);
  });
});
