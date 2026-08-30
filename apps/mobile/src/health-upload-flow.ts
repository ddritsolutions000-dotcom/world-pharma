import { uploadHealthDocument, type HealthUploadResponse } from './health-api';
import {
  assertUploadResponseSafe,
  buildHealthUploadIdempotencyKey,
  formatHealthUploadError,
  inferUploadArtifactType,
  validateHealthUploadFile,
  type HealthUploadFileSelection,
} from './health-upload-utils';

export type HealthUploadFlowResult =
  | { ok: true; data: HealthUploadResponse }
  | { ok: false; error: string; unauthorized?: boolean };

export async function performHealthDocumentUpload(input: {
  token: string;
  countryCode: string;
  file: HealthUploadFileSelection;
  title?: string;
  onUnauthorized?: () => void;
}): Promise<HealthUploadFlowResult> {
  const validation = validateHealthUploadFile(input.file.mimeType, input.file.size);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const result = await uploadHealthDocument({
    token: input.token,
    countryCode: input.countryCode,
    onUnauthorized: input.onUnauthorized,
    artifactType: inferUploadArtifactType(input.file.name),
    originalName: input.file.name,
    contentType: input.file.mimeType,
    contentBase64: input.file.base64,
    title: input.title,
    idempotencyKey: buildHealthUploadIdempotencyKey(input.file),
  });

  if (result.ok) {
    assertUploadResponseSafe(result.data as unknown as Record<string, unknown>);
    return { ok: true, data: result.data };
  }

  if (result.kind === 'unauthorized') {
    input.onUnauthorized?.();
    return { ok: false, error: 'Session expired.', unauthorized: true };
  }

  return { ok: false, error: formatHealthUploadError(result.error) };
}
