'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { Button, Card, EmptyState, Heading, LoadingState} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { MarketCountrySelect } from './market-country-select';
import { workingCountry } from './working-country';

type ProgramRow = { id: string; name: string; description?: string };
type VaxRow = { id: string; name: string; price?: number; available_for_home?: boolean };

export function SpecialityCareAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [country, setCountry] = useState(() => workingCountry(session.countryCode));
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [vax, setVax] = useState<VaxRow[]>([]);
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
    const q = encodeURIComponent(country);
    const headers = adminAuthHeaders(token);
    const [pRes, vRes] = await Promise.all([
      fetch(`${adminApiRoot()}/api/v1/admin/speciality-care/programs?country_code=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/speciality-care/vaccinations?country_code=${q}`, { headers }),
    ]);
    setLoading(false);
    if (pRes.status === 403) {
      setDenied(true);
      return;
    }
    if (!pRes.ok) {
      setError(true);
      return;
    }
    const pBody = (await pRes.json()) as { programs?: ProgramRow[] };
    setPrograms(pBody.programs ?? []);
    if (vRes.ok) {
      const vBody = (await vRes.json()) as { vaccinations?: VaxRow[]; data?: VaxRow[] };
      setVax(vBody.vaccinations ?? vBody.data ?? []);
    }
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
        <Heading level={1}>Speciality care</Heading>
        <p className="wp-page-intro">
          Cancer, obesity, chronic, and vaccination programs (1mg-shaped). Sandbox catalog — not hospital EMR. Requires
          doctor:review.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect ariaLabel="Speciality country" value={country} onChange={setCountry} />
        <Button onClick={() => void load()} disabled={loading}>
          Load
        </Button>
      </div>
      {loading && programs.length === 0 ? <LoadingState label="Loading programs" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires doctor:review." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {programs.length ? (
        <Card>
          <h2 className="wp-section-title">Programs</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {vax.length ? (
        <Card>
          <h2 className="wp-section-title">Vaccinations</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Vaccine</th>
                  <th>Price</th>
                  <th>Home</th>
                </tr>
              </thead>
              <tbody>
                {vax.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      {row.price != null
                        ? `Sandbox list ${Number(row.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td>{row.available_for_home ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
