export type RiskSignals = {
  personId: string;
  countryIso2: string;
  amountMinor: bigint;
  currency: string;
  method: string;
  ip?: string;
};

export type RiskDecision = {
  allow: boolean;
  requireSca: boolean;
  reason?: string;
};

export abstract class RiskPort {
  abstract assess(signals: RiskSignals): Promise<RiskDecision>;
}
