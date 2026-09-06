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
  fetchAnalyticsMarketing,
  type AnalyticsMarketingResponse,
} from './analytics-api';
import { formatCount, formatMetricDate } from './analytics-format';
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

export function AnalyticsMarketingView() {
  const { getAccessToken, session } = useSession();
  const canRead = session.permissions.includes('analytics:read');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [data, setData] = useState<AnalyticsMarketingResponse | null>(null);
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
      const body = await fetchAnalyticsMarketing(token, { countryCode, from, to });
      setData(body);
      const hasData = body.daily.some(
        (row) => row.campaign_send_count > 0 || row.marketing_opt_in_count > 0,
      );
      setViewState(hasData ? 'idle' : 'empty');
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
    return <LoadingState label="Loading marketing analytics" />;
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
          title="No marketing metrics"
          description="Campaign send and opt-in rollups are empty for this scope."
        />
      ) : null}

      {data && data.daily.length > 0 ? (
        <>
          <div className="wp-chart-grid">
            <Card>
              <Heading level={2}>Campaign sends</Heading>
              <Sparkline label="Daily campaign sends" values={data.daily.map((row) => row.campaign_send_count)} />
            </Card>
            <Card>
              <Heading level={2}>Opt-ins vs sends</Heading>
              <BarChart
                rows={[
                  {
                    label: 'Sends',
                    value: data.daily.reduce((sum, row) => sum + row.campaign_send_count, 0),
                  },
                  {
                    label: 'Opt-ins',
                    value: data.daily.reduce((sum, row) => sum + row.marketing_opt_in_count, 0),
                  },
                ]}
              />
            </Card>
          </div>
        <Card>
          <Heading level={2}>Marketing rollups ({data.country_code})</Heading>
          <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <caption className="sr-only">Marketing analytics for {data.country_code}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Campaign sends</th>
                <th scope="col">Marketing opt-ins</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((row) => (
                <tr key={row.metric_date}>
                  <td>{formatMetricDate(row.metric_date)}</td>
                  <td>{formatCount(row.campaign_send_count)}</td>
                  <td>{formatCount(row.marketing_opt_in_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
        </>
      ) : data ? (
        <Text tone="secondary">No daily marketing rows in range.</Text>
      ) : null}
    </div>
  );
}
