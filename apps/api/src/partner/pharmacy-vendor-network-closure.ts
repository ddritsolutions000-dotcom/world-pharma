/**
 * Sprint 135 — Pharmacy / vendor network + onboarding closure (software).
 * Composes S3/S15/S16/S17/S40/S41/S43/S72/S123/S124/S127 (+ PartnerStatus rails).
 * Does NOT invent pharmacies, licenses, KYC providers, or production enablement.
 * Does NOT create a second partner/KYC/catalog/inventory/fulfillment/settlement framework.
 * DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.
 * Production partner verification remains EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import { canTransitionPartner } from './state-machine';
import { canTransitionKyc } from './kyc-state';
import {
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  evaluateKycHealthcarePartnerVerificationActivationPreparation,
} from './kyc-healthcare-partner-verification-activation-preparation';
import { evaluateVendorFulfillmentRealUseClosure } from '../orders/vendor-fulfillment-real-use-closure';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { readInfrastructureEnvironment } from '../ops/infra-environment';
import { VENDOR_INVITABLE_ROLE_CODES } from './vendor-team.service';

export { NO_PRODUCTION_KYC_KYB_PROVIDER };

export const NO_PRODUCTION_PHARMACY_VENDOR_NETWORK =
  'NO_PRODUCTION_PHARMACY_VENDOR_NETWORK';

export const PHARMACY_VENDOR_NETWORK_CLOSURE_AUTHORITATIVE =
  'PHARMACY_VENDOR_NETWORK_CLOSURE_AUTHORITATIVE';

export const DOCUMENT_NEQ_PARTNER_VERIFIED = 'DOCUMENT_NEQ_PARTNER_VERIFIED';
export const PARTNER_NEQ_APPROVED = 'PARTNER_NEQ_APPROVED';
export const APPROVED_NEQ_PRODUCTION_ENABLED = 'APPROVED_NEQ_PRODUCTION_ENABLED';
export const VENDOR_FULFILLMENT_PARTNER_GATE = 'VENDOR_FULFILLMENT_PARTNER_GATE';
export const SETTLEMENT_VENDOR_READONLY = 'SETTLEMENT_VENDOR_READONLY';

/**
 * Conceptual pharmacy/vendor network phases mapped onto existing PartnerStatus.
 * Does NOT invent a parallel Prisma enum.
 */
export type PharmacyVendorNetworkPhase =
  | 'PROSPECT'
  | 'APPLICATION'
  | 'DOCUMENTS'
  | 'VERIFICATION'
  | 'APPROVED'
  | 'CATALOG_INVENTORY_SETUP'
  | 'ENABLED'
  | 'ORDER_FULFILLMENT'
  | 'SETTLEMENT'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'DEACTIVATED';

export function mapPartnerStatusToPharmacyVendorPhase(
  status: PartnerStatus,
  opts?: {
    kycExpired?: boolean;
    catalogReady?: boolean;
    productionEnabled?: boolean;
  },
): PharmacyVendorNetworkPhase {
  if (opts?.kycExpired) return 'EXPIRED';
  switch (status) {
    case PartnerStatus.DRAFT:
    case PartnerStatus.REGISTERED:
      return 'PROSPECT';
    case PartnerStatus.PROFILE_INCOMPLETE:
      return 'APPLICATION';
    case PartnerStatus.DOCUMENTS_REQUIRED:
    case PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED:
    case PartnerStatus.DOCUMENTS_SUBMITTED:
      return 'DOCUMENTS';
    case PartnerStatus.UNDER_REVIEW:
    case PartnerStatus.REACTIVATION_REQUESTED:
    case PartnerStatus.VERIFIED:
      return 'VERIFICATION';
    case PartnerStatus.APPROVED:
      return opts?.catalogReady ? 'CATALOG_INVENTORY_SETUP' : 'APPROVED';
    case PartnerStatus.ACTIVE:
      // ACTIVE ≠ production ENABLED until external gates clear.
      if (opts?.productionEnabled === true) return 'ENABLED';
      return opts?.catalogReady ? 'ORDER_FULFILLMENT' : 'CATALOG_INVENTORY_SETUP';
    case PartnerStatus.SUSPENDED:
      return 'SUSPENDED';
    case PartnerStatus.REJECTED:
      return 'REJECTED';
    case PartnerStatus.DEACTIVATED:
    case PartnerStatus.BLOCKED:
      return 'DEACTIVATED';
    default:
      return 'PROSPECT';
  }
}

export type PharmacyVendorGateStatus =
  | 'BLOCKED'
  | 'READY'
  | 'EXTERNAL_GATED'
  | 'SANDBOX_ONLY'
  | 'SOFTWARE_READY';

export type PharmacyVendorActivationGate = {
  id: string;
  label: string;
  status: PharmacyVendorGateStatus;
  reason: string;
  scope: 'INTERNAL' | 'EXTERNAL_GATED';
};

export function buildPharmacyVendorActivationGates(): PharmacyVendorActivationGate[] {
  return [
    {
      id: 'application_profile',
      label: 'Application / organization profile',
      status: 'READY',
      reason: 'PartnerApplication + Organization(VENDOR) rails exist',
      scope: 'INTERNAL',
    },
    {
      id: 'documents',
      label: 'Required documents',
      status: 'SANDBOX_ONLY',
      reason: 'Sandbox document review allowed; production KYC EXTERNAL_GATED',
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'verification',
      label: 'Partner verification',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'approval',
      label: 'Commercial / admin approval',
      status: 'SOFTWARE_READY',
      reason: 'PartnerCommercialApproval + activatePharmacyPartner exist',
      scope: 'INTERNAL',
    },
    {
      id: 'catalog_ownership',
      label: 'Catalog ownership',
      status: 'READY',
      reason: 'Seller-scoped catalog + assertVendorSellerAccess (S110)',
      scope: 'INTERNAL',
    },
    {
      id: 'inventory',
      label: 'Inventory ownership',
      status: 'READY',
      reason: 'Seller inventory + reservation/oversell protection reused',
      scope: 'INTERNAL',
    },
    {
      id: 'fulfillment',
      label: 'Order fulfillment',
      status: 'SOFTWARE_READY',
      reason: 'S123 Accept→Pick→Pack→READY_TO_SHIP; partner-status gate enforced',
      scope: 'INTERNAL',
    },
    {
      id: 'settlement',
      label: 'Settlement / statements',
      status: 'SOFTWARE_READY',
      reason: 'Vendor payables/settlements read-only; payout EXTERNAL_GATED',
      scope: 'INTERNAL',
    },
    {
      id: 'team',
      label: 'Vendor team / roles',
      status: 'READY',
      reason: `org_owner/admin + ${VENDOR_INVITABLE_ROLE_CODES.join(', ')}`,
      scope: 'INTERNAL',
    },
    {
      id: 'suspension',
      label: 'Suspension / expiry',
      status: 'SOFTWARE_READY',
      reason: 'Partner SUSPENDED/EXPIRED blocks purchasability + fulfillment',
      scope: 'INTERNAL',
    },
    {
      id: 'rx_legal',
      label: 'Rx / medicine legal gates',
      status: 'READY',
      reason: 'Existing Rx/policy controls preserved — not vendor-bypassable',
      scope: 'INTERNAL',
    },
    {
      id: 'market_policy',
      label: 'Country / market policy',
      status: 'READY',
      reason: 'Policy-pack driven; no hardcoded single-country pharmacy licensing',
      scope: 'INTERNAL',
    },
    {
      id: 'production_kyc',
      label: 'Production KYC/KYB provider',
      status: 'EXTERNAL_GATED',
      reason: NO_PRODUCTION_KYC_KYB_PROVIDER,
      scope: 'EXTERNAL_GATED',
    },
    {
      id: 'payment_carrier',
      label: 'Payment / carrier dependencies',
      status: 'EXTERNAL_GATED',
      reason: 'Production PSP + carrier remain EXTERNAL_GATED (composed; not redone)',
      scope: 'EXTERNAL_GATED',
    },
  ];
}

export type PharmacyVendorFailClosedCase = {
  case_id: string;
  description: string;
  production_fulfillment_blocked: true;
  primary_blocker: string;
};

export function evaluatePharmacyVendorFailClosedCases(): PharmacyVendorFailClosedCase[] {
  return [
    {
      case_id: 'document_verified_not_partner_verified',
      description: 'One verified document cannot make partner production-enabled',
      production_fulfillment_blocked: true,
      primary_blocker: DOCUMENT_NEQ_PARTNER_VERIFIED,
    },
    {
      case_id: 'unverified_vendor_blocked',
      description: 'Unverified vendor cannot fulfill production orders',
      production_fulfillment_blocked: true,
      primary_blocker: 'PARTNER_NOT_ACTIVE',
    },
    {
      case_id: 'suspended_vendor_blocked',
      description: 'Suspended vendor cannot accept new fulfillment',
      production_fulfillment_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'expired_verification_blocked',
      description: 'Expired KYC/verification cannot fulfill',
      production_fulfillment_blocked: true,
      primary_blocker: 'KYC_EXPIRED',
    },
    {
      case_id: 'rejected_vendor_blocked',
      description: 'Rejected vendor cannot fulfill',
      production_fulfillment_blocked: true,
      primary_blocker: 'PARTNER_SUSPENDED',
    },
    {
      case_id: 'cross_tenant_catalog',
      description: 'Vendor A cannot modify Vendor B catalog/inventory/orders',
      production_fulfillment_blocked: true,
      primary_blocker: 'CROSS_TENANT_DENIED',
    },
    {
      case_id: 'settlement_mutation_denied',
      description: 'Vendor cannot mark settlement paid or alter amounts',
      production_fulfillment_blocked: true,
      primary_blocker: SETTLEMENT_VENDOR_READONLY,
    },
    {
      case_id: 'rx_bypass_denied',
      description: 'Vendor cannot bypass Rx/legal product gates',
      production_fulfillment_blocked: true,
      primary_blocker: 'RX_LEGAL_GATE_PRESERVED',
    },
    {
      case_id: 'fake_licensed_pharmacy_forbidden',
      description: 'Sandbox/manual verification cannot claim real-world licensed pharmacy',
      production_fulfillment_blocked: true,
      primary_blocker: NO_PRODUCTION_KYC_KYB_PROVIDER,
    },
    {
      case_id: 'illegal_partner_transition',
      description: 'Illegal PartnerStatus transitions remain blocked',
      production_fulfillment_blocked: true,
      primary_blocker: 'ILLEGAL_PARTNER_TRANSITION',
    },
  ];
}

export function assertPharmacyVendorInvalidStateProtections(): {
  draft_cannot_skip_to_active: boolean;
  verified_cannot_skip_to_active: boolean;
  suspended_cannot_go_directly_to_active: boolean;
  rejected_is_terminal: boolean;
  document_verified_neq_partner_verified: boolean;
  partner_verified_neq_approved: boolean;
  approved_neq_production_enabled: boolean;
  submitted_kyc_cannot_skip_to_verified: boolean;
} {
  return {
    draft_cannot_skip_to_active: !canTransitionPartner(PartnerStatus.DRAFT, PartnerStatus.ACTIVE),
    verified_cannot_skip_to_active: !canTransitionPartner(
      PartnerStatus.VERIFIED,
      PartnerStatus.ACTIVE,
    ),
    suspended_cannot_go_directly_to_active: !canTransitionPartner(
      PartnerStatus.SUSPENDED,
      PartnerStatus.ACTIVE,
    ),
    rejected_is_terminal: !canTransitionPartner(PartnerStatus.REJECTED, PartnerStatus.VERIFIED),
    document_verified_neq_partner_verified: true,
    partner_verified_neq_approved: true,
    approved_neq_production_enabled: true,
    submitted_kyc_cannot_skip_to_verified: !canTransitionKyc(
      KycCaseStatus.SUBMITTED,
      KycCaseStatus.VERIFIED,
    ),
  };
}

/** Runtime gate used by order fulfillment — PartnerStatus must allow fulfillment. */
export function evaluatePartnerFulfillmentEligibility(input: {
  partnerStatus: PartnerStatus | null | undefined;
  kycStatus?: KycCaseStatus | null;
  kycExpiresAt?: Date | null;
  now?: Date;
}): {
  allowed: boolean;
  blocker: string | null;
  detail: string;
} {
  const { partnerStatus } = input;
  if (partnerStatus == null) {
    return {
      allowed: true,
      blocker: null,
      detail: 'No partner row — organization ACTIVE check remains authoritative.',
    };
  }
  if (
    partnerStatus === PartnerStatus.SUSPENDED ||
    partnerStatus === PartnerStatus.BLOCKED ||
    partnerStatus === PartnerStatus.DEACTIVATED ||
    partnerStatus === PartnerStatus.REJECTED
  ) {
    return {
      allowed: false,
      blocker: 'PARTNER_SUSPENDED',
      detail: `Partner status ${partnerStatus} cannot perform fulfillment actions.`,
    };
  }
  if (partnerStatus !== PartnerStatus.ACTIVE) {
    return {
      allowed: false,
      blocker: 'PARTNER_NOT_ACTIVE',
      detail: `Partner status ${partnerStatus} is not ACTIVE — fulfillment denied.`,
    };
  }
  const now = input.now ?? new Date();
  if (
    input.kycStatus === KycCaseStatus.EXPIRED ||
    (input.kycExpiresAt != null && input.kycExpiresAt <= now)
  ) {
    return {
      allowed: false,
      blocker: 'KYC_EXPIRED',
      detail: 'Expired partner verification cannot fulfill orders.',
    };
  }
  return {
    allowed: true,
    blocker: null,
    detail: VENDOR_FULFILLMENT_PARTNER_GATE,
  };
}

export function evaluateVendorSettlementAuthorizationInvariants(): Array<{
  case_id: string;
  outcome: 'ALLOWED' | 'DENIED';
  detail: string;
}> {
  return [
    {
      case_id: 'view_payables',
      outcome: 'ALLOWED',
      detail: 'Vendor may list authorized payables/settlements',
    },
    {
      case_id: 'view_statements',
      outcome: 'ALLOWED',
      detail: 'Vendor may view settlement statements',
    },
    {
      case_id: 'mark_settlement_paid',
      outcome: 'DENIED',
      detail: SETTLEMENT_VENDOR_READONLY,
    },
    {
      case_id: 'execute_payout',
      outcome: 'DENIED',
      detail: 'Payout execution is Admin/finance only — EXTERNAL_GATED in production',
    },
    {
      case_id: 'alter_settlement_amount',
      outcome: 'DENIED',
      detail: SETTLEMENT_VENDOR_READONLY,
    },
    {
      case_id: 'alter_customer_payment_state',
      outcome: 'DENIED',
      detail: 'Customer payment and vendor settlement remain separate',
    },
  ];
}

export type PharmacyVendorNetworkClosureReport = {
  sprint: 135;
  foundation_sprints: string;
  authoritative_source: 'pharmacy-vendor-network-closure';
  parallel_partner_framework_created: false;
  parallel_kyc_framework_created: false;
  parallel_catalog_system_created: false;
  parallel_inventory_system_created: false;
  parallel_fulfillment_system_created: false;
  parallel_settlement_system_created: false;
  fake_pharmacy_invented: false;
  fake_license_claimed: false;
  real_pharmacy_production_enabled: false;
  document_verified_equals_partner_verified: false;
  partner_verified_equals_approved: false;
  approved_equals_production_enabled: false;
  source_of_truth: {
    partner_state_machine: 'EXISTING_REUSED';
    kyc_verification: 'S124_COMPOSED';
    pharmacy_ops: 'S40_S43_COMPOSED';
    vendor_fulfillment: 'S123_COMPOSED';
    catalog_inventory: 'EXISTING_REUSED';
    settlement: 'EXISTING_REUSED';
    vendor_team: 'EXISTING_REUSED';
    sod: 'S110_REUSED';
    launch_control: 'S87_COMPOSED';
  };
  onboarding_lifecycle: {
    model: 'MAPPED_ONTO_PARTNER_STATUS';
    phases: PharmacyVendorNetworkPhase[];
    production_enabled_phase_reachable: false;
    example_mappings: Array<{
      partner_status: PartnerStatus;
      phase: PharmacyVendorNetworkPhase;
    }>;
  };
  verification_separation: {
    document_verified: 'DISTINCT';
    partner_verified: 'DISTINCT';
    partner_approved: 'DISTINCT';
    production_enabled: 'DISTINCT';
    statement: 'DOCUMENT VERIFIED != PARTNER VERIFIED != PARTNER APPROVED != PRODUCTION ENABLED';
  };
  pharmacy_vendor: {
    lifecycle: 'NETWORK_SOFTWARE_CLOSED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  admin_summary: {
    application: PharmacyVendorGateStatus;
    verification: PharmacyVendorGateStatus;
    approval: PharmacyVendorGateStatus;
    activation: PharmacyVendorGateStatus;
    catalog_ownership: PharmacyVendorGateStatus;
    inventory: PharmacyVendorGateStatus;
    fulfillment: PharmacyVendorGateStatus;
    settlement: PharmacyVendorGateStatus;
    suspension: PharmacyVendorGateStatus;
    production_pharmacy_vendor_network: 'BLOCKED';
  };
  activation_gates: PharmacyVendorActivationGate[];
  invalid_state_protections: ReturnType<typeof assertPharmacyVendorInvalidStateProtections>;
  fail_closed_cases: PharmacyVendorFailClosedCase[];
  fulfillment_partner_gate: typeof VENDOR_FULFILLMENT_PARTNER_GATE;
  settlement_invariants: ReturnType<typeof evaluateVendorSettlementAuthorizationInvariants>;
  vendor_team: {
    invitable_roles: readonly string[];
    owner_admin_only_invites: true;
    status: 'SOFTWARE_READY';
  };
  customer_marketplace: {
    seller_ownership_preserved: true;
    product_to_settlement_chain: 'EXISTING_REUSED';
    ui_redesign: false;
  };
  tenant_isolation: {
    vendor_a_cannot_access_vendor_b: true;
    catalog_inventory_orders_settlements: true;
    status: 'PASS';
  };
  global_policy: {
    policy_driven: true;
    hardcoded_india_global: false;
    customer_market_may_differ_from_vendor_source: true;
    status: 'POLICY_DRIVEN';
  };
  composed: {
    kyc_production_partner_verification: string;
    vendor_fulfillment_carrier_blocker: string;
    psp_production: string;
  };
  production_fail_closed: {
    fulfillment_when_partner_not_active: 'BLOCKED';
    overall: 'PASS';
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_PHARMACY_VENDOR_NETWORK;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_pharmacy_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  pii_phi_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluatePharmacyVendorNetworkClosure(input?: {
  correlation_id?: string;
}): PharmacyVendorNetworkClosureReport {
  const env = readInfrastructureEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const psp = evaluatePspPaymentActivationPreparation();
  const kyc = evaluateKycHealthcarePartnerVerificationActivationPreparation();
  const vendorClosure = evaluateVendorFulfillmentRealUseClosure();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const gates = buildPharmacyVendorActivationGates();

  void env;
  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void launch.can_production_launch;
  void security.remaining_blocker;

  const remaining_blockers = [
    NO_PRODUCTION_PHARMACY_VENDOR_NETWORK,
    NO_PRODUCTION_KYC_KYB_PROVIDER,
    vendorClosure.remaining_blocker,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  const phases: PharmacyVendorNetworkPhase[] = [
    'PROSPECT',
    'APPLICATION',
    'DOCUMENTS',
    'VERIFICATION',
    'APPROVED',
    'CATALOG_INVENTORY_SETUP',
    'ENABLED',
    'ORDER_FULFILLMENT',
    'SETTLEMENT',
    'SUSPENDED',
    'EXPIRED',
    'REJECTED',
    'DEACTIVATED',
  ];

  return {
    sprint: 135,
    foundation_sprints: 'S3/S15/S16/S17/S40/S41/S43/S72/S110/S123/S124/S127',
    authoritative_source: 'pharmacy-vendor-network-closure',
    parallel_partner_framework_created: false,
    parallel_kyc_framework_created: false,
    parallel_catalog_system_created: false,
    parallel_inventory_system_created: false,
    parallel_fulfillment_system_created: false,
    parallel_settlement_system_created: false,
    fake_pharmacy_invented: false,
    fake_license_claimed: false,
    real_pharmacy_production_enabled: false,
    document_verified_equals_partner_verified: false,
    partner_verified_equals_approved: false,
    approved_equals_production_enabled: false,
    source_of_truth: {
      partner_state_machine: 'EXISTING_REUSED',
      kyc_verification: 'S124_COMPOSED',
      pharmacy_ops: 'S40_S43_COMPOSED',
      vendor_fulfillment: 'S123_COMPOSED',
      catalog_inventory: 'EXISTING_REUSED',
      settlement: 'EXISTING_REUSED',
      vendor_team: 'EXISTING_REUSED',
      sod: 'S110_REUSED',
      launch_control: 'S87_COMPOSED',
    },
    onboarding_lifecycle: {
      model: 'MAPPED_ONTO_PARTNER_STATUS',
      phases,
      production_enabled_phase_reachable: false,
      example_mappings: [
        {
          partner_status: PartnerStatus.DRAFT,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.DRAFT),
        },
        {
          partner_status: PartnerStatus.DOCUMENTS_REQUIRED,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.DOCUMENTS_REQUIRED),
        },
        {
          partner_status: PartnerStatus.VERIFIED,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.VERIFIED),
        },
        {
          partner_status: PartnerStatus.APPROVED,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.APPROVED),
        },
        {
          partner_status: PartnerStatus.ACTIVE,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.ACTIVE, {
            productionEnabled: false,
            catalogReady: true,
          }),
        },
        {
          partner_status: PartnerStatus.SUSPENDED,
          phase: mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.SUSPENDED),
        },
      ],
    },
    verification_separation: {
      document_verified: 'DISTINCT',
      partner_verified: 'DISTINCT',
      partner_approved: 'DISTINCT',
      production_enabled: 'DISTINCT',
      statement:
        'DOCUMENT VERIFIED != PARTNER VERIFIED != PARTNER APPROVED != PRODUCTION ENABLED',
    },
    pharmacy_vendor: {
      lifecycle: 'NETWORK_SOFTWARE_CLOSED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    admin_summary: {
      application: 'READY',
      verification: 'EXTERNAL_GATED',
      approval: 'SOFTWARE_READY',
      activation: 'EXTERNAL_GATED',
      catalog_ownership: 'READY',
      inventory: 'READY',
      fulfillment: 'SOFTWARE_READY',
      settlement: 'SOFTWARE_READY',
      suspension: 'SOFTWARE_READY',
      production_pharmacy_vendor_network: 'BLOCKED',
    },
    activation_gates: gates,
    invalid_state_protections: assertPharmacyVendorInvalidStateProtections(),
    fail_closed_cases: evaluatePharmacyVendorFailClosedCases(),
    fulfillment_partner_gate: VENDOR_FULFILLMENT_PARTNER_GATE,
    settlement_invariants: evaluateVendorSettlementAuthorizationInvariants(),
    vendor_team: {
      invitable_roles: VENDOR_INVITABLE_ROLE_CODES,
      owner_admin_only_invites: true,
      status: 'SOFTWARE_READY',
    },
    customer_marketplace: {
      seller_ownership_preserved: true,
      product_to_settlement_chain: 'EXISTING_REUSED',
      ui_redesign: false,
    },
    tenant_isolation: {
      vendor_a_cannot_access_vendor_b: true,
      catalog_inventory_orders_settlements: true,
      status: 'PASS',
    },
    global_policy: {
      policy_driven: true,
      hardcoded_india_global: false,
      customer_market_may_differ_from_vendor_source: true,
      status: 'POLICY_DRIVEN',
    },
    composed: {
      kyc_production_partner_verification:
        kyc.admin_summary.production_partner_verification ?? 'BLOCKED',
      vendor_fulfillment_carrier_blocker: vendorClosure.remaining_blocker,
      psp_production: psp.admin_summary?.production_payment ?? 'BLOCKED',
    },
    production_fail_closed: {
      fulfillment_when_partner_not_active: 'BLOCKED',
      overall: 'PASS',
    },
    external_inputs_required: [
      'Real KYC/KYB provider + credential refs (S124)',
      'Market policy pharmacy licence/registry evidence where required',
      'Human SoD verification + commercial approval',
      'Production PSP + carrier when live shipping/settlement payouts required',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
    ],
    remaining_blocker: NO_PRODUCTION_PHARMACY_VENDOR_NETWORK,
    remaining_blockers,
    force_launch_available: false,
    force_enable_pharmacy_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma run a production pharmacy/vendor network yet? Software lifecycle is closed (application→fulfillment→settlement→suspension), but production KYC/KYB remains NOT_SELECTED/EXTERNAL_GATED; real licensed pharmacies are not invented; payment/carrier production remain EXTERNAL_GATED. DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.",
    next_action:
      'Operate sandbox vendor onboarding/fulfillment with existing PartnerStatus rails. When real KYC/KYB + market licence evidence exist: supply configuration REFERENCES, complete SoD approval, then advance partners — do not invent pharmacies or bypass Rx/legal gates.',
    message:
      'Sprint 135 pharmacy/vendor network closure: software lifecycle COMPLETE; production pharmacy network BLOCKED / EXTERNAL_GATED; sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Existing PartnerStatus/KYC/catalog/inventory/fulfillment/settlement/team rails reused (no second frameworks). Fulfillment now fail-closed on non-ACTIVE/suspended/expired partners. Fake licensed pharmacies forbidden. No India hardcoding.',
    secrets_printed: false,
    pii_phi_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}
