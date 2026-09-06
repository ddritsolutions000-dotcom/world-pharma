'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchServiceability, type Serviceability } from './serviceability-api';

const STORAGE_KEY = 'wp_postal_code';

export function readStoredPostalCode(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function writeStoredPostalCode(value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, value.trim().slice(0, 12));
}

export function useServiceability(countryCode: string) {
  const [postalCode, setPostalCodeState] = useState('');
  const [serviceability, setServiceability] = useState<Serviceability | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPostalCodeState(readStoredPostalCode());
  }, []);

  const refresh = useCallback(
    async (postal: string) => {
      const trimmed = postal.trim();
      if (!trimmed || !countryCode.trim()) {
        setServiceability(null);
        return;
      }
      setLoading(true);
      try {
        const result = await fetchServiceability(countryCode, trimmed);
        if (result.ok && result.data) {
          setServiceability(result.data);
        } else {
          setServiceability(null);
        }
      } catch {
        setServiceability(null);
      } finally {
        setLoading(false);
      }
    },
    [countryCode],
  );

  useEffect(() => {
    void refresh(postalCode);
  }, [postalCode, refresh]);

  function setPostalCode(value: string) {
    const trimmed = value.trim().slice(0, 12);
    setPostalCodeState(trimmed);
    writeStoredPostalCode(trimmed);
  }

  return { postalCode, setPostalCode, serviceability, loading, refresh };
}
