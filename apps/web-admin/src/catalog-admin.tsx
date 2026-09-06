'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  TextArea,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { presentCatalogList, type CatalogItemRow } from './catalog-admin-present';
import { workingCountry } from './working-country';
import { customerPageUrl } from './site-url';
import type { CatalogProductAttributes } from '@world-pharma/shared/partner-fields';

function matchesQuery(item: CatalogItemRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const hay = [item.title, item.slug, item.brand_name, item.sku, item.id, item.kind]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function CatalogAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [rules, setRules] = useState<Array<{ id?: string; countryCode?: string; takeBps?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; status: string; item_id?: string; match_item_id?: string }>>([]);
  const [offerReadyId, setOfferReadyId] = useState('');
  const [offerReady, setOfferReady] = useState<{
    offer_id?: string;
    catalog_ready?: boolean;
    inventory_ready?: boolean;
    publishable?: boolean;
    blockers?: string[];
  } | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [brandSlug, setBrandSlug] = useState('');
  const [brandName, setBrandName] = useState('');
  const [itemSlug, setItemSlug] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [itemKind, setItemKind] = useState('MEDICINE');
  const [itemImage, setItemImage] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemPack, setItemPack] = useState('1 pack');
  const [itemDescription, setItemDescription] = useState('');
  const [itemStrength, setItemStrength] = useState('');
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [draftDescriptions, setDraftDescriptions] = useState<Record<string, string>>({});
  const [draftAttrs, setDraftAttrs] = useState<Record<string, CatalogProductAttributes>>({});
  const [draftRx, setDraftRx] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const countryCode = workingCountry(session.countryCode);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const [itemsRes, rulesRes, dupRes] = await Promise.all([
        fetch(`${adminApiRoot()}/api/v1/admin/catalog/items`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/catalog/rules`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/catalog/duplicates`, {
          headers: adminAuthHeaders(token),
        }),
      ]);
      setLoading(false);
      if (itemsRes.status === 403) {
        setDenied(true);
        return;
      }
      if (!itemsRes.ok) {
        setError('Catalog could not be loaded.');
        return;
      }
      setItems(presentCatalogList(await itemsRes.json()));
      if (rulesRes.ok) {
        const body = await rulesRes.json();
        setRules(Array.isArray(body) ? body : []);
      }
      if (dupRes.ok) {
        const body = await dupRes.json();
        setDuplicates(Array.isArray(body) ? body : []);
      }
    } catch {
      setLoading(false);
      setError('Catalog could not be loaded.');
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  const statuses = useMemo(() => {
    const set = new Set(items.map((item) => item.status).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [items]);

  const visible = useMemo(
    () => items.filter((item) => matchesQuery(item, query) && (status === 'all' || item.status === status)),
    [items, query, status],
  );
  const editingItem = items.find((row) => row.id === editingId) ?? null;

  async function copySlug(slug: string) {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(slug);
    } catch {
      setCopied(null);
    }
  }

  async function publish(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/items/${id}/publish`, {
      method: 'POST',
      headers: adminAuthHeaders(token),
    });
    setActionMessage(
      res.ok
        ? 'Published. Live offer created for storefront search (customer 3000).'
        : 'Publish failed — item may already be live or missing assortment.',
    );
    if (res.ok) {
      await load();
    }
  }

  async function inspectOfferReadiness() {
    const token = getAccessToken();
    const id = offerReadyId.trim();
    if (!token || !id) {
      return;
    }
    setActionMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/offers/${id}/readiness`, {
      headers: adminAuthHeaders(token),
    });
    if (!res.ok) {
      setOfferReady(null);
      setActionMessage('Offer readiness could not be loaded.');
      return;
    }
    setOfferReady(await res.json());
  }

  async function archive(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/items/${id}/archive`, {
      method: 'POST',
      headers: adminAuthHeaders(token),
    });
    setActionMessage(res.ok ? 'Item archived (removed from live catalog).' : 'Archive failed.');
    if (res.ok) {
      await load();
    }
  }

  async function createItem(andPublish = false) {
    const token = getAccessToken();
    if (!token || !itemSlug.trim() || !itemTitle.trim()) {
      return;
    }
    setActionMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/items`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        slug: itemSlug.trim(),
        title: itemTitle.trim(),
        kind: itemKind,
        description: itemDescription.trim() || undefined,
        countries: [{ country_code: countryCode }],
        assets: itemImage.trim() ? [{ publicUrl: itemImage.trim(), alt: itemTitle.trim() }] : undefined,
      }),
    });
    if (!res.ok) {
      setActionMessage('Item could not be created.');
      return;
    }
    const created = (await res.json()) as { id?: string };
    if (created.id && itemSku.trim()) {
      await fetch(`${adminApiRoot()}/api/v1/admin/catalog/items/${created.id}/variants`, {
        method: 'POST',
        headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sku_code: itemSku.trim(), pack_size: itemPack.trim() || '1 pack', strength: itemStrength.trim() || undefined }),
      });
    }
    setItemSlug('');
    setItemTitle('');
    setItemImage('');
    setItemSku('');
    setItemDescription('');
    setItemStrength('');
    if (andPublish && created.id) {
      await publish(created.id);
      setActionMessage(`Draft created and published to the customer store (${countryCode}).`);
      return;
    }
    setActionMessage('Draft item created. Publish to put it on the customer store.');
    await load();
  }

  async function saveCopy(id: string) {
    const token = getAccessToken();
    const row = items.find((item) => item.id === id);
    const title = (draftTitles[id] ?? row?.title ?? '').trim();
    const description = draftDescriptions[id] ?? row?.description ?? '';
    if (!token || !id || !title) {
      return;
    }
    const attrs = draftAttrs[id] ?? row?.attributes ?? {};
    const rxRequired = draftRx[id] ?? row?.rx_required ?? false;
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/items/${id}`, {
      method: 'PATCH',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title,
        description,
        country_code: countryCode,
        rx_required: rxRequired,
        attributes: {
          manufacturer_name: attrs.manufacturer_name ?? '',
          country_of_manufacture: attrs.country_of_manufacture ?? '',
          composition: attrs.composition ?? '',
          warnings: attrs.warnings ?? '',
          storage: attrs.storage ?? '',
          usage_directions: attrs.usage_directions ?? '',
          highlights: attrs.highlights ?? [],
        },
      }),
    });
    setActionMessage(res.ok ? 'Product copy saved.' : 'Product update failed.');
    if (res.ok) {
      await load();
    }
  }

  async function createBrand() {
    const token = getAccessToken();
    if (!token || !brandSlug.trim() || !brandName.trim()) {
      return;
    }
    setActionMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/catalog/brands`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ slug: brandSlug.trim(), name: brandName.trim() }),
    });
    if (!res.ok) {
      setActionMessage('Brand could not be created.');
      return;
    }
    setBrandSlug('');
    setBrandName('');
    setActionMessage('Brand created.');
    await load();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Catalog</Heading>
        <p className="wp-page-intro">
          Add a product, publish it to the store, or archive it. Stock is managed on Inventory.
        </p>
      </header>

      <Card>
        <h2 className="wp-section-title">Add product</h2>
        <div className="wp-form-grid">
          <FormField label="Item slug">
            {({ id }) => (
              <Input id={id} aria-label="Item slug" value={itemSlug} onChange={(event) => setItemSlug(event.target.value)} />
            )}
          </FormField>
          <FormField label="Title">
            {({ id }) => (
              <Input id={id} aria-label="Item title" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} />
            )}
          </FormField>
          <FormField label="Description">
            {({ id }) => (
              <TextArea
                id={id}
                aria-label="Item description"
                rows={3}
                value={itemDescription}
                onChange={(event) => setItemDescription(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Kind">
            {({ id }) => (
              <Select id={id} aria-label="Item kind" value={itemKind} onChange={(event) => setItemKind(event.target.value)}>
                <option value="MEDICINE">MEDICINE</option>
                <option value="OTC">OTC</option>
                <option value="DEVICE">DEVICE</option>
                <option value="LAB_TEST">LAB_TEST</option>
              </Select>
            )}
          </FormField>
          <FormField label="SKU (optional)">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Item sku"
                value={itemSku}
                onChange={(event) => setItemSku(event.target.value)}
                placeholder="PARA-500"
              />
            )}
          </FormField>
          <FormField label="Pack size">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Item pack size"
                value={itemPack}
                onChange={(event) => setItemPack(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Strength (optional)">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Item strength"
                value={itemStrength}
                onChange={(event) => setItemStrength(event.target.value)}
                placeholder="500 mg"
              />
            )}
          </FormField>
          <FormField label="Image URL">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Item image url"
                value={itemImage}
                onChange={(event) => setItemImage(event.target.value)}
                placeholder="https://"
              />
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button onClick={() => void createItem(false)} disabled={!itemSlug.trim() || !itemTitle.trim()}>
              Save draft
            </Button>
            <Button
              variant="secondary"
              onClick={() => void createItem(true)}
              disabled={!itemSlug.trim() || !itemTitle.trim()}
            >
              Save and publish
            </Button>
          </div>
        </div>
      </Card>

      <div className="wp-toolbar">
        <Input
          aria-label="Search catalog"
          placeholder="Search title, slug, brand, SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select aria-label="Filter catalog status" value={status} onChange={(event) => setStatus(event.target.value)}>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All statuses' : value}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {actionMessage ? <p className="wp-text-muted">{actionMessage}</p> : null}
      {duplicates.length > 0 ? (
        <Card>
          <Heading level={3}>Possible duplicate products</Heading>
          <p className="wp-text-muted">Candidates are flagged for review. Nothing is merged automatically.</p>
          <ul>
            {duplicates.slice(0, 20).map((row) => (
              <li key={row.id}>
                {row.status} · {row.item_id?.slice(0, 8)} ↔ {row.match_item_id?.slice(0, 8)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <Heading level={3}>Offer readiness</Heading>
        <p className="wp-text-muted">Inspect why a seller offer is not marketplace eligible. Licence/KYC evidence is not shown.</p>
        <FormField label="Offer id">
          {({ id }) => (
            <Input id={id} value={offerReadyId} onChange={(e) => setOfferReadyId(e.target.value)} />
          )}
        </FormField>
        <Button variant="secondary" size="sm" onClick={() => void inspectOfferReadiness()}>
          Inspect
        </Button>
        {offerReady ? (
          <p className="wp-text-muted">
            {offerReady.catalog_ready ? 'CATALOG_READY' : 'CATALOG_BLOCKED'}
            {' · '}
            {offerReady.inventory_ready ? 'INVENTORY_READY' : 'INVENTORY_BLOCKED'}
            {offerReady.blockers && offerReady.blockers.length > 0
              ? ` · ${offerReady.blockers.join(', ')}`
              : ''}
          </p>
        ) : null}
      </Card>
      {loading && items.length === 0 ? <LoadingState label="Loading catalog" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No catalog rows loaded"
          description="Sign in with sandbox-admin@dev.local so the API can return seeded items."
        />
      ) : null}
      {items.length && visible.length === 0 ? (
        <EmptyState title="No matches" description="Clear search or switch status to see items again." />
      ) : null}
      {visible.length ? (
        <div className="wp-order-layout">
        <Card>
          <p className="wp-text-muted">
            Showing {visible.length} of {items.length} item(s)
            {copied ? ` · copied /${copied}` : ''}
          </p>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Kind</th>
                  <th>Slug</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={editingId === item.id ? 'wp-admin-row-active' : undefined}>
                    <td>{item.title}</td>
                    <td>{item.brand_name || '—'}</td>
                    <td>
                      <span className="wp-status">{item.status}</span>
                    </td>
                    <td>{item.kind || '—'}</td>
                    <td>
                      {item.slug ? (
                        <Button size="sm" variant="tertiary" onClick={() => void copySlug(item.slug)}>
                          /{item.slug}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="wp-row-actions">
                        <Button
                          size="sm"
                          variant={editingId === item.id ? 'primary' : 'secondary'}
                          onClick={() => {
                            setEditingId(item.id);
                            setDraftTitles((current) => ({ ...current, [item.id]: current[item.id] ?? item.title }));
                            setDraftDescriptions((current) => ({
                              ...current,
                              [item.id]: current[item.id] ?? item.description,
                            }));
                            setDraftAttrs((current) => ({ ...current, [item.id]: current[item.id] ?? item.attributes }));
                            setDraftRx((current) => ({ ...current, [item.id]: current[item.id] ?? item.rx_required }));
                          }}
                        >
                          Edit
                        </Button>
                        {item.status !== 'PUBLISHED' ? (
                          <Button size="sm" onClick={() => void publish(item.id)}>
                            Publish
                          </Button>
                        ) : null}
                        {item.status !== 'ARCHIVED' ? (
                          <Button size="sm" variant="ghost" onClick={() => void archive(item.id)}>
                            Remove
                          </Button>
                        ) : null}
                        {item.slug ? (
                          <a href={customerPageUrl(`/p/${encodeURIComponent(item.slug)}`)} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {editingItem ? (
          <Card className="wp-order-detail">
            <h2 className="wp-section-title">Edit product</h2>
            <div className="wp-stack">
              <p className="wp-text-muted">/{editingItem.slug}</p>
              <FormField label="Title">
                {({ id }) => (
                  <Input
                    id={id}
                    aria-label={`Title ${editingItem.slug || editingItem.id}`}
                    value={draftTitles[editingItem.id] ?? editingItem.title}
                    onChange={(event) =>
                      setDraftTitles((current) => ({ ...current, [editingItem.id]: event.target.value }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Description">
                {({ id }) => (
                  <TextArea
                    id={id}
                    aria-label={`Description ${editingItem.slug || editingItem.id}`}
                    rows={4}
                    value={draftDescriptions[editingItem.id] ?? editingItem.description}
                    onChange={(event) =>
                      setDraftDescriptions((current) => ({ ...current, [editingItem.id]: event.target.value }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Manufacturer">
                {({ id }) => (
                  <Input
                    id={id}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).manufacturer_name ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          manufacturer_name: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Country of manufacture (ISO2)">
                {({ id }) => (
                  <Input
                    id={id}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).country_of_manufacture ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          country_of_manufacture: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Composition">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).composition ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          composition: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Usage">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).usage_directions ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          usage_directions: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Warnings">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).warnings ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          warnings: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label="Storage">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={(draftAttrs[editingItem.id] ?? editingItem.attributes).storage ?? ''}
                    onChange={(event) =>
                      setDraftAttrs((current) => ({
                        ...current,
                        [editingItem.id]: {
                          ...(current[editingItem.id] ?? editingItem.attributes),
                          storage: event.target.value,
                        },
                      }))
                    }
                  />
                )}
              </FormField>
              <label className="wp-text-muted">
                <input
                  type="checkbox"
                  checked={draftRx[editingItem.id] ?? editingItem.rx_required}
                  onChange={(event) =>
                    setDraftRx((current) => ({ ...current, [editingItem.id]: event.target.checked }))
                  }
                />{' '}
                Prescription required ({countryCode})
              </label>
              <div className="wp-form-actions">
                <Button onClick={() => void saveCopy(editingItem.id)}>Save product information</Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
        </div>
      ) : null}

      <Card>
        <h2 className="wp-section-title">Create brand</h2>
        <div className="wp-form-grid">
          <FormField label="Brand slug">
            {({ id }) => (
              <Input id={id} aria-label="Brand slug" value={brandSlug} onChange={(event) => setBrandSlug(event.target.value)} />
            )}
          </FormField>
          <FormField label="Brand name">
            {({ id }) => (
              <Input id={id} aria-label="Brand name" value={brandName} onChange={(event) => setBrandName(event.target.value)} />
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button onClick={() => void createBrand()} disabled={!brandSlug.trim() || !brandName.trim()}>
              Save brand
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Heading level={2}>Commercial rules</Heading>
        {rules.length === 0 ? (
          <EmptyState title="No pricing rules" description="Rules from /admin/catalog/rules appear here (pricing:admin)." />
        ) : (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Take (bps)</th>
                </tr>
              </thead>
              <tbody>
                {rules.slice(0, 20).map((rule, index) => (
                  <tr key={rule.id ?? `rule-${index}`}>
                    <td>{rule.countryCode ?? 'all countries'}</td>
                    <td>{rule.takeBps ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
