import { signLivekitParticipantToken } from './livekit-token';

describe('LiveKit participant token', () => {
  it('is short-lived and disables recording grants', () => {
    const signed = signLivekitParticipantToken({
      apiKey: 'devkey',
      apiSecret: 'test-livekit-secret-must-be-long-enough',
      roomName: 'apt_test',
      identity: 'c_person',
      role: 'customer',
      ttlSeconds: 90,
    });
    const payload = JSON.parse(Buffer.from(signed.token.split('.')[1], 'base64url').toString()) as {
      video?: { roomRecord?: boolean; roomJoin?: boolean };
      exp: number;
      nbf: number;
    };
    expect(payload.video?.roomRecord).toBe(false);
    expect(payload.video?.roomJoin).toBe(true);
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(95);
    expect(JSON.stringify(signed)).not.toMatch(/test-livekit-secret/);
  });
});
