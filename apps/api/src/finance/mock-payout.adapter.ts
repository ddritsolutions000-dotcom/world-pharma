import { Injectable } from '@nestjs/common';
import { PayoutPort, type PayoutSubmitInput, type PayoutSubmitResult } from './payout.port';

/** SANDBOX payout rail. Zero network. Never a bank / PSP / live vendor transfer. */
@Injectable()
export class MockPayoutAdapter extends PayoutPort {
  readonly code = 'MOCK';

  async submit(input: PayoutSubmitInput): Promise<PayoutSubmitResult> {
    switch (input.scenario) {
      case 'FAILURE':
        return { submitted: false, failed: true, errorCode: 'MOCK_PAYOUT_REJECTED' };
      case 'UNKNOWN':
        return { submitted: true, unknown: true, providerRef: `mock_payout_unk_${input.payoutId}`, errorCode: 'MOCK_PAYOUT_TIMEOUT' };
      default:
        return {
          submitted: true,
          paid: true,
          providerRef: `mock_payout_${input.payoutId}`,
        };
    }
  }
}
