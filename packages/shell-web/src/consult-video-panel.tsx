'use client';

import {
  apiCall,
  isMockVideoToken,
  isMockVideoWsUrl,
  isOnlineAppointmentType,
  isVideoSessionEnded,
  waitingRoomHeadline,
  type VideoEndResponse,
  type VideoJoinResponse,
  type VideoLeaveResponse,
  type VideoParticipantRole,
  type VideoSessionView,
} from '@world-pharma/shell-core';
import {
  Button,
  Card,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ConsultVideoRole = 'customer' | 'doctor';

type ConsultPhase = 'idle' | 'waiting' | 'in-call' | 'ended' | 'error';

type ConsultErrorKind = 'forbidden' | 'unauthorized' | 'network' | 'provider' | 'error' | null;

function paths(role: ConsultVideoRole, appointmentId: string) {
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

function ConsultLiveKitRoom({
  wsUrl,
  token,
  onLeave,
}: {
  wsUrl: string;
  token: string;
  onLeave: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');

  useEffect(() => {
    let room: import('livekit-client').Room | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Room } = await import('livekit-client');
        room = new Room({ adaptiveStream: true });
        room.on('disconnected', () => {
          if (!cancelled) {
            onLeave();
          }
        });
        await room.connect(wsUrl, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setStatus('connected');
        const container = hostRef.current;
        if (!container) {
          return;
        }
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track) {
              const el = pub.track.attach();
              container.appendChild(el);
            }
          });
        });
        room.on('trackSubscribed', (track) => {
          const el = track.attach();
          container.appendChild(el);
        });
        const local = room.localParticipant;
        await local.setMicrophoneEnabled(true);
        await local.setCameraEnabled(true);
        local.trackPublications.forEach((pub) => {
          if (pub.track) {
            const el = pub.track.attach();
            el.classList.add('consult-self-preview');
            container.appendChild(el);
          }
        });
      } catch {
        if (!cancelled) {
          setStatus('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      void room?.disconnect();
    };
  }, [onLeave, token, wsUrl]);

  if (status === 'failed') {
    return (
      <NetworkErrorState
        action={{
          label: 'Leave consult',
          onClick: onLeave,
        }}
      />
    );
  }

  return (
    <div className="consult-livekit-shell">
      {status === 'connecting' ? <LoadingState label="Connecting to consult room" /> : null}
      <div ref={hostRef} className="consult-livekit-stage" aria-label="Video consult stage" />
      <Button variant="secondary" size="sm" onClick={onLeave}>
        Leave consult
      </Button>
    </div>
  );
}

function MockInCallRoom({ onLeave }: { onLeave: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Card>
      <Text>Sandbox consult (mock media plane)</Text>
      <Text size="caption" tone="secondary">
        Server-authorized session. Recording is off.
      </Text>
      <Text>{`Elapsed ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
      <div className="consult-mock-stage" aria-label="Mock video stage">
        <Text tone="secondary">Simulated A/V — no media recorded</Text>
      </div>
      <Button variant="secondary" size="sm" onClick={onLeave}>
        Leave consult
      </Button>
    </Card>
  );
}

export function ConsultVideoPanel({
  appointmentId,
  appointmentType,
  role,
  token,
  onUnauthorized,
  canEndVideo = false,
}: {
  appointmentId: string;
  appointmentType?: string;
  role: ConsultVideoRole;
  token: string | null;
  onUnauthorized?: () => void;
  canEndVideo?: boolean;
}) {
  const route = useMemo(() => paths(role, appointmentId), [appointmentId, role]);
  const [phase, setPhase] = useState<ConsultPhase>('idle');
  const [errorKind, setErrorKind] = useState<ConsultErrorKind>(null);
  const [session, setSession] = useState<VideoSessionView | null>(null);
  const [joinPayload, setJoinPayload] = useState<VideoJoinResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const participantRole: VideoParticipantRole = role === 'doctor' ? 'DOCTOR' : 'CUSTOMER';

  const refreshSession = useCallback(async () => {
    if (!token) {
      return null;
    }
    const result = await apiCall<VideoSessionView>(route.get, { token, onUnauthorized });
    if (!result.ok) {
      if (result.status === 404) {
        setSession(null);
        return null;
      }
      if (result.kind === 'forbidden') {
        setErrorKind('forbidden');
      } else if (result.kind === 'unauthorized') {
        setErrorKind('unauthorized');
      } else if (result.status === 503) {
        setErrorKind('provider');
      } else if (result.kind === 'network') {
        setErrorKind('network');
      } else {
        setErrorKind('error');
      }
      return null;
    }
    setSession(result.data);
    if (isVideoSessionEnded(result.data.status)) {
      setPhase('ended');
    }
    return result.data;
  }, [onUnauthorized, route.get, token]);

  useEffect(() => {
    if (!token || !isOnlineAppointmentType(appointmentType)) {
      return;
    }
    void refreshSession();
  }, [appointmentType, refreshSession, token]);

  useEffect(() => {
    if (phase !== 'waiting' || !token) {
      return;
    }
    const id = window.setInterval(() => {
      void refreshSession();
    }, 4000);
    return () => window.clearInterval(id);
  }, [phase, refreshSession, token]);

  const join = useCallback(async () => {
    if (!token) {
      return;
    }
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
      } else if (result.kind === 'network') {
        setErrorKind('network');
      } else {
        setErrorKind('error');
      }
      return;
    }
    if (result.data.recording_enabled !== false) {
      setErrorKind('error');
      return;
    }
    setJoinPayload(result.data);
    setSession((prev) =>
      prev
        ? { ...prev, status: result.data.status }
        : {
            id: result.data.session_id,
            appointment_id: appointmentId,
            encounter_id: null,
            provider: isMockVideoToken(result.data.token) ? 'mock' : 'livekit',
            status: result.data.status,
            recording_enabled: false,
            started_at: null,
            ended_at: null,
            expires_at: result.data.token_expires_at,
            failure_category: null,
          },
    );
    setPhase('in-call');
  }, [appointmentId, onUnauthorized, route.join, token]);

  const leave = useCallback(async () => {
    if (!token) {
      return;
    }
    setBusy(true);
    await apiCall<VideoLeaveResponse>(route.leave, { method: 'POST', token, onUnauthorized });
    setBusy(false);
    setJoinPayload(null);
    setPhase('waiting');
    void refreshSession();
  }, [onUnauthorized, refreshSession, route.leave, token]);

  const endVideo = useCallback(async () => {
    if (!token || !route.end) {
      return;
    }
    setBusy(true);
    await apiCall<VideoEndResponse>(route.end, { method: 'POST', token, onUnauthorized });
    setBusy(false);
    setJoinPayload(null);
    setPhase('ended');
    void refreshSession();
  }, [onUnauthorized, refreshSession, route.end, token]);

  if (!isOnlineAppointmentType(appointmentType)) {
    return (
      <Text tone="secondary">Video consult is available for online appointments only.</Text>
    );
  }

  if (!token) {
    return <Text tone="secondary">Sign in to join a video consult.</Text>;
  }

  if (errorKind === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (errorKind === 'unauthorized') {
    return <Text>Session expired. Sign in again to join.</Text>;
  }
  if (errorKind === 'provider') {
    return (
      <NetworkErrorState
        action={{
          label: 'Retry',
          onClick: () => {
            setErrorKind(null);
            void refreshSession();
          },
        }}
      />
    );
  }
  if (errorKind === 'network' || errorKind === 'error') {
    return (
      <NetworkErrorState
        action={{
          label: 'Retry',
          onClick: () => {
            setErrorKind(null);
            void refreshSession();
          },
        }}
      />
    );
  }

  if (phase === 'ended' || (session && isVideoSessionEnded(session.status))) {
    return (
      <Card>
        <Text>Video consultation ended.</Text>
        <Text size="caption" tone="secondary">
          Encounter completion is a separate step for clinicians.
        </Text>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setPhase('waiting');
            void refreshSession();
          }}
        >
          View session status
        </Button>
      </Card>
    );
  }

  if (phase === 'in-call' && joinPayload) {
    const useMock =
      isMockVideoToken(joinPayload.token) || isMockVideoWsUrl(joinPayload.ws_url);
    return (
      <div className="consult-in-call">
        <Text size="caption">Recording off · server-authorized</Text>
        {useMock ? (
          <MockInCallRoom onLeave={() => void leave()} />
        ) : (
          <ConsultLiveKitRoom wsUrl={joinPayload.ws_url} token={joinPayload.token} onLeave={() => void leave()} />
        )}
        {canEndVideo && route.end ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void endVideo()}>
            End video for all
          </Button>
        ) : null}
        <Button variant="tertiary" size="sm" disabled={busy} onClick={() => void join()}>
          Reconnect
        </Button>
      </div>
    );
  }

  const status = session?.status ?? 'READY';
  const headline = waitingRoomHeadline(status, participantRole);

  return (
    <Card>
      <Text>{headline}</Text>
      <Text size="caption" tone="secondary">
        {role === 'doctor'
          ? 'Join to admit the patient. Access is enforced on the server.'
          : 'Your doctor will admit you when ready. Consent and policy checks apply at join.'}
      </Text>
      {session ? (
        <Text size="caption">{`Session status: ${session.status}`}</Text>
      ) : (
        <Text size="caption">No active session yet — join creates one when authorized.</Text>
      )}
      <Button size="sm" disabled={busy} onClick={() => void join()}>
        {busy ? 'Joining…' : role === 'doctor' ? 'Join / admit' : 'Join waiting room'}
      </Button>
      {joinPayload ? null : (
        <Text size="caption" tone="secondary" data-testid="consult-no-token">
          Join token is issued only after server authorization and is never shown here.
        </Text>
      )}
    </Card>
  );
}
