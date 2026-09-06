import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';

export type CountryOption = {
  iso_alpha2: string;
  name?: string | { en?: string };
  default_currency?: string;
};

/** Storefront markets shared with web-customer (configuration set, not a silent India default). */
export const STORE_MARKET_CODES = ['IN', 'AE', 'US'] as const;

let persistedCountry: string | null = null;

export function isStoreMarket(iso: string | null | undefined): boolean {
  const code = iso?.trim().toUpperCase() ?? '';
  return (STORE_MARKET_CODES as readonly string[]).includes(code);
}

/** Returns a valid store market code, or null when none applies (no silent India default). */
export function clampStoreCountry(iso: string | null | undefined, fallback?: string | null): string | null {
  const code = iso?.trim().toUpperCase() ?? '';
  if (isStoreMarket(code)) {
    return code;
  }
  const fb = fallback?.trim().toUpperCase() ?? '';
  if (isStoreMarket(fb)) {
    return fb;
  }
  return null;
}

function countryName(option: CountryOption): string {
  if (typeof option.name === 'string' && option.name.trim()) {
    return option.name;
  }
  if (option.name && typeof option.name === 'object' && 'en' in option.name) {
    const en = (option.name as { en?: string }).en;
    if (en?.trim()) return en;
  }
  return option.iso_alpha2;
}

export function useSelectedCountry(): {
  country: string;
  countries: CountryOption[];
  setCountry: (iso: string) => void;
  countryName: string;
  loading: boolean;
  needsSelection: boolean;
} {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selected, setSelected] = useState<string | null>(clampStoreCountry(persistedCountry));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiCall<{ data: CountryOption[] }>('api/v1/countries').then((res) => {
      if (res.ok && res.data?.data) {
        const markets = res.data.data.filter((row) =>
          isStoreMarket(row.iso_alpha2?.toUpperCase?.() ?? ''),
        );
        setCountries(markets);
        if (!clampStoreCountry(persistedCountry) && markets[0]?.iso_alpha2) {
          const first = markets[0].iso_alpha2.toUpperCase();
          persistedCountry = first;
          setSelected(first);
        }
      }
      setLoading(false);
    });
  }, []);

  const country =
    selected && (countries.length === 0 || countries.some((c) => c.iso_alpha2 === selected))
      ? selected
      : '';
  const needsSelection = !loading && !country;

  const setCountry = useCallback((iso: string) => {
    const next = clampStoreCountry(iso);
    if (!next) {
      return;
    }
    persistedCountry = next;
    setSelected(next);
  }, []);

  const active = countries.find((c) => c.iso_alpha2 === country);

  return {
    country,
    countries,
    setCountry,
    countryName: active ? countryName(active) : country || 'Select market',
    loading,
    needsSelection,
  };
}
