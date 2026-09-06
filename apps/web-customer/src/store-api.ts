import { apiBaseUrl } from '@world-pharma/shell-core';
import type { DiscoverySearchResponse } from './discovery-api';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

export async function fetchCatalog(country: string, q?: string, category?: string) {
  const params = new URLSearchParams({ country });
  if (q) {
    params.set('q', q);
  }
  if (category) {
    params.set('category', category);
  }
  const res = await fetch(`${base()}/api/v1/catalog/items?${params.toString()}`);
  if (!res.ok) {
    throw new Error('catalog_unavailable');
  }
  const body = (await res.json()) as { country_enabled?: boolean; data?: CatalogCard[] };
  return {
    country_enabled: body.country_enabled !== false,
    data: Array.isArray(body.data) ? body.data : [],
  };
}

export async function fetchProduct(country: string, slug: string) {
  const res = await fetch(`${base()}/api/v1/catalog/items/${encodeURIComponent(slug)}?country=${country}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('catalog_unavailable');
  }
  const body = (await res.json()) as CatalogProduct & { data?: CatalogProduct };
  return (body.data ?? body) as CatalogProduct;
}

type CategoryRow = { id: string; slug: string; name: string };
type CategoriesResponse = CategoryRow[] | { data?: CategoryRow[] };

export async function fetchCategories(country: string) {
  const res = await fetch(`${base()}/api/v1/catalog/categories?country=${encodeURIComponent(country)}`);
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as CategoriesResponse;
  const rows = Array.isArray(body) ? body : body.data ?? [];
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
}

export type CatalogBrand = { id: string; slug: string; name: string };

export async function fetchBrands(country: string): Promise<CatalogBrand[]> {
  const res = await fetch(`${base()}/api/v1/catalog/brands?country=${encodeURIComponent(country)}`);
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as CatalogBrand[] | { data?: CatalogBrand[] };
  const rows = Array.isArray(body) ? body : body.data ?? [];
  return rows.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));
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

export type CatalogProductAttributes = {
  manufacturer_name?: string | null;
  country_of_manufacture?: string | null;
  highlights?: string[];
  composition?: string | null;
  warnings?: string | null;
  storage?: string | null;
  usage_directions?: string | null;
};

export interface CatalogCard {
  id: string;
  slug: string;
  kind?: string;
  title: string;
  brand: string | null;
  category: string | null;
  rx_required?: boolean;
  assets?: { url: string; alt: string }[];
  attributes?: CatalogProductAttributes | null;
  offers?: {
    id: string;
    seller_org_id?: string;
    seller_display_name?: string;
    currency: string;
    sku?: string;
    pack_size?: string;
    strength?: string | null;
    inventory?: { available: boolean; qty?: number };
    price: {
      sell_minor: string;
      list_minor?: string | null;
      discount_minor?: string | null;
    } | null;
  }[];
}

export interface CatalogProduct extends CatalogCard {
  description: string;
  regulated_class: string;
  rx_required: boolean;
  inventory: { available: boolean } | null;
}
