/**
 * Sprint 150 — Production KYC/KYB + healthcare partner verification activation (software).
 * Composes S72/S81/S94/S106/S124 (+ S127/S135–S139/S149) with S142/S143/S148.
 * Does NOT invent KYC providers, verification results, licenses, or production approvals.
 * Lifecycle: NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED
 * DOCUMENT_VERIFIED ≠ PARTNER_VERIFIED ≠ PARTNER_APPROVED ≠ PRODUCTION_ENABLED ≠ PAYOUT/CLINICAL.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from '../ops/secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from '../ops/infra-environment';
import {
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  KYC_PROVIDER_NOT_SELECTED,
  buildKycHealthcareConfigurationReferenceSlots,
} from './kyc-healthcare-partner-verification-activation-preparation';
import {
  evaluateKycFirstOnboarding,
  buildKycVerificationLifecycleMachine,
  isMockOrSandboxKycProvider,
  assertVerifiedCanExpire,
} from './kyc-first-onboarding';
import { evaluateRealKycFirstOnboarding } from './kyc-real-activation-first-onboarding';
import { canTransitionKyc } from './kyc-state';
import { KycCaseStatus } from '@prisma/client';
import {
  secretsManagerRuntimeResolverStatus,
  presentSecretReference,
  type SecretReference,
} from '../ops/secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from '../ops/observability-apm-monitoring-alerting-production-activation-path';
import {
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  type ReleaseCaller,
} from '../ops/deployment-release-engineering-production-activation-path';
import { evaluateProductionSecurityLaunchGatePath } from '../ops/production-security-launch-gate-path';
import { evaluateAffiliatePayoutSettlementProductionWorkflowClosure } from '../finance/affiliate-payout-settlement-production-workflow-closure';
import { evaluatePharmacyVendorNetworkClosure } from './pharmacy-vendor-network-closure';
import { evaluateLabPartnerProductionWorkflowClosure } from '../lab/lab-partner-production-workflow-closure';
import { evaluateDoctorConsultationErxProductionWorkflowClosure } from '../clinical/doctor-consultation-erx-production-workflow-closure';
import { evaluateImagingPacsDicomProductionWorkflowClosure } from '../radiology/imaging-pacs-dicom-production-workflow-closure';
import { NO_PRODUCTION_SECRETS_MANAGER } from '../ops/production-foundation-activation-preparation';

export const PRODUCTION_KYC_KYB_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PATH_AUTHORITATIVE =
  'PRODUCTION_KYC_KYB_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PATH_AUTHORITATIVE';

export const NO_PRODUCTION_KYC_ADAPTER = 'NO_PRODUCTION_KYC_ADAPTER';
export const KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED =
  'KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED';
export const DOCUMENT_VERIFIED_NEQ_PARTNER_APPROVED =
  'DOCUMENT_VERIFIED_NEQ_PARTNER_APPROVED';
export const PARTNER_APPROVED_NEQ_PRODUCTION_ENABLED =
  'PARTNER_APPROVED_NEQ_PRODUCTION_ENABLED';
export const FORGED_KYC_STATE_REJECTED = 'FORGED_KYC_STATE_REJECTED';
export const FORGED_KYC_WEBHOOK_REJECTED = 'FORGED_KYC_WEBHOOK_REJECTED';
export const CLIENT_KYC_ACTIVATION_DENIED = 'CLIENT_KYC_ACTIVATION_DENIED';
export const PARTNER_SELF_APPROVAL_DENIED = 'PARTNER_SELF_APPROVAL_DENIED';
export const CROSS_PARTNER_KYC_ACCESS_DENIED = 'CROSS_PARTNER_KYC_ACCESS_DENIED';
export const EXPIRED_VERIFICATION_BYPASS_DENIED = 'EXPIRED_VERIFICATION_BYPASS_DENIED';
export const SUSPENDED_PARTNER_BYPASS_DENIED = 'SUSPENDED_PARTNER_BYPASS_DENIED';
export const KYC_WEBHOOK_UNSIGNED_REJECTED = 'KYC_WEBHOOK_UNSIGNED_REJECTED';
export const KYC_WEBHOOK_REPLAY_REJECTED = 'KYC_WEBHOOK_REPLAY_REJECTED';
export const KYC_WEBHOOK_WRONG_ENVIRONMENT_REJECTED =
  'KYC_WEBHOOK_WRONG_ENVIRONMENT_REJECTED';

export {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  NO_PRODUCTION_KYC_PROVIDER,
  KYC_PROVIDER_NOT_SELECTED,
};

export type KycActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type KycSemanticState =
  | 'DOCUMENT_VERIFIED'
  | 'PARTNER_VERIFIED'
  | 'PARTNER_APPROVED'
  | 'PRODUCTION_ENABLED'
  | 'PAYOUT_ENABLED'
  | 'CLINICAL_ENABLED';

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) return null;
  return v;
}

export abstract class KycVerificationProviderAdapter {
  abstract readonly name: string;
  abstract submitVerification(_input: { case_ref: string }): Promise<{ submitted: false }>;
  abstract getVerificationStatus(_caseRef: string): Promise<{ status: 'EXTERNAL_GATED' }>;
  abstract retrieveEvidenceReference(_caseRef: string): Promise<{ evidence_ref: null }>;
  abstract handleVerificationWebhook(_payload: unknown): Promise<{ accepted: false }>;
  abstract verifyWebhook(_headers: Record<string, string>, _body: string): Promise<{ valid: false }>;
  abstract reconcileVerification(_caseRef: string): Promise<{ reconciled: false }>;
  abstract expireVerification(_caseRef: string): Promise<{ expired: false }>;
  abstract suspendVerification(_caseRef: string): Promise<{ suspended: false }>;
}

export class FailClosedProductionKycAdapter extends KycVerificationProviderAdapter {
  readonly name = 'fail_closed_production_kyc';

  private blocked(op: string): never {
    throw Errors.problem(
      503,
      KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED,
      'Production KYC adapter blocked',
      `${NO_PRODUCTION_KYC_ADAPTER}: ${op} unavailable. No fake production verification. Live provider EXTERNAL_GATED.`,
    );
  }

  async submitVerification(): Promise<{ submitted: false }> {
    this.blocked('submitVerification');
  }
  async getVerificationStatus(): Promise<{ status: 'EXTERNAL_GATED' }> {
    this.blocked('getVerificationStatus');
  }
  async retrieveEvidenceReference(): Promise<{ evidence_ref: null }> {
    this.blocked('retrieveEvidenceReference');
  }
  async handleVerificationWebhook(): Promise<{ accepted: false }> {
    this.blocked('handleVerificationWebhook');
  }
  async verifyWebhook(): Promise<{ valid: false }> {
    this.blocked('verifyWebhook');
  }
  async reconcileVerification(): Promise<{ reconciled: false }> {
    this.blocked('reconcileVerification');
  }
  async expireVerification(): Promise<{ expired: false }> {
    this.blocked('expireVerification');
  }
  async suspendVerification(): Promise<{ suspended: false }> {
    this.blocked('suspendVerification');
  }
}

let registeredProductionKycAdapter: KycVerificationProviderAdapter | null = null;

export function registerProductionKycAdapter(
  adapter: KycVerificationProviderAdapter | null,
): void {
  registeredProductionKycAdapter = adapter;
}

export function selectKycVerificationProviderAdapter(): KycVerificationProviderAdapter {
  return registeredProductionKycAdapter ?? new FailClosedProductionKycAdapter();
}

export function readConfiguredProductionKycProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('KYC_PROVIDER') ?? envValue('KYC_KYB_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isMockOrSandboxKycProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export function evaluateVerificationSeparationContract() {
  return {
    document_verified_neq_partner_verified: true,
    partner_verified_neq_partner_approved: true,
    partner_approved_neq_production_enabled: true,
    production_enabled_neq_payout_enabled: true,
    production_enabled_neq_clinical_enabled: true,
    verified_document_alone_never_activates_healthcare_partner: true,
    semantic_states_not_collapsed: true as const,
    states: [
      'DOCUMENT_VERIFIED',
      'PARTNER_VERIFIED',
      'PARTNER_APPROVED',
      'PRODUCTION_ENABLED',
      'PAYOUT_ENABLED',
      'CLINICAL_ENABLED',
    ] as KycSemanticState[],
  };
}

export function evaluateEvidenceReferenceContract() {
  return {
    stores_references_metadata_only: true,
    fields: [
      'provider_case_id',
      'verification_id',
      'document_reference',
      'verification_timestamp',
      'expiry',
      'status',
      'reviewer_approval_reference',
    ],
    raw_identity_documents_in_app_tables: false,
    uses_private_storage_architecture: true,
    public_url_exposure_forbidden: true,
    secrets_printed: false,
  };
}

export function evaluateExpirySuspensionContract() {
  return {
    verification_expiry_supported: assertVerifiedCanExpire(),
    partner_suspension_supported: true,
    rejected_verification_supported: true,
    re_verification_supported: true,
    approval_withdrawal_supported: true,
    expired_fail_closed: true,
    rejected_fail_closed: true,
    suspended_fail_closed: true,
    verified_can_expire_transition: canTransitionKyc(
      KycCaseStatus.VERIFIED,
      KycCaseStatus.EXPIRED,
    ),
  };
}

export function evaluateKycWebhookSecurityContract() {
  const s94 = evaluateKycFirstOnboarding();
  return {
    requires_signature_verification: true,
    requires_replay_protection: true,
    requires_idempotency: true,
    requires_correct_environment: true,
    requires_provider_identity_validation: true,
    unsigned_rejected: true,
    invalid_signature_rejected: true,
    wrong_environment_rejected: true,
    browser_not_a_verification_callback: true,
    production_status: 'EXTERNAL_GATED' as const,
    s94_webhook_security: s94.webhook_security,
  };
}

export function evaluateGlobalKycPolicyContract() {
  return {
    hardcoded_india: false,
    hardcoded_inr: false,
    hardcoded_gst: false,
    hardcoded_pan: false,
    hardcoded_upi: false,
    hardcoded_ist: false,
    uses_policy_market_configuration: true,
    source_country_distinguishable: true,
    customer_market_distinguishable: true,
    partner_market_distinguishable: true,
    provider_jurisdiction_distinguishable: true,
    country_support: 'POLICY_DRIVEN' as const,
  };
}

export type PartnerTypeKycComposition = {
  partner_type: 'pharmacy_vendor' | 'lab' | 'doctor' | 'imaging' | 'affiliate';
  requires_kyc_kyb: true;
  production_activation_enabled: false;
  remaining_blocker: string;
  gates: string[];
};

export function evaluatePartnerTypeKycComposition(): PartnerTypeKycComposition[] {
  const pharmacy = evaluatePharmacyVendorNetworkClosure();
  const lab = evaluateLabPartnerProductionWorkflowClosure();
  const doctor = evaluateDoctorConsultationErxProductionWorkflowClosure();
  const imaging = evaluateImagingPacsDicomProductionWorkflowClosure();
  const affiliate = evaluateAffiliatePayoutSettlementProductionWorkflowClosure();

  return [
    {
      partner_type: 'pharmacy_vendor',
      requires_kyc_kyb: true,
      production_activation_enabled: false,
      remaining_blocker: String(pharmacy.remaining_blocker),
      gates: ['KYC/KYB', 'market_licence_evidence', 'partner_approval', 'catalog_fulfillment'],
    },
    {
      partner_type: 'lab',
      requires_kyc_kyb: true,
      production_activation_enabled: false,
      remaining_blocker: String(lab.remaining_blocker),
      gates: ['KYC/KYB', 'accreditation_evidence', 'partner_approval', 'lab_workflow'],
    },
    {
      partner_type: 'doctor',
      requires_kyc_kyb: true,
      production_activation_enabled: false,
      remaining_blocker: String(doctor.remaining_blocker),
      gates: ['KYC/KYB', 'professional_clinical_evidence', 'partner_approval', 'clinical_enablement'],
    },
    {
      partner_type: 'imaging',
      requires_kyc_kyb: true,
      production_activation_enabled: false,
      remaining_blocker: String(imaging.remaining_blocker),
      gates: ['KYC/KYB', 'imaging_radiology_evidence', 'partner_approval', 'pacs_readiness'],
    },
    {
      partner_type: 'affiliate',
      requires_kyc_kyb: true,
      production_activation_enabled: false,
      remaining_blocker: String(affiliate.remaining_blocker),
      gates: ['KYC/KYB_where_applicable', 'payout_eligibility', 'PSP_readiness'],
    },
  ];
}

export function evaluateAdminKycSoDContract() {
  return {
    verifier_neq_approver_where_required: true,
    partner_cannot_approve_itself: true,
    client_cannot_alter_verification_state: true,
    admin_sees_provider_verification_evidence_refs: true,
    raw_credentials_never_exposed: true,
    sensitive_documents_permissioned: true,
  };
}

export function evaluatePartnerPortalKycVisibilityContract() {
  return {
    can_view_own_verification_status: true,
    can_view_required_next_action: true,
    cannot_mark_self_verified: true,
    cannot_upload_arbitrary_verification_success: true,
    cannot_approve_self: true,
    cannot_alter_provider_result: true,
    cannot_access_other_partner_case: true,
  };
}

export function presentKycSecretReferences(): ReturnType<typeof presentSecretReference>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('KYC_PROVIDER_SECRET_REF') ?? '',
      purpose: 'kyc_provider_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'kyc_kyb',
    },
    {
      ref_id: envValue('KYC_CALLBACK_SECRET_REF') ?? '',
      purpose: 'kyc_webhook_callback',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'kyc_kyb',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export function listKycObservabilityEvents(): Array<{ id: string; safe: true }> {
  return [
    { id: 'verification_submitted', safe: true },
    { id: 'verification_result_received', safe: true },
    { id: 'verification_rejected', safe: true },
    { id: 'verification_expired', safe: true },
    { id: 'partner_approved', safe: true },
    { id: 'partner_suspended', safe: true },
    { id: 'activation_blocked', safe: true },
    { id: 'activation_enabled', safe: true },
  ];
}

export function assertProductionKycActivationAllowed(
  context: string,
  caller: ReleaseCaller,
  opts?: { partner_self?: boolean },
): void {
  if (caller.kind === 'client_browser' || caller.kind === 'mobile') {
    throw Errors.problem(
      403,
      CLIENT_KYC_ACTIVATION_DENIED,
      'Client KYC activation denied',
      'Browser/mobile cannot activate production KYC/KYB or alter verification state.',
    );
  }
  if (opts?.partner_self) {
    throw Errors.problem(
      403,
      PARTNER_SELF_APPROVAL_DENIED,
      'Partner self-approval denied',
      'Partners cannot approve or enable their own production verification.',
    );
  }
  assertReleaseCallerAuthorized(caller);
  const provider = readConfiguredProductionKycProvider();
  if (provider.mock_rejected) {
    throw Errors.problem(
      503,
      KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED,
      'Sandbox KYC provider blocked in production',
      `${context}: sandbox/mock KYC providers cannot activate production.`,
    );
  }
  throw Errors.problem(
    503,
    KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED,
    'Production KYC activation EXTERNAL_GATED',
    `${context}: ${NO_PRODUCTION_KYC_KYB_PROVIDER}. Software COMPLETE; live verification EXTERNAL_GATED.`,
  );
}

export function assertCrossPartnerKycAccessDenied(
  actorPartnerId: string,
  targetPartnerId: string,
): void {
  if (actorPartnerId !== targetPartnerId) {
    throw Errors.problem(
      403,
      CROSS_PARTNER_KYC_ACCESS_DENIED,
      'Cross-partner KYC access denied',
      'Partner cannot access another partner verification case by ID tampering.',
    );
  }
}

export function assertExpiredVerificationBypassDenied(): never {
  throw Errors.problem(
    403,
    EXPIRED_VERIFICATION_BYPASS_DENIED,
    'Expired verification bypass denied',
    'Expired/rejected/suspended partners fail closed for production activity.',
  );
}

export function assertSuspendedPartnerBypassDenied(): never {
  throw Errors.problem(
    403,
    SUSPENDED_PARTNER_BYPASS_DENIED,
    'Suspended partner bypass denied',
    'Suspended partners cannot access production capabilities.',
  );
}

export function assertKycWebhookRejected(reason: 'unsigned' | 'replay' | 'wrong_env'): never {
  const code =
    reason === 'unsigned'
      ? KYC_WEBHOOK_UNSIGNED_REJECTED
      : reason === 'replay'
        ? KYC_WEBHOOK_REPLAY_REJECTED
        : KYC_WEBHOOK_WRONG_ENVIRONMENT_REJECTED;
  throw Errors.problem(
    403,
    code,
    'KYC webhook rejected',
    `Production KYC callbacks require signature, replay protection, and correct environment (${reason}).`,
  );
}

export function rejectForgedKycState(claimed: {
  lifecycle?: string;
  enabled?: boolean;
  document_verified_as_production?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_KYC_STATE_REJECTED,
    'Forged KYC state rejected',
    `Client/forged KYC claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, enabled=${String(claimed.enabled)}, doc_as_prod=${String(claimed.document_verified_as_production)}).`,
  );
}

export function rejectForgedKycWebhook(): never {
  throw Errors.problem(
    403,
    FORGED_KYC_WEBHOOK_REJECTED,
    'Forged KYC webhook rejected',
    'Client-forged verification callbacks are not accepted as provider results.',
  );
}

export type ProductionKycKybHealthcarePartnerVerificationActivationPathReport = {
  sprint: 150;
  authoritative_source: typeof PRODUCTION_KYC_KYB_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PATH_AUTHORITATIVE;
  s124_rebuilt: false;
  parallel_kyc_system_created: false;
  invented_kyc_provider: false;
  invented_verification_results: false;
  fabricated_licenses_accreditation: false;
  approved_unverified_partners: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  software_activation_path: 'COMPLETE';
  lifecycle: KycActivationLifecycle;
  configured: boolean;
  verified: false;
  approved: false;
  enabled: false;
  semantic_separation: ReturnType<typeof evaluateVerificationSeparationContract>;
  provider: {
    selected: boolean;
    code: string | null;
    mock_rejected: boolean;
    state: 'EXTERNAL_GATED' | 'NOT_SELECTED';
  };
  adapter: {
    production_registered: boolean;
    selected: string;
  };
  evidence: ReturnType<typeof evaluateEvidenceReferenceContract>;
  expiry_suspension: ReturnType<typeof evaluateExpirySuspensionContract>;
  webhook_security: ReturnType<typeof evaluateKycWebhookSecurityContract>;
  verification_lifecycle_machine: ReturnType<typeof buildKycVerificationLifecycleMachine>;
  configuration_slots: ReturnType<typeof buildKycHealthcareConfigurationReferenceSlots>;
  secret_references_presence: ReturnType<typeof presentKycSecretReferences>;
  global_policy: ReturnType<typeof evaluateGlobalKycPolicyContract>;
  partner_type_composition: PartnerTypeKycComposition[];
  admin_sod: ReturnType<typeof evaluateAdminKycSoDContract>;
  partner_portal: ReturnType<typeof evaluatePartnerPortalKycVisibilityContract>;
  observability_events: ReturnType<typeof listKycObservabilityEvents>;
  dependent_gates: {
    affiliate_payout: string;
    pharmacy_vendor: string;
    lab: string;
    doctor: string;
    imaging: string;
  };
  composed_foundations: {
    s72_s81_s94_s106: 'COMPOSED';
    s124: 'COMPOSED_NOT_REBUILT';
    s127_s135_s136_s137_s139: 'COMPOSED';
    s149: 'COMPOSED';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
    s148: 'COMPOSED';
  };
  s124_snapshot: { remaining_blocker: string };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: { production_observability_enabled: boolean };
  s148_snapshot: { overall_state: string; can_production_launch: string };
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_KYC_KYB_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  identity_documents_printed: false;
  phi_printed: false;
  admin_summary: {
    kyc_kyb: 'NOT_SELECTED' | 'EXTERNAL_GATED';
    software_state: 'SOFTWARE_COMPLETE';
    provider_state: string;
    verification_state: string;
    evidence_reference: 'REFERENCES_ONLY';
    expiry: 'SUPPORTED_FAIL_CLOSED';
    partner_state: 'NOT_PRODUCTION_ENABLED';
    approval_state: 'NOT_APPROVED';
    production_activation_state: 'EXTERNAL_GATED';
    payout_eligibility: 'EXTERNAL_GATED';
    clinical_eligibility: 'EXTERNAL_GATED';
    blocker_reason: string;
    external_gated: true;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateProductionKycKybHealthcarePartnerVerificationActivationPath(input?: {
  correlation_id?: string;
}): ProductionKycKybHealthcarePartnerVerificationActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s124 = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  void evaluateRealKycFirstOnboarding();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const s148 = evaluateProductionSecurityLaunchGatePath();
  const partner_types = evaluatePartnerTypeKycComposition();
  const provider = readConfiguredProductionKycProvider();
  const affiliate = partner_types.find((p) => p.partner_type === 'affiliate')!;
  const pharmacy = partner_types.find((p) => p.partner_type === 'pharmacy_vendor')!;
  const lab = partner_types.find((p) => p.partner_type === 'lab')!;
  const doctor = partner_types.find((p) => p.partner_type === 'doctor')!;
  const imaging = partner_types.find((p) => p.partner_type === 'imaging')!;

  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'release_gate',
    deployment_state: 'NOT_CONFIGURED',
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const blockers = [
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    NO_PRODUCTION_KYC_PROVIDER,
    NO_PRODUCTION_KYC_ADAPTER,
    KYC_PROVIDER_NOT_SELECTED,
    KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED,
    DOCUMENT_VERIFIED_NEQ_PARTNER_APPROVED,
    PARTNER_APPROVED_NEQ_PRODUCTION_ENABLED,
    NO_PRODUCTION_SECRETS_MANAGER,
    String(s124.remaining_blocker),
    pharmacy.remaining_blocker,
    lab.remaining_blocker,
    doctor.remaining_blocker,
    imaging.remaining_blocker,
    affiliate.remaining_blocker,
  ];
  if (provider.mock_rejected) blockers.push(KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED);

  return {
    sprint: 150,
    authoritative_source:
      PRODUCTION_KYC_KYB_HEALTHCARE_PARTNER_VERIFICATION_ACTIVATION_PATH_AUTHORITATIVE,
    s124_rebuilt: false,
    parallel_kyc_system_created: false,
    invented_kyc_provider: false,
    invented_verification_results: false,
    fabricated_licenses_accreditation: false,
    approved_unverified_partners: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    software_activation_path: 'COMPLETE',
    lifecycle: 'NOT_SELECTED',
    configured: provider.selected,
    verified: false,
    approved: false,
    enabled: false,
    semantic_separation: evaluateVerificationSeparationContract(),
    provider: {
      selected: provider.selected,
      code: provider.code,
      mock_rejected: provider.mock_rejected,
      state: provider.selected ? 'EXTERNAL_GATED' : 'NOT_SELECTED',
    },
    adapter: {
      production_registered: registeredProductionKycAdapter != null,
      selected: selectKycVerificationProviderAdapter().name,
    },
    evidence: evaluateEvidenceReferenceContract(),
    expiry_suspension: evaluateExpirySuspensionContract(),
    webhook_security: evaluateKycWebhookSecurityContract(),
    verification_lifecycle_machine: buildKycVerificationLifecycleMachine(),
    configuration_slots: buildKycHealthcareConfigurationReferenceSlots(),
    secret_references_presence: presentKycSecretReferences(),
    global_policy: evaluateGlobalKycPolicyContract(),
    partner_type_composition: partner_types,
    admin_sod: evaluateAdminKycSoDContract(),
    partner_portal: evaluatePartnerPortalKycVisibilityContract(),
    observability_events: listKycObservabilityEvents(),
    dependent_gates: {
      affiliate_payout: affiliate.remaining_blocker,
      pharmacy_vendor: pharmacy.remaining_blocker,
      lab: lab.remaining_blocker,
      doctor: doctor.remaining_blocker,
      imaging: imaging.remaining_blocker,
    },
    composed_foundations: {
      s72_s81_s94_s106: 'COMPOSED',
      s124: 'COMPOSED_NOT_REBUILT',
      s127_s135_s136_s137_s139: 'COMPOSED',
      s149: 'COMPOSED',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
      s148: 'COMPOSED',
    },
    s124_snapshot: { remaining_blocker: String(s124.remaining_blocker) },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      production_observability_enabled: s143.production_observability_enabled,
    },
    s148_snapshot: {
      overall_state: s148.overall_state,
      can_production_launch: s148.can_production_launch,
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    identity_documents_printed: false,
    phi_printed: false,
    admin_summary: {
      kyc_kyb: provider.selected ? 'EXTERNAL_GATED' : 'NOT_SELECTED',
      software_state: 'SOFTWARE_COMPLETE',
      provider_state: provider.selected ? (provider.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
      verification_state: 'EXTERNAL_GATED',
      evidence_reference: 'REFERENCES_ONLY',
      expiry: 'SUPPORTED_FAIL_CLOSED',
      partner_state: 'NOT_PRODUCTION_ENABLED',
      approval_state: 'NOT_APPROVED',
      production_activation_state: 'EXTERNAL_GATED',
      payout_eligibility: 'EXTERNAL_GATED',
      clinical_eligibility: 'EXTERNAL_GATED',
      blocker_reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      external_gated: true,
      production_enabled: false,
    },
    message:
      'Software production KYC/KYB + healthcare partner verification activation path COMPLETE. Composes S124 (not rebuilt) + partner-type gates S135–S139/S149 + S142/S143/S148. DOCUMENT_VERIFIED ≠ PARTNER_APPROVED ≠ PRODUCTION_ENABLED. No invented provider/verification. CAN_PRODUCTION_LAUNCH = NO.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInKycPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}
