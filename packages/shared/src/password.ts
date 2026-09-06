import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/** Modest interactive cost — enough for account passwords without blocking OTP paths. */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function scryptDerive(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLen, options, (err, derived) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derived);
    });
  });
}

/**
 * Encode password as `scrypt$N$r$p$salt$hash` (base64url salt/hash).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptDerive(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (!encoded) {
    return false;
  }
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || N < 2 || r < 1 || p < 1) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) {
    return false;
  }
  try {
    const derived = await scryptDerive(password.normalize('NFKC'), salt, expected.length, { N, r, p });
    if (derived.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
