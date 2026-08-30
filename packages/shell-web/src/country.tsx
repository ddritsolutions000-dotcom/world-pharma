'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@world-pharma/shell-core';

export interface CountryOption {
  iso_alpha2: string;
  name?: unknown;
}

export function useCountries(): { countries: CountryOption[]; error: boolean } {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/v1/countries')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('unavailable');
        }
        return res.json() as Promise<{ data?: CountryOption[] }>;
      })
      .then((body) => {
        if (!cancelled) {
          setCountries(body.data ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, error };
}
