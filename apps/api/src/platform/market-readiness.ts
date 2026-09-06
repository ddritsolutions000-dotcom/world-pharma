/**
 * Server-authoritative market readiness — pure calculation over existing config signals.
 * Does not invent healthcare regulations or live provider capability.
 *
 * Sprint 39: extended with 5-dimension readiness (software / legal / commercial /
 * integration / production) as distinct non-collapsible gates.
 */

export type MarketReadinessState =
  | 'NOT_READY'
  | 'READY_FOR_SANDBOX'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVE'
  | 'SUSPENDED';

// ── Sprint 39: 5-dimension readiness ────────────────────────────────────────

export type ReadinessDimension = 'SOFTWARE' | 'LEGAL' | 'COMMERCIAL' | 'INTEGRATION' | 'PRODUCTION';

export type ReadinessGateStatus = 'READY' | 'MISSING' | 'EXTERNAL_GATED' | 'EXPIRED' | 'BLOCKED';

export type ReadinessDimensionResult = {
  dimension: ReadinessDimension;
  status: ReadinessGateStatus;
  blockers: string[];
};

export type LaunchReadinessInput = {
  /** Existing commerce/config signals */
  commerce: MarketReadinessInput;
  /** Healthcare regulatory policy published for this country? */
  healthcarePolicyPublished: boolean;
  /** Are all REQUIRED regulatory requirements covered by VERIFIED non-expired evidence? */
  allRequirementsMet: boolean;
  /** Any required evidence is expired? */
  anyEvidenceExpired: boolean;
  /** Has a real pharmacy/lab/doctor network been commercially confirmed? */
  commercialNetworkPresent: boolean;
  /** Is a live PSP credential configured + verified? */
  livePspConfigured: boolean;
  /** Is a live OTP provider configured? */
  liveOtpConfigured: boolean;
  /** Is a live messaging provider configured? */
  liveMessagingConfigured: boolean;
  /** Is a live carrier configured? */
  liveCarrierConfigured: boolean;
  /** Is a KYC provider verified? */
  kycProviderVerified: boolean;
};

export type LaunchReadinessResult = {
  dimensions: ReadinessDimensionResult[];
  productionReady: boolean;
};

export function computeLaunchReadiness(input: LaunchReadinessInput): LaunchReadinessResult {
  const commerce = computeMarketReadiness(input.commerce);

  // SOFTWARE dimension: existing commerce config gates are all internal-software decisions.
  const softwareBlockers: string[] = commerce.blockers.filter(
    (b) =>
      b !== 'LIVE_PSP_EXTERNAL_GATED' &&
      b !== 'LIVE_CARRIER_EXTERNAL_GATED' &&
      b !== 'LIVE_OTP_EXTERNAL_GATED' &&
      b !== 'LIVE_MESSAGING_EXTERNAL_GATED' &&
      b !== 'KYC_PROVIDER_EXTERNAL_GATED',
  );
  const software: ReadinessDimensionResult = {
    dimension: 'SOFTWARE',
    status: softwareBlockers.length === 0 ? 'READY' : 'MISSING',
    blockers: softwareBlockers,
  };

  // LEGAL dimension: healthcare policy + regulatory evidence.
  const legalBlockers: string[] = [];
  if (!input.healthcarePolicyPublished) {
    legalBlockers.push('HEALTHCARE_POLICY_NOT_PUBLISHED');
  }
  if (!input.allRequirementsMet) {
    legalBlockers.push('REGULATORY_REQUIREMENTS_NOT_MET');
  }
  if (input.anyEvidenceExpired) {
    legalBlockers.push('REGULATORY_EVIDENCE_EXPIRED');
  }
  const legalStatus: ReadinessGateStatus =
    input.anyEvidenceExpired
      ? 'EXPIRED'
      : legalBlockers.length === 0
        ? 'READY'
        : 'MISSING';
  const legal: ReadinessDimensionResult = {
    dimension: 'LEGAL',
    status: legalStatus,
    blockers: legalBlockers,
  };

  // COMMERCIAL dimension: real partner networks.
  const commercialBlockers: string[] = [];
  if (!input.commercialNetworkPresent) {
    commercialBlockers.push('COMMERCIAL_NETWORK_NOT_CONFIRMED');
  }
  const commercial: ReadinessDimensionResult = {
    dimension: 'COMMERCIAL',
    status: commercialBlockers.length === 0 ? 'READY' : 'MISSING',
    blockers: commercialBlockers,
  };

  // INTEGRATION dimension: live external providers.
  const integrationBlockers: string[] = [];
  if (!input.livePspConfigured) integrationBlockers.push('LIVE_PSP_EXTERNAL_GATED');
  if (!input.liveOtpConfigured) integrationBlockers.push('LIVE_OTP_EXTERNAL_GATED');
  if (!input.liveMessagingConfigured) integrationBlockers.push('LIVE_MESSAGING_EXTERNAL_GATED');
  if (!input.liveCarrierConfigured) integrationBlockers.push('LIVE_CARRIER_EXTERNAL_GATED');
  if (!input.kycProviderVerified) integrationBlockers.push('KYC_PROVIDER_EXTERNAL_GATED');
  const integration: ReadinessDimensionResult = {
    dimension: 'INTEGRATION',
    status: integrationBlockers.length === 0 ? 'READY' : 'EXTERNAL_GATED',
    blockers: integrationBlockers,
  };

  // PRODUCTION dimension: all prior dimensions must be READY.
  const productionReady =
    software.status === 'READY' &&
    legal.status === 'READY' &&
    commercial.status === 'READY' &&
    integration.status === 'READY';
  const production: ReadinessDimensionResult = {
    dimension: 'PRODUCTION',
    status: productionReady ? 'READY' : 'BLOCKED',
    blockers: productionReady
      ? []
      : ['NOT_ALL_DIMENSIONS_READY'],
  };

  return {
    dimensions: [software, legal, commercial, integration, production],
    productionReady,
  };
}

/** @deprecated Prefer MarketReadinessState; kept for UI transition. */
export type CountryReadinessState =
  | MarketReadinessState
  | 'DRAFT'
  | 'CONFIGURING'
  | 'SANDBOX_READY'
  | 'PRODUCTION_READY';

export type MarketReadinessBlocker =
  | 'CURRENCY_NOT_CONFIGURED'
  | 'POLICY_PACK_MISSING'
  | 'SERVICEABILITY_NOT_CONFIGURED'
  | 'PAYMENT_POLICY_MISSING'
  | 'DELIVERY_POLICY_MISSING'
  | 'NOTIFICATION_POLICY_MISSING'
  | 'SETTLEMENT_POLICY_MISSING'
  | 'LIVE_PSP_EXTERNAL_GATED'
  | 'LIVE_CARRIER_EXTERNAL_GATED'
  | 'LIVE_OTP_EXTERNAL_GATED'
  | 'LIVE_MESSAGING_EXTERNAL_GATED'
  | 'KYC_PROVIDER_EXTERNAL_GATED';

export type MarketReadinessInput = {
  countryStatus: 'ACTIVE' | 'INACTIVE';
  currency: string | null | undefined;
  hasPublishedPolicyPack: boolean;
  /** payments.enabled + methods/currencies on published pack */
  paymentPolicyConfigured: boolean;
  /** shipping.domestic on published pack */
  deliveryPolicyConfigured: boolean;
  serviceabilityZonesActive: number;
  /** NotificationCountryProvider rows (any) — optional for sandbox commerce */
  notificationProvidersConfigured: number;
  /** SettlementPolicy row present */
  settlementPolicyConfigured: boolean;
  livePaymentEnabled: boolean;
};

export type MarketReadinessResult = {
  readiness: MarketReadinessState;
  /** Mandatory internal blockers that prevent activation. */
  blockers: MarketReadinessBlocker[];
  /** Explicit external/production gates — never imply live capability. */
  external_gates: MarketReadinessBlocker[];
  /** True when mandatory internal blockers are empty (sandbox commerce possible). */
  can_activate_sandbox: boolean;
  healthcare: {
    status: 'NOT_MODELED';
    items: Array<{ code: string; status: 'NOT_MODELED' }>;
  };
};

const HEALTHCARE_NOT_MODELED = [
  'pharmacy_licensing',
  'doctor_licensing',
  'lab_accreditation',
  'prescription_erx_requirements',
  'controlled_medicine_rules',
  'local_healthcare_data_requirements',
] as const;

export function computeMarketReadiness(input: MarketReadinessInput): MarketReadinessResult {
  const blockers: MarketReadinessBlocker[] = [];
  const currency = (input.currency ?? '').trim().toUpperCase();
  if (!currency || currency.length !== 3) {
    blockers.push('CURRENCY_NOT_CONFIGURED');
  }
  if (!input.hasPublishedPolicyPack) {
    blockers.push('POLICY_PACK_MISSING');
  }
  if (!input.paymentPolicyConfigured) {
    blockers.push('PAYMENT_POLICY_MISSING');
  }
  if (!input.deliveryPolicyConfigured) {
    blockers.push('DELIVERY_POLICY_MISSING');
  }
  if (input.serviceabilityZonesActive <= 0) {
    blockers.push('SERVICEABILITY_NOT_CONFIGURED');
  }
  if (!input.settlementPolicyConfigured) {
    blockers.push('SETTLEMENT_POLICY_MISSING');
  }

  // Notifications: required for READY_FOR_ACTIVATION tracking but not mandatory to block
  // sandbox activation when zero — commerce can run; inbox may be empty.
  // Still surface as blocker when none configured so operators see the gap.
  if (input.notificationProvidersConfigured <= 0) {
    blockers.push('NOTIFICATION_POLICY_MISSING');
  }

  const external_gates: MarketReadinessBlocker[] = [
    'LIVE_PSP_EXTERNAL_GATED',
    'LIVE_CARRIER_EXTERNAL_GATED',
    'LIVE_OTP_EXTERNAL_GATED',
    'LIVE_MESSAGING_EXTERNAL_GATED',
    'KYC_PROVIDER_EXTERNAL_GATED',
  ];
  // Live payments flag does not remove the gate — it only indicates env readiness elsewhere.
  if (!input.livePaymentEnabled && !external_gates.includes('LIVE_PSP_EXTERNAL_GATED')) {
    external_gates.push('LIVE_PSP_EXTERNAL_GATED');
  }

  const mandatory = blockers.filter((b) => b !== 'NOTIFICATION_POLICY_MISSING');
  // Sandbox activation requires currency, pack, payment, delivery, serviceability, settlement.
  // Notification matrix is recommended but not a hard commerce blocker for sandbox.
  const can_activate_sandbox = mandatory.length === 0;

  const healthcare = {
    status: 'NOT_MODELED' as const,
    items: HEALTHCARE_NOT_MODELED.map((code) => ({ code, status: 'NOT_MODELED' as const })),
  };

  let readiness: MarketReadinessState;
  if (input.countryStatus === 'ACTIVE' && can_activate_sandbox) {
    readiness = 'ACTIVE';
  } else if (input.countryStatus === 'ACTIVE' && !can_activate_sandbox) {
    readiness = 'NOT_READY';
  } else if (can_activate_sandbox && blockers.includes('NOTIFICATION_POLICY_MISSING')) {
    readiness = 'READY_FOR_SANDBOX';
  } else if (can_activate_sandbox) {
    readiness = 'READY_FOR_ACTIVATION';
  } else if (input.countryStatus === 'INACTIVE' && input.hasPublishedPolicyPack && mandatory.length > 0) {
    // Pack exists but other mandatory config missing — not suspended, just incomplete.
    readiness = 'NOT_READY';
  } else {
    readiness = 'NOT_READY';
  }

  return {
    readiness,
    blockers,
    external_gates,
    can_activate_sandbox,
    healthcare,
  };
}

/** Map new readiness to legacy badge vocabulary for older UI consumers. */
export function legacyReadinessAlias(state: MarketReadinessState): CountryReadinessState {
  switch (state) {
    case 'NOT_READY':
      return 'DRAFT';
    case 'READY_FOR_SANDBOX':
      return 'SANDBOX_READY';
    case 'READY_FOR_ACTIVATION':
      return 'PRODUCTION_READY';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'SUSPENDED':
      return 'SUSPENDED';
    default:
      return 'CONFIGURING';
  }
}

export function parsePolicyCommerceSignals(document: unknown): {
  paymentPolicyConfigured: boolean;
  deliveryPolicyConfigured: boolean;
  currencyFromPack: string | null;
} {
  if (!document || typeof document !== 'object') {
    return { paymentPolicyConfigured: false, deliveryPolicyConfigured: false, currencyFromPack: null };
  }
  const doc = document as {
    payments?: { enabled?: boolean; methods?: string[]; currencies?: string[] };
    shipping?: { domestic?: boolean };
    currency?: { default?: string };
  };
  const paymentPolicyConfigured = Boolean(
    doc.payments?.enabled &&
      Array.isArray(doc.payments.methods) &&
      doc.payments.methods.length > 0 &&
      Array.isArray(doc.payments.currencies) &&
      doc.payments.currencies.length > 0,
  );
  const deliveryPolicyConfigured = Boolean(doc.shipping?.domestic);
  const currencyFromPack =
    typeof doc.currency?.default === 'string' && doc.currency.default.trim().length === 3
      ? doc.currency.default.trim().toUpperCase()
      : null;
  return { paymentPolicyConfigured, deliveryPolicyConfigured, currencyFromPack };
}
