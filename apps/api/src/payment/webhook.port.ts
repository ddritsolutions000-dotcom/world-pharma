import type { WebhookCapabilities } from './gateway-capabilities';

export type ParsedWebhookEvent = {
  eventId: string;
  type: string;
  providerRef?: string;
};

/** Provider-neutral webhook ingestion boundary — verification + parse only. */
export abstract class PaymentWebhookPort {
  abstract readonly capabilities: WebhookCapabilities;

  abstract supports(gatewayCode: string): boolean;

  abstract verify(
    raw: string,
    signature: string | undefined,
    headers: Record<string, string | undefined>,
  ): boolean;

  abstract parseEvent(raw: string): ParsedWebhookEvent;
}
