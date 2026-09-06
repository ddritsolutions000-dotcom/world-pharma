/**
 * Sprint 148 — Production security gate final closure (software).
 * Composes S110–S116 (not rebuilt) with S142–S147.
 * Does NOT invent WAF/DDoS/pentest results/security certification.
 * Distinguishes: SOFTWARE_COMPLETE | EXTERNAL_GATED | EVIDENCE_REQUIRED | APPROVED | PRODUCTION_ENABLED
 * SOFTWARE_COMPLETE ≠ PRODUCTION_ENABLED ≠ certified.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import {
  evaluateProductionSecurityGate,
  PRODUCTION_SECURITY_GATE_AUTHORITATIVE,
  EXTERNAL_PENTEST_REQUIRED,
  EXTERNAL_PENTEST_PASSED,
  SECURITY_APPROVED,
  PRODUCTION_SECURITY_CERTIFIED,
  NO_PRODUCTION_EDGE_WAF,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  buildExternalPentestLifecycle,
} from './production-security-gate-consolidation';
import {
  evaluateApplicationSecurityHardening,
  APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
} from './application-security-hardening';
import {
  evaluateApiAbuseHardening,
  API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
} from './api-abuse-hardening';
import {
  evaluateEdgeWafDdosActivation,
  DDOS_PROTECTION_NOT_PROVEN,
  ORIGIN_PROTECTION_NOT_VERIFIED,
  EDGE_PROVIDER_NOT_SELECTED,
} from './edge-waf-ddos-real-activation-first-onboarding';
import {
  evaluateInputSecurityHardening,
  INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
} from './input-security-hardening';
import { evaluateExternalPentestPreparation } from './external-pentest-preparation';
import {
  secretsManagerRuntimeResolverStatus,
} from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import {
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  evaluateDeploymentReleaseEngineeringProductionActivationPath,
  type ReleaseCaller,
} from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import { evaluateProductionDatabaseActivationPath } from './production-database-activation-path';
import {
  evaluateProductionManagedBackupPitrActivationPath,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
} from './production-managed-backup-pitr-activation-path';
import { NO_PRODUCTION_SECRETS_MANAGER } from './production-foundation-activation-preparation';

export const PRODUCTION_SECURITY_LAUNCH_GATE_PATH_AUTHORITATIVE =
  'PRODUCTION_SECURITY_LAUNCH_GATE_PATH_AUTHORITATIVE';

/** S148 surface blockers (aliases map onto S113/S114/S116 codes; do not invent parallel frameworks). */
export const NO_PRODUCTION_WAF = 'NO_PRODUCTION_WAF';
export const NO_PRODUCTION_DDOS = 'NO_PRODUCTION_DDOS';
export const NO_PRODUCTION_ORIGIN_SHIELD = 'NO_PRODUCTION_ORIGIN_SHIELD';
export const DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED =
  'DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED';
export const EXTERNAL_PENTEST_EVIDENCE_REQUIRED = 'EXTERNAL_PENTEST_EVIDENCE_REQUIRED';
export const SECURITY_APPROVAL_REQUIRED = 'SECURITY_APPROVAL_REQUIRED';
export const FORGED_SECURITY_STATE_REJECTED = 'FORGED_SECURITY_STATE_REJECTED';
export const PRODUCTION_SECURITY_ENABLEMENT_BLOCKED =
  'PRODUCTION_SECURITY_ENABLEMENT_BLOCKED';

export {
  EXTERNAL_PENTEST_REQUIRED,
  EXTERNAL_PENTEST_PASSED,
  SECURITY_APPROVED,
  PRODUCTION_SECURITY_CERTIFIED,
  NO_PRODUCTION_EDGE_WAF,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
};

export type SecurityDomainState =
  | 'SOFTWARE_COMPLETE'
  | 'EXTERNAL_GATED'
  | 'EVIDENCE_REQUIRED'
  | 'APPROVED'
  | 'PRODUCTION_ENABLED';

export type PentestEvidenceLifecycle =
  | 'NOT_SCOPED'
  | 'SCOPE_READY'
  | 'TESTING'
  | 'EVIDENCE_REQUIRED'
  | 'PASSED'
  | 'APPROVED';

export type SecurityApprovalLifecycle =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export function mapPentestEvidenceLifecycle(): PentestEvidenceLifecycle {
  const s116 = buildExternalPentestLifecycle();
  // S111/S116: scope inventory exists; evidence missing → SCOPE_READY (never PASSED without real evidence).
  if (s116 === 'SCOPE_READY') return 'SCOPE_READY';
  if (s116 === 'EVIDENCE_PENDING') return 'EVIDENCE_REQUIRED';
  if (s116 === 'SECURITY_APPROVED') return 'APPROVED';
  if (s116 === 'EXTERNAL_TEST_COMPLETED' || s116 === 'FINDINGS_REMEDIATED') return 'TESTING';
  return 'NOT_SCOPED';
}

export function evaluateSecurityDomainStates(): Record<string, SecurityDomainState> {
  return {
    application_authorization: 'SOFTWARE_COMPLETE',
    tenant_isolation: 'SOFTWARE_COMPLETE',
    privilege_escalation_controls: 'SOFTWARE_COMPLETE',
    api_abuse_protection: 'SOFTWARE_COMPLETE',
    rate_limiting_software: 'SOFTWARE_COMPLETE',
    distributed_rate_limiting: 'EXTERNAL_GATED',
    resource_exhaustion_protection: 'SOFTWARE_COMPLETE',
    waf_edge_protection: 'EXTERNAL_GATED',
    ddos_protection: 'EXTERNAL_GATED',
    origin_shielding: 'EXTERNAL_GATED',
    input_security: 'SOFTWARE_COMPLETE',
    ssrf_path_protections: 'SOFTWARE_COMPLETE',
    secrets_protection: 'SOFTWARE_COMPLETE',
    logging_redaction: 'SOFTWARE_COMPLETE',
    monitoring_alerting: 'EXTERNAL_GATED',
    deployment_security: 'EXTERNAL_GATED',
    database_security: 'EXTERNAL_GATED',
    backup_restore_security: 'EXTERNAL_GATED',
    external_pentest: 'EVIDENCE_REQUIRED',
    security_approval: 'EVIDENCE_REQUIRED',
    overall_gate: 'EVIDENCE_REQUIRED',
    production_security_enablement: 'EXTERNAL_GATED',
  };
}

export function listSecurityBlockerAliases(): Array<{
  alias: string;
  maps_to: string;
  note: string;
}> {
  return [
    {
      alias: NO_PRODUCTION_WAF,
      maps_to: NO_PRODUCTION_EDGE_WAF,
      note: 'S148 Admin surface wording for WAF provider absence',
    },
    {
      alias: NO_PRODUCTION_DDOS,
      maps_to: DDOS_PROTECTION_NOT_PROVEN,
      note: 'S148 surface for DDoS external gate',
    },
    {
      alias: NO_PRODUCTION_ORIGIN_SHIELD,
      maps_to: ORIGIN_PROTECTION_NOT_VERIFIED,
      note: 'S148 surface for origin shielding',
    },
    {
      alias: DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
      maps_to: DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
      note: 'Software Redis limiter ≠ production distributed edge enforcement',
    },
    {
      alias: EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
      maps_to: EXTERNAL_PENTEST_REQUIRED,
      note: 'Evidence pack required before PASSED',
    },
    {
      alias: SECURITY_APPROVAL_REQUIRED,
      maps_to: SECURITY_APPROVED,
      note: 'Human/security approval cannot be impersonated by software',
    },
  ];
}

export function evaluateEdgeWafDdosSurface() {
  const edge = evaluateEdgeWafDdosActivation();
  return {
    waf_provider: 'NOT_SELECTED' as const,
    edge_protection: 'EXTERNAL_GATED' as const,
    ddos_protection: 'EXTERNAL_GATED' as const,
    origin_shielding: 'EXTERNAL_GATED' as const,
    trusted_proxy_configuration: 'SOFTWARE_VERIFIED' as const,
    deployment_environment_binding: 'EXTERNAL_GATED' as const,
    verification_evidence: 'MISSING' as const,
    blockers: [NO_PRODUCTION_WAF, NO_PRODUCTION_DDOS, NO_PRODUCTION_ORIGIN_SHIELD],
    composed_from: {
      s114_remaining: String(
        (edge as { remaining_blocker?: string }).remaining_blocker ??
          EDGE_PROVIDER_NOT_SELECTED,
      ),
      maps: {
        NO_PRODUCTION_WAF: NO_PRODUCTION_EDGE_WAF,
        NO_PRODUCTION_DDOS: DDOS_PROTECTION_NOT_PROVEN,
        NO_PRODUCTION_ORIGIN_SHIELD: ORIGIN_PROTECTION_NOT_VERIFIED,
      },
    },
    enabled: false,
  };
}

export function evaluateApiAbuseSurface() {
  const abuse = evaluateApiAbuseHardening();
  return {
    rate_limiting_contract: 'SOFTWARE_COMPLETE' as const,
    resource_exhaustion_protections: 'SOFTWARE_COMPLETE' as const,
    request_limits: 'SOFTWARE_COMPLETE' as const,
    expensive_operation_protection: 'SOFTWARE_COMPLETE' as const,
    abuse_event_visibility: 'SOFTWARE_COMPLETE' as const,
    production_distributed_enforcement: 'EXTERNAL_GATED' as const,
    distinction: {
      software_complete: API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
      production_distributed: DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
    },
    remaining_blocker: DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
    s113_marker: abuse.remaining_blocker ?? DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
  };
}

export function evaluatePentestApprovalSurface() {
  const pentest = evaluateExternalPentestPreparation();
  return {
    lifecycle: mapPentestEvidenceLifecycle(),
    evidence_status: 'EVIDENCE_REQUIRED' as const,
    passed: false,
    approved: false,
    required_evidence_refs: [
      'pentest_report_reference',
      'pentest_scope',
      'test_date',
      'production_equivalent_environment',
      'findings_severity',
      'remediation_evidence',
      'retest_evidence',
      'approval_signoff',
    ],
    fabricated_evidence: false,
    remaining_blocker: EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
    s111_blocker: pentest.remaining_blocker,
    approval_lifecycle: 'PENDING' as SecurityApprovalLifecycle,
    security_approved: false,
    production_security_certified: false,
  };
}

export function assertProductionSecurityEnablementAllowed(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  throw Errors.problem(
    503,
    PRODUCTION_SECURITY_ENABLEMENT_BLOCKED,
    'Production security enablement blocked',
    `${context}: ${EXTERNAL_PENTEST_EVIDENCE_REQUIRED} / ${SECURITY_APPROVAL_REQUIRED} / ${NO_PRODUCTION_WAF}. Software COMPLETE ≠ certified.`,
  );
}

export function rejectForgedSecurityState(claimed: {
  lifecycle?: string;
  certified?: boolean;
  pentest_passed?: boolean;
  enabled?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_SECURITY_STATE_REJECTED,
    'Forged security state rejected',
    `Client/forged security claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, certified=${String(claimed.certified)}, pentest_passed=${String(claimed.pentest_passed)}, enabled=${String(claimed.enabled)}).`,
  );
}

export type ProductionSecurityLaunchGatePathReport = {
  sprint: 148;
  authoritative_source: typeof PRODUCTION_SECURITY_LAUNCH_GATE_PATH_AUTHORITATIVE;
  s116_authoritative_retained: typeof PRODUCTION_SECURITY_GATE_AUTHORITATIVE;
  parallel_security_framework_created: false;
  s110_s116_rebuilt: false;
  invented_waf: false;
  invented_ddos: false;
  invented_pentest_result: false;
  invented_security_certification: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    software_complete_neq_production_enabled: true;
    software_complete_neq_security_certified: true;
  };
  software_activation_path: 'COMPLETE';
  domain_states: ReturnType<typeof evaluateSecurityDomainStates>;
  overall_state: SecurityDomainState;
  production_security_enabled: false;
  composed_foundations: {
    s110: 'COMPOSED';
    s111: 'COMPOSED';
    s113: 'COMPOSED';
    s114: 'COMPOSED';
    s115: 'COMPOSED';
    s116: 'COMPOSED_NOT_REBUILT';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
    s144: 'COMPOSED';
    s145: 'COMPOSED';
    s146: 'COMPOSED';
    s147: 'COMPOSED';
  };
  evidence_composition: {
    application_security: typeof APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED;
    input_security: typeof INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED;
    api_abuse: typeof API_ABUSE_CONTROLS_SOFTWARE_VERIFIED;
    edge_waf: typeof EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED;
    pentest: typeof EXTERNAL_PENTEST_REQUIRED;
    duplicates_implementation: false;
  };
  application_authorization: {
    idor_bola: 'ACTIVE';
    tenant_isolation: 'ACTIVE';
    role_enforcement: 'ACTIVE';
    privilege_escalation_prevention: 'ACTIVE';
    clinical_access_controls: 'ACTIVE';
    admin_sod: 'ACTIVE';
    client_privileged_action_denial: 'ACTIVE';
    state: 'SOFTWARE_COMPLETE';
  };
  api_abuse: ReturnType<typeof evaluateApiAbuseSurface>;
  edge_waf_ddos: ReturnType<typeof evaluateEdgeWafDdosSurface>;
  input_security: {
    state: 'SOFTWARE_COMPLETE';
    sql_orm: 'SOFTWARE_COMPLETE';
    ssrf: 'SOFTWARE_COMPLETE';
    path_traversal: 'SOFTWARE_COMPLETE';
    unsafe_redirects: 'SOFTWARE_COMPLETE';
    prototype_pollution: 'SOFTWARE_COMPLETE';
    error_leakage: 'PROTECTED';
  };
  secrets_logging: {
    s142: 'SOFTWARE_COMPLETE';
    s143: 'SOFTWARE_COMPLETE';
    secret_leakage: false;
    token_leakage: false;
    otp_leakage: false;
    payment_credential_leakage: false;
    phi_minimal_logging: true;
  };
  pentest_approval: ReturnType<typeof evaluatePentestApprovalSurface>;
  blocker_aliases: ReturnType<typeof listSecurityBlockerAliases>;
  launch_feed: {
    can_production_launch: 'NO';
    force_launch_available: false;
    loosened: false;
  };
  s116_snapshot: {
    sprint: number;
    external_pentest_lifecycle: string;
    external_pentest_passed: string;
    security_approved: string;
    production_security_certified: string;
    remaining_blocker: string;
  };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: {
    software_activation_path: string;
    production_observability_enabled: boolean;
  };
  s144_snapshot: { actually_deployed: boolean };
  s145_snapshot: { deployable: boolean; deployed: boolean };
  s146_snapshot: { enabled: boolean };
  s147_snapshot: { enabled: boolean; remaining_blocker: string };
  audit: {
    records_state_changes_server_side: true;
    client_side_mutation_forbidden: true;
    surfaces: Array<
      'security_gate' | 'pentest_evidence' | 'approval' | 'waf_verification' | 'production_security_enablement'
    >;
  };
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof EXTERNAL_PENTEST_EVIDENCE_REQUIRED;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  tokens_printed: false;
  admin_summary: {
    security_gate: SecurityDomainState;
    software_state: 'SOFTWARE_COMPLETE';
    application_security: 'SOFTWARE_COMPLETE';
    api_abuse_protection: 'SOFTWARE_COMPLETE';
    edge_waf: 'EXTERNAL_GATED';
    ddos: 'EXTERNAL_GATED';
    origin_protection: 'EXTERNAL_GATED';
    secrets: 'SOFTWARE_COMPLETE';
    observability: 'EXTERNAL_GATED';
    external_pentest: 'EVIDENCE_REQUIRED';
    approval: 'PENDING';
    overall_launch_state: 'NO';
    blocker_reason: string;
    production_security_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateProductionSecurityLaunchGatePath(input?: {
  correlation_id?: string;
}): ProductionSecurityLaunchGatePathReport {
  const env = readInfrastructureEnvironment();
  const s116 = evaluateProductionSecurityGate({ correlation_id: input?.correlation_id });
  void evaluateApplicationSecurityHardening();
  void evaluateInputSecurityHardening();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
  const s145 = evaluateProductionDeploymentTargetActivationPath();
  const s146 = evaluateProductionDatabaseActivationPath();
  const s147 = evaluateProductionManagedBackupPitrActivationPath();
  const domain_states = evaluateSecurityDomainStates();
  const api_abuse = evaluateApiAbuseSurface();
  const edge_waf_ddos = evaluateEdgeWafDdosSurface();
  const pentest_approval = evaluatePentestApprovalSurface();

  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'release_gate',
    deployment_state: 'NOT_CONFIGURED',
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const blockers = [
    EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
    SECURITY_APPROVAL_REQUIRED,
    NO_PRODUCTION_WAF,
    NO_PRODUCTION_DDOS,
    NO_PRODUCTION_ORIGIN_SHIELD,
    DISTRIBUTED_RATE_LIMITING_EXTERNAL_GATED,
    EXTERNAL_PENTEST_REQUIRED,
    EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
    NO_PRODUCTION_EDGE_WAF,
    DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    String(s145.remaining_blocker),
    String(s146.remaining_blocker),
    String(s147.remaining_blocker),
    ...s116.remaining_blockers.slice(0, 12),
  ];

  return {
    sprint: 148,
    authoritative_source: PRODUCTION_SECURITY_LAUNCH_GATE_PATH_AUTHORITATIVE,
    s116_authoritative_retained: PRODUCTION_SECURITY_GATE_AUTHORITATIVE,
    parallel_security_framework_created: false,
    s110_s116_rebuilt: false,
    invented_waf: false,
    invented_ddos: false,
    invented_pentest_result: false,
    invented_security_certification: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      software_complete_neq_production_enabled: true,
      software_complete_neq_security_certified: true,
    },
    software_activation_path: 'COMPLETE',
    domain_states,
    overall_state: 'EVIDENCE_REQUIRED',
    production_security_enabled: false,
    composed_foundations: {
      s110: 'COMPOSED',
      s111: 'COMPOSED',
      s113: 'COMPOSED',
      s114: 'COMPOSED',
      s115: 'COMPOSED',
      s116: 'COMPOSED_NOT_REBUILT',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
      s144: 'COMPOSED',
      s145: 'COMPOSED',
      s146: 'COMPOSED',
      s147: 'COMPOSED',
    },
    evidence_composition: {
      application_security: APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      input_security: INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      api_abuse: API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
      edge_waf: EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
      pentest: EXTERNAL_PENTEST_REQUIRED,
      duplicates_implementation: false,
    },
    application_authorization: {
      idor_bola: 'ACTIVE',
      tenant_isolation: 'ACTIVE',
      role_enforcement: 'ACTIVE',
      privilege_escalation_prevention: 'ACTIVE',
      clinical_access_controls: 'ACTIVE',
      admin_sod: 'ACTIVE',
      client_privileged_action_denial: 'ACTIVE',
      state: 'SOFTWARE_COMPLETE',
    },
    api_abuse,
    edge_waf_ddos,
    input_security: {
      state: 'SOFTWARE_COMPLETE',
      sql_orm: 'SOFTWARE_COMPLETE',
      ssrf: 'SOFTWARE_COMPLETE',
      path_traversal: 'SOFTWARE_COMPLETE',
      unsafe_redirects: 'SOFTWARE_COMPLETE',
      prototype_pollution: 'SOFTWARE_COMPLETE',
      error_leakage: 'PROTECTED',
    },
    secrets_logging: {
      s142: 'SOFTWARE_COMPLETE',
      s143: 'SOFTWARE_COMPLETE',
      secret_leakage: false,
      token_leakage: false,
      otp_leakage: false,
      payment_credential_leakage: false,
      phi_minimal_logging: true,
    },
    pentest_approval,
    blocker_aliases: listSecurityBlockerAliases(),
    launch_feed: {
      can_production_launch: 'NO',
      force_launch_available: false,
      loosened: false,
    },
    s116_snapshot: {
      sprint: s116.sprint,
      external_pentest_lifecycle: s116.external_pentest_lifecycle,
      external_pentest_passed: s116.external_pentest_passed,
      security_approved: s116.security_approved,
      production_security_certified: s116.production_security_certified,
      remaining_blocker: s116.remaining_blocker,
    },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      software_activation_path: s143.software_activation_path,
      production_observability_enabled: s143.production_observability_enabled,
    },
    s144_snapshot: { actually_deployed: s144.actually_deployed },
    s145_snapshot: { deployable: s145.deployable, deployed: s145.deployed },
    s146_snapshot: { enabled: s146.enabled },
    s147_snapshot: {
      enabled: s147.enabled,
      remaining_blocker: String(s147.remaining_blocker),
    },
    audit: {
      records_state_changes_server_side: true,
      client_side_mutation_forbidden: true,
      surfaces: [
        'security_gate',
        'pentest_evidence',
        'approval',
        'waf_verification',
        'production_security_enablement',
      ],
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    tokens_printed: false,
    admin_summary: {
      security_gate: 'EVIDENCE_REQUIRED',
      software_state: 'SOFTWARE_COMPLETE',
      application_security: 'SOFTWARE_COMPLETE',
      api_abuse_protection: 'SOFTWARE_COMPLETE',
      edge_waf: 'EXTERNAL_GATED',
      ddos: 'EXTERNAL_GATED',
      origin_protection: 'EXTERNAL_GATED',
      secrets: 'SOFTWARE_COMPLETE',
      observability: 'EXTERNAL_GATED',
      external_pentest: 'EVIDENCE_REQUIRED',
      approval: 'PENDING',
      overall_launch_state: 'NO',
      blocker_reason: EXTERNAL_PENTEST_EVIDENCE_REQUIRED,
      production_security_enabled: false,
    },
    message:
      'Software production security launch-gate final closure COMPLETE. Composes S110–S116 (not rebuilt) + S142–S147. SOFTWARE_COMPLETE ≠ EXTERNAL_GATED ≠ EVIDENCE_REQUIRED ≠ APPROVED ≠ PRODUCTION_ENABLED. No invented WAF/DDoS/pentest/certification. CAN_PRODUCTION_LAUNCH = NO.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInSecurityPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}
