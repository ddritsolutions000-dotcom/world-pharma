'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';
import { CrmApiError, listCrmCustomers, type CrmCustomerSummary } from './crm-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function CrmCustomerList() {
  const { getAccessToken, session } = useSession();
  const [rows, setRows] = useState<CrmCustomerSummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (!countryCode) {
      setRows([]);
      setViewState('idle');
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
      setViewState(classifyAdminViewState(err));
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

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>CRM — Customer lookup</Heading>
        <p className="wp-page-intro">
          Lookup customers by email or order number. Commerce and support metadata only — no health timeline.
        </p>
      </header>

      <div className="wp-toolbar">
        <FormField label="Country" hint="CRM requires an explicit market scope">
          {({ id }) => (
            <Select id={id} value={countryCode} onChange={(e) => setCountryCode(workingCountry(e.target.value))}>
              <option value="">Select market…</option>
              {MARKET_COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Search (email, order number, person id)">
          {({ id }) => (
            <Input
              id={id}
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setQuery(draftQuery);
                }
              }}
            />
          )}
        </FormField>
        <Link href="/crm/automation">
          <Button variant="secondary">Automations</Button>
        </Link>
        <Button onClick={() => setQuery(draftQuery)}>Search</Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {!countryCode ? (
        <EmptyState
          title="Select a market"
          description="CRM is country-scoped. Choose IN, AE, or US — global mode does not load customer rows."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No customers found" description="Try another query or country." />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.person_id}>
                  <td>{row.identifiers[0]?.masked_value ?? row.person_id.slice(0, 8)}</td>
                  <td>
                    <span className="wp-status">{row.status}</span>
                  </td>
                  <td>
                    <Link href={`/crm/customers/${row.person_id}?country=${countryCode}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
