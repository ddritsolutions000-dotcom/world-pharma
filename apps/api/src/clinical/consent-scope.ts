import { HealthArtifactType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/problem';

/** R9 v1 artifact types enforced for health consent scope (R9-E adds PRESCRIPTION_STRUCTURED). */
export const HEALTH_CONSENT_ARTIFACT_TYPES: HealthArtifactType[] = [
  HealthArtifactType.LAB_REPORT,
  HealthArtifactType.IMAGING_REPORT,
  HealthArtifactType.PRESCRIPTION_STRUCTURED,
  HealthArtifactType.DOCUMENT,
  HealthArtifactType.PRESCRIPTION_UPLOAD,
  HealthArtifactType.CONSULT_NOTE,
];

export const ALLOWED_CONSENT_PURPOSES = [
  'consultation',
  'telemedicine',
  'treatment',
  'break_glass',
] as const;

/** ED-R9-05 / R9-F: doctor health artifact payload reads including break-glass bridge. */
export const ARTIFACT_READ_PURPOSES = ['consultation', 'treatment', 'break_glass'] as const;

export type ArtifactReadPurpose = (typeof ARTIFACT_READ_PURPOSES)[number];

export function isAllowedConsentPurpose(purpose: string): purpose is (typeof ALLOWED_CONSENT_PURPOSES)[number] {
  return (ALLOWED_CONSENT_PURPOSES as readonly string[]).includes(purpose);
}

export function isArtifactReadPurpose(purpose: string): purpose is ArtifactReadPurpose {
  return (ARTIFACT_READ_PURPOSES as readonly string[]).includes(purpose);
}

export function assertAllowedConsentPurpose(purpose: string) {
  if (!purpose?.trim()) {
    throw Errors.validation('purpose is required');
  }
  if (!isAllowedConsentPurpose(purpose.trim())) {
    throw Errors.validation(`Unsupported consent purpose: ${purpose}`);
  }
}

export function parseConsentScope(scope: Prisma.JsonValue | undefined | null): HealthArtifactType[] {
  if (scope === null || scope === undefined) {
    return [...HEALTH_CONSENT_ARTIFACT_TYPES];
  }
  if (Array.isArray(scope) && scope.length === 0) {
    return [...HEALTH_CONSENT_ARTIFACT_TYPES];
  }
  if (!Array.isArray(scope)) {
    throw Errors.validation('scope must be an array of artifact types');
  }
  const values = scope.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean);
  const allowed = new Set(HEALTH_CONSENT_ARTIFACT_TYPES);
  const invalid = values.filter((value) => !allowed.has(value as HealthArtifactType));
  if (invalid.length) {
    throw Errors.validation(`Invalid consent scope artifact types: ${invalid.join(', ')}`);
  }
  return values as HealthArtifactType[];
}

export function normalizeConsentScopeInput(scope?: string[]): HealthArtifactType[] {
  if (!scope?.length) {
    return [...HEALTH_CONSENT_ARTIFACT_TYPES];
  }
  return parseConsentScope(scope);
}

export function consentScopeIncludes(
  scope: Prisma.JsonValue | undefined | null,
  artifactType: HealthArtifactType,
): boolean {
  const normalized = parseConsentScope(scope);
  return normalized.includes(artifactType);
}

export function presentConsentScope(scope: Prisma.JsonValue | undefined | null): string[] {
  return parseConsentScope(scope);
}

export function artifactReadDenialMessage(reason: string): string {
  switch (reason) {
    case 'consent_revoked':
      return 'Consent for this health record access has been revoked.';
    case 'consent_expired':
      return 'Consent for this health record access has expired.';
    case 'consent_missing_or_inactive':
      return 'Active consent is required to access this health record.';
    case 'scope_mismatch':
      return 'This consent does not cover the requested health record type.';
    case 'purpose_not_allowed':
      return 'This consent purpose cannot be used for health record access.';
    case 'no_relationship':
      return 'No active clinical relationship exists for this patient.';
    case 'relationship_inactive':
      return 'The clinical relationship is not active.';
    case 'country_mismatch':
      return 'This health record is not available in the requested country.';
    case 'organization_mismatch':
      return 'This health record is not available for the requested organization.';
    case 'not_a_doctor':
    case 'audience_denied':
      return 'You cannot access this health record.';
    case 'health_timeline_disabled':
      return 'Health timeline is not enabled for this country.';
    case 'break_glass_missing':
    case 'break_glass_revoked':
    case 'break_glass_expired':
      return 'Break-glass authorization is not active for this health record.';
    default:
      return 'You cannot access this health record.';
  }
}
