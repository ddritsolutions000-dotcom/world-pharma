import { PaymentMethodFamily } from '@prisma/client';
import type { GatewayCapabilities } from './gateway-capabilities';

export type SandboxScenario =
  | 'success'
  | 'authorize'
  | 'requires_action'
  | 'upi_collect'
  | 'failure'
  | 'timeout'
  | 'unknown'
  | 'pre_submit_fail'
  | 'pre_submit_fail_all'
  | 'pre_submit_permanent';

export type GatewayNextAction = {
  type: 'redirect' | 'challenge' | 'frictionless' | 'upi_collect';
  url?: string;
  vpa?: string;
  sandbox: true;
};

export type GatewaySubmitInput = {
  attemptId: string;
  intentId: string;
  amountMinor: bigint;
  currency: string;
  method: PaymentMethodFamily;
  countryIso2: string;
  scenario: SandboxScenario;
  paymentMethodRef: string;
};

export type GatewaySubmitResult = {
  submitted: boolean;
  status: 'authorized' | 'captured' | 'requires_action' | 'failed' | 'unknown';
  providerRef?: string;
  nextAction?: GatewayNextAction;
  errorCode?: string;
};

export type GatewayStatusResult = {
  status: 'authorized' | 'captured' | 'failed' | 'unknown' | 'voided' | 'refunded';
  providerRef: string;
  amountMinor: bigint;
  currency: string;
};

export type GatewayRefundInput = {
  providerRef: string;
  amountMinor: bigint;
  currency: string;
};

export abstract class PaymentGatewayPort {
  abstract readonly code: string;

  /** Required PSP operations — incomplete adapters cannot be registered. */
  abstract readonly capabilities: GatewayCapabilities;

  abstract submit(input: GatewaySubmitInput): Promise<GatewaySubmitResult>;
  abstract status(providerRef: string): Promise<GatewayStatusResult>;
  abstract capture(providerRef: string, amountMinor: bigint): Promise<GatewayStatusResult>;
  abstract void(providerRef: string): Promise<GatewayStatusResult>;
  abstract refund(input: GatewayRefundInput): Promise<GatewayStatusResult>;
}
