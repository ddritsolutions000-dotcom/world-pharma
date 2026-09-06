/**
 * Sprint 71 — Affiliate payout first onboarding (no fake live bank disbursement).
 */
import {
  evaluateAffiliatePayoutEnablementGuard,
  evaluateAffiliatePayoutFirstOnboarding,
  isLivePayoutEnabled,
  isMockPayoutProvider,
  listAffiliatePayoutLegalFinancialGateItems,
  validateAffiliatePayoutConfiguration,
} from './affiliate-payout-first-onboarding';
import { readPaymentEnvironment } from '../payment/payment.config';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S71 affiliate payout availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no production payout adapter', () => {
    const report = evaluateAffiliatePayoutFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_payout_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.payout_status).toBe('SANDBOX_ONLY');
    expect(report.kyc_gate).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe('NO_PRODUCTION_PAYOUT_ADAPTER');
    expect(report.double_payout_protection).toBe('SANDBOX_VERIFIED');
    expect(report.ledger_protection).toBe('SANDBOX_VERIFIED');
    expect(report.secrets_printed).toBe(false);
    expect(report.beneficiary_secrets_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.capabilities.payout_execution).toBe('SANDBOX_ONLY');
    expect(report.capabilities.bank_transfer).toBe('EXTERNAL_GATED');
  });
});

describe('S71 payout configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockProductionAdapterRegistered: true,
    paymentEnvironment: 'production' as const,
    payoutLiveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    beneficiaryRailsConfigured: true,
    kycProviderReady: true,
    countrySupportConfigured: true,
    currencySupportConfigured: true,
    webhookConfigured: true,
    legalFinancialConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateAffiliatePayoutConfiguration({ ...base, providerSelected: false })).toBe(
      'NOT_SELECTED',
    );
  });

  it('NOT_CONFIGURED without production adapter or KYC/rails', () => {
    expect(
      validateAffiliatePayoutConfiguration({ ...base, nonMockProductionAdapterRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateAffiliatePayoutConfiguration({ ...base, kycProviderReady: false })).toBe(
      'NOT_CONFIGURED',
    );
  });

  it('CONFIGURED_BUT_UNAVAILABLE when webhook/env incomplete', () => {
    expect(validateAffiliatePayoutConfiguration({ ...base, webhookConfigured: false })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(
      validateAffiliatePayoutConfiguration({ ...base, paymentEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (credentials ≠ ENABLED)', () => {
    expect(validateAffiliatePayoutConfiguration(base)).toBe('VERIFIED');
    expect(
      validateAffiliatePayoutConfiguration({ ...base, humanApproved: true, payoutLiveEnabled: false }),
    ).toBe('VERIFIED_BUT_DISABLED');
    expect(
      validateAffiliatePayoutConfiguration({ ...base, humanApproved: true, payoutLiveEnabled: true }),
    ).toBe('APPROVED');
  });
});

describe('S71 enablement guard', () => {
  it('never enables without production payout adapter', () => {
    const guard = evaluateAffiliatePayoutEnablementGuard({
      nonMockProductionAdapterRegistered: false,
      paymentEnvironment: 'production',
      payoutLiveEnabled: true,
      humanApproved: true,
      legalFinancialClear: true,
      kycProviderReady: true,
      webhookProductionReady: true,
      dualControlReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist', () => {
    const guard = evaluateAffiliatePayoutEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      paymentEnvironment: 'production',
      payoutLiveEnabled: true,
      humanApproved: true,
      legalFinancialClear: true,
      kycProviderReady: true,
      webhookProductionReady: true,
      dualControlReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
    const guard = evaluateAffiliatePayoutEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      paymentEnvironment: 'production',
      payoutLiveEnabled: true,
      humanApproved: true,
      legalFinancialClear: true,
      kycProviderReady: true,
      webhookProductionReady: true,
      dualControlReady: true,
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S71 sandbox/production + state machine framing', () => {
  const prev = {
    env: process.env['PAYMENT_ENVIRONMENT'],
    payout: process.env['PAYOUT_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('PAYMENT_ENVIRONMENT', prev.env);
    restore('PAYOUT_LIVE_ENABLED', prev.payout);
  });

  it('treats MOCK as non-production payout provider', () => {
    expect(isMockPayoutProvider('MOCK')).toBe(true);
    expect(isMockPayoutProvider('BANK_RAIL_PROD')).toBe(false);
  });

  it('PAYOUT_LIVE alone does not select production provider', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYOUT_LIVE_ENABLED'] = 'true';
    expect(readPaymentEnvironment()).toBe('production');
    expect(isLivePayoutEnabled()).toBe(true);
    const report = evaluateAffiliatePayoutFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.real_payout_available).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });

  it('documents existing payout statuses (no inventing PAID without provider)', () => {
    const report = evaluateAffiliatePayoutFirstOnboarding();
    expect(report.payout_statuses_supported).toEqual(
      expect.arrayContaining(['CREATED', 'APPROVED', 'SUBMITTED', 'PAID', 'FAILED', 'REVERSED']),
    );
    expect(report.payout_status).not.toBe('ENABLED');
  });
});

describe('S71 legal gate + activation + globalization', () => {
  it('legal/financial gate items remain EXTERNAL_GATED', () => {
    const items = listAffiliatePayoutLegalFinancialGateItems();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    expect(items.find((i) => i.id === 'kyc_aml')?.status).toBe('EXTERNAL_GATED');
  });

  it('AFFILIATE_PAYOUT contract remains NOT_SELECTED / EXTERNAL_PAYOUT_GATED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('AFFILIATE_PAYOUT'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBe('EXTERNAL_PAYOUT_GATED');
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no secrets', () => {
    const blob = JSON.stringify(evaluateAffiliatePayoutFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/account_number|iban|apiSecret|eyJ/i);
  });
});
