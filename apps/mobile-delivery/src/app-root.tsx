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
  NativeSessionExpiredState,
  NativeText,
  NativeOtpSignIn,
  OpsShell,
  OpsKpiRow,
  OpsWorkCard,
  OpsStopRow,
  OpsGiantButton,
  OpsAccessGate,
  readDeviceGps,
  openTurnByTurn,
} from '@world-pharma/ui-kit/native';
import {
  DeliveryApiError,
  acceptJob,
  arriveJob,
  deliverSampleJob,
  failJob,
  getJob,
  listJobs,
  pickupJob,
  setPresence,
  uploadPodPhoto,
  verifyPod,
  createDeliverySupportTicket,
  fetchDeliveryInbox,
  fetchDeliverySupportTickets,
  markDeliveryInboxRead,
  type DeliveryInboxItem,
  type DeliveryJob,
  type DeliverySupportTicket,
} from './delivery-api';
import { DeliveryEarningsPanel } from './delivery-earnings';
import { DELIVERY_TABS, deliveryMobileScreen, parseDeliveryDeepLink, type DeliveryTab } from './navigation';
import { deliveryJobStatusLabel } from './delivery-status-labels';
import { deliveryJobKicker, deliveryPrimaryKind, deliveryPrimaryLabel, isReturnPickupJob } from './delivery-job-next';
import {
  pickPodPhotoFromDevice,
  podPhotoStatusLabel,
  sandboxPodPhotoPayload,
} from './pod-photo';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());

  const [tab, setTab] = useState<DeliveryTab>('jobs');
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryJob | null>(null);
  const [podCode, setPodCode] = useState('');
  const [podPhotoBusy, setPodPhotoBusy] = useState(false);
  const [podPhotoMessage, setPodPhotoMessage] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [online, setOnline] = useState(false);
  const [supportTickets, setSupportTickets] = useState<DeliverySupportTicket[]>([]);
  const [inbox, setInbox] = useState<DeliveryInboxItem[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportJobId, setSupportJobId] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = deliveryMobileScreen(session, tab);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof DeliveryApiError) {
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

  useEffect(() => {
    if (session.status !== 'authenticated') {
      return;
    }
    const openFromUrl = (url: string) => {
      const { jobId } = parseDeliveryDeepLink(url);
      if (!jobId) {
        return;
      }
      setTab('jobs');
      void loadDetail(jobId);
    };
    void Linking.getInitialURL().then((url) => {
      if (url) {
        openFromUrl(url);
      }
    });
    const subscription = Linking.addEventListener('url', ({ url }) => openFromUrl(url));
    return () => subscription.remove();
  }, [session.status, loadDetail]);

  const loadSupport = useCallback(async () => {
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const res = await fetchDeliverySupportTickets(token);
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
      const res = await fetchDeliveryInbox(token);
      setInbox(res.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    if (session.status === 'authenticated' && tab === 'support') {
      void loadSupport();
    } else if (session.status === 'authenticated' && tab === 'inbox') {
      void loadInbox();
    }
  }, [session.status, tab, loadSupport, loadInbox]);

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

  const runLocated = async (fn: (loc: Awaited<ReturnType<typeof readDeviceGps>>) => Promise<unknown>) => {
    const loc = await readDeviceGps();
    await runAction(() => fn(loc));
  };

  const uploadPodPhotoPayload = async (payload: {
    content_base64: string;
    content_type: string;
  }) => {
    if (!token || !detail) return;
    setPodPhotoBusy(true);
    setPodPhotoMessage(null);
    try {
      const loc = await readDeviceGps();
      await uploadPodPhoto(token, detail.id, {
        content_base64: payload.content_base64,
        content_type: payload.content_type,
        idempotency_key: `pod-photo-${detail.id}-${Date.now()}`,
        ...(loc ?? {}),
      });
      setPodPhotoMessage('POD photo stored as private object (sandbox).');
      await loadDetail(detail.id);
    } catch (err) {
      setPodPhotoMessage((err as Error).message ?? 'Photo upload failed.');
      handleError(err);
    } finally {
      setPodPhotoBusy(false);
    }
  };

  if (screen === 'sign-in') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeOtpSignIn
          portalTitle="World Pharma Rider"
          portalDescription="Pickup, GPS navigation, drop-off, and proof of delivery for assigned jobs."
          audience="customer"
          staffEmail="sandbox-delivery@dev.local"
          onAuthenticated={({ accessToken, refreshToken }) => {
            store.authenticate({ accessToken, refreshToken, audience: 'customer' });
            setSession(store.snapshot());
            setViewState('idle');
          }}
        />
      </SafeAreaView>
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

  const pickupQuery = (job: DeliveryJob) =>
    job.pickup?.query ||
    (isReturnPickupJob(job) ? 'Customer return address' : 'World Pharma pharmacy pickup');
  const dropQuery = (job: DeliveryJob) =>
    job.dropoff.query ||
    [job.dropoff.line1, job.dropoff.city, job.dropoff.region].filter(Boolean).join(', ') ||
    (isReturnPickupJob(job) ? 'Pharmacy return dock' : 'Customer drop-off');
  const actionLabel = (job: DeliveryJob) =>
    deliveryPrimaryLabel(deliveryPrimaryKind(job), job.job_type, job.direction);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }}>
      <OpsShell
        product="Rider"
        accent="#ED8936"
        status={online ? 'On duty' : 'Off duty'}
        tabs={DELIVERY_TABS}
        active={tab}
        onSelect={(id) => {
          setTab(id as DeliveryTab);
          setSelectedId(null);
          setDetail(null);
          if (id === 'earnings') {
            setViewState('idle');
          }
        }}
      >
        {viewState === 'loading' ? <NativeLoadingState mode="dark" /> : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail="sandbox-delivery@dev.local"
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
          <NativeNetworkErrorState
            mode="dark"
            onRetry={() =>
              selectedId
                ? void loadDetail(selectedId)
                : tab === 'support'
                  ? void loadSupport()
                  : tab === 'inbox'
                    ? void loadInbox()
                    : tab === 'earnings'
                      ? undefined
                      : void loadJobs()
            }
          />
        ) : null}

        {viewState === 'idle' && tab === 'presence' ? (
          <NativeCard>
            <NativeText variant="h2">{online ? 'On duty' : 'Go on duty'}</NativeText>
            <NativeText variant="caption">
              Dispatch assigns the nearest online rider. Going online may share coarse GPS for matching.
            </NativeText>
            <OpsGiantButton
              label={online ? 'Go offline' : 'Go online'}
              tone={online ? 'idle' : 'go'}
              onPress={() =>
                void runAction(async () => {
                  const next = !online;
                  let coords: { latitude: number; longitude: number } | undefined;
                  if (next && typeof navigator !== 'undefined' && navigator.geolocation) {
                    coords = await new Promise((resolve) => {
                      navigator.geolocation.getCurrentPosition(
                        (pos) =>
                          resolve({
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                          }),
                        () => resolve(undefined),
                        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
                      );
                    });
                  }
                  await setPresence(token!, next, coords);
                  setOnline(next);
                })
              }
            />
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'earnings' && token ? (
          <DeliveryEarningsPanel
            token={token}
            onError={(err) => {
              setViewState('idle');
              handleError(err);
            }}
          />
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
                        void markDeliveryInboxRead(token!, row.id)
                          .then(() => loadInbox())
                          .catch(handleError)
                }
              />
            ))
          ) : (
            <NativeEmptyState title="Inbox empty" description="Dispatch notices appear here." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'support' ? (
          <NativeCard>
            <NativeText variant="h2">Control tower</NativeText>
            <NativeInput label="Subject" value={supportSubject} onChangeText={setSupportSubject} />
            <NativeInput label="Details" value={supportBody} onChangeText={setSupportBody} />
            <NativeInput label="Job ID (optional)" value={supportJobId} onChangeText={setSupportJobId} />
            {supportMessage ? <NativeText variant="caption">{supportMessage}</NativeText> : null}
            <NativeButton
              label="Submit ticket"
              onPress={() =>
                void runAction(async () => {
                  if (!supportSubject.trim() || !supportBody.trim()) {
                    setSupportMessage('Subject and body are required.');
                    return;
                  }
                  await createDeliverySupportTicket(token!, {
                    subject: supportSubject.trim(),
                    body: supportBody.trim(),
                    reference_type: supportJobId.trim() ? 'logistics_job' : undefined,
                    reference_id: supportJobId.trim() || undefined,
                  });
                  setSupportSubject('');
                  setSupportBody('');
                  setSupportJobId('');
                  setSupportMessage('Ticket recorded.');
                  await loadSupport();
                })
              }
            />
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'jobs' && !selectedId ? (
          <>
            <OpsKpiRow
              items={[
                { label: 'Open', value: jobs.filter((j) => deliveryPrimaryKind(j) !== 'done' && deliveryPrimaryKind(j) !== 'failed').length },
                { label: 'Done', value: jobs.filter((j) => deliveryPrimaryKind(j) === 'done').length },
                { label: 'Duty', value: online ? 'ON' : 'OFF' },
              ]}
            />
            {jobs.length ? (
              jobs.map((job) => {
                const kind = deliveryPrimaryKind(job);
                return (
                  <OpsWorkCard
                    key={job.id}
                    kicker={deliveryJobKicker(job)}
                    title={job.parcel_label ?? job.tracking_number ?? job.id.slice(0, 8)}
                    meta={`${isReturnPickupJob(job) ? 'Collect → pharmacy' : 'Pharmacy → drop'} · ${dropQuery(job)}`}
                    status={deliveryJobStatusLabel(job.status)}
                    onOpen={() => void loadDetail(job.id)}
                    actionLabel={kind === 'done' || kind === 'failed' ? undefined : actionLabel(job)}
                    onAction={kind === 'done' || kind === 'failed' ? undefined : () => void loadDetail(job.id)}
                  />
                );
              })
            ) : (
              <NativeEmptyState title="No jobs on board" description="Go on duty. Assigned stops appear here." />
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
                setPodCode('');
                setPodPhotoMessage(null);
              }}
            />
            {detail.note ? (
              <NativeText mode="dark" variant="caption">
                {detail.note}
              </NativeText>
            ) : null}
            {detail.pickup_slot_start ? (
              <NativeText mode="dark" variant="caption">
                {`Pickup slot ${new Date(detail.pickup_slot_start).toLocaleString()}${
                  detail.pickup_slot_end ? ` – ${new Date(detail.pickup_slot_end).toLocaleString()}` : ''
                }`}
              </NativeText>
            ) : null}
            <OpsStopRow
              kind="pickup"
              title={detail.pickup?.label ?? (isReturnPickupJob(detail) ? 'Collect from customer' : 'Pickup')}
              address={pickupQuery(detail)}
              onNavigate={() => void openTurnByTurn(pickupQuery(detail))}
            />
            <OpsStopRow
              kind="drop"
              title={
                isReturnPickupJob(detail)
                  ? (detail.dropoff.recipient ?? 'Return to pharmacy')
                  : (detail.dropoff.recipient ?? 'Drop-off')
              }
              address={dropQuery(detail)}
              onNavigate={() => void openTurnByTurn(dropQuery(detail))}
            />
            {(() => {
              const kind = deliveryPrimaryKind(detail);
              const label = deliveryPrimaryLabel(kind, detail.job_type, detail.direction);
              if (kind === 'accept') {
                return <OpsGiantButton label={label} onPress={() => void runAction(() => acceptJob(token!, detail.id))} />;
              }
              if (kind === 'arrive') {
                return (
                  <OpsGiantButton
                    label={`${label} + GPS`}
                    onPress={() => void runLocated((loc) => arriveJob(token!, detail.id, loc ?? undefined))}
                  />
                );
              }
              if (kind === 'pickup') {
                return (
                  <OpsGiantButton
                    label={`${label} + GPS`}
                    onPress={() => void runLocated((loc) => pickupJob(token!, detail.id, loc ?? undefined))}
                  />
                );
              }
              if (kind === 'deliver') {
                return (
                  <OpsGiantButton
                    label={`${label} + GPS`}
                    onPress={() => void runLocated((loc) => deliverSampleJob(token!, detail.id, loc ?? undefined))}
                  />
                );
              }
              if (kind === 'pod') {
                return (
                  <NativeCard>
                    <NativeText mode="dark">{podPhotoStatusLabel(detail.pod_photo_captured)}</NativeText>
                    <NativeText mode="dark" variant="caption">
                      Photo evidence uploads to private object store — no public URL. Camera picker stays external until
                      native image-picker ships; web can pick a file.
                    </NativeText>
                    <NativeButton
                      label={podPhotoBusy ? 'Uploading photo…' : 'Attach sandbox POD photo'}
                      variant="secondary"
                      disabled={podPhotoBusy || detail.pod_photo_captured === true}
                      onPress={() => void uploadPodPhotoPayload(sandboxPodPhotoPayload())}
                    />
                    <NativeButton
                      label={podPhotoBusy ? 'Uploading…' : 'Pick photo from device'}
                      variant="secondary"
                      disabled={podPhotoBusy}
                      onPress={() => {
                        void pickPodPhotoFromDevice().then((picked) => {
                          if (!picked) {
                            setPodPhotoMessage(
                              'No file selected — on native use sandbox photo, or open Expo web to pick a file.',
                            );
                            return;
                          }
                          void uploadPodPhotoPayload(picked);
                        });
                      }}
                    />
                    {podPhotoMessage ? (
                      <NativeText mode="dark" variant="caption">
                        {podPhotoMessage}
                      </NativeText>
                    ) : null}
                    <NativeInput label="POD code" value={podCode} onChangeText={setPodCode} />
                    <OpsGiantButton
                      label="Verify OTP POD with GPS"
                      onPress={() =>
                        void runLocated((loc) => verifyPod(token!, detail.id, podCode, undefined, loc ?? undefined))
                      }
                    />
                  </NativeCard>
                );
              }
              return <NativeText mode="dark">{label}</NativeText>;
            })()}
            {deliveryPrimaryKind(detail) !== 'done' && deliveryPrimaryKind(detail) !== 'failed' ? (
              <OpsGiantButton
                label="Mark failed"
                tone="warn"
                onPress={() => void runAction(() => failJob(token!, detail.id, 'customer_unavailable'))}
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
