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
  Select,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  presentLocations,
  presentLots,
  presentReceipts,
  presentTransfers,
  type InventoryLocationRow,
  type InventoryLotRow,
  type InventoryReceiptRow,
  type InventoryTransferRow,
} from './inventory-admin-present';
import { presentCatalogList } from './catalog-admin-present';
import { presentOrgPicks, type OrgPickRow } from './eligibility-admin-present';

function idempotencyKey(prefix: string): string {
  return `${prefix}:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
}

async function readDetail(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
  return body.detail ?? body.title ?? `Request failed (${res.status})`;
}

export function InventoryAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [orgId, setOrgId] = useState('');
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceiptRow[]>([]);
  const [transfers, setTransfers] = useState<InventoryTransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [locName, setLocName] = useState('');
  const [locKind, setLocKind] = useState('WAREHOUSE');
  const [locCity, setLocCity] = useState('');
  const [locPostal, setLocPostal] = useState('');

  const [adjustLotId, setAdjustLotId] = useState('');
  const [adjustQty, setAdjustQty] = useState('0');
  const [adjustReason, setAdjustReason] = useState('CYCLE_COUNT');

  const [grnLocationId, setGrnLocationId] = useState('');
  const [grnVariantId, setGrnVariantId] = useState('');
  const [catalogVariants, setCatalogVariants] = useState<Array<{ id: string; label: string }>>([]);
  const [grnQty, setGrnQty] = useState('10');
  const [grnLotCode, setGrnLotCode] = useState('');

  const [xferFrom, setXferFrom] = useState('');
  const [xferTo, setXferTo] = useState('');
  const [xferLotId, setXferLotId] = useState('');
  const [xferQty, setXferQty] = useState('1');

  const load = useCallback(async () => {
    const token = getAccessToken();
    const owner = orgId.trim();
    if (!token || !owner) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    setMessage(null);
    const headers = adminAuthHeaders(token);
    const q = encodeURIComponent(owner);
    const [locRes, lotRes, grnRes, xferRes, catRes] = await Promise.all([
      fetch(`${adminApiRoot()}/api/v1/admin/inventory/locations?organization_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/inventory/lots?owner_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/inventory/grn?owner_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/inventory/transfers?owner_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/catalog/items`, { headers }),
    ]);
    setLoading(false);
    if (locRes.status === 403 || lotRes.status === 403) {
      setDenied(true);
      return;
    }
    if (!locRes.ok || !lotRes.ok) {
      setError('Inventory could not be loaded.');
      return;
    }
    const locRows = presentLocations(await locRes.json());
    const nextLots = presentLots(await lotRes.json());
    setLocations(locRows);
    setLots(nextLots);
    setReceipts(grnRes.ok ? presentReceipts(await grnRes.json()) : []);
    setTransfers(xferRes.ok ? presentTransfers(await xferRes.json()) : []);
    const fromCatalog = catRes.ok
      ? presentCatalogList(await catRes.json())
          .filter((row) => row.variant_id)
          .map((row) => ({ id: row.variant_id, label: `${row.title} (${row.sku || row.slug})` }))
      : [];
    const fromLots = nextLots
      .filter((row) => row.variant_id)
      .map((row) => ({ id: row.variant_id, label: row.sku || row.variant_id }));
    const merged = [...fromLots, ...fromCatalog].filter(
      (row, index, all) => all.findIndex((other) => other.id === row.id) === index,
    );
    setCatalogVariants(merged);
    setGrnLocationId((current) =>
      current && locRows.some((row) => row.id === current) ? current : locRows[0]?.id ?? '',
    );
    setGrnVariantId((current) =>
      current && merged.some((row) => row.id === current) ? current : merged[0]?.id ?? '',
    );
    setXferFrom((current) =>
      current && locRows.some((row) => row.id === current) ? current : locRows[0]?.id ?? '',
    );
    setXferTo((current) => {
      const next = locRows.find((row) => row.id !== locRows[0]?.id)?.id ?? locRows[0]?.id ?? '';
      return current && locRows.some((row) => row.id === current) ? current : next;
    });
    setXferLotId((current) =>
      current && nextLots.some((row) => row.id === current) ? current : nextLots[0]?.id ?? '',
    );
    setAdjustLotId((current) =>
      current && nextLots.some((row) => row.id === current) ? current : nextLots[0]?.id ?? '',
    );
  }, [getAccessToken, orgId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    void fetch(`${adminApiRoot()}/api/v1/admin/governance/organizations`, {
      headers: adminAuthHeaders(token),
    }).then(async (res) => {
      if (!res.ok) {
        return;
      }
      const rows = presentOrgPicks(await res.json(), ['VENDOR', 'PHARMACY_OWNED', 'PLATFORM', 'LAB']);
      setOrgs(rows);
      setOrgId((current) => current || rows[0]?.id || '');
    });
  }, [getAccessToken]);

  useEffect(() => {
    if (orgId.trim()) {
      void load();
    }
  }, [load, orgId]);

  async function postJson(path: string, body: Record<string, unknown>): Promise<boolean> {
    const token = getAccessToken();
    if (!token) {
      return false;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(`${adminApiRoot()}${path}`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.status === 403) {
      setDenied(true);
      return false;
    }
    if (!res.ok) {
      setError(await readDetail(res));
      return false;
    }
    return true;
  }

  async function createLocation() {
    const owner = orgId.trim();
    if (!owner || !locName.trim()) {
      return;
    }
    const ok = await postJson('/api/v1/admin/inventory/locations', {
      organization_id: owner,
      kind: locKind,
      name: locName.trim(),
      city: locCity.trim() || undefined,
      postal_code: locPostal.trim() || undefined,
      fulfillment_capable: locKind !== 'STORE',
    });
    if (ok) {
      setMessage('Location created.');
      setLocName('');
      await load();
    }
  }

  async function adjustStock() {
    if (!adjustLotId.trim()) {
      return;
    }
    const ok = await postJson('/api/v1/admin/inventory/adjustments', {
      lot_id: adjustLotId.trim(),
      qty_delta: Number(adjustQty),
      reason_code: adjustReason.trim() || 'CYCLE_COUNT',
      idempotency_key: idempotencyKey('adj'),
    });
    if (ok) {
      setMessage('Adjustment posted.');
      await load();
    }
  }

  async function createGrn() {
    const owner = orgId.trim();
    if (!owner || !grnLocationId.trim() || !grnVariantId.trim()) {
      return;
    }
    const ok = await postJson('/api/v1/admin/inventory/grn', {
      location_id: grnLocationId.trim(),
      owner_org_id: owner,
      idempotency_key: idempotencyKey('grn'),
      lines: [
        {
          variant_id: grnVariantId.trim(),
          lot_code: grnLotCode.trim() || undefined,
          qty: Number(grnQty),
        },
      ],
    });
    if (ok) {
      setMessage('Goods receipt created. Receive, then post, to add on-hand stock.');
      await load();
    }
  }

  async function grnAction(id: string, action: 'receive' | 'post') {
    const ok = await postJson(`/api/v1/admin/inventory/grn/${id}/${action}`, {});
    if (ok) {
      setMessage(action === 'receive' ? 'Receipt marked received.' : 'Receipt posted to lots.');
      await load();
    }
  }

  async function createTransfer() {
    const owner = orgId.trim();
    const lot = lots.find((row) => row.id === xferLotId.trim());
    if (!owner || !xferFrom.trim() || !xferTo.trim() || !lot) {
      setError('Select from/to locations and a source lot from this org.');
      return;
    }
    const ok = await postJson('/api/v1/admin/inventory/transfers', {
      from_location_id: xferFrom.trim(),
      to_location_id: xferTo.trim(),
      owner_org_id: owner,
      idempotency_key: idempotencyKey('xfer'),
      lines: [{ variant_id: lot.variant_id, source_lot_id: lot.id, qty: Number(xferQty) }],
    });
    if (ok) {
      setMessage('Transfer created. Reserve, dispatch, then receive.');
      await load();
    }
  }

  async function transferAction(id: string, action: 'reserve' | 'dispatch' | 'receive') {
    const ok = await postJson(`/api/v1/admin/inventory/transfers/${id}/${action}`, {});
    if (ok) {
      setMessage(`Transfer ${action} completed.`);
      await load();
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Inventory</Heading>
        <p className="wp-page-intro">
          Pick an owner org, add stock with a goods receipt (Receive then Post), or adjust lots. Checkout stays on the
          customer store.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Owner organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Owner organization id"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              {orgs.length === 0 ? <option value="">No organizations loaded</option> : null}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.kind})
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button type="button" onClick={() => void load()} disabled={loading || !orgId.trim()}>
          {loading ? 'Loading…' : 'Load inventory'}
        </Button>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {loading ? <LoadingState label="Loading inventory" /> : null}
      {denied ? <EmptyState title="Permission denied" description="This operator cannot read inventory." /> : null}
      {error && !locations.length && !lots.length ? (
        <AdminRequestError error={error} onRetry={() => void load()} />
      ) : null}
      {error && (locations.length || lots.length) ? <p className="wp-text-muted">{error}</p> : null}

      {orgId.trim() && !denied ? (
        <Card>
          <h2 className="wp-section-title">Create location</h2>
          <div className="wp-form-grid">
            <FormField label="Name">
              {({ id }) => (
                <Input id={id} aria-label="Location name" value={locName} onChange={(e) => setLocName(e.target.value)} />
              )}
            </FormField>
            <FormField label="Kind">
              {({ id }) => (
                <Select id={id} aria-label="Location kind" value={locKind} onChange={(e) => setLocKind(e.target.value)}>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="VENDOR_WAREHOUSE">Vendor warehouse</option>
                  <option value="STORE">Store</option>
                </Select>
              )}
            </FormField>
            <FormField label="City">
              {({ id }) => (
                <Input id={id} aria-label="Location city" value={locCity} onChange={(e) => setLocCity(e.target.value)} />
              )}
            </FormField>
            <FormField label="Postal code">
              {({ id }) => (
                <Input
                  id={id}
                  aria-label="Location postal code"
                  value={locPostal}
                  onChange={(e) => setLocPostal(e.target.value)}
                />
              )}
            </FormField>
            <div className="wp-form-actions">
              <Button type="button" disabled={busy || !locName.trim()} onClick={() => void createLocation()}>
                Create location
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {locations.length ? (
        <Card>
          <h2 className="wp-section-title">{locations.length} location(s)</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>City</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <span className="wp-status">{row.kind}</span>
                    </td>
                    <td>{row.city || row.postal_code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!loading && !denied && orgId.trim() && lots.length === 0 && !error ? (
        <EmptyState title="No lots" description="Create a goods receipt, receive it, then post it to create stock." />
      ) : null}

      {lots.length ? (
        <Card>
          <h2 className="wp-section-title">{lots.length} lot(s)</h2>
          {lots.some((lot) => lot.available <= 0 || lot.reserved > lot.on_hand) ? (
            <p className="wp-text-muted">
              Stock anomalies:{' '}
              {lots.filter((lot) => lot.available <= 0).length} out-of-stock ·{' '}
              {lots.filter((lot) => lot.reserved > lot.on_hand).length} reserved-over-on-hand
            </p>
          ) : null}
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Lot</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>On hand</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td>{lot.sku || lot.variant_id || lot.id}</td>
                    <td>{lot.lot_code || '—'}</td>
                    <td>{lot.location_name || lot.location_id || '—'}</td>
                    <td>
                      <span className="wp-status">{lot.status}</span>
                    </td>
                    <td>{lot.on_hand}</td>
                    <td>{lot.reserved}</td>
                    <td>{lot.available}</td>
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => setAdjustLotId(lot.id)}>
                        Adjust
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="wp-section-title">Adjust stock</h3>
          <div className="wp-form-grid">
          <FormField label="Lot">
            {({ id }) => (
              <Select
                id={id}
                aria-label="Lot id"
                value={adjustLotId}
                onChange={(e) => setAdjustLotId(e.target.value)}
              >
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.sku || lot.lot_code || lot.id.slice(0, 8)} · {lot.location_name || 'location'} · on hand {lot.on_hand}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Qty delta">
            {({ id }) => (
              <Input id={id} aria-label="Qty delta" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
            )}
          </FormField>
          <FormField label="Reason code">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Adjustment reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            )}
          </FormField>
          <div className="wp-form-actions">
          <Button type="button" disabled={busy || !adjustLotId.trim()} onClick={() => void adjustStock()}>
            Post adjustment
          </Button>
          </div>
          </div>
        </Card>
      ) : null}

      {orgId.trim() && !denied ? (
        <Card>
          <h2 className="wp-section-title">Goods receipt</h2>
          <div className="wp-form-grid">
          <FormField label="Location">
            {({ id }) => (
              <Select
                id={id}
                aria-label="GRN location id"
                value={grnLocationId}
                onChange={(e) => setGrnLocationId(e.target.value)}
              >
                {locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name || row.id}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Catalog variant">
            {({ id }) => (
              <Select
                id={id}
                aria-label="GRN variant id"
                value={grnVariantId}
                onChange={(e) => setGrnVariantId(e.target.value)}
              >
                {catalogVariants.length === 0 ? <option value="">Publish a catalog item first</option> : null}
                {catalogVariants.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Quantity">
            {({ id }) => (
              <Input id={id} aria-label="GRN qty" value={grnQty} onChange={(e) => setGrnQty(e.target.value)} />
            )}
          </FormField>
          <FormField label="Lot code">
            {({ id }) => (
              <Input
                id={id}
                aria-label="GRN lot code"
                value={grnLotCode}
                onChange={(e) => setGrnLotCode(e.target.value)}
              />
            )}
          </FormField>
          <div className="wp-form-actions">
          <Button
            type="button"
            disabled={busy || !grnLocationId.trim() || !grnVariantId.trim()}
            onClick={() => void createGrn()}
          >
            Create goods receipt
          </Button>
          </div>
          </div>
          {receipts.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Status</th>
                    <th>Lines</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <code>{row.id.slice(0, 8)}…</code>
                      </td>
                      <td>
                        <span className="wp-status">{row.status}</span>
                      </td>
                      <td>{row.line_count}</td>
                      <td>
                        <div className="wp-row-actions">
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void grnAction(row.id, 'receive')}>
                            Receive
                          </Button>
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void grnAction(row.id, 'post')}>
                            Post
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}

      {orgId.trim() && !denied ? (
        <Card>
          <h2 className="wp-section-title">Transfers</h2>
          <div className="wp-form-grid">
          <FormField label="From location">
            {({ id }) => (
              <Select id={id} aria-label="Transfer from location" value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
                {locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name || row.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="To location">
            {({ id }) => (
              <Select id={id} aria-label="Transfer to location" value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                {locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name || row.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Source lot">
            {({ id }) => (
              <Select id={id} aria-label="Transfer source lot" value={xferLotId} onChange={(e) => setXferLotId(e.target.value)}>
                {lots.length === 0 ? <option value="">No lots yet</option> : null}
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.sku || lot.lot_code || lot.id.slice(0, 8)} · avail {lot.available}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Qty">
            {({ id }) => (
              <Input id={id} aria-label="Transfer qty" value={xferQty} onChange={(e) => setXferQty(e.target.value)} />
            )}
          </FormField>
          <div className="wp-form-actions">
          <Button type="button" disabled={busy || !xferLotId.trim()} onClick={() => void createTransfer()}>
            Create transfer
          </Button>
          </div>
          </div>
          {transfers.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Transfer</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <code>{row.id.slice(0, 8)}…</code>
                      </td>
                      <td>
                        <span className="wp-status">{row.status}</span>
                      </td>
                      <td>
                        <div className="wp-row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void transferAction(row.id, 'reserve')}
                          >
                            Reserve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void transferAction(row.id, 'dispatch')}
                          >
                            Dispatch
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void transferAction(row.id, 'receive')}
                          >
                            Receive
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
