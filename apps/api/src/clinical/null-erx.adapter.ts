import { Injectable } from '@nestjs/common';
import {
  ERxPort,
  type ERxCancelResult,
  type ERxStatusResult,
  type ERxSubmitResult,
} from './erx.port';

/** Always disabled when pack/runtime provider is absent or mismatched. */
@Injectable()
export class NullERxAdapter extends ERxPort {
  async submit(_prescriptionVersionId: string): Promise<ERxSubmitResult> {
    return {
      status: 'unsupported',
      reason: 'e-Rx adapter disabled (NullERxAdapter). Country pack rx_erx_enabled must stay false until authorized.',
    };
  }

  async fetchStatus(providerRef: string): Promise<ERxStatusResult> {
    return {
      status: 'unsupported',
      reason: `e-Rx status unavailable for ref ${providerRef.slice(0, 8)}…`,
    };
  }

  async cancel(providerRef: string): Promise<ERxCancelResult> {
    return {
      status: 'unsupported',
      reason: `e-Rx cancel unavailable for ref ${providerRef.slice(0, 8)}…`,
    };
  }
}
