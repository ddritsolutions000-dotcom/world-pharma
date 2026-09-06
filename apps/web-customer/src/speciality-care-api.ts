import { apiBaseUrl, apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type SpecialityProgramCard = {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
  requires_prescription: boolean;
  available_doctors: number;
  success_rate: number;
};

export type SpecialityProgramDetail = SpecialityProgramCard & {
  long_description?: string;
  pricing?: {
    consultation_fee?: number;
    monthly_program_fee?: number;
    includes_followups?: boolean;
    per_vaccination_fee?: number;
    home_service_fee?: number;
  };
  timeline?: Record<string, string>;
  specializations?: string[];
  available_treatments?: string[];
  available_vaccinations?: string[];
};

export type SpecialityEnrollment = {
  id: string;
  status: string;
  program_id: string;
  program_name: string;
  preferred_start_date: string | null;
  message: string;
};

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export async function fetchPublicSpecialityPrograms(country: string): Promise<SpecialityProgramCard[]> {
  const res = await fetch(
    `${base()}/api/v1/public/speciality-care/programs?country_code=${encodeURIComponent(country)}`,
  );
  const body = (await res.json().catch(() => ({}))) as { programs?: SpecialityProgramCard[] };
  if (!res.ok) throw new Error('speciality_programs_unavailable');
  return body.programs ?? [];
}

export async function fetchPublicSpecialityProgram(
  programId: string,
  country: string,
): Promise<SpecialityProgramDetail> {
  const res = await fetch(
    `${base()}/api/v1/public/speciality-care/programs/${encodeURIComponent(programId)}?country_code=${encodeURIComponent(country)}`,
  );
  const body = (await res.json().catch(() => ({}))) as SpecialityProgramDetail & { detail?: string };
  if (!res.ok) throw new Error(body.detail ?? 'speciality_program_not_found');
  return body;
}

export function enrollSpecialityProgram(
  token: string,
  programId: string,
  countryCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<SpecialityEnrollment>> {
  return apiCall<SpecialityEnrollment>(
    `api/v1/customer/speciality-care/programs/${encodeURIComponent(programId)}/enroll`,
    {
      token,
      onUnauthorized,
      method: 'POST',
      body: { country_code: countryCode },
    },
  );
}

export type PublicVaccination = {
  id: string;
  name: string;
  description: string;
  price: number;
  available_for_home: boolean;
};

export async function fetchPublicVaccinations(country: string): Promise<PublicVaccination[]> {
  const res = await fetch(
    `${base()}/api/v1/public/speciality-care/vaccinations?country_code=${encodeURIComponent(country)}`,
  );
  const body = (await res.json().catch(() => ({}))) as { vaccinations?: PublicVaccination[] };
  if (!res.ok) throw new Error('vaccinations_unavailable');
  return body.vaccinations ?? [];
}

export function bookVaccination(
  token: string,
  payload: { vaccination_id: string; country_code: string; home_service?: boolean },
  onUnauthorized?: () => void,
): Promise<ApiCallResult<{ id: string; status: string; message: string }>> {
  return apiCall('api/v1/customer/speciality-care/vaccinations/book', {
    token,
    onUnauthorized,
    method: 'POST',
    body: payload,
  });
}
