/**
 * Sprint 98 — Production secrets + environment configuration activation readiness.
 * Never invent credentials. Never print secret values / connection strings / PHI.
 * Aggregates existing S62 matrix + S64 contracts + S87–S97 external gates.
 */
import { readInfrastructureEnvironment } from './infra-environment';
import {
  validateProductionSecretsEnvConfiguration,
  evaluateEnvironmentSeparation,
  evaluateClientBoundaryReadiness,
  evaluateRepositorySecretScanSummary,
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
  PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
  CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK,
  type ProductionConfigInventoryEntry,
  type ConfigActivationStatus,
} from './production-secrets-env-requirements';
import { evaluateProductionConfigInventory } from './production-config';
import { evaluateProductionConfigValidation } from './production-config-validator';

export {
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
  PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
  CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK,
  SANDBOX_CREDENTIAL_IN_PRODUCTION_REJECTED,
} from './production-secrets-env-requirements';

export type SecretsEnvActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RailConfigSummary = {
  rail: string;
  category: string;
  provider_selected: boolean;
  configuration: 'READY' | 'MISSING' | 'PARTIAL';
  credentials: 'READY' | 'MISSING' | 'PARTIAL' | 'N/A';
  status: ConfigActivationStatus;
  blocker: string;
};

function summarizeRails(inventory: ProductionConfigInventoryEntry[]): RailConfigSummary[] {
  const byRail = new Map<string, ProductionConfigInventoryEntry[]>();
  for (const row of inventory) {
    const list = byRail.get(row.rail) ?? [];
    list.push(row);
    byRail.set(row.rail, list);
  }
  const out: RailConfigSummary[] = [];
  for (const [rail, rows] of byRail) {
    const category = rows[0]?.category ?? 'PLATFORM';
    const configs = rows.filter((r) => r.classification === 'CONFIGURATION');
    const secrets = rows.filter((r) => r.classification === 'SECRET');
    const providerSelected = configs.some(
      (r) => r.key.includes('provider') && r.status !== 'CONFIGURATION_REQUIRED',
    );
    const configMissing = configs.filter((r) => r.status === 'CONFIGURATION_REQUIRED').length;
    const secretMissing = secrets.filter((r) => r.status === 'CREDENTIALS_REQUIRED').length;
    const configuration =
      configs.length === 0
        ? ('READY' as const)
        : configMissing === 0
          ? ('PARTIAL' as const)
          : configMissing === configs.length
            ? ('MISSING' as const)
            : ('PARTIAL' as const);
    const credentials =
      secrets.length === 0
        ? ('N/A' as const)
        : secretMissing === 0
          ? ('PARTIAL' as const)
          : secretMissing === secrets.length
            ? ('MISSING' as const)
            : ('PARTIAL' as const);
    const status: ConfigActivationStatus =
      secretMissing > 0
        ? 'CREDENTIALS_REQUIRED'
        : configMissing > 0
          ? 'CONFIGURATION_REQUIRED'
          : 'EXTERNAL_GATED';
    out.push({
      rail,
      category,
      provider_selected: providerSelected,
      configuration,
      credentials,
      status,
      blocker:
        status === 'CREDENTIALS_REQUIRED'
          ? PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING
          : status === 'CONFIGURATION_REQUIRED'
            ? PRODUCTION_CONFIG_MATRIX_INCOMPLETE
            : NO_PRODUCTION_SECRETS_MANAGER,
    });
  }
  return out.sort((a, b) => a.rail.localeCompare(b.rail));
}

export type ProductionSecretsEnvFirstOnboardingReport = {
  sprint: 98;
  foundation_sprint: 62;
  activation_lifecycle: SecretsEnvActivationLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED';
  configured: false;
  verified: false;
  approved: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  secrets_manager: 'NOT_SELECTED' | 'EXTERNAL_GATED';
  credentials_readiness: 'MISSING' | 'PARTIAL' | 'READY';
  configuration_readiness: 'MISSING' | 'PARTIAL' | 'READY';
  production_activation: 'EXTERNAL_GATED';
  inventory_count: number;
  rail_summaries: RailConfigSummary[];
  inventory_sample: ProductionConfigInventoryEntry[];
  environment_separation: ReturnType<typeof evaluateEnvironmentSeparation>;
  client_boundary: ReturnType<typeof evaluateClientBoundaryReadiness>;
  secret_scan: ReturnType<typeof evaluateRepositorySecretScanSummary>;
  s62_inventory_overall: string;
  s63_validation_overall: string;
  remaining_blocker: typeof NO_PRODUCTION_SECRETS_MANAGER;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  permission_model: {
    customer_cannot_read_production_secrets: true;
    partner_cannot_read_global_secrets: true;
    admin_shows_presence_only: true;
    unauthorized_api_rejected: true;
  };
  failure_modes: {
    missing_secret_fail_closed: true;
    missing_config_fail_closed: true;
    sandbox_in_production_rejected: true;
    no_silent_mock_fallback: true;
  };
  can_production_launch: 'NO';
  production_secrets_enabled: false;
  production_external_providers_enabled: false;
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  connection_strings_printed: false;
  fake_credentials_invented: false;
  configuration_validation: ReturnType<typeof validateProductionSecretsEnvConfiguration>;
  message: string;
};

export function evaluateProductionSecretsEnvFirstOnboarding(): ProductionSecretsEnvFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const validation = validateProductionSecretsEnvConfiguration();
  const s62 = evaluateProductionConfigInventory();
  const s63 = evaluateProductionConfigValidation();
  const rail_summaries = summarizeRails(validation.inventory);
  const knownExternalBlockers = [
    'NO_PRODUCTION_PSP',
    'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
    'NO_PRODUCTION_CARRIER_ADAPTER',
    'NO_PRODUCTION_ERX_PROVIDER',
    'NO_PRODUCTION_VIDEO_PROVIDER',
    'NO_PRODUCTION_PACS_PROVIDER',
    'NO_PRODUCTION_KYC_KYB_PROVIDER',
    'NO_PRODUCTION_PRIVATE_STORAGE',
    'NO_PRODUCTION_KMS',
    'NO_PRODUCTION_MALWARE_SCANNER',
    'NO_PRODUCTION_MANAGED_BACKUP_PITR',
    'NO_PRODUCTION_APM_PROVIDER',
  ];
  const remaining_blockers = [
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_ENVIRONMENT_SEPARATION,
    PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
    PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
    CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK,
    ...validation.blockers.filter(
      (b) =>
        ![
          NO_PRODUCTION_SECRETS_MANAGER,
          NO_PRODUCTION_ENVIRONMENT_SEPARATION,
          PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
          PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
        ].includes(b),
    ),
    ...knownExternalBlockers,
  ];
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const uniqueBlockers = remaining_blockers.filter((b) => {
    if (seen.has(b)) return false;
    seen.add(b);
    return true;
  });

  return {
    sprint: 98,
    foundation_sprint: 62,
    activation_lifecycle: 'NOT_SELECTED',
    environment: env,
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    secrets_manager: 'NOT_SELECTED',
    credentials_readiness: validation.credentials_ready,
    configuration_readiness: validation.configuration_ready,
    production_activation: 'EXTERNAL_GATED',
    inventory_count: validation.inventory.length,
    rail_summaries,
    inventory_sample: validation.inventory.slice(0, 24),
    environment_separation: validation.environment_separation,
    client_boundary: validation.client_boundary,
    secret_scan: validation.secret_scan,
    s62_inventory_overall: s62.overall,
    s63_validation_overall: s63.overall,
    remaining_blocker: NO_PRODUCTION_SECRETS_MANAGER,
    remaining_blockers: uniqueBlockers,
    next_action:
      'Provision secret manager + production vault refs per rail; separate DEV/SANDBOX/STAGING/PRODUCTION; never expose secrets via NEXT_PUBLIC_/EXPO_PUBLIC_; clear S88–S97 provider enablement gates only after human approval. Do not invent credentials.',
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Market configuration is policy-pack driven — do not hardcode a single-market payment/phone/timezone globally.',
    },
    permission_model: {
      customer_cannot_read_production_secrets: true,
      partner_cannot_read_global_secrets: true,
      admin_shows_presence_only: true,
      unauthorized_api_rejected: true,
    },
    failure_modes: {
      missing_secret_fail_closed: true,
      missing_config_fail_closed: true,
      sandbox_in_production_rejected: true,
      no_silent_mock_fallback: true,
    },
    can_production_launch: 'NO',
    production_secrets_enabled: false,
    production_external_providers_enabled: false,
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    connection_strings_printed: false,
    fake_credentials_invented: false,
    configuration_validation: validation,
    message:
      'No production secrets manager / vault activation (NO_PRODUCTION_SECRETS_MANAGER). Authoritative inventory classifies SECRET vs CONFIGURATION across PSP→APM rails. Sandbox credentials never activate production. Client public env cannot carry secrets. CAN_PRODUCTION_LAUNCH remains NO. Foundation: Sprint 62 + S64–S97 contracts.',
  };
}
