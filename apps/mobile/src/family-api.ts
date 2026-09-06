import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';
import type { FamilyMember, FamilyMemberInput } from './family-member-ui';

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

function call<T>(
  path: string,
  opts: TokenOpts & { method?: string; body?: unknown },
): Promise<ApiCallResult<T>> {
  return apiCall<T>(path, {
    method: opts.method,
    token: opts.token,
    body: opts.body,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchFamilyMembers(opts: TokenOpts & { country: string }) {
  return call<{ members: FamilyMember[] }>(
    `api/v1/me/family-members?country_code=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

export function createFamilyMember(opts: TokenOpts & { country: string; input: FamilyMemberInput }) {
  return call<FamilyMember>('api/v1/me/family-members', {
    ...opts,
    method: 'POST',
    body: { country_code: opts.country, ...opts.input },
  });
}

export function deleteFamilyMember(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<{ removed: boolean; id: string }>(`api/v1/me/family-members/${id}`, {
    ...rest,
    method: 'DELETE',
  });
}
