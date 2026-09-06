/**
 * Sprint 90 — Production carrier / logistics configuration validation.
 * Never invent carriers, credentials, coverage, tracking events, or POD.
 * Never expose secret values — only reference_present / configured flags.
 */
import { isLiveCarrierEnabled, readLogisticsEnvironment } from './carrier.config';

export const CARRIER_PROVIDER_NOT_SELECTED = 'CARRIER_PROVIDER_NOT_SELECTED';
export const CARRIER_CREDENTIAL_REFERENCE_MISSING = 'CARRIER_CREDENTIAL_REFERENCE_MISSING';
export const CARRIER_WEBHOOK_CONFIGURATION_MISSING = 'CARRIER_WEBHOOK_CONFIGURATION_MISSING';
export const CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING = 'CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING';
export const CARRIER_MARKET_CONFIGURATION_MISSING = 'CARRIER_MARKET_CONFIGURATION_MISSING';
export const CARRIER_SERVICEABILITY_CONFIGURATION_MISSING =
  'CARRIER_SERVICEABILITY_CONFIGURATION_MISSING';
export const CARRIER_TRACKING_CONFIGURATION_MISSING = 'CARRIER_TRACKING_CONFIGURATION_MISSING';

export type CarrierConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type CarrierConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  webhook: 'READY' | 'MISSING';
  markets: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  serviceability: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  tracking: 'READY' | 'MISSING' | 'SANDBOX_VERIFIED';
  shipment_capability: 'SANDBOX_ONLY' | 'READY' | 'MISSING';
  pod_capability: 'DEVICE_NOT_AVAILABLE' | 'SANDBOX_ONLY' | 'READY' | 'MISSING';
  returns_rto: 'POLICY_REQUIRED' | 'READY' | 'MISSING' | 'EXTERNAL_GATED';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};

export type ProductionCarrierConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  credential_reference: CarrierConfigPresence;
  account_reference: CarrierConfigPresence;
  webhook_secret_reference: CarrierConfigPresence;
  webhook_configuration: CarrierConfigPresence;
  market_configuration: CarrierConfigPresence;
  serviceability_configuration: CarrierConfigPresence;
  tracking_configuration: CarrierConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  configuration_readiness: CarrierConfigurationReadiness;
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): CarrierConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

/**
 * Deterministic production carrier configuration validation.
 * Does not invent providers. Does not enable live carrier.
 */
export function validateProductionCarrierConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionCarrierConfigurationValidation {
  const env = readLogisticsEnvironment();
  const live = isLiveCarrierEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockAdapterRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference = presence('CARRIER_PRODUCTION_SECRET_REF');
  const account_reference = presence('CARRIER_ACCOUNT_REF');
  const webhook_secret_reference = presence('CARRIER_WEBHOOK_SECRET_REF');
  const webhook_configuration = presence('CARRIER_WEBHOOK_ENDPOINT_REF');
  const market_configuration = presence('CARRIER_PRODUCTION_COUNTRIES');
  const serviceability_configuration = presence('CARRIER_SERVICEABILITY_CONFIG_REF');
  const tracking_configuration = presence('CARRIER_TRACKING_CONFIG_REF');

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(CARRIER_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(CARRIER_CREDENTIAL_REFERENCE_MISSING);
  if (!webhook_secret_reference.reference_present) {
    blockers.push(CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING);
  }
  if (!webhook_configuration.reference_present) {
    blockers.push(CARRIER_WEBHOOK_CONFIGURATION_MISSING);
  }
  if (!market_configuration.reference_present) blockers.push(CARRIER_MARKET_CONFIGURATION_MISSING);
  if (!serviceability_configuration.reference_present) {
    blockers.push(CARRIER_SERVICEABILITY_CONFIGURATION_MISSING);
  }
  if (!tracking_configuration.reference_present) {
    blockers.push(CARRIER_TRACKING_CONFIGURATION_MISSING);
  }

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: CarrierConfigurationReadiness = {
    provider: providerName,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: missing(
      providerSelected &&
        credential_reference.reference_present &&
        account_reference.reference_present,
    ),
    webhook: missing(
      webhook_secret_reference.reference_present && webhook_configuration.reference_present,
    ),
    markets: market_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    serviceability: serviceability_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    tracking: tracking_configuration.reference_present ? 'READY' : 'SANDBOX_VERIFIED',
    shipment_capability: 'SANDBOX_ONLY',
    pod_capability: 'DEVICE_NOT_AVAILABLE',
    returns_rto: 'POLICY_REQUIRED',
    production_activation: 'EXTERNAL_GATED',
  };

  return {
    environment: env,
    live_enabled: live,
    provider_selected: providerSelected,
    provider_name: providerName,
    credential_reference,
    account_reference,
    webhook_secret_reference,
    webhook_configuration,
    market_configuration,
    serviceability_configuration,
    tracking_configuration,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    configuration_readiness,
    message: providerSelected
      ? 'Carrier adapter selected but production activation still requires verified vault refs + human gates.'
      : 'Carrier provider NOT_SELECTED — production configuration references missing. Sandbox MockCarrierAdapter remains available.',
  };
}
