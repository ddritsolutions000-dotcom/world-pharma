import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native';
import { createSessionStore } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeOtpSignIn,
  NativeSessionExpiredState,
  NativeText,
  OpsShell,
  OpsKpiRow,
  OpsWorkCard,
  OpsStopRow,
  OpsGiantButton,
  OpsAccessGate,
  openTurnByTurn,
} from '@world-pharma/ui-kit/native';
import {
  PhlebotomistApiError,
  acceptJob,
  arriveJob,
  collectJob,
  failJob,
  createPhlebotomistSupportTicket,
  fetchPhlebotomistInbox,
  fetchPhlebotomistSupportTickets,
  getJob,
  handoverJob,
  listJobs,
  markPhlebotomistInboxRead,
  sealJob,
  verifyJob,
  type CollectionJob,
  type PhlebotomistInboxItem,
  type PhlebotomistSupportTicket,
} from './phlebotomist-api';
import { PHLEBOTOMIST_TABS, phlebotomistMobileScreen, type PhlebotomistTab } from './navigation';
import { phleboPrimaryLabel, phleboPrimaryStep, phlebotomistStatusLabel } from './phlebotomist-status-labels';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [tab, setTab] = useState<PhlebotomistTab>('jobs');
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollectionJob | null>(null);
  const [barcode, setBarcode] = useState('');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [supportTickets, setSupportTickets] = useState<PhlebotomistSupportTicket[]>([]);
  const [inbox, setInbox] = useState<PhlebotomistInboxItem[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = phlebotomistMobileScreen(session, tab);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof PhlebotomistApiError) {
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

  const loadJobs = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await listJobs(token);
      setJobs(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadDetail = useCallback(
    async (jobId: string) => {
      if (!token) {
        return;
      }
      setViewState('loading');
      try {
        const job = await getJob(token, jobId);
        setDetail(job);
        setSelectedId(jobId);
        setViewState('idle');
      } catch (err) {
        handleError(err);
      }
    },
    [token, handleError],
  );

  useEffect(() => {
    if (session.status === 'authenticated' && tab === 'jobs' && !selectedId) {
      void loadJobs();
    }
  }, [session.status, tab, selectedId, loadJobs]);

  const loadSupport = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchPhlebotomistSupportTickets(token);
      setSupportTickets(res.data);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    if (session.status === 'authenticated' && tab === 'support') {
      void loadSupport();
    }
  }, [session.status, tab, loadSupport]);

  const loadInbox = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchPhlebotomistInbox(token);
      setInbox(res.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    if (session.status === 'authenticated' && tab === 'inbox') {
      void loadInbox();
    }
  }, [session.status, tab, loadInbox]);

  const runAction = async (fn: () => Promise<unknown>) => {
    setViewState('loading');
    try {
      await fn();
      if (selectedId) {
        await loadDetail(selectedId);
      } else {
        await loadJobs();
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  };

  if (screen === 'sign-in') {
    return (
      <NativeOtpSignIn
        portalTitle="World Pharma Phlebotomy"
        portalDescription="Field collection console — route, verify, barcode seal, chain of custody."
        audience="customer"
        staffEmail="sandbox-phlebotomist@dev.local"
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
            setJobs([]);
            setDetail(null);
            setSelectedId(null);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }}>
      <OpsShell
        product="Phlebotomy"
        accent="#B794F4"
        status="Field collection"
        tabs={PHLEBOTOMIST_TABS}
        active={tab}
        onSelect={(id) => {
          setTab(id as PhlebotomistTab);
          setSelectedId(null);
          setDetail(null);
        }}
      >
        {viewState === 'loading' ? <NativeLoadingState mode="dark" /> : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail="sandbox-phlebotomist@dev.local"
            onRetry={() => void loadJobs()}
            onSignOut={() => {
              store.signOut();
              setSession(store.snapshot());
              setJobs([]);
              setDetail(null);
              setSelectedId(null);
              setDenyDetail(null);
              setViewState('idle');
            }}
          />
        ) : null}
        {viewState === 'network' ? (
          <NativeNetworkErrorState mode="dark" onRetry={() => (selectedId ? void loadDetail(selectedId) : tab === 'support' ? void loadSupport() : tab === 'inbox' ? void loadInbox() : void loadJobs())} />
        ) : null}

        {viewState === 'idle' && tab === 'inbox' ? (
          inbox.length ? (
            inbox.map((row) => (
              <OpsWorkCard
                key={row.id}
                title={row.title}
                meta={row.body}
                status={row.read ? 'Read' : 'New'}
                actionLabel={row.read ? undefined : 'Mark read'}
                onAction={
                  row.read
                    ? undefined
                    : () =>
                        void markPhlebotomistInboxRead(token!, row.id)
                          .then(() => loadInbox())
                          .catch(handleError)
                }
              />
            ))
          ) : (
            <NativeEmptyState title="Inbox empty" description="Collection dispatch notices appear here." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'support' ? (
          <NativeCard>
            <NativeText variant="h2">Control tower</NativeText>
            <NativeInput label="Subject" value={supportSubject} onChangeText={setSupportSubject} />
            <NativeInput label="Details" value={supportBody} onChangeText={setSupportBody} />
            {supportMessage ? <NativeText variant="caption">{supportMessage}</NativeText> : null}
            <NativeButton
              label="Submit ticket"
              onPress={() =>
                void (async () => {
                  if (!token || !supportSubject.trim() || !supportBody.trim()) {
                    setSupportMessage('Subject and body are required.');
                    return;
                  }
                  setViewState('loading');
                  try {
                    await createPhlebotomistSupportTicket(token, {
                      subject: supportSubject.trim(),
                      body: supportBody.trim(),
                    });
                    setSupportSubject('');
                    setSupportBody('');
                    setSupportMessage('Ticket recorded.');
                    await loadSupport();
                    setViewState('idle');
                  } catch (err) {
                    handleError(err);
                  }
                })()
              }
            />
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'jobs' && !selectedId ? (
          <>
            <OpsKpiRow
              items={[
                { label: 'Open', value: jobs.filter((j) => phleboPrimaryStep(j) !== 'done' && phleboPrimaryStep(j) !== 'failed').length },
                { label: 'Done', value: jobs.filter((j) => phleboPrimaryStep(j) === 'done').length },
                { label: 'Stops', value: jobs.length },
              ]}
            />
            {jobs.length ? (
              jobs.map((job: CollectionJob) => {
                const step = phleboPrimaryStep(job);
                const dest = [job.line1_masked, job.city].filter(Boolean).join(', ') || 'Home collection';
                return (
                  <OpsWorkCard
                    key={job.id}
                    kicker={job.collection_mode ?? 'HOME'}
                    title={job.test_title}
                    meta={`${dest} · ${job.customer_display}`}
                    status={phlebotomistStatusLabel(job.coc_status ?? job.status)}
                    onOpen={() => void loadDetail(job.id)}
                    actionLabel={step === 'done' || step === 'failed' || step === 'other' ? undefined : phleboPrimaryLabel(step)}
                    onAction={step === 'done' || step === 'failed' || step === 'other' ? undefined : () => void loadDetail(job.id)}
                  />
                );
              })
            ) : (
              <NativeEmptyState title="No collection stops" description="Assigned home collections appear after booking confirmation." />
            )}
          </>
        ) : null}

        {viewState === 'idle' && tab === 'jobs' && detail ? (
          <>
            <NativeButton
              label="Back to route"
              variant="secondary"
              onPress={() => {
                setSelectedId(null);
                setDetail(null);
                setBarcode('');
              }}
            />
            <OpsStopRow
              kind="pickup"
              title={detail.customer_display}
              address={[detail.line1_masked, detail.city].filter(Boolean).join(', ') || 'Patient collection address'}
              onNavigate={() =>
                void openTurnByTurn([detail.line1_masked, detail.city].filter(Boolean).join(', ') || detail.city || 'home collection')
              }
            />
            <OpsStopRow
              kind="drop"
              title="Lab receiving dock"
              address="World Pharma Lab receiving"
              onNavigate={() => void openTurnByTurn('World Pharma Lab receiving dock')}
            />
            {(() => {
              const step = phleboPrimaryStep(detail);
              if (step === 'accept') {
                return <OpsGiantButton label={phleboPrimaryLabel(step)} onPress={() => void runAction(() => acceptJob(token!, detail.id))} />;
              }
              if (step === 'arrive') {
                return <OpsGiantButton label={phleboPrimaryLabel(step)} onPress={() => void runAction(() => arriveJob(token!, detail.id))} />;
              }
              if (step === 'verify') {
                return <OpsGiantButton label={phleboPrimaryLabel(step)} onPress={() => void runAction(() => verifyJob(token!, detail.id))} />;
              }
              if (step === 'collect') {
                return <OpsGiantButton label={phleboPrimaryLabel(step)} onPress={() => void runAction(() => collectJob(token!, detail.id))} />;
              }
              if (step === 'seal') {
                return (
                  <NativeCard>
                    <NativeInput label="Container barcode" value={barcode} onChangeText={setBarcode} />
                    <OpsGiantButton
                      label={phleboPrimaryLabel(step)}
                      onPress={() => void runAction(() => sealJob(token!, detail.id, barcode || 'TUBE-0001'))}
                    />
                  </NativeCard>
                );
              }
              if (step === 'handover') {
                return <OpsGiantButton label={phleboPrimaryLabel(step)} onPress={() => void runAction(() => handoverJob(token!, detail.id))} />;
              }
              return <NativeText mode="dark">{phleboPrimaryLabel(step)}</NativeText>;
            })()}
            {detail.is_mine && phleboPrimaryStep(detail) !== 'done' && phleboPrimaryStep(detail) !== 'failed' ? (
              <OpsGiantButton
                label="Mark failed"
                tone="warn"
                onPress={() => void runAction(() => failJob(token!, detail.id, 'REJECTED'))}
              />
            ) : null}
          </>
        ) : null}

        <NativeButton
          label="Sign out"
          variant="secondary"
          onPress={() => {
            store.signOut();
            setSession(store.snapshot());
            setJobs([]);
            setDetail(null);
            setSelectedId(null);
          }}
        />
      </OpsShell>
    </SafeAreaView>
  );
}
