import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type HealthTimelineItem = {
  id: string;
  event_type: string;
  artifact_id: string | null;
  artifact_type: string | null;
  source_module: string;
  source_id: string;
  title: string;
  status: string;
  occurred_at: string;
  sandbox: boolean;
};

export type HealthTimelineResponse = {
  items: HealthTimelineItem[];
  next_cursor: string | null;
};

export type HealthArtifactMetadata = {
  id: string;
  artifact_type: string;
  title: string;
  published_at: string;
  sandbox: boolean;
  source_module: string | null;
  source_id: string | null;
  status: string;
  payload_available: boolean;
};

export type LabHealthPayload = {
  lab_booking_id: string;
  lab_report_id: string;
  accession_number: string;
  version_number: number;
  published_at: string | null;
  summary: string | null;
  results: Array<{ analyte_name: string; value: string; unit?: string | null }>;
  note?: string;
};

export type ImagingHealthPayload = {
  imaging_booking_id: string;
  imaging_report_id: string;
  accession_number: string | null;
  version_number: number;
  published_at: string | null;
  amendment_reason?: string | null;
  summary: string | null;
  findings: Array<{ finding_code: string; finding_text: string }>;
  sandbox: boolean;
  note?: string;
};

export type PrescriptionHealthPayload = {
  prescription_id: string;
  version_id: string;
  version_number: number;
  status: string;
  issued_at: string;
  lines: Array<{
    line_number: number;
    clinical_concept_label: string;
    dosage_instructions: string;
    quantity_authorized?: string;
    quantity_unit?: string | null;
  }>;
};

export type HealthUploadPayload = {
  content_type: string;
  byte_size: number;
  checksum_sha256: string;
  original_name: string;
  classification: string;
  uploaded_at: string;
  content_base64: string;
};

export type HealthUploadResponse = {
  artifact_id: string;
  artifact_type: string;
  title: string;
  published_at: string;
  timeline_event_id: string;
  content_type: string;
  byte_size: number;
  sandbox: boolean;
};

export type HealthArtifactPayload =
  | { artifact_type: 'LAB_REPORT'; payload: LabHealthPayload }
  | { artifact_type: 'IMAGING_REPORT'; payload: ImagingHealthPayload }
  | { artifact_type: 'PRESCRIPTION_STRUCTURED'; payload: PrescriptionHealthPayload }
  | { artifact_type: 'DOCUMENT' | 'PRESCRIPTION_UPLOAD'; payload: HealthUploadPayload }
  | { artifact_type: string; payload: unknown };

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
  countryCode: string;
};

export function fetchHealthTimeline(
  opts: TokenOpts & { cursor?: string; limit?: number },
): Promise<ApiCallResult<HealthTimelineResponse>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  if (opts.cursor) {
    qs.set('cursor', opts.cursor);
  }
  if (opts.limit) {
    qs.set('limit', String(opts.limit));
  }
  return apiCall<HealthTimelineResponse>(`api/v1/health/timeline?${qs}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchHealthArtifactMetadata(
  opts: TokenOpts & { artifactId: string },
): Promise<ApiCallResult<HealthArtifactMetadata>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  return apiCall<HealthArtifactMetadata>(
    `api/v1/health/artifacts/${encodeURIComponent(opts.artifactId)}?${qs}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}

export function fetchHealthArtifactPayload(
  opts: TokenOpts & { artifactId: string },
): Promise<ApiCallResult<HealthArtifactPayload>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  return apiCall<HealthArtifactPayload>(
    `api/v1/health/artifacts/${encodeURIComponent(opts.artifactId)}/payload?${qs}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}

export function uploadHealthDocument(
  opts: TokenOpts & {
    artifactType: 'DOCUMENT' | 'PRESCRIPTION_UPLOAD';
    originalName: string;
    contentType: string;
    contentBase64: string;
    title?: string;
    idempotencyKey?: string;
  },
): Promise<ApiCallResult<HealthUploadResponse>> {
  return apiCall<HealthUploadResponse>(`api/v1/health/uploads`, {
    method: 'POST',
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    body: {
      country_code: opts.countryCode,
      artifact_type: opts.artifactType,
      original_name: opts.originalName,
      content_type: opts.contentType,
      content_base64: opts.contentBase64,
      title: opts.title,
      idempotency_key: opts.idempotencyKey,
    },
  });
}
