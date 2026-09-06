/**
 * Sprint 93 — Production PACS / DICOM configuration validation.
 * Never invent PACS providers, AE Titles, DICOM endpoints, certificates, or live studies.
 * Never expose secrets or PHI — only reference_present / configured flags.
 */
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';

export const PACS_PROVIDER_NOT_SELECTED = 'PACS_PROVIDER_NOT_SELECTED';
export const PACS_CREDENTIAL_REFERENCE_MISSING = 'PACS_CREDENTIAL_REFERENCE_MISSING';
export const PACS_DICOM_ENDPOINT_REFERENCE_MISSING = 'PACS_DICOM_ENDPOINT_REFERENCE_MISSING';
export const PACS_AE_TITLE_REFERENCE_MISSING = 'PACS_AE_TITLE_REFERENCE_MISSING';
export const PACS_TLS_CERTIFICATE_REFERENCE_MISSING = 'PACS_TLS_CERTIFICATE_REFERENCE_MISSING';
export const PACS_CALLBACK_CONFIGURATION_MISSING = 'PACS_CALLBACK_CONFIGURATION_MISSING';
export const PACS_MARKET_LEGAL_CONFIGURATION_MISSING =
  'PACS_MARKET_LEGAL_CONFIGURATION_MISSING';
export const PACS_VIEWER_CONFIGURATION_MISSING = 'PACS_VIEWER_CONFIGURATION_MISSING';
export const PACS_STORAGE_KMS_DEPENDENCY_GATED = 'PACS_STORAGE_KMS_DEPENDENCY_GATED';
export const PACS_MALWARE_SCAN_DEPENDENCY_GATED = 'PACS_MALWARE_SCAN_DEPENDENCY_GATED';

export type PacsConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type PacsConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  environment: 'SANDBOX' | 'PRODUCTION';
  configuration: 'READY' | 'MISSING';
  credentials: 'READY' | 'MISSING';
  dicom_endpoint: 'READY' | 'MISSING';
  ae_title: 'READY' | 'MISSING';
  tls_certificate: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  callback: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  markets_legal: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  modality_support: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
  transmission: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
  viewer: 'EXTERNAL_GATED' | 'READY';
  storage: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED' | 'READY';
  kms: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED' | 'READY';
  malware_scanning: 'EXTERNAL_GATED' | 'MALWARE_SCAN_EXTERNAL_GATED' | 'READY';
  production_activation: 'EXTERNAL_GATED' | 'READY';
};

export type ProductionPacsConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  credential_reference: PacsConfigPresence;
  dicom_endpoint_reference: PacsConfigPresence;
  ae_title_reference: PacsConfigPresence;
  tls_certificate_reference: PacsConfigPresence;
  callback_configuration: PacsConfigPresence;
  market_legal_configuration: PacsConfigPresence;
  viewer_configuration: PacsConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  phi_exposed: false;
  configuration_readiness: PacsConfigurationReadiness;
  eligibility: {
    report_page_equals_diagnostic_pacs_viewer: false;
    sandbox_study_equals_production_dicom_transmission: false;
    sandbox_storage_equals_production_private_storage: false;
    unscanned_content_equals_production_trusted: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): PacsConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionPacsConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionPacsConfigurationValidation {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockAdapterRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference = presence('PACS_PROVIDER_SECRET_REF');
  const dicom_endpoint_reference = presence('PACS_DICOM_ENDPOINT_REF');
  const ae_title_reference = presence('PACS_AE_TITLE_REF');
  const tls_certificate_reference = presence('PACS_TLS_CERT_REF');
  const callback_configuration = presence('PACS_CALLBACK_SECRET_REF');
  const market_legal_configuration = presence('PACS_MARKET_LEGAL_CONFIG_REF');
  const viewer_configuration = presence('PACS_VIEWER_CONFIG_REF');

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(PACS_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(PACS_CREDENTIAL_REFERENCE_MISSING);
  if (!dicom_endpoint_reference.reference_present) {
    blockers.push(PACS_DICOM_ENDPOINT_REFERENCE_MISSING);
  }
  if (!ae_title_reference.reference_present) blockers.push(PACS_AE_TITLE_REFERENCE_MISSING);
  if (!tls_certificate_reference.reference_present) {
    blockers.push(PACS_TLS_CERTIFICATE_REFERENCE_MISSING);
  }
  if (!callback_configuration.reference_present) {
    blockers.push(PACS_CALLBACK_CONFIGURATION_MISSING);
  }
  if (!market_legal_configuration.reference_present) {
    blockers.push(PACS_MARKET_LEGAL_CONFIGURATION_MISSING);
  }
  if (!viewer_configuration.reference_present) blockers.push(PACS_VIEWER_CONFIGURATION_MISSING);
  blockers.push(PACS_STORAGE_KMS_DEPENDENCY_GATED);
  blockers.push(PACS_MALWARE_SCAN_DEPENDENCY_GATED);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: PacsConfigurationReadiness = {
    provider: providerName,
    environment: env === 'production' ? 'PRODUCTION' : 'SANDBOX',
    configuration: missing(
      providerSelected &&
        credential_reference.reference_present &&
        dicom_endpoint_reference.reference_present &&
        ae_title_reference.reference_present,
    ),
    credentials: missing(credential_reference.reference_present),
    dicom_endpoint: missing(dicom_endpoint_reference.reference_present),
    ae_title: missing(ae_title_reference.reference_present),
    tls_certificate: missing(tls_certificate_reference.reference_present),
    callback: missing(callback_configuration.reference_present),
    markets_legal: market_legal_configuration.reference_present ? 'READY' : 'POLICY_DRIVEN',
    modality_support: 'SANDBOX_ONLY',
    transmission: 'SANDBOX_ONLY',
    viewer: 'EXTERNAL_GATED',
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
    dicom_endpoint_reference,
    ae_title_reference,
    tls_certificate_reference,
    callback_configuration,
    market_legal_configuration,
    viewer_configuration,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    phi_exposed: false,
    configuration_readiness,
    eligibility: {
      report_page_equals_diagnostic_pacs_viewer: false,
      sandbox_study_equals_production_dicom_transmission: false,
      sandbox_storage_equals_production_private_storage: false,
      unscanned_content_equals_production_trusted: false,
    },
    message: providerSelected
      ? 'PACS adapter selected but production activation still requires verified vault refs + storage/KMS/malware + viewer + legal gates.'
      : 'PACS provider NOT_SELECTED — production configuration references missing. SandboxPacsAdapter is not production DICOM transmission or a clinical viewer.',
  };
}
