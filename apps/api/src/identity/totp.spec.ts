import { generateTotpSecret, verifyTotpCode } from './totp';

describe('totp', () => {
  it('generates and verifies a 6-digit code', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(16);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const crypto = require('node:crypto');
    const key = (() => {
      const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let bits = 0;
      let value = 0;
      const bytes: number[] = [];
      for (const char of secret.replace(/=+$/, '').toUpperCase()) {
        const idx = BASE32_ALPHABET.indexOf(char);
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
          bytes.push((value >>> (bits - 8)) & 0xff);
          bits -= 8;
        }
      }
      return Buffer.from(bytes);
    })();
    const digest = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const code = String(binary % 1_000_000).padStart(6, '0');
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });
});
