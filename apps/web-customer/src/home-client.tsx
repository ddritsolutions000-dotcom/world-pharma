'use client';

import { useEffect, useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { readApiHealth, useCountries } from '@world-pharma/shell-web';
import { CustomerShell } from './customer-shell';

export function HomeClient() {
  const { countries, error } = useCountries();
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  const [joinPublic, setJoinPublic] = useState(false);

  useEffect(() => {
    void readApiHealth().then((result) => setApiReachable(result.ok));
  }, []);

  useEffect(() => {
    const code = countries[0]?.iso_alpha2 ?? 'XX';
    if (!code) {
      return;
    }
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    void fetch(`${base}/api/v1/join/public?country=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((body) => setJoinPublic(Boolean(body.public)))
      .catch(() => setJoinPublic(false));
  }, [countries]);

  const countryLabel =
    countries[0]?.iso_alpha2 ?? (error ? 'unavailable' : 'not selected');

  return (
    <CustomerShell
      apiReachable={apiReachable}
      countryLabel={countryLabel}
      joinPublic={joinPublic}
    />
  );
}
