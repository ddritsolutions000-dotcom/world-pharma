'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { adminApiRoot, adminAuthHeaders, classifyAdminViewState } from './admin-http';
import { presentCatalogList, type CatalogItemRow } from './catalog-admin-present';
import {
  AnalyticsApiError,
  fetchAnalyticsCommerce,
  type AnalyticsCommerceResponse,
} from './analytics-api';
import { formatCount, formatMetricDate } from './analytics-format';
import { AnalyticsScopeBar } from './analytics-scope';
import { BarChart } from './admin-charts';
import { workingCountry } from './working-country';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  ErrorState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error' | 'empty';

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 29);
  return end.toISOString().slice(0, 10);
}

export function AnalyticsCommerce() {
  const { getAccessToken, session } = useSession();
  const canRead = session.permissions.includes('analytics:read');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [catalogItemId, setCatalogItemId] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItemRow[]>([]);
  const [data, setData] = useState<AnalyticsCommerceResponse | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    if (!canRead) {
      setViewState('forbidden');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      setData(null);
      setErrorMessage('Select a sandbox market (IN, AE, or US). Analytics is country-scoped and does not assume a default.');
      setViewState('error');
      return;
    }
    setErrorMessage('');
    setViewState('loading');
    try {
      const body = await fetchAnalyticsCommerce(token, {
        countryCode,
        from,
        to,
        catalogItemId: catalogItemId.trim() || undefined,
      });
      setData(body);
      setViewState(body.items.length > 0 ? 'idle' : 'empty');
    } catch (err) {
      setData(null);
      if (err instanceof AnalyticsApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setErrorMessage(err instanceof AnalyticsApiError ? err.message : 'request_failed');
      setViewState(classifyAdminViewState(err));
    }
  }, [canRead, catalogItemId, countryCode, from, getAccessToken, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    void fetch(`${adminApiRoot()}/api/v1/admin/catalog/items`, {
      headers: adminAuthHeaders(token),
    }).then(async (res) => {
      if (!res.ok) {
        return;
      }
      setCatalogItems(presentCatalogList(await res.json()));
    });
  }, [getAccessToken]);

  if (!canRead) {
    return <PermissionDeniedState />;
  }
  if (viewState === 'loading' && !data) {
    return <LoadingState label="Loading commerce analytics" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if ((viewState === 'network' || viewState === 'error') && !data) {
    return (
      <ErrorState
        description={errorMessage || 'Check your network and retry.'}
        action={{ label: 'Retry', onClick: () => void load() }}
      />
    );
  }

  return (
    <div className="wp-stack">
      <AnalyticsScopeBar
        countryCode={countryCode}
        from={from}
        to={to}
        onCountryCodeChange={setCountryCode}
        onFromChange={setFrom}
        onToChange={setTo}
        onRefresh={() => void load()}
      />

      <Card>
        <FormField label="Catalog item (optional)" hint="Filter funnel metrics to one SKU">
          {({ id }) => (
            <Select id={id} value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)}>
              <option value="">All items</option>
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} {item.sku ? `(${item.sku})` : ''}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()}>Apply filter</Button>
      </Card>

      {viewState === 'empty' ? (
        <EmptyState
          title="No commerce metrics"
          description="Product funnel rollups are empty for this scope. Views, add-to-cart, and purchases appear after ingest."
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Card>
            <Heading level={2}>Funnel mix</Heading>
            <BarChart
              rows={[
                {
                  label: 'Views',
                  value: data.items.reduce((sum, row) => sum + row.view_count, 0),
                },
                {
                  label: 'Add to cart',
                  value: data.items.reduce((sum, row) => sum + row.add_to_cart_count, 0),
                },
                {
                  label: 'Purchases',
                  value: data.items.reduce((sum, row) => sum + row.purchase_count, 0),
                },
              ]}
            />
          </Card>
        <Card>
          <Heading level={2}>Product funnel ({data.country_code})</Heading>
          <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <caption className="sr-only">Commerce analytics for {data.country_code}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Catalog item</th>
                <th scope="col">Views</th>
                <th scope="col">Add to cart</th>
                <th scope="col">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={`${row.metric_date}-${row.catalog_item_id}`}>
                  <td>{formatMetricDate(row.metric_date)}</td>
                  <td>
                    <code>{row.catalog_item_id}</code>
                  </td>
                  <td>{formatCount(row.view_count)}</td>
                  <td>{formatCount(row.add_to_cart_count)}</td>
                  <td>{formatCount(row.purchase_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
        </>
      ) : null}
    </div>
  );
}
