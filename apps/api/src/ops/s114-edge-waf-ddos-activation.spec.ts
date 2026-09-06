/**
 * Sprint 114 — Edge / WAF / DDoS activation readiness contract.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DDOS_PROTECTION_NOT_PROVEN,
  EDGE_CONFIGURATION_REQUIRED,
  EDGE_PROVIDER_NOT_SELECTED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
  ORIGIN_PROTECTION_NOT_VERIFIED,
  TRUSTED_PROXY_CONFIGURATION_REQUIRED,
  buildEdgeArchitecture,
  buildWafPolicyCategories,
  evaluateEdgeWafDdosActivation,
} from './edge-waf-ddos-real-activation-first-onboarding';
import { evaluateApiAbuseHardening } from './api-abuse-hardening';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak } from './secret-redaction';

describe('S114 edge/WAF/DDoS activation contract', () => {
  it('reports Sprint 114 / no provider / launch NO', () => {
    const report = evaluateEdgeWafDdosActivation();
    expect(report.sprint).toBe(114);
    expect(report.edge_waf_provider_selected).toBe('NO');
    expect(report.production_waf_enabled).toBe('NO');
    expect(report.ddos_provider_selected).toBe('NO');
    expect(report.production_ddos_protection_enabled).toBe('NO');
    expect(report.trusted_proxy_configuration).toBe('VERIFIED');
    expect(report.client_ip_spoofing_protection).toBe('PASS');
    expect(report.host_forwarded_host_protection).toBe('PASS');
    expect(report.origin_protection).toBe('EXTERNAL_GATED');
    expect(report.redis_rate_limit).toBe('EXISTING_REUSED');
    expect(report.redis_rate_limit_integration).toBe('PASS');
    expect(report.parallel_rate_limit_framework_created).toBe(false);
    expect(report.parallel_waf_engine_created).toBe(false);
    expect(report.invented_edge_waf_ddos_vendor).toBe(false);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
        NO_PRODUCTION_EDGE_WAF,
        EDGE_PROVIDER_NOT_SELECTED,
        TRUSTED_PROXY_CONFIGURATION_REQUIRED,
        ORIGIN_PROTECTION_NOT_VERIFIED,
        DDOS_PROTECTION_NOT_PROVEN,
        EDGE_CONFIGURATION_REQUIRED,
      ]),
    );
    expect(report.security_statement).not.toMatch(/hack-proof|DDoS-proof|100% secure|WAF-protected/i);
    expect(report.secrets_printed).toBe(false);
  });

  it('exposes architecture, WAF categories EXTERNAL_GATED, and S114 fixes', () => {
    const report = evaluateEdgeWafDdosActivation();
    expect(buildEdgeArchitecture()).toEqual([
      'INTERNET',
      'EXTERNAL_EDGE_WAF',
      'LOAD_BALANCER_REVERSE_PROXY',
      'APPLICATION',
      'INTERNAL_SERVICES',
    ]);
    expect(buildWafPolicyCategories().every((c) => c.status === 'EXTERNAL_GATED')).toBe(true);
    expect(report.vulnerabilities_fixed.map((v) => v.id)).toEqual(
      expect.arrayContaining(['S114-FIX-1', 'S114-FIX-2']),
    );
    expect(report.ddos_dependencies.every((d) => d.status === 'EXTERNAL_GATED')).toBe(true);
  });
});

describe('S114 source + S113 regression', () => {
  it('discovery uses resolveClientIp; http-setup wires TRUSTED_PROXIES', () => {
    const discovery = fs.readFileSync(
      path.join(__dirname, '../discovery/discovery-customer.controller.ts'),
      'utf8',
    );
    const httpSetup = fs.readFileSync(path.join(__dirname, '../common/http-setup.ts'), 'utf8');
    expect(discovery).toMatch(/resolveClientIp/);
    expect(discovery).not.toMatch(/x-forwarded-for/i);
    expect(httpSetup).toMatch(/parseTrustedProxySetting/);
    expect(httpSetup).toMatch(/trust proxy/);
    expect(httpSetup).toMatch(/PUBLIC_API_HOSTS/);
  });

  it('reuses S113 RateLimitService surface (no second limiter)', () => {
    const abuse = evaluateApiAbuseHardening();
    expect(abuse.parallel_rate_limit_framework_created).toBe(false);
    expect(abuse.distributed_enforcement).toBe('REDIS_BACKED_SOFTWARE');
    const s114 = fs.readFileSync(
      path.join(__dirname, 'edge-waf-ddos-real-activation-first-onboarding.ts'),
      'utf8',
    );
    expect(s114).not.toMatch(/class\s+RateLimitService/);
    expect(s114).not.toMatch(/Cloudflare|Akamai|AWS WAF|Fastly/i);
  });
});

describe('S114 security + launch', () => {
  it('never leaks secrets and does not bypass S87', () => {
    expect(assertNoSecretLeak(JSON.stringify(evaluateEdgeWafDdosActivation()))).toBe(true);
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
  });

  it('no India hardcoding or invented WAF brands', () => {
    const blob = JSON.stringify(evaluateEdgeWafDdosActivation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@/);
    expect(blob).not.toMatch(/\bCloudflare\b|\bAkamai\b|\bAWS WAF\b|\bFastly\b/i);
  });
});
