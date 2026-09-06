import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function encryptSecret(plaintext: string, pepper: string): string {
  const key = createHash('sha256').update(`${pepper}:mfa-secret`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(ciphertext: string, pepper: string): string {
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('invalid_cipher');
  }
  const key = createHash('sha256').update(`${pepper}:mfa-secret`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
