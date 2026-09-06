/** Shared healthcare requirement catalog codes (Sprint 39/42). Not country-specific legal claims. */
export const HEALTHCARE_REQUIREMENT_CODES = [
  'pharmacy_licensing',
  'prescription_requirement',
  'controlled_medicine_policy',
  'pharmacist_verification',
  'doctor_licensing',
  'erx_requirement',
  'lab_accreditation',
  'imaging_licensing',
  'healthcare_data_privacy',
  'data_residency',
  'clinical_consent',
  'record_retention',
] as const;

export type HealthcareRequirementCode = (typeof HEALTHCARE_REQUIREMENT_CODES)[number];
