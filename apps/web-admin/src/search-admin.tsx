'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentCatalogList, type CatalogItemRow } from './catalog-admin-present';
import { presentSearchJobs, type SearchJobRow } from './search-admin-present';
import { MARKET_COUNTRY_CODES, workingCountry } from './working-country';

const KINDS = [
  'catalog',
  'provider_doctors',
  'provider_labs',
  'provider_tests',
  'provider_pharmacies',
  'providers',
  'clinical',
] as const;

export function SearchAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [jobs, setJobs] = useState<SearchJobRow[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItemRow[]>([]);
  const [country, setCountry] = useState(() => workingCountry(session.countryCode));
  const [kind, setKind] = useState<(typeof KINDS)[number]>('catalog');
  const [itemId, setItemId] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(false);
    setDenied(false);
    const res = await fetch(
      `${adminApiRoot()}/api/v1/admin/search/jobs?country_code=${encodeURIComponent(country)}`,
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
    setJobs(presentSearchJobs(await res.json()));
  }, [country, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadJobs();
    }
  }, [loadJobs, session.audience, session.status]);

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

  useEffect(() => {
    const ids = Array.from(
      new Set(
        jobs
          .filter((job) => job.index_kind.toLowerCase().includes('clinical') && job.source_id)
          .map((job) => job.source_id),
      ),
    );
    if (kind === 'clinical') {
      setArtifactId((current) => current || ids[0] || '');
    }
  }, [jobs, kind]);

  async function reindex() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const payload: Record<string, unknown> = { country_code: country, index_kind: kind, force: true };
    if (kind === 'catalog' && itemId.trim()) {
      payload.item_id = itemId.trim();
    }
    if (kind === 'clinical') {
      payload.artifact_id = artifactId.trim();
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/search/reindex`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Reindex failed.');
      return;
    }
    setMessage('Reindex scheduled.');
    await loadJobs();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }
  if (denied) {
    return <PermissionDeniedState />;
  }

  const clinicalArtifacts = Array.from(
    new Set(
      jobs
        .filter((job) => job.index_kind.toLowerCase().includes('clinical') && job.source_id)
        .map((job) => job.source_id),
    ),
  );

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Search index</Heading>
        <p className="wp-page-intro">
          Jobs and reindex from `/admin/search`. Customer search still reads the same index — this does not change live
          ranking models.
        </p>
      </header>
      <Card>
        <div className="wp-toolbar">
          <FormField label="Country">
            {({ id }) => (
              <Select
                id={id}
                aria-label="Reindex country"
                value={workingCountry(country)}
                onChange={(e) => setCountry(workingCountry(e.target.value))}
              >
                {MARKET_COUNTRY_CODES.map((iso) => (
                  <option key={iso} value={iso}>
                    {iso}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Index kind">
            {({ id }) => (
              <Select
                id={id}
                aria-label="Index kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
              >
                {KINDS.map((row) => (
                  <option key={row} value={row}>
                    {row}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {kind === 'catalog' ? (
            <FormField label="Catalog item (optional)">
              {({ id }) => (
                <Select
                  id={id}
                  aria-label="Catalog item id"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                >
                  <option value="">All catalog items</option>
                  {catalogItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} {item.sku ? `(${item.sku})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : null}
          {kind === 'clinical' ? (
            <FormField label="Clinical artifact">
              {({ id }) =>
                clinicalArtifacts.length ? (
                  <Select
                    id={id}
                    aria-label="Clinical artifact id"
                    value={artifactId}
                    onChange={(e) => setArtifactId(e.target.value)}
                  >
                    {clinicalArtifacts.map((aid) => (
                      <option key={aid} value={aid}>
                        {aid.slice(0, 8)}…
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={id}
                    aria-label="Clinical artifact id"
                    value={artifactId}
                    onChange={(e) => setArtifactId(e.target.value)}
                  />
                )
              }
            </FormField>
          ) : null}
          <Button onClick={() => void reindex()} disabled={busy || (kind === 'clinical' && !artifactId.trim())}>
            Reindex
          </Button>
          <Button variant="secondary" onClick={() => void loadJobs()} disabled={loading}>
            Refresh jobs
          </Button>
        </div>
        {message ? <p className="wp-text-muted">{message}</p> : null}
      </Card>
      {loading && jobs.length === 0 ? <LoadingState label="Loading search jobs" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void loadJobs()} /> : null}
      {jobs.length ? (
        <Card>
          <h2 className="wp-section-title">{jobs.length} job(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Attempts</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.index_kind}</td>
                    <td>
                      <span className="wp-status">{job.status}</span>
                    </td>
                    <td>{job.source_type}</td>
                    <td>{job.attempts}</td>
                    <td>{job.last_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {!loading && !error && jobs.length === 0 ? (
        <EmptyState title="No jobs yet" description="Need search:admin. Sandbox-admin should have it after OTP login." />
      ) : null}
    </section>
  );
}
