/** Delivery POD OTP purpose — not interchangeable with auth OtpPurpose. */
export const DELIVERY_POD_PURPOSE = 'DELIVERY_POD';

/** Fixed sandbox delivery OTP — only revealed in test/dev fixtures. Never used as live SMS. */
export const SANDBOX_DELIVERY_OTP = '123456';

export function revealSandboxDeliveryOtp(): string | undefined {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.AUTH_DEV_REVEAL_OTP === 'true'
  ) {
    return SANDBOX_DELIVERY_OTP;
  }
  return undefined;
}

/** HMAC material for delivery OTP — binds code to shipment + purpose. */
export function deliveryOtpHmacPayload(shipmentId: string, code: string): string {
  return `delivery:${shipmentId}:${DELIVERY_POD_PURPOSE}:${code}`;
}
