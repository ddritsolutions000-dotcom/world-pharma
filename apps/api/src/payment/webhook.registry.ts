import { Injectable } from '@nestjs/common';
import { Errors } from '../common/problem';
import { assertWebhookCapabilities } from './gateway-capabilities';
import { assertSandboxGatewayCode, assertSandboxOnlyRuntime } from './payment.config';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import { PaymentWebhookPort } from './webhook.port';

/** Gateway-code webhook handler dispatch — unknown provider webhooks fail closed. */
@Injectable()
export class PaymentWebhookRegistry {
  private readonly byCodePrefix = new Map<string, PaymentWebhookPort>();

  constructor(private readonly sandbox: SandboxWebhookAdapter) {
    this.register(sandbox, ['MOCK', 'MOCK_PRIMARY', 'MOCK_FALLBACK', 'MOCK_SECONDARY']);
  }

  register(adapter: PaymentWebhookPort, codes: readonly string[]): void {
    assertWebhookCapabilities(adapter, codes.join(','));
    for (const code of codes) {
      this.byCodePrefix.set(code, adapter);
    }
  }

  resolve(gatewayCode: string, gatewayEnvironment = 'sandbox'): PaymentWebhookPort {
    assertSandboxGatewayCode(gatewayCode, gatewayEnvironment);
    if (gatewayEnvironment !== 'sandbox') {
      assertSandboxOnlyRuntime(`webhook:${gatewayCode}`);
    }
    const direct = this.byCodePrefix.get(gatewayCode);
    if (direct) {
      return direct;
    }
    if (this.sandbox.supports(gatewayCode)) {
      return this.sandbox;
    }
    throw Errors.problem(
      409,
      'UNKNOWN_PAYMENT_WEBHOOK',
      'Unknown webhook handler',
      `No webhook handler registered for gateway code "${gatewayCode}".`,
    );
  }
}
