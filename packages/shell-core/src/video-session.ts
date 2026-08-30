export type VideoSessionStatus =
  | 'CREATED'
  | 'READY'
  | 'DOCTOR_JOINED'
  | 'CUSTOMER_JOINED'
  | 'IN_PROGRESS'
  | 'ENDED'
  | 'FAILED'
  | 'EXPIRED';

export type VideoParticipantRole = 'DOCTOR' | 'CUSTOMER';

export type VideoJoinResponse = {
  session_id: string;
  status: VideoSessionStatus;
  role: VideoParticipantRole;
  ws_url: string;
  token: string;
  token_expires_at: string | Date;
  recording_enabled: false;
  reconnect: boolean;
};

export type VideoLeaveResponse = {
  session_id: string;
  status: VideoSessionStatus;
  encounter_completed: boolean;
};

export type VideoEndResponse = {
  session_id: string;
  status: VideoSessionStatus;
  encounter_completed: boolean;
};

export type VideoSessionView = {
  id: string;
  appointment_id: string;
  encounter_id: string | null;
  provider: string;
  status: VideoSessionStatus;
  recording_enabled: false;
  started_at: string | Date | null;
  ended_at: string | Date | null;
  expires_at: string | Date;
  failure_category: string | null;
};

export const ACTIVE_VIDEO_SESSION_STATUSES: VideoSessionStatus[] = [
  'CREATED',
  'READY',
  'DOCTOR_JOINED',
  'CUSTOMER_JOINED',
  'IN_PROGRESS',
];

export function isMockVideoToken(token: string): boolean {
  return token.startsWith('mock.');
}

export function isMockVideoWsUrl(wsUrl: string): boolean {
  return wsUrl.includes('mock.video.local');
}

export function isVideoSessionEnded(status: VideoSessionStatus | string): boolean {
  return status === 'ENDED' || status === 'FAILED' || status === 'EXPIRED';
}

export function isOnlineAppointmentType(type: string | undefined): boolean {
  return type === 'ONLINE' || type === 'online';
}

export function waitingRoomHeadline(
  status: VideoSessionStatus | string,
  role: VideoParticipantRole,
): string {
  if (isVideoSessionEnded(status)) {
    return 'Consultation ended';
  }
  if (status === 'IN_PROGRESS') {
    return 'Consultation in progress';
  }
  if (role === 'CUSTOMER') {
    if (status === 'DOCTOR_JOINED' || status === 'IN_PROGRESS') {
      return 'Your doctor is ready';
    }
    return 'Waiting for your doctor';
  }
  if (status === 'CUSTOMER_JOINED') {
    return 'Patient is waiting — join to start';
  }
  return 'Ready to admit patient';
}

export function mapVideoApiError(status: number, detail?: string): {
  kind: 'forbidden' | 'unauthorized' | 'network' | 'provider' | 'error';
  message: string;
} {
  if (status === 401) {
    return { kind: 'unauthorized', message: 'Session expired.' };
  }
  if (status === 403) {
    return { kind: 'forbidden', message: detail ?? 'Video join denied.' };
  }
  if (status === 503) {
    return { kind: 'provider', message: detail ?? 'Video provider unavailable.' };
  }
  if (status === 0) {
    return { kind: 'network', message: 'Network unavailable.' };
  }
  return { kind: 'error', message: detail ?? 'Request failed.' };
}
