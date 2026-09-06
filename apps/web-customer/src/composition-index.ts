export function compositionSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function compositionHref(value: string): string {
  const slug = compositionSlug(value);
  return slug ? `/salts/${encodeURIComponent(slug)}` : '/search';
}
