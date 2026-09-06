/**
 * Sprint 47 — Production configuration inventory (presence only, never secret values).
 */
import { redactSecretValue } from './secret-redaction';
import {
  isLiveFileScanningEnabled,
  isLiveObjectStorageEnabled,
  isLocalDiskStorageBackend,
  isMockScannerProvider,
  readFileScanningEnvironment,
  readInfrastructureEnvironment,
  readObjectStorageEnvironment,
  type InfraRuntimeEnvironment,
} from './infra-environment';
import { isLiveCarrierEnabled, readLogisticsEnvironment } from '../logistics/carrier.config';
import { isLiveOtpEnabled, readCommunicationEnvironment } from '../identity/communication.config';
import { isLivePaymentEnabled, readPaymentEnvironment } from '../payment/payment.config';

export type ProductionConfigStatus = 'CONFIGURED' | 'MISSING' | 'INVALID' | 'EXTERNAL_GATED';

export type ProductionConfigItem = {
  name: string;
  status: ProductionConfigStatus;
  secret_present: 'SET' | 'MISSING' | 'N/A';
  detail: string;
};

export type OperationalSignal = {
  code: string;
  description: string;
  monitoring_integration: 'SOFTWARE_READY' | 'EXTERNAL_GATED';
};

function present(name: string, envKey: string, opts?: { minLength?: number; productionInvalidIf?: () => string | null }): ProductionConfigItem {
  const raw = process.env[envKey];
  const secretPresent = redactSecretValue(raw);
  if (!raw?.trim()) {
    return {
      name,
      status: 'MISSING',
      secret_present: secretPresent,
      detail: `${envKey} is not set (value not shown).`,
    };
  }
  if (opts?.minLength && raw.trim().length < opts.minLength) {
    return {
      name,
      status: 'INVALID',
      secret_present: 'SET',
      detail: `${envKey} is present but shorter than required minimum length.`,
    };
  }
  const invalid = opts?.productionInvalidIf?.() ?? null;
  if (invalid) {
    return { name, status: 'INVALID', secret_present: secretPresent === 'SET' ? 'SET' : 'N/A', detail: invalid };
  }
  return {
    name,
    status: 'CONFIGURED',
    secret_present: secretPresent,
    detail: `${envKey} is present (value not shown).`,
  };
}

export function listOperationalSignals(): OperationalSignal[] {
  return [
    { code: 'DATABASE_UNAVAILABLE', description: 'Postgres connectivity or transaction health failed', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'REDIS_UNAVAILABLE', description: 'Redis connectivity failed', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'STORAGE_UNAVAILABLE', description: 'Private object storage unavailable', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'PAYMENT_PROVIDER_UNAVAILABLE', description: 'Live PSP unavailable', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'OTP_PROVIDER_UNAVAILABLE', description: 'Live OTP/SMS unavailable', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'MESSAGING_PROVIDER_UNAVAILABLE', description: 'Live messaging unavailable', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'CARRIER_UNAVAILABLE', description: 'Live carrier unavailable', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'OUTBOX_BACKLOG', description: 'Outbox pending above ops threshold', monitoring_integration: 'SOFTWARE_READY' },
    { code: 'DLQ_GROWTH', description: 'Dead-lettered outbox events increasing', monitoring_integration: 'SOFTWARE_READY' },
    { code: 'WEBHOOK_FAILURES', description: 'Provider webhook verify/apply failures', monitoring_integration: 'SOFTWARE_READY' },
    { code: 'RECONCILIATION_BREAKS', description: 'Payment or carrier reconciliation INVESTIGATE/BREAK', monitoring_integration: 'SOFTWARE_READY' },
    { code: 'BACKUP_FAILED', description: 'Backup job non-zero exit or missing metadata', monitoring_integration: 'EXTERNAL_GATED' },
    { code: 'MALWARE_SCANNER_UNAVAILABLE', description: 'Production file scanner unavailable', monitoring_integration: 'EXTERNAL_GATED' },
  ];
}

export function evaluateProductionConfigInventory(): {
  environment: InfraRuntimeEnvironment;
  items: ProductionConfigItem[];
  overall: 'READY' | 'BLOCKED' | 'EXTERNAL_GATED';
  never_expose_secrets: true;
} {
  const infra = readInfrastructureEnvironment();
  const items: ProductionConfigItem[] = [
    present('database', 'DATABASE_URL', {
      productionInvalidIf: () =>
        infra === 'production' && process.env['DATABASE_URL']?.includes('127.0.0.1')
          ? 'Production database URL points at loopback — EXTERNAL/INVALID until managed Postgres is configured.'
          : null,
    }),
    present('redis', 'REDIS_URL'),
    {
      name: 'object_storage',
      status:
        readObjectStorageEnvironment() === 'production' && isLiveObjectStorageEnabled() && !isLocalDiskStorageBackend(process.env['OBJECT_STORAGE_BACKEND'])
          ? process.env['OBJECT_STORAGE_BUCKET_REF']?.trim()
            ? 'EXTERNAL_GATED'
            : 'MISSING'
          : readObjectStorageEnvironment() === 'production'
            ? 'EXTERNAL_GATED'
            : 'CONFIGURED',
      secret_present: redactSecretValue(process.env['OBJECT_STORAGE_SECRET_REF']),
      detail:
        readObjectStorageEnvironment() === 'sandbox'
          ? 'Local private object store (var/private-objects). Production S3-compatible storage is EXTERNAL_GATED.'
          : 'Production object storage requires a non-local backend + credentials — not registered in this repository.',
    },
    {
      name: 'kms_secrets',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'Cloud KMS / secret manager is not connected. Application uses env references only. EXTERNAL_GATED.',
    },
    {
      name: 'malware_scanner',
      status:
        readFileScanningEnvironment() === 'production' && isLiveFileScanningEnabled() && !isMockScannerProvider(process.env['MALWARE_SCANNER_PROVIDER'])
          ? process.env['MALWARE_SCANNER_ENDPOINT_REF']?.trim()
            ? 'EXTERNAL_GATED'
            : 'MISSING'
          : 'EXTERNAL_GATED',
      secret_present: redactSecretValue(process.env['MALWARE_SCANNER_SECRET_REF']),
      detail: 'Sandbox scanner is deterministic/noop. A real AV engine is EXTERNAL_GATED.',
    },
    {
      name: 'observability',
      status: process.env['METRICS_TOKEN']?.trim() ? 'CONFIGURED' : infra === 'production' ? 'MISSING' : 'CONFIGURED',
      secret_present: redactSecretValue(process.env['METRICS_TOKEN']),
      detail: 'In-process metrics and structured logs exist. External APM/pager is EXTERNAL_GATED.',
    },
    {
      name: 'payment_provider',
      status: isLivePaymentEnabled() && readPaymentEnvironment() === 'production' ? 'EXTERNAL_GATED' : 'CONFIGURED',
      secret_present: 'N/A',
      detail: 'Payment software rail is sandbox/mock unless live PSP gates close (Sprint 44).',
    },
    {
      name: 'otp_provider',
      status: isLiveOtpEnabled() && readCommunicationEnvironment() === 'production' ? 'EXTERNAL_GATED' : 'CONFIGURED',
      secret_present: 'N/A',
      detail: 'OTP software rail is sandbox/console unless live SMS gates close (Sprint 45).',
    },
    {
      name: 'messaging_provider',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'Transactional email/SMS/push providers remain EXTERNAL_GATED.',
    },
    {
      name: 'carrier',
      status: isLiveCarrierEnabled() && readLogisticsEnvironment() === 'production' ? 'EXTERNAL_GATED' : 'CONFIGURED',
      secret_present: 'N/A',
      detail: 'Carrier software rail is MockCarrierAdapter unless live logistics gates close (Sprint 46).',
    },
    present('jwt_access_secret', 'JWT_ACCESS_SECRET', { minLength: 32 }),
    present('otp_pepper', 'OTP_PEPPER', { minLength: 32 }),
  ];

  if (infra === 'production' && process.env['AUTH_DEV_REVEAL_OTP'] === 'true') {
    items.push({
      name: 'auth_dev_reveal_otp',
      status: 'INVALID',
      secret_present: 'N/A',
      detail: 'AUTH_DEV_REVEAL_OTP must not be enabled for production infrastructure.',
    });
  }

  const blocked = items.some((row) => row.status === 'MISSING' || row.status === 'INVALID');
  const gated = items.some((row) => row.status === 'EXTERNAL_GATED');
  return {
    environment: infra,
    items,
    overall: blocked ? 'BLOCKED' : gated ? 'EXTERNAL_GATED' : 'READY',
    never_expose_secrets: true,
  };
}