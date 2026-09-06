import {
  PARTNER_TYPE_CODES,
  SERVICE_KEYS,
  type PartnerTypeCode,
  type ServiceKey,
} from '@world-pharma/shared';

export interface PartnerTypePolicy {
  enabled: boolean;
  join_public: boolean;
  allowed_services: string[];
  required_fields: string[];
  required_documents: string[];
  approval_workflow: 'none' | 'single' | 'dual';
  auto_approve_after_verify: boolean;
  clinical_categories?: boolean;
}

export interface PolicyDocument {
  identity: {
    country_allowed: boolean;
    phone_e164_required: boolean;
    email_required: boolean;
    verification_required: boolean;
  };
  i18n: {
    default_locale: string;
    locales: string[];
  };
  currency: {
    default: string;
    allowed: string[];
  };
  timezone: {
    default: string;
    allowed: string[];
  };
  datetime: {
    date_format: string;
    time_format: string;
    number_format: string;
  };
  services: Record<ServiceKey, boolean>;
  payments: {
    enabled: boolean;
    methods: string[];
    gateway_refs: string[];
    currencies: string[];
  };
  /** Opaque tax profile id/code only — never rates, secrets, or credentials (Book 18). */
  tax_profile_id?: string | null;
  /** Opaque legal-entity / accounting-currency refs — empty until legal fills (Book 18). */
  ledger?: {
    legal_entity_id: string | null;
    accounting_currency: string | null;
  };
  shipping: {
    domestic: boolean;
    international: boolean;
    rx: boolean;
    controlled: boolean;
    cold_chain: boolean;
  };
  commerce?: {
    platform_fee_bps: number;
    platform_fee_flat_minor: number;
    delivery_fee_minor: number;
    packaging_fee_minor: number;
    handling_fee_minor: number;
    payment_convenience_fee_minor: number;
    free_delivery_threshold_minor: number | null;
    carrier_cost_estimate_minor: number;
    /** Basis points on eligible non-clinical goods subtotal after discounts. 0 = commission off. */
    affiliate_commission_bps?: number;
    /** Partner wallet / doctor take (bundled platform fee). Affiliate commission stays separate. */
    doctor_platform_fee_bps?: number;
    lab_platform_fee_bps?: number;
    delivery_platform_fee_bps?: number;
    pharmacy_platform_fee_bps?: number;
    partner_platform_fee_flat_minor?: number;
  };
  partner_types: Record<PartnerTypeCode, PartnerTypePolicy>;
  data_residency_mode: 'shared' | 'pinned_region' | 'dedicated_db';
  recording_allowed: boolean;
  healthcare: HealthcarePolicy;
  legal: {
    review_required: true;
    notes: string;
  };
  crm: {
    enabled: boolean;
    marketing?: {
      enabled: boolean;
      channels: string[];
      medicine_advertising: boolean;
    };
    loyalty?: {
      enabled: boolean;
    };
    reviews?: {
      enabled: boolean;
      verified_purchase_required: boolean;
    };
    personalization?: {
      retention_days: number;
    };
    automation?: {
      enabled: boolean;
      reorder_reminder_days: number;
    };
  };
  search?: {
    discovery_enabled: boolean;
    blocklist_terms: string[];
  };
  analytics?: {
    enabled: boolean;
    retention_days: number;
  };
}

export interface HealthcarePolicy {
  doctor_onboarding_enabled: boolean;
  doctor_public_visibility: boolean;
  required_credential_types: string[];
  telemedicine_eligibility: boolean;
  consultation_capability: boolean;
  appointments_enabled: boolean;
  booking_requires_consent: boolean;
  /** Fail-closed: digital prescribe. Empty/false = deny. */
  rx_prescribe_enabled: boolean;
  /** Fail-closed: pharmacy dispense (R5-C). Empty/false = deny. */
  rx_dispense_enabled: boolean;
  /** Fail-closed: external e-Rx. Empty/false = deny. */
  rx_erx_enabled: boolean;
  /** Opaque provider code (e.g. sandbox). Absent = e-Rx pack gate incomplete — fail closed. */
  rx_erx_provider_code?: string;
  /** Fail-closed: amend issued Rx. Empty/false = deny. */
  rx_amend_enabled: boolean;
  /**
   * Opaque restriction category codes explicitly allowed for prescribe.
   * Empty list = no restricted lines permitted (fail closed).
   */
  rx_allowed_restriction_codes: string[];
  /** Fail-closed: patient refill request UX. Empty/false = deny (ED-R5E-01). */
  rx_refill_enabled: boolean;
  /** When refill enabled, require doctor clinical re-auth before new dispense queue (ED-R5E-01 default). */
  rx_refill_require_doctor_reauth: boolean;
  /** Fail-closed: subscription object visibility. Empty/false = unavailable. */
  rx_subscription_enabled: boolean;
  /**
   * Fail-closed: automatic recurring refill execution.
   * Must remain false unless country/product/legal explicitly enable (Book 119).
   */
  rx_subscription_auto_execute: boolean;
  /** Fail-closed: patient health timeline (R9). Empty/false = deny. */
  health_timeline_enabled: boolean;
  /** Fail-closed: clinical/PHI search index (R13-G / OD-R13-04). Empty/false = deny. */
  clinical_search_enabled: boolean;
  /** Fail-closed: care navigation intake (R10). Empty/false = deny. */
  care_navigation_enabled: boolean;
}

export function disabledHealthcare(): HealthcarePolicy {
  return {
    doctor_onboarding_enabled: false,
    doctor_public_visibility: false,
    required_credential_types: [],
    telemedicine_eligibility: false,
    consultation_capability: false,
    appointments_enabled: false,
    booking_requires_consent: false,
    rx_prescribe_enabled: false,
    rx_dispense_enabled: false,
    rx_erx_enabled: false,
    rx_amend_enabled: false,
    rx_allowed_restriction_codes: [],
    rx_refill_enabled: false,
    rx_refill_require_doctor_reauth: true,
    rx_subscription_enabled: false,
    rx_subscription_auto_execute: false,
    health_timeline_enabled: false,
    clinical_search_enabled: false,
    care_navigation_enabled: false,
  };
}

const disabledPartner = (): PartnerTypePolicy => ({
  enabled: false,
  join_public: false,
  allowed_services: [],
  required_fields: [],
  required_documents: [],
  approval_workflow: 'none',
  auto_approve_after_verify: false,
});

export function emptyPolicyDocument(): PolicyDocument {
  const services = Object.fromEntries(SERVICE_KEYS.map((key) => [key, false])) as Record<
    ServiceKey,
    boolean
  >;
  const partner_types = Object.fromEntries(
    PARTNER_TYPE_CODES.map((code) => [
      code,
      code === 'AFFILIATE'
        ? { ...disabledPartner(), clinical_categories: false }
        : disabledPartner(),
    ]),
  ) as Record<PartnerTypeCode, PartnerTypePolicy>;

  return {
    identity: {
      country_allowed: true,
      phone_e164_required: true,
      email_required: false,
      verification_required: false,
    },
    i18n: {
      default_locale: 'en',
      locales: ['en'],
    },
    currency: {
      default: 'XXX',
      allowed: ['XXX'],
    },
    timezone: {
      default: 'UTC',
      allowed: ['UTC'],
    },
    datetime: {
      date_format: 'ISO-8601',
      time_format: 'HH:mm',
      number_format: '1,234.56',
    },
    services,
    payments: {
      enabled: false,
      methods: [],
      gateway_refs: [],
      currencies: [],
    },
    tax_profile_id: null,
    ledger: {
      legal_entity_id: null,
      accounting_currency: null,
    },
    shipping: {
      domestic: false,
      international: false,
      rx: false,
      controlled: false,
      cold_chain: false,
    },
    commerce: {
      platform_fee_bps: 0,
      platform_fee_flat_minor: 0,
      delivery_fee_minor: 0,
      packaging_fee_minor: 0,
      handling_fee_minor: 0,
      payment_convenience_fee_minor: 0,
      free_delivery_threshold_minor: null,
      carrier_cost_estimate_minor: 0,
      affiliate_commission_bps: 0,
    },
    partner_types,
    data_residency_mode: 'shared',
    recording_allowed: false,
    healthcare: disabledHealthcare(),
    legal: {
      review_required: true,
      notes:
        'LEGAL/COMPLIANCE REVIEW REQUIRED — this pack is a technical scaffold. It does not encode country law.',
    },
    crm: {
      enabled: false,
      marketing: {
        enabled: false,
        channels: ['in_app'],
        medicine_advertising: false,
      },
      loyalty: {
        enabled: false,
      },
      reviews: {
        enabled: true,
        verified_purchase_required: true,
      },
      personalization: {
        retention_days: 90,
      },
      automation: {
        enabled: false,
        reorder_reminder_days: 30,
      },
    },
    search: {
      discovery_enabled: true,
      blocklist_terms: [],
    },
    analytics: {
      enabled: false,
      retention_days: 365,
    },
  };
}

export const TECHNICAL_COUNTRY = {
  isoAlpha2: 'XX',
  isoAlpha3: 'XXX',
  nameI18n: { und: 'Technical placeholder (TBD)' },
  defaultLocale: 'en',
  defaultCurrency: 'XXX',
  defaultTimezone: 'UTC',
} as const;
