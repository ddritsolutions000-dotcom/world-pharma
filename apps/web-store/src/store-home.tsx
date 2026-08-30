'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  HeaderBar,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  StoreApiError,
  adjustStoreLot,
  authorizeDispensingCase,
  claimDispensingCase,
  completeDispensingCase,
  completeStorePack,
  completeStorePick,
  createStoreGrn,
  fetchCatalogOffers,
  catalogVariantId,
  catalogVariantLabel,
  fetchDispensingCase,
  fetchDispensingCases,
  fetchDispensingLots,
  isRefillDispensingCase,
  fetchStoreDashboard,
  fetchStoreExceptions,
  fetchStoreLocations,
  fetchStoreLots,
  fetchStoreOrders,
  fetchStoreOrganizations,
  mapDispensingLines,
  newIdempotencyKey,
  postStoreGrn,
  readyStoreOrder,
  receiveStoreGrn,
  rejectDispensingCase,
  startStorePick,
  validateDispensingCase,
  type DispensingCaseDetail,
  type DispensingCaseSummary,
  type DispensingLot,
  type StoreException,
  type StoreLocation,
  type StoreLot,
  type StoreOrder,
  type StoreOrganization,
  type CatalogOffer,
} from './store-api';
import { StoreSupportPanel } from './store-support-panel';

type Tab = 'dashboard' | 'inventory' | 'orders' | 'rx' | 'exceptions' | 'grn' | 'adjust' | 'support';
type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

type MapLineDraft = {
  prescription_line_id: string;
  catalog_item_id: string;
  catalog_variant_id: string;
  inventory_lot_id: string;
  quantity_dispensed: string;
  confirm_substitution: boolean;
};

function ScopeSelector({
  organizations,
  locations,
  organizationId,
  locationId,
  onOrganizationChange,
  onLocationChange,
  loading,
}: {
  organizations: StoreOrganization[];
  locations: StoreLocation[];
  organizationId: string;
  locationId: string;
  onOrganizationChange: (id: string) => void;
  onLocationChange: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingState label="Loading locations" />;
  }
  if (!organizations.length) {
    return (
      <EmptyState
        title="No store access"
        description="You need an active organization membership with a location assignment."
      />
    );
  }
  return (
    <Card>
      <FormField label="Organization">
        {({ id }) => (
          <select
            id={id}
            className="wp-input"
            value={organizationId}
            onChange={(e) => onOrganizationChange(e.target.value)}
          >
            <option value="">Select organization</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.display_name || org.legal_name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Location">
        {({ id }) => (
          <select
            id={id}
            className="wp-input"
            value={locationId}
            onChange={(e) => onLocationChange(e.target.value)}
            disabled={!organizationId}
          >
            <option value="">Select location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.kind})
              </option>
            ))}
          </select>
        )}
      </FormField>
    </Card>
  );
}

export function StoreHome() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<StoreOrganization[]>([]);
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [lots, setLots] = useState<StoreLot[]>([]);
  const [exceptions, setExceptions] = useState<StoreException | null>(null);

  const [grnLotCode, setGrnLotCode] = useState('');
  const [grnQty, setGrnQty] = useState('1');
  const [lastGrnId, setLastGrnId] = useState<string | null>(null);
  const [catalogOffers, setCatalogOffers] = useState<CatalogOffer[]>([]);
  const [catalogOfferIndex, setCatalogOfferIndex] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [adjustLotId, setAdjustLotId] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('1');
  const [adjustReason, setAdjustReason] = useState('store_adjust');

  const [dispensingCases, setDispensingCases] = useState<DispensingCaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<DispensingCaseDetail | null>(null);
  const [rejectReason, setRejectReason] = useState('clinical_mismatch');
  const [mapDrafts, setMapDrafts] = useState<MapLineDraft[]>([]);
  const [lotsVariantId, setLotsVariantId] = useState('');
  const [eligibleLots, setEligibleLots] = useState<DispensingLot[]>([]);

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof StoreApiError) {
      if (err.status === 403) {
        setViewState('forbidden');
        return;
      }
      if (err.status === 401) {
        expire();
        return;
      }
      setViewState('error');
      setErrorMessage(err.message);
      return;
    }
    setViewState('network');
  }, [expire]);

  const loadScope = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setScopeLoading(true);
    try {
      const orgRes = await fetchStoreOrganizations(token);
      setOrganizations(orgRes.data);
      if (orgRes.data.length === 1) {
        setOrganizationId(orgRes.data[0]!.id);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setScopeLoading(false);
    }
  }, [getAccessToken, handleApiError]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'customer') {
      void loadScope();
    }
  }, [session.status, session.audience, loadScope]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !organizationId) {
      setLocations([]);
      setLocationId('');
      return;
    }
    void fetchStoreLocations(token, organizationId)
      .then((res) => {
        setLocations(res.data);
        if (res.data.length === 1) {
          setLocationId(res.data[0]!.id);
        }
      })
      .catch(handleApiError);
  }, [organizationId, getAccessToken, handleApiError]);

  const loadTabData = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !organizationId || !locationId) {
      return;
    }
    setViewState('loading');
    setErrorMessage(null);
    try {
      if (tab === 'dashboard') {
        const dash = await fetchStoreDashboard(token, organizationId, locationId);
        setDashboard(dash);
      } else if (tab === 'inventory') {
        const lotPage = await fetchStoreLots(token, organizationId, locationId);
        setLots(lotPage.data);
      } else if (tab === 'orders') {
        const queue = await fetchStoreOrders(token, organizationId, locationId);
        setOrders(queue.data);
      } else if (tab === 'rx') {
        const queue = await fetchDispensingCases(token, organizationId, locationId);
        setDispensingCases(queue.cases ?? []);
        if (selectedCaseId) {
          const detail = await fetchDispensingCase(token, organizationId, locationId, selectedCaseId);
          setCaseDetail(detail);
          setMapDrafts(
            (detail.lines ?? []).map((line) => {
              const existing = detail.mappings?.find((m) => m.prescription_line_id === line.id);
              return {
                prescription_line_id: line.id,
                catalog_item_id: existing?.catalog_item_id ?? line.suggested_catalog_item_id ?? '',
                catalog_variant_id: existing?.catalog_variant_id ?? '',
                inventory_lot_id: existing?.inventory_lot_id ?? '',
                quantity_dispensed: existing?.quantity_dispensed ?? line.quantity_authorized,
                confirm_substitution: existing?.confirm_substitution === true,
              };
            }),
          );
        } else {
          setCaseDetail(null);
          setMapDrafts([]);
        }
      } else if (tab === 'exceptions') {
        const ex = await fetchStoreExceptions(token, organizationId, locationId);
        setExceptions(ex);
      } else if (tab === 'grn') {
        setCatalogLoading(true);
        try {
          const offers = await fetchCatalogOffers(token, organizationId);
          setCatalogOffers(Array.isArray(offers) ? offers : []);
          setCatalogOfferIndex(0);
        } catch (err) {
          setCatalogOffers([]);
          handleApiError(err);
          return;
        } finally {
          setCatalogLoading(false);
        }
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, organizationId, locationId, tab, selectedCaseId, handleApiError]);

  useEffect(() => {
    if (organizationId && locationId) {
      void loadTabData();
    }
  }, [organizationId, locationId, tab, loadTabData]);

  const runMutation = async (fn: () => Promise<unknown>) => {
    setViewState('loading');
    try {
      await fn();
      await loadTabData();
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  };

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <main className="shell-main">
        <Heading level={1}>Store sign-in</Heading>
        <Text tone="secondary">Use OTP against the real API. Location scope is server-enforced.</Text>
        <FormField label="Email">
          {({ id }) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </FormField>
        <Button
          onClick={() => {
            void signInWithOtp(email, 'customer')
              .then(() => setSignInError(null))
              .catch((err: Error) => setSignInError(err.message));
          }}
        >
          Send OTP & sign in
        </Button>
        {signInError ? <NetworkErrorState action={{ label: 'Retry', onClick: () => setSignInError(null) }} /> : null}
      </main>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  const scoped = Boolean(organizationId && locationId);

  return (
    <>
      <HeaderBar title="Store operations">
        <Button variant="secondary" size="sm" onClick={() => expire()}>
          Expire session
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <main className="shell-main">
        <div className="wp-stack">
          <Heading level={1}>Location operations</Heading>
          <ScopeSelector
            organizations={organizations}
            locations={locations}
            organizationId={organizationId}
            locationId={locationId}
            onOrganizationChange={(id) => {
              setOrganizationId(id);
              setLocationId('');
            }}
            onLocationChange={setLocationId}
            loading={scopeLoading}
          />

          {scoped ? (
            <>
              <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['dashboard', 'inventory', 'orders', 'rx', 'exceptions', 'grn', 'adjust', 'support'] as Tab[]).map((t) => (
                  <Button key={t} variant={tab === t ? 'primary' : 'secondary'} size="sm" onClick={() => setTab(t)}>
                    {t === 'rx' ? 'Rx desk' : t}
                  </Button>
                ))}
                <Button variant="tertiary" size="sm" onClick={() => void loadTabData()}>
                  Refresh
                </Button>
              </div>

              {viewState === 'loading' ? (
                <LoadingState label={tab === 'rx' ? 'Loading dispensing queue' : 'Loading'} />
              ) : null}
              {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
              {viewState === 'network' ? (
                <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadTabData() }} />
              ) : null}
              {viewState === 'error' && errorMessage ? (
                <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadTabData() }} />
              ) : null}

              {viewState === 'idle' && tab === 'dashboard' ? (
                dashboard ? (
                  <Card>
                    <Text>Queue: {String(dashboard.queue_count ?? 0)}</Text>
                    <Text>Expiring lots: {String(dashboard.expiring_lots ?? 0)}</Text>
                    <Text>Open pick tasks: {String(dashboard.open_pick_tasks ?? 0)}</Text>
                    <Text>Open pack tasks: {String(dashboard.open_pack_tasks ?? 0)}</Text>
                  </Card>
                ) : (
                  <EmptyState title="No dashboard data" description="Select a location to load metrics." />
                )
              ) : null}

              {viewState === 'idle' && tab === 'inventory' ? (
                lots.length ? (
                  lots.map((lot) => (
                    <Card key={lot.id}>
                      <Text>
                        {lot.sku ?? lot.id.slice(0, 8)} — {lot.lot_code}
                      </Text>
                      <Text size="caption">
                        On hand {lot.on_hand} · Available {lot.available}
                        {lot.expires_on ? ` · Expires ${lot.expires_on}` : ''}
                      </Text>
                    </Card>
                  ))
                ) : (
                  <EmptyState title="No lots" description="Inventory lots for this location appear here." />
                )
              ) : null}

              {viewState === 'idle' && tab === 'orders' ? (
                orders.length ? (
                  orders.map((order) => (
                    <Card key={order.id}>
                      <Text>
                        {order.order_number} — {order.status} ({order.item_count} items)
                        {order.dispensing_case_id ? ' · Rx origin' : ''}
                      </Text>
                      <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              startStorePick(getAccessToken()!, organizationId, locationId, order.id),
                            )
                          }
                        >
                          Start pick
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              completeStorePick(getAccessToken()!, organizationId, locationId, order.id),
                            )
                          }
                        >
                          Complete pick
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              completeStorePack(getAccessToken()!, organizationId, locationId, order.id),
                            )
                          }
                        >
                          Complete pack
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            void runMutation(() =>
                              readyStoreOrder(getAccessToken()!, organizationId, locationId, order.id),
                            )
                          }
                        >
                          Ready to ship
                        </Button>
                      </div>
                    </Card>
                  ))
                ) : (
                  <EmptyState title="No orders in queue" description="Orders assigned to this location appear here." />
                )
              ) : null}

              {viewState === 'idle' && tab === 'rx' ? (
                <>
                  <Heading level={2}>Pharmacy Rx desk</Heading>
                  <Text tone="secondary">
                    Claim, verify, map lots, and complete dispensing. After DISPENSED, the patient may start a commercial
                    order (read-only order id shown here if present later).
                  </Text>
                  {!dispensingCases.length ? (
                    <EmptyState
                      title="No dispensing cases"
                      description="Issued prescriptions queued for this pharmacy appear here."
                    />
                  ) : (
                    dispensingCases.map((row) => (
                      <Card key={row.id}>
                        <Text>
                          {row.status} · Rx {row.prescription_id.slice(0, 8)} · v{row.version_number ?? '—'}
                        </Text>
                        <Text size="caption">
                          Case {row.id.slice(0, 8)} · {row.location_id ? 'claimed' : 'unclaimed'}
                        </Text>
                        <Button
                          size="sm"
                          variant={selectedCaseId === row.id ? 'primary' : 'secondary'}
                          onClick={() => setSelectedCaseId(row.id)}
                        >
                          Open case
                        </Button>
                      </Card>
                    ))
                  )}

                  {caseDetail ? (
                    <Card>
                      <Heading level={3}>Case {caseDetail.id.slice(0, 8)}</Heading>
                      <Text>{`Status: ${caseDetail.status}`}</Text>
                      {isRefillDispensingCase(caseDetail) ? (
                        <Text size="caption" tone="secondary">
                          Refill cycle — approved patient refill queued as a new dispensing case.
                        </Text>
                      ) : null}
                      <Text size="caption">{`Prescription: ${caseDetail.prescription_id}`}</Text>
                      {caseDetail.order_id ? (
                        <>
                          <Text size="caption">{`Commercial order: ${caseDetail.order_id}`}</Text>
                          <Button size="sm" variant="secondary" onClick={() => setTab('orders')}>
                            View in orders queue
                          </Button>
                        </>
                      ) : null}
                      {caseDetail.rejected_reason_code ? (
                        <Text size="caption">{`Reject reason: ${caseDetail.rejected_reason_code}`}</Text>
                      ) : null}

                      <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              claimDispensingCase(
                                getAccessToken()!,
                                organizationId,
                                locationId,
                                caseDetail.id,
                                newIdempotencyKey(),
                              ),
                            )
                          }
                        >
                          Claim
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              validateDispensingCase(
                                getAccessToken()!,
                                organizationId,
                                locationId,
                                caseDetail.id,
                                newIdempotencyKey(),
                              ),
                            )
                          }
                        >
                          Validate
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void runMutation(() =>
                              authorizeDispensingCase(
                                getAccessToken()!,
                                organizationId,
                                locationId,
                                caseDetail.id,
                                newIdempotencyKey(),
                              ),
                            )
                          }
                        >
                          Authorize
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            void runMutation(() =>
                              completeDispensingCase(
                                getAccessToken()!,
                                organizationId,
                                locationId,
                                caseDetail.id,
                                newIdempotencyKey(),
                              ),
                            )
                          }
                        >
                          Complete
                        </Button>
                      </div>

                      <FormField label="Reject reason code">
                        {({ id }) => (
                          <Input id={id} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        )}
                      </FormField>
                      <Button
                        size="sm"
                        variant="tertiary"
                        onClick={() =>
                          void runMutation(() =>
                            rejectDispensingCase(getAccessToken()!, organizationId, locationId, caseDetail.id, {
                              reason_code: rejectReason,
                              idempotency_key: newIdempotencyKey(),
                            }),
                          )
                        }
                      >
                        Reject
                      </Button>

                      <Heading level={3}>Map lines</Heading>
                      {(caseDetail.lines ?? []).map((line) => {
                        const draft = mapDrafts.find((d) => d.prescription_line_id === line.id);
                        if (!draft) {
                          return null;
                        }
                        const updateDraft = (patch: Partial<MapLineDraft>) => {
                          setMapDrafts((prev) =>
                            prev.map((row) =>
                              row.prescription_line_id === line.id ? { ...row, ...patch } : row,
                            ),
                          );
                        };
                        return (
                          <Card key={line.id}>
                            <Text size="caption">
                              {`${line.line_number}. ${line.clinical_concept_label} · qty ${line.quantity_authorized}`}
                            </Text>
                            <FormField label="Catalog item ID">
                              {({ id }) => (
                                <Input
                                  id={id}
                                  value={draft.catalog_item_id}
                                  onChange={(e) => updateDraft({ catalog_item_id: e.target.value })}
                                />
                              )}
                            </FormField>
                            <FormField label="Catalog variant ID">
                              {({ id }) => (
                                <Input
                                  id={id}
                                  value={draft.catalog_variant_id}
                                  onChange={(e) => updateDraft({ catalog_variant_id: e.target.value })}
                                />
                              )}
                            </FormField>
                            <FormField label="Inventory lot ID">
                              {({ id }) => (
                                <Input
                                  id={id}
                                  value={draft.inventory_lot_id}
                                  onChange={(e) => updateDraft({ inventory_lot_id: e.target.value })}
                                />
                              )}
                            </FormField>
                            <FormField label="Quantity dispensed">
                              {({ id }) => (
                                <Input
                                  id={id}
                                  value={draft.quantity_dispensed}
                                  onChange={(e) => updateDraft({ quantity_dispensed: e.target.value })}
                                />
                              )}
                            </FormField>
                            <label>
                              <input
                                type="checkbox"
                                checked={draft.confirm_substitution}
                                onChange={(e) => updateDraft({ confirm_substitution: e.target.checked })}
                              />{' '}
                              Confirm substitution
                            </label>
                          </Card>
                        );
                      })}
                      <Button
                        size="sm"
                        onClick={() =>
                          void runMutation(() =>
                            mapDispensingLines(getAccessToken()!, organizationId, locationId, caseDetail.id, {
                              lines: mapDrafts,
                              idempotency_key: newIdempotencyKey(),
                            }),
                          )
                        }
                      >
                        Save line mappings
                      </Button>

                      <Heading level={3}>Eligible lots</Heading>
                      <FormField label="Variant ID">
                        {({ id }) => (
                          <Input id={id} value={lotsVariantId} onChange={(e) => setLotsVariantId(e.target.value)} />
                        )}
                      </FormField>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const token = getAccessToken();
                          if (!token || !lotsVariantId) {
                            return;
                          }
                          void runMutation(async () => {
                            const res = await fetchDispensingLots(
                              token,
                              organizationId,
                              locationId,
                              lotsVariantId,
                            );
                            setEligibleLots(res.lots ?? []);
                          });
                        }}
                      >
                        Fetch eligible lots
                      </Button>
                      {eligibleLots.length ? (
                        eligibleLots.map((lot) => (
                          <Text key={lot.id} size="caption">
                            {`${lot.lot_code} · avail ${lot.available}${lot.expires_on ? ` · exp ${lot.expires_on}` : ''} · ${lot.id.slice(0, 8)}`}
                          </Text>
                        ))
                      ) : (
                        <Text size="caption" tone="secondary">
                          No eligible lots loaded.
                        </Text>
                      )}
                    </Card>
                  ) : null}
                </>
              ) : null}

              {viewState === 'idle' && tab === 'exceptions' ? (
                exceptions &&
                (exceptions.pick_tasks.length || exceptions.pack_tasks.length) ? (
                  <>
                    {exceptions.pick_tasks.map((task) => (
                      <Card key={task.id}>
                        <Text>
                          Pick — {task.order_number}: {task.picked_qty}/{task.required_qty} ({task.status})
                        </Text>
                      </Card>
                    ))}
                    {exceptions.pack_tasks.map((task) => (
                      <Card key={task.id}>
                        <Text>
                          Pack — {task.order_number}: {task.status}
                          {task.exception ? ` — ${task.exception}` : ''}
                        </Text>
                      </Card>
                    ))}
                  </>
                ) : (
                  <EmptyState title="No exceptions" description="Open pick/pack exceptions appear here." />
                )
              ) : null}

              {viewState === 'idle' && tab === 'grn' ? (
                <Card>
                  <Heading level={2}>Goods receipt</Heading>
                  {catalogLoading ? <LoadingState label="Loading catalog offers" /> : null}
                  {!catalogLoading && catalogOffers.length ? (
                    <>
                      <Text>
                        Variant:{' '}
                        {catalogVariantLabel(catalogOffers[catalogOfferIndex]!)}
                      </Text>
                      {catalogOffers.length > 1 ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setCatalogOfferIndex((index) => (index + 1) % catalogOffers.length)
                          }
                        >
                          Next variant
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {!catalogLoading && !catalogOffers.length ? (
                    <EmptyState
                      title="No catalog offers"
                      description="Link catalog offers to this seller organization before receiving stock."
                    />
                  ) : null}
                  <FormField label="Lot code">
                    {({ id }) => <Input id={id} value={grnLotCode} onChange={(e) => setGrnLotCode(e.target.value)} />}
                  </FormField>
                  <FormField label="Quantity">
                    {({ id }) => <Input id={id} value={grnQty} onChange={(e) => setGrnQty(e.target.value)} />}
                  </FormField>
                  <Button
                    onClick={() => {
                      const token = getAccessToken();
                      const selected = catalogOffers[catalogOfferIndex];
                      const variantId = selected ? catalogVariantId(selected) : '';
                      if (!token || !variantId || !grnLotCode) {
                        return;
                      }
                      void runMutation(async () => {
                        const created = (await createStoreGrn(token, organizationId, locationId, {
                          idempotency_key: newIdempotencyKey(),
                          lines: [
                            {
                              variant_id: variantId,
                              lot_code: grnLotCode,
                              qty: Number(grnQty) || 1,
                            },
                          ],
                        })) as { id: string };
                        setLastGrnId(created.id);
                      });
                    }}
                  >
                    Create GRN
                  </Button>
                  {lastGrnId ? (
                    <>
                      <Text size="caption">Last GRN: {lastGrnId}</Text>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void runMutation(() =>
                            receiveStoreGrn(getAccessToken()!, organizationId, locationId, lastGrnId),
                          )
                        }
                      >
                        Receive
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          void runMutation(() =>
                            postStoreGrn(getAccessToken()!, organizationId, locationId, lastGrnId),
                          )
                        }
                      >
                        Post to inventory
                      </Button>
                    </>
                  ) : null}
                </Card>
              ) : null}

              {viewState === 'idle' && tab === 'adjust' ? (
                <Card>
                  <Heading level={2}>Inventory adjustment</Heading>
                  <FormField label="Lot ID">
                    {({ id }) => (
                      <Input id={id} value={adjustLotId} onChange={(e) => setAdjustLotId(e.target.value)} />
                    )}
                  </FormField>
                  <FormField label="Qty delta (+/-)">
                    {({ id }) => (
                      <Input id={id} value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
                    )}
                  </FormField>
                  <FormField label="Reason code">
                    {({ id }) => (
                      <Input id={id} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                    )}
                  </FormField>
                  <Button
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token || !adjustLotId) {
                        return;
                      }
                      void runMutation(() =>
                        adjustStoreLot(token, organizationId, locationId, {
                          lot_id: adjustLotId,
                          qty_delta: Number(adjustDelta) || 0,
                          reason_code: adjustReason,
                          idempotency_key: newIdempotencyKey(),
                        }),
                      );
                    }}
                  >
                    Submit adjustment
                  </Button>
                </Card>
              ) : null}

              {viewState === 'idle' && tab === 'support' && getAccessToken() ? (
                <StoreSupportPanel
                  organizationId={organizationId}
                  locationId={locationId}
                  token={getAccessToken()!}
                  onError={(err) => {
                    if (err instanceof StoreApiError && (err.status === 401 || err.status === 403)) {
                      setViewState(err.status === 403 ? 'forbidden' : 'network');
                      return;
                    }
                    setErrorMessage((err as Error).message);
                    setViewState('error');
                  }}
                />
              ) : null}
            </>
          ) : organizations.length ? (
            <EmptyState title="Select a location" description="Choose organization and location to begin." />
          ) : null}
        </div>
      </main>
    </>
  );
}
