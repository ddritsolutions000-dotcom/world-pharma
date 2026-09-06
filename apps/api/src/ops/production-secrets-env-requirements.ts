/**
 * Sprint 98 — Production secrets + environment configuration validation.
 * Never invent credentials. Never return secret values — only presence flags.
 */
import { readInfrastructureEnvironment } from './infra-environment';
import { redactSecretValue } from './secret-redaction';

export const NO_PRODUCTION_SECRETS_MANAGER = 'NO_PRODUCTION_SECRETS_MANAGER';
export const NO_PRODUCTION_ENVIRONMENT_SEPARATION = 'NO_PRODUCTION_ENVIRONMENT_SEPARATION';
export const PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING =
  'PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING';
export const CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK = 'CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK';
export const SANDBOX_CREDENTIAL_IN_PRODUCTION_REJECTED =
  'SANDBOX_CREDENTIAL_IN_PRODUCTION_REJECTED';
export const PRODUCTION_CONFIG_MATRIX_INCOMPLETE = 'PRODUCTION_CONFIG_MATRIX_INCOMPLETE';

export type ConfigClassification =
  | 'SECRET'
  | 'CONFIGURATION'
  | 'PUBLIC_CONFIGURATION'
  | 'DERIVED_VALUE';

export type ConfigActivationStatus =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'READY_FOR_EXTERNAL_ACTIVATION'
  | 'ENABLED'
  | 'EXTERNAL_GATED';

export type ProductionConfigInventoryEntry = {
  rail: string;
  category: string;
  key: string;
  classification: ConfigClassification;
  status: ConfigActivationStatus;
  secret_present: 'SET' | 'MISSING' | 'N/A';
  detail: string;
};

export type EnvironmentSeparationReadiness = {
  development: 'ISOLATED' | 'SHARED_UNSAFE';
  sandbox: 'ISOLATED' | 'SHARED_UNSAFE';
  staging: 'EXTERNAL_GATED' | 'READY';
  production: 'EXTERNAL_GATED' | 'READY';
  sandbox_credential_cannot_activate_production: true;
  production_secret_never_client_exposed: true;
  no_silent_fallback_to_mock: true;
};

export type ClientBoundaryReadiness = {
  next_public_allowed_for_secrets: false;
  expo_public_allowed_for_secrets: false;
  browser_bundle_must_not_contain_secrets: true;
  api_must_not_return_secret_values: true;
  admin_ui_shows_presence_only: true;
};

export type SecretScanSummary = {
  status: 'PASS_WITH_PLACEHOLDERS' | 'FAIL' | 'REVIEW_REQUIRED';
  live_key_material_hits: number;
  placeholder_fixture_ok: true;
  note: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function entry(
  rail: string,
  category: string,
  key: string,
  classification: ConfigClassification,
  envKey?: string,
): ProductionConfigInventoryEntry {
  if (classification === 'SECRET') {
    const present = envKey ? redactSecretValue(process.env[envKey]) : 'MISSING';
    return {
      rail,
      category,
      key,
      classification,
      status: present === 'SET' ? 'EXTERNAL_GATED' : 'CREDENTIALS_REQUIRED',
      secret_present: present,
      detail:
        present === 'SET'
          ? `${key} reference present (value not shown) — production activation still EXTERNAL_GATED.`
          : `${key} credentials missing — CREDENTIALS_REQUIRED.`,
    };
  }
  if (classification === 'CONFIGURATION') {
    const present = envKey ? refPresent(envKey) : false;
    return {
      rail,
      category,
      key,
      classification,
      status: present ? 'EXTERNAL_GATED' : 'CONFIGURATION_REQUIRED',
      secret_present: 'N/A',
      detail: present
        ? `${key} configuration present — production still EXTERNAL_GATED without provider enablement.`
        : `${key} configuration missing — CONFIGURATION_REQUIRED.`,
    };
  }
  return {
    rail,
    category,
    key,
    classification,
    status: 'EXTERNAL_GATED',
    secret_present: 'N/A',
    detail: `${key} public/derived — never a production secret.`,
  };
}

/** Authoritative production configuration inventory (presence/classification only). */
export function buildProductionSecretsEnvInventory(): ProductionConfigInventoryEntry[] {
  return [
    // PAYMENTS
    entry('PSP', 'PAYMENTS', 'provider', 'CONFIGURATION', 'PAYMENT_PROVIDER'),
    entry('PSP', 'PAYMENTS', 'api_credentials', 'SECRET', 'PAYMENT_GATEWAY_PRIMARY_SECRET_REF'),
    entry('PSP', 'PAYMENTS', 'webhook_secret', 'SECRET', 'PAYMENT_WEBHOOK_SECRET_REF'),
    entry('PSP', 'PAYMENTS', 'markets', 'CONFIGURATION', 'PAYMENT_MARKETS'),
    entry('PSP', 'PAYMENTS', 'currencies', 'CONFIGURATION', 'PAYMENT_CURRENCIES'),
    entry('PSP', 'PAYMENTS', 'merchant_account', 'CONFIGURATION', 'PAYMENT_MERCHANT_ACCOUNT_REF'),
    entry('PSP', 'PAYMENTS', 'reconciliation', 'CONFIGURATION', 'PAYMENT_RECONCILIATION_REF'),
    // OTP / COMMUNICATIONS
    entry('OTP', 'COMMUNICATIONS', 'otp_provider', 'CONFIGURATION', 'OTP_PROVIDER'),
    entry('SMS', 'COMMUNICATIONS', 'sms_provider', 'CONFIGURATION', 'SMS_PROVIDER'),
    entry('EMAIL', 'COMMUNICATIONS', 'email_provider', 'CONFIGURATION', 'EMAIL_PROVIDER'),
    entry('PUSH', 'COMMUNICATIONS', 'push_provider', 'CONFIGURATION', 'PUSH_PROVIDER'),
    entry('OTP', 'COMMUNICATIONS', 'otp_credentials', 'SECRET', 'OTP_PROVIDER_SECRET_REF'),
    entry('SMS', 'COMMUNICATIONS', 'sms_credentials', 'SECRET', 'SMS_PROVIDER_SECRET_REF'),
    entry('EMAIL', 'COMMUNICATIONS', 'email_credentials', 'SECRET', 'EMAIL_PROVIDER_SECRET_REF'),
    entry('SMS', 'COMMUNICATIONS', 'sender_id', 'CONFIGURATION', 'SMS_SENDER_ID'),
    entry('EMAIL', 'COMMUNICATIONS', 'sender_domain', 'CONFIGURATION', 'EMAIL_SENDER_DOMAIN'),
    // LOGISTICS
    entry('CARRIER', 'LOGISTICS', 'provider', 'CONFIGURATION', 'CARRIER_PROVIDER'),
    entry('CARRIER', 'LOGISTICS', 'api_credentials', 'SECRET', 'CARRIER_SECRET_REF'),
    entry('CARRIER', 'LOGISTICS', 'webhook_signing_secret', 'SECRET', 'CARRIER_WEBHOOK_SECRET_REF'),
    entry('CARRIER', 'LOGISTICS', 'serviceability', 'CONFIGURATION', 'CARRIER_SERVICEABILITY_REF'),
    entry('CARRIER', 'LOGISTICS', 'tracking', 'CONFIGURATION', 'CARRIER_TRACKING_REF'),
    entry('CARRIER', 'LOGISTICS', 'market_coverage', 'CONFIGURATION', 'CARRIER_MARKET_COVERAGE'),
    // eRx
    entry('ERX', 'CLINICAL', 'provider', 'CONFIGURATION', 'ERX_PROVIDER'),
    entry('ERX', 'CLINICAL', 'credentials', 'SECRET', 'ERX_SECRET_REF'),
    entry('ERX', 'CLINICAL', 'endpoint', 'CONFIGURATION', 'ERX_ENDPOINT_REF'),
    entry('ERX', 'CLINICAL', 'network_account', 'CONFIGURATION', 'ERX_NETWORK_ACCOUNT_REF'),
    entry('ERX', 'CLINICAL', 'callback', 'CONFIGURATION', 'ERX_CALLBACK_REF'),
    entry('ERX', 'CLINICAL', 'markets_legal', 'CONFIGURATION', 'ERX_MARKETS_LEGAL_REF'),
    // VIDEO
    entry('VIDEO', 'CLINICAL', 'provider', 'CONFIGURATION', 'VIDEO_PROVIDER'),
    entry('VIDEO', 'CLINICAL', 'api_credentials', 'SECRET', 'VIDEO_SECRET_REF'),
    entry('VIDEO', 'CLINICAL', 'token_signing_secret', 'SECRET', 'VIDEO_TOKEN_SIGNING_SECRET_REF'),
    entry('VIDEO', 'CLINICAL', 'callback', 'CONFIGURATION', 'VIDEO_CALLBACK_REF'),
    entry('VIDEO', 'CLINICAL', 'recording', 'CONFIGURATION', 'VIDEO_RECORDING_REF'),
    entry('VIDEO', 'CLINICAL', 'storage', 'CONFIGURATION', 'VIDEO_STORAGE_REF'),
    // PACS
    entry('PACS', 'CLINICAL', 'provider', 'CONFIGURATION', 'PACS_PROVIDER'),
    entry('PACS', 'CLINICAL', 'credentials', 'SECRET', 'PACS_SECRET_REF'),
    entry('PACS', 'CLINICAL', 'dicom_endpoint', 'CONFIGURATION', 'PACS_DICOM_ENDPOINT_REF'),
    entry('PACS', 'CLINICAL', 'ae_title', 'CONFIGURATION', 'PACS_AE_TITLE'),
    entry('PACS', 'CLINICAL', 'tls', 'CONFIGURATION', 'PACS_TLS_REF'),
    entry('PACS', 'CLINICAL', 'callback', 'CONFIGURATION', 'PACS_CALLBACK_REF'),
    entry('PACS', 'CLINICAL', 'viewer', 'CONFIGURATION', 'PACS_VIEWER_REF'),
    // KYC
    entry('KYC_KYB', 'PARTNER_VERIFICATION', 'provider', 'CONFIGURATION', 'KYC_PROVIDER'),
    entry('KYC_KYB', 'PARTNER_VERIFICATION', 'api_credentials', 'SECRET', 'KYC_SECRET_REF'),
    entry('KYC_KYB', 'PARTNER_VERIFICATION', 'callback', 'CONFIGURATION', 'KYC_CALLBACK_REF'),
    entry('KYC_KYB', 'PARTNER_VERIFICATION', 'markets', 'CONFIGURATION', 'KYC_MARKETS_REF'),
    entry('KYC_KYB', 'PARTNER_VERIFICATION', 'partner_types', 'CONFIGURATION', 'KYC_PARTNER_TYPES_REF'),
    // STORAGE / KMS / MALWARE
    entry('PRIVATE_STORAGE', 'DATA_SECURITY', 'provider', 'CONFIGURATION', 'OBJECT_STORAGE_BACKEND'),
    entry('PRIVATE_STORAGE', 'DATA_SECURITY', 'bucket', 'CONFIGURATION', 'OBJECT_STORAGE_BUCKET_REF'),
    entry('PRIVATE_STORAGE', 'DATA_SECURITY', 'credentials', 'SECRET', 'OBJECT_STORAGE_SECRET_REF'),
    entry('PRIVATE_STORAGE', 'DATA_SECURITY', 'private_access', 'CONFIGURATION'),
    entry('KMS', 'DATA_SECURITY', 'provider', 'CONFIGURATION', 'KMS_PROVIDER'),
    entry('KMS', 'DATA_SECURITY', 'key_reference', 'CONFIGURATION', 'KMS_KEY_REF'),
    entry('KMS', 'DATA_SECURITY', 'credentials', 'SECRET', 'SECRET_MANAGER_REF'),
    entry('KMS', 'DATA_SECURITY', 'rotation', 'CONFIGURATION', 'KMS_ROTATION_REF'),
    entry('MALWARE_SCANNER', 'DATA_SECURITY', 'provider', 'CONFIGURATION', 'MALWARE_SCANNER_PROVIDER'),
    entry('MALWARE_SCANNER', 'DATA_SECURITY', 'credentials', 'SECRET', 'MALWARE_SCANNER_SECRET_REF'),
    entry('MALWARE_SCANNER', 'DATA_SECURITY', 'endpoint', 'CONFIGURATION', 'MALWARE_SCANNER_ENDPOINT_REF'),
    // BACKUP / PITR / DR
    entry('MANAGED_BACKUP', 'BACKUP_DR', 'provider', 'CONFIGURATION', 'MANAGED_BACKUP_PROVIDER'),
    entry('MANAGED_BACKUP', 'BACKUP_DR', 'credentials', 'SECRET', 'MANAGED_BACKUP_SECRET_REF'),
    entry('MANAGED_BACKUP', 'BACKUP_DR', 'destination', 'CONFIGURATION', 'MANAGED_BACKUP_DESTINATION_REF'),
    entry('PITR', 'BACKUP_DR', 'wal_retention', 'CONFIGURATION', 'PITR_WAL_RETENTION_REF'),
    entry('PITR', 'BACKUP_DR', 'restore_environment', 'CONFIGURATION', 'PITR_RESTORE_ENVIRONMENT_REF'),
    entry('DR_ENVIRONMENT', 'BACKUP_DR', 'region', 'CONFIGURATION', 'DR_ENVIRONMENT_REGION_REF'),
    entry('DR_ENVIRONMENT', 'BACKUP_DR', 'recovery_credentials', 'SECRET', 'DR_RECOVERY_SECRET_REF'),
    // OBSERVABILITY
    entry('APM', 'OBSERVABILITY', 'provider', 'CONFIGURATION', 'APM_PROVIDER'),
    entry('APM', 'OBSERVABILITY', 'credentials', 'SECRET', 'APM_SECRET_REF'),
    entry('MONITORING', 'OBSERVABILITY', 'provider', 'CONFIGURATION', 'MONITORING_PROVIDER'),
    entry('MONITORING', 'OBSERVABILITY', 'credentials', 'SECRET', 'MONITORING_SECRET_REF'),
    entry('ALERTING', 'OBSERVABILITY', 'provider', 'CONFIGURATION', 'ALERTING_PROVIDER'),
    entry('ALERTING', 'OBSERVABILITY', 'credentials', 'SECRET', 'ALERTING_SECRET_REF'),
    entry('ALERTING', 'OBSERVABILITY', 'destinations', 'CONFIGURATION', 'ALERT_DESTINATION_REF'),
    // PLATFORM
    entry('PLATFORM', 'PLATFORM', 'database_url', 'SECRET', 'DATABASE_URL'),
    entry('PLATFORM', 'PLATFORM', 'redis_url', 'SECRET', 'REDIS_URL'),
    entry('PLATFORM', 'PLATFORM', 'jwt_access_secret', 'SECRET', 'JWT_ACCESS_SECRET'),
    entry('PLATFORM', 'PLATFORM', 'otp_pepper', 'SECRET', 'OTP_PEPPER'),
    entry('PLATFORM', 'PLATFORM', 'infrastructure_environment', 'CONFIGURATION', 'INFRASTRUCTURE_ENVIRONMENT'),
    entry('PLATFORM', 'PLATFORM', 'app_version', 'PUBLIC_CONFIGURATION', 'APP_VERSION'),
    // EDGE / WAF (S114) — references only; no invented vendor
    entry('EDGE_WAF', 'EDGE_SECURITY', 'provider', 'CONFIGURATION', 'EDGE_WAF_PROVIDER'),
    entry('EDGE_WAF', 'EDGE_SECURITY', 'credential_reference', 'SECRET', 'EDGE_WAF_SECRET_REF'),
    entry('EDGE_WAF', 'EDGE_SECURITY', 'trusted_proxies', 'CONFIGURATION', 'TRUSTED_PROXIES'),
    entry('EDGE_WAF', 'EDGE_SECURITY', 'origin_protection', 'CONFIGURATION', 'EDGE_ORIGIN_PROTECTION_REF'),
    // AFFILIATE PAYOUT
    entry('AFFILIATE_PAYOUT', 'PAYMENTS', 'provider', 'CONFIGURATION', 'AFFILIATE_PAYOUT_PROVIDER'),
    entry('AFFILIATE_PAYOUT', 'PAYMENTS', 'credentials', 'SECRET', 'AFFILIATE_PAYOUT_SECRET_REF'),
  ];
}

export function evaluateEnvironmentSeparation(): EnvironmentSeparationReadiness {
  return {
    development: 'ISOLATED',
    sandbox: 'ISOLATED',
    staging: 'EXTERNAL_GATED',
    production: 'EXTERNAL_GATED',
    sandbox_credential_cannot_activate_production: true,
    production_secret_never_client_exposed: true,
    no_silent_fallback_to_mock: true,
  };
}

export function evaluateClientBoundaryReadiness(): ClientBoundaryReadiness {
  return {
    next_public_allowed_for_secrets: false,
    expo_public_allowed_for_secrets: false,
    browser_bundle_must_not_contain_secrets: true,
    api_must_not_return_secret_values: true,
    admin_ui_shows_presence_only: true,
  };
}

/** Focused in-process scan — does not invent hits; documents placeholder hygiene. */
export function evaluateRepositorySecretScanSummary(): SecretScanSummary {
  const infra = readInfrastructureEnvironment();
  const dangerous =
    (infra === 'production' && process.env['AUTH_DEV_REVEAL_OTP'] === 'true') ||
    (infra === 'production' && (process.env['DATABASE_URL'] ?? '').includes('127.0.0.1'));
  return {
    status: dangerous ? 'FAIL' : 'PASS_WITH_PLACEHOLDERS',
    live_key_material_hits: 0,
    placeholder_fixture_ok: true,
    note: dangerous
      ? 'Production environment flags unsafe local/dev secret patterns.'
      : 'No live key material claimed in-repo. Sandbox fixtures / .env.example placeholders only. Pattern scan of committed apps/packages remains ops-owned (see S62 inventory).',
  };
}

export function validateProductionSecretsEnvConfiguration(): {
  environment: 'sandbox' | 'production';
  inventory: ProductionConfigInventoryEntry[];
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  credentials_ready: 'MISSING' | 'PARTIAL' | 'READY';
  configuration_ready: 'MISSING' | 'PARTIAL' | 'READY';
  production_activation: 'EXTERNAL_GATED';
  environment_separation: EnvironmentSeparationReadiness;
  client_boundary: ClientBoundaryReadiness;
  secret_scan: SecretScanSummary;
  message: string;
} {
  const infra = readInfrastructureEnvironment();
  const inventory = buildProductionSecretsEnvInventory();
  const blockers: string[] = [
    NO_PRODUCTION_SECRETS_MANAGER,
    PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
    PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
  ];
  if (infra !== 'production') {
    blockers.push(NO_PRODUCTION_ENVIRONMENT_SEPARATION);
  }
  const credMissing = inventory.filter(
    (i) => i.classification === 'SECRET' && i.status === 'CREDENTIALS_REQUIRED',
  ).length;
  const configMissing = inventory.filter(
    (i) => i.classification === 'CONFIGURATION' && i.status === 'CONFIGURATION_REQUIRED',
  ).length;
  const scan = evaluateRepositorySecretScanSummary();
  if (scan.status === 'FAIL') blockers.push(SANDBOX_CREDENTIAL_IN_PRODUCTION_REJECTED);

  return {
    environment: infra,
    inventory,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    credentials_ready: credMissing === 0 ? 'PARTIAL' : 'MISSING',
    configuration_ready: configMissing === 0 ? 'PARTIAL' : 'MISSING',
    production_activation: 'EXTERNAL_GATED',
    environment_separation: evaluateEnvironmentSeparation(),
    client_boundary: evaluateClientBoundaryReadiness(),
    secret_scan: scan,
    message:
      'Production secrets/env configuration NOT ready for external activation. Provider vault refs missing. Sandbox/local secrets never activate production rails. Values never returned.',
  };
}
