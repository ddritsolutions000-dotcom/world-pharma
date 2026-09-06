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
  LabApiError,
  createLabItem,
  createLabOffer,
  createLabVariant,
  fetchLabOffers,
  publishLabOffer,
  replaceLabOfferPrice,
  type LabOffer,
} from './lab-api';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function LabCatalogPanel({
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
  const [rows, setRows] = useState<LabOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [packSize, setPackSize] = useState('1 draw');
  const [currency, setCurrency] = useState(countryCode === 'XX' ? 'XXX' : '');
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
      const body = await fetchLabOffers(token, organizationId);
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

  const create = async () => {
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const slug = slugify(title) || `lab-test-${Date.now().toString(36)}`;
      const item = await createLabItem(token, {
        slug,
        lab_org_id: organizationId,
        title: title.trim() || 'Lab test',
        description: 'Diagnostic service title — not a clinical result.',
        countries: [{ country_code: countryCode }],
      });
      const variant = await createLabVariant(token, item.id, organizationId, {
        sku_code: sku.trim() || `SKU-${Date.now().toString(36)}`,
        pack_size: packSize.trim() || '1 draw',
      });
      const offer = await createLabOffer(token, {
        variant_id: variant.id,
        lab_org_id: organizationId,
        country_code: countryCode,
        currency: currency.trim().toUpperCase() || 'XXX',
        cost_minor: costMinor.trim() || '0',
        sell_minor: sellMinor.trim() || '0',
      });
      setMessage(`Created LAB_TEST offer ${offer.id} (draft). Publish the item and offer before customers can book.`);
      setTitle('');
      setSku('');
      await load();
    } catch (err) {
      if (err instanceof LabApiError) {
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

  if (loading) {
    return <LoadingState label="Loading laboratory catalog offerings…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        LAB_TEST items use the shared catalog kernel with LAB_OWNED offers. Published tests appear on the customer store.
        Run the live pipeline from Bookings → Collections → Transport → Accession → Processing → Pathology. Verify reports
        in the pathologist portal when a case is assigned.
      </Text>
      <Card>
        <Heading level={2}>Create lab offering</Heading>
        <FormField label="Test title">
          {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </FormField>
        <FormField label="SKU code">
          {({ id }) => <Input id={id} value={sku} onChange={(e) => setSku(e.target.value)} />}
        </FormField>
        <FormField label="Pack / specimen package">
          {({ id }) => (
            <Input id={id} value={packSize} onChange={(e) => setPackSize(e.target.value)} />
          )}
        </FormField>
        <FormField label="Currency">
          {({ id }) => (
            <Input id={id} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          )}
        </FormField>
        <FormField label="Cost (minor)">
          {({ id }) => (
            <Input id={id} value={costMinor} onChange={(e) => setCostMinor(e.target.value)} />
          )}
        </FormField>
        <FormField label="Sell (minor)">
          {({ id }) => (
            <Input id={id} value={sellMinor} onChange={(e) => setSellMinor(e.target.value)} />
          )}
        </FormField>
        <Button disabled={busy || !organizationId} onClick={() => void create()}>
          Create LAB_TEST + offer
        </Button>
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>

      <Card>
        <Heading level={2}>Offers</Heading>
        {!rows.length ? (
          <EmptyState
            title="No lab offerings yet"
            description="Create a LAB_TEST offer after lab capability is ELIGIBLE."
          />
        ) : (
          <>
            <Table
              caption="Laboratory catalog offers"
              columns={['Offer', 'Title', 'SKU', 'Status', 'Sell']}
              rows={rows.map((row) => [
                row.id.slice(0, 8),
                row.title ?? '—',
                row.sku ?? '—',
                row.status ?? '—',
                String(row.sell_minor ?? '—'),
              ])}
            />
            {rows.some((row) => row.status === 'DRAFT') ? (
              <div className="wp-stack">
                <Heading level={3}>Draft actions</Heading>
                {rows
                  .filter((row) => row.status === 'DRAFT')
                  .map((row) => (
                    <div key={row.id} className="lab-tab-row">
                      <Text size="caption">{row.title ?? row.id}</Text>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void publishLabOffer(token, row.id)
                            .then(() => load())
                            .catch(onError)
                            .finally(() => setBusy(false));
                        }}
                      >
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPriceOfferId(row.id);
                          setPriceCost(String(row.sell_minor ?? ''));
                          setPriceSell(String(row.sell_minor ?? ''));
                        }}
                      >
                        Price
                      </Button>
                    </div>
                  ))}
              </div>
            ) : null}
          </>
        )}
      </Card>

      {priceOfferId ? (
        <Card>
          <Heading level={3}>Replace price</Heading>
          <FormField label="Cost minor">
            {({ id }) => (
              <Input id={id} value={priceCost} onChange={(e) => setPriceCost(e.target.value)} />
            )}
          </FormField>
          <FormField label="Sell minor">
            {({ id }) => (
              <Input id={id} value={priceSell} onChange={(e) => setPriceSell(e.target.value)} />
            )}
          </FormField>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void replaceLabOfferPrice(token, priceOfferId, {
                cost_minor: priceCost,
                sell_minor: priceSell,
              })
                .then(() => {
                  setPriceOfferId('');
                  return load();
                })
                .catch(onError)
                .finally(() => setBusy(false));
            }}
          >
            Save price
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
