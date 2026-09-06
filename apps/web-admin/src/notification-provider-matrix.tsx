'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Select,
  Switch,
  Text,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { MarketCountrySelect } from './market-country-select';
import { marketCountryPickerValue } from './working-country';

type ProviderRow = {
  id: string;
  country_code: string;
  channel: string;
  provider_code: string;
  provider_name: string;
  role: string;
  environment: string;
  active: boolean;
  config_status: string;
  secret_ref_configured: boolean;
  priority: number;
  effective_status: string;
  live: boolean;
  sandbox: boolean;
};

type MatrixChannel = {
  channel: string;
  providers: ProviderRow[];
  primary: ProviderRow | null;
  fallback: ProviderRow | null;
};

export function NotificationProviderMatrixPanel() {
  const { getAccessToken, session } = useSession();
  const [country, setCountry] = useState(() => marketCountryPickerValue(session.countryCode));
  const [matrix, setMatrix] = useState<MatrixChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSend = session.permissions?.includes('campaign:send');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !country.trim()) {
      return;
    }
    setLoading(true);
    setError(false);
    const res = await fetch(
      `${adminApiRoot()}/api/v1/admin/notifications/providers/matrix?country_code=${encodeURIComponent(country)}`,
      { headers: adminAuthHeaders(token), credentials: 'include' },
    );
    setLoading(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    const body = (await res.json()) as { channels?: MatrixChannel[] };
    setMatrix(body.channels ?? []);
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && country.trim()) {
      void load();
    }
  }, [country, load, session.status]);

  async function patchProvider(id: string, patch: Record<string, unknown>) {
    const token = getAccessToken();
    if (!token || !canSend) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/notifications/providers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Update failed.');
      return;
    }
    setMessage('Provider configuration saved.');
    await load();
  }

  if (!country.trim()) {
    return (
      <Card>
        <Heading level={2}>Country provider matrix</Heading>
        <MarketCountrySelect value={country} onChange={setCountry} label="Country scope" />
        <EmptyState title="Select a country" description="Choose a market country to view notification providers." />
      </Card>
    );
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={2}>Country provider matrix</Heading>
        <Text tone="secondary">
          Configure SMS, email, push, in-app, and WhatsApp providers per country. Live delivery requires verified credentials —
          sandbox/console adapters stay explicitly marked.
        </Text>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect value={country} onChange={setCountry} label="Country" />
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {message ? <Text tone="secondary">{message}</Text> : null}
      {loading && matrix.length === 0 ? <LoadingState label="Loading provider matrix" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {matrix.length === 0 && !loading && !error ? (
        <EmptyState title="No providers" description="Seed providers appear after API startup for active countries." />
      ) : null}
      {matrix.map((channelRow) => (
        <Card key={channelRow.channel}>
          <div className="wp-toolbar">
            <Heading level={3}>{channelRow.channel}</Heading>
            {channelRow.primary ? (
              <Badge kind={channelRow.primary.live ? 'success' : 'info'}>
                Primary: {channelRow.primary.effective_status}
              </Badge>
            ) : (
              <Badge kind="warning">No active primary</Badge>
            )}
          </div>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Environment</th>
                  <th>Configured</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {channelRow.providers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.provider_name}</strong>
                      <Text size="caption" tone="secondary">
                        {row.provider_code}
                      </Text>
                    </td>
                    <td>{row.role}</td>
                    <td>
                      <Badge kind={row.effective_status === 'live' ? 'success' : row.effective_status === 'sandbox' ? 'info' : 'warning'}>
                        {row.config_status} · {row.effective_status}
                      </Badge>
                    </td>
                    <td>{row.environment}</td>
                    <td>{row.secret_ref_configured || row.channel === 'IN_APP' ? 'Yes' : 'No'}</td>
                    <td>
                      {canSend ? (
                        <Switch
                          label=""
                          checked={row.active}
                          onCheckedChange={(checked) => void patchProvider(row.id, { active: checked })}
                        />
                      ) : (
                        row.active ? 'Yes' : 'No'
                      )}
                    </td>
                    <td>
                      {canSend ? (
                        <FormField label="Config">
                          {({ id }) => (
                            <Select
                              id={id}
                              aria-label="Configuration status"
                              value={row.config_status}
                              onChange={(event) =>
                                void patchProvider(row.id, { config_status: event.target.value })
                              }
                            >
                              <option value="UNCONFIGURED">Unconfigured</option>
                              <option value="SANDBOX">Sandbox</option>
                              <option value="VERIFIED">Verified</option>
                            </Select>
                          )}
                        </FormField>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </section>
  );
}
