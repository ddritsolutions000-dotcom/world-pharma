import { PaymentGatewayPort } from './gateway.port';
import { PaymentWebhookPort } from './webhook.port';

export const REQUIRED_GATEWAY_OPERATIONS = [
  'submit',
  'status',
  'capture',
  'void',
  'refund',
] as const;

export type GatewayOperation = (typeof REQUIRED_GATEWAY_OPERATIONS)[number];

export type GatewayCapabilities = Record<GatewayOperation, boolean> & {
  webhookNormalization: boolean;
};

export const FULL_GATEWAY_CAPABILITIES: GatewayCapabilities = {
  submit: true,
  status: true,
  capture: true,
  void: true,
  refund: true,
  webhookNormalization: true,
};

/** Fail closed when registering an incomplete PSP adapter. */
export function assertGatewayCapabilities(adapter: PaymentGatewayPort): void {
  const caps = adapter.capabilities;
  for (const op of REQUIRED_GATEWAY_OPERATIONS) {
    if (!caps[op]) {
      throw new Error(`Payment gateway "${adapter.code}" is missing required capability: ${op}`);
    }
  }
  if (typeof adapter.submit !== 'function' || typeof adapter.refund !== 'function') {
    throw new Error(`Payment gateway "${adapter.code}" does not implement PaymentGatewayPort`);
  }
}

export type WebhookCapabilities = {
  verify: boolean;
  parseEvent: boolean;
};

export const FULL_WEBHOOK_CAPABILITIES: WebhookCapabilities = {
  verify: true,
  parseEvent: true,
};

export function assertWebhookCapabilities(adapter: PaymentWebhookPort, label: string): void {
  const caps = adapter.capabilities;
  if (!caps.verify || !caps.parseEvent) {
    throw new Error(`Webhook handler "${label}" is missing required capabilities`);
  }
}
