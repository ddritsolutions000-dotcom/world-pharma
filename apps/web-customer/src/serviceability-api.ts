import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type Serviceability = {
  serviceable: boolean;
  city: string | null;
  region: string | null;
  country_code: string;
  postal_code: string;
  medicine_delivery: boolean;
  lab_home_collection: boolean;
  express_delivery: boolean;
  medicine_eta: 'same_day' | 'next_day' | '2_3_days' | 'unavailable';
  lab_eta: 'same_day' | 'next_day' | '2_3_days' | 'unavailable';
  message: string;
};

export function fetchServiceability(
  countryCode: string,
  postalCode: string,
): Promise<ApiCallResult<Serviceability>> {
  const params = new URLSearchParams({
    country: countryCode,
    postal_code: postalCode,
  });
  return apiCall<Serviceability>(`api/v1/serviceability?${params.toString()}`);
}
