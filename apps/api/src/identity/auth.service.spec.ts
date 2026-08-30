import { hmacSha256Hex, safeEqualHex } from '@world-pharma/shared';

describe('OTP storage', () => {
  it('stores HMAC not plaintext', () => {
    const pepper = 'x'.repeat(32);
    const challengeId = '11111111-1111-7111-8111-111111111111';
    const code = '123456';
    const digest = hmacSha256Hex(pepper, `${challengeId}:${code}`);
    expect(digest).not.toContain('123456');
    expect(digest).toHaveLength(64);
    expect(safeEqualHex(digest, hmacSha256Hex(pepper, `${challengeId}:${code}`))).toBe(true);
    expect(safeEqualHex(digest, hmacSha256Hex(pepper, `${challengeId}:000000`))).toBe(false);
  });
});
