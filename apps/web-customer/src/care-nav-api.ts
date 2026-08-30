import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export class CareNavApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const { token, ...rest } = init;
  void token;
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { ...rest, headers });
  } catch {
    throw new CareNavApiError('network_failure', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CareNavApiError(
      (body as { detail?: string; title?: string }).detail ??
        (body as { title?: string }).title ??
        'request_failed',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export type CareNavSessionStatus =
  | 'DRAFT'
  | 'INTAKE'
  | 'TRIAGED'
  | 'MATCHED'
  | 'COMPLETED'
  | 'TERMINATED';

export type CareNavUrgency = 'ROUTINE' | 'SOON' | 'URGENT' | 'EMERGENT';

export type CareNavAnswer = {
  question_key: string;
  answer_text: string;
  created_at: string;
};

export type CareNavSession = {
  id: string;
  status: CareNavSessionStatus;
  country_id: string;
  chief_complaint_summary: string | null;
  urgency: CareNavUrgency | null;
  specialty_code: string | null;
  red_flag: boolean;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
  terminated_at: string | null;
  answers?: CareNavAnswer[];
};

export type CareNavAssessment = {
  id: string;
  rules_version: string;
  urgency: CareNavUrgency;
  red_flag: boolean;
  specialty_codes: string[];
  explanation_key: string;
  emergency_guidance_key: string | null;
  booking_handoff_allowed: boolean;
  created_at: string;
};

export type CareNavCompleteIntakeResponse = CareNavSession & {
  assessment: CareNavAssessment;
};

export type CareNavRecommendation = {
  id: string;
  rank: number;
  doctor_profile_id: string;
  display_name: string;
  specialties: string[];
  online_capable: boolean;
  explanation_key: string;
};

export type CareNavRecommendationsResponse = {
  session_id: string;
  status: CareNavSessionStatus;
  no_match: boolean;
  explanation_key: string;
  tele_available: boolean;
  recommendations: CareNavRecommendation[];
};

export type CareNavHandoffResponse = {
  session_id: string;
  status: CareNavSessionStatus;
  handoff_completed: boolean;
  appointment_id: string;
  appointment?: {
    id: string;
    status: string;
    type: string;
    starts_at: string;
  };
  tele: {
    available: boolean;
    path: string;
    video_join_route: string | null;
    recording_enabled: boolean;
  };
};

export type CareNavHandoffStatusResponse = {
  session_id: string;
  status: CareNavSessionStatus;
  handoff_completed: boolean;
  appointment_id: string | null;
  tele: {
    available: boolean;
    path: string;
    video_join_route: string | null;
    recording_enabled: boolean;
  };
};

export type AppointmentSlot = {
  starts_at: string;
  ends_at: string;
};

export function newCareNavIdempotencyKey(prefix = 'care-nav'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCareNavSession(
  token: string,
  idempotencyKey: string,
  input: { country_code: string; chief_complaint: string },
) {
  return call<CareNavSession>('/api/v1/care-nav/sessions', {
    method: 'POST',
    token,
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function fetchCareNavSession(token: string, sessionId: string, countryCode: string) {
  return call<CareNavSession>(
    `/api/v1/care-nav/sessions/${sessionId}?country_code=${encodeURIComponent(countryCode)}`,
    { token },
  );
}

export function submitCareNavAnswer(
  token: string,
  sessionId: string,
  countryCode: string,
  input: { question_key: string; answer_text: string },
) {
  return call<CareNavSession>(
    `/api/v1/care-nav/sessions/${sessionId}/answers?country_code=${encodeURIComponent(countryCode)}`,
    { method: 'POST', token, body: JSON.stringify(input) },
  );
}

export function completeCareNavIntake(token: string, sessionId: string, countryCode: string) {
  return call<CareNavCompleteIntakeResponse>(
    `/api/v1/care-nav/sessions/${sessionId}/complete-intake?country_code=${encodeURIComponent(countryCode)}`,
    { method: 'POST', token, body: JSON.stringify({}) },
  );
}

export function fetchCareNavAssessment(token: string, sessionId: string, countryCode: string) {
  return call<CareNavAssessment>(
    `/api/v1/care-nav/sessions/${sessionId}/assessment?country_code=${encodeURIComponent(countryCode)}`,
    { token },
  );
}

export function fetchCareNavRecommendations(token: string, sessionId: string, countryCode: string) {
  return call<CareNavRecommendationsResponse>(
    `/api/v1/care-nav/sessions/${sessionId}/recommendations?country_code=${encodeURIComponent(countryCode)}`,
    { token },
  );
}

export function handoffCareNavAppointment(
  token: string,
  sessionId: string,
  countryCode: string,
  idempotencyKey: string,
  input: {
    doctor_profile_id: string;
    starts_at: string;
    type?: 'IN_PERSON' | 'ONLINE';
    authorized: boolean;
  },
) {
  return call<CareNavHandoffResponse>(
    `/api/v1/care-nav/sessions/${sessionId}/handoff/appointment?country_code=${encodeURIComponent(countryCode)}`,
    {
      method: 'POST',
      token,
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export function fetchCareNavHandoffStatus(token: string, sessionId: string, countryCode: string) {
  return call<CareNavHandoffStatusResponse>(
    `/api/v1/care-nav/sessions/${sessionId}/handoff/status?country_code=${encodeURIComponent(countryCode)}`,
    { token },
  );
}

export function fetchDoctorSlots(
  token: string,
  profileId: string,
  countryCode: string,
  fromIso: string,
  toIso: string,
) {
  return call<{ slots: AppointmentSlot[] }>(
    `/api/v1/care/doctors/${profileId}/slots?country_code=${encodeURIComponent(countryCode)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    { token },
  );
}
