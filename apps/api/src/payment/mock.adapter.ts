import { Injectable } from '@nestjs/common';
import {
  GatewayRefundInput,
  GatewayStatusResult,
  GatewaySubmitInput,
  GatewaySubmitResult,
  PaymentGatewayPort,
} from './gateway.port';
import { FULL_GATEWAY_CAPABILITIES } from './gateway-capabilities';

/** TEST/SANDBOX only. Never processes real money. */
@Injectable()
export class MockPaymentGatewayAdapter extends PaymentGatewayPort {
  readonly code = 'MOCK';
  readonly capabilities = FULL_GATEWAY_CAPABILITIES;
  private readonly ledger = new Map<string, GatewayStatusResult>();

  async submit(input: GatewaySubmitInput): Promise<GatewaySubmitResult> {
    const providerRef = `mock_${input.attemptId}`;
    switch (input.scenario) {
      case 'pre_submit_fail':
        return { submitted: false, status: 'failed', errorCode: 'PRE_SUBMIT_REJECTED' };
      case 'pre_submit_permanent':
        return { submitted: false, status: 'failed', errorCode: 'PRE_SUBMIT_PERMANENT' };
      case 'timeout':
        this.ledger.set(providerRef, {
          status: 'unknown',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { submitted: true, status: 'unknown', providerRef, errorCode: 'TIMEOUT_AFTER_SUBMIT' };
      case 'unknown':
        this.ledger.set(providerRef, {
          status: 'unknown',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { submitted: true, status: 'unknown', providerRef };
      case 'failure':
        this.ledger.set(providerRef, {
          status: 'failed',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { submitted: true, status: 'failed', providerRef, errorCode: 'MOCK_DECLINED' };
      case 'requires_action':
        this.ledger.set(providerRef, {
          status: 'unknown',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return {
          submitted: true,
          status: 'requires_action',
          providerRef,
          nextAction: {
            type: 'redirect',
            url: `/sandbox/3ds/${providerRef}`,
            sandbox: true,
          },
        };
      case 'upi_collect':
        this.ledger.set(providerRef, {
          status: 'unknown',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return {
          submitted: true,
          status: 'requires_action',
          providerRef,
          nextAction: {
            type: 'upi_collect',
            vpa: 'worldpharma@upi',
            sandbox: true,
          },
        };
      case 'authorize':
        this.ledger.set(providerRef, {
          status: 'authorized',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { submitted: true, status: 'authorized', providerRef };
      case 'success':
      default:
        this.ledger.set(providerRef, {
          status: 'captured',
          providerRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { submitted: true, status: 'captured', providerRef };
    }
  }

  async status(providerRef: string): Promise<GatewayStatusResult> {
    return (
      this.ledger.get(providerRef) ?? {
        status: 'unknown',
        providerRef,
        amountMinor: 0n,
        currency: 'XXX',
      }
    );
  }

  /** Test helper: authoritative status after UNKNOWN (creates ledger row when absent). */
  resolve(
    providerRef: string,
    status: GatewayStatusResult['status'],
    amountMinor = 0n,
    currency = 'XXX',
  ): void {
    const cur = this.ledger.get(providerRef);
    this.ledger.set(providerRef, {
      providerRef,
      status,
      amountMinor: amountMinor > 0n ? amountMinor : (cur?.amountMinor ?? 0n),
      currency: cur?.currency ?? currency,
    });
  }

  async capture(providerRef: string, amountMinor: bigint): Promise<GatewayStatusResult> {
    const cur = await this.status(providerRef);
    const next: GatewayStatusResult = { ...cur, status: 'captured', amountMinor };
    this.ledger.set(providerRef, next);
    return next;
  }

  async void(providerRef: string): Promise<GatewayStatusResult> {
    const cur = await this.status(providerRef);
    const next: GatewayStatusResult = { ...cur, status: 'voided' };
    this.ledger.set(providerRef, next);
    return next;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayStatusResult> {
    const cur = await this.status(input.providerRef);
    const next: GatewayStatusResult = {
      ...cur,
      status: 'refunded',
      amountMinor: input.amountMinor,
      currency: input.currency,
    };
    this.ledger.set(input.providerRef, next);
    return next;
  }
}
