import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { Errors } from '../common/problem';
import { verifySandboxSignature, verifySandboxTimestamp } from './hmac';
import { FULL_WEBHOOK_CAPABILITIES } from './gateway-capabilities';
import { ParsedWebhookEvent, PaymentWebhookPort } from './webhook.port';

/** Sandbox webhook verification — HMAC only; no live PSP webhook formats. */
@Injectable()
export class SandboxWebhookAdapter extends PaymentWebhookPort {
  readonly capabilities = FULL_WEBHOOK_CAPABILITIES;

  supports(gatewayCode: string): boolean {
    return gatewayCode.startsWith('MOCK_') || gatewayCode === 'MOCK';
  }

  verify(
    raw: string,
    signature: string | undefined,
    headers: Record<string, string | undefined>,
  ): boolean {
    const headerSig = signature ?? headers['x-sandbox-signature'];
    if (!verifySandboxTimestamp(headers['x-sandbox-timestamp'])) {
      return false;
    }
    return verifySandboxSignature(raw, headerSig);
  }

  parseEvent(raw: string): ParsedWebhookEvent {
    let body: { event_id?: string; type?: string; provider_ref?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      throw Errors.validation('Invalid webhook JSON.');
    }
    return {
      eventId: body.event_id ?? uuidv7(),
      type: body.type ?? 'unknown',
      providerRef: body.provider_ref,
    };
  }
}
