/**
 * Partner live payout readiness — unit (no network, no invented bank success).
 */
import {
  isLivePartnerPayoutReady,
  isMockPayoutProvider,
  readPartnerPayoutProvider,
  readPartnerPayoutRuntimeConfig,
} from './payout.config';

describe('partner live payout config', () => {
  const keys = [
    'PAYOUT_PROVIDER',
    'PAYOUT_LIVE_ENABLED',
    'PAYMENT_ENVIRONMENT',
    'RAZORPAYX_KEY_ID',
    'RAZORPAYX_KEY_SECRET',
    'RAZORPAYX_ACCOUNT_NUMBER',
    'RAZORPAYX_WEBHOOK_SECRET',
    'PAYOUT_BENEFICIARY_ENCRYPTION_KEY',
    'PROVIDER_APPROVED_AFFILIATE_PAYOUT',
    'PAYOUT_LEGAL_ATTESTED',
    'PAYOUT_KYC_ATTESTED',
    'PAYOUT_DUAL_CONTROL_ATTESTED',
  ];

  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it('defaults to MOCK and not live-ready', () => {
    expect(readPartnerPayoutProvider()).toBe('MOCK');
    expect(isMockPayoutProvider('MOCK')).toBe(true);
    expect(isLivePartnerPayoutReady()).toBe(false);
    expect(readPartnerPayoutRuntimeConfig().remaining_blocker).toBe('NO_PRODUCTION_PAYOUT_ADAPTER');
  });

  it('is live-ready only when every gate is set', () => {
    process.env.PAYOUT_PROVIDER = 'RAZORPAYX';
    process.env.RAZORPAYX_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAYX_KEY_SECRET = 'secret';
    process.env.RAZORPAYX_WEBHOOK_SECRET = 'whsec';
    process.env.PAYOUT_BENEFICIARY_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.PAYMENT_ENVIRONMENT = 'production';
    process.env.PROVIDER_APPROVED_AFFILIATE_PAYOUT = 'true';
    process.env.PAYOUT_LEGAL_ATTESTED = 'true';
    process.env.PAYOUT_KYC_ATTESTED = 'true';
    process.env.PAYOUT_DUAL_CONTROL_ATTESTED = 'true';
    process.env.PAYOUT_LIVE_ENABLED = 'true';
    expect(isLivePartnerPayoutReady()).toBe(true);
    expect(readPartnerPayoutRuntimeConfig().adapter_code).toBe('RAZORPAYX');
  });

  it('does not invent live-ready with credentials alone', () => {
    process.env.PAYOUT_PROVIDER = 'RAZORPAYX';
    process.env.RAZORPAYX_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAYX_KEY_SECRET = 'secret';
    expect(isLivePartnerPayoutReady()).toBe(false);
  });
});
