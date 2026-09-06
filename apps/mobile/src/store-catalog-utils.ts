import { discountPercent } from './format-money';
import type { CatalogCard } from './commerce-api';

export function isMedicine(item: CatalogCard): boolean {
  return !item.kind || item.kind === 'OTC' || item.kind === 'MEDICINE' || item.kind === 'CONSUMABLE';
}

export function isLabTest(item: CatalogCard): boolean {
  return item.kind === 'LAB_TEST';
}

export function itemDiscountPercent(item: CatalogCard): number | null {
  const offer = item.offers[0];
  const sell = offer?.price?.sell_minor;
  const list = offer?.price?.list_minor;
  if (!sell || !list) return null;
  return discountPercent(sell, list);
}

export function sortByDiscount(items: CatalogCard[]): CatalogCard[] {
  return [...items].sort((a, b) => (itemDiscountPercent(b) ?? 0) - (itemDiscountPercent(a) ?? 0));
}

export function filterDeals(items: CatalogCard[], minDiscount = 5): CatalogCard[] {
  return items.filter((item) => (itemDiscountPercent(item) ?? 0) >= minDiscount);
}

export function isPetProduct(item: CatalogCard): boolean {
  const slug = item.slug.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  return slug.startsWith('pet-') || category.includes('pet');
}

export type PetTypeFilter = 'all' | 'dog' | 'cat';

export function filterPetProducts(items: CatalogCard[], petType: PetTypeFilter = 'all'): CatalogCard[] {
  const pets = items.filter(isPetProduct);
  if (petType === 'all') return pets;
  return pets.filter((item) => {
    const slug = item.slug.toLowerCase();
    const title = item.title.toLowerCase();
    if (petType === 'dog') return slug.includes('dog') || title.includes('dog');
    return slug.includes('cat') || title.includes('cat');
  });
}

export function isCancerCareProduct(item: CatalogCard): boolean {
  const slug = item.slug.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  return slug.startsWith('cancer-') || category.includes('cancer');
}

export type CancerCareFilter = 'all' | 'support' | 'nutrition' | 'comfort';

export function filterCancerCareProducts(items: CatalogCard[], filter: CancerCareFilter = 'all'): CatalogCard[] {
  const cancer = items.filter(isCancerCareProduct);
  if (filter === 'all') return cancer;
  return cancer.filter((item) => {
    const slug = item.slug.toLowerCase();
    const title = item.title.toLowerCase();
    if (filter === 'nutrition') {
      return slug.includes('protein') || slug.includes('nutrition') || title.includes('protein') || title.includes('nutrition');
    }
    if (filter === 'comfort') {
      return slug.includes('gel') || slug.includes('pain') || title.includes('gel') || title.includes('pain');
    }
    return (
      slug.includes('nausea') ||
      slug.includes('immunity') ||
      title.includes('nausea') ||
      title.includes('immunity') ||
      title.includes('support')
    );
  });
}

export function isAyurvedaProduct(item: CatalogCard): boolean {
  const slug = item.slug.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  return slug.startsWith('ayur-') || category.includes('ayurveda') || category.includes('homeopath');
}

export type AyurvedaTraditionFilter = 'all' | 'ayurveda' | 'homeopathy';

export function filterAyurvedaProducts(items: CatalogCard[], filter: AyurvedaTraditionFilter = 'all'): CatalogCard[] {
  const wellness = items.filter(isAyurvedaProduct);
  if (filter === 'all') return wellness;
  return wellness.filter((item) => {
    const slug = item.slug.toLowerCase();
    const title = item.title.toLowerCase();
    if (filter === 'homeopathy') {
      return slug.includes('homeo') || title.includes('pellet') || title.includes('30c');
    }
    return !slug.includes('homeo') && !title.includes('pellet');
  });
}

export function isVaccineProduct(item: CatalogCard): boolean {
  const slug = item.slug.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  return slug.startsWith('vaccine-') || category.includes('vaccine');
}

export function filterVaccineProducts(items: CatalogCard[]): CatalogCard[] {
  return items.filter(isVaccineProduct);
}
