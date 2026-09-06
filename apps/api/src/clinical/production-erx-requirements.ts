/**
 * Sprint 91 — Production eRx configuration validation.
 * Never invent eRx providers, credentials, pharmacy IDs, or legal transmission.
 * Never expose secrets or PHI — only reference_present / configured flags.
 */
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';

export const ERX_PROVIDER_NOT_SELECTED = 'ERX_PROVIDER_NOT_SELECTED';
export const ERX_CREDENTIAL_REFERENCE_MISSING = 'ERX_CREDENTIAL_REFERENCE_MISSING';
export const ERX_NETWORK_ACCOUNT_REFERENCE_MISSING = 'ERX_NETWORK_ACCOUNT_REFERENCE_MISSING';
export const ERX_ENDPOINT_CONFIGURATION_MISSING = 'ERX_ENDPOINT_CONFIGURATION_MISSING';
export const ERX_CALLBACK_CONFIGURATION_MISSING = 'ERX_CALLBACK_CONFIGURATION_MISSING';
export const ERX_MARKET_LEGAL_CONFIGURATION_MISSING = 'ERX_MARKET_LEGAL_CONFIGURATION_MISSING';
export const ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING =
  'ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING';
export const ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING =
  'ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING';

export type ErxConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type ErxConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  credentials: 'READY' | 'MISSING';
  network_account: 'READY' | 'MISSING';
  endpoint: 'READY' | 'MISSING';
  callback: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  markets_legal: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  prescriber_readiness: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
  pharmacy_network: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
  transmission: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};

export type ProductionErxConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  credential_reference: ErxConfigPresence;
  network_account_reference: ErxConfigPresence;
  endpoint_configuration: ErxConfigPresence;
  callback_configuration: ErxConfigPresence;
  market_legal_configuration: ErxConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  phi_exposed: false;
  configuration_readiness: ErxConfigurationReadiness;
  eligibility: {
    doctor_document_verified_equals_clinical_approved: false;
    clinical_approved_equals_erx_production_enabled: false;
    pharmacy_verified_equals_erx_network_configured: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): ErxConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionErxConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionErxConfigurationValidation {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockAdapterRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference = presence('ERX_PROVIDER_SECRET_REF');
  const network_account_reference = presence('ERX_NETWORK_ACCOUNT_REF');
  const endpoint_configuration = presence('ERX_ENDPOINT_REF');
  const callback_configuration = presence('ERX_CALLBACK_SECRET_REF');
  const market_legal_configuration = presence('ERX_MARKET_LEGAL_CONFIG_REF');

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(ERX_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(ERX_CREDENTIAL_REFERENCE_MISSING);
  if (!network_account_reference.reference_present) {
    blockers.push(ERX_NETWORK_ACCOUNT_REFERENCE_MISSING);
  }
  if (!endpoint_configuration.reference_present) blockers.push(ERX_ENDPOINT_CONFIGURATION_MISSING);
  if (!callback_configuration.reference_present) blockers.push(ERX_CALLBACK_CONFIGURATION_MISSING);
  if (!market_legal_configuration.reference_present) {
    blockers.push(ERX_MARKET_LEGAL_CONFIGURATION_MISSING);
  }
  blockers.push(ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING);
  blockers.push(ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: ErxConfigurationReadiness = {
    provider: providerName,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: missing(
      providerSelected &&
        credential_reference.reference_present &&
        network_account_reference.reference_present &&
        endpoint_configuration.reference_present,
    ),
    credentials: missing(credential_reference.reference_present),
    network_account: missing(network_account_reference.reference_present),
    endpoint: missing(endpoint_configuration.reference_present),
    callback: missing(callback_configuration.reference_present),
    markets_legal: market_legal_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    prescriber_readiness: 'EXTERNAL_GATED',
    pharmacy_network: 'EXTERNAL_GATED',
    transmission: 'SANDBOX_ONLY',
    production_activation: 'EXTERNAL_GATED',
  };

  return {
    environment: env,
    live_enabled: live,
    provider_selected: providerSelected,
    provider_name: providerName,
    credential_reference,
    network_account_reference,
    endpoint_configuration,
    callback_configuration,
    market_legal_configuration,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    phi_exposed: false,
    configuration_readiness,
    eligibility: {
      doctor_document_verified_equals_clinical_approved: false,
      clinical_approved_equals_erx_production_enabled: false,
      pharmacy_verified_equals_erx_network_configured: false,
    },
    message: providerSelected
      ? 'eRx adapter selected but production activation still requires verified vault refs + legal/clinical gates.'
      : 'eRx provider NOT_SELECTED — production configuration references missing. Internal DRAFT/ISSUED records remain available; SandboxERxAdapter is not legal transmission.',
  };
}
