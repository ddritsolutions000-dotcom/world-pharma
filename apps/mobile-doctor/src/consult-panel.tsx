import {
  apiCall,
  isMockVideoToken,
  isMockVideoWsUrl,
  isOnlineAppointmentType,
  isVideoSessionEnded,
  resolveNativeVideoMedia,
  waitingRoomHeadline,
  type NativeVideoMediaSession,
  type VideoEndResponse,
  type VideoJoinResponse,
  type VideoLeaveResponse,
  type VideoParticipantRole,
  type VideoSessionView,
} from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

export type NativeConsultRole = 'customer' | 'doctor';

type ErrorKind = 'forbidden' | 'unauthorized' | 'network' | 'provider' | 'error' | null;

function paths(role: NativeConsultRole, appointmentId: string) {
  const base =
    role === 'doctor'
      ? `api/v1/doctor/appointments/${appointmentId}/video`
      : `api/v1/appointments/${appointmentId}/video`;
  return {
    join: `${base}/join`,
    leave: `${base}/leave`,
    end: role === 'doctor' ? `${base}/end` : null,
    get: base,
  };
}

export function NativeConsultVideoPanel({
  appointmentId,
  appointmentType,
  role,
  token,
  onUnauthorized,
  canEndVideo = false,
}: {
  appointmentId: string;
  appointmentType?: string;
  role: NativeConsultRole;
  token: string;
  onUnauthorized?: () => void;
  canEndVideo?: boolean;
}) {
  const route = useMemo(() => paths(role, appointmentId), [appointmentId, role]);
  const participantRole: VideoParticipantRole = role === 'doctor' ? 'DOCTOR' : 'CUSTOMER';
  const [phase, setPhase] = useState<'waiting' | 'in-call' | 'ended'>('waiting');
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [session, setSession] = useState<VideoSessionView | null>(null);
  const [inCall, setInCall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaPlane, setMediaPlane] = useState<NativeVideoMediaSession | null>(null);

  const refreshSession = useCallback(async () => {
    const result = await apiCall<VideoSessionView>(route.get, { token, onUnauthorized });
    if (!result.ok) {
      if (result.status === 404) {
        setSession(null);
        return;
      }
      if (result.kind === 'forbidden') {
        setErrorKind('forbidden');
      } else if (result.kind === 'unauthorized') {
        setErrorKind('unauthorized');
      } else if (result.status === 503) {
        setErrorKind('provider');
      } else {
        setErrorKind(result.kind === 'network' ? 'network' : 'error');
      }
      return;
    }
    setSession(result.data);
    if (isVideoSessionEnded(result.data.status)) {
      setPhase('ended');
      setInCall(false);
    }
  }, [onUnauthorized, route.get, token]);

  useEffect(() => {
    if (!isOnlineAppointmentType(appointmentType)) {
      return;
    }
    void refreshSession();
  }, [appointmentType, refreshSession]);

  const join = useCallback(async () => {
    setBusy(true);
    setErrorKind(null);
    const result = await apiCall<VideoJoinResponse>(route.join, {
      method: 'POST',
      token,
      onUnauthorized,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.kind === 'forbidden') {
        setErrorKind('forbidden');
      } else if (result.kind === 'unauthorized') {
        setErrorKind('unauthorized');
      } else if (result.status === 503) {
        setErrorKind('provider');
      } else {
        setErrorKind(result.kind === 'network' ? 'network' : 'error');
      }
      return;
    }
    const mock =
      isMockVideoToken(result.data.token) || isMockVideoWsUrl(result.data.ws_url);
    setMediaPlane(
      resolveNativeVideoMedia({
        isMockToken: mock,
        isMockWsUrl: isMockVideoWsUrl(result.data.ws_url),
        livekitNativeSdkAvailable: false,
      }),
    );
    setInCall(true);
    setPhase('in-call');
    void refreshSession();
  }, [onUnauthorized, refreshSession, route.join, token]);

  const leave = useCallback(async () => {
    setBusy(true);
    await apiCall<VideoLeaveResponse>(route.leave, { method: 'POST', token, onUnauthorized });
    setBusy(false);
    setInCall(false);
    setPhase('waiting');
    void refreshSession();
  }, [onUnauthorized, refreshSession, route.leave, token]);

  const endVideo = useCallback(async () => {
    if (!route.end) {
      return;
    }
    setBusy(true);
    await apiCall<VideoEndResponse>(route.end, { method: 'POST', token, onUnauthorized });
    setBusy(false);
    setInCall(false);
    setPhase('ended');
    void refreshSession();
  }, [onUnauthorized, refreshSession, route.end, token]);

  if (!isOnlineAppointmentType(appointmentType)) {
    return <NativeText variant="caption">Video consult applies to online appointments only.</NativeText>;
  }

  if (errorKind === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  if (errorKind === 'unauthorized') {
    return <NativeEmptyState title="Session expired" description="Sign in again to join." />;
  }
  if (errorKind === 'provider' || errorKind === 'network' || errorKind === 'error') {
    return <NativeNetworkErrorState onRetry={() => void refreshSession()} />;
  }

  if (phase === 'ended') {
    return (
      <NativeCard>
        <NativeText>Video consultation ended.</NativeText>
        <NativeButton label="Refresh status" variant="secondary" onPress={() => void refreshSession()} />
      </NativeCard>
    );
  }

  if (inCall) {
    return (
      <View style={{ gap: 8 }}>
        <NativeCard>
          <NativeText>Sandbox consult active</NativeText>
          <NativeText variant="caption">{mediaPlane?.reason ?? 'Recording off · server-authorized.'}</NativeText>
          <NativeText variant="caption">{`Media: ${mediaPlane?.capability ?? 'unavailable'} · recording off`}</NativeText>
          <NativeButton label={busy ? 'Leaving…' : 'Leave consult'} variant="secondary" onPress={() => void leave()} />
          {canEndVideo && route.end ? (
            <NativeButton label="End video for all" variant="secondary" onPress={() => void endVideo()} />
          ) : null}
          <NativeButton label="Reconnect" variant="secondary" onPress={() => void join()} />
        </NativeCard>
      </View>
    );
  }

  const status = session?.status ?? 'READY';
  return (
    <View style={{ gap: 8 }}>
      <NativeCard>
        <NativeText>{waitingRoomHeadline(status, participantRole)}</NativeText>
        <NativeText variant="caption">
          Server enforces consent, relationship, and policy on every join.
        </NativeText>
        {session ? <NativeText variant="caption">{`Status: ${session.status}`}</NativeText> : null}
        {busy ? <NativeLoadingState title="Joining" /> : null}
        <NativeButton
          label={role === 'doctor' ? 'Join / admit' : 'Join waiting room'}
          onPress={() => void join()}
          disabled={busy}
        />
      </NativeCard>
    </View>
  );
}
