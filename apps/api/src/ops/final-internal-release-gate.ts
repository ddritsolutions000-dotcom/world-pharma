/**
 * Sprint 63 — Final INTERNAL release / launch gate.
 * Independent category statuses. Never PASS merely because an adapter exists.
 */
import { evaluateProductionInfrastructureAvailable } from './production-infrastructure-gate';
import { evaluateProductionConfigValidation } from './production-config-validator';
import { getRecoveryObjectives } from './recovery-targets';
import { listHealthcareIntegrationCatalog } from '../healthcare/production-healthcare-gate';
import { readPaymentEnvironment, isLivePaymentEnabled } from '../payment/payment.config';
import { readLogisticsEnvironment, isLiveCarrierEnabled } from '../logistics/carrier.config';
import { readCommunicationEnvironment, isLiveOtpEnabled } from '../identity/communication.config';
import { listKnownProductionDependencyCatalog } from '../platform/launch-blocker-actionability';

export type ReleaseGateStatus = 'PASS' | 'BLOCKED' | 'EXTERNAL_GATED' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';

export type ReleaseGateCategoryId =
  | 'SOFTWARE'
  | 'DATABASE'
  | 'SECURITY'
  | 'OBSERVABILITY'
  | 'BACKUP_RECOVERY'
  | 'PAYMENTS'
  | 'AUTHENTICATION_MESSAGING'
  | 'LOGISTICS'
  | 'HEALTHCARE'
  | 'PAYOUTS'
  | 'STORAGE_DOCUMENT_SECURITY'
  | 'COUNTRY_POLICY'
  | 'LEGAL_REGULATORY'
  | 'OPERATIONAL_NETWORK';

export type ReleaseGateCategory = {
  id: ReleaseGateCategoryId;
  status: ReleaseGateStatus;
  evidence: string;
  blocker: string | null;
  next_action: string;
};

export type FinalInternalReleaseGate = {
  overall_launch_ready: false;
  internal_software_ready: boolean;
  external_providers_ready: false;
  infrastructure_ready: false;
  legal_regulatory_ready: false;
  decision: 'NO — external/infrastructure/legal gates remain';
  recovery: ReturnType<typeof getRecoveryObjectives>;
  config_validation: ReturnType<typeof evaluateProductionConfigValidation>;
  categories: ReleaseGateCategory[];
  dependency_catalog_count: number;
  healthcare_integrations_external_gated: number;
  message: string;
};

function featureLiveAttempt(env: string, live: boolean): ReleaseGateStatus {
  if (env === 'production' && live) return 'EXTERNAL_GATED';
  if (env === 'production' && !live) return 'BLOCKED';
  return 'EXTERNAL_GATED'; // sandbox software OK but live provider not ready
}

export function evaluateFinalInternalReleaseGate(): FinalInternalReleaseGate {
  const infra = evaluateProductionInfrastructureAvailable();
  const config = evaluateProductionConfigValidation();
  const recovery = getRecoveryObjectives();
  const healthcare = listHealthcareIntegrationCatalog();
  const catalog = listKnownProductionDependencyCatalog();

  const hardConfigBlock = config.checks.some((c) => c.status === 'BLOCKED' && c.scope === 'ALL_PRODUCTION');
  const internalSoftwareReady = !hardConfigBlock && process.env['NODE_ENV'] !== 'test' ? true : !hardConfigBlock;

  const categories: ReleaseGateCategory[] = [
    {
      id: 'SOFTWARE',
      status: hardConfigBlock ? 'BLOCKED' : 'PASS',
      evidence: 'Nest API + Admin launch-readiness + fail-closed adapter boundaries (S44–S62).',
      blocker: hardConfigBlock ? 'Base production secrets missing/invalid' : null,
      next_action: hardConfigBlock ? 'Set required secrets via secret manager refs' : 'Keep sandbox fixtures out of production deploys',
    },
    {
      id: 'DATABASE',
      status: 'PASS',
      evidence: 'Prisma migrations + /health/ready postgres probe; local backup scripts exist.',
      blocker: null,
      next_action: 'Apply migrations on disposable/staging DB before production cutover',
    },
    {
      id: 'SECURITY',
      status: 'PASS',
      evidence: 'Audience RBAC, webhook signature sandbox, secret redaction, production webhook 503 gate.',
      blocker: null,
      next_action: 'Disable AUTH_DEV_REVEAL_OTP in staging/production',
    },
    {
      id: 'OBSERVABILITY',
      status: 'EXTERNAL_GATED',
      evidence: '/health, /health/ready, /metrics, structured logs SOFTWARE_READY; APM/pager EXTERNAL_GATED.',
      blocker: 'APM_PAGER_EXTERNAL_GATED',
      next_action: 'Connect approved monitoring/pager',
    },
    {
      id: 'BACKUP_RECOVERY',
      status: 'EXTERNAL_GATED',
      evidence: `${recovery.status}; RPO ${recovery.rpo_target}; RTO ${recovery.rto_target}; PITR ${infra.pitr}.`,
      blocker: recovery.infrastructure_status,
      next_action: 'Provision managed PITR + off-site retention + restore drill',
    },
    {
      id: 'PAYMENTS',
      status: featureLiveAttempt(readPaymentEnvironment(), isLivePaymentEnabled()),
      evidence: 'Sandbox mock PSP; production payment gate + R14-A 0/7.',
      blocker: 'PAYMENT_PROVIDER_EXTERNAL_GATED',
      next_action: 'Complete R14-A owner gates + live PSP credentials',
    },
    {
      id: 'AUTHENTICATION_MESSAGING',
      status: featureLiveAttempt(readCommunicationEnvironment(), isLiveOtpEnabled()),
      evidence: 'Sandbox/console OTP; production OTP/messaging gates fail-closed.',
      blocker: 'OTP_MESSAGING_EXTERNAL_GATED',
      next_action: 'Contract production OTP/SMS/email vendor',
    },
    {
      id: 'LOGISTICS',
      status: featureLiveAttempt(readLogisticsEnvironment(), isLiveCarrierEnabled()),
      evidence: 'Mock carrier only; NO_PRODUCTION_CARRIER_ADAPTER.',
      blocker: 'CARRIER_EXTERNAL_GATED',
      next_action: 'Register live carrier adapter + webhook secrets',
    },
    {
      id: 'HEALTHCARE',
      status: 'EXTERNAL_GATED',
      evidence: `${healthcare.length} catalog integrations all EXTERNAL_GATED (eRx/video/PACS/HL7/FHIR).`,
      blocker: 'HEALTHCARE_EXTERNAL_GATED',
      next_action: 'Authorize clinical providers per market',
    },
    {
      id: 'PAYOUTS',
      status: 'EXTERNAL_GATED',
      evidence: 'EXTERNAL_PAYOUT_GATED — accrual only, no bank execution.',
      blocker: 'EXTERNAL_PAYOUT_GATED',
      next_action: 'Authorize payout provider + compliance',
    },
    {
      id: 'STORAGE_DOCUMENT_SECURITY',
      status: 'EXTERNAL_GATED',
      evidence: `storage=${infra.storage}; malware=${infra.malware_scanning}; kms=${infra.kms_secrets}.`,
      blocker: 'STORAGE_KMS_SCANNER_EXTERNAL_GATED',
      next_action: 'Connect S3 + KMS + AV endpoint',
    },
    {
      id: 'COUNTRY_POLICY',
      status: 'EXTERNAL_GATED',
      evidence: 'Country production activation control plane; policy packs present in software.',
      blocker: 'COUNTRY_ACTIVATION_HUMAN_GATE',
      next_action: 'Activate first country only after legal + provider readiness',
    },
    {
      id: 'LEGAL_REGULATORY',
      status: 'EXTERNAL_GATED',
      evidence: 'Licensing, privacy, payments, healthcare, KYC accreditation require responsible parties.',
      blocker: 'LEGAL_REGULATORY_EXTERNAL_GATED',
      next_action: 'Complete legal/regulatory checklist outside software',
    },
    {
      id: 'OPERATIONAL_NETWORK',
      status: 'EXTERNAL_GATED',
      evidence: 'Partner/KYC/provider verification workflows exist; live registries EXTERNAL_GATED.',
      blocker: 'KYC_PROVIDER_EXTERNAL_GATED',
      next_action: 'Connect KYC + accreditation providers',
    },
  ];

  return {
    overall_launch_ready: false,
    internal_software_ready: internalSoftwareReady,
    external_providers_ready: false,
    infrastructure_ready: false,
    legal_regulatory_ready: false,
    decision: 'NO — external/infrastructure/legal gates remain',
    recovery,
    config_validation: config,
    categories,
    dependency_catalog_count: catalog.length,
    healthcare_integrations_external_gated: healthcare.length,
    message:
      'INTERNAL SOFTWARE may be ready for integration plug-in. Production launch remains blocked by EXTERNAL_GATED providers, infrastructure, and legal/regulatory gates.',
  };
}
