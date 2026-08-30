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
  DeliveryApiError,
  acceptJob,
  arriveJob,
  deliverSampleJob,
  failJob,
  getJob,
  listJobs,
  pickupJob,
  rtoJob,
  setPresence,
  verifyPod,
  createDeliverySupportTicket,
  fetchDeliverySupportTickets,
  type DeliveryJob,
  type DeliverySupportTicket,
} from './delivery-api';
import { DELIVERY_TABS, deliveryMobileScreen, type DeliveryTab } from './navigation';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [tab, setTab] = useState<DeliveryTab>('jobs');
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryJob | null>(null);
  const [podCode, setPodCode] = useState('');
  /**
   * Photo POD boundary: capture URI only until upload API exists.
   * Future: expo-image-picker -> local URI -> POST /delivery/jobs/:id/pod with multipart photo.
   */
  const [podPhotoUri, setPodPhotoUri] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [online, setOnline] = useState(false);
  const [supportTickets, setSupportTickets] = useState<DeliverySupportTicket[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportJobId, setSupportJobId] = useState('');
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = deliveryMobileScreen(session, tab);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof DeliveryApiError) {
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
      const res = await fetchDeliverySupportTickets(token);
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

  if (screen === 'sign-in') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <NativeText variant="h1">Delivery mobile</NativeText>
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
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <NativeText variant="h1">Delivery mobile</NativeText>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DELIVERY_TABS.map((item) => (
            <NativeButton
              key={item.id}
              label={item.label}
              variant={tab === item.id ? 'primary' : 'secondary'}
              onPress={() => {
                setTab(item.id);
                setSelectedId(null);
                setDetail(null);
              }}
            />
          ))}
        </View>

        {viewState === 'loading' ? <NativeLoadingState /> : null}
        {viewState === 'forbidden' ? <NativePermissionDeniedState /> : null}
        {viewState === 'network' ? (
          <NativeNetworkErrorState onRetry={() => (selectedId ? void loadDetail(selectedId) : void loadJobs())} />
        ) : null}

        {viewState === 'idle' && tab === 'presence' ? (
          <NativeCard>
            <NativeText>{online ? 'You are online' : 'You are offline'}</NativeText>
            <NativeButton
              label={online ? 'Go offline' : 'Go online'}
              onPress={() =>
                void runAction(async () => {
                  await setPresence(token!, !online);
                  setOnline(!online);
                })
              }
            />
          </NativeCard>
        ) : null}

        {viewState === 'idle' && tab === 'support' ? (
          <NativeCard>
            <NativeText variant="h2">Delivery support</NativeText>
            <NativeText variant="caption">
              Shared support kernel. No clinical or recipient PHI in ticket bodies.
            </NativeText>
            <NativeInput label="Subject" value={supportSubject} onChangeText={setSupportSubject} />
            <NativeInput label="Details" value={supportBody} onChangeText={setSupportBody} />
            <NativeInput
              label="Job ID (optional)"
              value={supportJobId}
              onChangeText={setSupportJobId}
            />
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

        {viewState === 'idle' && tab === 'jobs' && !selectedId ? (
          jobs.length ? (
            jobs.map((job) => (
              <NativeCard key={job.id}>
                <NativeText>{`${job.tracking_number ?? job.id.slice(0, 8)} — ${job.status}`}</NativeText>
                <NativeText variant="caption">
                  {`${job.dropoff.city ?? '—'}, ${job.dropoff.region ?? '—'} · ${job.dropoff.recipient ?? '—'}`}
                </NativeText>
                <NativeButton label="Open" variant="secondary" onPress={() => void loadDetail(job.id)} />
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No jobs" description="Assigned jobs appear after dispatch." />
          )
        ) : null}

        {viewState === 'idle' && tab === 'jobs' && detail ? (
          <NativeCard>
            <NativeButton
              label="Back to list"
              variant="secondary"
              onPress={() => {
                setSelectedId(null);
                setDetail(null);
                setPodPhotoUri(null);
              }}
            />
            <NativeText variant="h2">{detail.status}</NativeText>
            {detail.job_type === 'SAMPLE_TRANSPORT' ? (
              <>
                <NativeText>{detail.test_title ?? 'Lab sample transport'}</NativeText>
                <NativeText>{`Container: ${detail.tracking_number ?? 'pending'}`}</NativeText>
                <NativeText>{`Custody: ${detail.shipment_status ?? '—'}`}</NativeText>
                <NativeText variant="caption">{detail.note ?? 'Sealed sample transport. No clinical data.'}</NativeText>
                {!detail.assignee_id ? (
                  <NativeButton label="Accept job" onPress={() => void runAction(() => acceptJob(token!, detail.id))} />
                ) : null}
                <NativeButton label="Pickup sample" variant="secondary" onPress={() => void runAction(() => pickupJob(token!, detail.id))} />
                <NativeButton label="Deliver to lab" onPress={() => void runAction(() => deliverSampleJob(token!, detail.id))} />
              </>
            ) : detail.job_type === 'REPORT_DELIVERY' ? (
              <>
                <NativeText>{detail.parcel_label ?? 'Sealed report parcel'}</NativeText>
                <NativeText>{`Package: ${detail.tracking_number ?? 'pending'}`}</NativeText>
                <NativeText>{`Status: ${detail.shipment_status ?? '—'}`}</NativeText>
                <NativeText variant="caption">{detail.note ?? 'Sealed report parcel. No diagnostic content.'}</NativeText>
                {!detail.assignee_id ? (
                  <NativeButton label="Accept job" onPress={() => void runAction(() => acceptJob(token!, detail.id))} />
                ) : null}
                <NativeButton label="Pickup parcel" variant="secondary" onPress={() => void runAction(() => pickupJob(token!, detail.id))} />
                <NativeButton label="Deliver parcel" onPress={() => void runAction(() => deliverSampleJob(token!, detail.id))} />
                <NativeButton
                  label="Delivery failed"
                  variant="danger"
                  onPress={() => void runAction(() => failJob(token!, detail.id, 'customer_unavailable'))}
                />
              </>
            ) : (
              <>
                <NativeText>{`Tracking: ${detail.tracking_number ?? 'pending'}`}</NativeText>
                <NativeText>{`Dropoff: ${detail.dropoff.city ?? '—'}, ${detail.dropoff.region ?? '—'}`}</NativeText>
                <NativeText>{`Recipient: ${detail.dropoff.recipient ?? '—'}`}</NativeText>

                {!detail.assignee_id ? (
                  <NativeButton label="Accept job" onPress={() => void runAction(() => acceptJob(token!, detail.id))} />
                ) : null}
                <NativeButton label="Arrive" variant="secondary" onPress={() => void runAction(() => arriveJob(token!, detail.id))} />
                <NativeButton label="Pickup" variant="secondary" onPress={() => void runAction(() => pickupJob(token!, detail.id))} />
                <NativeInput label="POD code" value={podCode} onChangeText={setPodCode} />
                <NativeButton label="Verify POD" onPress={() => void runAction(() => verifyPod(token!, detail.id, podCode))} />
                <NativeInput
                  label="POD photo URI (placeholder)"
                  value={podPhotoUri ?? ''}
                  onChangeText={(value) => setPodPhotoUri(value || null)}
                />
                <NativeText variant="caption">
                  Camera capture will populate this URI; upload waits on delivery POD photo API.
                </NativeText>
                <NativeButton
                  label="Delivery failed"
                  variant="danger"
                  onPress={() => void runAction(() => failJob(token!, detail.id, 'customer_unavailable'))}
                />
                <NativeButton label="Start RTO" variant="secondary" onPress={() => void runAction(() => rtoJob(token!, detail.id))} />
              </>
            )}
          </NativeCard>
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
      </View>
    </SafeAreaView>
  );
}
