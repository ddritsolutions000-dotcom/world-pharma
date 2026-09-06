import { PaymentMethodFamily } from '@prisma/client';
import { SERVICE_KEYS } from '@world-pharma/shared';
import { Errors } from '../common/problem';
import { isForbiddenSecretLikeValue } from '../payment/r14a-gate';
import { emptyPolicyDocument, type PolicyDocument } from './empty-pack';

const GATEWAY_REF_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;
const TAX_PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const METHOD_FAMILIES = new Set<string>(Object.values(PaymentMethodFamily));

const FORBIDDEN_KEYS = new Set([
  'PAYMENT_LIVE_ENABLED',
  'payment_live_enabled',
  'api_key',
  'apiKey',
  'secret',
  'password',
  'private_key',
  'privateKey',
  'merchant_key',
  'webhook_secret',
  'access_token',
  'accessToken',
  'credential',
  'credentials',
  'pan',
  'cvv',
]);

export const HEALTHCARE_FLAG_KEYS = [
  'doctor_onboarding_enabled',
  'doctor_public_visibility',
  'telemedicine_eligibility',
  'consultation_capability',
  'appointments_enabled',
  'booking_requires_consent',
  'rx_prescribe_enabled',
  'rx_dispense_enabled',
  'rx_erx_enabled',
  'rx_amend_enabled',
  'rx_refill_enabled',
  'rx_refill_require_doctor_reauth',
  'rx_subscription_enabled',
  'rx_subscription_auto_execute',
  'health_timeline_enabled',
  'clinical_search_enabled',
  'care_navigation_enabled',
] as const;

export type HealthcareFlagKey = (typeof HEALTHCARE_FLAG_KEYS)[number];

export type PolicyOperatorView = {
  services: Record<(typeof SERVICE_KEYS)[number], boolean>;
  i18n: {
    default_locale: string;
    locales: string[];
  };
  currency: {
    default: string;
    allowed: string[];
  };
  timezone_default: string;
  payments: {
    enabled: boolean;
    methods: string[];
    gateway_refs: string[];
    currencies: string[];
  };
  tax_profile_id: string | null;
  ledger_legal_entity_id: string | null;
  ledger_accounting_currency: string | null;
  recording_allowed: boolean;
  data_residency_mode: PolicyDocument['data_residency_mode'];
  healthcare_flags: Record<HealthcareFlagKey, boolean>;
  crm_enabled: boolean;
  analytics_enabled: boolean;
  search_discovery_enabled: boolean;
  commerce: {
    platform_fee_bps: number;
    platform_fee_flat_minor: number;
    delivery_fee_minor: number;
    packaging_fee_minor: number;
    handling_fee_minor: number;
    payment_convenience_fee_minor: number;
    free_delivery_threshold_minor: number | null;
    carrier_cost_estimate_minor: number;
  };
};

export type PolicyDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

export function extractOperatorView(document: PolicyDocument): PolicyOperatorView {
  const healthcare_flags = {} as Record<HealthcareFlagKey, boolean>;
  for (const key of HEALTHCARE_FLAG_KEYS) {
    healthcare_flags[key] = Boolean(document.healthcare[key]);
  }
  return {
    services: { ...document.services },
    i18n: {
      default_locale: document.i18n.default_locale,
      locales: [...document.i18n.locales],
    },
    currency: {
      default: document.currency.default,
      allowed: [...document.currency.allowed],
    },
    timezone_default: document.timezone.default,
    payments: {
      enabled: document.payments.enabled,
      methods: [...document.payments.methods],
      gateway_refs: [...document.payments.gateway_refs],
      currencies: [...document.payments.currencies],
    },
    tax_profile_id: document.tax_profile_id ?? null,
    ledger_legal_entity_id: document.ledger?.legal_entity_id ?? null,
    ledger_accounting_currency: document.ledger?.accounting_currency ?? null,
    recording_allowed: document.recording_allowed,
    data_residency_mode: document.data_residency_mode,
    healthcare_flags,
    crm_enabled: document.crm.enabled,
    analytics_enabled: document.analytics?.enabled ?? false,
    search_discovery_enabled: document.search?.discovery_enabled ?? true,
    commerce: {
      platform_fee_bps: document.commerce?.platform_fee_bps ?? 0,
      platform_fee_flat_minor: document.commerce?.platform_fee_flat_minor ?? 0,
      delivery_fee_minor: document.commerce?.delivery_fee_minor ?? 0,
      packaging_fee_minor: document.commerce?.packaging_fee_minor ?? 0,
      handling_fee_minor: document.commerce?.handling_fee_minor ?? 0,
      payment_convenience_fee_minor: document.commerce?.payment_convenience_fee_minor ?? 0,
      free_delivery_threshold_minor: document.commerce?.free_delivery_threshold_minor ?? null,
      carrier_cost_estimate_minor: document.commerce?.carrier_cost_estimate_minor ?? 0,
    },
  };
}

export function applyOperatorView(base: PolicyDocument, operator: PolicyOperatorView): PolicyDocument {
  const next: PolicyDocument = JSON.parse(JSON.stringify(base)) as PolicyDocument;
  for (const key of SERVICE_KEYS) {
    next.services[key] = operator.services[key] === true;
  }
  const i18nIn = operator.i18n ?? {
    default_locale: next.i18n.default_locale,
    locales: [...next.i18n.locales],
  };
  const locales = uniqueNonEmpty(i18nIn.locales);
  const defaultLocale = i18nIn.default_locale.trim();
  next.i18n = {
    default_locale: defaultLocale,
    locales: locales.includes(defaultLocale) ? locales : [defaultLocale, ...locales],
  };
  const currencyIn = operator.currency ?? {
    default: next.currency.default,
    allowed: [...next.currency.allowed],
  };
  const allowedCurrencies = uniqueNonEmpty(currencyIn.allowed).map((item) => item.toUpperCase());
  const defaultCurrency = currencyIn.default.trim().toUpperCase();
  next.currency = {
    default: defaultCurrency,
    allowed: allowedCurrencies.includes(defaultCurrency)
      ? allowedCurrencies
      : [defaultCurrency, ...allowedCurrencies],
  };
  const timezoneDefault = (operator.timezone_default ?? next.timezone.default).trim() || next.timezone.default;
  next.timezone = {
    default: timezoneDefault,
    allowed: [...new Set([timezoneDefault, ...next.timezone.allowed])],
  };
  next.payments = {
    enabled: operator.payments.enabled === true,
    methods: [...operator.payments.methods],
    gateway_refs: [...operator.payments.gateway_refs],
    currencies: [...operator.payments.currencies],
  };
  next.tax_profile_id = operator.tax_profile_id?.trim() ? operator.tax_profile_id.trim() : null;
  next.ledger = {
    legal_entity_id: operator.ledger_legal_entity_id?.trim() ? operator.ledger_legal_entity_id.trim() : null,
    accounting_currency: operator.ledger_accounting_currency?.trim()
      ? operator.ledger_accounting_currency.trim().toUpperCase()
      : null,
  };
  next.recording_allowed = operator.recording_allowed === true;
  next.data_residency_mode = operator.data_residency_mode;
  for (const key of HEALTHCARE_FLAG_KEYS) {
    next.healthcare[key] = operator.healthcare_flags[key] === true;
  }
  next.crm.enabled = operator.crm_enabled === true;
  next.analytics = {
    enabled: operator.analytics_enabled === true,
    retention_days: next.analytics?.retention_days ?? 365,
  };
  next.search = {
    discovery_enabled: operator.search_discovery_enabled !== false,
    blocklist_terms: next.search?.blocklist_terms ?? [],
  };
  next.commerce = {
    platform_fee_bps: operator.commerce.platform_fee_bps,
    platform_fee_flat_minor: operator.commerce.platform_fee_flat_minor,
    delivery_fee_minor: operator.commerce.delivery_fee_minor,
    packaging_fee_minor: operator.commerce.packaging_fee_minor,
    handling_fee_minor: operator.commerce.handling_fee_minor,
    payment_convenience_fee_minor: operator.commerce.payment_convenience_fee_minor,
    free_delivery_threshold_minor: operator.commerce.free_delivery_threshold_minor,
    carrier_cost_estimate_minor: operator.commerce.carrier_cost_estimate_minor,
    // Preserve partner / affiliate fee knobs not shown on operator surface.
    affiliate_commission_bps: next.commerce?.affiliate_commission_bps ?? 0,
    doctor_platform_fee_bps: next.commerce?.doctor_platform_fee_bps,
    lab_platform_fee_bps: next.commerce?.lab_platform_fee_bps,
    delivery_platform_fee_bps: next.commerce?.delivery_platform_fee_bps,
    pharmacy_platform_fee_bps: next.commerce?.pharmacy_platform_fee_bps,
    partner_platform_fee_flat_minor: next.commerce?.partner_platform_fee_flat_minor,
  };
  return next;
}

export function emptyOperatorView(): PolicyOperatorView {
  return extractOperatorView(emptyPolicyDocument());
}

export function requiresDualControl(document: PolicyDocument): boolean {
  return document.recording_allowed === true;
}

export function assertNoForbiddenPolicySecrets(raw: unknown): void {
  walkForbidden(raw, '');
}

function walkForbidden(value: unknown, path: string): void {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbidden(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(key.toUpperCase())) {
        throw Errors.problem(
          400,
          'SECRET_VALUE_FORBIDDEN',
          'Secret value forbidden',
          `Policy packs cannot contain "${key}". Store ids/refs only — never secrets, API keys, or PAYMENT_LIVE_ENABLED.`,
        );
      }
      walkForbidden(nested, path ? `${path}.${key}` : key);
    }
  }
}

export function assertSafeGatewayRefs(
  refs: readonly string[],
  isRegistered: (code: string) => boolean,
): void {
  const unknown: string[] = [];
  for (const raw of refs) {
    const code = raw.trim();
    if (!GATEWAY_REF_PATTERN.test(code) || isForbiddenSecretLikeValue(code)) {
      throw Errors.problem(
        400,
        'SECRET_VALUE_FORBIDDEN',
        'Secret value forbidden',
        `gateway_refs must be registered adapter codes (ids only). Rejected: "${code.slice(0, 32)}".`,
      );
    }
    if (!isRegistered(code)) {
      unknown.push(code);
    }
  }
  if (unknown.length) {
    throw Errors.problem(
      400,
      'UNKNOWN_GATEWAY_REF',
      'Unknown gateway reference',
      `gateway_refs not in the registered adapter catalog: ${unknown.join(', ')}. Do not invent PSP codes.`,
    );
  }
}

export function assertSafePaymentMethods(methods: readonly string[]): void {
  for (const raw of methods) {
    const method = raw.trim().toUpperCase();
    if (!METHOD_FAMILIES.has(method) || isForbiddenSecretLikeValue(method)) {
      throw Errors.validation(
        `payments.methods contains unsupported method "${raw}". Use existing payment method families only.`,
      );
    }
  }
}

export function assertSafeTaxProfileId(value: string | null | undefined): void {
  if (value == null || value === '') {
    return;
  }
  if (!TAX_PROFILE_ID_PATTERN.test(value) || isForbiddenSecretLikeValue(value)) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'tax_profile_id must be an id/code only (uuid or opaque code). Secrets are rejected.',
    );
  }
}

export function assertSafeLegalEntityId(value: string | null | undefined): void {
  if (value == null || value === '') {
    return;
  }
  if (!TAX_PROFILE_ID_PATTERN.test(value) || isForbiddenSecretLikeValue(value)) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'ledger.legal_entity_id must be an id/code only. Do not invent a legal entity name or store secrets.',
    );
  }
}

export function assertSafeAccountingCurrency(
  value: string | null | undefined,
  allowed: readonly string[],
): void {
  if (value == null || value === '') {
    return;
  }
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || isForbiddenSecretLikeValue(code)) {
    throw Errors.validation('ledger.accounting_currency must be an ISO 4217 code.');
  }
  if (allowed.length && !allowed.includes(code)) {
    throw Errors.validation('ledger.accounting_currency must be in currency.allowed.');
  }
}

export function assertOperatorSafety(
  document: PolicyDocument,
  isRegistered: (code: string) => boolean,
): void {
  assertNoForbiddenPolicySecrets(document);
  assertSafePaymentMethods(document.payments.methods);
  assertSafeGatewayRefs(document.payments.gateway_refs, isRegistered);
  assertSafeTaxProfileId(document.tax_profile_id);
  assertSafeLegalEntityId(document.ledger?.legal_entity_id);
  assertSafeAccountingCurrency(document.ledger?.accounting_currency, document.currency.allowed);
}

export function diffOperatorViews(before: PolicyDocument | null, after: PolicyDocument): PolicyDiffEntry[] {
  const left = before ? extractOperatorView(before) : emptyOperatorView();
  const right = extractOperatorView(after);
  const entries: PolicyDiffEntry[] = [];

  for (const key of SERVICE_KEYS) {
    if (left.services[key] !== right.services[key]) {
      entries.push({ path: `services.${key}`, before: left.services[key], after: right.services[key] });
    }
  }
  if (left.payments.enabled !== right.payments.enabled) {
    entries.push({ path: 'payments.enabled', before: left.payments.enabled, after: right.payments.enabled });
  }
  if (stable(left.payments.methods) !== stable(right.payments.methods)) {
    entries.push({ path: 'payments.methods', before: left.payments.methods, after: right.payments.methods });
  }
  if (stable(left.payments.gateway_refs) !== stable(right.payments.gateway_refs)) {
    entries.push({
      path: 'payments.gateway_refs',
      before: left.payments.gateway_refs,
      after: right.payments.gateway_refs,
    });
  }
  if (stable(left.payments.currencies) !== stable(right.payments.currencies)) {
    entries.push({
      path: 'payments.currencies',
      before: left.payments.currencies,
      after: right.payments.currencies,
    });
  }
  if (left.i18n.default_locale !== right.i18n.default_locale) {
    entries.push({
      path: 'i18n.default_locale',
      before: left.i18n.default_locale,
      after: right.i18n.default_locale,
    });
  }
  if (stable(left.i18n.locales) !== stable(right.i18n.locales)) {
    entries.push({ path: 'i18n.locales', before: left.i18n.locales, after: right.i18n.locales });
  }
  if (left.currency.default !== right.currency.default) {
    entries.push({ path: 'currency.default', before: left.currency.default, after: right.currency.default });
  }
  if (stable(left.currency.allowed) !== stable(right.currency.allowed)) {
    entries.push({ path: 'currency.allowed', before: left.currency.allowed, after: right.currency.allowed });
  }
  if (left.timezone_default !== right.timezone_default) {
    entries.push({
      path: 'timezone.default',
      before: left.timezone_default,
      after: right.timezone_default,
    });
  }
  if (left.tax_profile_id !== right.tax_profile_id) {
    entries.push({ path: 'tax_profile_id', before: left.tax_profile_id, after: right.tax_profile_id });
  }
  if (left.ledger_legal_entity_id !== right.ledger_legal_entity_id) {
    entries.push({
      path: 'ledger.legal_entity_id',
      before: left.ledger_legal_entity_id,
      after: right.ledger_legal_entity_id,
    });
  }
  if (left.ledger_accounting_currency !== right.ledger_accounting_currency) {
    entries.push({
      path: 'ledger.accounting_currency',
      before: left.ledger_accounting_currency,
      after: right.ledger_accounting_currency,
    });
  }
  if (left.recording_allowed !== right.recording_allowed) {
    entries.push({ path: 'recording_allowed', before: left.recording_allowed, after: right.recording_allowed });
  }
  if (left.data_residency_mode !== right.data_residency_mode) {
    entries.push({
      path: 'data_residency_mode',
      before: left.data_residency_mode,
      after: right.data_residency_mode,
    });
  }
  for (const key of HEALTHCARE_FLAG_KEYS) {
    if (left.healthcare_flags[key] !== right.healthcare_flags[key]) {
      entries.push({
        path: `healthcare.${key}`,
        before: left.healthcare_flags[key],
        after: right.healthcare_flags[key],
      });
    }
  }
  if (left.crm_enabled !== right.crm_enabled) {
    entries.push({ path: 'crm.enabled', before: left.crm_enabled, after: right.crm_enabled });
  }
  if (left.analytics_enabled !== right.analytics_enabled) {
    entries.push({ path: 'analytics.enabled', before: left.analytics_enabled, after: right.analytics_enabled });
  }
  if (left.search_discovery_enabled !== right.search_discovery_enabled) {
    entries.push({
      path: 'search.discovery_enabled',
      before: left.search_discovery_enabled,
      after: right.search_discovery_enabled,
    });
  }
  return entries;
}

export function paymentMethodFamilies(): string[] {
  return [...METHOD_FAMILIES].sort();
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function stable(value: readonly string[]): string {
  return [...value].map((item) => item.trim()).join('\u0001');
}
