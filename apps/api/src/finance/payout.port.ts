export type MockPayoutScenario = 'SUCCESS' | 'FAILURE' | 'UNKNOWN';

export type PayoutSubmitInput = {
  payoutId: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  scenario: MockPayoutScenario;
};

export type PayoutSubmitResult = {
  submitted: boolean;
  unknown?: boolean;
  paid?: boolean;
  failed?: boolean;
  providerRef?: string;
  errorCode?: string;
};

export abstract class PayoutPort {
  abstract readonly code: string;
  abstract submit(input: PayoutSubmitInput): Promise<PayoutSubmitResult>;
}
