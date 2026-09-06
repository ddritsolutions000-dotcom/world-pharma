'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { Button, Card, EmptyState, Heading, LoadingState} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { MarketCountrySelect } from './market-country-select';
import { workingCountry } from './working-country';

type ProgramRow = {
  id: string;
  name: string;
  tier?: string;
  description?: string;
};

export function CorporateWellnessAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [country, setCountry] = useState(() => workingCountry(session.countryCode));
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    const res = await fetch(
      `${adminApiRoot()}/api/v1/admin/corporate-wellness/programs?country_code=${encodeURIComponent(country)}`,
      { headers: adminAuthHeaders(token) },
    );
    setLoading(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError(true);
      return;
    }
    const body = (await res.json()) as { programs?: ProgramRow[] };
    setRows(body.programs ?? []);
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Corporate wellness</Heading>
        <p className="wp-page-intro">
          B2B employee health programs (1mg-shaped). Sandbox catalog — not a live TPA or insurance network. Requires
          partner:manage.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect ariaLabel="Corporate country" value={country} onChange={setCountry} />
        <Button onClick={() => void load()} disabled={loading}>
          Load
        </Button>
      </div>
      {loading && rows.length === 0 ? <LoadingState label="Loading programs" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires partner:manage." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {rows.length ? (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Tier</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.tier ?? '—'}</td>
                    <td>{row.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : !loading && !denied && !error ? (
        <EmptyState title="No programs" description="No corporate catalog for this country." />
      ) : null}
    </section>
  );
}
