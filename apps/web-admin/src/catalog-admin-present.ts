import { parseCatalogAttributes, type CatalogProductAttributes } from '@world-pharma/shared/partner-fields';

export type CatalogItemRow = {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: string;
  brand_name: string;
  sku: string;
  rx_required: boolean;
  kind: string;
  variant_id: string;
  attributes: CatalogProductAttributes;
};

type CatalogApiItem = {
  id?: string;
  slug?: string;
  status?: string;
  kind?: string;
  title?: string;
  brand_name?: string;
  sku?: string;
  rx_required?: boolean;
  brand?: { name?: string | null } | null;
  translations?: Array<{ title?: string | null; description?: string | null }>;
  countries?: Array<{ rxRequired?: boolean; rx_required?: boolean; attributes?: unknown }>;
  variants?: Array<{ id?: string; skuCode?: string; sku_code?: string }>;
};

export function presentCatalogItem(raw: CatalogApiItem, index: number): CatalogItemRow {
  const slug = raw.slug ?? '';
  const translated = raw.translations?.[0]?.title ?? '';
  const title = raw.title || translated || slug || raw.id || 'Catalog item';
  return {
    id: raw.id ?? `item-${index}`,
    title,
    description: raw.translations?.[0]?.description ?? '',
    slug,
    status: raw.status ?? 'UNKNOWN',
    brand_name: raw.brand_name ?? raw.brand?.name ?? '',
    sku: raw.sku ?? raw.variants?.[0]?.skuCode ?? raw.variants?.[0]?.sku_code ?? '',
    rx_required: Boolean(raw.rx_required ?? raw.countries?.[0]?.rxRequired ?? raw.countries?.[0]?.rx_required),
    kind: raw.kind ?? '',
    variant_id: raw.variants?.[0]?.id ?? '',
    attributes: parseCatalogAttributes(raw.countries?.[0]?.attributes),
  };
}

export function presentCatalogList(body: unknown): CatalogItemRow[] {
  const rows = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown }).data)
    ? ((body as { data: unknown[] }).data)
    : [];
  return rows.map((row, index) => presentCatalogItem((row ?? {}) as CatalogApiItem, index));
}
