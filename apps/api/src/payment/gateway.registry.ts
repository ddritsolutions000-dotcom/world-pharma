import { Injectable } from '@nestjs/common';
import { Errors } from '../common/problem';
import { assertGatewayCapabilities } from './gateway-capabilities';
import { assertSandboxGatewayCode, assertSandboxOnlyRuntime } from './payment.config';
import { PaymentGatewayPort } from './gateway.port';
import { MockPaymentGatewayAdapter } from './mock.adapter';

/** PSP-neutral gateway adapter registry — gateway-code dispatch, fail-closed for unknown providers. */
@Injectable()
export class PaymentGatewayRegistry {
  private readonly byCode = new Map<string, PaymentGatewayPort>();
  private readonly mockAdapter: MockPaymentGatewayAdapter;

  constructor(mock: MockPaymentGatewayAdapter) {
    this.mockAdapter = mock;
    this.register(mock, ['MOCK', 'MOCK_PRIMARY', 'MOCK_FALLBACK', 'MOCK_SECONDARY']);
  }

  register(adapter: PaymentGatewayPort, codes: readonly string[]): void {
    assertGatewayCapabilities(adapter);
    for (const code of codes) {
      this.byCode.set(code, adapter);
    }
  }

  isRegistered(gatewayCode: string): boolean {
    return this.byCode.has(gatewayCode);
  }

  registeredCodes(): string[] {
    return [...this.byCode.keys()];
  }

  /**
   * Resolve adapter for a gateway code. Unknown codes fail closed.
   * Live/production gateway rows require explicit live enablement (human gates).
   */
  resolve(gatewayCode: string, gatewayEnvironment = 'sandbox'): PaymentGatewayPort {
    assertSandboxGatewayCode(gatewayCode, gatewayEnvironment);
    if (gatewayEnvironment !== 'sandbox') {
      assertSandboxOnlyRuntime(`gateway:${gatewayCode}`);
    }
    const adapter = this.byCode.get(gatewayCode);
    if (!adapter) {
      throw Errors.problem(
        409,
        'UNKNOWN_PAYMENT_GATEWAY',
        'Unknown gateway',
        `No payment adapter registered for gateway code "${gatewayCode}".`,
      );
    }
    return adapter;
  }

  /** Sandbox test helper: authoritative mock status after UNKNOWN reconciliation. */
  resolveMockStatus(providerRef: string, status: 'captured' | 'failed' | 'authorized'): void {
    this.mockAdapter.resolve(providerRef, status);
  }
}
