'use client';

import { useCallback, useEffect, useState } from 'react';
import { classifyAdminViewState } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  ErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  AnalyticsApiError,
  fetchAnalyticsOverview,
  type AnalyticsOverviewResponse,
} from './analytics-api';
import { formatCount, formatMetricDate, formatMinorUnits } from './analytics-format';
import { AnalyticsScopeBar } from './analytics-scope';
import { BarChart, Sparkline } from './admin-charts';
import { workingCountry } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error' | 'empty';

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 29);
  return end.toISOString().slice(0, 10);
}

const KPI_LABELS: Array<{ key: keyof AnalyticsOverviewResponse['totals']; label: string; format?: 'minor' }> = [
  { key: 'order_paid_count', label: 'Orders paid' },
  { key: 'order_gmv_minor', label: 'GMV (minor units)', format: 'minor' },
  { key: 'checkout_started_count', label: 'Checkouts started' },
  { key: 'cart_abandoned_count', label: 'Carts abandoned' },
  { key: 'product_view_count', label: 'Product views' },
  { key: 'affiliate_click_count', label: 'Affiliate clicks' },
  { key: 'appointment_completed_count', label: 'Appointments completed' },
  { key: 'lab_booking_completed_count', label: 'Lab bookings completed' },
  { key: 'imaging_booking_completed_count', label: 'Imaging bookings completed' },
];

export function AnalyticsOverview() {
  const { getAccessToken, session } = useSession();
  const canRead = session.permissions.includes('analytics:read');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
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
      const body = await fetchAnalyticsOverview(token, { countryCode, from, to });
      setData(body);
      const hasTotals = Object.values(body.totals).some((value) => {
        if (typeof value === 'string') {
          return BigInt(value || '0') > 0n;
        }
        return value > 0;
      });
      setViewState(hasTotals || body.daily.length > 0 ? 'idle' : 'empty');
    } catch (err) {
      setData(null);
      if (err instanceof AnalyticsApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setErrorMessage(err instanceof AnalyticsApiError ? err.message : 'request_failed');
      setViewState(classifyAdminViewState(err));
    }
  }, [canRead, countryCode, from, getAccessToken, to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canRead) {
    return <PermissionDeniedState />;
  }
  if (viewState === 'loading' && !data) {
    return <LoadingState label="Loading analytics overview" />;
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

      {viewState === 'empty' ? (
        <EmptyState
          title="No overview metrics"
          description="Rollups are empty for this country and date range. Data appears after R13-E ingest runs."
        />
      ) : null}

      {data ? (
        <>
          <Card>
            <Heading level={2}>Totals ({data.country_code})</Heading>
            <dl className="wp-kpi-grid">
              {KPI_LABELS.map((kpi) => (
                <div key={kpi.key}>
                  <dt>
                    <Text tone="secondary">{kpi.label}</Text>
                  </dt>
                  <dd>
                    {kpi.format === 'minor'
                      ? formatMinorUnits(String(data.totals[kpi.key]))
                      : formatCount(Number(data.totals[kpi.key]))}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="wp-chart-grid">
            <Card>
              <Heading level={2}>Paid order trend</Heading>
              <Sparkline
                label="Daily paid orders"
                values={data.daily.map((row) => row.order_paid_count)}
              />
            </Card>
            <Card>
              <Heading level={2}>Product views</Heading>
              <Sparkline
                label="Daily product views"
                values={data.daily.map((row) => row.product_view_count)}
              />
            </Card>
            <Card>
              <Heading level={2}>Funnel</Heading>
              <BarChart
                rows={[
                  { label: 'Views', value: data.totals.product_view_count },
                  { label: 'Checkouts', value: data.totals.checkout_started_count },
                  { label: 'Paid', value: data.totals.order_paid_count },
                  { label: 'Abandoned', value: data.totals.cart_abandoned_count },
                ]}
              />
            </Card>
            <Card>
              <Heading level={2}>Care volume</Heading>
              <BarChart
                rows={[
                  { label: 'Appointments', value: data.totals.appointment_completed_count },
                  { label: 'Labs', value: data.totals.lab_booking_completed_count },
                  { label: 'Imaging', value: data.totals.imaging_booking_completed_count },
                ]}
              />
            </Card>
          </div>

          <Card>
            <Heading level={2}>Daily series</Heading>
            {data.daily.length === 0 ? (
              <Text tone="secondary">No daily rows in range.</Text>
            ) : (
              <div className="wp-admin-table-wrap">
            <table className="wp-table">
                <caption className="sr-only">Daily analytics overview for {data.country_code}</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Orders</th>
                    <th scope="col">GMV (minor)</th>
                    <th scope="col">Checkouts</th>
                    <th scope="col">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((row) => (
                    <tr key={row.metric_date}>
                      <td>{formatMetricDate(row.metric_date)}</td>
                      <td>{formatCount(row.order_paid_count)}</td>
                      <td>{formatMinorUnits(row.order_gmv_minor)}</td>
                      <td>{formatCount(row.checkout_started_count)}</td>
                      <td>{formatCount(row.product_view_count)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
