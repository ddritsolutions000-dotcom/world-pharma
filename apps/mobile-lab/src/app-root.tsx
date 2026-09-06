import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native';
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
  OpsGiantButton,
  OpsShell,
  OpsWorkCard,
  OpsAccessGate,
} from '@world-pharma/ui-kit/native';
import {
  LabApiError,
  accessionLabSample,
  completeLabProcessing,
  createLabSupportTicket,
  fetchLabAccessions,
  fetchLabCollections,
  fetchLabInbox,
  fetchLabOrganizations,
  fetchLabPathology,
  fetchLabProcessing,
  fetchLabStaffBookings,
  fetchLabSupportTickets,
  fetchLabTransport,
  markLabInboxRead,
  receiveLabSample,
  startLabProcessing,
  type LabAccessionRow,
  type LabCollectionRow,
  type LabInboxItem,
  type LabOrganization,
  type LabPathologyRow,
  type LabProcessingRow,
  type LabStaffBooking,
  type LabSupportTicket,
  type LabTransportRow,
} from './lab-api';
import { LAB_TABS, labMobileScreen, type LabTab } from './navigation';
import { labCollectionModeLabel, labOpsStatusLabel } from './lab-ops-labels';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [tab, setTab] = useState<LabTab>('accessions');
  const [organizations, setOrganizations] = useState<LabOrganization[]>([]);
  const [labOrgId, setLabOrgId] = useState('');
  const [accessions, setAccessions] = useState<LabAccessionRow[]>([]);
  const [pendingSamples, setPendingSamples] = useState<Array<{ id: string; test_title: string }>>([]);
  const [bookings, setBookings] = useState<LabStaffBooking[]>([]);
  const [collections, setCollections] = useState<LabCollectionRow[]>([]);
  const [transport, setTransport] = useState<LabTransportRow[]>([]);
  const [processing, setProcessing] = useState<LabProcessingRow[]>([]);
  const [pathology, setPathology] = useState<LabPathologyRow[]>([]);
  const [inbox, setInbox] = useState<LabInboxItem[]>([]);
  const [selectedProcessingId, setSelectedProcessingId] = useState<string | null>(null);
  const [supportTickets, setSupportTickets] = useState<LabSupportTicket[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = labMobileScreen(session, tab);
  const selectedProcessing = processing.find((row) => row.id === selectedProcessingId) ?? null;

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof LabApiError) {
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

  const loadOrganizations = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabOrganizations(token);
      setOrganizations(res.data);
      if (!labOrgId && res.data[0]) {
        setLabOrgId(res.data[0].id);
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadBookings = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabStaffBookings(token, labOrgId);
      setBookings(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadCollectionsQueue = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabCollections(token, labOrgId);
      setCollections(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadTransport = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabTransport(token, labOrgId);
      setTransport(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadAccessions = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const [accessionRes, collectionRes] = await Promise.all([
        fetchLabAccessions(token, labOrgId),
        fetchLabCollections(token, labOrgId),
      ]);
      setAccessions(accessionRes.data);
      setPendingSamples(
        collectionRes.data
          .filter((row) => row.status === 'LAB_RECEIVED')
          .map((row) => ({ id: row.id, test_title: row.test_title })),
      );
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadProcessing = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabProcessing(token, labOrgId);
      setProcessing(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadSupport = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabSupportTickets(token);
      setSupportTickets(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadPathology = useCallback(async () => {
    if (!token || !labOrgId) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabPathology(token, labOrgId);
      setPathology(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, labOrgId, handleError]);

  const loadInbox = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchLabInbox(token);
      setInbox(res.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    if (session.status === 'authenticated' && !labOrgId) {
      void loadOrganizations();
    }
  }, [session.status, labOrgId, loadOrganizations]);

  useEffect(() => {
    if (session.status !== 'authenticated' || !labOrgId) {
      return;
    }
    if (tab === 'bookings') {
      void loadBookings();
    } else if (tab === 'collections') {
      void loadCollectionsQueue();
    } else if (tab === 'transport') {
      void loadTransport();
    } else if (tab === 'accessions') {
      void loadAccessions();
    } else if (tab === 'processing') {
      void loadProcessing();
    } else if (tab === 'pathology') {
      void loadPathology();
    } else if (tab === 'inbox') {
      void loadInbox();
    } else if (tab === 'support') {
      void loadSupport();
    }
  }, [
    session.status,
    tab,
    labOrgId,
    loadBookings,
    loadCollectionsQueue,
    loadTransport,
    loadAccessions,
    loadProcessing,
    loadPathology,
    loadInbox,
    loadSupport,
  ]);

  const runAction = async (fn: () => Promise<unknown>, reload: () => Promise<void>) => {
    setViewState('loading');
    try {
      await fn();
      await reload();
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  if (screen === 'sign-in') {
    return (
      <NativeOtpSignIn
        portalTitle="World Pharma Lab"
        portalDescription="LIMS console — accession, bench processing, receiving dock."
        audience="customer"
        staffEmail="sandbox-lab@dev.local"
        onAuthenticated={({ accessToken, refreshToken }) => {
          store.authenticate({ accessToken, refreshToken, audience: 'customer' });
          setSession(store.snapshot());
          setViewState('idle');
        }}
      />
    );
  }

  if (screen === 'expired') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeSessionExpiredState
          onAction={() => {
            store.signOut();
            setSession(store.snapshot());
            setOrganizations([]);
            setLabOrgId('');
          }}
        />
      </SafeAreaView>
    );
  }

  const orgLabel = organizations.find((row) => row.id === labOrgId)?.display_name ?? 'Lab org';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }}>
      <OpsShell
        product="Lab LIMS"
        accent="#9F7AEA"
        status={orgLabel}
        tabs={LAB_TABS}
        active={
          tab === 'accessions' || tab === 'processing' || tab === 'transport' || tab === 'more' ? tab : 'more'
        }
        onSelect={(id) => {
          setTab(id as LabTab);
          setSelectedProcessingId(null);
        }}
      >
        {organizations.length > 1 ? (
          <NativeCard>
            {organizations.map((org) => (
              <NativeButton
                key={org.id}
                label={org.display_name}
                variant={labOrgId === org.id ? 'primary' : 'secondary'}
                onPress={() => setLabOrgId(org.id)}
              />
            ))}
          </NativeCard>
        ) : null}

        {viewState === 'loading' ? <NativeLoadingState mode="dark" /> : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail="sandbox-lab@dev.local"
            onRetry={() => void loadAccessions()}
            onSignOut={() => {
              store.signOut();
              setSession(store.snapshot());
              setOrganizations([]);
              setLabOrgId('');
              setDenyDetail(null);
              setViewState('idle');
            }}
          />
        ) : null}
        {viewState === 'network' ? (
          <NativeNetworkErrorState
            onRetry={() => {
              if (tab === 'bookings') void loadBookings();
              else if (tab === 'collections') void loadCollectionsQueue();
              else if (tab === 'transport') void loadTransport();
              else if (tab === 'accessions') void loadAccessions();
              else if (tab === 'processing') void loadProcessing();
              else if (tab === 'pathology') void loadPathology();
              else if (tab === 'inbox') void loadInbox();
              else void loadSupport();
            }}
          />
        ) : null}

        {viewState === 'idle' && tab === 'more' ? (
          <NativeListSection title="Lab floor">
            <NativeListRow label="Bookings" hint="Customer slots" onPress={() => setTab('bookings')} />
            <NativeListRow label="Collections" hint="Home and centre jobs" onPress={() => setTab('collections')} />
            <NativeListRow label="Pathology" hint="Reports after bench" onPress={() => setTab('pathology')} />
            <NativeListRow label="Inbox" onPress={() => setTab('inbox')} />
            <NativeListRow label="Support" onPress={() => setTab('support')} />
          </NativeListSection>
        ) : null}
          <>
            <NativePageHeader title="Bookings" subtitle="Customer collections for this lab." />
          {bookings.length ? (
            bookings.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.lines[0]?.title ?? 'Booking'}</NativeText>
                <NativeText variant="caption">
                  {`${labOpsStatusLabel(row.status)} · ${labCollectionModeLabel(row.collection_mode)}${
                    row.slot_starts_at ? ` · ${new Date(row.slot_starts_at).toLocaleString()}` : ''
                  }`}
                </NativeText>
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No bookings" description="Customer lab bookings for this lab appear here." />
          )}
          </>
        ) : null}

        {viewState === 'idle' && tab === 'collections' ? (
          collections.length ? (
            collections.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.test_title}</NativeText>
                <NativeText variant="caption">
                  {`${labOpsStatusLabel(row.status)} · ${labCollectionModeLabel(row.collection_mode)}${
                    row.assignee_person_id ? ' · assigned' : ' · unassigned'
                  }`}
                </NativeText>
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No collections" description="Home and centre collection jobs appear after booking confirmation." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'transport' ? (
          transport.length ? (
            transport.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.test_title}</NativeText>
                <NativeText variant="caption">
                  {`${labOpsStatusLabel(row.coc_status ?? row.status)} · ${row.container_barcode ?? 'no barcode'}`}
                </NativeText>
                {row.lab_sample_id && row.coc_status === 'HANDED_OVER' ? (
                  <OpsGiantButton
                    label="Receive at lab"
                    onPress={() =>
                      void runAction(
                        () => receiveLabSample(token!, labOrgId, row.lab_sample_id!, newIdempotencyKey('lab-recv')),
                        loadTransport,
                      )
                    }
                  />
                ) : null}
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No transport jobs" description="Jobs appear after phlebotomist handover." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'accessions' ? (
          <>
            {pendingSamples.length ? (
              pendingSamples.map((row) => (
                <OpsWorkCard
                  key={row.id}
                  kicker="ACCESSION"
                  title={row.test_title}
                  meta="Received at lab — assign accession number"
                  actionLabel="Accession sample"
                  onAction={() =>
                    void runAction(
                      () => accessionLabSample(token!, labOrgId, row.id, newIdempotencyKey('lab-accession')),
                      loadAccessions,
                    )
                  }
                />
              ))
            ) : null}
            {accessions.length ? (
              accessions.map((row) => (
                <OpsWorkCard
                  key={row.id}
                  kicker={row.accession_number}
                  title={row.test_title}
                  meta={`Sample ${labOpsStatusLabel(row.sample_status)} · processing ${labOpsStatusLabel(row.processing_status)}`}
                />
              ))
            ) : (
              <NativeEmptyState title="No accessions" description="Receive samples at the lab, then accession here." />
            )}
          </>
        ) : null}

        {viewState === 'idle' && tab === 'processing' && !selectedProcessing ? (
          processing.length ? (
            processing.map((row) => (
              <OpsWorkCard
                key={row.id}
                kicker={row.accession_number}
                title={row.test_title}
                meta={labOpsStatusLabel(row.status)}
                actionLabel="Open bench"
                onAction={() => setSelectedProcessingId(row.id)}
                onOpen={() => setSelectedProcessingId(row.id)}
              />
            ))
          ) : (
            <NativeEmptyState title="No processing queue" description="Accession samples to enqueue bench work." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'processing' && selectedProcessing ? (
          <NativeCard>
            <NativeButton label="Back to list" variant="secondary" onPress={() => setSelectedProcessingId(null)} />
            <NativeText variant="h2">{labOpsStatusLabel(selectedProcessing.status)}</NativeText>
            <NativeText>{selectedProcessing.test_title}</NativeText>
            <NativeText variant="caption">{`Barcode: ${selectedProcessing.container_barcode ?? '—'}`}</NativeText>
            {selectedProcessing.status === 'QUEUED' || selectedProcessing.status === 'ON_HOLD' ? (
              <OpsGiantButton
                label="Start processing"
                onPress={() =>
                  void runAction(
                    () => startLabProcessing(token!, labOrgId, selectedProcessing.id),
                    async () => {
                      await loadProcessing();
                      setSelectedProcessingId(selectedProcessing.id);
                    },
                  )
                }
              />
            ) : null}
            {selectedProcessing.status === 'IN_PROGRESS' ? (
              <OpsGiantButton
                label="Complete processing"
                onPress={() =>
                  void runAction(
                    () => completeLabProcessing(token!, labOrgId, selectedProcessing.id),
                    async () => {
                      await loadProcessing();
                      setSelectedProcessingId(null);
                    },
                  )
                }
              />
            ) : null}
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'pathology' ? (
          pathology.length ? (
            pathology.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{`${row.accession_number} · ${row.test_title}`}</NativeText>
                <NativeText variant="caption">
                  {`${labOpsStatusLabel(row.status)} · v${row.version_number ?? '—'}`}
                </NativeText>
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No pathology reports" description="Reports appear after processing is complete." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'inbox' ? (
          inbox.length ? (
            inbox.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.title}</NativeText>
                <NativeText variant="caption">{row.body}</NativeText>
                {!row.read ? (
                  <NativeButton
                    label="Mark as read"
                    variant="secondary"
                    onPress={() =>
                      void runAction(() => markLabInboxRead(token!, row.id), loadInbox)
                    }
                  />
                ) : (
                  <NativeText variant="caption">Read</NativeText>
                )}
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="Inbox empty" description="Operational notices appear here." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'support' ? (
          <NativeCard>
            <NativeText variant="h2">Lab support</NativeText>
            <NativeInput label="Subject" value={supportSubject} onChangeText={setSupportSubject} />
            <NativeInput label="Details" value={supportBody} onChangeText={setSupportBody} />
            {supportMessage ? <NativeText variant="caption">{supportMessage}</NativeText> : null}
            <NativeButton
              label="Submit ticket"
              onPress={() =>
                void runAction(
                  async () => {
                    if (!supportSubject.trim() || !supportBody.trim()) {
                      setSupportMessage('Subject and body are required.');
                      throw new Error('validation');
                    }
                    await createLabSupportTicket(token!, {
                      subject: supportSubject.trim(),
                      body: supportBody.trim(),
                    });
                    setSupportSubject('');
                    setSupportBody('');
                    setSupportMessage('Ticket recorded.');
                  },
                  loadSupport,
                )
              }
            />
            {supportTickets.length ? (
              supportTickets.map((row) => (
                <NativeText key={row.id} variant="caption">
                  {`${row.subject} — ${row.status}`}
                </NativeText>
              ))
            ) : (
              <NativeEmptyState title="No tickets" description="Support tickets you file appear here." />
            )}
          </NativeCard>
        ) : null}

        <NativeButton
          label="Sign out"
          variant="secondary"
          onPress={() => {
            store.signOut();
            setSession(store.snapshot());
            setOrganizations([]);
            setLabOrgId('');
          }}
        />
      </OpsShell>
    </SafeAreaView>
  );
}
