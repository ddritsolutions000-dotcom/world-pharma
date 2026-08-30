import { backoffMs, sanitizeErrorMessage, sanitizePayload } from './envelope';

describe('event envelope helpers', () => {
  it('strips sensitive keys from payloads', () => {
    const clean = sanitizePayload({
      person_id: 'abc',
      otp: '123456',
      password: 'secret',
      access_token: 'tok',
      nested: { refresh_token: 'r', ok: 1 },
    });
    expect(clean).toEqual({ person_id: 'abc', nested: { ok: 1 } });
  });

  it('redacts secrets in error strings', () => {
    expect(sanitizeErrorMessage(new Error('otp=999999 failed'))).not.toMatch(/otp=999999/i);
  });

  it('backs off exponentially and caps', () => {
    expect(backoffMs(1)).toBe(15_000);
    expect(backoffMs(2)).toBe(30_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
