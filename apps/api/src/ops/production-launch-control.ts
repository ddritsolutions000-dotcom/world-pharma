/**
 * Sprint 87 — Production launch control + external-gate orchestration.
 * Aggregates existing S64–S86 activation rails. Never invents providers or enables live rails.
 * CAN_PRODUCTION_LAUNCH stays NO while any mandatory rail is unresolved.
 * Force-launch overrides do not exist.
 */
import { randomUUID } from 'node:crypto';
import { evaluatePspFirstOnboarding } from '../payment/psp-first-onboarding';
import { evaluateMessagingFirstOnboarding } from '../identity/messaging-first-onboarding';
import { evaluateCarrierFirstOnboarding } from '../logistics/carrier-first-onboarding';
import { evaluateErxFirstOnboarding } from '../clinical/erx-first-onboarding';
import { evaluateVideoFirstOnboarding } from '../clinical/video-first-onboarding';
import { evaluatePacsFirstOnboarding } from '../radiology/pacs-first-onboarding';
import { evaluateKycFirstOnboarding } from '../partner/kyc-first-onboarding';
import { evaluateProductionStorageFirstOnboarding } from './production-storage-first-onboarding';
import { evaluateProductionBackupFirstOnboarding } from './production-backup-first-onboarding';
import { evaluateObservabilityFirstOnboarding } from './observability-first-onboarding';
import { evaluateProductionSecretsEnvFirstOnboarding } from './production-secrets-env-first-onboarding';
import { evaluateProductionDeploymentFirstOnboarding } from './production-deployment-first-onboarding';
import { evaluateAllProviderActivations } from './provider-activation';

export type LaunchRailId =
  | 'PSP'
  | 'OTP'
  | 'SMS'
  | 'EMAIL'
  | 'PUSH'
  | 'CARRIER'
  | 'ERX'
  | 'VIDEO'
  | 'PACS'
  | 'KYC_KYB'
  | 'PRIVATE_STORAGE'
  | 'KMS'
  | 'MALWARE_SCANNER'
  | 'MANAGED_BACKUP'
  | 'PITR'
  | 'DR_ENVIRONMENT'
  | 'APM'
  | 'MONITORING'
  | 'ALERTING'
  | 'SECRETS_ENV'
  | 'DEPLOYMENT';

export type LaunchGroupId =
  | 'PAYMENTS'
  | 'COMMUNICATIONS'
  | 'LOGISTICS'
  | 'CLINICAL'
  | 'PARTNER_VERIFICATION'
  | 'DATA_SECURITY'
  | 'BACKUP_DR'
  | 'OBSERVABILITY'
  | 'PLATFORM_CONFIG';

export type LaunchApplicability = 'MANDATORY' | 'OPTIONAL' | 'NOT_APPLICABLE' | 'MARKET_SPECIFIC';

export type LaunchBlockerCategory =
  | 'EXTERNAL_GATED'
  | 'LEGAL_GATED'
  | 'POLICY_REQUIRED'
  | 'NOT_SELECTED'
  | 'NOT_YET_PROVEN'
  | 'CONFIGURATION_REQUIRED'
  | 'SECURITY_REQUIRED'
  | 'DEVICE_NOT_AVAILABLE';

export type LaunchServiceScope =
  | 'GLOBAL'
  | 'MEDICINE_COMMERCE'
  | 'LABS'
  | 'DOCTOR_CONSULTATION'
  | 'ERX'
  | 'IMAGING'
  | 'DELIVERY'
  | 'AFFILIATE';

export type CanonicalLaunchRail = {
  rail_id: LaunchRailId;
  group: LaunchGroupId;
  label: string;
  provider_name: string;
  stage: string;
  enabled: boolean;
  sandbox_status: string;
  production_status: string;
  blocker_codes: string[];
  blocker_category: LaunchBlockerCategory;
  applicability_default: LaunchApplicability;
  source: string;
  notes: string[];
};

export type LaunchControlEvaluation = {
  sprint: 87;
  foundation_sprints: string;
  evaluated_at: string;
  correlation_id: string;
  market: string;
  service_scope: LaunchServiceScope;
  can_production_launch: 'YES' | 'NO';
  overall_status: 'NOT_READY' | 'READY';
  decision: string;
  force_launch_available: false;
  rails: CanonicalLaunchRail[];
  groups: Array<{
    id: LaunchGroupId;
    label: string;
    rails: LaunchRailId[];
    blocked: boolean;
    blockers: string[];
  }>;
  active_blockers: Array<{
    rail_id: LaunchRailId;
    code: string;
    category: LaunchBlockerCategory;
    applicability: LaunchApplicability;
  }>;
  mandatory_unresolved: string[];
  not_applicable_rails: LaunchRailId[];
  provider_activation_any_live_enabled: boolean;
  semantic_guards: {
    sandbox_verified_is_not_production_ready: true;
    target_defined_is_not_verified: true;
    not_selected_is_not_outage: true;
    responsive_web_is_not_native: true;
    mock_is_not_production: true;
  };
  secrets_printed: false;
  message: string;
};

/** Policy-config style service requirements — not legal truth; markets may mark N/A. */
export const SERVICE_RAIL_REQUIREMENTS: Record<
  LaunchServiceScope,
  Partial<Record<LaunchRailId, LaunchApplicability>>
> = {
  GLOBAL: {
    PSP: 'MANDATORY',
    OTP: 'MANDATORY',
    SMS: 'MANDATORY',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'MANDATORY',
    ERX: 'OPTIONAL',
    VIDEO: 'OPTIONAL',
    PACS: 'OPTIONAL',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  MEDICINE_COMMERCE: {
    PSP: 'MANDATORY',
    OTP: 'MANDATORY',
    SMS: 'MANDATORY',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'MANDATORY',
    ERX: 'NOT_APPLICABLE',
    VIDEO: 'NOT_APPLICABLE',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  LABS: {
    PSP: 'MANDATORY',
    OTP: 'MANDATORY',
    SMS: 'OPTIONAL',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'OPTIONAL',
    ERX: 'NOT_APPLICABLE',
    VIDEO: 'NOT_APPLICABLE',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  DOCTOR_CONSULTATION: {
    PSP: 'OPTIONAL',
    OTP: 'MANDATORY',
    SMS: 'OPTIONAL',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'NOT_APPLICABLE',
    ERX: 'MARKET_SPECIFIC',
    VIDEO: 'MANDATORY',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  ERX: {
    PSP: 'NOT_APPLICABLE',
    OTP: 'MANDATORY',
    SMS: 'OPTIONAL',
    EMAIL: 'OPTIONAL',
    PUSH: 'NOT_APPLICABLE',
    CARRIER: 'NOT_APPLICABLE',
    ERX: 'MANDATORY',
    VIDEO: 'OPTIONAL',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  IMAGING: {
    PSP: 'MANDATORY',
    OTP: 'MANDATORY',
    SMS: 'OPTIONAL',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'OPTIONAL',
    ERX: 'NOT_APPLICABLE',
    VIDEO: 'NOT_APPLICABLE',
    PACS: 'MANDATORY',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'MANDATORY',
    KMS: 'MANDATORY',
    MALWARE_SCANNER: 'MANDATORY',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  DELIVERY: {
    PSP: 'OPTIONAL',
    OTP: 'MANDATORY',
    SMS: 'MANDATORY',
    EMAIL: 'OPTIONAL',
    PUSH: 'OPTIONAL',
    CARRIER: 'MANDATORY',
    ERX: 'NOT_APPLICABLE',
    VIDEO: 'NOT_APPLICABLE',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'OPTIONAL',
    PRIVATE_STORAGE: 'OPTIONAL',
    KMS: 'OPTIONAL',
    MALWARE_SCANNER: 'OPTIONAL',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
  AFFILIATE: {
    PSP: 'NOT_APPLICABLE',
    OTP: 'MANDATORY',
    SMS: 'OPTIONAL',
    EMAIL: 'MANDATORY',
    PUSH: 'OPTIONAL',
    CARRIER: 'NOT_APPLICABLE',
    ERX: 'NOT_APPLICABLE',
    VIDEO: 'NOT_APPLICABLE',
    PACS: 'NOT_APPLICABLE',
    KYC_KYB: 'MANDATORY',
    PRIVATE_STORAGE: 'OPTIONAL',
    KMS: 'OPTIONAL',
    MALWARE_SCANNER: 'OPTIONAL',
    MANAGED_BACKUP: 'MANDATORY',
    PITR: 'MANDATORY',
    DR_ENVIRONMENT: 'MANDATORY',
    APM: 'MANDATORY',
    MONITORING: 'MANDATORY',
    ALERTING: 'MANDATORY',
    SECRETS_ENV: 'MANDATORY',
    DEPLOYMENT: 'MANDATORY',
  },
};

const GROUP_LABELS: Record<LaunchGroupId, string> = {
  PAYMENTS: 'Payments',
  COMMUNICATIONS: 'Communications',
  LOGISTICS: 'Logistics',
  CLINICAL: 'Clinical',
  PARTNER_VERIFICATION: 'Partner verification',
  DATA_SECURITY: 'Data security',
  BACKUP_DR: 'Backup / DR',
  OBSERVABILITY: 'Observability',
  PLATFORM_CONFIG: 'Platform configuration',
};

function classifyBlocker(codes: string[], productionStatus: string): LaunchBlockerCategory {
  const blob = `${codes.join(' ')} ${productionStatus}`;
  if (/LEGAL_GATED|LEGAL_REVIEW/i.test(blob)) return 'LEGAL_GATED';
  if (/POLICY_REQUIRED/i.test(blob)) return 'POLICY_REQUIRED';
  if (/NOT_YET_PROVEN|TARGET_DEFINED/i.test(blob)) return 'NOT_YET_PROVEN';
  if (/DEVICE_NOT_AVAILABLE/i.test(blob)) return 'DEVICE_NOT_AVAILABLE';
  if (/SECURITY/i.test(blob)) return 'SECURITY_REQUIRED';
  if (/NOT_SELECTED/i.test(blob) && !/NO_PRODUCTION_/i.test(blob)) return 'NOT_SELECTED';
  if (/EXTERNAL_GATED|NO_PRODUCTION_/i.test(blob)) return 'EXTERNAL_GATED';
  if (/CONFIG/i.test(blob)) return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

function railUnresolved(rail: CanonicalLaunchRail, applicability: LaunchApplicability): boolean {
  if (applicability === 'NOT_APPLICABLE' || applicability === 'OPTIONAL') return false;
  if (applicability === 'MARKET_SPECIFIC') {
    // Until country policy explicitly marks N/A, market-specific rails remain blocking.
    return !rail.enabled;
  }
  if (rail.enabled) return false;
  if (/^ENABLED$/i.test(rail.production_status)) return false;
  return true;
}

function mkRail(
  partial: Omit<CanonicalLaunchRail, 'blocker_category'> & { blocker_category?: LaunchBlockerCategory },
): CanonicalLaunchRail {
  return {
    ...partial,
    blocker_category:
      partial.blocker_category ??
      classifyBlocker(partial.blocker_codes, partial.production_status),
  };
}

/** Aggregate existing onboarding reports into canonical launch rails. */
export function buildCanonicalLaunchRails(): CanonicalLaunchRail[] {
  const psp = evaluatePspFirstOnboarding();
  const msg = evaluateMessagingFirstOnboarding();
  const carrier = evaluateCarrierFirstOnboarding();
  const erx = evaluateErxFirstOnboarding();
  const video = evaluateVideoFirstOnboarding();
  const pacs = evaluatePacsFirstOnboarding();
  const kyc = evaluateKycFirstOnboarding();
  const storage = evaluateProductionStorageFirstOnboarding();
  const backup = evaluateProductionBackupFirstOnboarding();
  const obs = evaluateObservabilityFirstOnboarding();
  const secretsEnv = evaluateProductionSecretsEnvFirstOnboarding();
  const deployment = evaluateProductionDeploymentFirstOnboarding();

  const otp = msg.otp;
  const sms = msg.sms;
  const email = msg.email;
  const push = msg.push;

  const kycBlockers = kyc.remaining_blockers?.length
    ? kyc.remaining_blockers
    : [kyc.remaining_blocker];

  return [
    mkRail({
      rail_id: 'PSP',
      group: 'PAYMENTS',
      label: 'PSP / Payments',
      provider_name: psp.provider,
      stage: String(psp.activation_stage),
      enabled: psp.enabled,
      sandbox_status: String(psp.sandbox_status ?? psp.sandbox),
      production_status: String(psp.production),
      blocker_codes: psp.remaining_blockers?.length ? psp.remaining_blockers : [psp.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'psp-first-onboarding / PAYMENTS_PSP',
      notes: ['Mock payment ≠ real payment', 'SANDBOX_VERIFIED ≠ PRODUCTION_READY'],
    }),
    mkRail({
      rail_id: 'OTP',
      group: 'COMMUNICATIONS',
      label: 'OTP',
      provider_name: otp.provider,
      stage: otp.activation_stage,
      enabled: otp.enabled,
      sandbox_status: otp.sandbox,
      production_status: otp.production,
      blocker_codes: [otp.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'messaging-first-onboarding / OTP_AUTH',
      notes: ['Console OTP ≠ production OTP delivery'],
    }),
    mkRail({
      rail_id: 'SMS',
      group: 'COMMUNICATIONS',
      label: 'SMS',
      provider_name: sms.provider,
      stage: sms.activation_stage,
      enabled: sms.enabled,
      sandbox_status: sms.sandbox,
      production_status: sms.production,
      blocker_codes: [sms.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'messaging-first-onboarding / MESSAGING',
      notes: ['SENT ≠ DELIVERED'],
    }),
    mkRail({
      rail_id: 'EMAIL',
      group: 'COMMUNICATIONS',
      label: 'Email',
      provider_name: email.provider,
      stage: email.activation_stage,
      enabled: email.enabled,
      sandbox_status: email.sandbox,
      production_status: email.production,
      blocker_codes: [email.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'messaging-first-onboarding / MESSAGING',
      notes: [],
    }),
    mkRail({
      rail_id: 'PUSH',
      group: 'COMMUNICATIONS',
      label: 'Push',
      provider_name: push.provider,
      stage: push.activation_stage,
      enabled: push.enabled,
      sandbox_status: push.sandbox,
      production_status: push.production,
      blocker_codes: [push.remaining_blocker],
      blocker_category: 'DEVICE_NOT_AVAILABLE',
      applicability_default: 'OPTIONAL',
      source: 'messaging-first-onboarding',
      notes: ['RESPONSIVE_WEB_VERIFIED ≠ NATIVE_VERIFIED', 'DEVICE_NOT_AVAILABLE'],
    }),
    mkRail({
      rail_id: 'CARRIER',
      group: 'LOGISTICS',
      label: 'Carrier / Logistics',
      provider_name: carrier.provider,
      stage: String(carrier.activation_stage),
      enabled: carrier.enabled,
      sandbox_status: String(carrier.sandbox),
      production_status: String(carrier.production),
      blocker_codes: carrier.remaining_blockers?.length
        ? carrier.remaining_blockers
        : [carrier.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'carrier-first-onboarding / CARRIER',
      notes: ['Mock carrier ≠ production carrier'],
    }),
    mkRail({
      rail_id: 'ERX',
      group: 'CLINICAL',
      label: 'eRx',
      provider_name: erx.provider,
      stage: String(erx.activation_stage),
      enabled: erx.enabled,
      sandbox_status: String(erx.sandbox),
      production_status: String(erx.production),
      blocker_codes: erx.remaining_blockers?.length
        ? erx.remaining_blockers
        : [erx.remaining_blocker],
      applicability_default: 'OPTIONAL',
      source: 'erx-first-onboarding / ERX',
      notes: ['Internal Rx ≠ legal eRx transmission'],
    }),
    mkRail({
      rail_id: 'VIDEO',
      group: 'CLINICAL',
      label: 'Telemedicine / Video',
      provider_name: video.provider,
      stage: String(video.activation_stage),
      enabled: video.enabled,
      sandbox_status: String(video.sandbox),
      production_status: String(video.production),
      blocker_codes: video.remaining_blockers?.length
        ? video.remaining_blockers
        : [video.remaining_blocker],
      applicability_default: 'OPTIONAL',
      source: 'video-first-onboarding / VIDEO',
      notes: ['Sandbox video ≠ production video'],
    }),
    mkRail({
      rail_id: 'PACS',
      group: 'CLINICAL',
      label: 'PACS / DICOM',
      provider_name: pacs.provider,
      stage: String(pacs.activation_stage),
      enabled: pacs.enabled,
      sandbox_status: String(pacs.sandbox),
      production_status: String(pacs.production),
      blocker_codes: pacs.remaining_blockers?.length
        ? pacs.remaining_blockers
        : [pacs.remaining_blocker],
      applicability_default: 'OPTIONAL',
      source: 'pacs-first-onboarding / PACS_DICOM',
      notes: ['Sandbox PACS ≠ production PACS'],
    }),
    mkRail({
      rail_id: 'KYC_KYB',
      group: 'PARTNER_VERIFICATION',
      label: 'KYC / KYB',
      provider_name: kyc.provider,
      stage: String(kyc.activation_stage),
      enabled: kyc.enabled,
      sandbox_status: String(kyc.sandbox),
      production_status: String(kyc.production),
      blocker_codes: kycBlockers,
      applicability_default: 'MANDATORY',
      source: 'kyc-first-onboarding / KYC',
      notes: ['Manual sandbox KYC ≠ production KYC/KYB provider'],
    }),
    mkRail({
      rail_id: 'PRIVATE_STORAGE',
      group: 'DATA_SECURITY',
      label: 'Private Storage',
      provider_name: storage.object_storage.provider,
      stage: storage.object_storage.activation_stage,
      enabled: storage.object_storage.enabled,
      sandbox_status: storage.object_storage.sandbox,
      production_status: storage.object_storage.production,
      blocker_codes: storage.object_storage.remaining_blockers?.length
        ? storage.object_storage.remaining_blockers
        : [storage.object_storage.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'production-storage-first-onboarding / OBJECT_STORAGE',
      notes: ['Local storage ≠ production private storage'],
    }),
    mkRail({
      rail_id: 'KMS',
      group: 'DATA_SECURITY',
      label: 'KMS',
      provider_name: storage.kms.provider,
      stage: storage.kms.activation_stage,
      enabled: storage.kms.enabled,
      sandbox_status: storage.kms.sandbox,
      production_status: storage.kms.production,
      blocker_codes: storage.kms.remaining_blockers?.length
        ? storage.kms.remaining_blockers
        : [storage.kms.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'production-storage-first-onboarding / KMS',
      notes: [],
    }),
    mkRail({
      rail_id: 'MALWARE_SCANNER',
      group: 'DATA_SECURITY',
      label: 'Malware Scanner',
      provider_name: storage.malware_scanning.provider,
      stage: storage.malware_scanning.activation_stage,
      enabled: storage.malware_scanning.enabled,
      sandbox_status: storage.malware_scanning.sandbox,
      production_status: storage.malware_scanning.production,
      blocker_codes: storage.malware_scanning.remaining_blockers?.length
        ? storage.malware_scanning.remaining_blockers
        : [storage.malware_scanning.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'production-storage-first-onboarding / MALWARE_SCANNER',
      notes: [],
    }),
    mkRail({
      rail_id: 'MANAGED_BACKUP',
      group: 'BACKUP_DR',
      label: 'Managed Backup',
      provider_name: backup.backup.provider,
      stage: backup.backup.activation_stage,
      enabled: backup.backup.enabled,
      sandbox_status: backup.backup.sandbox,
      production_status: backup.backup.production,
      blocker_codes: backup.backup.remaining_blockers?.length
        ? backup.backup.remaining_blockers
        : [backup.backup.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'production-backup-first-onboarding',
      notes: ['pg_dump ≠ production managed backup'],
    }),
    mkRail({
      rail_id: 'PITR',
      group: 'BACKUP_DR',
      label: 'PITR',
      provider_name: backup.pitr.provider,
      stage: backup.pitr.activation_stage,
      enabled: backup.pitr.enabled,
      sandbox_status: backup.pitr.sandbox,
      production_status: backup.pitr.production,
      blocker_codes: backup.pitr.remaining_blockers?.length
        ? backup.pitr.remaining_blockers
        : [backup.pitr.remaining_blocker],
      blocker_category: 'NOT_YET_PROVEN',
      applicability_default: 'MANDATORY',
      source: 'production-backup-first-onboarding',
      notes: ['TARGET_DEFINED ≠ VERIFIED / NOT_YET_PROVEN', 'pg_dump ≠ production PITR'],
    }),
    mkRail({
      rail_id: 'DR_ENVIRONMENT',
      group: 'BACKUP_DR',
      label: 'Disaster Recovery Environment',
      provider_name: backup.dr_environment.provider,
      stage: backup.dr_environment.activation_stage,
      enabled: backup.dr_environment.enabled,
      sandbox_status: backup.dr_environment.sandbox,
      production_status: backup.dr_environment.production,
      blocker_codes: backup.dr_environment.remaining_blockers?.length
        ? backup.dr_environment.remaining_blockers
        : [backup.dr_environment.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'production-backup-first-onboarding / dr_runbook',
      notes: [],
    }),
    mkRail({
      rail_id: 'APM',
      group: 'OBSERVABILITY',
      label: 'APM',
      provider_name: obs.apm.provider,
      stage: obs.apm.enabled ? 'ENABLED' : 'NOT_SELECTED',
      enabled: obs.apm.enabled,
      sandbox_status: obs.apm.sandbox,
      production_status: obs.apm.production,
      blocker_codes: obs.apm.remaining_blockers?.length
        ? obs.apm.remaining_blockers
        : [obs.apm.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'observability-first-onboarding / MONITORING_APM',
      notes: ['NOT_SELECTED ≠ outage', 'in-process /metrics ≠ production APM'],
    }),
    mkRail({
      rail_id: 'MONITORING',
      group: 'OBSERVABILITY',
      label: 'Monitoring',
      provider_name: obs.monitoring.provider,
      stage: obs.monitoring.enabled ? 'ENABLED' : 'NOT_SELECTED',
      enabled: obs.monitoring.enabled,
      sandbox_status: obs.monitoring.sandbox,
      production_status: obs.monitoring.production,
      blocker_codes: obs.monitoring.remaining_blockers?.length
        ? obs.monitoring.remaining_blockers
        : [obs.monitoring.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'observability-first-onboarding',
      notes: [],
    }),
    mkRail({
      rail_id: 'ALERTING',
      group: 'OBSERVABILITY',
      label: 'Alerting',
      provider_name: obs.alerting_rail.provider,
      stage: obs.alerting_rail.enabled ? 'ENABLED' : 'NOT_SELECTED',
      enabled: obs.alerting_rail.enabled,
      sandbox_status: obs.alerting_rail.sandbox,
      production_status: obs.alerting_rail.production,
      blocker_codes: obs.alerting_rail.remaining_blockers?.length
        ? obs.alerting_rail.remaining_blockers
        : [obs.alerting_rail.remaining_blocker],
      applicability_default: 'MANDATORY',
      source: 'observability-first-onboarding',
      notes: ['THRESHOLD_REQUIRES_PRODUCTION_BASELINE'],
    }),
    mkRail({
      rail_id: 'SECRETS_ENV',
      group: 'PLATFORM_CONFIG',
      label: 'Secrets / Environment Configuration',
      provider_name: secretsEnv.provider,
      stage: secretsEnv.activation_lifecycle,
      enabled: secretsEnv.enabled,
      sandbox_status: secretsEnv.sandbox,
      production_status: secretsEnv.production,
      blocker_codes: secretsEnv.remaining_blockers.slice(0, 8),
      blocker_category: 'CONFIGURATION_REQUIRED',
      applicability_default: 'MANDATORY',
      source: 'production-secrets-env-first-onboarding',
      notes: [
        'SECRET ≠ CONFIGURATION',
        'sandbox credential ≠ production activation',
        'NEXT_PUBLIC_/EXPO_PUBLIC_ must not carry secrets',
      ],
    }),
    mkRail({
      rail_id: 'DEPLOYMENT',
      group: 'PLATFORM_CONFIG',
      label: 'Deployment / Release Engineering',
      provider_name: deployment.provider,
      stage: deployment.activation_lifecycle,
      enabled: deployment.enabled,
      sandbox_status: deployment.sandbox,
      production_status: deployment.production,
      blocker_codes: deployment.remaining_blockers.slice(0, 8),
      applicability_default: 'MANDATORY',
      source: 'production-deployment-first-onboarding',
      notes: [
        'BUILDABLE ≠ DEPLOYABLE ≠ LAUNCH-READY',
        'CI green ≠ production deployed',
        'Docker image ≠ production rollout',
        'no force-deploy bypass',
      ],
    }),
  ];
}

export function evaluateProductionLaunchControl(input?: {
  market?: string;
  service_scope?: LaunchServiceScope;
  correlation_id?: string;
  /** Test-only: override applicability for one rail without mutating real providers. */
  applicability_overrides?: Partial<Record<LaunchRailId, LaunchApplicability>>;
}): LaunchControlEvaluation {
  const market = (input?.market ?? 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
  const service_scope = input?.service_scope ?? 'GLOBAL';
  const requirements = {
    ...SERVICE_RAIL_REQUIREMENTS[service_scope],
    ...(input?.applicability_overrides ?? {}),
  };
  const rails = buildCanonicalLaunchRails();
  const matrix = evaluateAllProviderActivations();
  const active_blockers: LaunchControlEvaluation['active_blockers'] = [];
  const mandatory_unresolved: string[] = [];
  const not_applicable_rails: LaunchRailId[] = [];

  for (const rail of rails) {
    const applicability = requirements[rail.rail_id] ?? rail.applicability_default ?? 'OPTIONAL';
    if (applicability === 'NOT_APPLICABLE') {
      not_applicable_rails.push(rail.rail_id);
      continue;
    }
    if (railUnresolved(rail, applicability)) {
      for (const code of rail.blocker_codes) {
        active_blockers.push({
          rail_id: rail.rail_id,
          code,
          category:
            applicability === 'MARKET_SPECIFIC' ? 'POLICY_REQUIRED' : rail.blocker_category,
          applicability,
        });
      }
      if (applicability === 'MANDATORY' || applicability === 'MARKET_SPECIFIC') {
        mandatory_unresolved.push(...rail.blocker_codes);
      }
    }
  }

  const decisionLaunch: 'YES' | 'NO' = mandatory_unresolved.length === 0 ? 'YES' : 'NO';

  const groupIds: LaunchGroupId[] = [
    'PAYMENTS',
    'COMMUNICATIONS',
    'LOGISTICS',
    'CLINICAL',
    'PARTNER_VERIFICATION',
    'DATA_SECURITY',
    'BACKUP_DR',
    'OBSERVABILITY',
    'PLATFORM_CONFIG',
  ];

  const groups = groupIds.map((id) => {
    const groupRails = rails.filter((r) => r.group === id);
    const blockers = active_blockers
      .filter((b) => groupRails.some((r) => r.rail_id === b.rail_id))
      .map((b) => b.code);
    return {
      id,
      label: GROUP_LABELS[id],
      rails: groupRails.map((r) => r.rail_id),
      blocked: blockers.length > 0,
      blockers: [...new Set(blockers)],
    };
  });

  return {
    sprint: 87,
    foundation_sprints: 'S64–S86',
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id ?? randomUUID(),
    market,
    service_scope,
    can_production_launch: decisionLaunch,
    overall_status: decisionLaunch === 'YES' ? 'READY' : 'NOT_READY',
    decision:
      decisionLaunch === 'YES'
        ? 'YES — all mandatory rails ENABLED for scope (unexpected in current environment)'
        : 'NO — mandatory external / policy / not-yet-proven gates remain unresolved',
    force_launch_available: false,
    rails,
    groups,
    active_blockers,
    mandatory_unresolved: [...new Set(mandatory_unresolved)],
    not_applicable_rails,
    provider_activation_any_live_enabled: matrix.overall_any_live_enabled,
    semantic_guards: {
      sandbox_verified_is_not_production_ready: true,
      target_defined_is_not_verified: true,
      not_selected_is_not_outage: true,
      responsive_web_is_not_native: true,
      mock_is_not_production: true,
    },
    secrets_printed: false,
    message:
      decisionLaunch === 'NO'
        ? `World-Pharma production launch control: NOT READY for market=${market} service=${service_scope}. Sandbox verification is not production readiness. No force-launch bypass.`
        : `World-Pharma production launch control: READY for market=${market} service=${service_scope}.`,
  };
}
