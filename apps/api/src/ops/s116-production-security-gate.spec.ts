/**
 * Sprint 116 — Production security gate consolidation contract.
 */
import {
  EXTERNAL_PENTEST_REQUIRED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  SECURITY_CERTIFICATION_PENDING,
  SSRF_DNS_REBINDING_RESIDUAL_RISK,
  buildExternalPentestLifecycle,
  buildRequiredExternalEvidence,
  evaluateProductionSecurityGate,
} from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateApplicationSecurityHardening } from './application-security-hardening';
import { evaluateInputSecurityHardening } from './input-security-hardening';
import { assertNoSecretLeak } from './secret-redaction';

describe('S116 production security gate consolidation', () => {
  it('is authoritative compose / pentest SCOPE_READY / launch NO', () => {
    const report = evaluateProductionSecurityGate();
    expect(report.sprint).toBe(116);
    expect(report.authoritative_source).toBe('production-security-gate-consolidation');
    expect(report.parallel_security_framework_created).toBe(false);
    expect(report.parallel_launch_rail_created).toBe(false);
    expect(report.invented_pentest_result).toBe(false);
    expect(report.invented_security_vendor).toBe(false);
    expect(report.external_pentest_lifecycle).toBe('SCOPE_READY');
    expect(buildExternalPentestLifecycle()).toBe('SCOPE_READY');
    expect(report.external_pentest_required).toBe('YES');
    expect(report.external_pentest_passed).toBe('NO');
    expect(report.security_approved).toBe('NO');
    expect(report.production_security_certified).toBe('NO');
    expect(report.security_certification_pending).toBe('YES');
    expect(report.certification_gate.EXTERNAL_PENTEST_PASSED).toBe('NO');
    expect(report.certification_gate.PRODUCTION_SECURITY_CERTIFIED).toBe('NO');
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        EXTERNAL_PENTEST_REQUIRED,
        SECURITY_CERTIFICATION_PENDING,
        EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
        SSRF_DNS_REBINDING_RESIDUAL_RISK,
      ]),
    );
    expect(report.why_launch_blocked).toMatch(/EXTERNAL_PENTEST_REQUIRED/);
    expect(report.security_statement).not.toMatch(/hack-proof|100% secure|CERTIFIED=YES/i);
    expect(report.secrets_printed).toBe(false);
  });

  it('lists required evidence as MISSING and documents aliases', () => {
    const report = evaluateProductionSecurityGate();
    const evidence = buildRequiredExternalEvidence();
    expect(evidence.length).toBeGreaterThanOrEqual(7);
    expect(evidence.every((e) => e.status === 'MISSING')).toBe(true);
    expect(report.required_external_evidence.every((e) => e.status === 'MISSING')).toBe(true);
    expect(report.blocker_aliases_documented.length).toBeGreaterThanOrEqual(3);
    expect(report.residual_risks.some((r) => r.code === SSRF_DNS_REBINDING_RESIDUAL_RISK)).toBe(
      true,
    );
    expect(report.blockers.every((b) => b.why && b.required_evidence_or_action)).toBe(true);
  });

  it('sandbox cannot satisfy production (fail-closed)', () => {
    const report = evaluateProductionSecurityGate();
    expect(report.sandbox_production_fail_closed.overall).toBe('PASS');
    expect(report.sandbox_production_fail_closed.mock_psp_satisfies_production).toBe('NO');
    expect(report.sandbox_production_fail_closed.local_storage_satisfies_production).toBe('NO');
    expect(report.sandbox_production_fail_closed.sandbox_adapters_satisfy_production).toBe('NO');
    expect(report.composed_status.foundation_environment_enabled).toBe(false);
    expect(report.composed_status.foundation_real_env_configured).toBe('NO');
    expect(report.composed_status.edge_waf).toBe('NO');
  });
});

describe('S116 compose + launch regression', () => {
  it('composes S110/S115 and does not bypass S87', () => {
    expect(evaluateApplicationSecurityHardening().remaining_blocker).toBe(EXTERNAL_PENTEST_REQUIRED);
    expect(evaluateInputSecurityHardening().ssrf).toBe('TESTED');
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(evaluateProductionSecurityGate()))).toBe(true);
  });

  it('no India hardcoding or invented pentest vendors', () => {
    const blob = JSON.stringify(evaluateProductionSecurityGate());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|postgresql:\/\/[^:]+:[^@]+@/);
    expect(evaluateProductionSecurityGate().invented_pentest_result).toBe(false);
    expect(
      evaluateProductionSecurityGate().required_external_evidence.every((e) => e.status === 'MISSING'),
    ).toBe(true);
  });
});
