/** Canonical partner type catalog (blueprint 36). Overlay lives in the Country Policy Pack. */
export const PARTNER_TYPE_CODES = [
  'DOCTOR',
  'PHARMACY',
  'VENDOR',
  'LAB',
  'IMAGING_CENTER',
  'DELIVERY_PARTNER',
  'PHLEBOTOMIST',
  'PATHOLOGIST',
  'RADIOLOGIST',
  'CLINIC',
  'HOSPITAL',
  'AFFILIATE',
  'HEALTHCARE_BUSINESS',
] as const;

export type PartnerTypeCode = (typeof PARTNER_TYPE_CODES)[number];

/** Canonical service keys in the pack (blueprint 18). All default false. */
export const SERVICE_KEYS = [
  'pharmacy',
  'marketplace',
  'teleconsult',
  'lab_home',
  'lab_center',
  'imaging_center',
  'imaging_referral_required',
  'delivery',
  'physical_report_delivery',
  'whatsapp',
  'wallet',
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_ALIASES: Record<string, ServiceKey> = {
  PHARMACY: 'pharmacy',
  pharmacy: 'pharmacy',
  DOCTOR: 'teleconsult',
  doctor: 'teleconsult',
  teleconsult: 'teleconsult',
  LAB: 'lab_center',
  lab: 'lab_center',
  lab_center: 'lab_center',
  HOME_SAMPLE: 'lab_home',
  lab_home: 'lab_home',
  IMAGING: 'imaging_center',
  imaging: 'imaging_center',
  imaging_center: 'imaging_center',
  imaging_referral_required: 'imaging_referral_required',
  DELIVERY: 'delivery',
  delivery: 'delivery',
  PHYSICAL_REPORT: 'physical_report_delivery',
  physical_report_delivery: 'physical_report_delivery',
  marketplace: 'marketplace',
  wallet: 'wallet',
  whatsapp: 'whatsapp',
};
