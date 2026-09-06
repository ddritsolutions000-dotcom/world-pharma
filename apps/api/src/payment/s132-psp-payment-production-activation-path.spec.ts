/**
 * Sprint 132 — Real PSP / payment production activation path (unit).
 * No invented PSP / no real money / secrets never printed.
 */
import { PaymentIntentStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import {
  assertProductionPspInitiationAllowed,
  assertProductionPspWebhookIngestAllowed,
  buildLivePspConfigurationReferenceSlots,
  deriveProductionPspLifecycle,
  evaluateClientForgedPaymentSuccess,
  evaluateIllegalPaymentTransitions,
  evaluateProductionWebhookNegativeCases,
  evaluatePspPaymentProductionActivationPath,
  MOCK_PSP_BLOCKED_IN_PRODUCTION,
  PRODUCTION_PSP_INITIATION_BLOCKED,
  PRODUCTION_WEBHOOK_EXTERNAL_GATED,
  readConfiguredProductionPspProvider,
} from './psp-payment-production-activation-path';
import { NO_PRODUCTION_PSP } from './psp-real-activation-first-onboarding';
import { evaluatePspPaymentProductionActivationControl } from './psp-payment-production-activation-control';
import { canTransitionIntent } from './state-machine';
import { NO_PRODUCTION_SECRETS_MANAGER_ADAPTER } from '../ops/secrets-manager-runtime-resolver';

function assertNoSecretLeak(blob: string): void {
  expect(blob).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY|api[_-]?secret\s*[:=]/i);
}

describe('S132 PSP production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production remains BLOCKED without credentials', () => {
    delete process.env['PAYMENT_GATEWAY_PROVIDER'];
    delete process.env['PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'];
    delete process.env['PAYMENT_WEBHOOK_SECRET_REF'];
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';

    const report = evaluatePspPaymentProductionActivationPath();
    expect(report.sprint).toBe(132);
    expect(report.authoritative_source).toBe('PSP_PAYMENT_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE');
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.parallel_payment_framework_created).toBe(false);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.real_money_processed).toBe(false);
    expect(report.production_enabled).toBe(false);
    expect(report.production_payment).toBe('BLOCKED');
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.secrets_printed).toBe(false);
    expect(report.lifecycle === 'NOT_SELECTED' || report.lifecycle === 'EXTERNAL_GATED').toBe(true);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects mock provider as production selection', () => {
    process.env['PAYMENT_GATEWAY_PROVIDER'] = 'MOCK_PRIMARY';
    const provider = readConfiguredProductionPspProvider();
    expect(provider.selected).toBe(false);
    expect(provider.is_mock).toBe(true);
  });

  it('CONFIGURED when refs present but never auto VERIFIED/ENABLED', () => {
    process.env['PAYMENT_GATEWAY_PROVIDER'] = 'ACME_PSP';
    process.env['PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'] = 'vault:prod/psp/api';
    process.env['PAYMENT_WEBHOOK_SECRET_REF'] = 'vault:prod/psp/webhook';
    process.env['PAYMENT_WEBHOOK_ENDPOINT_REF'] = 'https://api.example.test/webhooks/payments';
    process.env['PAYMENT_MERCHANT_ACCOUNT_REF'] = 'merchant:ref-only';
    process.env['PAYMENT_PRODUCTION_COUNTRIES'] = 'AE,US';
    process.env['PAYMENT_PRODUCTION_CURRENCIES'] = 'AED,USD';
    process.env['PAYMENT_RECONCILIATION_CONFIG_REF'] = 'vault:prod/psp/recon';
    delete process.env['PAYMENT_PSP_VERIFICATION_STATUS'];
    delete process.env['PAYMENT_PSP_APPROVAL_STATUS'];
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    process.env['PAYMENT_ENVIRONMENT'] = 'production';

    const derived = deriveProductionPspLifecycle({ nonMockAdapterRegistered: false });
    expect(derived.configured).toBe(true);
    expect(derived.verified).toBe(false);
    expect(derived.approved).toBe(false);
    expect(derived.production_enabled).toBe(false);
    expect(derived.lifecycle).toBe('CONFIGURED');

    const report = evaluatePspPaymentProductionActivationPath();
    expect(report.configured).toBe(true);
    expect(report.verified).toBe(false);
    expect(report.production_enabled).toBe(false);
    expect(report.production_payment).toBe('BLOCKED');
  });

  it('live slots never leak secret values', () => {
    process.env['PAYMENT_GATEWAY_PRODUCTION_SECRET_REF'] = 'vault:prod/psp/api';
    const slots = buildLivePspConfigurationReferenceSlots();
    for (const slot of slots) {
      expect(slot.value_leaked).toBe(false);
      expect(JSON.stringify(slot)).not.toMatch(/sk_live_|whsec_/i);
    }
  });

  it('production initiation fail-closed without PSP', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    delete process.env['PAYMENT_GATEWAY_PROVIDER'];
    try {
      assertProductionPspInitiationAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_PSP_INITIATION_BLOCKED);
    }
  });

  it('production webhook gated; mock gateway rejected', () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    try {
      assertProductionPspWebhookIngestAllowed('STRIPE_LIKE', 'unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_WEBHOOK_EXTERNAL_GATED);
    }
    try {
      assertProductionPspWebhookIngestAllowed('MOCK_PRIMARY', 'unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(MOCK_PSP_BLOCKED_IN_PRODUCTION);
    }
  });

  it('forged client payment success rejected', () => {
    const forged = evaluateClientForgedPaymentSuccess({
      browser_success: true,
      client_paid_flag: true,
      client_transaction_id: 'txn_forged',
    });
    expect(forged.accepted).toBe(false);
  });

  it('illegal FAILED/CANCELLED → PAID transitions blocked', () => {
    const rows = evaluateIllegalPaymentTransitions();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.allowed).toBe(false);
      expect(canTransitionIntent(row.from, row.to)).toBe(false);
    }
    expect(canTransitionIntent(PaymentIntentStatus.FAILED, PaymentIntentStatus.CAPTURED)).toBe(
      false,
    );
    expect(canTransitionIntent(PaymentIntentStatus.CANCELLED, PaymentIntentStatus.CAPTURED)).toBe(
      false,
    );
  });

  it('webhook negative cases include signature / duplicate / wrong env', () => {
    const cases = evaluateProductionWebhookNegativeCases();
    const ids = cases.map((c) => c.case_id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'unsigned_webhook',
        'invalid_signature',
        'duplicate_event',
        'wrong_environment_production_without_adapter',
        'mock_gateway_in_production',
      ]),
    );
    expect(cases.some((c) => c.reason === NO_PRODUCTION_SECRETS_MANAGER_ADAPTER)).toBe(true);
  });

  it('S128 control composes S132 path without enabling PSP', () => {
    const control = evaluatePspPaymentProductionActivationControl();
    expect(control.s132_activation_path.sprint).toBe(132);
    expect(control.s132_activation_path.software_activation_path).toBe('COMPLETE');
    expect(control.s132_activation_path.production_enabled).toBe(false);
    expect(control.real_psp_production_enabled).toBe(false);
    expect(control.can_production_launch).toBe('NO');
    assertNoSecretLeak(JSON.stringify(control));
  });
});
