/**
 * Sprint 63 — Feature-scoped production configuration validator.
 * Never prints secret values. Fail-closed classification only.
 */
import { redactSecretValue } from './secret-redaction';
import {
  isLiveFileScanningEnabled,
  isLiveObjectStorageEnabled,
  readFileScanningEnvironment,
  readInfrastructureEnvironment,
  readObjectStorageEnvironment,
} from './infra-environment';
import { isLiveCarrierEnabled, readLogisticsEnvironment } from '../logistics/carrier.config';
import { isLiveOtpEnabled, readCommunicationEnvironment } from '../identity/communication.config';
import { isLivePaymentEnabled, readPaymentEnvironment } from '../payment/payment.config';
import { readHealthcareEnvironment, isLiveHealthcareEnabled } from '../healthcare/healthcare-environment';

export type ConfigFeatureScope =
  | 'ALL_PRODUCTION'
  | 'PAYMENT'
  | 'CARRIER'
  | 'OTP_MESSAGING'
  | 'ERX'
  | 'VIDEO'
  | 'PACS'
  | 'PAYOUTS'
  | 'STORAGE_KMS_SCANNER'
  | 'KYC'
  | 'COUNTRY_POLICY';

export type ConfigCheckStatus = 'PASS' | 'BLOCKED' | 'EXTERNAL_GATED' | 'NOT_APPLICABLE';

export type ConfigCheck = {
  scope: ConfigFeatureScope;
  key: string;
  status: ConfigCheckStatus;
  secret_present: 'SET' | 'MISSING' | 'N/A';
  detail: string;
  blocks_feature: boolean;
};

export type ProductionConfigValidation = {
  environment: string;
  overall: 'PASS' | 'BLOCKED' | 'EXTERNAL_GATED';
  checks: ConfigCheck[];
  blocked_features: ConfigFeatureScope[];
  message: string;
};

const PLACEHOLDER_RE = /^(changeme|todo|replace.?me|xxx+|your[_-]?secret|password|secret)$/i;

function envRaw(key: string): string | undefined {
  const v = process.env[key];
  return v?.trim() ? v : undefined;
}

function checkSecret(scope: ConfigFeatureScope, key: string, opts?: { requiredForProduction?: boolean; minLength?: number }): ConfigCheck {
  const raw = envRaw(key);
  const secret_present = redactSecretValue(raw);
  const infra = readInfrastructureEnvironment();
  if (!raw) {
    const required = Boolean(opts?.requiredForProduction) && infra === 'production';
    return {
      scope,
      key,
      status: required ? 'BLOCKED' : 'EXTERNAL_GATED',
      secret_present,
      detail: required ? `${key} missing — blocks production startup for ${scope}.` : `${key} not set (sandbox/dev may continue).`,
      blocks_feature: required,
    };
  }
  if (PLACEHOLDER_RE.test(raw.trim()) || (opts?.minLength && raw.trim().length < opts.minLength)) {
    return {
      scope,
      key,
      status: 'BLOCKED',
      secret_present: 'SET',
      detail: `${key} looks like a placeholder or is too short (value not shown).`,
      blocks_feature: true,
    };
  }
  return {
    scope,
    key,
    status: 'PASS',
    secret_present: 'SET',
    detail: `${key} present (value not shown).`,
    blocks_feature: false,
  };
}

function checkEnvFlag(
  scope: ConfigFeatureScope,
  key: string,
  reader: () => string,
  live: () => boolean,
  productionValue: string,
): ConfigCheck {
  const env = reader();
  const liveOn = live();
  if (env === productionValue && liveOn) {
    return {
      scope,
      key,
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: `${key}=${env} with live flag — live provider credentials/adapters still EXTERNAL_GATED.`,
      blocks_feature: true,
    };
  }
  if (env === productionValue && !liveOn) {
    return {
      scope,
      key,
      status: 'BLOCKED',
      secret_present: 'N/A',
      detail: `${key}=production but live flag is off — refuse silent sandbox success.`,
      blocks_feature: true,
    };
  }
  return {
    scope,
    key,
    status: 'PASS',
    secret_present: 'N/A',
    detail: `${key}=${env} (sandbox/non-live path).`,
    blocks_feature: false,
  };
}

export function evaluateProductionConfigValidation(): ProductionConfigValidation {
  const checks: ConfigCheck[] = [
    checkSecret('ALL_PRODUCTION', 'DATABASE_URL', { requiredForProduction: true, minLength: 20 }),
    checkSecret('ALL_PRODUCTION', 'REDIS_URL', { requiredForProduction: true, minLength: 8 }),
    checkSecret('ALL_PRODUCTION', 'JWT_ACCESS_SECRET', { requiredForProduction: true, minLength: 32 }),
    checkSecret('ALL_PRODUCTION', 'OTP_PEPPER', { requiredForProduction: true, minLength: 32 }),
    {
      scope: 'ALL_PRODUCTION',
      key: 'AUTH_DEV_REVEAL_OTP',
      status:
        envRaw('AUTH_DEV_REVEAL_OTP') === 'true' &&
        (readInfrastructureEnvironment() === 'production' || process.env['NODE_ENV'] === 'production')
          ? 'BLOCKED'
          : 'PASS',
      secret_present: 'N/A',
      detail:
        envRaw('AUTH_DEV_REVEAL_OTP') === 'true'
          ? 'AUTH_DEV_REVEAL_OTP must be false in production/staging.'
          : 'AUTH_DEV_REVEAL_OTP not forcing production reveal.',
      blocks_feature:
        envRaw('AUTH_DEV_REVEAL_OTP') === 'true' &&
        (readInfrastructureEnvironment() === 'production' || process.env['NODE_ENV'] === 'production'),
    },
    checkEnvFlag('PAYMENT', 'PAYMENT_ENVIRONMENT', readPaymentEnvironment, isLivePaymentEnabled, 'production'),
    checkEnvFlag('CARRIER', 'LOGISTICS_ENVIRONMENT', readLogisticsEnvironment, isLiveCarrierEnabled, 'production'),
    checkEnvFlag('OTP_MESSAGING', 'COMMUNICATION_ENVIRONMENT', readCommunicationEnvironment, isLiveOtpEnabled, 'production'),
    checkEnvFlag('STORAGE_KMS_SCANNER', 'OBJECT_STORAGE_ENVIRONMENT', readObjectStorageEnvironment, isLiveObjectStorageEnabled, 'production'),
    checkEnvFlag('STORAGE_KMS_SCANNER', 'FILE_SCANNING_ENVIRONMENT', readFileScanningEnvironment, isLiveFileScanningEnabled, 'production'),
    checkEnvFlag('ERX', 'HEALTHCARE_ENVIRONMENT', readHealthcareEnvironment, isLiveHealthcareEnabled, 'production'),
    {
      scope: 'VIDEO',
      key: 'VIDEO_PROVIDER',
      status: 'EXTERNAL_GATED',
      secret_present: envRaw('LIVEKIT_API_SECRET') ? 'SET' : 'MISSING',
      detail: 'Live clinical video remains EXTERNAL_GATED regardless of sandbox LiveKit refs.',
      blocks_feature: true,
    },
    {
      scope: 'PACS',
      key: 'PACS_DICOM',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'PACS/DICOM viewer/integration not registered — EXTERNAL_GATED.',
      blocks_feature: true,
    },
    {
      scope: 'PAYOUTS',
      key: 'AFFILIATE_PAYOUT',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'Affiliate/bank payout rail EXTERNAL_PAYOUT_GATED.',
      blocks_feature: true,
    },
    {
      scope: 'KYC',
      key: 'KYC_PROVIDER',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'Live KYC provider EXTERNAL_GATED.',
      blocks_feature: true,
    },
    {
      scope: 'COUNTRY_POLICY',
      key: 'COUNTRY_PRODUCTION_ACTIVATION',
      status: 'EXTERNAL_GATED',
      secret_present: 'N/A',
      detail: 'Country activation requires control-plane + legal evidence — not auto-enabled.',
      blocks_feature: true,
    },
    checkSecret('STORAGE_KMS_SCANNER', 'SECRET_MANAGER_REF', { requiredForProduction: false }),
    checkSecret('STORAGE_KMS_SCANNER', 'KMS_KEY_REF', { requiredForProduction: false }),
  ];

  const blocked_features = [...new Set(checks.filter((c) => c.blocks_feature).map((c) => c.scope))];
  const hardBlock = checks.some((c) => c.status === 'BLOCKED' && c.scope === 'ALL_PRODUCTION');
  const overall: ProductionConfigValidation['overall'] = hardBlock
    ? 'BLOCKED'
    : checks.some((c) => c.status === 'EXTERNAL_GATED' || c.blocks_feature)
      ? 'EXTERNAL_GATED'
      : 'PASS';

  return {
    environment: readInfrastructureEnvironment(),
    overall,
    checks,
    blocked_features,
    message:
      overall === 'PASS'
        ? 'Base secrets present; feature providers may still be EXTERNAL_GATED.'
        : 'Configuration validation fail-closed for production-critical gaps; external providers remain gated.',
  };
}
