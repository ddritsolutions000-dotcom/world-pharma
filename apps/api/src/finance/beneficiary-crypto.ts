import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Errors } from '../common/problem';
import { resolvePayoutSecret } from './payout.config';

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  const raw = resolvePayoutSecret(process.env['PAYOUT_BENEFICIARY_ENCRYPTION_KEY']);
  if (!raw) {
    throw Errors.problem(
      503,
      'BENEFICIARY_ENCRYPTION_KEY_MISSING',
      'Beneficiary encryption unavailable',
      'Set PAYOUT_BENEFICIARY_ENCRYPTION_KEY (32-byte hex or passphrase) before storing live payout destinations.',
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

/** Encrypt beneficiary account/UPI for live payout. Ciphertext is `iv:tag:data` hex. */
export function encryptBeneficiarySecret(plaintext: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptBeneficiarySecret(ciphertext: string): string {
  const key = keyBytes();
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw Errors.problem(500, 'BENEFICIARY_CIPHER_INVALID', 'Invalid beneficiary ciphertext', 'Stored payout destination could not be decrypted.');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function canEncryptBeneficiaries(): boolean {
  return Boolean(resolvePayoutSecret(process.env['PAYOUT_BENEFICIARY_ENCRYPTION_KEY']));
}
