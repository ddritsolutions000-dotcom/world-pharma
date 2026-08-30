import { createHmac, timingSafeEqual } from 'node:crypto';

/** Max age for optional sandbox webhook timestamps (seconds). */
export const SANDBOX_WEBHOOK_MAX_SKEW_SEC = 300;

export function mockWebhookSecret(): string {
  return process.env['PAYMENT_MOCK_WEBHOOK_SECRET'] ?? 'sandbox-webhook-secret';
}

/** Optional replay skew check — absent header preserves existing sandbox contract. */
export function verifySandboxTimestamp(timestampHeader: string | undefined): boolean {
  if (!timestampHeader?.trim()) {
    return true;
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.abs(nowSec - ts) <= SANDBOX_WEBHOOK_MAX_SKEW_SEC;
}

export function signSandboxPayload(raw: string, secret = mockWebhookSecret()): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export function verifySandboxSignature(
  raw: string,
  signature: string | undefined,
  secret = mockWebhookSecret(),
): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signSandboxPayload(raw, secret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Ciphertext stored for webhooks: HMAC only, never card data. */
export function encryptWebhookPayload(raw: string): string {
  return `sha256:${createHmac('sha256', mockWebhookSecret()).update(raw).digest('hex')}`;
}

