'use client';

export type RxFilter = 'all' | 'otc' | 'rx';
export type CatalogSort = 'featured' | 'discount' | 'price-asc' | 'price-desc';

export function CatalogFilterBar({
  rxFilter,
  onRxFilter,
  sort,
  onSort,
  brands,
  brand,
  onBrand,
  layout = 'bar',
}: {
  rxFilter: RxFilter;
  onRxFilter: (value: RxFilter) => void;
  sort: CatalogSort;
  onSort: (value: CatalogSort) => void;
  brands?: string[];
  brand?: string;
  onBrand?: (value: string) => void;
  layout?: 'bar' | 'sidebar';
}) {
  const body = (
    <>
      <p className="wp-plp-filter-title">Filters</p>
      <fieldset className="wp-plp-fieldset">
        <legend>Availability</legend>
        <div className="mg-filter-chips">
          {(
            [
              ['all', 'All'],
              ['otc', 'OTC'],
              ['rx', 'Prescription'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={rxFilter === id ? 'mg-chip is-active' : 'mg-chip'}
              onClick={() => onRxFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="mg-search-sort">
        Sort
        <select value={sort} onChange={(e) => onSort(e.target.value as CatalogSort)}>
          <option value="featured">Featured</option>
          <option value="discount">Best discount</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
      {brands && brands.length > 1 && onBrand ? (
        <label className="mg-search-sort">
          Brand
          <select value={brand ?? ''} onChange={(e) => onBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );

  if (layout === 'sidebar') {
    return (
      <aside className="wp-plp-filters" role="group" aria-label="Product filters">
        {body}
      </aside>
    );
  }

  return (
    <div className="mg-filter-bar" role="group" aria-label="Product filters">
      {body}
    </div>
  );
}
