import { apiBaseUrl } from '@world-pharma/shell-core';
import type { DiscoverySearchResponse } from './discovery-api';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export async function fetchCatalog(country: string, q?: string) {
  const params = new URLSearchParams({ country });
  if (q) {
    params.set('q', q);
  }
  const res = await fetch(`${base()}/api/v1/catalog/items?${params.toString()}`);
  if (!res.ok) {
    throw new Error('catalog_unavailable');
  }
  return res.json() as Promise<{ country_enabled: boolean; data: CatalogCard[] }>;
}

export async function fetchProduct(country: string, slug: string) {
  const res = await fetch(`${base()}/api/v1/catalog/items/${encodeURIComponent(slug)}?country=${country}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('catalog_unavailable');
  }
  return res.json() as Promise<CatalogProduct>;
}

export async function fetchCategories(country: string) {
  const res = await fetch(`${base()}/api/v1/catalog/categories?country=${encodeURIComponent(country)}`);
  if (!res.ok) {
    return [];
  }
  return res.json() as Promise<{ id: string; slug: string; name: string }[]>;
}

/** @deprecated Use fetchDiscoverySearch for unified commerce + help discovery. */
export async function searchCatalog(country: string, q: string, locale = 'en') {
  const res = await fetch(
    `${base()}/api/v1/discovery/search?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}&types=commerce`,
  );
  if (!res.ok) {
    throw new Error('search_unavailable');
  }
  const body = (await res.json()) as DiscoverySearchResponse;
  return {
    country_enabled: body.country_enabled && body.discovery_enabled,
    data: body.data.map((row) => ({ itemId: row.id, title: row.title })),
  };
}

export interface CatalogCard {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  assets: { url: string; alt: string }[];
  offers: {
    id: string;
    seller_org_id?: string;
    seller_display_name?: string;
    currency: string;
    price: { sell_minor: string } | null;
  }[];
}

export interface CatalogProduct extends CatalogCard {
  description: string;
  regulated_class: string;
  rx_required: boolean;
  inventory: { available: boolean } | null;
}
