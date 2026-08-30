import {
  isMockVideoToken,
  isMockVideoWsUrl,
  isOnlineAppointmentType,
  isVideoSessionEnded,
  waitingRoomHeadline,
} from './video-session';

describe('video-session helpers', () => {
  it('detects mock sandbox tokens', () => {
    expect(isMockVideoToken('mock.customer.abc123')).toBe(true);
    expect(isMockVideoToken('eyJhbGciOiJIUzI1NiJ9')).toBe(false);
  });

  it('detects mock ws urls', () => {
    expect(isMockVideoWsUrl('wss://mock.video.local')).toBe(true);
    expect(isMockVideoWsUrl('wss://sandbox.livekit.cloud')).toBe(false);
  });

  it('classifies ended sessions', () => {
    expect(isVideoSessionEnded('ENDED')).toBe(true);
    expect(isVideoSessionEnded('IN_PROGRESS')).toBe(false);
  });

  it('recognizes online appointment types', () => {
    expect(isOnlineAppointmentType('ONLINE')).toBe(true);
    expect(isOnlineAppointmentType('IN_PERSON')).toBe(false);
  });

  it('returns role-aware waiting room copy', () => {
    expect(waitingRoomHeadline('READY', 'CUSTOMER')).toMatch(/Waiting for your doctor/i);
    expect(waitingRoomHeadline('CUSTOMER_JOINED', 'DOCTOR')).toMatch(/Patient is waiting/i);
  });
});
