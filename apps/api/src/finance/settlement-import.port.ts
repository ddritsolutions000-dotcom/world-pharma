/** Provider-neutral settlement batch record from PSP/file/API. */
export type SettlementImportRecordInput = {
  externalRecordRef: string;
  providerPaymentRef: string;
  amountMinor: bigint;
  feeMinor?: bigint;
  currency: string;
};

/** Normalized settlement batch payload. */
export type SettlementImportBatchPayload = {
  externalBatchRef: string;
  currency: string;
  records: SettlementImportRecordInput[];
};

export type SettlementImportFetchInput = {
  countryId: string;
  countryIso2: string;
  externalBatchRef: string;
  currency: string;
};

export type SettlementImportListInput = {
  countryId: string;
  countryIso2: string;
  currency: string;
};

export abstract class SettlementImportPort {
  abstract readonly providerCode: string;
  abstract fetchBatch(input: SettlementImportFetchInput): Promise<SettlementImportBatchPayload>;

  /** Provider-neutral discovery of batch refs available for scheduled fetch. */
  listAvailableBatches(_input: SettlementImportListInput): Promise<string[]> {
    return Promise.resolve([]);
  }
}
