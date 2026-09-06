import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

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
    active_care_plan: { plan_code: string; name: string } | null;
    medication_reminders: Array<{
      id: string;
      medicine_label: string;
      schedule_times: string[];
      enabled: boolean;
    }>;
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
  familyMemberId?: string | null;
};

export function fetchHealthTimeline(
  opts: TokenOpts & { cursor?: string; limit?: number },
): Promise<ApiCallResult<HealthTimelineResponse>> {
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
  return apiCall<HealthTimelineResponse>(`api/v1/health/timeline?${qs}`, {
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

export type HealthProfileAllergy = {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: string;
  active: boolean;
  notes: string | null;
  updated_at: string;
};

export type HealthProfileCondition = {
  id: string;
  condition: string;
  status: string;
  diagnosed_at: string | null;
  notes: string | null;
  updated_at: string;
};

export type HealthProfileVital = {
  id: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_bpm: number | null;
  temperature_celsius: number | null;
  recorded_at: string;
  notes: string | null;
};

export type HealthProfileResponse = {
  country_code: string;
  subject: {
    kind: 'self' | 'family_member';
    family_member_id: string | null;
    display_name: string;
    relationship_code: string | null;
  };
  profile: {
    id: string;
    blood_type: string | null;
    notes: string | null;
    updated_at: string;
    allergies: HealthProfileAllergy[];
    conditions: HealthProfileCondition[];
    vitals: HealthProfileVital[];
    emergency_contact: {
      id: string;
      name: string;
      relationship: string;
      phone: string;
      notes: string | null;
      updated_at: string;
    } | null;
  };
};

export type HealthSubjectOption = {
  kind: 'self' | 'family_member';
  family_member_id: string | null;
  display_name: string;
  relationship_code: string | null;
};

export function fetchHealthProfileSubjects(
  opts: TokenOpts,
): Promise<ApiCallResult<{ subjects: HealthSubjectOption[] }>> {
  return apiCall(`api/v1/health/profile/subjects?country_code=${encodeURIComponent(opts.countryCode)}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchHealthProfile(
  opts: TokenOpts,
): Promise<ApiCallResult<HealthProfileResponse>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  if (opts.familyMemberId) {
    qs.set('family_member_id', opts.familyMemberId);
  }
  return apiCall<HealthProfileResponse>(`api/v1/health/profile?${qs}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function addHealthAllergy(
  opts: TokenOpts & {
    allergen: string;
    reaction?: string | null;
    severity?: string;
    notes?: string | null;
  },
): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>('api/v1/health/profile/allergies', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: {
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      allergen: opts.allergen,
      reaction: opts.reaction,
      severity: opts.severity,
      notes: opts.notes,
    },
  });
}

export function addHealthCondition(
  opts: TokenOpts & {
    condition: string;
    status?: string;
    diagnosed_at?: string | null;
    notes?: string | null;
  },
): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>('api/v1/health/profile/conditions', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: {
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      condition: opts.condition,
      status: opts.status,
      diagnosed_at: opts.diagnosed_at,
      notes: opts.notes,
    },
  });
}

export function addHealthVital(
  opts: TokenOpts & {
    height_cm?: number | null;
    weight_kg?: number | null;
    blood_pressure_systolic?: number | null;
    blood_pressure_diastolic?: number | null;
    pulse_bpm?: number | null;
    temperature_celsius?: number | null;
    recorded_at?: string;
    notes?: string | null;
  },
): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>('api/v1/health/profile/vitals', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: {
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      height_cm: opts.height_cm,
      weight_kg: opts.weight_kg,
      blood_pressure_systolic: opts.blood_pressure_systolic,
      blood_pressure_diastolic: opts.blood_pressure_diastolic,
      pulse_bpm: opts.pulse_bpm,
      temperature_celsius: opts.temperature_celsius,
      recorded_at: opts.recorded_at,
      notes: opts.notes,
    },
  });
}

export function upsertHealthEmergencyContact(
  opts: TokenOpts & {
    name: string;
    relationship: string;
    phone: string;
    notes?: string | null;
  },
): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>('api/v1/health/profile/emergency-contact', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
    body: {
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      name: opts.name,
      relationship: opts.relationship,
      phone: opts.phone,
      notes: opts.notes,
    },
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
