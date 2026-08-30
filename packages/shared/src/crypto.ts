import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomOtpDigits(length = 6): string {
  const max = 10 ** length;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(length, '0');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function hashIp(ip: string, pepper: string): string {
  return hmacSha256Hex(pepper, ip);
}
