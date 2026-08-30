import { signSandboxPayload, verifySandboxTimestamp } from './hmac';

describe('sandbox webhook hmac', () => {
  it('accepts missing timestamp (backward compatible)', () => {
    expect(verifySandboxTimestamp(undefined)).toBe(true);
    expect(verifySandboxTimestamp('')).toBe(true);
  });

  it('rejects stale timestamps beyond skew window', () => {
    const stale = Math.floor(Date.now() / 1000) - 600;
    expect(verifySandboxTimestamp(String(stale))).toBe(false);
  });

  it('accepts current timestamp within skew window', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifySandboxTimestamp(String(now))).toBe(true);
  });

  it('rejects future timestamps beyond skew window', () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    expect(verifySandboxTimestamp(String(future))).toBe(false);
  });

  it('accepts near-future timestamps within skew window', () => {
    const nearFuture = Math.floor(Date.now() / 1000) + 60;
    expect(verifySandboxTimestamp(String(nearFuture))).toBe(true);
  });

  it('signs payloads deterministically for verification', () => {
    const raw = JSON.stringify({ event_id: 'evt-1', type: 'payment.captured' });
    const sig = signSandboxPayload(raw);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});
