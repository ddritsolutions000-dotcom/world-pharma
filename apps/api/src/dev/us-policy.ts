import type { PolicyDocument } from '../policy/empty-pack';
import { buildSandboxPolicyDocument } from './sandbox-policy';

/** United States demo policy — USD, card + wallet, sales-tax profile ref (dev only). */
export function buildUsPolicyDocument(): PolicyDocument {
  const doc = buildSandboxPolicyDocument();
  doc.currency.default = 'USD';
  doc.currency.allowed = ['USD'];
  doc.i18n.default_locale = 'en-US';
  doc.i18n.locales = ['en-US'];
  doc.timezone.default = 'America/New_York';
  doc.timezone.allowed = ['America/New_York', 'America/Chicago', 'America/Los_Angeles'];
  doc.datetime.number_format = 'en-US';
  doc.payments.currencies = ['USD'];
  doc.payments.methods = ['CARD', 'WALLET'];
  doc.payments.gateway_refs = ['MOCK_PRIMARY'];
  doc.tax_profile_id = 'US_SALES_TAX_DEMO';
  doc.commerce = {
    platform_fee_bps: 0,
    platform_fee_flat_minor: 0,
    delivery_fee_minor: 599,
    packaging_fee_minor: 0,
    handling_fee_minor: 0,
    payment_convenience_fee_minor: 0,
    free_delivery_threshold_minor: 3500,
    carrier_cost_estimate_minor: 799,
    affiliate_commission_bps: 500,
    doctor_platform_fee_bps: 1500,
    lab_platform_fee_bps: 2000,
    delivery_platform_fee_bps: 1500,
    pharmacy_platform_fee_bps: 1800,
    partner_platform_fee_flat_minor: 0,
  };
  doc.crm.loyalty = { enabled: true };
  doc.crm.marketing = {
    enabled: true,
    channels: ['in_app', 'email'],
    medicine_advertising: false,
  };
  doc.search = { discovery_enabled: true, blocklist_terms: [] };
  return doc;
}

export const US_COUNTRY = {
  isoAlpha2: 'US',
  isoAlpha3: 'USA',
  nameI18n: { en: 'United States' },
  defaultLocale: 'en-US',
  defaultCurrency: 'USD',
  defaultTimezone: 'America/New_York',
  phonePrefix: '+1',
} as const;
