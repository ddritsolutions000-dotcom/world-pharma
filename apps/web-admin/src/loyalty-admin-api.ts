import { adminJson, AdminHttpError } from './admin-http';

export class LoyaltyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LoyaltyApiError';
  }
}

async function loyaltyFetch(token: string, path: string, init?: RequestInit) {
  try {
    return await adminJson(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new LoyaltyApiError(err.message, err.status);
    }
    throw new LoyaltyApiError('request_failed', 0);
  }
}

export type LoyaltyProgram = {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  country_code: string;
  points_per_currency_minor: number;
};

export function listCarePlanMemberships(token: string, countryCode: string) {
  return loyaltyFetch(
    token,
    `/api/v1/admin/care-plan/memberships?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{
    country_code: string;
    active_members: number;
    total_rows: number;
    by_plan: Array<{ plan_code: string; name: string; active_members: number }>;
  }>;
}

export function listLoyaltyPrograms(token: string, countryCode: string) {
  return loyaltyFetch(
    token,
    `/api/v1/admin/loyalty/programs?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: LoyaltyProgram[] }>;
}

export function createLoyaltyProgram(
  token: string,
  input: { country_code: string; code: string; name: string; points_per_currency_minor: number },
) {
  return loyaltyFetch(token, '/api/v1/admin/loyalty/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }) as Promise<LoyaltyProgram>;
}

export function updateLoyaltyProgram(
  token: string,
  id: string,
  input: { country_code: string; status?: string; name?: string; version: number },
) {
  return loyaltyFetch(
    token,
    `/api/v1/admin/loyalty/programs/${id}?country_code=${encodeURIComponent(input.country_code)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  ) as Promise<LoyaltyProgram>;
}
