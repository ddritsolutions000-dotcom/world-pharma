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
  PhlebotomistApiError,
  acceptJob,
  arriveJob,
  collectJob,
  failJob,
  getJob,
  handoverJob,
  listJobs,
  sealJob,
  verifyJob,
  type CollectionJob,
} from './phlebotomist-api';
import { PHLEBOTOMIST_TABS, phlebotomistMobileScreen, type PhlebotomistTab } from './navigation';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [tab, setTab] = useState<PhlebotomistTab>('jobs');
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollectionJob | null>(null);
  const [barcode, setBarcode] = useState('');
  const [viewState, setViewState] = useState<ViewState>('idle');

  const token = store.getAccessToken();
  const screen = phlebotomistMobileScreen(session, tab);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof PhlebotomistApiError) {
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
          <NativeText variant="h1">Phlebotomist</NativeText>
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
        <NativeText variant="h1">Sample collection</NativeText>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PHLEBOTOMIST_TABS.map((item) => (
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

        {viewState === 'idle' && tab === 'jobs' && !selectedId ? (
          jobs.length ? (
            jobs.map((job: CollectionJob) => (
              <NativeCard key={job.id}>
                <NativeText>{`${job.test_title} — ${job.coc_status ?? job.status}`}</NativeText>
                <NativeText variant="caption">
                  {`${job.collection_mode ?? '—'} · ${job.customer_display} · ${job.city ?? '—'}`}
                </NativeText>
                <NativeButton label="Open" variant="secondary" onPress={() => void loadDetail(job.id)} />
              </NativeCard>
            ))
          ) : (
            <NativeEmptyState title="No collection jobs" description="Assigned jobs appear after booking confirmation." />
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
                setBarcode('');
              }}
            />
            <NativeText variant="h2">{detail.coc_status ?? detail.status}</NativeText>
            <NativeText>{detail.test_title}</NativeText>
            <NativeText>{`Customer: ${detail.customer_display}`}</NativeText>
            <NativeText>{`Mode: ${detail.collection_mode ?? '—'}`}</NativeText>
            {detail.line1_masked ? <NativeText>{`Address: ${detail.line1_masked}`}</NativeText> : null}
            <NativeText variant="caption">{detail.note ?? ''}</NativeText>

            {!detail.is_mine && !detail.assignee_id ? (
              <NativeButton label="Accept job" onPress={() => void runAction(() => acceptJob(token!, detail.id))} />
            ) : null}
            {detail.is_mine ? (
              <>
                <NativeButton label="Arrive" variant="secondary" onPress={() => void runAction(() => arriveJob(token!, detail.id))} />
                <NativeButton label="Verify customer" variant="secondary" onPress={() => void runAction(() => verifyJob(token!, detail.id))} />
                <NativeButton label="Collect specimen" variant="secondary" onPress={() => void runAction(() => collectJob(token!, detail.id))} />
                <NativeInput label="Container barcode" value={barcode} onChangeText={setBarcode} />
                <NativeButton
                  label="Seal"
                  variant="secondary"
                  onPress={() => void runAction(() => sealJob(token!, detail.id, barcode || 'TUBE-0001'))}
                />
                <NativeButton label="Hand over custody" onPress={() => void runAction(() => handoverJob(token!, detail.id))} />
                <NativeButton
                  label="Mark failed"
                  variant="danger"
                  onPress={() => void runAction(() => failJob(token!, detail.id, 'REJECTED'))}
                />
              </>
            ) : null}
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
