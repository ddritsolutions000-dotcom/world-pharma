import { HealthArtifactType } from '@prisma/client';

/** ED-R10-03 sandbox defaults — PDF/JPEG/PNG, 10MB, STANDARD_HEALTH retention class. */
export const ALLOWED_HEALTH_UPLOAD_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const MAX_HEALTH_UPLOAD_BYTES = 10 * 1024 * 1024;

export const HEALTH_UPLOAD_CLASSIFICATION = 'STANDARD_HEALTH';

export const HEALTH_UPLOAD_ARTIFACT_TYPES = new Set<HealthArtifactType>([
  HealthArtifactType.DOCUMENT,
  HealthArtifactType.PRESCRIPTION_UPLOAD,
]);

export function defaultUploadTitle(type: HealthArtifactType): string {
  if (type === HealthArtifactType.PRESCRIPTION_UPLOAD) {
    return 'Uploaded prescription image';
  }
  return 'Uploaded health document';
}
