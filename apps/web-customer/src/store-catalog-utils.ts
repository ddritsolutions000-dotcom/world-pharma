import { discountPercent } from './format-money';
import type { CatalogCard } from './store-api';

export function isMedicine(item: CatalogCard): boolean {
  return !item.kind || item.kind === 'OTC' || item.kind === 'MEDICINE' || item.kind === 'CONSUMABLE';
}

export function isLabTest(item: CatalogCard): boolean {
  return item.kind === 'LAB_TEST';
}

export function isLabPackage(item: CatalogCard): boolean {
  if (!isLabTest(item)) return false;
  const t = `${item.title} ${item.slug}`.toLowerCase();
  return /full body|checkup|package|gold|silver|platinum|comprehensive|health package/.test(t);
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

export const PET_CARE_QUICK_LINKS = [
  { id: 'all' as const, label: 'All pets', icon: '🐾' },
  { id: 'dog' as const, label: 'Dogs', icon: '🐕' },
  { id: 'cat' as const, label: 'Cats', icon: '🐈' },
];

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

export const CANCER_CARE_QUICK_LINKS = [
  { id: 'all' as const, label: 'All', icon: '🎗️' },
  { id: 'support' as const, label: 'Support meds', icon: '💊' },
  { id: 'nutrition' as const, label: 'Nutrition', icon: '🥤' },
  { id: 'comfort' as const, label: 'Comfort care', icon: '🩹' },
];

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

export const AYURVEDA_QUICK_LINKS = [
  { id: 'all' as const, label: 'All', icon: '🌿' },
  { id: 'ayurveda' as const, label: 'Ayurveda', icon: '🪷' },
  { id: 'homeopathy' as const, label: 'Homeopathy', icon: '💧' },
];

export function isVaccineProduct(item: CatalogCard): boolean {
  const slug = item.slug.toLowerCase();
  const category = (item.category ?? '').toLowerCase();
  return slug.startsWith('vaccine-') || category.includes('vaccine');
}

export function filterVaccineProducts(items: CatalogCard[]): CatalogCard[] {
  return items.filter(isVaccineProduct);
}

export function filterLabPackages(items: CatalogCard[]): CatalogCard[] {
  return items.filter(isLabPackage);
}

export function isComboPack(item: CatalogCard): boolean {
  if (!isMedicine(item)) return false;
  return /combo|bundle|pack of \d|kit/.test(`${item.title} ${item.slug}`.toLowerCase());
}

export function filterComboPacks(items: CatalogCard[]): CatalogCard[] {
  return items.filter(isComboPack);
}

export const LAB_BROWSE_FILTERS = [
  { id: 'all', label: 'All tests' },
  { id: 'men', label: 'Men', keywords: ['men', 'male', 'psa', 'prostate', 'testosterone'] },
  { id: 'women', label: 'Women', keywords: ['women', 'female', 'pcos', 'pregnancy', 'pap', 'hormone'] },
  { id: 'thyroid', label: 'Thyroid', keywords: ['thyroid', 'tsh', 't3', 't4'] },
  { id: 'diabetes', label: 'Diabetes', keywords: ['diabetes', 'hba1c', 'glucose', 'sugar', 'insulin'] },
  { id: 'heart', label: 'Heart', keywords: ['lipid', 'cholesterol', 'cardiac', 'heart', 'ecg'] },
] as const;

export type LabBrowseFilterId = (typeof LAB_BROWSE_FILTERS)[number]['id'];

export function matchesLabBrowseFilter(title: string, description: string, filterId: LabBrowseFilterId): boolean {
  if (filterId === 'all') return true;
  const hay = `${title} ${description}`.toLowerCase();
  const row = LAB_BROWSE_FILTERS.find((f) => f.id === filterId);
  if (!row || !('keywords' in row) || !row.keywords) return true;
  return row.keywords.some((k) => hay.includes(k));
}

export function itemDiscountPercent(item: CatalogCard): number | null {
  const offer = item.offers?.[0];
  const sell = offer?.price?.sell_minor;
  const list = offer?.price?.list_minor;
  if (!sell || !list) return null;
  return discountPercent(sell, list);
}

export function itemSellMinor(item: CatalogCard): number {
  return Number(item.offers?.[0]?.price?.sell_minor ?? 0);
}

export function sortByPrice(items: CatalogCard[], dir: 'asc' | 'desc'): CatalogCard[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => (itemSellMinor(a) - itemSellMinor(b)) * mul);
}

export function applyCatalogSort(
  items: CatalogCard[],
  sort: 'featured' | 'discount' | 'price-asc' | 'price-desc',
): CatalogCard[] {
  if (sort === 'discount') return sortByDiscount(items);
  if (sort === 'price-asc') return sortByPrice(items, 'asc');
  if (sort === 'price-desc') return sortByPrice(items, 'desc');
  return items;
}

export function filterByRx(items: CatalogCard[], rx: 'all' | 'otc' | 'rx'): CatalogCard[] {
  if (rx === 'otc') return items.filter((item) => !item.rx_required);
  if (rx === 'rx') return items.filter((item) => !!item.rx_required);
  return items;
}

export function sortByDiscount(items: CatalogCard[]): CatalogCard[] {
  return [...items].sort((a, b) => (itemDiscountPercent(b) ?? 0) - (itemDiscountPercent(a) ?? 0));
}

export function filterDeals(items: CatalogCard[], minDiscount = 5): CatalogCard[] {
  return items.filter((item) => (itemDiscountPercent(item) ?? 0) >= minDiscount);
}

export function deliveryEtaLabel(rxRequired: boolean, postalCode?: string | null): string {
  if (rxRequired) return 'Prescription required';
  if (postalCode?.trim()) return 'Get by tomorrow';
  return 'Add postal code for delivery ETA';
}

export { medicineEtaLabel } from './delivery-eta';

/** Health concern tiles matched to common category slug keywords. */
export const HEALTH_CONCERN_META: Record<string, { label: string; icon: string }> = {
  diabetes: { label: 'Diabetes Care', icon: '🩸' },
  'diabetes-care': { label: 'Diabetes Care', icon: '🩸' },
  heart: { label: 'Heart Care', icon: '❤️' },
  'heart-care': { label: 'Heart Care', icon: '❤️' },
  stomach: { label: 'Stomach Care', icon: '🫃' },
  'stomach-care': { label: 'Stomach Care', icon: '🫃' },
  liver: { label: 'Liver Care', icon: '🫁' },
  bone: { label: 'Bone & Joint', icon: '🦴' },
  'bone-joint': { label: 'Bone & Joint', icon: '🦴' },
  kidney: { label: 'Kidney Care', icon: '🫘' },
  skin: { label: 'Skin Care', icon: '✨' },
  'skin-care': { label: 'Skin Care', icon: '✨' },
  respiratory: { label: 'Respiratory', icon: '🌬️' },
  eye: { label: 'Eye Care', icon: '👁️' },
  'cough-cold': { label: 'Cough & Cold', icon: '🤧' },
  'pain-relief': { label: 'Pain Relief', icon: '💊' },
  vitamins: { label: 'Vitamins', icon: '🌟' },
};

export function healthConcernForCategory(slug: string, name: string) {
  const key = slug.toLowerCase();
  for (const [part, meta] of Object.entries(HEALTH_CONCERN_META)) {
    if (key.includes(part)) return meta;
  }
  return { label: name, icon: name.slice(0, 1).toUpperCase() };
}

export const TRENDING_SEARCHES = [
  'Paracetamol',
  'Vitamin D3',
  'Cough syrup',
  'Diabetes',
  'Blood pressure',
  'Thyroid test',
  'General physician',
] as const;
