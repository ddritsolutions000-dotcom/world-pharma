/**
 * Sprint 64 — Provider activation framework contracts (no fake live providers).
 */
import {
  PROVIDER_ACTIVATION_CONTRACTS,
  getProviderActivationContract,
} from './provider-activation-contracts';
import {
  assertNoSandboxFallbackInProduction,
  evaluateAllProviderActivations,
  evaluateProviderActivation,
  verifyProviderIntegration,
} from './provider-activation';
import { redactSecretValue } from './secret-redaction';

describe('S64 provider activation contracts', () => {
  it('covers required external integrations with NOT_SELECTED providers', () => {
    const ids = PROVIDER_ACTIVATION_CONTRACTS.map((c) => c.id);
    for (const need of [
      'PAYMENTS_PSP',
      'OTP_AUTH',
      'MESSAGING',
      'CARRIER',
      'AFFILIATE_PAYOUT',
      'ERX',
      'VIDEO',
      'PACS_DICOM',
      'OBJECT_STORAGE',
      'KMS',
      'MALWARE_SCANNER',
      'KYC',
      'MANAGED_DB_PITR',
      'MONITORING_APM',
    ]) {
      expect(ids).toContain(need);
    }
    for (const row of PROVIDER_ACTIVATION_CONTRACTS) {
      expect(row.provider_name).toBe('NOT_SELECTED');
    }
  });

  it('getProviderActivationContract returns payments contract', () => {
    expect(getProviderActivationContract('PAYMENTS_PSP').phase).toBe(3);
  });
});

describe('S64 activation state machine', () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      'PAYMENT_ENVIRONMENT',
      'PAYMENT_LIVE_ENABLED',
      'PROVIDER_EMERGENCY_DISABLE_ALL',
      'PROVIDER_APPROVED_PAYMENTS_PSP',
      'AUTH_DEV_REVEAL_OTP',
      'COMMUNICATION_ENVIRONMENT',
      'OTP_LIVE_ENABLED',
      'PAYOUT_LIVE_ENABLED',
      'JWT_ACCESS_SECRET',
    ]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('marks missing credentials as NOT_CONFIGURED / EXTERNAL_GATED — never fake success', () => {
    delete process.env['PAYMENT_LIVE_ENABLED'];
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    const matrix = evaluateAllProviderActivations();
    expect(matrix.production_launch_ready).toBe(false);
    expect(matrix.overall_any_live_enabled).toBe(false);
    for (const row of matrix.rows) {
      expect(row.enabled).toBe(false);
      expect(row.provider_name).toBe('NOT_SELECTED');
      expect([
        'NOT_CONFIGURED',
        'CONFIGURED',
        'CONFIGURED_BUT_UNAVAILABLE',
        'VERIFIED',
        'VERIFIED_BUT_DISABLED',
        'APPROVED',
        'ENABLED',
        'DISABLED',
        'EXTERNAL_GATED',
        'BLOCKED',
      ]).toContain(row.stage);
    }
  });

  it('credentials + live flag without approval stay disabled (not ENABLED)', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    delete process.env['PROVIDER_APPROVED_PAYMENTS_PSP'];
    const pay = evaluateProviderActivation(getProviderActivationContract('PAYMENTS_PSP'));
    expect(pay.enabled).toBe(false);
    expect(pay.stage).not.toBe('ENABLED');
  });

  it('emergency disable forces DISABLED', () => {
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL'] = 'true';
    const pay = evaluateProviderActivation(getProviderActivationContract('PAYMENTS_PSP'));
    expect(pay.stage).toBe('DISABLED');
    expect(pay.emergency_disabled).toBe(true);
    expect(pay.enabled).toBe(false);
  });

  it('carrier remains EXTERNAL_GATED without production adapter', () => {
    const carrier = evaluateProviderActivation(getProviderActivationContract('CARRIER'));
    expect(carrier.external_blocker).toBe('NO_PRODUCTION_CARRIER_ADAPTER');
    expect(carrier.enabled).toBe(false);
  });

  it('payout live flag alone does not enable payout', () => {
    process.env['PAYOUT_LIVE_ENABLED'] = 'true';
    const payout = evaluateProviderActivation(getProviderActivationContract('AFFILIATE_PAYOUT'));
    expect(payout.enabled).toBe(false);
    expect(payout.external_blocker).toBe('EXTERNAL_PAYOUT_GATED');
  });

  it('verification never prints secrets and never contacts external', () => {
    process.env['JWT_ACCESS_SECRET'] = 'super-secret-value-must-not-leak-abcdef';
    const v = verifyProviderIntegration('PAYMENTS_PSP');
    expect(v.contacted_external).toBe(false);
    expect(v.secrets_printed).toBe(false);
    expect(JSON.stringify(v)).not.toContain('super-secret-value-must-not-leak');
    expect(redactSecretValue('super-secret-value-must-not-leak-abcdef')).toBe('SET');
  });

  it('sandbox/production separation asserts for payment/otp/carrier', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    expect(assertNoSandboxFallbackInProduction('payment').ok).toBe(true);

    process.env['COMMUNICATION_ENVIRONMENT'] = 'production';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    expect(assertNoSandboxFallbackInProduction('otp').ok).toBe(false);

    delete process.env['AUTH_DEV_REVEAL_OTP'];
    expect(assertNoSandboxFallbackInProduction('otp').ok).toBe(true);
    expect(assertNoSandboxFallbackInProduction('carrier').ok).toBe(true);
  });

  it('matrix includes activation sequence phases 0–9', () => {
    const matrix = evaluateAllProviderActivations();
    expect(matrix.sequence_phases.map((p) => p.phase)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
