'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  adjustVendorLot,
  advanceVendorTransfer,
  createVendorGrn,
  createVendorLocation,
  createVendorTransfer,
  fetchVendorLots,
  fetchVendorLocations,
  fetchVendorMovements,
  fetchVendorOffers,
  fetchVendorReceipts,
  fetchVendorTransfers,
  postVendorGrn,
  receiveVendorGrn,
  vendorIdempotencyKey,
  type VendorGoodsReceipt,
  type VendorLocation,
  type VendorLot,
  type VendorMovement,
  type VendorOffer,
  type VendorTransfer,
} from './vendor-api';

type InvSub = 'overview' | 'receive' | 'adjust' | 'transfer' | 'history';

function formatExpiry(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return String(value).slice(0, 10);
  }
}

export function VendorInventoryPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [sub, setSub] = useState<InvSub>('overview');
  const [lots, setLots] = useState<VendorLot[]>([]);
  const [locations, setLocations] = useState<VendorLocation[]>([]);
  const [offers, setOffers] = useState<VendorOffer[]>([]);
  const [movements, setMovements] = useState<VendorMovement[]>([]);
  const [receipts, setReceipts] = useState<VendorGoodsReceipt[]>([]);
  const [transfers, setTransfers] = useState<VendorTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [locationFilter, setLocationFilter] = useState('');
  const [newLocationName, setNewLocationName] = useState('');

  const [grnLocationId, setGrnLocationId] = useState('');
  const [grnVariantId, setGrnVariantId] = useState('');
  const [grnLotCode, setGrnLotCode] = useState('');
  const [grnExpires, setGrnExpires] = useState('');
  const [grnQty, setGrnQty] = useState('10');

  const [adjustLotId, setAdjustLotId] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('cycle_count');

  const [xferFrom, setXferFrom] = useState('');
  const [xferTo, setXferTo] = useState('');
  const [xferLotId, setXferLotId] = useState('');
  const [xferQty, setXferQty] = useState('1');

  const warehouseLocations = useMemo(
    () => locations.filter((loc) => loc.kind === 'VENDOR_WAREHOUSE' || loc.kind === 'WAREHOUSE'),
    [locations],
  );

  const offerOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ variant_id: string; label: string }> = [];
    for (const offer of offers) {
      const variantId = offer.variant_id;
      if (!variantId || seen.has(variantId)) {
        continue;
      }
      seen.add(variantId);
      rows.push({
        variant_id: variantId,
        label: `${offer.sku ?? offer.title ?? variantId.slice(0, 8)} (${offer.status ?? 'offer'})`,
      });
    }
    return rows;
  }, [offers]);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const [lotsBody, locsBody, offersBody, movesBody, grnBody, xferBody] = await Promise.all([
        fetchVendorLots(token, organizationId),
        fetchVendorLocations(token, organizationId),
        fetchVendorOffers(token, organizationId),
        fetchVendorMovements(token, organizationId),
        fetchVendorReceipts(token, organizationId),
        fetchVendorTransfers(token, organizationId),
      ]);
      setLots(lotsBody.data);
      setLocations(locsBody.data);
      setOffers(offersBody.data);
      setMovements(movesBody.data);
      setReceipts(grnBody.data);
      setTransfers(xferBody.data);
      setGrnLocationId((current) => {
        if (current) {
          return current;
        }
        const warehouse = locsBody.data.find((l) => l.kind === 'VENDOR_WAREHOUSE') ?? locsBody.data[0];
        return warehouse?.id ?? '';
      });
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApiErr = (err: unknown) => {
    if (err instanceof VendorApiError) {
      if (err.status === 401 || err.status === 403) {
        onError(err);
        return;
      }
      setFormError(err.message);
      return;
    }
    onError(err);
  };

  const filteredLots = locationFilter ? lots.filter((lot) => lot.location_id === locationFilter) : lots;

  const handleCreateLocation = async () => {
    setFormError(null);
    setMessage(null);
    if (!newLocationName.trim()) {
      setFormError('Warehouse name is required.');
      return;
    }
    setBusy(true);
    try {
      await createVendorLocation(token, {
        organization_id: organizationId,
        name: newLocationName.trim(),
        fulfillment_capable: true,
      });
      setMessage('Vendor warehouse created (VENDOR_WAREHOUSE). Store locations are not created here.');
      setNewLocationName('');
      await load();
    } catch (err) {
      handleApiErr(err);
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveStock = async () => {
    setFormError(null);
    setMessage(null);
    const qty = Number(grnQty);
    if (!grnLocationId || !grnVariantId || !Number.isFinite(qty) || qty <= 0) {
      setFormError('Warehouse, variant, and positive quantity are required.');
      return;
    }
    if (
      !window.confirm(
        `Receive ${qty} units into selected warehouse?\nLot: ${grnLotCode || '(none)'}\nExpiry: ${grnExpires || 'none'}\nThis posts stock via the shared inventory kernel.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const grn = await createVendorGrn(token, {
        location_id: grnLocationId,
        owner_org_id: organizationId,
        idempotency_key: vendorIdempotencyKey('grn'),
        lines: [
          {
            variant_id: grnVariantId,
            lot_code: grnLotCode.trim() || undefined,
            expires_on: grnExpires.trim() || undefined,
            qty,
            qty_accepted: qty,
          },
        ],
      });
      await receiveVendorGrn(token, grn.id);
      await postVendorGrn(token, grn.id);
      setMessage('Goods receipt posted. Available quantity updated.');
      setGrnLotCode('');
      setGrnQty('10');
      await load();
    } catch (err) {
      handleApiErr(err);
    } finally {
      setBusy(false);
    }
  };

  const handleAdjust = async () => {
    setFormError(null);
    setMessage(null);
    const delta = Number(adjustDelta);
    if (!adjustLotId || !Number.isFinite(delta) || delta === 0 || !adjustReason.trim()) {
      setFormError('Lot, non-zero qty delta, and reason code are required.');
      return;
    }
    if (
      !window.confirm(
        `Confirm inventory adjustment?\nLot: ${adjustLotId.slice(0, 8)}…\nDelta: ${delta}\nReason: ${adjustReason.trim()}\nThis is an auditable mutation and cannot be silent.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await adjustVendorLot(token, {
        lot_id: adjustLotId,
        qty_delta: delta,
        reason_code: adjustReason.trim(),
        idempotency_key: vendorIdempotencyKey('adj'),
      });
      setMessage('Adjustment recorded with audit/outbox event.');
      setAdjustDelta('');
      await load();
    } catch (err) {
      handleApiErr(err);
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    setFormError(null);
    setMessage(null);
    const qty = Number(xferQty);
    const lot = lots.find((row) => row.id === xferLotId);
    if (!xferFrom || !xferTo || !xferLotId || !lot?.variant_id || !Number.isFinite(qty) || qty <= 0) {
      setFormError('From/to locations, source lot, and positive qty are required.');
      return;
    }
    if (xferFrom === xferTo) {
      setFormError('From and to locations must differ.');
      return;
    }
    if (
      !window.confirm(
        `Transfer ${qty} units between your warehouses?\nFrom ${xferFrom.slice(0, 8)}… → ${xferTo.slice(0, 8)}…`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const transfer = await createVendorTransfer(token, {
        from_location_id: xferFrom,
        to_location_id: xferTo,
        owner_org_id: organizationId,
        idempotency_key: vendorIdempotencyKey('xfer'),
        lines: [{ variant_id: lot.variant_id, source_lot_id: xferLotId, qty }],
      });
      await advanceVendorTransfer(token, transfer.id, 'reserve');
      await advanceVendorTransfer(token, transfer.id, 'dispatch');
      await advanceVendorTransfer(token, transfer.id, 'receive');
      setMessage('Transfer reserved, dispatched, and received within your seller org.');
      await load();
    } catch (err) {
      handleApiErr(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading medicine inventory lots and warehouse stock…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Seller warehouse inventory for this VENDOR organization only. Store/pharmacy location ops belong on Store —
        vendors do not impersonate stores.
      </Text>
      <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['overview', 'Overview'],
            ['receive', 'Receive (GRN)'],
            ['adjust', 'Adjust'],
            ['transfer', 'Transfer'],
            ['history', 'History'],
          ] as Array<[InvSub, string]>
        ).map(([id, label]) => (
          <Button key={id} size="sm" variant={sub === id ? 'primary' : 'secondary'} onClick={() => setSub(id)}>
            {label}
          </Button>
        ))}
      </div>
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      {message ? <Text>{message}</Text> : null}

      {sub === 'overview' ? (
        <>
          <Card>
            <Heading level={2}>Warehouses</Heading>
            <FormField label="New VENDOR_WAREHOUSE name">
              {({ id }) => (
                <Input id={id} value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} />
              )}
            </FormField>
            <Button disabled={busy} onClick={() => void handleCreateLocation()}>
              Create warehouse
            </Button>
            {!locations.length ? (
              <EmptyState
                title="No warehouse yet"
                description="Create a VENDOR_WAREHOUSE to receive stock. Another vendor cannot see these locations."
              />
            ) : (
              <Table
                caption="Seller locations"
                columns={['Name', 'Kind', 'Active']}
                rows={locations.map((loc) => [loc.name, loc.kind, loc.is_active === false ? 'no' : 'yes'])}
              />
            )}
          </Card>

          <Card>
            <Heading level={2}>Stock lots</Heading>
            <FormField label="Filter by location">
              {({ id }) => (
                <select
                  id={id}
                  className="wp-input"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.kind})
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {!filteredLots.length ? (
              <EmptyState
                title="No stock yet"
                description="Post a goods receipt against your warehouse. Another vendor cannot see this list."
              />
            ) : (
              <Table
                caption="Vendor inventory lots"
                columns={['SKU', 'Lot', 'Location', 'On hand', 'Available', 'Expiry', 'Status']}
                rows={filteredLots.map((lot) => [
                  lot.sku ?? lot.id.slice(0, 8),
                  lot.lot_code || 'no-lot',
                  lot.location_name ?? lot.location_id?.slice(0, 8) ?? '—',
                  String(lot.on_hand ?? '—'),
                  String(lot.available),
                  formatExpiry(lot.expires_on),
                  lot.status ?? '—',
                ])}
              />
            )}
          </Card>
        </>
      ) : null}

      {sub === 'receive' ? (
        <Card>
          <Heading level={2}>Goods receipt</Heading>
          <Text tone="secondary">
            Receive stock into a seller warehouse. Requires confirmation. Does not target Store locations.
          </Text>
          <FormField label="Warehouse">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={grnLocationId}
                onChange={(e) => setGrnLocationId(e.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouseLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Variant (from your offers)">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={grnVariantId}
                onChange={(e) => setGrnVariantId(e.target.value)}
              >
                <option value="">Select variant</option>
                {offerOptions.map((opt) => (
                  <option key={opt.variant_id} value={opt.variant_id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {!offerOptions.length ? (
            <Text size="caption">Create a catalog offer first so a variant is available to receive against.</Text>
          ) : null}
          <FormField label="Lot code">
            {({ id }) => <Input id={id} value={grnLotCode} onChange={(e) => setGrnLotCode(e.target.value)} />}
          </FormField>
          <FormField label="Expires on (YYYY-MM-DD)">
            {({ id }) => <Input id={id} value={grnExpires} onChange={(e) => setGrnExpires(e.target.value)} />}
          </FormField>
          <FormField label="Quantity">
            {({ id }) => <Input id={id} value={grnQty} onChange={(e) => setGrnQty(e.target.value)} />}
          </FormField>
          <Button disabled={busy} onClick={() => void handleReceiveStock()}>
            {busy ? 'Posting…' : 'Confirm receive & post'}
          </Button>
          {receipts.length ? (
            <Table
              caption="Recent goods receipts"
              columns={['Receipt', 'Status', 'Location']}
              rows={receipts.slice(0, 10).map((row) => [
                row.id.slice(0, 8),
                row.status,
                row.location_id.slice(0, 8),
              ])}
            />
          ) : null}
        </Card>
      ) : null}

      {sub === 'adjust' ? (
        <Card>
          <Heading level={2}>Inventory adjustment</Heading>
          <Text tone="secondary">Explicit auditable qty change. Confirmation required. No silent stock consumption.</Text>
          <FormField label="Lot">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={adjustLotId}
                onChange={(e) => setAdjustLotId(e.target.value)}
              >
                <option value="">Select lot</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.sku ?? lot.id.slice(0, 8)} / {lot.lot_code || 'no-lot'} (avail {lot.available})
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Qty delta (+/−)">
            {({ id }) => <Input id={id} value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />}
          </FormField>
          <FormField label="Reason code">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              >
                <option value="cycle_count">cycle_count</option>
                <option value="damage">damage</option>
                <option value="expiry_writeoff">expiry_writeoff</option>
                <option value="correction">correction</option>
              </select>
            )}
          </FormField>
          <Button disabled={busy} onClick={() => void handleAdjust()}>
            {busy ? 'Saving…' : 'Confirm adjustment'}
          </Button>
        </Card>
      ) : null}

      {sub === 'transfer' ? (
        <Card>
          <Heading level={2}>Transfer (same seller org)</Heading>
          <Text tone="secondary">Moves stock between your locations only. Cannot target another vendor.</Text>
          <FormField label="From location">
            {({ id }) => (
              <select id={id} className="wp-input" value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
                <option value="">Select</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.kind})
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="To location">
            {({ id }) => (
              <select id={id} className="wp-input" value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                <option value="">Select</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.kind})
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Source lot">
            {({ id }) => (
              <select id={id} className="wp-input" value={xferLotId} onChange={(e) => setXferLotId(e.target.value)}>
                <option value="">Select lot</option>
                {lots
                  .filter((lot) => !xferFrom || lot.location_id === xferFrom)
                  .map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.sku ?? lot.id.slice(0, 8)} / avail {lot.available}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
          <FormField label="Quantity">
            {({ id }) => <Input id={id} value={xferQty} onChange={(e) => setXferQty(e.target.value)} />}
          </FormField>
          <Button disabled={busy} onClick={() => void handleTransfer()}>
            {busy ? 'Transferring…' : 'Confirm transfer'}
          </Button>
          {transfers.length ? (
            <Table
              caption="Recent transfers"
              columns={['Transfer', 'Status', 'From', 'To']}
              rows={transfers.slice(0, 10).map((row) => [
                row.id.slice(0, 8),
                row.status,
                row.from_location_id.slice(0, 8),
                row.to_location_id.slice(0, 8),
              ])}
            />
          ) : null}
        </Card>
      ) : null}

      {sub === 'history' ? (
        <Card>
          <Heading level={2}>Movement history</Heading>
          <Text tone="secondary">Commercial/fulfillment inventory audit trail for this seller only. No clinical PHI.</Text>
          {!movements.length ? (
            <EmptyState title="No movements yet" description="Receipts, adjustments, and transfers appear here." />
          ) : (
            <Table
              caption="Inventory movements"
              columns={['When', 'Type', 'Qty', 'Reason', 'Lot']}
              rows={movements.slice(0, 40).map((row) => [
                row.occurred_at ? String(row.occurred_at).slice(0, 19) : '—',
                row.type,
                String(row.qty),
                row.reason_code,
                row.lot_code || row.lot_id.slice(0, 8),
              ])}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
