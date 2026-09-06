import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

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

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
  countryCode: string;
  familyMemberId?: string | null;
};

function profileQuery(opts: TokenOpts, suffix = '') {
  const qs = new URLSearchParams({ country_code: opts.countryCode });
  if (opts.familyMemberId) {
    qs.set('family_member_id', opts.familyMemberId);
  }
  return `api/v1/health/profile${suffix}?${qs}`;
}

export function fetchHealthProfileSubjects(
  opts: TokenOpts,
): Promise<ApiCallResult<{ subjects: HealthSubjectOption[] }>> {
  return apiCall(`api/v1/health/profile/subjects?country_code=${encodeURIComponent(opts.countryCode)}`, {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchHealthProfile(opts: TokenOpts): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>(profileQuery(opts), {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function updateHealthProfile(
  opts: TokenOpts & { blood_type?: string | null; notes?: string | null },
): Promise<ApiCallResult<HealthProfileResponse>> {
  return apiCall<HealthProfileResponse>('api/v1/health/profile', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'PATCH',
    body: JSON.stringify({
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      blood_type: opts.blood_type,
      notes: opts.notes,
    }),
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
    body: JSON.stringify({
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      allergen: opts.allergen,
      reaction: opts.reaction,
      severity: opts.severity,
      notes: opts.notes,
    }),
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
    body: JSON.stringify({
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      condition: opts.condition,
      status: opts.status,
      diagnosed_at: opts.diagnosed_at,
      notes: opts.notes,
    }),
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
    body: JSON.stringify({
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
    }),
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
    body: JSON.stringify({
      country_code: opts.countryCode,
      family_member_id: opts.familyMemberId ?? null,
      name: opts.name,
      relationship: opts.relationship,
      phone: opts.phone,
      notes: opts.notes,
    }),
  });
}
