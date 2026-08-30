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

export type HealthArtifactPayload = {
  artifact_type: string;
  payload: {
    summary?: string | null;
    results?: Array<{ analyte_name: string; value: string; unit?: string | null }>;
    findings?: Array<{ finding_code: string; finding_text: string }>;
    note?: string | null;
    version_number?: number;
    lines?: Array<{
      clinical_concept_label: string;
      dosage_instructions: string;
      quantity_authorized?: string;
    }>;
  };
};

export type DoctorHealthPatient = {
  patient_person_id: string;
  relationship_id: string;
  kind: string;
  status: string;
  organization_id: string | null;
};

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

export const DOCTOR_HEALTH_PURPOSE = 'treatment';

export function fetchDoctorHealthPatients(
  opts: TokenOpts & { countryCode: string },
): Promise<ApiCallResult<{ patients: DoctorHealthPatient[] }>> {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  return apiCall<{ patients: DoctorHealthPatient[] }>(`api/v1/doctor/me/health-patients?${qs}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchDoctorPatientTimeline(
  opts: TokenOpts & {
    patientPersonId: string;
    countryCode: string;
    purpose?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<ApiCallResult<HealthTimelineResponse>> {
  const qs = new URLSearchParams({
    country_code: opts.countryCode,
    purpose: opts.purpose ?? DOCTOR_HEALTH_PURPOSE,
  });
  if (opts.cursor) {
    qs.set('cursor', opts.cursor);
  }
  if (opts.limit) {
    qs.set('limit', String(opts.limit));
  }
  return apiCall<HealthTimelineResponse>(
    `api/v1/health/patients/${encodeURIComponent(opts.patientPersonId)}/timeline?${qs}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}

export function fetchDoctorArtifactMetadata(
  opts: TokenOpts & { patientPersonId: string; artifactId: string; countryCode: string; purpose?: string },
): Promise<ApiCallResult<HealthArtifactMetadata>> {
  const qs = new URLSearchParams({
    country_code: opts.countryCode,
    purpose: opts.purpose ?? DOCTOR_HEALTH_PURPOSE,
  });
  return apiCall<HealthArtifactMetadata>(
    `api/v1/health/patients/${encodeURIComponent(opts.patientPersonId)}/artifacts/${encodeURIComponent(opts.artifactId)}?${qs}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}

export function fetchDoctorArtifactPayload(
  opts: TokenOpts & { patientPersonId: string; artifactId: string; countryCode: string; purpose?: string },
): Promise<ApiCallResult<HealthArtifactPayload>> {
  const qs = new URLSearchParams({
    country_code: opts.countryCode,
    purpose: opts.purpose ?? DOCTOR_HEALTH_PURPOSE,
  });
  return apiCall<HealthArtifactPayload>(
    `api/v1/health/patients/${encodeURIComponent(opts.patientPersonId)}/artifacts/${encodeURIComponent(opts.artifactId)}/payload?${qs}`,
    { token: opts.token, onUnauthorized: opts.onUnauthorized },
  );
}
