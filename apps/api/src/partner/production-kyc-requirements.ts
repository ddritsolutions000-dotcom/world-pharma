/**
 * Sprint 94 — Production KYC/KYB configuration validation.
 * Never invent KYC providers, credentials, licenses, registries, or verification results.
 * Never expose secrets or PII — only reference_present / configured flags.
 */
import { readInfrastructureEnvironment } from '../ops/infra-environment';

export const KYC_PROVIDER_NOT_SELECTED = 'KYC_PROVIDER_NOT_SELECTED';
export const KYC_CREDENTIAL_REFERENCE_MISSING = 'KYC_CREDENTIAL_REFERENCE_MISSING';
export const KYC_API_ENDPOINT_REFERENCE_MISSING = 'KYC_API_ENDPOINT_REFERENCE_MISSING';
export const KYC_CALLBACK_CONFIGURATION_MISSING = 'KYC_CALLBACK_CONFIGURATION_MISSING';
export const KYC_MARKET_POLICY_CONFIGURATION_MISSING =
  'KYC_MARKET_POLICY_CONFIGURATION_MISSING';
export const KYC_PARTNER_TYPE_CONFIGURATION_MISSING =
  'KYC_PARTNER_TYPE_CONFIGURATION_MISSING';
export const KYC_STORAGE_KMS_DEPENDENCY_GATED = 'KYC_STORAGE_KMS_DEPENDENCY_GATED';
export const KYC_MALWARE_SCAN_DEPENDENCY_GATED = 'KYC_MALWARE_SCAN_DEPENDENCY_GATED';
export const KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING =
  'KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING';

export type KycConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type KycConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  credentials: 'READY' | 'MISSING';
  api_endpoint: 'READY' | 'MISSING';
  callback: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  markets: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  partner_types: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  verification_capability: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
  webhook: 'EXTERNAL_GATED' | 'READY' | 'NOT_APPLICABLE';
  storage: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED' | 'READY';
  kms: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED' | 'READY';
  malware_scanning: 'EXTERNAL_GATED' | 'MALWARE_SCAN_EXTERNAL_GATED' | 'READY';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};

export type ProductionKycConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  credential_reference: KycConfigPresence;
  api_endpoint_reference: KycConfigPresence;
  callback_configuration: KycConfigPresence;
  market_policy_configuration: KycConfigPresence;
  partner_type_configuration: KycConfigPresence;
  healthcare_registry_configuration: KycConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  pii_exposed: false;
  configuration_readiness: KycConfigurationReadiness;
  eligibility: {
    document_verified_equals_partner_approved: false;
    partner_approved_equals_production_enabled: false;
    sandbox_manual_review_equals_external_provider_verification: false;
    unscanned_document_equals_trusted: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): KycConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

function readKycLiveEnabled(): boolean {
  return process.env['KYC_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

export function validateProductionKycConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockProviderRegistered?: boolean;
}): ProductionKycConfigurationValidation {
  const env = readInfrastructureEnvironment();
  const live = readKycLiveEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockProviderRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference = presence('KYC_PROVIDER_SECRET_REF');
  const api_endpoint_reference = presence('KYC_API_ENDPOINT_REF');
  const callback_configuration = presence('KYC_CALLBACK_SECRET_REF');
  const market_policy_configuration = presence('KYC_MARKET_POLICY_CONFIG_REF');
  const partner_type_configuration = presence('KYC_PARTNER_TYPE_CONFIG_REF');
  const healthcare_registry_configuration = presence('KYC_HEALTHCARE_REGISTRY_CONFIG_REF');

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(KYC_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(KYC_CREDENTIAL_REFERENCE_MISSING);
  if (!api_endpoint_reference.reference_present) {
    blockers.push(KYC_API_ENDPOINT_REFERENCE_MISSING);
  }
  if (!callback_configuration.reference_present) {
    blockers.push(KYC_CALLBACK_CONFIGURATION_MISSING);
  }
  if (!market_policy_configuration.reference_present) {
    blockers.push(KYC_MARKET_POLICY_CONFIGURATION_MISSING);
  }
  if (!partner_type_configuration.reference_present) {
    blockers.push(KYC_PARTNER_TYPE_CONFIGURATION_MISSING);
  }
  if (!healthcare_registry_configuration.reference_present) {
    blockers.push(KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING);
  }
  blockers.push(KYC_STORAGE_KMS_DEPENDENCY_GATED);
  blockers.push(KYC_MALWARE_SCAN_DEPENDENCY_GATED);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: KycConfigurationReadiness = {
    provider: providerName,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: missing(
      providerSelected &&
        credential_reference.reference_present &&
        api_endpoint_reference.reference_present,
    ),
    credentials: missing(credential_reference.reference_present),
    api_endpoint: missing(api_endpoint_reference.reference_present),
    callback: missing(callback_configuration.reference_present),
    markets: market_policy_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    partner_types: partner_type_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    verification_capability: 'SANDBOX_ONLY',
    webhook: 'EXTERNAL_GATED',
    storage: 'PRIVATE_STORAGE_EXTERNAL_GATED',
    kms: 'KMS_EXTERNAL_GATED',
    malware_scanning: 'MALWARE_SCAN_EXTERNAL_GATED',
    production_activation: 'EXTERNAL_GATED',
  };

  return {
    environment: env,
    live_enabled: live,
    provider_selected: providerSelected,
    provider_name: providerName,
    credential_reference,
    api_endpoint_reference,
    callback_configuration,
    market_policy_configuration,
    partner_type_configuration,
    healthcare_registry_configuration,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    pii_exposed: false,
    configuration_readiness,
    eligibility: {
      document_verified_equals_partner_approved: false,
      partner_approved_equals_production_enabled: false,
      sandbox_manual_review_equals_external_provider_verification: false,
      unscanned_document_equals_trusted: false,
    },
    message: providerSelected
      ? 'KYC provider selected but production activation still requires verified vault refs + storage/KMS/malware + legal/registry gates.'
      : 'KYC/KYB provider NOT_SELECTED — production configuration references missing. Manual sandbox review is not external verification.',
  };
}
