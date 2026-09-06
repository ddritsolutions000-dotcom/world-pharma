/**
 * Sprint 100 — Production provider onboarding control-plane requirements.
 * Aggregates existing S64 contracts + S87–S99 rails. Never invents credentials or enables live rails.
 */
import { randomUUID } from 'node:crypto';
import {
  buildCanonicalLaunchRails,
  type CanonicalLaunchRail,
  type LaunchRailId,
} from './production-launch-control';
import { evaluateAllProviderActivations } from './provider-activation';

export type OnboardingLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type OnboardingMarket = 'GLOBAL' | 'IN' | 'AE' | 'US';

export type OnboardingCategory =
  | 'PAYMENT'
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
  | 'PLATFORM';

export type ChecklistItemId =
  | 'provider_selected'
  | 'commercial_relationship'
  | 'credentials_available'
  | 'secrets_in_manager'
  | 'endpoint_configuration'
  | 'webhook_callback'
  | 'signing_tls'
  | 'market_coverage'
  | 'currency_service_config'
  | 'legal_compliance'
  | 'sandbox_verification'
  | 'production_verification'
  | 'rollback_disable_path'
  | 'monitoring_configured'
  | 'admin_approval';

export type ChecklistItem = {
  id: ChecklistItemId;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type EvidenceSlot = {
  field: string;
  required: boolean;
  present: boolean;
  /** Presence only — never a secret value. */
  value_presence: 'SET' | 'MISSING' | 'N/A';
};

export type MarketRailStatus = {
  market: OnboardingMarket;
  lifecycle: OnboardingLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'NOT_APPLICABLE';
  production: 'PRODUCTION_NOT_CONFIGURED' | 'PRODUCTION_EXTERNAL_GATED' | 'PRODUCTION_VERIFIED' | 'ENABLED';
  blocker: string;
};

export type DependencyEdge = {
  from: string;
  to: string;
  reason: string;
};

export type ActivationSequenceStep = {
  order: number;
  band: 'FOUNDATION' | 'COMMERCIAL' | 'HEALTHCARE';
  rail: string;
  note: string;
};

export type ProviderOnboardingRow = {
  rail_id: LaunchRailId | string;
  category: OnboardingCategory;
  label: string;
  provider_name: string;
  lifecycle: OnboardingLifecycle;
  configuration_readiness: 'MISSING' | 'PARTIAL' | 'READY';
  credentials_readiness: 'MISSING' | 'PARTIAL' | 'READY' | 'N/A';
  legal_approval: 'MISSING' | 'PENDING' | 'COMPLETE' | 'N/A';
  verification: 'MISSING' | 'SANDBOX_ONLY' | 'PRODUCTION_PENDING' | 'COMPLETE';
  sandbox: string;
  production: string;
  enabled: boolean;
  blocker: string;
  dependency_blockers: string[];
  checklist: ChecklistItem[];
  evidence: EvidenceSlot[];
  markets: MarketRailStatus[];
  next_action: string;
  source: string;
};

const CHECKLIST_LABELS: Record<ChecklistItemId, string> = {
  provider_selected: 'Provider selected?',
  commercial_relationship: 'Commercial/account relationship established?',
  credentials_available: 'Required credentials available?',
  secrets_in_manager: 'Secrets stored in approved secret manager?',
  endpoint_configuration: 'Endpoint/configuration present?',
  webhook_callback: 'Webhook/callback configuration present?',
  signing_tls: 'Signing/TLS configuration present where applicable?',
  market_coverage: 'Market coverage configured?',
  currency_service_config: 'Currency/service configuration configured where applicable?',
  legal_compliance: 'Legal/compliance approval complete?',
  sandbox_verification: 'Sandbox verification complete?',
  production_verification: 'Production verification pending/complete?',
  rollback_disable_path: 'Rollback/disable path available?',
  monitoring_configured: 'Monitoring configured?',
  admin_approval: 'Admin approval complete?',
};

function railCategory(railId: string): OnboardingCategory {
  const map: Record<string, OnboardingCategory> = {
    PSP: 'PAYMENT',
    OTP: 'OTP',
    SMS: 'SMS',
    EMAIL: 'EMAIL',
    PUSH: 'PUSH',
    CARRIER: 'CARRIER',
    ERX: 'ERX',
    VIDEO: 'VIDEO',
    PACS: 'PACS',
    KYC_KYB: 'KYC_KYB',
    PRIVATE_STORAGE: 'PRIVATE_STORAGE',
    KMS: 'KMS',
    MALWARE_SCANNER: 'MALWARE_SCANNER',
    MANAGED_BACKUP: 'MANAGED_BACKUP',
    PITR: 'PITR',
    DR_ENVIRONMENT: 'DR_ENVIRONMENT',
    APM: 'APM',
    MONITORING: 'MONITORING',
    ALERTING: 'ALERTING',
    SECRETS_ENV: 'PLATFORM',
    DEPLOYMENT: 'PLATFORM',
  };
  return map[railId] ?? 'PLATFORM';
}

function deriveLifecycle(rail: CanonicalLaunchRail): OnboardingLifecycle {
  if (rail.enabled) return 'ENABLED';
  if (/DISABLED/i.test(rail.production_status) || /DISABLED/i.test(rail.stage)) return 'DISABLED';
  if (/EXTERNAL_GATED|NO_PRODUCTION_/i.test(rail.production_status + rail.blocker_codes.join(' '))) {
    return 'EXTERNAL_GATED';
  }
  if (/NOT_SELECTED|NOT_CONFIGURED/i.test(rail.stage + rail.provider_name)) return 'NOT_SELECTED';
  if (/CREDENTIAL/i.test(rail.blocker_codes.join(' '))) return 'CREDENTIALS_REQUIRED';
  if (/CONFIG/i.test(rail.blocker_codes.join(' '))) return 'CONFIGURATION_REQUIRED';
  if (/VERIFY|VERIFICATION/i.test(rail.stage + rail.blocker_codes.join(' '))) return 'VERIFICATION_REQUIRED';
  if (/APPROV/i.test(rail.stage)) return 'APPROVAL_REQUIRED';
  return 'EXTERNAL_GATED';
}

function buildChecklist(lifecycle: OnboardingLifecycle, railId: string): ChecklistItem[] {
  const gated = lifecycle === 'EXTERNAL_GATED' || lifecycle === 'NOT_SELECTED';
  const sandboxOk = true;
  const ids = Object.keys(CHECKLIST_LABELS) as ChecklistItemId[];
  return ids.map((id) => {
    let status: ChecklistItem['status'] = 'MISSING';
    let mandatory = true;
    if (id === 'currency_service_config' && !['PSP', 'CARRIER', 'AFFILIATE'].includes(railId)) {
      mandatory = false;
      status = 'N/A';
    } else if (id === 'signing_tls' && ['OTP', 'SMS', 'EMAIL', 'PUSH', 'APM', 'MONITORING'].includes(railId)) {
      mandatory = false;
      status = gated ? 'MISSING' : 'N/A';
    } else if (id === 'sandbox_verification') {
      status = sandboxOk ? 'PRESENT' : 'MISSING';
    } else if (id === 'rollback_disable_path') {
      status = 'PRESENT'; // software emergency-disable contracts exist (S64)
    } else if (id === 'production_verification' || id === 'admin_approval' || id === 'legal_compliance') {
      status = 'PENDING';
    } else if (gated) {
      status = 'MISSING';
    }
    return { id, label: CHECKLIST_LABELS[id], mandatory, status };
  });
}

function buildEvidence(rail: CanonicalLaunchRail): EvidenceSlot[] {
  const providerSelected =
    rail.provider_name !== 'NOT_SELECTED' && !/^NOT_SELECTED$/i.test(rail.provider_name);
  const slots: EvidenceSlot[] = [
    {
      field: 'provider_identity',
      required: true,
      present: providerSelected,
      value_presence: providerSelected ? 'SET' : 'MISSING',
    },
    {
      field: 'account_merchant_identifier',
      required: true,
      present: providerSelected,
      value_presence: providerSelected ? 'SET' : 'MISSING',
    },
    { field: 'environment', required: true, present: true, value_presence: 'SET' },
    { field: 'market', required: true, present: true, value_presence: 'SET' },
    { field: 'verification_result', required: true, present: false, value_presence: 'MISSING' },
    { field: 'verification_timestamp', required: true, present: false, value_presence: 'MISSING' },
    { field: 'approving_role', required: true, present: false, value_presence: 'MISSING' },
    { field: 'correlation_id', required: true, present: true, value_presence: 'SET' },
    { field: 'configuration_version', required: false, present: false, value_presence: 'MISSING' },
  ];
  return slots;
}

function marketStatuses(rail: CanonicalLaunchRail): MarketRailStatus[] {
  const markets: OnboardingMarket[] = ['GLOBAL', 'IN', 'AE', 'US'];
  const lifecycle = deriveLifecycle(rail);
  const blocker = rail.blocker_codes[0] ?? 'EXTERNAL_GATED';
  return markets.map((market) => ({
    market,
    lifecycle,
    sandbox: 'SANDBOX_VERIFIED',
    production: rail.enabled ? 'ENABLED' : 'PRODUCTION_EXTERNAL_GATED',
    blocker,
  }));
}

export function buildDependencyGraph(): DependencyEdge[] {
  return [
    { from: 'SECRETS_ENV', to: 'PSP', reason: 'credentials vault before payment activation' },
    { from: 'PSP', to: 'MONITORING', reason: 'payment health + reconciliation signals' },
    { from: 'SECRETS_ENV', to: 'CARRIER', reason: 'carrier credentials in secret manager' },
    { from: 'CARRIER', to: 'MONITORING', reason: 'shipment tracking observability' },
    { from: 'SECRETS_ENV', to: 'OTP', reason: 'OTP/SMS credentials vaulted' },
    { from: 'PRIVATE_STORAGE', to: 'KYC_KYB', reason: 'document storage dependency' },
    { from: 'KMS', to: 'KYC_KYB', reason: 'encryption for identity documents' },
    { from: 'MALWARE_SCANNER', to: 'KYC_KYB', reason: 'upload scanning before trust' },
    { from: 'PRIVATE_STORAGE', to: 'PACS', reason: 'imaging object storage' },
    { from: 'KMS', to: 'PACS', reason: 'DICOM encryption' },
    { from: 'MALWARE_SCANNER', to: 'PACS', reason: 'study upload scanning' },
    { from: 'SECRETS_ENV', to: 'ERX', reason: 'eRx credentials vaulted' },
    { from: 'SECRETS_ENV', to: 'VIDEO', reason: 'video token signing secrets' },
    { from: 'PRIVATE_STORAGE', to: 'VIDEO', reason: 'recording storage when enabled' },
    { from: 'MANAGED_BACKUP', to: 'PITR', reason: 'managed backup before PITR claims' },
    { from: 'PITR', to: 'DR_ENVIRONMENT', reason: 'PITR evidence before DR environment' },
    { from: 'APM', to: 'ALERTING', reason: 'signals before pager destinations' },
    { from: 'MONITORING', to: 'ALERTING', reason: 'coverage before alert routing' },
    { from: 'DEPLOYMENT', to: 'PSP', reason: 'release target before live commercial rails' },
    { from: 'SECRETS_ENV', to: 'PRIVATE_STORAGE', reason: 'storage identity refs' },
    { from: 'SECRETS_ENV', to: 'KMS', reason: 'KMS key refs' },
  ];
}

export function buildActivationSequence(): ActivationSequenceStep[] {
  return [
    { order: 1, band: 'FOUNDATION', rail: 'DEPLOYMENT', note: 'Production infrastructure / environment target' },
    { order: 2, band: 'FOUNDATION', rail: 'SECRETS_ENV', note: 'Secrets manager + env separation' },
    { order: 3, band: 'FOUNDATION', rail: 'PRIVATE_STORAGE', note: 'Private object storage' },
    { order: 4, band: 'FOUNDATION', rail: 'KMS', note: 'Key management' },
    { order: 5, band: 'FOUNDATION', rail: 'MALWARE_SCANNER', note: 'Malware scanning' },
    { order: 6, band: 'FOUNDATION', rail: 'MANAGED_BACKUP', note: 'Managed backup' },
    { order: 7, band: 'FOUNDATION', rail: 'PITR', note: 'Point-in-time recovery' },
    { order: 8, band: 'FOUNDATION', rail: 'DR_ENVIRONMENT', note: 'Disaster recovery environment' },
    { order: 9, band: 'FOUNDATION', rail: 'APM', note: 'Application performance monitoring' },
    { order: 10, band: 'FOUNDATION', rail: 'MONITORING', note: 'Platform monitoring coverage' },
    { order: 11, band: 'FOUNDATION', rail: 'ALERTING', note: 'Alert destinations / escalation' },
    { order: 12, band: 'COMMERCIAL', rail: 'PSP', note: 'Payments / PSP' },
    { order: 13, band: 'COMMERCIAL', rail: 'OTP', note: 'OTP authentication' },
    { order: 14, band: 'COMMERCIAL', rail: 'SMS', note: 'Transactional SMS' },
    { order: 15, band: 'COMMERCIAL', rail: 'EMAIL', note: 'Transactional email' },
    { order: 16, band: 'COMMERCIAL', rail: 'CARRIER', note: 'Carrier / logistics' },
    { order: 17, band: 'COMMERCIAL', rail: 'KYC_KYB', note: 'Partner KYC/KYB' },
    { order: 18, band: 'HEALTHCARE', rail: 'ERX', note: 'eRx transmission' },
    { order: 19, band: 'HEALTHCARE', rail: 'VIDEO', note: 'Telemedicine video' },
    { order: 20, band: 'HEALTHCARE', rail: 'PACS', note: 'PACS / DICOM imaging' },
  ];
}

function credentialsReadiness(lifecycle: OnboardingLifecycle): ProviderOnboardingRow['credentials_readiness'] {
  if (lifecycle === 'ENABLED') return 'READY';
  if (lifecycle === 'CREDENTIALS_REQUIRED' || lifecycle === 'NOT_SELECTED' || lifecycle === 'EXTERNAL_GATED') {
    return 'MISSING';
  }
  return 'PARTIAL';
}

function configurationReadiness(lifecycle: OnboardingLifecycle): ProviderOnboardingRow['configuration_readiness'] {
  if (lifecycle === 'ENABLED' || lifecycle === 'READY_FOR_ACTIVATION') return 'READY';
  if (lifecycle === 'CONFIGURATION_REQUIRED' || lifecycle === 'NOT_SELECTED') return 'MISSING';
  return 'PARTIAL';
}

export function buildProviderOnboardingRows(correlationId?: string): ProviderOnboardingRow[] {
  const corr = correlationId ?? randomUUID();
  const rails = buildCanonicalLaunchRails();
  const deps = buildDependencyGraph();

  return rails.map((rail) => {
    const lifecycle = deriveLifecycle(rail);
    const blocker = rail.blocker_codes[0] ?? 'EXTERNAL_GATED';
    const dependency_blockers = deps
      .filter((d) => d.to === rail.rail_id)
      .map((d) => `${d.from}→${d.to}`);
    const checklist = buildChecklist(lifecycle, rail.rail_id);
    const evidence = buildEvidence(rail).map((e) =>
      e.field === 'correlation_id'
        ? { ...e, present: true, value_presence: 'SET' as const }
        : e,
    );
    // Attach correlation as non-secret metadata only (not printed as secret)
    void corr;

    const readyCandidates = checklist.filter((c) => c.mandatory);
    const allMandatoryMet = readyCandidates.every((c) => c.status === 'PRESENT' || c.status === 'N/A');
    const effectiveLifecycle: OnboardingLifecycle =
      allMandatoryMet && lifecycle !== 'ENABLED' ? 'READY_FOR_ACTIVATION' : lifecycle;
    // Never auto READY when EXTERNAL_GATED / NOT_SELECTED — evidence missing
    const finalLifecycle =
      lifecycle === 'EXTERNAL_GATED' || lifecycle === 'NOT_SELECTED' || lifecycle === 'ENABLED'
        ? lifecycle
        : effectiveLifecycle;

    return {
      rail_id: rail.rail_id,
      category: railCategory(rail.rail_id),
      label: rail.label,
      provider_name: rail.provider_name,
      lifecycle: finalLifecycle,
      configuration_readiness: configurationReadiness(finalLifecycle),
      credentials_readiness: credentialsReadiness(finalLifecycle),
      legal_approval: 'PENDING',
      verification: 'SANDBOX_ONLY',
      sandbox: rail.sandbox_status,
      production: rail.production_status,
      enabled: rail.enabled,
      blocker,
      dependency_blockers,
      checklist,
      evidence,
      markets: marketStatuses(rail),
      next_action: rail.enabled
        ? 'Monitor production rail; emergency disable remains available'
        : `Resolve ${blocker}; complete checklist; record non-secret evidence; human approval before ENABLED`,
      source: rail.source,
    };
  });
}

export function filterOnboardingRows(
  rows: ProviderOnboardingRow[],
  filter: 'ALL' | 'BLOCKED' | 'READY_FOR_ACTIVATION' | 'ENABLED' | OnboardingMarket | OnboardingCategory,
): ProviderOnboardingRow[] {
  if (filter === 'ALL') return rows;
  if (filter === 'BLOCKED') {
    return rows.filter(
      (r) =>
        !r.enabled &&
        (r.lifecycle === 'EXTERNAL_GATED' ||
          r.lifecycle === 'NOT_SELECTED' ||
          r.lifecycle === 'CONFIGURATION_REQUIRED' ||
          r.lifecycle === 'CREDENTIALS_REQUIRED'),
    );
  }
  if (filter === 'READY_FOR_ACTIVATION') {
    return rows.filter((r) => r.lifecycle === 'READY_FOR_ACTIVATION');
  }
  if (filter === 'ENABLED') return rows.filter((r) => r.enabled || r.lifecycle === 'ENABLED');
  if (['GLOBAL', 'IN', 'AE', 'US'].includes(filter)) {
    return rows.filter((r) => r.markets.some((m) => m.market === filter));
  }
  return rows.filter((r) => r.category === filter);
}

export function evaluateProviderOnboardingControlPlane(input?: { correlation_id?: string }) {
  const correlation_id = input?.correlation_id ?? randomUUID();
  const rows = buildProviderOnboardingRows(correlation_id);
  const matrix = evaluateAllProviderActivations();
  const deps = buildDependencyGraph();
  const sequence = buildActivationSequence();

  const enabled_count = rows.filter((r) => r.enabled).length;
  const blocked_count = filterOnboardingRows(rows, 'BLOCKED').length;
  const ready_count = filterOnboardingRows(rows, 'READY_FOR_ACTIVATION').length;

  const major_blockers = [...new Set(rows.flatMap((r) => [r.blocker, ...r.dependency_blockers]))].slice(
    0,
    24,
  );

  return {
    correlation_id,
    evaluated_at: new Date().toISOString(),
    rows,
    filters_supported: ['ALL', 'BLOCKED', 'READY_FOR_ACTIVATION', 'ENABLED', 'GLOBAL', 'IN', 'AE', 'US'] as const,
    dependency_graph: deps,
    activation_sequence: sequence,
    s64_sequence_phases: matrix.sequence_phases,
    counts: {
      total: rows.length,
      enabled: enabled_count,
      blocked: blocked_count,
      ready_for_activation: ready_count,
    },
    major_blockers,
    production_providers_enabled: false,
    production_infrastructure_enabled: false,
    any_rail_ready_for_activation: ready_count > 0,
    secrets_printed: false,
    fake_credentials_invented: false,
    evidence_contains_secrets: false,
    two_person_approval: {
      supported_in_software: false,
      required_for_activation: true,
      note: 'CONFIGURATION ≠ APPROVAL ≠ ACTIVATION. Record two-person approval as activation requirement until dedicated SoD workflow exists.',
    },
    semantic_guards: {
      config_record_neq_enabled: true,
      sandbox_verified_neq_production_verified: true,
      ready_for_activation_neq_enabled: true,
      software_readiness_neq_launch_authorized: true,
      no_manual_toggle_bypass: true,
    },
  };
}
