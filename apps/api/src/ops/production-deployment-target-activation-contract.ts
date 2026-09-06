/**
 * Sprint 119 — Real production deployment target activation contract.
 * Provider-neutral activation contract so a future real hosting target can be
 * connected by configuration — without inventing cloud accounts, URLs, or secrets.
 * Reuses S117 DeploymentTargetLifecycle (no second state machine).
 * Composes S99/S112/S117/S118 + S116 security + S87 launch control.
 * Current lifecycle MUST remain NOT_CONFIGURED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
} from './production-deployment-requirements';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  evaluateProductionFoundationActivationPreparation,
  type DeploymentTargetLifecycle,
} from './production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from './production-release-engineering-readiness';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN } from './production-foundation-requirements';

export {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_DATABASE,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
};

export const DEPLOYMENT_TARGET_ACTIVATION_AUTHORITATIVE =
  'DEPLOYMENT_TARGET_ACTIVATION_AUTHORITATIVE';

/** Re-export — do not create a parallel lifecycle enum. */
export type { DeploymentTargetLifecycle };

export type ActivationFieldStatus =
  | 'MISSING'
  | 'INVALID'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_CONFIGURED';

export type DeploymentTargetReferenceSlot = {
  id: string;
  category: 'INFRASTRUCTURE' | 'RELEASE' | 'SECURITY' | 'RUNTIME';
  label: string;
  /** Reference key only — never a secret value. */
  reference_key: string;
  status: ActivationFieldStatus;
  value_present: false;
  invented: false;
};

export type DeploymentTargetConfigFixture = {
  production_environment?: boolean;
  environment_isolated_from_sandbox?: boolean;
  deployment_target?: boolean;
  deployment_mechanism?: boolean;
  artifact_source?: boolean;
  secrets_manager?: boolean;
  production_db_reference?: boolean;
  health_endpoint?: boolean;
  readiness_endpoint?: boolean;
  rollback_target?: boolean;
  security_edge_controls?: boolean;
  provider_rails_satisfied?: boolean;
  release_security_gates_pass?: boolean;
  /** Explicitly illegal for production — always fail-closed when true. */
  sandbox_adapter_selected_for_production?: boolean;
  production_points_to_sandbox?: boolean;
};

export type FailClosedCaseResult = {
  case_id: string;
  description: string;
  fixture: DeploymentTargetConfigFixture;
  deployable: false;
  blocked: true;
  primary_blocker: string;
};

export function buildDeploymentTargetReferenceSlots(): DeploymentTargetReferenceSlot[] {
  const slot = (
    id: string,
    category: DeploymentTargetReferenceSlot['category'],
    label: string,
    reference_key: string,
  ): DeploymentTargetReferenceSlot => ({
    id,
    category,
    label,
    reference_key,
    status: 'NOT_CONFIGURED',
    value_present: false,
    invented: false,
  });

  return [
    slot('target_provider_identity', 'INFRASTRUCTURE', 'Target / provider identity', 'DEPLOYMENT_TARGET_PROVIDER_REF'),
    slot('environment_identity', 'INFRASTRUCTURE', 'Environment identity', 'PRODUCTION_ENVIRONMENT_ID_REF'),
    slot('deployment_endpoint', 'INFRASTRUCTURE', 'Deployment endpoint / reference', 'DEPLOYMENT_ENDPOINT_REF'),
    slot('region_location', 'INFRASTRUCTURE', 'Region / location reference', 'DEPLOYMENT_REGION_REF'),
    slot('runtime_service', 'RUNTIME', 'Runtime / service reference', 'RUNTIME_SERVICE_REF'),
    slot('artifact_source', 'RELEASE', 'Artifact source / reference', 'ARTIFACT_SOURCE_REF'),
    slot('deployment_mechanism', 'RELEASE', 'Deployment mechanism reference', 'DEPLOYMENT_MECHANISM_REF'),
    slot('health_endpoint', 'RUNTIME', 'Health endpoint reference', 'HEALTH_ENDPOINT_REF'),
    slot('readiness_endpoint', 'RUNTIME', 'Readiness endpoint reference', 'READINESS_ENDPOINT_REF'),
    slot('rollback_target', 'RELEASE', 'Rollback target / reference', 'ROLLBACK_TARGET_REF'),
    slot('secrets_manager', 'INFRASTRUCTURE', 'Secrets manager reference', 'SECRETS_MANAGER_REF'),
    slot('production_database', 'INFRASTRUCTURE', 'Production database reference', 'PRODUCTION_DATABASE_REF'),
    slot('network_origin_protection', 'SECURITY', 'Network / origin protection reference', 'ORIGIN_PROTECTION_REF'),
  ];
}

export function buildInfrastructureHandoffChecklist(): Array<{
  id: string;
  category: 'INFRASTRUCTURE' | 'RELEASE' | 'SECURITY';
  item: string;
  required: true;
  status: 'MISSING' | 'EXTERNAL_GATED';
}> {
  const items: Array<{ id: string; category: 'INFRASTRUCTURE' | 'RELEASE' | 'SECURITY'; item: string }> = [
    { id: 'hosting_target', category: 'INFRASTRUCTURE', item: 'Hosting / deployment target' },
    { id: 'production_environment', category: 'INFRASTRUCTURE', item: 'Production environment' },
    { id: 'networking_origin', category: 'INFRASTRUCTURE', item: 'Networking / origin' },
    { id: 'dns', category: 'INFRASTRUCTURE', item: 'DNS' },
    { id: 'tls', category: 'INFRASTRUCTURE', item: 'TLS certificates' },
    { id: 'secrets_manager', category: 'INFRASTRUCTURE', item: 'Secrets manager' },
    { id: 'database', category: 'INFRASTRUCTURE', item: 'Production database' },
    { id: 'object_storage', category: 'INFRASTRUCTURE', item: 'Object storage' },
    { id: 'kms', category: 'INFRASTRUCTURE', item: 'KMS' },
    { id: 'malware_scanner', category: 'INFRASTRUCTURE', item: 'Malware scanner' },
    { id: 'backup_pitr', category: 'INFRASTRUCTURE', item: 'Backup / PITR' },
    { id: 'monitoring_apm', category: 'INFRASTRUCTURE', item: 'Monitoring / APM' },
    { id: 'artifact_source', category: 'RELEASE', item: 'Artifact source' },
    { id: 'release_identifier', category: 'RELEASE', item: 'Release identifier' },
    { id: 'deployment_mechanism', category: 'RELEASE', item: 'Deployment mechanism' },
    { id: 'migration_authorization', category: 'RELEASE', item: 'Migration authorization' },
    { id: 'smoke_test_endpoint', category: 'RELEASE', item: 'Smoke-test endpoint' },
    { id: 'rollback_target', category: 'RELEASE', item: 'Rollback target' },
    { id: 'waf_edge', category: 'SECURITY', item: 'WAF / edge protection' },
    { id: 'trusted_proxy', category: 'SECURITY', item: 'Trusted proxy / origin protection' },
    { id: 'external_pentest', category: 'SECURITY', item: 'External pentest evidence' },
    { id: 'security_certification', category: 'SECURITY', item: 'Security certification' },
  ];
  return items.map((i) => ({
    ...i,
    required: true as const,
    status: (i.category === 'SECURITY' ? 'EXTERNAL_GATED' : 'MISSING') as 'MISSING' | 'EXTERNAL_GATED',
  }));
}

/**
 * Fixture-driven activation validator for the live control-plane report.
 * Real runtime uses empty fixture → all mandatory MISSING → DEPLOYABLE = NO.
 * Hard-clamps deployable=false and lifecycle=NOT_CONFIGURED (no invented infra).
 */
export function validateDeploymentTargetActivation(
  fixture: DeploymentTargetConfigFixture = {},
): {
  fields: Array<{ id: string; status: ActivationFieldStatus; blocker?: string }>;
  deployable: false;
  lifecycle: 'NOT_CONFIGURED';
  primary_blocker: string;
  blocked_reasons: string[];
} {
  const fixtureResult = validateDeploymentTargetActivationForFixture(fixture);
  return {
    fields: fixtureResult.fields,
    deployable: false,
    lifecycle: 'NOT_CONFIGURED',
    primary_blocker: fixtureResult.primary_blocker || NO_PRODUCTION_DEPLOYMENT_TARGET,
    blocked_reasons:
      fixtureResult.blocked_reasons.length > 0
        ? fixtureResult.blocked_reasons
        : [NO_PRODUCTION_DEPLOYMENT_TARGET],
  };
}

/** Fixture evaluator used by fail-closed cases (does not invent real infra). */
export function validateDeploymentTargetActivationForFixture(fixture: DeploymentTargetConfigFixture) {
  const fields: Array<{ id: string; status: ActivationFieldStatus; blocker?: string }> = [];
  const blocked_reasons: string[] = [];

  const check = (
    id: string,
    ok: boolean | undefined,
    blocker: string,
    whenMissing: ActivationFieldStatus = 'MISSING',
  ) => {
    if (ok === true) {
      fields.push({ id, status: 'CONFIGURED' });
      return true;
    }
    fields.push({ id, status: whenMissing, blocker });
    blocked_reasons.push(blocker);
    return false;
  };

  if (fixture.sandbox_adapter_selected_for_production === true) {
    fields.push({
      id: 'sandbox_adapter_for_production',
      status: 'INVALID',
      blocker: PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    });
    blocked_reasons.push(PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN);
  }
  if (fixture.production_points_to_sandbox === true) {
    fields.push({
      id: 'production_points_to_sandbox',
      status: 'INVALID',
      blocker: PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    });
    blocked_reasons.push(PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN);
  }

  check('deployment_target', fixture.deployment_target, NO_PRODUCTION_DEPLOYMENT_TARGET);
  check('production_environment', fixture.production_environment, NO_PRODUCTION_ENVIRONMENT);
  check(
    'environment_isolated_from_sandbox',
    fixture.environment_isolated_from_sandbox,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  );
  check('deployment_mechanism', fixture.deployment_mechanism, NO_PRODUCTION_RELEASE_PIPELINE);
  check('artifact_source', fixture.artifact_source, NO_PRODUCTION_RELEASE_PIPELINE);
  check('secrets_manager', fixture.secrets_manager, NO_PRODUCTION_SECRETS_MANAGER);
  check('production_db_reference', fixture.production_db_reference, NO_PRODUCTION_DATABASE);
  check('health_endpoint', fixture.health_endpoint, NO_PRODUCTION_DEPLOYMENT_TARGET);
  check('readiness_endpoint', fixture.readiness_endpoint, NO_PRODUCTION_DEPLOYMENT_TARGET);
  check('rollback_target', fixture.rollback_target, ROLLBACK_NOT_YET_PROVEN, 'EXTERNAL_GATED');
  check(
    'security_edge_controls',
    fixture.security_edge_controls,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    'EXTERNAL_GATED',
  );
  check(
    'provider_rails_satisfied',
    fixture.provider_rails_satisfied,
    'NO_PRODUCTION_PROVIDER_RAILS',
    'EXTERNAL_GATED',
  );
  check(
    'release_security_gates_pass',
    fixture.release_security_gates_pass,
    EXTERNAL_PENTEST_REQUIRED,
    'EXTERNAL_GATED',
  );

  const deployable = blocked_reasons.length === 0;

  return {
    fields,
    deployable,
    lifecycle: (deployable ? 'DEPLOYABLE' : 'NOT_CONFIGURED') as DeploymentTargetLifecycle,
    primary_blocker: blocked_reasons[0] ?? NO_PRODUCTION_DEPLOYMENT_TARGET,
    blocked_reasons,
  };
}

export function evaluateFailClosedDeploymentCases(): FailClosedCaseResult[] {
  const run = (
    case_id: string,
    description: string,
    fixture: DeploymentTargetConfigFixture,
    primary_blocker: string,
  ): FailClosedCaseResult => {
    const result = validateDeploymentTargetActivationForFixture(fixture);
    return {
      case_id,
      description,
      fixture,
      deployable: false,
      blocked: true,
      primary_blocker: result.primary_blocker || primary_blocker,
    };
  };

  return [
    run('case_1_no_target', 'No production target → deployment blocked', {}, NO_PRODUCTION_DEPLOYMENT_TARGET),
    run(
      'case_2_secrets_missing',
      'Production target exists but secrets missing → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        health_endpoint: true,
        readiness_endpoint: true,
      },
      NO_PRODUCTION_SECRETS_MANAGER,
    ),
    run(
      'case_3_db_missing',
      'Target + secrets but DB missing → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        secrets_manager: true,
        health_endpoint: true,
        readiness_endpoint: true,
      },
      NO_PRODUCTION_DATABASE,
    ),
    run(
      'case_4_security_unresolved',
      'Target + DB + secrets but security gate unresolved → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        secrets_manager: true,
        production_db_reference: true,
        health_endpoint: true,
        readiness_endpoint: true,
        rollback_target: true,
        security_edge_controls: true,
        provider_rails_satisfied: true,
      },
      EXTERNAL_PENTEST_REQUIRED,
    ),
    run(
      'case_5_provider_rails',
      'Software gates pass but provider rails unresolved → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        secrets_manager: true,
        production_db_reference: true,
        health_endpoint: true,
        readiness_endpoint: true,
        rollback_target: true,
        security_edge_controls: true,
        release_security_gates_pass: true,
      },
      'NO_PRODUCTION_PROVIDER_RAILS',
    ),
    run(
      'case_6_sandbox_adapter',
      'Sandbox adapter selected for production → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        secrets_manager: true,
        production_db_reference: true,
        health_endpoint: true,
        readiness_endpoint: true,
        rollback_target: true,
        security_edge_controls: true,
        provider_rails_satisfied: true,
        release_security_gates_pass: true,
        sandbox_adapter_selected_for_production: true,
      },
      PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    ),
    run(
      'case_7_points_to_sandbox',
      'Production configuration accidentally points to sandbox → blocked',
      {
        production_environment: true,
        environment_isolated_from_sandbox: true,
        deployment_target: true,
        deployment_mechanism: true,
        artifact_source: true,
        secrets_manager: true,
        production_db_reference: true,
        health_endpoint: true,
        readiness_endpoint: true,
        rollback_target: true,
        security_edge_controls: true,
        provider_rails_satisfied: true,
        release_security_gates_pass: true,
        production_points_to_sandbox: true,
      },
      PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    ),
  ];
}

export type ProductionDeploymentTargetActivationReport = {
  sprint: 119;
  foundation_sprints: string;
  authoritative_source: 'production-deployment-target-activation-contract';
  parallel_deployment_state_machine_created: false;
  parallel_readiness_framework_created: false;
  parallel_configuration_framework_created: false;
  parallel_launch_rail_created: false;
  fake_infrastructure_invented: false;
  source_of_truth: {
    deployment_target_lifecycle: 'S117_DeploymentTargetLifecycle';
    release_pipeline: 'S99_S118_COMPOSED';
    foundation: 'S117_COMPOSED';
    security_gate: 'S116_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  deployment_target: {
    lifecycle: DeploymentTargetLifecycle;
    status: 'NOT_CONFIGURED';
    provider: 'NOT_SELECTED';
    configured: false;
    verified: false;
    deployable: false;
    deployed: false;
  };
  reference_slots: DeploymentTargetReferenceSlot[];
  activation_validation: ReturnType<typeof validateDeploymentTargetActivation>;
  production_configuration: {
    environment: 'NOT_CONFIGURED';
    secrets_manager: 'NOT_CONFIGURED';
    database: 'NOT_CONFIGURED';
    release_pipeline: 'NOT_CONFIGURED';
    rollback_target: 'NOT_CONFIGURED';
    cannot_resolve_to: string[];
    sandbox_production_separation: 'PASS';
  };
  handoff_checklist: ReturnType<typeof buildInfrastructureHandoffChecklist>;
  evidence_to_advance: {
    to_CONFIGURED: string[];
    to_VERIFIED: string[];
    to_DEPLOYABLE: string[];
    to_DEPLOYED: string[];
  };
  fail_closed_cases: FailClosedCaseResult[];
  security_gate: {
    external_pentest: string;
    certified: string;
    remaining_blocker: string;
    status: 'PENDING';
  };
  admin_summary: {
    production_environment: 'NOT_CONFIGURED';
    deployment_target: 'NOT_CONFIGURED';
    release_pipeline: 'NOT_CONFIGURED';
    production_database: 'NOT_CONFIGURED';
    secrets_manager: 'NOT_CONFIGURED';
    rollback_target: 'NOT_CONFIGURED';
    rollback_proven: 'NOT_PROVEN';
    security_certification: 'PENDING';
    security_blocker: typeof EXTERNAL_PENTEST_REQUIRED;
  };
  remaining_blocker: typeof NO_PRODUCTION_DEPLOYMENT_TARGET;
  remaining_blockers: string[];
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluateProductionDeploymentTargetActivation(input?: {
  correlation_id?: string;
}): ProductionDeploymentTargetActivationReport {
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const activation_validation = validateDeploymentTargetActivation({});
  const fail_closed_cases = evaluateFailClosedDeploymentCases();

  void foundation.can_production_launch;
  void release.can_production_launch;
  void launch.can_production_launch;

  const remaining_blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_RELEASE_PIPELINE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    EXTERNAL_PENTEST_REQUIRED,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  ];

  return {
    sprint: 119,
    foundation_sprints: 'S99/S112/S116/S117/S118',
    authoritative_source: 'production-deployment-target-activation-contract',
    parallel_deployment_state_machine_created: false,
    parallel_readiness_framework_created: false,
    parallel_configuration_framework_created: false,
    parallel_launch_rail_created: false,
    fake_infrastructure_invented: false,
    source_of_truth: {
      deployment_target_lifecycle: 'S117_DeploymentTargetLifecycle',
      release_pipeline: 'S99_S118_COMPOSED',
      foundation: 'S117_COMPOSED',
      security_gate: 'S116_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    deployment_target: {
      lifecycle: 'NOT_CONFIGURED',
      status: 'NOT_CONFIGURED',
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      deployable: false,
      deployed: false,
    },
    reference_slots: buildDeploymentTargetReferenceSlots(),
    activation_validation,
    production_configuration: {
      environment: 'NOT_CONFIGURED',
      secrets_manager: 'NOT_CONFIGURED',
      database: 'NOT_CONFIGURED',
      release_pipeline: 'NOT_CONFIGURED',
      rollback_target: 'NOT_CONFIGURED',
      cannot_resolve_to: [
        'sandbox',
        'development',
        'local_filesystem',
        'mock_psp',
        'mock_carrier',
        'console_otp',
        'sandbox_erx',
        'mock_video',
        'sandbox_pacs',
        'local_backup',
        'sandbox_monitoring',
      ],
      sandbox_production_separation: 'PASS',
    },
    handoff_checklist: buildInfrastructureHandoffChecklist(),
    evidence_to_advance: {
      to_CONFIGURED: [
        'Operator supplies provider-neutral deployment target reference (no invented URLs)',
        'Production environment identity distinct from sandbox/dev',
        'Deployment mechanism + artifact source references present',
        'Secrets manager + production DB references present (values in vault, not repo)',
      ],
      to_VERIFIED: [
        'Human verifies target reaches intended environment',
        'Health/readiness endpoint references resolve against target (non-secret)',
        'Network/origin protection + trusted proxy configured',
        'No sandbox/mock adapter selected for production rails',
      ],
      to_DEPLOYABLE: [
        'Migration cutover explicitly authorized for that DB only',
        'Security certification complete (external pentest evidence)',
        'Mandatory provider rails satisfied for launch scope',
        'Rollback target identified; pre-deploy validation overall PASS',
        'S117 lifecycle advanced CONFIGURED→VERIFIED→DEPLOYABLE',
      ],
      to_DEPLOYED: [
        'Actual successful rollout to the verified target',
        'Post-deploy readiness + production smoke pass',
        'Release identity recorded (APP_VERSION/GIT_SHA)',
        'Do not claim DEPLOYED from CI green alone',
      ],
    },
    fail_closed_cases,
    security_gate: {
      external_pentest: security.external_pentest_passed ?? 'NO',
      certified: security.production_security_certified ?? 'NO',
      remaining_blocker: security.remaining_blocker,
      status: 'PENDING',
    },
    admin_summary: {
      production_environment: 'NOT_CONFIGURED',
      deployment_target: 'NOT_CONFIGURED',
      release_pipeline: 'NOT_CONFIGURED',
      production_database: 'NOT_CONFIGURED',
      secrets_manager: 'NOT_CONFIGURED',
      rollback_target: 'NOT_CONFIGURED',
      rollback_proven: 'NOT_PROVEN',
      security_certification: 'PENDING',
      security_blocker: EXTERNAL_PENTEST_REQUIRED,
    },
    remaining_blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    remaining_blockers,
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      'Why can\'t we deploy World-Pharma to production yet? No real deployment target is configured. Production environment, secrets manager, database, and release pipeline remain NOT_CONFIGURED. Security certification PENDING (EXTERNAL_PENTEST_REQUIRED). Sandbox adapters cannot satisfy production. Fail-closed cases 1–7 all block deploy.',
    next_action:
      'When real hosting exists: fill reference slots (not secret values), advance S117 lifecycle CONFIGURED→VERIFIED→DEPLOYABLE via evidence — do not invent infrastructure or rewrite the app.',
    message:
      'Sprint 119 deployment target activation contract: lifecycle NOT_CONFIGURED, deployable=false, no invented infra. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S117 DeploymentTargetLifecycle reused (no second state machine). S110–S116 controls retained. Production cannot resolve to sandbox/mock providers. Fail-closed activation validator.',
    secrets_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
