'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, LoadingState, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';
import { CrmApiError, evaluateCrmAutomation, listCrmAutomationRuns } from './crm-api';
import { workingCountry } from './working-country';

export function CrmAutomationDesk() {
  const { getAccessToken, session } = useSession();
  const country = workingCountry(session.countryCode);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCrmAutomationRuns>>['data']>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const canWrite = session.permissions.includes('crm:write');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const body = await listCrmAutomationRuns(token, country);
      setRows(body.data ?? []);
    } catch (err) {
      if (err instanceof CrmApiError && err.status === 403) {
        setRows([]);
      } else {
        setLoadError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [country, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session.permissions.includes('crm:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0 && !loadError) {
    return <LoadingState label="Loading CRM automations" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>CRM automations</Heading>
        <p className="wp-page-intro">
          Refill reminders and abandoned-cart recovery runs for {country}. No PHI in this list. Evaluate queues the
          existing scheduler — it does not send live marketing email.
        </p>
      </header>
      <div className="wp-toolbar">
        <Link href="/crm">
          <Button variant="secondary">Customer lookup</Button>
        </Link>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
        {canWrite ? (
          <Button
            onClick={() => {
              const token = getAccessToken();
              if (!token) {
                return;
              }
              setMessage('');
              void evaluateCrmAutomation(token, country)
                .then(() => {
                  setMessage('Evaluate queued.');
                  return load();
                })
                .catch((err) => {
                  setMessage(err instanceof CrmApiError ? err.message : 'Evaluate failed');
                });
            }}
          >
            Run evaluate
          </Button>
        ) : null}
      </div>
      {loadError ? <AdminRequestError error={loadError} onRetry={() => void load()} /> : null}
      {message ? <Text tone="secondary">{message}</Text> : null}
      {rows.length === 0 ? (
        <EmptyState title="No automation runs" description="Runs appear after checkout abandon or refill hooks fire, or after Evaluate." />
      ) : (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Person</th>
                  <th>Skip</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.automation_kind}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <code>{row.person_id.slice(0, 8)}</code>
                    </td>
                    <td>{row.skip_reason ?? '—'}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
