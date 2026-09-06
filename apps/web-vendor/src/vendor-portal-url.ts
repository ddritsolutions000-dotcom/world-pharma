/** Customer marketplace (where vendor listings appear). */
export function customerMarketplaceUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
