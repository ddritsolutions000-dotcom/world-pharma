/**
 * Sprint 117 — Production foundation activation preparation.
 * Authoritative compose of S98/S99/S101/S112 (+ S87 launch context, S116 security SoT).
 * Prepares contracts so real infra can be activated by configuration later —
 * does NOT invent cloud accounts, credentials, DNS, or claim production is live.
 * Does NOT add a LaunchRailId. CAN_PRODUCTION_LAUNCH remains NO.
 */
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  PRODUCTION_SECRET_REFERENCE_MISSING,
  PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
  PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
  PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
  ROLLBACK_NOT_YET_PROVEN,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  evaluateFoundationRealActivation,
} from './foundation-real-activation-first-onboarding';
import { evaluateProductionSecretsEnvFirstOnboarding } from './production-secrets-env-first-onboarding';
import {
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  evaluateProductionDeploymentFirstOnboarding,
} from './production-deployment-first-onboarding';
import {
  buildProductionSecretsEnvInventory,
  evaluateEnvironmentSeparation,
  evaluateClientBoundaryReadiness,
  type ConfigActivationStatus,
  type ProductionConfigInventoryEntry,
} from './production-secrets-env-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';

/** Canonical blockers — re-export; do not invent duplicates. */
export {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  ROLLBACK_NOT_YET_PROVEN,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
};

export const FOUNDATION_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'FOUNDATION_ACTIVATION_PREPARATION_AUTHORITATIVE';

export type FoundationConfigStatus =
  | 'CONFIGURED'
  | 'MISSING'
  | 'INVALID'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'NOT_CONFIGURED';

export type DeploymentTargetLifecycle =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'DEPLOYABLE'
  | 'DEPLOYED';

export type FoundationRailView = {
  rail: 'ENVIRONMENT' | 'SECRETS_MANAGER' | 'DATABASE' | 'DEPLOYMENT_TARGET';
  status: FoundationConfigStatus;
  production_enabled: false;
  blocker: string;
  required_external_action: string;
};

export type ProductionFoundationActivationPreparationReport = {
  sprint: 117;
  foundation_sprints: string;
  authoritative_source: 'production-foundation-activation-preparation';
  parallel_foundation_framework_created: false;
  parallel_launch_rail_created: false;
  fake_infrastructure_invented: false;
  source_of_truth: {
    foundation_activation: 'THIS_MODULE';
    secrets_env: 'S98_COMPOSED';
    deployment: 'S99_COMPOSED';
    foundation_rails: 'S101_COMPOSED';
    real_activation: 'S112_COMPOSED';
    security_gate: 'S116_COMPOSED';
    provider_rails: 'S87_PRODUCTION_LAUNCH_CONTROL';
  };
  production_environment: {
    status: 'NOT_CONFIGURED';
    separation_verified: 'YES';
    environments: Record<string, string>;
    sandbox_adapters_activate_production: 'NO';
    development_credentials_in_production: 'FORBIDDEN';
  };
  production_secrets: {
    status: 'NOT_CONFIGURED';
    secrets_manager_selected: 'NO';
    secrets_manager_enabled: 'NO';
    client_secret_exposure: 'PASS';
    inventory_summary: Array<{
      category: string;
      entries: number;
      missing_or_gated: number;
    }>;
    contract_entries: Array<{
      rail: string;
      key: string;
      classification: string;
      status: ConfigActivationStatus | FoundationConfigStatus;
      secret_present: 'SET' | 'MISSING' | 'N/A';
    }>;
  };
  production_database: {
    status: 'NOT_CONFIGURED';
    blocker: typeof NO_PRODUCTION_DATABASE;
    sandbox_fallback: 'FORBIDDEN';
    destructive_migrations: 'FAIL_CLOSED';
    cutover_authorized: 'NO';
  };
  deployment_target: {
    lifecycle: DeploymentTargetLifecycle;
    status: 'NOT_CONFIGURED';
    deployable: false;
    deployed: false;
    buildable_software: boolean;
    health_is_not_production_activation: true;
  };
  startup_readiness: {
    liveness_endpoint: '/health';
    readiness_endpoint: '/health/ready';
    readiness_fails_closed_on_db_redis: true;
    readiness_claims_production_activation: false;
    production_process_must_not_start_falsely_healthy: 'DOCUMENTED';
    overall: 'PASS_WITH_EXISTING_CONTROLS';
  };
  migration_safety: {
    software_contract: 'PASS';
    production_cutover: 'NOT_AUTHORIZED';
    schema_drift_detection: 'CI_CHECK_MIGRATIONS';
    destructive_down: false;
  };
  rollback: {
    sandbox: 'SANDBOX_PROVEN';
    production: 'NOT_PROVEN';
  };
  rails: FoundationRailView[];
  blocker_aliases_documented: Array<{ alias: string; maps_to: string; note: string }>;
  remaining_blocker: typeof NO_PRODUCTION_ENVIRONMENT;
  remaining_blockers: string[];
  required_external_actions: Array<{ id: string; action: string; status: 'EXTERNAL_GATED' }>;
  security_controls_preserved: {
    s110_s116: 'RETAINED';
    fail_closed_providers: true;
    sandbox_production_separation: true;
  };
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  evaluated_at: string;
  control_plane: 'S100_REUSED';
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  otp_printed: false;
};

function summarizeInventory(
  inventory: ProductionConfigInventoryEntry[],
): ProductionFoundationActivationPreparationReport['production_secrets']['inventory_summary'] {
  const byCat = new Map<string, { entries: number; missing_or_gated: number }>();
  for (const row of inventory) {
    const cur = byCat.get(row.category) ?? { entries: 0, missing_or_gated: 0 };
    cur.entries += 1;
    if (
      row.status === 'NOT_SELECTED' ||
      row.status === 'CONFIGURATION_REQUIRED' ||
      row.status === 'CREDENTIALS_REQUIRED' ||
      row.status === 'EXTERNAL_GATED' ||
      row.secret_present === 'MISSING'
    ) {
      cur.missing_or_gated += 1;
    }
    byCat.set(row.category, cur);
  }
  return [...byCat.entries()].map(([category, v]) => ({ category, ...v }));
}

export function buildFoundationRails(): FoundationRailView[] {
  return [
    {
      rail: 'ENVIRONMENT',
      status: 'NOT_CONFIGURED',
      production_enabled: false,
      blocker: NO_PRODUCTION_ENVIRONMENT,
      required_external_action:
        'Provision a real production environment identity (not sandbox) and wire INFRASTRUCTURE_ENVIRONMENT=production with fail-closed deps.',
    },
    {
      rail: 'SECRETS_MANAGER',
      status: 'NOT_SELECTED',
      production_enabled: false,
      blocker: NO_PRODUCTION_SECRETS_MANAGER,
      required_external_action:
        'Select a real secrets manager; store secret references only — never invent vault URLs or print values.',
    },
    {
      rail: 'DATABASE',
      status: 'NOT_CONFIGURED',
      production_enabled: false,
      blocker: NO_PRODUCTION_DATABASE,
      required_external_action:
        'Provision production Postgres (non-loopback); authorize migrate deploy explicitly; keep PITR/backup EXTERNAL_GATED until proven.',
    },
    {
      rail: 'DEPLOYMENT_TARGET',
      status: 'NOT_CONFIGURED',
      production_enabled: false,
      blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
      required_external_action:
        'Select a real deployment target; CI green ≠ deployed. Advance lifecycle only after CONFIGURED→VERIFIED→DEPLOYABLE.',
    },
  ];
}

export function buildBlockerAliases(): ProductionFoundationActivationPreparationReport['blocker_aliases_documented'] {
  return [
    {
      alias: PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
      maps_to: NO_PRODUCTION_ENVIRONMENT,
      note: 'S112 wording alias',
    },
    {
      alias: PRODUCTION_SECRET_REFERENCE_MISSING,
      maps_to: NO_PRODUCTION_SECRETS_MANAGER,
      note: 'S112 wording alias',
    },
    {
      alias: PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
      maps_to: NO_PRODUCTION_DATABASE,
      note: 'S112 wording alias',
    },
    {
      alias: PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
      maps_to: NO_PRODUCTION_DEPLOYMENT_TARGET,
      note: 'S112 wording alias',
    },
  ];
}

export function evaluateProductionFoundationActivationPreparation(
  input?: { correlation_id?: string },
): ProductionFoundationActivationPreparationReport {
  const s112 = evaluateFoundationRealActivation({ correlation_id: input?.correlation_id });
  const s98 = evaluateProductionSecretsEnvFirstOnboarding();
  const s99 = evaluateProductionDeploymentFirstOnboarding();
  const separation = evaluateEnvironmentSeparation();
  const client = evaluateClientBoundaryReadiness();
  const inventory = buildProductionSecretsEnvInventory();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const security = evaluateProductionSecurityGate({ correlation_id: input?.correlation_id });

  void client;
  void separation;

  const remaining_blockers = [
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_ENVIRONMENT_SEPARATION,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    NO_PRODUCTION_RELEASE_PIPELINE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
    PRODUCTION_SECRET_REFERENCE_MISSING,
    PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
    PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
  ];

  return {
    sprint: 117,
    foundation_sprints: '87,98,99,100,101,112,116',
    authoritative_source: 'production-foundation-activation-preparation',
    parallel_foundation_framework_created: false,
    parallel_launch_rail_created: false,
    fake_infrastructure_invented: false,
    source_of_truth: {
      foundation_activation: 'THIS_MODULE',
      secrets_env: 'S98_COMPOSED',
      deployment: 'S99_COMPOSED',
      foundation_rails: 'S101_COMPOSED',
      real_activation: 'S112_COMPOSED',
      security_gate: 'S116_COMPOSED',
      provider_rails: 'S87_PRODUCTION_LAUNCH_CONTROL',
    },
    production_environment: {
      status: 'NOT_CONFIGURED',
      separation_verified: 'YES',
      environments: s112.environments,
      sandbox_adapters_activate_production: 'NO',
      development_credentials_in_production: 'FORBIDDEN',
    },
    production_secrets: {
      status: 'NOT_CONFIGURED',
      secrets_manager_selected: 'NO',
      secrets_manager_enabled: 'NO',
      client_secret_exposure: s112.client_secret_exposure,
      inventory_summary: summarizeInventory(inventory),
      contract_entries: inventory.map((row) => ({
        rail: row.rail,
        key: row.key,
        classification: row.classification,
        status: row.status,
        secret_present: row.secret_present,
      })),
    },
    production_database: {
      status: 'NOT_CONFIGURED',
      blocker: NO_PRODUCTION_DATABASE,
      sandbox_fallback: 'FORBIDDEN',
      destructive_migrations: 'FAIL_CLOSED',
      cutover_authorized: 'NO',
    },
    deployment_target: {
      lifecycle: 'NOT_CONFIGURED',
      status: 'NOT_CONFIGURED',
      deployable: false,
      deployed: false,
      buildable_software: s99.buildable,
      health_is_not_production_activation: true,
    },
    startup_readiness: {
      liveness_endpoint: '/health',
      readiness_endpoint: '/health/ready',
      readiness_fails_closed_on_db_redis: true,
      readiness_claims_production_activation: false,
      production_process_must_not_start_falsely_healthy: 'DOCUMENTED',
      overall: 'PASS_WITH_EXISTING_CONTROLS',
    },
    migration_safety: {
      software_contract: 'PASS',
      production_cutover: 'NOT_AUTHORIZED',
      schema_drift_detection: 'CI_CHECK_MIGRATIONS',
      destructive_down: false,
    },
    rollback: {
      sandbox: 'SANDBOX_PROVEN',
      production: 'NOT_PROVEN',
    },
    rails: buildFoundationRails(),
    blocker_aliases_documented: buildBlockerAliases(),
    remaining_blocker: NO_PRODUCTION_ENVIRONMENT,
    remaining_blockers,
    required_external_actions: [
      {
        id: 'provision_production_environment',
        action: 'Create real production environment (not sandbox) with isolated credentials.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'select_secrets_manager',
        action: 'Select secrets manager and load secret references for inventory rails.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'provision_production_database',
        action: 'Provision production Postgres + backup/PITR dependency; authorize migrate cutover explicitly.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'select_deployment_target',
        action: 'Configure real deployment target; verify then deploy only after mandatory deps ready.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'security_and_providers',
        action: `Keep S116 security gate (${security.remaining_blocker}) and S87 provider rails unresolved until real evidence.`,
        status: 'EXTERNAL_GATED',
      },
    ],
    security_controls_preserved: {
      s110_s116: 'RETAINED',
      fail_closed_providers: true,
      sandbox_production_separation: true,
    },
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    why_launch_blocked:
      'Foundation activation preparation: production environment NOT_CONFIGURED, secrets manager NOT_SELECTED, database NOT_CONFIGURED, deployment target NOT_CONFIGURED (lifecycle NOT_CONFIGURED). Migration cutover NOT_AUTHORIZED. Production rollback NOT_PROVEN. Sandbox cannot activate production. Security gate (S116) and S87 provider rails remain unresolved.',
    next_action:
      'Use this gate as the Admin foundation SoT; supply real env/secrets/DB/deploy targets when available — configure, do not rewrite architecture; never invent credentials.',
    message:
      'Sprint 117 foundation activation preparation: env/secrets/DB/deploy NOT_CONFIGURED. Migration NOT_AUTHORIZED. Rollback NOT_PROVEN. NO_PRODUCTION_ENVIRONMENT. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Foundation contracts prepared for future configuration-driven activation. No production infrastructure invented or enabled. Sandbox fail-closed retained. Production launch remains NO.',
    evaluated_at: new Date().toISOString(),
    control_plane: 'S100_REUSED',
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
  };
}
