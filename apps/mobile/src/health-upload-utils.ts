import type { HealthTimelineItem } from './health-api';

export const HEALTH_UPLOAD_BUTTON_LABEL = 'Upload health document';
export const HEALTH_UPLOAD_ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_HEALTH_UPLOAD_BYTES = 10 * 1024 * 1024;

export type HealthUploadFileSelection = {
  name: string;
  mimeType: string;
  size: number;
  base64: string;
};

export type HealthUploadValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateHealthUploadFile(mimeType: string, byteSize: number): HealthUploadValidationResult {
  if (!HEALTH_UPLOAD_ACCEPTED_MIME.includes(mimeType as (typeof HEALTH_UPLOAD_ACCEPTED_MIME)[number])) {
    return { ok: false, error: 'Only PDF, JPEG, and PNG files are supported.' };
  }
  if (byteSize <= 0) {
    return { ok: false, error: 'Selected file is empty.' };
  }
  if (byteSize > MAX_HEALTH_UPLOAD_BYTES) {
    return { ok: false, error: 'File exceeds the 10 MB upload limit.' };
  }
  return { ok: true };
}

export function inferUploadArtifactType(fileName: string): 'DOCUMENT' | 'PRESCRIPTION_UPLOAD' {
  return fileName.toLowerCase().includes('rx') ? 'PRESCRIPTION_UPLOAD' : 'DOCUMENT';
}

export function buildHealthUploadIdempotencyKey(file: Pick<HealthUploadFileSelection, 'name' | 'size'>): string {
  return `${file.name}-${file.size}`;
}

export function buildHealthUploadRequestBody(input: {
  countryCode: string;
  file: HealthUploadFileSelection;
  title?: string;
}) {
  const artifactType = inferUploadArtifactType(input.file.name);
  return {
    country_code: input.countryCode,
    artifact_type: artifactType,
    original_name: input.file.name,
    content_type: input.file.mimeType,
    content_base64: input.file.base64,
    title: input.title,
    idempotency_key: buildHealthUploadIdempotencyKey(input.file),
  };
}

export function assertUploadResponseSafe(body: Record<string, unknown>): void {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of ['object_key', 'storage_key', 'health-uploads/', 'checksum_sha256']) {
    if (raw.includes(token)) {
      throw new Error(`upload response leaked sensitive field: ${token}`);
    }
  }
}

export function formatHealthUploadError(error: string): string {
  const normalized = error.trim();
  if (!normalized) {
    return 'Upload failed. Please try again.';
  }
  if (normalized.toLowerCase().includes('unsupported document type')) {
    return 'Only PDF, JPEG, and PNG files are supported.';
  }
  if (normalized.toLowerCase().includes('size limit')) {
    return 'File exceeds the 10 MB upload limit.';
  }
  return normalized;
}

export function timelineItemFromUploadResponse(response: {
  timeline_event_id: string;
  artifact_id: string;
  artifact_type: string;
  title: string;
  published_at: string;
  sandbox: boolean;
}): HealthTimelineItem {
  return {
    id: response.timeline_event_id,
    event_type: 'ARTIFACT_UPLOADED',
    artifact_id: response.artifact_id,
    artifact_type: response.artifact_type,
    source_module: 'upload',
    source_id: response.artifact_id,
    title: response.title,
    status: 'ACTIVE',
    occurred_at: response.published_at,
    sandbox: response.sandbox,
  };
}

export function prependUploadTimelineItem(
  items: HealthTimelineItem[],
  uploaded: HealthTimelineItem,
): HealthTimelineItem[] {
  const withoutDuplicate = items.filter((item) => item.id !== uploaded.id);
  return [uploaded, ...withoutDuplicate];
}
