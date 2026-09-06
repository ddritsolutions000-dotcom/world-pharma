'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCountries, type CountryOption } from '@world-pharma/shell-web';

const STORAGE_KEY = 'wp_country_iso';
const COUNTRY_CHANGED_EVENT = 'wp-country-changed';

export const STORE_MARKET_CODES = ['IN', 'AE', 'US'] as const;

const FALLBACK_MARKETS: CountryOption[] = [
  { iso_alpha2: 'IN', name: 'India' },
  { iso_alpha2: 'AE', name: 'United Arab Emirates' },
  { iso_alpha2: 'US', name: 'United States' },
];

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

export function countryDisplayName(country: CountryOption): string {
  if (typeof country.name === 'string' && country.name.trim()) {
    return country.name;
  }
  if (country.name && typeof country.name === 'object' && 'en' in country.name) {
    const en = (country.name as { en?: string }).en;
    if (en?.trim()) return en;
  }
  return country.iso_alpha2;
}

export function countryFlagEmoji(iso: string): string {
  const code = iso.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code) || code === 'XX') {
    return '🌍';
  }
  const a = code.codePointAt(0);
  const b = code.codePointAt(1);
  if (a == null || b == null) return '🌍';
  return String.fromCodePoint(127397 + a, 127397 + b);
}

function asMarket(row: CountryOption): { iso_alpha2: string; name: string } {
  return { iso_alpha2: row.iso_alpha2.toUpperCase(), name: countryDisplayName(row) };
}

export function useSelectedCountry(): {
  country: string;
  countries: CountryOption[];
  setCountry: (iso: string) => void;
  countryName: string;
  loading: boolean;
  needsSelection: boolean;
  hydrated: boolean;
  /** True only after localStorage hydrate and a valid store market is selected. */
  ready: boolean;
} {
  const { countries: apiCountries, error } = useCountries();
  // Keep SSR and first client paint identical — never read localStorage during render.
  const [selected, setSelected] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const countries = useMemo(() => {
    const source = apiCountries.filter((row) => isStoreMarket(row.iso_alpha2));
    const rows = (source.length ? source : FALLBACK_MARKETS).map(asMarket);
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.iso_alpha2)) {
        return false;
      }
      seen.add(row.iso_alpha2);
      return true;
    });
  }, [apiCountries]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const clamped = clampStoreCountry(saved);
      if (saved && !clamped) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      setSelected(clamped);
      setHydrated(true);
    };
    read();
    const onCountryChanged = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const next = clampStoreCountry(
        typeof detail === 'string' ? detail : window.localStorage.getItem(STORAGE_KEY),
      );
      setSelected(next);
      setHydrated(true);
    };
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryChanged);
    window.addEventListener('storage', onCountryChanged);
    return () => {
      window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryChanged);
      window.removeEventListener('storage', onCountryChanged);
    };
  }, []);

  const country = selected && isStoreMarket(selected) ? selected : '';
  const needsSelection = hydrated && !country;
  const ready = hydrated && isStoreMarket(country);

  const setCountry = useCallback((iso: string) => {
    const next = clampStoreCountry(iso);
    if (!next) return;
    setSelected(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(COUNTRY_CHANGED_EVENT, { detail: next }));
    }
  }, []);

  const active = countries.find((c) => c.iso_alpha2 === country);
  const countryName = active ? countryDisplayName(active) : country || 'Select market';

  return {
    country,
    countries,
    setCountry,
    countryName,
    loading: !hydrated || (!error && apiCountries.length === 0 && countries.length === 0),
    needsSelection,
    hydrated,
    ready,
  };
}
