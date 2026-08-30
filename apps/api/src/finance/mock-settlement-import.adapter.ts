import { Injectable } from '@nestjs/common';
import {
  SettlementImportBatchPayload,
  SettlementImportFetchInput,
  SettlementImportListInput,
  SettlementImportPort,
  SettlementImportRecordInput,
} from './settlement-import.port';

/** TEST/SANDBOX only — deterministic settlement batches for reconciliation drills. */
@Injectable()
export class MockSettlementImportAdapter extends SettlementImportPort {
  readonly providerCode = 'MOCK_SETTLEMENT';

  private readonly batches = new Map<string, SettlementImportBatchPayload>();

  /** Test helper: register a batch before fetch. */
  registerBatch(externalBatchRef: string, payload: SettlementImportBatchPayload): void {
    this.batches.set(externalBatchRef, payload);
  }

  /** Test helper: simulate transient fetch failure. */
  private transientFailRefs = new Set<string>();

  /** Test helper: simulate permanent fetch failure. */
  private permanentFailRefs = new Set<string>();

  armTransientFailure(externalBatchRef: string): void {
    this.transientFailRefs.add(externalBatchRef);
  }

  clearTransientFailure(externalBatchRef: string): void {
    this.transientFailRefs.delete(externalBatchRef);
  }

  armPermanentFailure(externalBatchRef: string): void {
    this.permanentFailRefs.add(externalBatchRef);
  }

  clearPermanentFailure(externalBatchRef: string): void {
    this.permanentFailRefs.delete(externalBatchRef);
  }

  override async listAvailableBatches(_input: SettlementImportListInput): Promise<string[]> {
    return [...this.batches.keys()];
  }

  async fetchBatch(input: SettlementImportFetchInput): Promise<SettlementImportBatchPayload> {
    if (this.permanentFailRefs.has(input.externalBatchRef)) {
      throw Object.assign(new Error('permanent settlement fetch failure'), {
        permanent: true,
        code: 'MOCK_SETTLEMENT_PERMANENT',
      });
    }
    if (this.transientFailRefs.has(input.externalBatchRef)) {
      throw Object.assign(new Error('transient settlement fetch failure'), { transient: true });
    }
    const stored = this.batches.get(input.externalBatchRef);
    if (stored) {
      return stored;
    }
    return {
      externalBatchRef: input.externalBatchRef,
      currency: input.currency,
      records: [],
    };
  }

  /** Convenience for tests — build inline batch without pre-register. */
  buildPayload(
    externalBatchRef: string,
    currency: string,
    records: SettlementImportRecordInput[],
  ): SettlementImportBatchPayload {
    return { externalBatchRef, currency, records };
  }
}
