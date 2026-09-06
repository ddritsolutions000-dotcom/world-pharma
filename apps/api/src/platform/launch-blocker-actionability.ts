/**
 * Sprint 50 — Blocker taxonomy & actionability (compose onto S49 codes; no duplicate gates).
 */
import type { LaunchDimensionId } from './final-launch-readiness';

export type BlockerTaxonomy =
  | 'INTERNAL_ACTION_REQUIRED'
  | 'EXTERNAL_PROVIDER_REQUIRED'
  | 'EXTERNAL_BUSINESS_APPROVAL'
  | 'LEGAL_REGULATORY_REQUIRED'
  | 'CONFIGURATION_REQUIRED'
  | 'SECURITY_REQUIRED';

export type LaunchRunbookStage = 1 | 2 | 3 | 4 | 5 | 6;

export type BlockerActionability = {
  taxonomy: BlockerTaxonomy;
  what_is_missing: string;
  why_blocks_launch: string;
  resolving_workflow: string;
  resolving_href: string | null;
  authorized_permission: string;
  requires_external_party: boolean;
  status_after_resolution: string;
  can_clear_from_application: boolean;
  runbook_stage: LaunchRunbookStage;
  dependency_category: string | null;
  required_provider_class: string | null;
  config_reference_required: boolean;
  credentials_missing: boolean | null;
  live_verification_required: boolean;
};

type CatalogEntry = {
  match: RegExp;
  taxonomy: BlockerTaxonomy;
  what_is_missing: string;
  why_blocks_launch: string;
  resolving_workflow: string;
  resolving_href: string | null;
  authorized_permission: string;
  requires_external_party: boolean;
  status_after_resolution: string;
  can_clear_from_application: boolean;
  runbook_stage: LaunchRunbookStage;
  dependency_category?: string;
  required_provider_class?: string;
  config_reference_required?: boolean;
  credentials_missing?: boolean | null;
  live_verification_required?: boolean;
};

const CATALOG: CatalogEntry[] = [
  {
    match: /LEGAL_EVIDENCE_EXPIRED|REGULATORY_EVIDENCE_EXPIRED/i,
    taxonomy: 'LEGAL_REGULATORY_REQUIRED',
    what_is_missing: 'Non-expired verified regulatory evidence',
    why_blocks_launch: 'Expired evidence cannot satisfy mandatory country regulatory requirements',
    resolving_workflow: 'Submit replacement evidence → verify in regulatory desk',
    resolving_href: '/countries',
    authorized_permission: 'policy:publish',
    requires_external_party: true,
    status_after_resolution: 'LEGAL dimension moves toward READY when all mandatory evidence is VERIFIED and non-expired',
    can_clear_from_application: true,
    runbook_stage: 2,
  },
  {
    match: /LEGAL_EVIDENCE_MISSING|REGULATORY_REQUIREMENT_MISSING|LEGAL_POLICY|HEALTHCARE_POLICY/i,
    taxonomy: 'LEGAL_REGULATORY_REQUIRED',
    what_is_missing: 'Published healthcare policy and/or required regulatory evidence',
    why_blocks_launch: 'Mandatory legal/regulatory coverage is incomplete',
    resolving_workflow: 'Publish healthcare policy + attach/verify evidence in Main Admin regulatory controls',
    resolving_href: '/countries',
    authorized_permission: 'policy:publish',
    requires_external_party: true,
    status_after_resolution: 'LEGAL checklist items READY after verification',
    can_clear_from_application: true,
    runbook_stage: 2,
  },
  {
    match: /PHARMACY_LICENCE/i,
    taxonomy: 'LEGAL_REGULATORY_REQUIRED',
    what_is_missing: 'Verified non-expired pharmacy licence for at least one partner',
    why_blocks_launch: 'Pharmacy operations require licence verification before production activation',
    resolving_workflow: 'Partner licence submit → under review → verify (no fake self-verify)',
    resolving_href: '/partners',
    authorized_permission: 'partner:manage',
    requires_external_party: true,
    status_after_resolution: 'PARTNER_NETWORK pharmacy_licence checklist READY',
    can_clear_from_application: true,
    runbook_stage: 3,
  },
  {
    match: /COMMERCIAL_APPROVAL/i,
    taxonomy: 'EXTERNAL_BUSINESS_APPROVAL',
    what_is_missing: 'Active partner commercial approval',
    why_blocks_launch: 'Commercial approval is required for marketplace/partner production readiness',
    resolving_workflow: 'Partner commercial approval workflow (approver ≠ applicant)',
    resolving_href: '/partners',
    authorized_permission: 'partner:manage',
    requires_external_party: false,
    status_after_resolution: 'PARTNER_NETWORK commercial checklist READY',
    can_clear_from_application: true,
    runbook_stage: 3,
  },
  {
    match: /KYC_PROVIDER/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Production KYC provider dependency (non-mock, verified)',
    why_blocks_launch: 'Live KYC provider is EXTERNAL_GATED until contracted and verified',
    resolving_workflow: 'Register ProductionDependency KYC_PROVIDER + genuine provider unlock (not fakeable here)',
    resolving_href: '/countries',
    authorized_permission: 'policy:publish',
    requires_external_party: true,
    status_after_resolution: 'KYC provider status VERIFIED / not EXTERNAL_GATED',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'KYC',
    required_provider_class: 'KYC identity verification provider',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /KYC_NOT_VERIFIED/i,
    taxonomy: 'INTERNAL_ACTION_REQUIRED',
    what_is_missing: 'Partner KYC verification (internal operator path or external provider path)',
    why_blocks_launch: 'Partner KYC must be verified before partner network readiness',
    resolving_workflow: 'Partner KYC review in Main Admin (INTERNAL_VERIFIED) — live vendor remains EXTERNAL_GATED',
    resolving_href: '/partners',
    authorized_permission: 'partner:manage',
    requires_external_party: false,
    status_after_resolution: 'PARTNER_NETWORK KYC checklist READY',
    can_clear_from_application: true,
    runbook_stage: 3,
  },
  {
    match: /PARTNER.*SUSPEND|SUSPENDED/i,
    taxonomy: 'INTERNAL_ACTION_REQUIRED',
    what_is_missing: 'Non-suspended production lifecycle / partner state',
    why_blocks_launch: 'Suspended countries/partners fail-closed for production transactions',
    resolving_workflow: 'Resume lifecycle UNDER_REVIEW then re-complete readiness (or unsuspend partner)',
    resolving_href: '/countries',
    authorized_permission: 'policy:publish',
    requires_external_party: false,
    status_after_resolution: 'Lifecycle leaves SUSPENDED; re-evaluate final launch',
    can_clear_from_application: true,
    runbook_stage: 6,
  },
  {
    match: /CURRENCY|POLICY_PACK|PAYMENT_POLICY|DELIVERY_POLICY|SERVICEABILITY|SETTLEMENT_POLICY|NOTIFICATION_POLICY|NOT_CONFIGURED|NOT_FOUND|MISSING/i,
    taxonomy: 'CONFIGURATION_REQUIRED',
    what_is_missing: 'Country configuration (currency, policy pack, payment/delivery/serviceability/settlement)',
    why_blocks_launch: 'Software/country configuration gates must pass before activation',
    resolving_workflow: 'Configure country + publish policy pack + serviceability zones in Main Admin',
    resolving_href: '/policy-packs',
    authorized_permission: 'policy:publish',
    requires_external_party: false,
    status_after_resolution: 'SOFTWARE / configuration checklist READY',
    can_clear_from_application: true,
    runbook_stage: 1,
  },
  {
    match: /R14_A_/i,
    taxonomy: 'EXTERNAL_BUSINESS_APPROVAL',
    what_is_missing: 'R14-A owner confirmation gates for live payments',
    why_blocks_launch: 'Live PSP unlock requires explicit owner-evidenced human gates',
    resolving_workflow: 'Complete PATH A / R14-A owner checklist outside fakeable admin shortcuts',
    resolving_href: '/payments',
    authorized_permission: 'payment:read',
    requires_external_party: true,
    status_after_resolution: 'R14-A live unlock no longer blocked',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'PAYMENTS',
    required_provider_class: 'Owner-approved live PSP program',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /PAYMENT_|PSP_|MERCHANT_|MOCK_GATEWAY|NO_PRODUCTION_GATEWAY|LIVE_PAYMENTS/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Production PSP + merchant configuration (non-mock)',
    why_blocks_launch: 'Production payment rail is EXTERNAL_GATED without genuine PSP',
    resolving_workflow: 'Contract PSP → ProductionDependency VERIFIED + merchant config ref + live flags',
    resolving_href: '/payments',
    authorized_permission: 'payment:read',
    requires_external_party: true,
    status_after_resolution: 'PAYMENTS dimension READY',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'PAYMENTS',
    required_provider_class: 'Production payment service provider',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /OTP_|MESSAGING_|SMS_|CONSOLE|COMMUNICATION/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Production OTP / transactional messaging providers',
    why_blocks_launch: 'Production communications remain EXTERNAL_GATED without live providers',
    resolving_workflow: 'Contract SMS/email/push provider → dependency VERIFIED + sender config',
    resolving_href: '/notifications',
    authorized_permission: 'policy:publish',
    requires_external_party: true,
    status_after_resolution: 'COMMUNICATIONS dimension READY',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'COMMUNICATIONS',
    required_provider_class: 'OTP/SMS/email/push provider',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /CARRIER|LOGISTICS|FLEET|POD_/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Production carrier/fleet adapter (non-mock)',
    why_blocks_launch: 'Production logistics rail is EXTERNAL_GATED without live carrier',
    resolving_workflow: 'Contract carrier → ProductionDependency VERIFIED + live adapter registration',
    resolving_href: '/logistics',
    authorized_permission: 'logistics:read',
    requires_external_party: true,
    status_after_resolution: 'LOGISTICS dimension READY',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'LOGISTICS',
    required_provider_class: 'Production carrier / last-mile fleet',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /STORAGE|MALWARE|KMS|BACKUP|PITR|TLS|MONITOR|OBSERVABILITY|INFRASTRUCTURE|RPO|RTO/i,
    taxonomy: 'SECURITY_REQUIRED',
    what_is_missing: 'Production infrastructure / security / recovery controls',
    why_blocks_launch: 'Cloud storage, KMS, malware scanning, PITR, and monitoring remain EXTERNAL_GATED',
    resolving_workflow: 'Provision cloud infra + KMS + scanner + PITR/offsite + monitoring (ops, not fakeable)',
    resolving_href: '/reliability',
    authorized_permission: 'policy:read',
    requires_external_party: true,
    status_after_resolution: 'INFRASTRUCTURE / SECURITY sections READY',
    can_clear_from_application: false,
    runbook_stage: 5,
    dependency_category: 'INFRASTRUCTURE',
    required_provider_class: 'Cloud storage / KMS / AV / backup / observability',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /CLINICAL|HEALTHCARE|ERX|VIDEO|PACS|DICOM|HL7|FHIR|REGISTRY|ACCREDIT|IMAGING|LAB_/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Real healthcare integrations and/or licensed clinical network',
    why_blocks_launch: 'eRx/video/PACS/HL7/FHIR and real accreditations are EXTERNAL_GATED',
    resolving_workflow: 'Contract clinical integrations + verify credentials/accreditation outside fake adapters',
    resolving_href: '/healthcare-network',
    authorized_permission: 'policy:read',
    requires_external_party: true,
    status_after_resolution: 'HEALTHCARE dimension READY',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'HEALTHCARE',
    required_provider_class: 'Clinical/eRx/video/PACS/HL7/FHIR or registry/accreditation',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
  {
    match: /EXTERNAL_GATED|NO_PRODUCTION_|NOT_YET_DEFINED|LIVE_.*DISABLED|PRODUCTION_ENVIRONMENT/i,
    taxonomy: 'EXTERNAL_PROVIDER_REQUIRED',
    what_is_missing: 'Genuine production dependency or operator unlock',
    why_blocks_launch: 'EXTERNAL_GATED dependencies never convert to READY without real verification',
    resolving_workflow: 'Satisfy the named production dependency with genuine credentials/contracts',
    resolving_href: '/launch-readiness',
    authorized_permission: 'policy:read',
    requires_external_party: true,
    status_after_resolution: 'Named dependency leaves EXTERNAL_GATED',
    can_clear_from_application: false,
    runbook_stage: 4,
    dependency_category: 'PRODUCTION',
    required_provider_class: 'Production external dependency',
    config_reference_required: true,
    credentials_missing: true,
    live_verification_required: true,
  },
];

const FALLBACK_INTERNAL: CatalogEntry = {
  match: /.*/,
  taxonomy: 'INTERNAL_ACTION_REQUIRED',
  what_is_missing: 'Internal configuration, evidence, or approval',
  why_blocks_launch: 'Mandatory launch dimension remains unresolved',
  resolving_workflow: 'Inspect final launch readiness blockers and complete the matching Main Admin workflow',
  resolving_href: '/launch-readiness',
  authorized_permission: 'policy:publish',
  requires_external_party: false,
  status_after_resolution: 'Blocker removed on next evaluate',
  can_clear_from_application: true,
  runbook_stage: 6,
};

export function classifyBlockerTaxonomy(code: string): BlockerTaxonomy {
  return resolveActionability(code).taxonomy;
}

export function resolveActionability(code: string): BlockerActionability {
  const entry = CATALOG.find((row) => row.match.test(code)) ?? FALLBACK_INTERNAL;
  return {
    taxonomy: entry.taxonomy,
    what_is_missing: entry.what_is_missing,
    why_blocks_launch: entry.why_blocks_launch,
    resolving_workflow: entry.resolving_workflow,
    resolving_href: entry.resolving_href,
    authorized_permission: entry.authorized_permission,
    requires_external_party: entry.requires_external_party,
    status_after_resolution: entry.status_after_resolution,
    can_clear_from_application: entry.can_clear_from_application,
    runbook_stage: entry.runbook_stage,
    dependency_category: entry.dependency_category ?? null,
    required_provider_class: entry.required_provider_class ?? null,
    config_reference_required: entry.config_reference_required ?? false,
    credentials_missing: entry.credentials_missing ?? null,
    live_verification_required: entry.live_verification_required ?? false,
  };
}

export const RUNBOOK_STAGE_LABELS: Record<LaunchRunbookStage, string> = {
  1: 'STAGE 1 — Country configuration',
  2: 'STAGE 2 — Legal / regulatory',
  3: 'STAGE 3 — Partner network',
  4: 'STAGE 4 — Production providers',
  5: 'STAGE 5 — Security / recovery',
  6: 'STAGE 6 — Final activation',
};

export function taxonomyCounts(
  blockers: Array<{ taxonomy: BlockerTaxonomy }>,
): Record<BlockerTaxonomy, number> {
  const counts: Record<BlockerTaxonomy, number> = {
    INTERNAL_ACTION_REQUIRED: 0,
    EXTERNAL_PROVIDER_REQUIRED: 0,
    EXTERNAL_BUSINESS_APPROVAL: 0,
    LEGAL_REGULATORY_REQUIRED: 0,
    CONFIGURATION_REQUIRED: 0,
    SECURITY_REQUIRED: 0,
  };
  for (const b of blockers) {
    counts[b.taxonomy] += 1;
  }
  return counts;
}

/** Known production dependencies expected in the final matrix (hidden-gate audit baseline). */
export function listKnownProductionDependencyCatalog(): Array<{
  code: string;
  dimension: LaunchDimensionId | 'SECURITY';
  source_sprint: string;
  in_final_matrix: true;
}> {
  return [
    { code: 'PAYMENT_PROVIDER', dimension: 'PAYMENTS', source_sprint: 'S44', in_final_matrix: true },
    { code: 'OTP_PROVIDER', dimension: 'COMMUNICATIONS', source_sprint: 'S45', in_final_matrix: true },
    { code: 'MESSAGING_PROVIDER', dimension: 'COMMUNICATIONS', source_sprint: 'S45', in_final_matrix: true },
    { code: 'CARRIER', dimension: 'LOGISTICS', source_sprint: 'S46', in_final_matrix: true },
    { code: 'KYC_PROVIDER', dimension: 'PARTNER_NETWORK', source_sprint: 'S43', in_final_matrix: true },
    { code: 'OBJECT_STORAGE', dimension: 'INFRASTRUCTURE', source_sprint: 'S47', in_final_matrix: true },
    { code: 'KMS_SECRETS', dimension: 'SECURITY', source_sprint: 'S47', in_final_matrix: true },
    { code: 'MALWARE_SCANNER', dimension: 'SECURITY', source_sprint: 'S47', in_final_matrix: true },
    { code: 'PITR_OFFSITE', dimension: 'SECURITY', source_sprint: 'S47', in_final_matrix: true },
    { code: 'ERX', dimension: 'HEALTHCARE', source_sprint: 'S48', in_final_matrix: true },
    { code: 'VIDEO', dimension: 'HEALTHCARE', source_sprint: 'S48', in_final_matrix: true },
    { code: 'PACS_DICOM', dimension: 'HEALTHCARE', source_sprint: 'S48', in_final_matrix: true },
    { code: 'HL7_FHIR', dimension: 'HEALTHCARE', source_sprint: 'S48', in_final_matrix: true },
  ];
}
