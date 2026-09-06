import { filterPetProducts, isPetProduct, filterCancerCareProducts, isCancerCareProduct, filterAyurvedaProducts, isAyurvedaProduct, filterVaccineProducts, filterComboPacks, matchesLabBrowseFilter } from './store-catalog-utils';
import type { CatalogCard } from './store-api';

describe('combo and lab browse helpers', () => {
  it('identifies combo packs', () => {
    const combo: CatalogCard = {
      id: '10',
      slug: 'immunity-combo-kit',
      title: 'Immunity Combo Pack',
      brand: null,
      category: 'Vitamins',
      kind: 'OTC',
      assets: [],
      offers: [],
    };
    const medicine: CatalogCard = {
      id: '3',
      slug: 'demo-vitamin-d3',
      title: 'Vitamin D3',
      brand: null,
      category: 'Vitamins',
      assets: [],
      offers: [],
    };
    expect(filterComboPacks([combo, medicine])).toEqual([combo]);
  });

  it('matches lab condition filters', () => {
    expect(matchesLabBrowseFilter('TSH Thyroid Profile', '', 'thyroid')).toBe(true);
    expect(matchesLabBrowseFilter('Complete Blood Count', '', 'thyroid')).toBe(false);
    expect(matchesLabBrowseFilter('HbA1c', '', 'diabetes')).toBe(true);
  });
});

describe('pet care catalog helpers', () => {
  const dog: CatalogCard = {
    id: '1',
    slug: 'pet-dog-dewormer',
    title: 'Dog Dewormer',
    brand: 'PetDemo',
    category: 'Pet Care',
    assets: [],
    offers: [],
  };

  const cat: CatalogCard = {
    id: '2',
    slug: 'pet-cat-flea-drops',
    title: 'Cat Flea Drops',
    brand: 'PetDemo',
    category: 'Pet Care',
    assets: [],
    offers: [],
  };

  const medicine: CatalogCard = {
    id: '3',
    slug: 'demo-vitamin-d3',
    title: 'Vitamin D3',
    brand: null,
    category: 'Vitamins',
    assets: [],
    offers: [],
  };

  it('identifies pet products', () => {
    expect(isPetProduct(dog)).toBe(true);
    expect(isPetProduct(medicine)).toBe(false);
  });

  it('filters by pet type', () => {
    const all = filterPetProducts([dog, cat, medicine]);
    expect(all).toHaveLength(2);
    expect(filterPetProducts([dog, cat], 'dog')).toEqual([dog]);
    expect(filterPetProducts([dog, cat], 'cat')).toEqual([cat]);
  });
});

describe('cancer care catalog helpers', () => {
  const nausea: CatalogCard = {
    id: '4',
    slug: 'cancer-anti-nausea',
    title: 'Anti-Nausea Support',
    brand: 'OncoSupport',
    category: 'Cancer Care',
    assets: [],
    offers: [],
  };

  it('identifies cancer care products', () => {
    expect(isCancerCareProduct(nausea)).toBe(true);
    expect(isCancerCareProduct({ id: '5', slug: 'demo-vitamin-d3', title: 'Vit D', brand: null, category: null, assets: [], offers: [] })).toBe(false);
  });

  it('filters cancer care categories', () => {
    const protein: CatalogCard = {
      id: '6',
      slug: 'cancer-protein-supplement',
      title: 'Protein Powder',
      brand: null,
      category: 'Cancer Care',
      assets: [],
      offers: [],
    };
    expect(filterCancerCareProducts([nausea, protein], 'nutrition')).toEqual([protein]);
    expect(filterCancerCareProducts([nausea, protein], 'support')).toEqual([nausea]);
  });
});

describe('ayurveda catalog helpers', () => {
  const ashwagandha: CatalogCard = {
    id: '7',
    slug: 'ayur-ashwagandha',
    title: 'Ashwagandha Capsules',
    brand: null,
    category: 'Ayurveda & Homeopathy',
    assets: [],
    offers: [],
  };

  const arnica: CatalogCard = {
    id: '8',
    slug: 'ayur-homeo-arnica',
    title: 'Arnica 30C',
    brand: null,
    category: 'Ayurveda & Homeopathy',
    assets: [],
    offers: [],
  };

  it('identifies ayurveda products', () => {
    expect(isAyurvedaProduct(ashwagandha)).toBe(true);
  });

  it('filters by tradition', () => {
    expect(filterAyurvedaProducts([ashwagandha, arnica], 'homeopathy')).toEqual([arnica]);
    expect(filterAyurvedaProducts([ashwagandha, arnica], 'ayurveda')).toEqual([ashwagandha]);
  });
});

describe('vaccine catalog helpers', () => {
  it('identifies vaccine products', () => {
    expect(
      filterVaccineProducts([
        {
          id: '9',
          slug: 'vaccine-influenza',
          title: 'Flu Vaccine',
          brand: null,
          category: 'Adult Vaccines',
          assets: [],
          offers: [],
        },
      ]),
    ).toHaveLength(1);
  });
});
