import { apiBaseUrl, apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type HealthPackageCard = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  original_price: number;
  discount: number;
  tests_count: number;
  requires_fasting: boolean;
  report_turnaround: string;
  is_popular: boolean;
  lab_partners: string[];
};

export type HealthPackageDetail = HealthPackageCard & {
  included_tests: string[];
  preparation_instructions: string[];
  sample_collection: {
    home_collection: boolean;
    center_collection: boolean;
    collection_timing: string;
    fasting_required: boolean;
  };
};

export type HealthPackageBooking = {
  id: string;
  status: string;
  package_id: string;
  package_name: string;
  home_collection: boolean;
  preferred_date: string | null;
  message: string;
};

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export function formatPackageRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export async function fetchPublicHealthPackages(country: string, category?: string): Promise<HealthPackageCard[]> {
  const qs = new URLSearchParams({ country_code: country, limit: '20' });
  if (category) qs.set('category', category);
  const res = await fetch(`${base()}/api/v1/public/health-packages?${qs}`);
  const body = (await res.json().catch(() => ({}))) as { packages?: HealthPackageCard[] };
  if (!res.ok) throw new Error('health_packages_unavailable');
  return body.packages ?? [];
}

export async function fetchPopularHealthPackages(country: string): Promise<HealthPackageCard[]> {
  const res = await fetch(
    `${base()}/api/v1/public/health-packages/popular?country_code=${encodeURIComponent(country)}`,
  );
  const body = (await res.json().catch(() => ({}))) as { popular_packages?: HealthPackageCard[] };
  if (!res.ok) throw new Error('health_packages_unavailable');
  return body.popular_packages ?? [];
}

export async function fetchPublicHealthPackage(
  packageId: string,
  country: string,
): Promise<HealthPackageDetail> {
  const res = await fetch(
    `${base()}/api/v1/public/health-packages/${encodeURIComponent(packageId)}?country_code=${encodeURIComponent(country)}`,
  );
  const body = (await res.json().catch(() => ({}))) as HealthPackageDetail & { detail?: string };
  if (!res.ok) throw new Error(body.detail ?? 'health_package_not_found');
  return body;
}

export function bookHealthPackage(
  token: string,
  payload: { package_id: string; country_code: string; home_collection?: boolean; preferred_date?: string },
  onUnauthorized?: () => void,
): Promise<ApiCallResult<HealthPackageBooking>> {
  return apiCall<HealthPackageBooking>('api/v1/customer/health-packages/book', {
    token,
    onUnauthorized,
    method: 'POST',
    body: payload,
  });
}
