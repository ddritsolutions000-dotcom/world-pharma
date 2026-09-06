/** Customer storefront origin for admin preview links. */
export function customerSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Join partner portal origin for company-page previews. */
export function joinPortalUrl(): string {
  return (process.env.NEXT_PUBLIC_JOIN_PORTAL_URL ?? 'http://localhost:3008').replace(/\/$/, '');
}

export function customerPageUrl(path: string): string {
  const base = customerSiteUrl();
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export function resolveCompanyPageUrl(customerPath: string): string {
  if (customerPath.startsWith('http://') || customerPath.startsWith('https://')) {
    return customerPath;
  }
  return customerPageUrl(customerPath);
}
