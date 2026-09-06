import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View } from 'react-native';
import { createSessionStore } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeListRow,
  NativeListSection,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeOtpSignIn,
  NativePageHeader,
  NativeSessionExpiredState,
  NativeText,
  OpsKpiRow,
  OpsShell,
  OpsWorkCard,
  OpsAccessGate,
} from '@world-pharma/ui-kit/native';
import {
  StoreApiError,
  adjustLot,
  authorizeDispensingCase,
  catalogVariantId,
  catalogVariantLabel,
  claimDispensingCase,
  completeDispensingCase,
  completePack,
  completePick,
  createGrn,
  fetchCatalogOffers,
  fetchDashboard,
  fetchDispensingCase,
  fetchDispensingCases,
  fetchDispensingLots,
  isRefillDispensingCase,
  fetchExceptions,
  fetchLocations,
  fetchLots,
  fetchOrders,
  fetchOrganizations,
  fetchStoreSupportTickets,
  createStoreSupportTicket,
  fetchStoreNotificationInbox,
  markStoreNotificationRead,
  mapDispensingLines,
  newIdempotencyKey,
  postGrn,
  readyOrder,
  rejectDispensingCase,
  startPick,
  validateDispensingCase,
  type CatalogOffer,
  type DispensingCaseDetail,
  type DispensingCaseSummary,
  type DispensingLot,
  type MapDispenseLineInput,
  type StoreSupportTicket,
  type StoreInboxItem,
} from './store-api';
import { dispensingStatusLabel, storeOrderNextAction, storeOrderNextActionLabel, storeOrderStatusLabel } from './store-status-labels';

type MainTab = 'dashboard' | 'inventory' | 'orders' | 'rx' | 'more';
type MoreScreen = 'menu' | 'exceptions' | 'grn' | 'adjust' | 'support' | 'inbox';
type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

const STAFF_EMAIL = 'sandbox-store@dev.local';

const MAIN_TABS: Array<{ id: MainTab; label: string }> = [
  { id: 'dashboard', label: 'Floor' },
  { id: 'inventory', label: 'Stock' },
  { id: 'orders', label: 'Pick' },
  { id: 'rx', label: 'Rx' },
  { id: 'more', label: 'More' },
];

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());

  const [organizations, setOrganizations] = useState<Array<{ id: string; display_name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [orgIndex, setOrgIndex] = useState(0);
  const [locIndex, setLocIndex] = useState(0);

  const [tab, setTab] = useState<MainTab>('dashboard');
  const [moreScreen, setMoreScreen] = useState<MoreScreen>('menu');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [summary, setSummary] = useState<string | null>(null);
  const [dashKpi, setDashKpi] = useState({ queue: 0, expiring: 0, pick: 0, pack: 0 });
  const [rows, setRows] = useState<string[]>([]);
  const [orderQueue, setOrderQueue] = useState<Array<{ id: string; order_number: string; status: string }>>([]);

  const [catalogOffers, setCatalogOffers] = useState<CatalogOffer[]>([]);
  const [offerIndex, setOfferIndex] = useState(0);
  const [grnLotCode, setGrnLotCode] = useState('');
  const [lastGrnId, setLastGrnId] = useState<string | null>(null);
  const [adjustLotId, setAdjustLotId] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('1');

  const [dispensingCases, setDispensingCases] = useState<DispensingCaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<DispensingCaseDetail | null>(null);
  const [rejectReason, setRejectReason] = useState('clinical_mismatch');
  const [mapDrafts, setMapDrafts] = useState<MapDispenseLineInput[]>([]);
  const [lotsVariantId, setLotsVariantId] = useState('');
  const [eligibleLots, setEligibleLots] = useState<DispensingLot[]>([]);
  const [mapLineIndex, setMapLineIndex] = useState(0);
  const [supportTickets, setSupportTickets] = useState<StoreSupportTicket[]>([]);
  const [inbox, setInbox] = useState<StoreInboxItem[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportReferenceType, setSupportReferenceType] = useState('order');
  const [supportReferenceId, setSupportReferenceId] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const scoped = Boolean(token && organizationId && locationId);
  const selectedOffer = catalogOffers[offerIndex] ?? catalogOffers[0];

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof StoreApiError) {
        if (err.status === 403) {
          setDenyDetail(err.message);
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          store.expire();
          setSession(store.snapshot());
          setViewState('expired');
          return;
        }
      }
      setViewState('network');
    },
    [store],
  );

  const loadScope = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const orgs = await fetchOrganizations(token);
      const usable: Array<{ id: string; display_name: string }> = [];
      let pickedOrgId = '';
      let pickedLocs: Array<{ id: string; name: string }> = [];
      for (const org of orgs.data) {
        try {
          const locs = await fetchLocations(token, org.id);
          if (locs.data.length) {
            usable.push(org);
            if (!pickedOrgId) {
              pickedOrgId = org.id;
              pickedLocs = locs.data.map((row) => ({ id: row.id, name: row.name }));
            }
          }
        } catch {
          /* Staff may belong to a catalog vendor org that is not a pharmacy floor. */
        }
      }
      setOrganizations(usable);
      if (pickedOrgId) {
        const idx = Math.max(0, usable.findIndex((row) => row.id === pickedOrgId));
        setOrgIndex(idx);
        setOrganizationId(pickedOrgId);
        setLocations(pickedLocs);
        setLocIndex(0);
        setLocationId(pickedLocs[0]?.id ?? '');
        try {
          const offers = await fetchCatalogOffers(token, pickedOrgId);
          setCatalogOffers(Array.isArray(offers) ? offers : []);
          setOfferIndex(0);
        } catch {
          setCatalogOffers([]);
        }
      } else {
        setOrganizationId('');
        setLocationId('');
        setLocations([]);
        setCatalogOffers([]);
      }
      setDenyDetail(null);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, orgIndex, locIndex, handleError]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void loadScope();
    }
  }, [session.status, loadScope]);

  const loadTab = useCallback(async () => {
    if (!token || !organizationId || !locationId) {
      return;
    }
    if (tab === 'more' && moreScreen !== 'exceptions') {
      return;
    }
    setViewState('loading');
    try {
      if (tab === 'dashboard') {
        const dash = await fetchDashboard(token, organizationId, locationId);
        const queue = Number(dash.queue_count ?? 0);
        const expiring = Number(dash.expiring_lots ?? 0);
        const pick = Number(dash.open_pick_tasks ?? 0);
        const pack = Number(dash.open_pack_tasks ?? 0);
        setDashKpi({ queue, expiring, pick, pack });
        setSummary(`Queue ${queue} · Expiring ${expiring} · Pick ${pick} · Pack ${pack}`);
        setRows([]);
      } else if (tab === 'inventory') {
        const lots = await fetchLots(token, organizationId, locationId);
        setRows(lots.data.map((l) => `${l.sku ?? l.id.slice(0, 8)} ${l.lot_code} · ${l.on_hand}`));
        setSummary(null);
      } else if (tab === 'orders') {
        const orders = await fetchOrders(token, organizationId, locationId);
        setOrderQueue(orders.data);
        setRows([]);
        setSummary(`${orders.data.length} order(s)`);
      } else if (tab === 'rx') {
        const queue = await fetchDispensingCases(token, organizationId, locationId);
        setDispensingCases(queue.cases ?? []);
        setRows(
          (queue.cases ?? []).map(
            (c) => `${dispensingStatusLabel(c.status)} · Rx ${c.prescription_id.slice(0, 8)} · v${c.version_number ?? '—'}`,
          ),
        );
        setSummary(`${queue.cases?.length ?? 0} dispensing case(s)`);
        const caseId = selectedCaseId ?? queue.cases?.[0]?.id ?? null;
        if (caseId) {
          setSelectedCaseId(caseId);
          const detail = await fetchDispensingCase(token, organizationId, locationId, caseId);
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
          setMapLineIndex(0);
        } else {
          setCaseDetail(null);
          setMapDrafts([]);
        }
      } else if (tab === 'more' && moreScreen === 'exceptions') {
        const ex = await fetchExceptions(token, organizationId, locationId);
        setRows([
          ...ex.pick_tasks.map((t) => `Pick ${t.order_number} ${storeOrderStatusLabel(t.status)}`),
          ...ex.pack_tasks.map((t) => `Pack ${t.order_number} ${storeOrderStatusLabel(t.status)}${t.exception ? ` ${t.exception}` : ''}`),
        ]);
        setSummary(null);
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, organizationId, locationId, tab, moreScreen, selectedCaseId, handleError]);

  useEffect(() => {
    if (scoped && (tab !== 'more' || moreScreen === 'exceptions')) {
      void loadTab();
    }
  }, [scoped, tab, moreScreen, loadTab]);

  const loadSupport = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchStoreSupportTickets(token);
      setSupportTickets(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadInbox = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchStoreNotificationInbox(token);
      setInbox(res.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    if (scoped && tab === 'more' && moreScreen === 'inbox') {
      void loadInbox();
    }
  }, [scoped, tab, moreScreen, loadInbox]);

  useEffect(() => {
    if (scoped && tab === 'more' && moreScreen === 'support') {
      void loadSupport();
    }
  }, [scoped, tab, moreScreen, loadSupport]);

  const runMutation = async (fn: () => Promise<unknown>) => {
    setViewState('loading');
    try {
      await fn();
      if (tab !== 'more' || moreScreen === 'exceptions') {
        await loadTab();
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  if (session.status !== 'authenticated') {
    return (
      <NativeOtpSignIn
        portalTitle="World Pharma Pharmacy"
        portalDescription="Store operations console — pick, pack, inventory, and Rx desk for assigned pharmacies."
        audience="customer"
        staffEmail={STAFF_EMAIL}
        onAuthenticated={({ accessToken, refreshToken }) => {
          store.authenticate({
            accessToken,
            refreshToken,
            audience: 'customer',
          });
          setSession(store.snapshot());
          setViewState('idle');
        }}
      />
    );
  }

  if (viewState === 'expired') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeSessionExpiredState
          onAction={() => {
            store.signOut();
            setSession(store.snapshot());
          }}
        />
      </SafeAreaView>
    );
  }

  const orgLabel = organizations[orgIndex]?.display_name ?? organizations[0]?.display_name ?? '—';
  const locLabel = locations[locIndex]?.name ?? locations[0]?.name ?? '—';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }}>
      <OpsShell
        product="Pharmacy WMS"
        accent="#2F855A"
        status={locLabel}
        tabs={MAIN_TABS}
        active={tab}
        onSelect={(id) => {
          setTab(id as MainTab);
          setMoreScreen('menu');
        }}
      >
        {organizations.length ? (
          <NativeCard>
            <NativeText>{`Org: ${orgLabel}`}</NativeText>
            {organizations.length > 1 ? (
              <NativeButton
                label="Switch org"
                variant="secondary"
                onPress={() => {
                  const next = (orgIndex + 1) % organizations.length;
                  setOrgIndex(next);
                  setOrganizationId(organizations[next]!.id);
                }}
              />
            ) : null}
            <NativeText>{`Location: ${locLabel}`}</NativeText>
            {locations.length > 1 ? (
              <NativeButton
                label="Switch location"
                variant="secondary"
                onPress={() => {
                  const next = (locIndex + 1) % locations.length;
                  setLocIndex(next);
                  setLocationId(locations[next]!.id);
                }}
              />
            ) : null}
          </NativeCard>
        ) : (
          <NativeEmptyState title="No store access" description="Organization membership required." />
        )}

        {viewState === 'loading' ? (
          <NativeLoadingState mode="dark" title={tab === 'rx' ? 'Loading dispensing queue' : 'Loading'} />
        ) : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail={STAFF_EMAIL}
            onRetry={() => void loadScope()}
            onSignOut={() => {
              store.signOut();
              setSession(store.snapshot());
              setViewState('idle');
              setDenyDetail(null);
            }}
          />
        ) : null}
        {viewState === 'network' ? <NativeNetworkErrorState mode="dark" onRetry={() => void loadTab()} /> : null}

        {viewState === 'idle' && tab === 'dashboard' ? (
          <>
            <OpsKpiRow
              items={[
                { label: 'Queue', value: dashKpi.queue },
                { label: 'Expiring', value: dashKpi.expiring },
                { label: 'Pick', value: dashKpi.pick },
                { label: 'Pack', value: dashKpi.pack },
              ]}
            />
            {summary ? (
              <NativeCard>
                <NativeText>{summary}</NativeText>
              </NativeCard>
            ) : null}
          </>
        ) : null}
        {viewState === 'idle' && tab === 'orders' && !orderQueue.length && scoped ? (
          <NativeEmptyState title="No orders" description="Allocated store orders appear here." />
        ) : null}
        {viewState === 'idle' && tab === 'inventory' && !rows.length && scoped ? (
          <NativeEmptyState title="Nothing here" description="No data for this view." />
        ) : null}
        {viewState === 'idle' && (tab === 'inventory' || (tab === 'more' && moreScreen === 'exceptions'))
          ? rows.map((row) => (
              <NativeCard key={row}>
                <NativeText>{row}</NativeText>
              </NativeCard>
            ))
          : null}

        {viewState === 'idle' && tab === 'orders' && scoped && orderQueue.length
          ? orderQueue.map((order) => {
              const next = storeOrderNextAction(order.status);
              const label = storeOrderNextActionLabel(order.status);
              return (
                <OpsWorkCard
                  key={order.id}
                  kicker="ORDER"
                  title={order.order_number}
                  meta={storeOrderStatusLabel(order.status)}
                  status={label ?? storeOrderStatusLabel(order.status)}
                  actionLabel={label ?? undefined}
                  onAction={
                    next && label
                      ? () =>
                          void runMutation(async () => {
                            if (next === 'pick/start') {
                              await startPick(token!, organizationId, locationId, order.id);
                            } else if (next === 'pick/complete') {
                              await completePick(token!, organizationId, locationId, order.id);
                            } else if (next === 'pack/complete') {
                              await completePack(token!, organizationId, locationId, order.id);
                            } else {
                              await readyOrder(token!, organizationId, locationId, order.id);
                            }
                          })
                      : undefined
                  }
                />
              );
            })
          : null}

        {viewState === 'idle' && tab === 'rx' && scoped ? (
          <>
            {summary ? <NativeText>{summary}</NativeText> : null}
            {!dispensingCases.length ? (
              <NativeEmptyState
                title="No dispensing cases"
                description="Issued prescriptions queued for this pharmacy appear here."
              />
            ) : (
              rows.map((row) => <NativeText key={row}>{row}</NativeText>)
            )}
            {dispensingCases.length > 1 ? (
              <NativeButton
                label="Next case"
                variant="secondary"
                onPress={() => {
                  const idx = Math.max(
                    0,
                    dispensingCases.findIndex((c) => c.id === selectedCaseId),
                  );
                  const next = dispensingCases[(idx + 1) % dispensingCases.length];
                  if (next) {
                    setSelectedCaseId(next.id);
                  }
                }}
              />
            ) : null}
            {caseDetail ? (
              <NativeCard>
                <NativeText variant="h2">{`Case ${caseDetail.status}`}</NativeText>
                <NativeText variant="caption">{`Rx ${caseDetail.prescription_id.slice(0, 8)}`}</NativeText>
                {isRefillDispensingCase(caseDetail) ? (
                  <NativeText variant="caption">Refill cycle — approved patient refill case.</NativeText>
                ) : null}
                {caseDetail.order_id ? (
                  <NativeText variant="caption">{`Commercial order: ${caseDetail.order_id}`}</NativeText>
                ) : null}
                <NativeButton
                  label="Claim"
                  variant="secondary"
                  onPress={() =>
                    void runMutation(() =>
                      claimDispensingCase(token!, organizationId, locationId, caseDetail.id, newIdempotencyKey()),
                    )
                  }
                />
                <NativeButton
                  label="Validate"
                  variant="secondary"
                  onPress={() =>
                    void runMutation(() =>
                      validateDispensingCase(
                        token!,
                        organizationId,
                        locationId,
                        caseDetail.id,
                        newIdempotencyKey(),
                      ),
                    )
                  }
                />
                <NativeButton
                  label="Authorize"
                  variant="secondary"
                  onPress={() =>
                    void runMutation(() =>
                      authorizeDispensingCase(
                        token!,
                        organizationId,
                        locationId,
                        caseDetail.id,
                        newIdempotencyKey(),
                      ),
                    )
                  }
                />
                <NativeInput label="Reject reason" value={rejectReason} onChangeText={setRejectReason} />
                <NativeButton
                  label="Reject"
                  variant="secondary"
                  onPress={() =>
                    void runMutation(() =>
                      rejectDispensingCase(token!, organizationId, locationId, caseDetail.id, {
                        reason_code: rejectReason,
                        idempotency_key: newIdempotencyKey(),
                      }),
                    )
                  }
                />
                {mapDrafts.length ? (
                  <>
                    <NativeText variant="caption">
                      {`Map line ${mapLineIndex + 1}/${mapDrafts.length}: ${caseDetail.lines?.[mapLineIndex]?.clinical_concept_label ?? ''}`}
                    </NativeText>
                    <NativeInput
                      label="Catalog item ID"
                      value={mapDrafts[mapLineIndex]?.catalog_item_id ?? ''}
                      onChangeText={(value) =>
                        setMapDrafts((prev) =>
                          prev.map((row, i) => (i === mapLineIndex ? { ...row, catalog_item_id: value } : row)),
                        )
                      }
                    />
                    <NativeInput
                      label="Catalog variant ID"
                      value={mapDrafts[mapLineIndex]?.catalog_variant_id ?? ''}
                      onChangeText={(value) =>
                        setMapDrafts((prev) =>
                          prev.map((row, i) => (i === mapLineIndex ? { ...row, catalog_variant_id: value } : row)),
                        )
                      }
                    />
                    <NativeInput
                      label="Inventory lot ID"
                      value={mapDrafts[mapLineIndex]?.inventory_lot_id ?? ''}
                      onChangeText={(value) =>
                        setMapDrafts((prev) =>
                          prev.map((row, i) => (i === mapLineIndex ? { ...row, inventory_lot_id: value } : row)),
                        )
                      }
                    />
                    <NativeInput
                      label="Qty dispensed"
                      value={mapDrafts[mapLineIndex]?.quantity_dispensed ?? ''}
                      onChangeText={(value) =>
                        setMapDrafts((prev) =>
                          prev.map((row, i) => (i === mapLineIndex ? { ...row, quantity_dispensed: value } : row)),
                        )
                      }
                    />
                    {mapDrafts.length > 1 ? (
                      <NativeButton
                        label="Next map line"
                        variant="secondary"
                        onPress={() => setMapLineIndex((i) => (i + 1) % mapDrafts.length)}
                      />
                    ) : null}
                    <NativeButton
                      label="Save line mappings"
                      onPress={() =>
                        void runMutation(() =>
                          mapDispensingLines(token!, organizationId, locationId, caseDetail.id, {
                            lines: mapDrafts,
                            idempotency_key: newIdempotencyKey(),
                          }),
                        )
                      }
                    />
                  </>
                ) : null}
                <NativeInput label="Variant ID for lots" value={lotsVariantId} onChangeText={setLotsVariantId} />
                <NativeButton
                  label="Fetch eligible lots"
                  variant="secondary"
                  onPress={() =>
                    void runMutation(async () => {
                      if (!lotsVariantId) {
                        return;
                      }
                      const res = await fetchDispensingLots(
                        token!,
                        organizationId,
                        locationId,
                        lotsVariantId,
                      );
                      setEligibleLots(res.lots ?? []);
                    })
                  }
                />
                {eligibleLots.map((lot) => (
                  <NativeText key={lot.id} variant="caption">
                    {`${lot.lot_code} · avail ${lot.available}${lot.expires_on ? ` · exp ${lot.expires_on}` : ''}`}
                  </NativeText>
                ))}
                <NativeButton
                  label="Complete"
                  onPress={() =>
                    void runMutation(() =>
                      completeDispensingCase(
                        token!,
                        organizationId,
                        locationId,
                        caseDetail.id,
                        newIdempotencyKey(),
                      ),
                    )
                  }
                />
              </NativeCard>
            ) : null}
          </>
        ) : null}

        {viewState === 'idle' && tab === 'more' && moreScreen === 'menu' ? (
          <>
            <NativePageHeader title="More" subtitle="Inbox, stock, and help for this store." />
            <NativeListSection title="Operations">
              <NativeListRow label="Inbox" hint="Order and ops notices" onPress={() => setMoreScreen('inbox')} />
              <NativeListRow label="Exceptions" hint="Pick and pack issues" onPress={() => setMoreScreen('exceptions')} />
              <NativeListRow label="Receive stock (GRN)" onPress={() => setMoreScreen('grn')} />
              <NativeListRow label="Adjust lot" onPress={() => setMoreScreen('adjust')} />
              <NativeListRow label="Get help" hint="Support tickets" onPress={() => setMoreScreen('support')} />
            </NativeListSection>
            <NativeButton
              label="Sign out"
              variant="secondary"
              onPress={() => {
                store.signOut();
                setSession(store.snapshot());
              }}
            />
          </>
        ) : null}

        {tab === 'more' && moreScreen === 'inbox' && scoped ? (
          <NativeCard>
            <NativeButton label="Back" variant="secondary" onPress={() => setMoreScreen('menu')} />
            <NativeText variant="h2">Store inbox</NativeText>
            {inbox.length ? (
              inbox.map((row) => (
                <View key={row.id} style={{ gap: 6, marginTop: 8 }}>
                  <NativeText>{row.title}</NativeText>
                  <NativeText variant="caption">{row.body}</NativeText>
                  {!row.read ? (
                    <NativeButton
                      label="Mark as read"
                      variant="secondary"
                      onPress={() =>
                        void runMutation(async () => {
                          await markStoreNotificationRead(token!, row.id);
                          await loadInbox();
                        })
                      }
                    />
                  ) : (
                    <NativeText variant="caption">Read</NativeText>
                  )}
                </View>
              ))
            ) : (
              <NativeEmptyState title="Inbox empty" description="Order and ops notices appear here." />
            )}
          </NativeCard>
        ) : null}

        {tab === 'more' && moreScreen === 'support' && scoped ? (
          <NativeCard>
            <NativeButton label="Back" variant="secondary" onPress={() => setMoreScreen('menu')} />
            <NativeText variant="h2">Store support</NativeText>
            <NativeText variant="caption">
              Shared support kernel. No clinical content in ticket bodies.
            </NativeText>
            <NativeInput label="Subject" value={supportSubject} onChangeText={setSupportSubject} />
            <NativeInput label="Details" value={supportBody} onChangeText={setSupportBody} />
            <NativeInput
              label="Reference type"
              value={supportReferenceType}
              onChangeText={setSupportReferenceType}
            />
            <NativeInput
              label="Reference ID (optional)"
              value={supportReferenceId}
              onChangeText={setSupportReferenceId}
            />
            {supportMessage ? <NativeText variant="caption">{supportMessage}</NativeText> : null}
            <NativeButton
              label="Submit ticket"
              onPress={() =>
                void runMutation(async () => {
                  if (!supportSubject.trim() || !supportBody.trim()) {
                    setSupportMessage('Subject and body are required.');
                    return;
                  }
                  if (/diagnosis|clinical|prescription instruction|dosage/i.test(`${supportSubject} ${supportBody}`)) {
                    setSupportMessage('Do not paste clinical content into support tickets.');
                    return;
                  }
                  await createStoreSupportTicket(token!, {
                    organization_id: organizationId,
                    location_id: locationId,
                    subject: supportSubject.trim(),
                    body: supportBody.trim(),
                    reference_type: supportReferenceId.trim() ? supportReferenceType.trim() : undefined,
                    reference_id: supportReferenceId.trim() || undefined,
                  });
                  setSupportSubject('');
                  setSupportBody('');
                  setSupportReferenceId('');
                  setSupportMessage('Ticket recorded.');
                  await loadSupport();
                })
              }
            />
            {supportTickets.length ? (
              supportTickets.map((row) => (
                <NativeText key={row.id} variant="caption">
                  {`${row.subject} — ${row.status}`}
                </NativeText>
              ))
            ) : (
              <NativeEmptyState title="No tickets" description="Store support tickets you file appear here." />
            )}
          </NativeCard>
        ) : null}

        {tab === 'more' && moreScreen === 'grn' && scoped ? (
          <NativeCard>
            <NativeButton label="Back" variant="secondary" onPress={() => setMoreScreen('menu')} />
            {catalogOffers.length ? (
              <>
                <NativeText>{`Variant: ${catalogVariantLabel(selectedOffer!)}`}</NativeText>
                {catalogOffers.length > 1 ? (
                  <NativeButton
                    label="Next variant"
                    variant="secondary"
                    onPress={() => setOfferIndex((index) => (index + 1) % catalogOffers.length)}
                  />
                ) : null}
              </>
            ) : (
              <NativeText variant="caption">No catalog offers for this organization.</NativeText>
            )}
            <NativeInput label="Lot code" value={grnLotCode} onChangeText={setGrnLotCode} />
            <NativeButton
              label="Create & post GRN"
              onPress={() =>
                void runMutation(async () => {
                  const variantId = selectedOffer ? catalogVariantId(selectedOffer) : '';
                  if (!variantId) {
                    throw new StoreApiError('variant_required', 400);
                  }
                  const created = (await createGrn(token!, organizationId, locationId, {
                    idempotency_key: newIdempotencyKey(),
                    lines: [{ variant_id: variantId, lot_code: grnLotCode, qty: 1 }],
                  })) as { id: string };
                  setLastGrnId(created.id);
                  await postGrn(token!, organizationId, locationId, created.id);
                })
              }
            />
            {lastGrnId ? <NativeText>{`GRN ${lastGrnId.slice(0, 8)} posted`}</NativeText> : null}
          </NativeCard>
        ) : null}

        {tab === 'more' && moreScreen === 'adjust' && scoped ? (
          <NativeCard>
            <NativeButton label="Back" variant="secondary" onPress={() => setMoreScreen('menu')} />
            <NativeInput label="Lot ID" value={adjustLotId} onChangeText={setAdjustLotId} />
            <NativeInput label="Qty delta" value={adjustDelta} onChangeText={setAdjustDelta} />
            <NativeButton
              label="Adjust"
              onPress={() =>
                void runMutation(() =>
                  adjustLot(token!, organizationId, locationId, {
                    lot_id: adjustLotId,
                    qty_delta: Number(adjustDelta) || 0,
                    reason_code: 'store_adjust',
                    idempotency_key: newIdempotencyKey(),
                  }),
                )
              }
            />
          </NativeCard>
        ) : null}
      </OpsShell>
    </SafeAreaView>
  );
}
