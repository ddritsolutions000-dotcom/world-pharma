import { hmacSha256Hex, safeEqualHex } from '@world-pharma/shared';
import {
  DELIVERY_POD_PURPOSE,
  deliveryOtpHmacPayload,
  SANDBOX_DELIVERY_OTP,
} from './sandbox-otp';

describe('delivery OTP crypto', () => {
  const pepper = 'test-otp-pepper-must-be-32-chars-minx';

  it('binds HMAC to shipment + purpose', () => {
    const a = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-1', SANDBOX_DELIVERY_OTP));
    const b = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-2', SANDBOX_DELIVERY_OTP));
    expect(a).not.toBe(b);
    expect(DELIVERY_POD_PURPOSE).toBe('DELIVERY_POD');
  });

  it('same shipment+code produces equal digest', () => {
    const a = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-1', '123456'));
    const b = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-1', '123456'));
    expect(safeEqualHex(a, b)).toBe(true);
  });

  it('wrong code does not match', () => {
    const expected = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-1', '123456'));
    const wrong = hmacSha256Hex(pepper, deliveryOtpHmacPayload('ship-1', '000000'));
    expect(safeEqualHex(expected, wrong)).toBe(false);
  });
});
