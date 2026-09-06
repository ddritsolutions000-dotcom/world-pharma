/**
 * Production PSP requirements + Sprint 88 configuration validation.
 * Never invent providers/credentials. Never return or log secret values —
 * only configured=true/false and reference_present=true/false.
 */
import {
  isLivePaymentEnabled,
  isProductionCountryAuthorized,
  isProductionRiskConfigured,
  readPaymentEnvironment,
} from './payment.config';

export type ProductionPspRequirement = {
  id: string;
  label: string;
  description: string;
  external_gated: boolean;
  configured: boolean;
};

/** Granular Sprint 88 configuration blockers (safe codes only). */
export const PSP_PROVIDER_NOT_SELECTED = 'PSP_PROVIDER_NOT_SELECTED';
export const PSP_CREDENTIAL_REFERENCE_MISSING = 'PSP_CREDENTIAL_REFERENCE_MISSING';
export const PSP_WEBHOOK_SECRET_REFERENCE_MISSING = 'PSP_WEBHOOK_SECRET_REFERENCE_MISSING';
export const PSP_WEBHOOK_CONFIGURATION_MISSING = 'PSP_WEBHOOK_CONFIGURATION_MISSING';
export const PSP_ENVIRONMENT_MISMATCH = 'PSP_ENVIRONMENT_MISMATCH';
export const PSP_MARKET_CONFIGURATION_MISSING = 'PSP_MARKET_CONFIGURATION_MISSING';
export const PSP_CURRENCY_CONFIGURATION_MISSING = 'PSP_CURRENCY_CONFIGURATION_MISSING';
export const PSP_RECONCILIATION_CONFIGURATION_MISSING = 'PSP_RECONCILIATION_CONFIGURATION_MISSING';

export type PspConfigPresence = {
  key: string;
  reference_present: boolean;
  /** Never include secret values. */
  configured: boolean;
};

export type ProductionPspConfigurationValidation = {
  provider_selected: boolean;
  provider_name: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  credential_reference: PspConfigPresence;
  webhook_secret_reference: PspConfigPresence;
  webhook_configuration: PspConfigPresence;
  market_configuration: PspConfigPresence;
  currency_configuration: PspConfigPresence;
  reconciliation_configuration: PspConfigPresence;
  blockers: string[];
  ready_for_activation: false | true;
  secrets_exposed: false;
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

/** Read-only catalog of production inputs — no secrets, no fabricated readiness. */
export function listProductionPspRequirements(countryIso2?: string): ProductionPspRequirement[] {
  const country = countryIso2?.trim().toUpperCase();
  return [
    {
      id: 'psp_provider',
      label: 'PSP / acquirer contract',
      description: 'Approved payment service provider and merchant contract for the target country.',
      external_gated: true,
      configured: false,
    },
    {
      id: 'merchant_entity',
      label: 'Merchant legal entity / account identifier',
      description: 'Legal entity registered with the PSP as merchant of record or sub-merchant.',
      external_gated: true,
      configured: false,
    },
    {
      id: 'production_credentials',
      label: 'Production credentials / vault',
      description:
        'PAYMENT_GATEWAY_*_SECRET_REF pointing to vault-stored API keys — never stored in app config.',
      external_gated: true,
      configured: refPresent('PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'),
    },
    {
      id: 'webhook_secrets',
      label: 'Webhook signing secrets',
      description: 'Per-PSP webhook HMAC secrets configured out-of-band for signature verification.',
      external_gated: true,
      configured: refPresent('PAYMENT_WEBHOOK_SECRET_REF'),
    },
    {
      id: 'webhook_endpoint',
      label: 'Webhook endpoint configuration',
      description: 'Registered production webhook URL / callback configuration for the PSP.',
      external_gated: true,
      configured: refPresent('PAYMENT_WEBHOOK_ENDPOINT_REF'),
    },
    {
      id: 'pci_attestation',
      label: 'PCI SAQ / attestation',
      description: 'PCI scope assessment and attestation for card data handling model.',
      external_gated: true,
      configured: false,
    },
    {
      id: 'live_enabled',
      label: 'PAYMENT_LIVE_ENABLED',
      description: 'Explicit runtime flag — must remain false until human gates close.',
      external_gated: true,
      configured: isLivePaymentEnabled(),
    },
    {
      id: 'production_country',
      label: 'PAYMENT_PRODUCTION_COUNTRIES',
      description: 'Comma-separated ISO2 list authorizing live payment in specific countries.',
      external_gated: true,
      configured: country ? isProductionCountryAuthorized(country) : false,
    },
    {
      id: 'production_risk',
      label: 'PAYMENT_RISK_ADAPTER',
      description: 'Approved production fraud/risk adapter — sandbox allowlist is rejected for live traffic.',
      external_gated: true,
      configured: isProductionRiskConfigured(),
    },
    {
      id: 'refund_dispute_rules',
      label: 'Refund / dispute policy pack',
      description: 'Country policy pack rules for refund windows, chargeback handling, and MoR obligations.',
      external_gated: true,
      configured: false,
    },
    {
      id: 'adapter_implementation',
      label: 'Production PaymentGatewayAdapter',
      description: 'Real PSP adapter implementing PaymentGatewayPort — MockPaymentGatewayAdapter is sandbox-only.',
      external_gated: true,
      configured: false,
    },
    {
      id: 'reconciliation',
      label: 'Reconciliation / settlement configuration',
      description: 'Settlement file / recon job configuration refs — customer payment ≠ vendor payout.',
      external_gated: true,
      configured: refPresent('PAYMENT_RECONCILIATION_CONFIG_REF'),
    },
  ];
}

/**
 * Deterministic production PSP configuration validation.
 * Does not invent providers. Does not enable live payments.
 * Never exposes secret values.
 */
export function validateProductionPspConfiguration(input?: {
  providerSelected?: boolean;
  providerName?: string;
  nonMockAdapterRegistered?: boolean;
}): ProductionPspConfigurationValidation {
  const env = readPaymentEnvironment();
  const live = isLivePaymentEnabled();
  const providerSelected = Boolean(input?.providerSelected && input?.nonMockAdapterRegistered);
  const providerName =
    providerSelected && input?.providerName && input.providerName !== 'NOT_SELECTED'
      ? input.providerName
      : 'NOT_SELECTED';

  const credential_reference: PspConfigPresence = {
    key: 'PAYMENT_GATEWAY_PRODUCTION_SECRET_REF',
    reference_present: refPresent('PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'),
    configured: refPresent('PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'),
  };
  const webhook_secret_reference: PspConfigPresence = {
    key: 'PAYMENT_WEBHOOK_SECRET_REF',
    reference_present: refPresent('PAYMENT_WEBHOOK_SECRET_REF'),
    configured: refPresent('PAYMENT_WEBHOOK_SECRET_REF'),
  };
  const webhook_configuration: PspConfigPresence = {
    key: 'PAYMENT_WEBHOOK_ENDPOINT_REF',
    reference_present: refPresent('PAYMENT_WEBHOOK_ENDPOINT_REF'),
    configured: refPresent('PAYMENT_WEBHOOK_ENDPOINT_REF'),
  };
  const market_configuration: PspConfigPresence = {
    key: 'PAYMENT_PRODUCTION_COUNTRIES',
    reference_present: Boolean(process.env['PAYMENT_PRODUCTION_COUNTRIES']?.trim()),
    configured: Boolean(process.env['PAYMENT_PRODUCTION_COUNTRIES']?.trim()),
  };
  const currency_configuration: PspConfigPresence = {
    key: 'PAYMENT_PRODUCTION_CURRENCIES',
    reference_present: Boolean(process.env['PAYMENT_PRODUCTION_CURRENCIES']?.trim()),
    configured: Boolean(process.env['PAYMENT_PRODUCTION_CURRENCIES']?.trim()),
  };
  const reconciliation_configuration: PspConfigPresence = {
    key: 'PAYMENT_RECONCILIATION_CONFIG_REF',
    reference_present: refPresent('PAYMENT_RECONCILIATION_CONFIG_REF'),
    configured: refPresent('PAYMENT_RECONCILIATION_CONFIG_REF'),
  };

  const blockers: string[] = [];
  if (!providerSelected || providerName === 'NOT_SELECTED') {
    blockers.push(PSP_PROVIDER_NOT_SELECTED);
  }
  if (!credential_reference.reference_present) blockers.push(PSP_CREDENTIAL_REFERENCE_MISSING);
  if (!webhook_secret_reference.reference_present) {
    blockers.push(PSP_WEBHOOK_SECRET_REFERENCE_MISSING);
  }
  if (!webhook_configuration.reference_present) blockers.push(PSP_WEBHOOK_CONFIGURATION_MISSING);
  if (live && env !== 'production') blockers.push(PSP_ENVIRONMENT_MISMATCH);
  if (!market_configuration.reference_present) blockers.push(PSP_MARKET_CONFIGURATION_MISSING);
  if (!currency_configuration.reference_present) blockers.push(PSP_CURRENCY_CONFIGURATION_MISSING);
  if (!reconciliation_configuration.reference_present) {
    blockers.push(PSP_RECONCILIATION_CONFIGURATION_MISSING);
  }

  // Never auto-ready: missing any external ref or provider keeps ready_for_activation false.
  const ready_for_activation = false as const;

  return {
    provider_selected: providerSelected,
    provider_name: providerName,
    environment: env,
    live_enabled: live,
    credential_reference,
    webhook_secret_reference,
    webhook_configuration,
    market_configuration,
    currency_configuration,
    reconciliation_configuration,
    blockers,
    ready_for_activation,
    secrets_exposed: false,
    message: providerSelected
      ? 'Provider selected but production activation still requires verified vault refs + human gates.'
      : 'PSP provider NOT_SELECTED — production configuration references missing. Sandbox MOCK_* remains available.',
  };
}

export function describeProductionPspBoundary(countryIso2?: string) {
  const requirements = listProductionPspRequirements(countryIso2);
  const validation = validateProductionPspConfiguration();
  return {
    environment: readPaymentEnvironment(),
    live_payout: false,
    live_payments_enabled: isLivePaymentEnabled(),
    active_adapter: 'MockPaymentGatewayAdapter',
    sandbox_only: true,
    requirements,
    configuration_validation: validation,
    ready_for_production: false,
    message:
      'Sandbox mock gateway is active. Live PSP integration remains external-gated until all production requirements are satisfied and human gates close.',
  };
}
