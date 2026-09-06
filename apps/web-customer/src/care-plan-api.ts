import { apiBaseUrl, apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type CarePlanDefinition = {
  id: string;
  name: string;
  price_label: string;
  discount_bps: number;
  free_delivery: boolean;
  featured: boolean;
  perks: string[];
};

export type CarePlanMine = {
  country_code: string;
  catalog: CarePlanDefinition[];
  sandbox: boolean;
  membership: {
    plan_code: string;
    status: string;
    active: boolean;
    sandbox: boolean;
    started_at: string;
    expires_at: string;
    cancelled_at: string | null;
  } | null;
  plan: CarePlanDefinition | null;
};

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export async function fetchCarePlanCatalog(): Promise<{ sandbox: boolean; data: CarePlanDefinition[] }> {
  const res = await fetch(`${base()}/api/v1/public/care-plans`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { detail?: string }).detail ?? 'care_plan_catalog_failed');
  }
  return body as { sandbox: boolean; data: CarePlanDefinition[] };
}

export function fetchMyCarePlan(
  token: string,
  countryCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<CarePlanMine>> {
  return apiCall<CarePlanMine>(`api/v1/me/care-plan?country_code=${encodeURIComponent(countryCode)}`, {
    token,
    onUnauthorized,
  });
}

export function subscribeCarePlan(
  token: string,
  countryCode: string,
  planCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<CarePlanMine>> {
  return apiCall<CarePlanMine>('api/v1/me/care-plan/subscribe', {
    token,
    onUnauthorized,
    method: 'POST',
    body: { country_code: countryCode, plan_code: planCode },
  });
}

export function cancelCarePlan(
  token: string,
  countryCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<CarePlanMine>> {
  return apiCall<CarePlanMine>('api/v1/me/care-plan/cancel', {
    token,
    onUnauthorized,
    method: 'POST',
    body: { country_code: countryCode },
  });
}
