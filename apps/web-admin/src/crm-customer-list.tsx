'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CrmApiError, listCrmCustomers, type CrmCustomerSummary } from './crm-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function CrmCustomerList() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<CrmCustomerSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listCrmCustomers(token, {
        country_code: countryCode,
        q: query.trim() || undefined,
      });
      setRows(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof CrmApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading' && rows.length === 0) {
    return <LoadingState label="Loading customers" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'network' && rows.length === 0) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>CRM — Customer lookup</Heading>
      <Text tone="secondary">
        Metadata-only Customer 360 lookup. No health timeline, lab values, imaging payloads, prescriptions,
        care-navigation narratives, or consent/break-glass clinical data. Operational commerce and support
        metadata only.
      </Text>

      <Card>
        <div className="wp-stack">
          <FormField label="Country code">
            {({ id }) => (
              <Input
                id={id}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                placeholder="XX"
              />
            )}
          </FormField>
          <FormField label="Search (email, order number, person id)">
            {({ id }) => (
              <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
            )}
          </FormField>
          <Button onClick={() => void load()}>Search</Button>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No customers found" description="Try another query or country code." />
      ) : (
        <Card>
          <ul className="wp-stack">
            {rows.map((row) => (
              <li key={row.person_id}>
                <Link href={`/crm/customers/${row.person_id}?country=${countryCode}`}>
                  {row.identifiers[0]?.masked_value ?? row.person_id}
                </Link>
                <Text tone="secondary"> — {row.status}</Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
