/**
 * Sprint 148 — Production security launch-gate final closure (unit).
 * No invented WAF/DDoS/pentest/certification; S110–S116 not rebuilt; secrets never printed.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';
import { evaluateSecretsManagerRuntimeResolver } from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import { evaluateDeploymentReleaseEngineeringProductionActivationPath } from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import { evaluateProductionDatabaseActivationPath } from './production-database-activation-path';
import { evaluateProductionManagedBackupPitrActivationPath } from './production-managed-backup-pitr-activation-path';
import {
  DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
  EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
  FORGED_SECURITY_STATE_REJECTED,
  NO_PRODUCTION_DDOS,
  NO_PRODUCTION_ORIGIN_SHIELD,
  NO_PRODUCTION_WAF,
  PRODUCTION_SECURITY_ENABLEMENT_BLOCKED,
  SECURITY_APPROVAL_REQUIRED,
  assertProductionSecurityEnablementAllowed,
  evaluateApiAbuseSurface,
  evaluateEdgeWafDdosSurface,
  evaluatePentestApprovalSurface,
  evaluateProductionSecurityLaunchGatePath,
  evaluateSecurityDomainStates,
  mapPentestEvidenceLifecycle,
  rejectForgedSecurityState,
} from './production-security-launch-gate-path';

describe('S148 production security launch-gate final closure', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
  });

  it('reports SOFTWARE_COMPLETE overall EVIDENCE_REQUIRED / not enabled / S110–S116 not rebuilt', () => {
    const report = evaluateProductionSecurityLaunchGatePath();
    expect(report.sprint).toBe(148);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.s110_s116_rebuilt).toBe(false);
    expect(report.parallel_security_framework_created).toBe(false);
    expect(report.overall_state).toBe('EVIDENCE_REQUIRED');
    expect(report.production_security_enabled).toBe(false);
    expect(report.invented_waf).toBe(false);
    expect(report.invented_ddos).toBe(false);
    expect(report.invented_pentest_result).toBe(false);
    expect(report.invented_security_certification).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(EXTERNAL_PENTEST_EVIDENCE_REQUIRED);
    expect(report.composed_foundations.s116).toBe('COMPOSED_NOT_REBUILT');
    expect(report.composed_foundations.s147).toBe('COMPOSED');
    expect(report.evidence_composition.duplicates_implementation).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('distinguishes SOFTWARE_COMPLETE / EXTERNAL_GATED / EVIDENCE_REQUIRED (not collapsed)', () => {
    const states = evaluateSecurityDomainStates();
    expect(states.application_authorization).toBe('SOFTWARE_COMPLETE');
    expect(states.distributed_rate_limiting).toBe('EXTERNAL_GATED');
    expect(states.waf_edge_protection).toBe('EXTERNAL_GATED');
    expect(states.external_pentest).toBe('EVIDENCE_REQUIRED');
    expect(states.production_security_enablement).toBe('EXTERNAL_GATED');
    expect(states.overall_gate).toBe('EVIDENCE_REQUIRED');
    expect(states.overall_gate).not.toBe('PRODUCTION_ENABLED');
    expect(states.overall_gate).not.toBe('APPROVED');
  });

  it('WAF / DDoS / origin remain EXTERNAL_GATED with explicit blockers', () => {
    const edge = evaluateEdgeWafDdosSurface();
    expect(edge.enabled).toBe(false);
    expect(edge.waf_provider).toBe('NOT_SELECTED');
    expect(edge.blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_WAF, NO_PRODUCTION_DDOS, NO_PRODUCTION_ORIGIN_SHIELD]),
    );
  });

  it('API abuse: SOFTWARE_COMPLETE ≠ PRODUCTION_DISTRIBUTED_ENFORCEMENT_EXTERNAL_GATED', () => {
    const abuse = evaluateApiAbuseSurface();
    expect(abuse.rate_limiting_contract).toBe('SOFTWARE_COMPLETE');
    expect(abuse.production_distributed_enforcement).toBe('EXTERNAL_GATED');
    expect(abuse.remaining_blocker).toBe(DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED);
  });

  it('pentest lifecycle accurate; never PASSED without evidence; approval pending', () => {
    expect(mapPentestEvidenceLifecycle()).toBe('SCOPE_READY');
    const pentest = evaluatePentestApprovalSurface();
    expect(pentest.lifecycle).toBe('SCOPE_READY');
    expect(pentest.evidence_status).toBe('EVIDENCE_REQUIRED');
    expect(pentest.passed).toBe(false);
    expect(pentest.approved).toBe(false);
    expect(pentest.fabricated_evidence).toBe(false);
    expect(pentest.remaining_blocker).toBe(EXTERNAL_PENTEST_EVIDENCE_REQUIRED);
    expect(pentest.approval_lifecycle).toBe('PENDING');
    expect(pentest.required_evidence_refs).toEqual(
      expect.arrayContaining(['pentest_report_reference', 'approval_signoff']),
    );
  });

  it('S142/S143 secrets + observability integration (no leakage)', () => {
    const report = evaluateProductionSecurityLaunchGatePath({ correlation_id: 'corr-s148' });
    expect(report.s142_snapshot.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.secrets_logging.secret_leakage).toBe(false);
    expect(report.secrets_logging.otp_leakage).toBe(false);
    expect(report.secrets_logging.phi_minimal_logging).toBe(true);
    expect(report.release_event_sample.secrets_printed).toBe(false);
    expect(report.release_event_sample.correlation_id).toBe('corr-s148');
  });

  it('S144–S147 integration; launch feed not loosened', () => {
    const report = evaluateProductionSecurityLaunchGatePath();
    expect(report.s144_snapshot.actually_deployed).toBe(false);
    expect(report.s145_snapshot.deployable).toBe(false);
    expect(report.s146_snapshot.enabled).toBe(false);
    expect(report.s147_snapshot.enabled).toBe(false);
    expect(report.launch_feed.can_production_launch).toBe('NO');
    expect(report.launch_feed.loosened).toBe(false);
    expect(report.launch_feed.force_launch_available).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_WAF,
        DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
        SECURITY_APPROVAL_REQUIRED,
      ]),
    );
  });

  it('fail-closed: forged security state + unauthorized enablement', () => {
    try {
      rejectForgedSecurityState({
        lifecycle: 'PRODUCTION_ENABLED',
        certified: true,
        pentest_passed: true,
        enabled: true,
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_SECURITY_STATE_REJECTED);
    }

    expect(() =>
      assertProductionSecurityEnablementAllowed('s148', {
        kind: 'client_browser',
        service_id: 'browser',
      }),
    ).toThrow(ProblemException);

    try {
      assertProductionSecurityEnablementAllowed('s148', {
        kind: 'server_service',
        service_id: 'security-controller',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_SECURITY_ENABLEMENT_BLOCKED);
    }
  });

  it('S116 + S110–S115 evidence composition retained', () => {
    const s116 = evaluateProductionSecurityGate();
    const s148 = evaluateProductionSecurityLaunchGatePath();
    expect(s116.external_pentest_passed).toBe('NO');
    expect(s116.security_approved).toBe('NO');
    expect(s148.s116_snapshot.external_pentest_passed).toBe('NO');
    expect(s148.s116_snapshot.production_security_certified).toBe('NO');
    expect(s148.application_authorization.state).toBe('SOFTWARE_COMPLETE');
    expect(s148.input_security.state).toBe('SOFTWARE_COMPLETE');
  });

  it('S142–S147 regression composition + redaction', () => {
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
    const s145 = evaluateProductionDeploymentTargetActivationPath();
    const s146 = evaluateProductionDatabaseActivationPath();
    const s147 = evaluateProductionManagedBackupPitrActivationPath();
    const s148 = evaluateProductionSecurityLaunchGatePath();
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s144.actually_deployed).toBe(false);
    expect(s145.deployable).toBe(false);
    expect(s146.enabled).toBe(false);
    expect(s147.enabled).toBe(false);
    expect(s148.can_production_launch).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(s148))).toBe(true);
  });
});
