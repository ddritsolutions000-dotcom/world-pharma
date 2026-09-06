/**
 * Sprint 92 — Production telemedicine / live-video configuration validation.
 * Never invent video providers, API keys, signing secrets, rooms, or live sessions.
 * Never expose secrets or PHI — only reference_present / configured flags.
 */
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';

export const VIDEO_PROVIDER_NOT_SELECTED = 'VIDEO_PROVIDER_NOT_SELECTED';
export const VIDEO_CREDENTIAL_REFERENCE_MISSING = 'VIDEO_CREDENTIAL_REFERENCE_MISSING';
export const VIDEO_API_ENDPOINT_REFERENCE_MISSING = 'VIDEO_API_ENDPOINT_REFERENCE_MISSING';
export const VIDEO_TOKEN_SIGNING_REFERENCE_MISSING = 'VIDEO_TOKEN_SIGNING_REFERENCE_MISSING';
export const VIDEO_CALLBACK_CONFIGURATION_MISSING = 'VIDEO_CALLBACK_CONFIGURATION_MISSING';
export const VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING =
  'VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING';
export const VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING =
  'VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING';
export const VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING =
  'VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING';

export type VideoConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type VideoConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  credentials: 'READY' | 'MISSING';
  api_endpoint: 'READY' | 'MISSING';
  token_signing: 'READY' | 'MISSING';
  callback: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  markets_legal: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  session_capability: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
  recording: 'EXTERNAL_GATED' | 'READY' | 'DISABLED';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};

export type ProductionVideoConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  credential_reference: VideoConfigPresence;
  api_endpoint_reference: VideoConfigPresence;
  token_signing_reference: VideoConfigPresence;
  callback_configuration: VideoConfigPresence;
  market_legal_configuration: VideoConfigPresence;
  recording_storage_configuration: VideoConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  phi_exposed: false;
  configuration_readiness: VideoConfigurationReadiness;
  eligibility: {
    appointment_equals_live_video_session: false;
    session_created_equals_consultation_completed: false;
    livekit_sandbox_refs_equal_production_enabled: false;
    recording_equals_live_video: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): VideoConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionVideoConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionVideoConfigurationValidation {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockAdapterRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference = presence('VIDEO_PROVIDER_SECRET_REF');
  const api_endpoint_reference = presence('VIDEO_API_ENDPOINT_REF');
  const token_signing_reference = presence('VIDEO_TOKEN_SIGNING_SECRET_REF');
  const callback_configuration = presence('VIDEO_CALLBACK_SECRET_REF');
  const market_legal_configuration = presence('VIDEO_MARKET_LEGAL_CONFIG_REF');
  const recording_storage_configuration = presence('VIDEO_RECORDING_STORAGE_REF');

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(VIDEO_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(VIDEO_CREDENTIAL_REFERENCE_MISSING);
  if (!api_endpoint_reference.reference_present) {
    blockers.push(VIDEO_API_ENDPOINT_REFERENCE_MISSING);
  }
  if (!token_signing_reference.reference_present) {
    blockers.push(VIDEO_TOKEN_SIGNING_REFERENCE_MISSING);
  }
  if (!callback_configuration.reference_present) {
    blockers.push(VIDEO_CALLBACK_CONFIGURATION_MISSING);
  }
  if (!market_legal_configuration.reference_present) {
    blockers.push(VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING);
  }
  if (!recording_storage_configuration.reference_present) {
    blockers.push(VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING);
  }
  blockers.push(VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: VideoConfigurationReadiness = {
    provider: providerName,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: missing(
      providerSelected &&
        credential_reference.reference_present &&
        api_endpoint_reference.reference_present &&
        token_signing_reference.reference_present,
    ),
    credentials: missing(credential_reference.reference_present),
    api_endpoint: missing(api_endpoint_reference.reference_present),
    token_signing: missing(token_signing_reference.reference_present),
    callback: missing(callback_configuration.reference_present),
    markets_legal: market_legal_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    session_capability: 'SANDBOX_ONLY',
    recording: 'EXTERNAL_GATED',
    production_activation: 'EXTERNAL_GATED',
  };

  return {
    environment: env,
    live_enabled: live,
    provider_selected: providerSelected,
    provider_name: providerName,
    credential_reference,
    api_endpoint_reference,
    token_signing_reference,
    callback_configuration,
    market_legal_configuration,
    recording_storage_configuration,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    phi_exposed: false,
    configuration_readiness,
    eligibility: {
      appointment_equals_live_video_session: false,
      session_created_equals_consultation_completed: false,
      livekit_sandbox_refs_equal_production_enabled: false,
      recording_equals_live_video: false,
    },
    message: providerSelected
      ? 'Video adapter selected but production activation still requires verified vault refs + legal/consent/recording gates.'
      : 'Video provider NOT_SELECTED — production configuration references missing. MockVideoProvider / sandbox LiveKit refs are not production telemedicine.',
  };
}
