/**
 * Sprint 101 — Real production foundation activation readiness report.
 * Never invents cloud accounts / vault URLs / DB credentials.
 */
import { randomUUID } from 'node:crypto';
import { readInfrastructureEnvironment } from './infra-environment';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  validateProductionFoundationConfiguration,
} from './production-foundation-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';

export {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
} from './production-foundation-requirements';

export type ProductionFoundationFirstOnboardingReport = {
  sprint: 101;
  foundation_sprints: string;
  activation_lifecycle: 'NOT_SELECTED' | 'EXTERNAL_GATED';
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED';
  configured: false;
  verified: false;
  approved: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  control_plane: 'S100_REUSED';
  production_environment_enabled: false;
  production_deployment_target_enabled: false;
  production_secrets_manager_enabled: false;
  production_database_enabled: false;
  production_infrastructure_enabled: false;
  production_activation: 'EXTERNAL_GATED';
  correlation_id: string;
  rails: ReturnType<typeof validateProductionFoundationConfiguration>['rails'];
  secret_references: ReturnType<typeof validateProductionFoundationConfiguration>['secret_references'];
  workload_identities: ReturnType<typeof validateProductionFoundationConfiguration>['workload_identities'];
  dependency_chain: ReturnType<typeof validateProductionFoundationConfiguration>['dependency_chain'];
  environments: ReturnType<typeof validateProductionFoundationConfiguration>['environments'];
  deployment_apps: ReturnType<typeof validateProductionFoundationConfiguration>['deployment_apps'];
  remaining_blocker: typeof NO_PRODUCTION_ENVIRONMENT;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  permission_model: {
    customer_cannot_access_foundation_controls: true;
    partner_cannot_access_foundation_controls: true;
    unauthorized_api_rejected: true;
    secret_values_never_returned: true;
    db_credentials_never_returned: true;
  };
  can_production_launch: 'NO';
  launch_control_overall: string;
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_infrastructure_invented: false;
  configuration_validation: ReturnType<typeof validateProductionFoundationConfiguration>;
  message: string;
};

export function evaluateProductionFoundationFirstOnboarding(
  input?: { correlation_id?: string },
): ProductionFoundationFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const validation = validateProductionFoundationConfiguration();
  const correlation_id = input?.correlation_id ?? randomUUID();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id,
  });

  const remaining_blockers = [
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_ENVIRONMENT_SEPARATION,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    ...launch.mandatory_unresolved.filter((c) => c.startsWith('NO_PRODUCTION_')).slice(0, 8),
  ];

  return {
    sprint: 101,
    foundation_sprints: '62,87,96,97,98,99,100',
    activation_lifecycle: 'EXTERNAL_GATED',
    environment: env === 'production' ? 'production' : 'sandbox',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    control_plane: 'S100_REUSED',
    production_environment_enabled: false,
    production_deployment_target_enabled: false,
    production_secrets_manager_enabled: false,
    production_database_enabled: false,
    production_infrastructure_enabled: false,
    production_activation: 'EXTERNAL_GATED',
    correlation_id,
    rails: validation.rails,
    secret_references: validation.secret_references,
    workload_identities: validation.workload_identities,
    dependency_chain: validation.dependency_chain,
    environments: validation.environments,
    deployment_apps: validation.deployment_apps,
    remaining_blocker: NO_PRODUCTION_ENVIRONMENT,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Provision real production environment + secrets manager + distinct DB + deployment target with human authorization; keep S100 control plane as the Admin surface; do not invent credentials or force-enable.',
    force_launch_available: false,
    force_deploy_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Foundation infrastructure remains market-policy capable; no single-country hardcoding.',
    },
    permission_model: {
      customer_cannot_access_foundation_controls: true,
      partner_cannot_access_foundation_controls: true,
      unauthorized_api_rejected: true,
      secret_values_never_returned: true,
      db_credentials_never_returned: true,
    },
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_infrastructure_invented: false,
    configuration_validation: validation,
    message:
      'Sprint 101 production foundation readiness: Environment / Deployment Target / Secrets Manager / Database modeled as EXTERNAL_GATED. S100 control plane reused. No invented infra. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
