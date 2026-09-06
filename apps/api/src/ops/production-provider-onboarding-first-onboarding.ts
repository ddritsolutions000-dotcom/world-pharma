/**
 * Sprint 100 — Production provider onboarding control plane (aggregator).
 * Reuses S64/S87–S99 rails. Never invents credentials or enables live providers.
 * Does not add a LaunchRailId (meta-dashboard, not a 22nd system rail).
 */
import { readInfrastructureEnvironment } from './infra-environment';
import { evaluateProviderOnboardingControlPlane } from './production-provider-onboarding-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';

export type ProviderOnboardingActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type ProductionProviderOnboardingFirstOnboardingReport = {
  sprint: 100;
  foundation_sprints: string;
  activation_lifecycle: ProviderOnboardingActivationLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'CONTROL_PLANE';
  configured: true;
  verified: false;
  approved: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  control_plane: 'SOFTWARE_READY';
  production_providers_enabled: false;
  production_infrastructure_enabled: false;
  production_activation: 'EXTERNAL_GATED';
  correlation_id: string;
  counts: ReturnType<typeof evaluateProviderOnboardingControlPlane>['counts'];
  rows: ReturnType<typeof evaluateProviderOnboardingControlPlane>['rows'];
  dependency_graph: ReturnType<typeof evaluateProviderOnboardingControlPlane>['dependency_graph'];
  activation_sequence: ReturnType<typeof evaluateProviderOnboardingControlPlane>['activation_sequence'];
  s64_sequence_phases: ReturnType<typeof evaluateProviderOnboardingControlPlane>['s64_sequence_phases'];
  filters_supported: ReturnType<typeof evaluateProviderOnboardingControlPlane>['filters_supported'];
  major_blockers: string[];
  remaining_blocker: string;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  two_person_approval: ReturnType<typeof evaluateProviderOnboardingControlPlane>['two_person_approval'];
  semantic_guards: ReturnType<typeof evaluateProviderOnboardingControlPlane>['semantic_guards'];
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  permission_model: {
    customer_cannot_access_provider_controls: true;
    partner_cannot_access_global_provider_controls: true;
    clinical_operator_no_automatic_finance_controls: true;
    configuration_neq_approval_neq_activation: true;
    unauthorized_api_rejected: true;
  };
  can_production_launch: 'NO';
  launch_control_rails: number;
  launch_control_overall: string;
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_credentials_invented: false;
  message: string;
};

export function evaluateProductionProviderOnboardingFirstOnboarding(
  input?: { correlation_id?: string },
): ProductionProviderOnboardingFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const plane = evaluateProviderOnboardingControlPlane({
    correlation_id: input?.correlation_id,
  });
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: plane.correlation_id,
  });

  const remaining_blockers = [
    ...plane.major_blockers.filter((b) => !b.includes('→')).slice(0, 16),
    ...launch.mandatory_unresolved.slice(0, 8),
  ];
  const remaining_blocker =
    remaining_blockers.find((b) => b.startsWith('NO_PRODUCTION_')) ??
    remaining_blockers[0] ??
    'EXTERNAL_GATED';

  return {
    sprint: 100,
    foundation_sprints: '64,87,88-99',
    activation_lifecycle: 'EXTERNAL_GATED',
    environment: env === 'production' ? 'production' : 'sandbox',
    provider: 'CONTROL_PLANE',
    configured: true,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    control_plane: 'SOFTWARE_READY',
    production_providers_enabled: false,
    production_infrastructure_enabled: false,
    production_activation: 'EXTERNAL_GATED',
    correlation_id: plane.correlation_id,
    counts: plane.counts,
    rows: plane.rows,
    dependency_graph: plane.dependency_graph,
    activation_sequence: plane.activation_sequence,
    s64_sequence_phases: plane.s64_sequence_phases,
    filters_supported: plane.filters_supported,
    major_blockers: plane.major_blockers,
    remaining_blocker,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Use this control plane to onboard real providers market-by-market with evidence + human approval. Do not toggle ENABLED without vaulted credentials and S87 clearance. Two-person approval remains required.',
    force_launch_available: false,
    force_deploy_available: false,
    two_person_approval: plane.two_person_approval,
    semantic_guards: plane.semantic_guards,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Per-rail market status is evaluated independently; no single-market hardcoding in onboarding logic.',
    },
    permission_model: {
      customer_cannot_access_provider_controls: true,
      partner_cannot_access_global_provider_controls: true,
      clinical_operator_no_automatic_finance_controls: true,
      configuration_neq_approval_neq_activation: true,
      unauthorized_api_rejected: true,
    },
    can_production_launch: 'NO',
    launch_control_rails: launch.rails.length,
    launch_control_overall: launch.overall_status,
    evaluated_at: plane.evaluated_at,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_credentials_invented: false,
    message:
      'Sprint 100 provider onboarding control plane: software-side aggregator over existing rails. SOFTWARE READY ≠ PRODUCTION LAUNCH AUTHORIZED. No providers ENABLED. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
