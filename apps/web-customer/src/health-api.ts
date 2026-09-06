import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';
import type { ImagingCustomerReport } from './imaging-api';
import type { LabCustomerReport } from './lab-api';

export type HealthTimelineItem = {
  id: string;
  event_type: string;
  artifact_id: string | null;
  artifact_type: string | null;
  source_module: string;
  source_id: string;
  title: string;
  summary?: string | null;
  status: string;
  occurred_at: string;
  sandbox: boolean;
  subject_family_member_id?: string | null;
  deep_link?: string | null;
};

export type HealthTimelineResponse = {
  items: HealthTimelineItem[];
  next_cursor: string | null;
};

export type HealthDashboardPendingAction = {
  kind: string;
  id: string;
  title: string;
  status: string;
  occurred_at: string;
};

export type HealthInsight = {
  code: string;
  title: string;
  detail: string;
  priority: number;
  href: string | null;
};

export type HealthDashboardCarePlan = {
  plan_code: string;
  name: string;
} | null;

export type HealthDashboardReminder = {
  id: string;
  medicine_label: string;
  schedule_times: string[];
  enabled: boolean;
};

export type HealthDashboardResponse = {
  country_code: string;
  timeline_enabled: boolean;
  viewing_subject?: {
    kind: 'self' | 'family_member';
    family_member_id: string | null;
    display_name: string;
    relationship_code: string | null;
  };
  overview: {
    upcoming_appointments: Array<Record<string, unknown>>;
    recent_consultations: Array<Record<string, unknown>>;
    recent_prescriptions: Array<Record<string, unknown>>;
    recent_orders: Array<Record<string, unknown>>;
    recent_lab_bookings: Array<Record<string, unknown>>;
    recent_imaging_bookings: Array<Record<string, unknown>>;
    pending_actions: HealthDashboardPendingAction[];
    active_care_plan: HealthDashboardCarePlan;
    medication_reminders: HealthDashboardReminder[];
    health_insights: HealthInsight[];
  };
  recent_activity: HealthTimelineResponse;
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

export type HealthArtifactPayload =
  | { artifact_type: 'LAB_REPORT'; payload: LabCustomerReport }
  | { artifact_type: 'IMAGING_REPORT'; payload: ImagingCustomerReport }
  | { artifact_type: 'PRESCRIPTION_STRUCTURED'; payload: PrescriptionHealthPayload }
  | { artifact_type: 'DOCUMENT' | 'PRESCRIPTION_UPLOAD'; payload: HealthUploadPayload }
  | { artifact_type: string; payload: unknown };

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
  countryCode: string;
  familyMemberId?: string | null;
};

function timelineQuery(opts: TokenOpts & { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  if (opts.familyMemberId) {
    qs.set('family_member_id', opts.familyMemberId);
  }
  if (opts.cursor) {
    qs.set('cursor', opts.cursor);
  }
  if (opts.limit) {
    qs.set('limit', String(opts.limit));
  }
  return `api/v1/health/timeline?${qs}`;
}

export function fetchHealthTimeline(
  opts: TokenOpts & { cursor?: string; limit?: number },
): Promise<ApiCallResult<HealthTimelineResponse>> {
  return apiCall<HealthTimelineResponse>(timelineQuery(opts), {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchHealthDashboard(
  opts: TokenOpts,
): Promise<ApiCallResult<HealthDashboardResponse>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  if (opts.familyMemberId) {
    qs.set('family_member_id', opts.familyMemberId);
  }
  return apiCall<HealthDashboardResponse>(`api/v1/health/dashboard?${qs}`, {
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
): Promise<
  ApiCallResult<{
    artifact_id: string;
    artifact_type: string;
    title: string;
    published_at: string;
    timeline_event_id: string;
    content_type: string;
    byte_size: number;
    sandbox: boolean;
  }>
> {
  return apiCall(`api/v1/health/uploads`, {
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
