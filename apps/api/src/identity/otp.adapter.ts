/**
 * OTP provider port — core domain never depends on a specific SMS/email SDK.
 * Sprint 45 extends the contract with verify / delivery-status / health-check.
 */
export type OtpDeliveryStatus =
  | 'QUEUED'
  | 'SENT'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'FAILED'
  | 'EXPIRED'
  | 'EXTERNAL_GATED';

export interface OtpDispatch {
  channel: 'SMS' | 'EMAIL';
  destination: string;
  purpose: string;
  challengeId: string;
  countryCode?: string;
}

export interface OtpSendResult {
  provider_ref?: string;
  status: OtpDeliveryStatus;
  sandbox: boolean;
}

export interface OtpProviderHealth {
  healthy: boolean;
  environment: 'sandbox' | 'production';
  provider: string;
  message: string;
}

export abstract class OtpAdapter {
  /** Dispatch OTP to the recipient. Must never log the plaintext code in production. */
  abstract send(dispatch: OtpDispatch, code: string): Promise<OtpSendResult | void>;

  /** Optional provider-side verification (most OTP flows verify locally via hash). */
  async verify(_providerRef: string, _code: string): Promise<boolean> {
    return false;
  }

  /** Optional delivery receipt lookup. Default EXTERNAL_GATED until live provider exists. */
  async deliveryStatus(_providerRef: string): Promise<OtpDeliveryStatus> {
    return 'EXTERNAL_GATED';
  }

  abstract healthCheck(): Promise<OtpProviderHealth>;
}
