import { apiBaseUrl } from '@world-pharma/shell-core';
import type { FamilyMember, FamilyMemberInput } from './family-member-ui';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string | null } = {}) {
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
  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

export function fetchFamilyMembers(token: string, countryCode: string) {
  return call(`/api/v1/me/family-members?country_code=${encodeURIComponent(countryCode)}`, {
    token,
  }) as Promise<{ members: FamilyMember[] }>;
}

export function createFamilyMember(token: string, countryCode: string, input: FamilyMemberInput) {
  return call('/api/v1/me/family-members', {
    method: 'POST',
    token,
    body: JSON.stringify({ country_code: countryCode, ...input }),
  }) as Promise<FamilyMember>;
}

export function updateFamilyMember(token: string, id: string, input: Partial<FamilyMemberInput>) {
  return call(`/api/v1/me/family-members/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(input),
  }) as Promise<FamilyMember>;
}

export function deleteFamilyMember(token: string, id: string) {
  return call(`/api/v1/me/family-members/${id}`, {
    method: 'DELETE',
    token,
  }) as Promise<{ removed: boolean; id: string }>;
}
