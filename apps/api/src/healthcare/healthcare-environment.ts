/**
 * Sprint 48 — Healthcare environment flags (sandbox default; production fail-closed).
 */
export type HealthcareRuntimeEnvironment = 'sandbox' | 'production';

export function readHealthcareEnvironment(): HealthcareRuntimeEnvironment {
  const raw =
    process.env['HEALTHCARE_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['CLINICAL_ENVIRONMENT']?.trim().toLowerCase();
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export function isLiveHealthcareEnabled(): boolean {
  return (
    process.env['HEALTHCARE_LIVE_ENABLED'] === 'true' ||
    process.env['CLINICAL_LIVE_ENABLED'] === 'true'
  );
}

export const HEALTHCARE_INTEGRATION_TYPES = [
  'ERX_PROVIDER',
  'VIDEO_PROVIDER',
  'PACS',
  'DICOM',
  'HL7',
  'FHIR',
] as const;

export type HealthcareIntegrationType = (typeof HEALTHCARE_INTEGRATION_TYPES)[number];

export function integrationTypesForProvider(
  kind: 'DOCTOR' | 'LAB' | 'IMAGING_CENTER' | 'RADIOLOGIST',
): HealthcareIntegrationType[] {
  if (kind === 'DOCTOR') {
    return ['ERX_PROVIDER', 'VIDEO_PROVIDER'];
  }
  if (kind === 'LAB') {
    return ['HL7', 'FHIR'];
  }
  if (kind === 'IMAGING_CENTER' || kind === 'RADIOLOGIST') {
    return ['PACS', 'DICOM', 'HL7', 'FHIR'];
  }
  return [];
}

export function requirementCodesForProvider(
  kind: 'DOCTOR' | 'LAB' | 'IMAGING_CENTER' | 'RADIOLOGIST',
): string[] {
  if (kind === 'DOCTOR') {
    return ['doctor_licensing', 'erx_requirement', 'clinical_consent', 'healthcare_data_privacy'];
  }
  if (kind === 'LAB') {
    return ['lab_accreditation', 'healthcare_data_privacy', 'clinical_consent'];
  }
  if (kind === 'IMAGING_CENTER') {
    return ['imaging_licensing', 'healthcare_data_privacy', 'clinical_consent'];
  }
  return ['doctor_licensing', 'imaging_licensing', 'healthcare_data_privacy'];
}
