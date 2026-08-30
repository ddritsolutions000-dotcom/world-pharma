export const DISCOVERY_MAX_QUERY_LEN = 200;
export const DISCOVERY_DEFAULT_LIMIT = 20;
export const DISCOVERY_MAX_LIMIT = 50;
export const SUGGEST_MIN_QUERY_LEN = 2;
export const SUGGEST_DEFAULT_LIMIT = 10;
export const SUGGEST_MAX_LIMIT = 10;

export type DiscoveryType = 'commerce' | 'help' | 'doctor' | 'lab' | 'test' | 'pharmacy';

export const DISCOVERY_TYPES: DiscoveryType[] = [
  'commerce',
  'help',
  'doctor',
  'lab',
  'test',
  'pharmacy',
];

export interface DiscoveryResultItem {
  type: DiscoveryType;
  id: string;
  title: string;
  subtitle: string | null;
  slug: string | null;
  href: string | null;
  in_stock?: boolean;
  content_type?: string;
  category_slug?: string | null;
  online_capable?: boolean;
  city?: string | null;
  lab_org_id?: string | null;
  organization_id?: string | null;
  location_id?: string | null;
}

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

export function parseDiscoveryTypes(raw: string | string[] | undefined): DiscoveryType[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const parsed = values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(
      (entry): entry is DiscoveryType =>
        entry === 'commerce' ||
        entry === 'help' ||
        entry === 'doctor' ||
        entry === 'lab' ||
        entry === 'test' ||
        entry === 'pharmacy',
    );
  return parsed.length ? [...new Set(parsed)] : ['commerce', 'help'];
}

export function encodeDiscoveryCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

export function decodeDiscoveryCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: number };
    return typeof parsed.offset === 'number' && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}
