import { createHmac, timingSafeEqual } from 'node:crypto';

export function mockCarrierWebhookSecret(): string {
  return process.env['CARRIER_MOCK_WEBHOOK_SECRET'] ?? 'sandbox-carrier-webhook-secret';
}

export function signCarrierPayload(raw: string, secret = mockCarrierWebhookSecret()): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export function verifyCarrierSignature(raw: string, signature: string | undefined, secret = mockCarrierWebhookSecret()): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signCarrierPayload(raw, secret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
