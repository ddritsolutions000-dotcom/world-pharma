'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  Select,
  TextArea,
} from '@world-pharma/ui-kit/web';
import { adminJson, AdminHttpError } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { presentCatalogList, type CatalogItemRow } from './catalog-admin-present';
import { MarketCountrySelect } from './market-country-select';
import { marketCountryPickerValue, requireMarketCountry } from './working-country';

type SubRow = { id?: string; name?: string; brand?: string; lowest_price?: number | null; currency?: string };
type Lookup = {
  original?: { name?: string; brand?: string; lowest_price?: number | null; currency?: string };
  substitutes?: SubRow[];
  total_substitutes?: number;
};
type EdgeRow = {
  id: string;
  from_item_id: string;
  to_item_id: string;
  from_item_name?: string;
  to_item_name?: string;
  relationship_type: string;
  strength: number;
  active: boolean;
  reason: string | null;
};

export function SubstitutesAdminPanel() {
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [tab, setTab] = useState<'lookup' | 'graph'>('graph');
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [itemId, setItemId] = useState('');
  const [toItemId, setToItemId] = useState('');
  const [country, setCountry] = useState(() => marketCountryPickerValue(session.countryCode));
  const [data, setData] = useState<Lookup | null>(null);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [relType, setRelType] = useState('GENERIC');
  const [reason, setReason] = useState('admin configured');

  useEffect(() => {
    if (!token) {
      return;
    }
    void adminJson<unknown>(token, '/api/v1/admin/catalog/items')
      .then((body) => {
        const rows = presentCatalogList(body).filter((row) => row.status === 'PUBLISHED');
        setItems(rows);
        setItemId((current) => current || rows[0]?.id || '');
        setToItemId((current) => current || rows[1]?.id || '');
      })
      .catch(() => undefined);
  }, [token]);

  const loadEdges = useCallback(async () => {
    if (!token || !country.trim()) {
      return;
    }
    try {
      const iso = requireMarketCountry(country);
      const params = new URLSearchParams({ country_code: iso });
      if (itemId.trim()) {
        params.set('from_item_id', itemId.trim());
      }
      const res = await adminJson<{ data?: EdgeRow[] }>(token, `/api/v1/admin/substitutes/edges?${params}`);
      setEdges(res.data ?? []);
    } catch (err) {
      setError(err instanceof AdminHttpError ? err.message : 'Could not load edges.');
    }
  }, [country, itemId, token]);

  useEffect(() => {
    if (tab === 'graph' && session.status === 'authenticated' && country.trim()) {
      void loadEdges();
    }
  }, [country, loadEdges, session.status, tab]);

  async function lookup() {
    if (!token || !itemId.trim() || !country.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const iso = requireMarketCountry(country);
      const res = await adminJson<Lookup>(
        token,
        `/api/v1/admin/substitutes?item_id=${encodeURIComponent(itemId.trim())}&country_code=${iso}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof AdminHttpError ? err.message : 'Lookup failed.');
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  async function addEdge() {
    if (!token || !country.trim() || !itemId.trim() || !toItemId.trim()) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const iso = requireMarketCountry(country);
      await adminJson(token, `/api/v1/admin/substitutes/edges?country_code=${iso}`, {
        method: 'POST',
        body: JSON.stringify({
          from_item_id: itemId.trim(),
          to_item_id: toItemId.trim(),
          relationship_type: relType,
          reason: reason.trim(),
          strength: 100,
        }),
      });
      setMessage('Substitute relationship added.');
      await loadEdges();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Add failed.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEdge(edgeId: string) {
    if (!token) {
      return;
    }
    setBusy(true);
    try {
      await adminJson(token, `/api/v1/admin/substitutes/edges/${edgeId}/remove`, { method: 'POST', body: '{}' });
      setMessage('Relationship removed.');
      await loadEdges();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  }

  const formatPrice = (row: SubRow) =>
    row.lowest_price != null ? `${row.currency ?? ''} ${row.lowest_price}`.trim() : '—';

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  const rows = data?.substitutes ?? [];

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Medicine substitutes</Heading>
        <p className="wp-page-intro">
          Configure substitute relationships per country. Lookup merges configured edges with catalog heuristics.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect ariaLabel="Substitute country" value={country} onChange={setCountry} />
        <Button variant={tab === 'graph' ? 'primary' : 'secondary'} onClick={() => setTab('graph')}>
          Graph
        </Button>
        <Button variant={tab === 'lookup' ? 'primary' : 'secondary'} onClick={() => setTab('lookup')}>
          Lookup
        </Button>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {error ? <p className="wp-text-muted">{error}</p> : null}

      {tab === 'graph' ? (
        <Card>
          <Heading level={3}>Add relationship</Heading>
          <div className="wp-admin-grid-2">
            <FormField label="From item">
              {({ id }) => (
                <Select id={id} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="To substitute">
              {({ id }) => (
                <Select id={id} value={toItemId} onChange={(e) => setToItemId(e.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Type">
              {({ id }) => (
                <Select id={id} value={relType} onChange={(e) => setRelType(e.target.value)}>
                  <option value="GENERIC">GENERIC</option>
                  <option value="THERAPEUTIC">THERAPEUTIC</option>
                  <option value="BRAND">BRAND</option>
                </Select>
              )}
            </FormField>
            <FormField label="Reason">
              {({ id }) => (
                <TextArea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </FormField>
          </div>
          <Button disabled={busy || !country.trim() || itemId === toItemId} onClick={() => void addEdge()}>
            Add edge
          </Button>
          {edges.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>Active</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map((edge) => (
                    <tr key={edge.id}>
                      <td>{edge.from_item_name ?? edge.from_item_id.slice(0, 8)}</td>
                      <td>{edge.to_item_name ?? edge.to_item_id.slice(0, 8)}</td>
                      <td>{edge.relationship_type}</td>
                      <td>{edge.active ? 'Yes' : 'No'}</td>
                      <td>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void removeEdge(edge.id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No configured edges" description="Add substitute relationships for this country." />
          )}
        </Card>
      ) : (
        <>
          <div className="wp-toolbar">
            <FormField label="Catalog item">
              {({ id }) => (
                <Select id={id} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button onClick={() => void lookup()} disabled={busy || !itemId.trim() || !country.trim()}>
              {busy ? 'Looking up…' : 'Find substitutes'}
            </Button>
          </div>
          {data?.original ? (
            <Card>
              <h2 className="wp-section-title">{data.original.name ?? 'Original'}</h2>
              <p className="wp-list-meta">
                {data.original.brand ?? '—'} · {formatPrice(data.original as SubRow)} · {data.total_substitutes ?? 0}{' '}
                substitute(s)
              </p>
            </Card>
          ) : null}
          {rows.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Brand</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id ?? `sub-${index}`}>
                      <td>{row.name ?? '—'}</td>
                      <td>{row.brand ?? '—'}</td>
                      <td>{formatPrice(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : data ? (
            <EmptyState title="No substitutes" description="No alternatives found for this item." />
          ) : null}
        </>
      )}
    </section>
  );
}
