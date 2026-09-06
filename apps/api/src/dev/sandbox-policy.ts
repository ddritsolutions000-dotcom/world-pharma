import type { PolicyDocument } from '../policy/empty-pack';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { enableLabPartnerPack } from '../test/lab-partner';
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';
import { enableImagingPartnerPackForSandbox } from '../test/imaging-partner';

/** Development-only policy pack — enables integrated sandbox marketplace (not production evidence). */
export function buildSandboxPolicyDocument(): PolicyDocument {
  const doc = emptyPolicyDocument();
  doc.services.pharmacy = true;
  doc.services.marketplace = true;
  doc.services.teleconsult = true;
  doc.services.delivery = true;
  enableMarketplaceVendorPack(doc);
  doc.partner_types.VENDOR.join_public = true;
  enableLabPartnerPack(doc, { home: true, center: true });
  enableImagingPartnerPackForSandbox(doc);
  doc.partner_types.PHARMACY.enabled = true;
  doc.partner_types.PHARMACY.join_public = true;
  doc.partner_types.PHARMACY.allowed_services = ['pharmacy'];
  doc.partner_types.DOCTOR.enabled = true;
  doc.partner_types.DOCTOR.join_public = true;
  doc.partner_types.DELIVERY_PARTNER.enabled = true;
  doc.partner_types.DELIVERY_PARTNER.join_public = true;
  doc.partner_types.AFFILIATE.enabled = true;
  doc.partner_types.AFFILIATE.join_public = true;
  doc.payments.enabled = true;
  doc.payments.methods = ['CARD', 'COD'];
  doc.payments.gateway_refs = ['MOCK_PRIMARY'];
  doc.payments.currencies = ['XXX'];
  doc.shipping.domestic = true;
  doc.shipping.rx = true;
  doc.commerce = {
    platform_fee_bps: 200,
    platform_fee_flat_minor: 0,
    delivery_fee_minor: 4900,
    packaging_fee_minor: 0,
    handling_fee_minor: 0,
    payment_convenience_fee_minor: 0,
    free_delivery_threshold_minor: 99900,
    carrier_cost_estimate_minor: 6500,
    affiliate_commission_bps: 500,
    doctor_platform_fee_bps: 1500,
    lab_platform_fee_bps: 2000,
    delivery_platform_fee_bps: 1500,
    pharmacy_platform_fee_bps: 1800,
    partner_platform_fee_flat_minor: 0,
  };
  doc.healthcare.doctor_onboarding_enabled = true;
  doc.healthcare.doctor_public_visibility = true;
  doc.healthcare.consultation_capability = true;
  doc.healthcare.appointments_enabled = true;
  doc.healthcare.telemedicine_eligibility = true;
  doc.healthcare.health_timeline_enabled = true;
  doc.healthcare.rx_refill_enabled = true;
  doc.healthcare.rx_subscription_enabled = true;
  doc.healthcare.rx_prescribe_enabled = true;
  doc.healthcare.rx_amend_enabled = true;
  doc.healthcare.rx_erx_enabled = true;
  doc.healthcare.rx_erx_provider_code = 'sandbox';
  doc.healthcare.rx_allowed_restriction_codes = ['PACK_ALLOWED'];
  doc.crm.enabled = true;
  doc.crm.reviews = { enabled: true, verified_purchase_required: false };
  doc.crm.loyalty = { enabled: true };
  doc.search = { discovery_enabled: true, blocklist_terms: [] };
  return doc;
}
