import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ERxPort,
  type ERxCancelResult,
  type ERxStatusResult,
  type ERxSubmitResult,
} from './erx.port';

/**
 * Sandbox e-Rx adapter — provider-neutral test double only.
 * Deterministic providerRef per version for idempotent replays.
 * Not a legal e-Rx integration; L-RX-01 remains a human gate for production.
 */
@Injectable()
export class SandboxERxAdapter extends ERxPort {
  readonly providerCode = 'sandbox';

  async submit(prescriptionVersionId: string): Promise<ERxSubmitResult> {
    const digest = createHash('sha256').update(prescriptionVersionId).digest('hex').slice(0, 16);
    return {
      status: 'submitted',
      providerRef: `sandbox.erx.${digest}`,
    };
  }

  async fetchStatus(providerRef: string): Promise<ERxStatusResult> {
    if (!providerRef.startsWith('sandbox.erx.')) {
      return { status: 'unsupported', reason: 'Unknown sandbox e-Rx reference.' };
    }
    return { status: 'unknown', providerRef, opaque: 'sandbox:accepted' };
  }

  async cancel(providerRef: string): Promise<ERxCancelResult> {
    if (!providerRef.startsWith('sandbox.erx.')) {
      return { status: 'unsupported', reason: 'Unknown sandbox e-Rx reference.' };
    }
    return { status: 'cancelled', providerRef };
  }
}
