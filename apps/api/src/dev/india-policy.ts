import type { PolicyDocument } from '../policy/empty-pack';
import { buildSandboxPolicyDocument } from './sandbox-policy';

/** India demo policy — INR, UPI/COD, GST profile ref, 1mg-style service gates (dev only). */
export function buildIndiaPolicyDocument(): PolicyDocument {
  const doc = buildSandboxPolicyDocument();
  doc.currency.default = 'INR';
  doc.currency.allowed = ['INR'];
  doc.i18n.default_locale = 'en-IN';
  doc.i18n.locales = ['en-IN', 'hi'];
  doc.timezone.default = 'Asia/Kolkata';
  doc.timezone.allowed = ['Asia/Kolkata'];
  doc.datetime.number_format = 'en-IN';
  doc.payments.currencies = ['INR'];
  doc.payments.methods = ['UPI', 'CARD', 'COD'];
  doc.payments.gateway_refs = ['MOCK_PRIMARY'];
  doc.tax_profile_id = 'IN_GST_DEMO';
  doc.commerce = {
    platform_fee_bps: 0,
    platform_fee_flat_minor: 0,
    delivery_fee_minor: 4000,
    packaging_fee_minor: 0,
    handling_fee_minor: 0,
    payment_convenience_fee_minor: 0,
    free_delivery_threshold_minor: 49900,
    carrier_cost_estimate_minor: 5500,
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
    channels: ['in_app', 'sms', 'whatsapp'],
    medicine_advertising: false,
  };
  doc.search = { discovery_enabled: true, blocklist_terms: [] };
  return doc;
}

export const INDIA_COUNTRY = {
  isoAlpha2: 'IN',
  isoAlpha3: 'IND',
  nameI18n: { en: 'India', hi: 'भारत' },
  defaultLocale: 'en-IN',
  defaultCurrency: 'INR',
  defaultTimezone: 'Asia/Kolkata',
  phonePrefix: '+91',
} as const;
