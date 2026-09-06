import { apiBaseUrl } from '@world-pharma/shell-core';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export type DiscoveryType = 'commerce' | 'help' | 'doctor' | 'lab' | 'test' | 'pharmacy';

export const DISCOVERY_TYPE_LABELS: Record<DiscoveryType, string> = {
  commerce: 'Products',
  help: 'Help',
  doctor: 'Doctors',
  lab: 'Labs',
  test: 'Tests',
  pharmacy: 'Pharmacies',
};

export interface DiscoveryResultItem {
  type: DiscoveryType;
  id: string;
  title: string;
  subtitle: string | null;
  slug: string | null;
  href: string | null;
  in_stock?: boolean;
  rx_required?: boolean;
  min_sell_minor?: string | null;
  max_discount_pct?: number | null;
  avg_rating?: number | null;
  review_count?: number;
  manufacturer?: string | null;
  composition?: string | null;
  brand?: string | null;
  category?: string | null;
  content_type?: string;
  category_slug?: string | null;
  online_capable?: boolean;
  city?: string | null;
  lab_org_id?: string | null;
  organization_id?: string | null;
  location_id?: string | null;
}

export type DiscoveryCommerceSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'discount';

export interface DiscoverySearchResponse {
  country: string;
  locale: string;
  country_enabled: boolean;
  discovery_enabled: boolean;
  query: string;
  types: DiscoveryType[];
  data: DiscoveryResultItem[];
  meta: {
    limit: number;
    total: number;
    next_cursor: string | null;
  };
}

export class DiscoveryApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildDiscoveryParams(input: {
  country: string;
  q?: string;
  locale?: string;
  limit?: number;
  cursor?: string;
  types?: DiscoveryType[];
  brand?: string;
  category?: string;
  specialty?: string;
  city?: string;
  labOrgId?: string;
  manufacturer?: string;
  rx?: boolean;
  in_stock?: boolean;
  sort?: DiscoveryCommerceSort;
}) {
  const params = new URLSearchParams({ country: input.country });
  if (input.q) {
    params.set('q', input.q);
  }
  if (input.locale) {
    params.set('locale', input.locale);
  }
  if (input.limit) {
    params.set('limit', String(input.limit));
  }
  if (input.cursor) {
    params.set('cursor', input.cursor);
  }
  for (const type of input.types ?? ['commerce', 'help']) {
    params.append('types', type);
  }
  if (input.brand) {
    params.set('brand', input.brand);
  }
  if (input.category) {
    params.set('category', input.category);
  }
  if (input.specialty) {
    params.set('specialty', input.specialty);
  }
  if (input.city) {
    params.set('city', input.city);
  }
  if (input.labOrgId) {
    params.set('lab_org_id', input.labOrgId);
  }
  if (input.manufacturer) {
    params.set('manufacturer', input.manufacturer);
  }
  if (input.rx !== undefined) {
    params.set('rx', input.rx ? 'true' : 'false');
  }
  if (input.in_stock !== undefined) {
    params.set('in_stock', input.in_stock ? 'true' : 'false');
  }
  if (input.sort) {
    params.set('sort', input.sort);
  }
  return params;
}

export async function fetchDiscoverySearch(input: {
  country: string;
  q: string;
  locale?: string;
  limit?: number;
  cursor?: string;
  types?: DiscoveryType[];
  brand?: string;
  category?: string;
  specialty?: string;
  city?: string;
  labOrgId?: string;
  manufacturer?: string;
  rx?: boolean;
  in_stock?: boolean;
  sort?: DiscoveryCommerceSort;
}): Promise<DiscoverySearchResponse> {
  const params = buildDiscoveryParams(input);
  const res = await fetch(`${base()}/api/v1/discovery/search?${params.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiscoveryApiError(
      (body as { detail?: string }).detail ?? 'discovery_unavailable',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as DiscoverySearchResponse;
}

export async function fetchDiscoverySuggest(input: {
  country: string;
  q: string;
  locale?: string;
  limit?: number;
  types?: DiscoveryType[];
}): Promise<DiscoverySearchResponse> {
  const params = buildDiscoveryParams({ ...input, types: input.types ?? ['commerce', 'help'] });
  const res = await fetch(`${base()}/api/v1/discovery/suggest?${params.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiscoveryApiError(
      (body as { detail?: string }).detail ?? 'discovery_unavailable',
      res.status,
      (body as { code?: string }).code,
    );
  }
  return body as DiscoverySearchResponse;
}
