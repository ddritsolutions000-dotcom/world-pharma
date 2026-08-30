'use client';

import { useCallback, useEffect, useState } from 'react';
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
  createVendorItem,
  createVendorOffer,
  createVendorVariant,
  fetchVendorOffers,
  publishVendorOffer,
  replaceVendorOfferPrice,
  type VendorOffer,
} from './vendor-api';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function VendorCatalogPanel({
  organizationId,
  countryCode,
  token,
  onError,
}: {
  organizationId: string;
  countryCode: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('OTC');
  const [sku, setSku] = useState('');
  const [packSize, setPackSize] = useState('1 pack');
  const [currency, setCurrency] = useState('');
  const [costMinor, setCostMinor] = useState('');
  const [sellMinor, setSellMinor] = useState('');
  const [priceOfferId, setPriceOfferId] = useState('');
  const [priceCost, setPriceCost] = useState('');
  const [priceSell, setPriceSell] = useState('');

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorOffers(token, organizationId);
      setRows(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreatePublish = async () => {
    setFormError(null);
    setMessage(null);
    const slug = slugify(title);
    if (!title.trim() || !slug || !sku.trim() || !currency.trim() || !costMinor.trim() || !sellMinor.trim()) {
      setFormError('Title, SKU, currency, cost, and sell price (integer minor units) are required.');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      setFormError('Currency must be a 3-letter ISO code from policy/country configuration — not hardcoded.');
      return;
    }
    if (!/^\d+$/.test(costMinor.trim()) || !/^\d+$/.test(sellMinor.trim())) {
      setFormError('Prices must be integer minor units (no decimals).');
      return;
    }
    if (!countryCode) {
      setFormError('Seller organization country is required.');
      return;
    }
    setBusy(true);
    try {
      const item = await createVendorItem(token, {
        slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        kind,
        seller_org_id: organizationId,
        title: title.trim(),
        countries: [{ country_code: countryCode, available: true }],
      });
      const variant = await createVendorVariant(token, item.id, {
        sku_code: sku.trim(),
        pack_size: packSize.trim() || '1 pack',
      });
      const offer = await createVendorOffer(token, {
        variant_id: variant.id,
        seller_org_id: organizationId,
        country_code: countryCode,
        ownership: 'VENDOR_OWNED',
        currency: currency.trim().toUpperCase(),
        cost_minor: costMinor.trim(),
        sell_minor: sellMinor.trim(),
      });
      await publishVendorOffer(token, offer.id);
      setMessage('Offer created and published. Catalog write uses the shared catalog kernel.');
      setTitle('');
      setSku('');
      setCostMinor('');
      setSellMinor('');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async (offerId: string) => {
    setBusy(true);
    setFormError(null);
    try {
      await publishVendorOffer(token, offerId);
      setMessage('Offer published.');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError && err.status !== 401 && err.status !== 403) {
        setFormError(err.message);
      } else {
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePrice = async () => {
    setFormError(null);
    if (!priceOfferId || !/^\d+$/.test(priceCost) || !/^\d+$/.test(priceSell)) {
      setFormError('Offer id and integer cost/sell minor units are required.');
      return;
    }
    setBusy(true);
    try {
      await replaceVendorOfferPrice(token, priceOfferId, {
        cost_minor: priceCost,
        sell_minor: priceSell,
      });
      setMessage('New price version recorded (immutable history).');
      setPriceOfferId('');
      setPriceCost('');
      setPriceSell('');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError && err.status !== 401 && err.status !== 403) {
        setFormError(err.message);
      } else {
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading medicine catalog offers…" />;
  }

  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Create offer</Heading>
        <Text tone="secondary">
          Uses existing vendor catalog APIs. Country comes from your seller organization — no hardcoded market.
        </Text>
        <FormField label="Title">
          {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </FormField>
        <FormField label="Kind">
          {({ id }) => (
            <select id={id} className="wp-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="OTC">OTC</option>
              <option value="MEDICINE">MEDICINE</option>
              <option value="DEVICE">DEVICE</option>
              <option value="CONSUMABLE">CONSUMABLE</option>
              <option value="BUNDLE">BUNDLE</option>
            </select>
          )}
        </FormField>
        <FormField label="SKU">
          {({ id }) => <Input id={id} value={sku} onChange={(e) => setSku(e.target.value)} />}
        </FormField>
        <FormField label="Pack size">
          {({ id }) => <Input id={id} value={packSize} onChange={(e) => setPackSize(e.target.value)} />}
        </FormField>
        <FormField label="Currency (ISO 4217)">
          {({ id }) => (
            <Input
              id={id}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="e.g. USD"
            />
          )}
        </FormField>
        <FormField label="Cost (minor units)">
          {({ id }) => <Input id={id} value={costMinor} onChange={(e) => setCostMinor(e.target.value)} />}
        </FormField>
        <FormField label="Sell (minor units)">
          {({ id }) => <Input id={id} value={sellMinor} onChange={(e) => setSellMinor(e.target.value)} />}
        </FormField>
        <Text size="caption">Country for assortment: {countryCode || '—'}</Text>
        <Button disabled={busy} onClick={() => void handleCreatePublish()}>
          {busy ? 'Saving…' : 'Create, price & publish'}
        </Button>
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>

      <Card>
        <Heading level={2}>Replace price</Heading>
        <Text tone="secondary">Creates a new price version. Prior versions remain for audit; history is not rewritten.</Text>
        <FormField label="Offer id">
          {({ id }) => <Input id={id} value={priceOfferId} onChange={(e) => setPriceOfferId(e.target.value)} />}
        </FormField>
        <FormField label="Cost (minor)">
          {({ id }) => <Input id={id} value={priceCost} onChange={(e) => setPriceCost(e.target.value)} />}
        </FormField>
        <FormField label="Sell (minor)">
          {({ id }) => <Input id={id} value={priceSell} onChange={(e) => setPriceSell(e.target.value)} />}
        </FormField>
        <Button disabled={busy} variant="secondary" onClick={() => void handlePrice()}>
          Save price version
        </Button>
      </Card>

      {!rows.length ? (
        <EmptyState
          title="No offers yet"
          description="Create your first seller offer above. Another vendor cannot see or mutate your catalog."
        />
      ) : (
        <>
          <Table
            caption="Vendor catalog offers"
            columns={['Offer', 'Title', 'Country', 'Currency', 'Sell', 'Status']}
            rows={rows.map((row) => [
              row.id.slice(0, 8),
              row.title ?? '—',
              row.country_code ?? '—',
              row.currency ?? '—',
              String(row.sell_minor ?? '—'),
              row.status ?? '—',
            ])}
          />
          {rows.some((row) => row.status === 'DRAFT') ? (
            <Card>
              <Heading level={3}>Draft offers</Heading>
              <div className="wp-stack">
                {rows
                  .filter((row) => row.status === 'DRAFT')
                  .map((row) => (
                    <div key={row.id} className="wp-stack" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Text>
                        {row.title ?? row.id.slice(0, 8)} ({row.id.slice(0, 8)})
                      </Text>
                      <Button size="sm" disabled={busy} onClick={() => void handlePublish(row.id)}>
                        Publish
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
