import { apiBaseUrl } from '@world-pharma/shell-core';

export type JoinCmsCopy = { title: string; summary: string; body: string };

export async function fetchJoinArticle(slug: string, countryCode = 'IN'): Promise<JoinCmsCopy | null> {
  const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
  try {
    const res = await fetch(
      `${base}/api/v1/help/articles/${encodeURIComponent(slug)}?country_code=${encodeURIComponent(countryCode)}&locale=en`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as JoinCmsCopy;
  } catch {
    return null;
  }
}

export function fetchJoinHomeCopy(countryCode = 'IN') {
  return fetchJoinArticle('join-home', countryCode);
}
