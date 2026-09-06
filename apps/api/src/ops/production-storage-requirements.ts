/**
 * Sprint 95 — Production private storage / KMS / malware configuration validation.
 * Never invent cloud buckets, KMS key IDs, malware engines, or live credentials.
 * Never expose secrets — only reference_present / configured flags.
 */
import {
  isLiveFileScanningEnabled,
  isLiveObjectStorageEnabled,
  readFileScanningEnvironment,
  readInfrastructureEnvironment,
  readObjectStorageEnvironment,
} from './infra-environment';

export const STORAGE_PROVIDER_NOT_SELECTED = 'STORAGE_PROVIDER_NOT_SELECTED';
export const STORAGE_CREDENTIAL_REFERENCE_MISSING = 'STORAGE_CREDENTIAL_REFERENCE_MISSING';
export const STORAGE_BUCKET_REFERENCE_MISSING = 'STORAGE_BUCKET_REFERENCE_MISSING';
export const STORAGE_REGION_REFERENCE_MISSING = 'STORAGE_REGION_REFERENCE_MISSING';
export const KMS_PROVIDER_NOT_SELECTED = 'KMS_PROVIDER_NOT_SELECTED';
export const KMS_KEY_REFERENCE_MISSING = 'KMS_KEY_REFERENCE_MISSING';
export const KMS_SECRET_MANAGER_REFERENCE_MISSING = 'KMS_SECRET_MANAGER_REFERENCE_MISSING';
export const MALWARE_PROVIDER_NOT_SELECTED = 'MALWARE_PROVIDER_NOT_SELECTED';
export const MALWARE_ENDPOINT_REFERENCE_MISSING = 'MALWARE_ENDPOINT_REFERENCE_MISSING';
export const MALWARE_CREDENTIAL_REFERENCE_MISSING = 'MALWARE_CREDENTIAL_REFERENCE_MISSING';
export const STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED =
  'STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED';
export const STORAGE_BACKUP_DEPENDENCY_GATED = 'STORAGE_BACKUP_DEPENDENCY_GATED';

export type StorageConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type StorageTriadConfigurationReadiness = {
  private_storage: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    credentials: 'READY' | 'MISSING';
    bucket: 'READY' | 'MISSING';
    private_access: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  kms: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    key_reference: 'READY' | 'MISSING';
    rotation: 'EXTERNAL_GATED' | 'READY';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  malware_scanner: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    endpoint: 'READY' | 'MISSING';
    scan_capability: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
    failure_behavior: 'FAIL_CLOSED';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  environment: 'SANDBOX' | 'PRODUCTION';
};

export type ProductionStorageConfigurationValidation = {
  environment: 'sandbox' | 'production';
  storage_live_enabled: boolean;
  scanning_live_enabled: boolean;
  storage_provider_selected: boolean;
  kms_provider_selected: boolean;
  malware_provider_selected: boolean;
  credential_reference: StorageConfigPresence;
  bucket_reference: StorageConfigPresence;
  region_reference: StorageConfigPresence;
  kms_key_reference: StorageConfigPresence;
  secret_manager_reference: StorageConfigPresence;
  malware_endpoint_reference: StorageConfigPresence;
  malware_credential_reference: StorageConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  phi_exposed: false;
  configuration_readiness: StorageTriadConfigurationReadiness;
  eligibility: {
    local_disk_equals_production_private_storage: false;
    env_refs_equal_production_kms: false;
    sandbox_scanner_equals_production_av: false;
    unscanned_equals_trusted: false;
    database_backup_equals_object_storage_backup: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): StorageConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionStorageConfiguration(input?: {
  storageSelected?: boolean;
  kmsSelected?: boolean;
  malwareSelected?: boolean;
}): ProductionStorageConfigurationValidation {
  const infraEnv = readInfrastructureEnvironment();
  const storageEnv = readObjectStorageEnvironment();
  const scanEnv = readFileScanningEnvironment();
  void storageEnv;
  void scanEnv;

  const storageSelected = Boolean(input?.storageSelected);
  const kmsSelected = Boolean(input?.kmsSelected);
  const malwareSelected = Boolean(input?.malwareSelected);

  const credential_reference = presence('OBJECT_STORAGE_SECRET_REF');
  const bucket_reference = presence('OBJECT_STORAGE_BUCKET_REF');
  const region_reference = presence('OBJECT_STORAGE_REGION_REF');
  const kms_key_reference = presence('KMS_KEY_REF');
  const secret_manager_reference = presence('SECRET_MANAGER_REF');
  const malware_endpoint_reference = presence('MALWARE_SCANNER_ENDPOINT_REF');
  const malware_credential_reference = presence('MALWARE_SCANNER_SECRET_REF');

  const blockers: string[] = [];
  if (!storageSelected) blockers.push(STORAGE_PROVIDER_NOT_SELECTED);
  if (!credential_reference.reference_present) blockers.push(STORAGE_CREDENTIAL_REFERENCE_MISSING);
  if (!bucket_reference.reference_present) blockers.push(STORAGE_BUCKET_REFERENCE_MISSING);
  if (!region_reference.reference_present) blockers.push(STORAGE_REGION_REFERENCE_MISSING);
  if (!kmsSelected) blockers.push(KMS_PROVIDER_NOT_SELECTED);
  if (!kms_key_reference.reference_present) blockers.push(KMS_KEY_REFERENCE_MISSING);
  if (!secret_manager_reference.reference_present) {
    blockers.push(KMS_SECRET_MANAGER_REFERENCE_MISSING);
  }
  if (!malwareSelected) blockers.push(MALWARE_PROVIDER_NOT_SELECTED);
  if (!malware_endpoint_reference.reference_present) {
    blockers.push(MALWARE_ENDPOINT_REFERENCE_MISSING);
  }
  if (!malware_credential_reference.reference_present) {
    blockers.push(MALWARE_CREDENTIAL_REFERENCE_MISSING);
  }
  blockers.push(STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED);
  blockers.push(STORAGE_BACKUP_DEPENDENCY_GATED);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: StorageTriadConfigurationReadiness = {
    private_storage: {
      provider: storageSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(
        storageSelected &&
          credential_reference.reference_present &&
          bucket_reference.reference_present,
      ),
      credentials: missing(credential_reference.reference_present),
      bucket: missing(bucket_reference.reference_present),
      private_access: 'SANDBOX_VERIFIED',
      production_activation: 'EXTERNAL_GATED',
    },
    kms: {
      provider: kmsSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(kmsSelected && kms_key_reference.reference_present),
      key_reference: missing(kms_key_reference.reference_present),
      rotation: 'EXTERNAL_GATED',
      production_activation: 'EXTERNAL_GATED',
    },
    malware_scanner: {
      provider: malwareSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(malwareSelected && malware_endpoint_reference.reference_present),
      endpoint: missing(malware_endpoint_reference.reference_present),
      scan_capability: 'SANDBOX_ONLY',
      failure_behavior: 'FAIL_CLOSED',
      production_activation: 'EXTERNAL_GATED',
    },
    environment: infraEnv === 'production' ? 'PRODUCTION' : 'SANDBOX',
  };

  return {
    environment: infraEnv,
    storage_live_enabled: isLiveObjectStorageEnabled(),
    scanning_live_enabled: isLiveFileScanningEnabled(),
    storage_provider_selected: storageSelected,
    kms_provider_selected: kmsSelected,
    malware_provider_selected: malwareSelected,
    credential_reference,
    bucket_reference,
    region_reference,
    kms_key_reference,
    secret_manager_reference,
    malware_endpoint_reference,
    malware_credential_reference,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    phi_exposed: false,
    configuration_readiness,
    eligibility: {
      local_disk_equals_production_private_storage: false,
      env_refs_equal_production_kms: false,
      sandbox_scanner_equals_production_av: false,
      unscanned_equals_trusted: false,
      database_backup_equals_object_storage_backup: false,
    },
    message:
      'Private storage / KMS / malware scanner NOT_SELECTED — production vault references missing. LocalPrivateObjectStore + DeterministicSandboxMalwareScanner are not production infrastructure.',
  };
}
