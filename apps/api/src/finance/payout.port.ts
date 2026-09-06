export type MockPayoutScenario = 'SUCCESS' | 'FAILURE' | 'UNKNOWN';

export type PayoutBeneficiary = {
  method: 'BANK' | 'UPI';
  account_holder_name: string;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_or_routing?: string | null;
  upi_id?: string | null;
};

export type PayoutSubmitInput = {
  payoutId: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  /** Sandbox MockPayoutAdapter only. Live adapters ignore this. */
  scenario?: MockPayoutScenario;
  /** Present for live partner wallet withdraws. */
  beneficiary?: PayoutBeneficiary;
  purpose?: string;
  notes?: string;
};

export type PayoutSubmitResult = {
  submitted: boolean;
  unknown?: boolean;
  /** Only MockPayoutAdapter may set paid=true synchronously. Live adapters must stay async. */
  paid?: boolean;
  failed?: boolean;
  providerRef?: string;
  errorCode?: string;
  mode?: 'sandbox' | 'live';
};

export abstract class PayoutPort {
  abstract readonly code: string;
  abstract submit(input: PayoutSubmitInput): Promise<PayoutSubmitResult>;
}
