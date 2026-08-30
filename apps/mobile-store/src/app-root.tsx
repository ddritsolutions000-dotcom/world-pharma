import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View } from 'react-native';
import { createSessionStore, requestOtp, verifyOtp } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeSessionExpiredState,
  NativeText,
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
} from './store-api';

type MainTab = 'dashboard' | 'inventory' | 'orders' | 'rx' | 'more';
type MoreScreen = 'menu' | 'exceptions' | 'grn' | 'adjust' | 'support';
type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

const MAIN_TABS: Array<{ id: MainTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'orders', label: 'Orders' },
  { id: 'rx', label: 'Rx desk' },
  { id: 'more', label: 'More' },
];

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

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
  const [rows, setRows] = useState<string[]>([]);

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
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportReferenceType, setSupportReferenceType] = useState('order');
  const [supportReferenceId, setSupportReferenceId] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  const token = store.getAccessToken();
  const scoped = Boolean(token && organizationId && locationId);
  const selectedOffer = catalogOffers[offerIndex] ?? catalogOffers[0];

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof StoreApiError) {
        if (err.status === 403) {
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
      setOrganizations(orgs.data);
      if (orgs.data.length) {
        const oid = orgs.data[orgIndex]?.id ?? orgs.data[0]!.id;
        setOrganizationId(oid);
        const locs = await fetchLocations(token, oid);
        setLocations(locs.data);
        if (locs.data.length) {
          setLocationId(locs.data[locIndex]?.id ?? locs.data[0]!.id);
        }
        try {
          const offers = await fetchCatalogOffers(token, oid);
          setCatalogOffers(Array.isArray(offers) ? offers : []);
          setOfferIndex(0);
        } catch {
          setCatalogOffers([]);
        }
      }
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
        setSummary(
          `Queue ${String(dash.queue_count ?? 0)} · Expiring ${String(dash.expiring_lots ?? 0)} · Pick ${String(dash.open_pick_tasks ?? 0)} · Pack ${String(dash.open_pack_tasks ?? 0)}`,
        );
        setRows([]);
      } else if (tab === 'inventory') {
        const lots = await fetchLots(token, organizationId, locationId);
        setRows(lots.data.map((l) => `${l.sku ?? l.id.slice(0, 8)} ${l.lot_code} · ${l.on_hand}`));
        setSummary(null);
      } else if (tab === 'orders') {
        const orders = await fetchOrders(token, organizationId, locationId);
        setRows(orders.data.map((o) => `${o.order_number} — ${o.status}`));
        setSummary(null);
      } else if (tab === 'rx') {
        const queue = await fetchDispensingCases(token, organizationId, locationId);
        setDispensingCases(queue.cases ?? []);
        setRows(
          (queue.cases ?? []).map(
            (c) => `${c.status} · Rx ${c.prescription_id.slice(0, 8)} · v${c.version_number ?? '—'}`,
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
          ...ex.pick_tasks.map((t) => `Pick ${t.order_number} ${t.status}`),
          ...ex.pack_tasks.map((t) => `Pack ${t.order_number} ${t.status}${t.exception ? ` ${t.exception}` : ''}`),
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

  const sendOtp = async () => {
    setSignInBusy(true);
    try {
      const result = await requestOtp(email, 'LOGIN');
      setChallengeId(result.challengeId);
      if (result.devCode) {
        setOtpCode(result.devCode);
      }
    } catch {
      setViewState('network');
    } finally {
      setSignInBusy(false);
    }
  };

  const verifySignIn = async () => {
    if (!challengeId) {
      await sendOtp();
      return;
    }
    setSignInBusy(true);
    try {
      const result = await verifyOtp(challengeId, otpCode, 'customer');
      store.authenticate({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        audience: 'customer',
      });
      setSession(store.snapshot());
      setViewState('idle');
    } catch {
      setViewState('network');
    } finally {
      setSignInBusy(false);
    }
  };

  if (session.status !== 'authenticated') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <NativeText variant="h1">Store mobile</NativeText>
          <NativeCard>
            <NativeInput label="Email" value={email} onChangeText={setEmail} />
            {challengeId ? <NativeInput label="One-time code" value={otpCode} onChangeText={setOtpCode} /> : null}
            <NativeButton
              label={signInBusy ? 'Please wait…' : challengeId ? 'Verify & sign in' : 'Send OTP'}
              onPress={() => void (challengeId ? verifySignIn() : sendOtp())}
            />
          </NativeCard>
          {viewState === 'network' ? <NativeNetworkErrorState onRetry={() => setViewState('idle')} /> : null}
        </View>
      </SafeAreaView>
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
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <NativeText variant="h1">Store mobile</NativeText>

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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MAIN_TABS.map((item) => (
            <NativeButton
              key={item.id}
              label={item.label}
              variant={tab === item.id ? 'primary' : 'secondary'}
              onPress={() => {
                setTab(item.id);
                setMoreScreen('menu');
              }}
            />
          ))}
        </View>

        {viewState === 'loading' ? (
          <NativeLoadingState title={tab === 'rx' ? 'Loading dispensing queue' : 'Loading'} />
        ) : null}
        {viewState === 'forbidden' ? <NativePermissionDeniedState /> : null}
        {viewState === 'network' ? <NativeNetworkErrorState onRetry={() => void loadTab()} /> : null}

        {viewState === 'idle' && tab === 'dashboard' && summary ? <NativeText>{summary}</NativeText> : null}
        {viewState === 'idle' && (tab === 'inventory' || tab === 'orders') && !rows.length && scoped ? (
          <NativeEmptyState title="Nothing here" description="No data for this view." />
        ) : null}
        {viewState === 'idle' && (tab === 'inventory' || tab === 'orders' || (tab === 'more' && moreScreen === 'exceptions'))
          ? rows.map((row) => <NativeText key={row}>{row}</NativeText>)
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
          <NativeCard>
            <NativeButton label="Exceptions" variant="secondary" onPress={() => setMoreScreen('exceptions')} />
            <NativeButton label="Receive stock (GRN)" variant="secondary" onPress={() => setMoreScreen('grn')} />
            <NativeButton label="Adjust lot" variant="secondary" onPress={() => setMoreScreen('adjust')} />
            <NativeButton label="Get help" variant="secondary" onPress={() => setMoreScreen('support')} />
            <NativeButton
              label="Sign out"
              variant="secondary"
              onPress={() => {
                store.signOut();
                setSession(store.snapshot());
              }}
            />
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

        {viewState === 'idle' && tab === 'orders' && scoped && rows.length ? (
          <NativeCard>
            <NativeText variant="h2">Order actions</NativeText>
            <NativeText variant="caption">Uses first order in queue</NativeText>
            <NativeButton
              label="Start pick"
              variant="secondary"
              onPress={() =>
                void runMutation(async () => {
                  const orders = await fetchOrders(token!, organizationId, locationId);
                  const id = orders.data[0]?.id;
                  if (id) await startPick(token!, organizationId, locationId, id);
                })
              }
            />
            <NativeButton
              label="Complete pick"
              variant="secondary"
              onPress={() =>
                void runMutation(async () => {
                  const orders = await fetchOrders(token!, organizationId, locationId);
                  const id = orders.data[0]?.id;
                  if (id) await completePick(token!, organizationId, locationId, id);
                })
              }
            />
            <NativeButton
              label="Complete pack"
              variant="secondary"
              onPress={() =>
                void runMutation(async () => {
                  const orders = await fetchOrders(token!, organizationId, locationId);
                  const id = orders.data[0]?.id;
                  if (id) await completePack(token!, organizationId, locationId, id);
                })
              }
            />
            <NativeButton
              label="Ready to ship"
              onPress={() =>
                void runMutation(async () => {
                  const orders = await fetchOrders(token!, organizationId, locationId);
                  const id = orders.data[0]?.id;
                  if (id) await readyOrder(token!, organizationId, locationId, id);
                })
              }
            />
          </NativeCard>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
