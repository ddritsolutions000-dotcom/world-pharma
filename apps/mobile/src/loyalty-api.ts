import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type LoyaltyBalance = {
  enabled: boolean;
  balance_points: number;
  live_redemption: boolean;
  program_code?: string | null;
};

export type LoyaltyLedgerRow = {
  id: string;
  kind: string;
  points_delta: number;
  created_at: string;
};

export function fetchLoyaltyBalance(
  token: string,
  countryCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<LoyaltyBalance>> {
  return apiCall<LoyaltyBalance>(
    `api/v1/me/loyalty/balance?country_code=${encodeURIComponent(countryCode)}`,
    { token, onUnauthorized },
  );
}

export function fetchLoyaltyLedger(
  token: string,
  countryCode: string,
  onUnauthorized?: () => void,
): Promise<ApiCallResult<{ data: LoyaltyLedgerRow[] }>> {
  return apiCall<{ data: LoyaltyLedgerRow[] }>(
    `api/v1/me/loyalty/ledger?country_code=${encodeURIComponent(countryCode)}`,
    { token, onUnauthorized },
  );
}
