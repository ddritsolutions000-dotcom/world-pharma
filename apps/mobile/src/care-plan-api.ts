import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type CarePlanDefinition = {
  id: string;
  name: string;
  price_label: string;
  perks: string[];
  featured: boolean;
};

export type CarePlanMine = {
  catalog: CarePlanDefinition[];
  membership: { active: boolean; expires_at: string } | null;
  plan: CarePlanDefinition | null;
};

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

export function fetchCarePlanCatalog(): Promise<ApiCallResult<{ sandbox: boolean; data: CarePlanDefinition[] }>> {
  return apiCall<{ sandbox: boolean; data: CarePlanDefinition[] }>('api/v1/public/care-plans');
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
