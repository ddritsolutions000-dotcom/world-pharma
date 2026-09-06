import type { DiscoveryType } from './discovery-api';

export type SearchScopeId = 'all' | 'commerce' | 'test' | 'doctor';

export const SEARCH_SCOPES: Array<{
  id: SearchScopeId;
  label: string;
  placeholder: string;
  types: DiscoveryType[];
}> = [
  {
    id: 'all',
    label: 'All',
    placeholder: 'Search medicines, doctors, lab tests…',
    types: ['commerce', 'help', 'doctor', 'test'],
  },
  {
    id: 'commerce',
    label: 'Medicines',
    placeholder: 'Search medicines and health products',
    types: ['commerce'],
  },
  {
    id: 'test',
    label: 'Lab tests',
    placeholder: 'Search lab tests and packages',
    types: ['test'],
  },
  {
    id: 'doctor',
    label: 'Doctors',
    placeholder: 'Search doctors and specialties',
    types: ['doctor'],
  },
];

export function searchResultsHref(query: string, scope: SearchScopeId = 'all'): string {
  const trimmed = query.trim();
  if (!trimmed) return '/';
  const params = new URLSearchParams({ q: trimmed });
  if (scope !== 'all') params.set('tab', scope);
  return `/search?${params.toString()}`;
}

export function parseSearchScope(value: string | null | undefined): SearchScopeId {
  if (value === 'commerce' || value === 'test' || value === 'doctor') return value;
  if (value === 'lab') return 'test';
  return 'all';
}
