/**
 * Sprint 85 — Production payment / PSP activation readiness (no fake PSP / real money).
 */
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';
import {
  NO_PRODUCTION_PSP,
  describePspOrderPaymentConsistency,
  describePspPaymentStateMachine,
  describePspWebhookSecurity,
  evaluatePspEnablementGuard,
  evaluatePspFirstOnboarding,
  listPspPaymentIntentStatuses,
  listPspRefundStatuses,
  validatePspConfiguration,
} from './psp-first-onboarding';
import {
  assertSandboxGatewayCode,
  isMockGatewayCode,
} from './payment.config';
import { ProblemException } from '../common/problem';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S85 PSP availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED with NO_PRODUCTION_PSP', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    const report = evaluatePspFirstOnboarding(registry);
    expect(report.sprint).toBeGreaterThanOrEqual(85);
    expect([65, 85]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_psp_available).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.production_payment).toBe('EXTERNAL_GATED');
    expect(report.sandbox_payment).toMatch(/SANDBOX_/);
    expect(report.sandbox_status).toMatch(/SANDBOX_/);
    expect(report.enabled).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.activation_stage).toBe('NOT_SELECTED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.remaining_blockers).toContain(NO_PRODUCTION_PSP);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.fake_merchant_credentials).toBe(false);
    expect(report.fake_real_money_transaction).toBe(false);
    expect(report.sandbox_cannot_silently_become_production).toBe(true);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.settlement_payout).toBe('EXTERNAL_PAYOUT_GATED');
    expect(report.country_support).toBe('POLICY_DRIVEN');
    expect(report.currency_support).toBe('POLICY_DRIVEN');
  });
});

describe('S85 payment state machine + webhook + consistency', () => {
  it('documents intent/refund states and forbidden false paid path', () => {
    const sm = describePspPaymentStateMachine();
    expect(listPspPaymentIntentStatuses()).toContain('CAPTURED');
    expect(listPspPaymentIntentStatuses()).toContain('FAILED');
    expect(listPspRefundStatuses()).toContain('REFUNDED');
    expect(sm.forbidden).toContain('PAYMENT_FAILED→ORDER_PAID_WITHOUT_VERIFIED_RESULT');
    expect(sm.rules).toContain('failed_payment_does_not_create_paid_order');

    const wh = describePspWebhookSecurity(false);
    expect(wh.unsigned_rejected).toBe(true);
    expect(wh.production_status).toBe('EXTERNAL_GATED');
    expect(wh.secrets_logged).toBe(false);

    const cons = describePspOrderPaymentConsistency();
    expect(cons.payment_success_not_equal_vendor_payout).toBe(true);
    expect(cons.failed_payment_does_not_unlock_fulfillment).toBe(true);
  });

  it('report embeds software-ready rails without inventing live PSP', () => {
    const report = evaluatePspFirstOnboarding(null);
    expect(report.idempotency).toBe('SOFTWARE_READY');
    expect(report.webhook_security.duplicate_idempotent).toBe(true);
    expect(report.reconciliation).toMatch(/SANDBOX_|EXTERNAL_/);
    expect(report.refund).toMatch(/SANDBOX_|EXTERNAL_/);
    expect(JSON.stringify(report)).not.toMatch(/\bSTRIPE\b|\bRAZORPAY\b|\bADYEN\b/i);
  });
});

describe('S85 enablement guard + validator', () => {
  it('never enables without PSP', () => {
    const guard = evaluatePspEnablementGuard({
      providerSelected: false,
      nonMockAdapterRegistered: false,
      paymentEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      r14aComplete: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist', () => {
    const guard = evaluatePspEnablementGuard({
      providerSelected: true,
      nonMockAdapterRegistered: true,
      paymentEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      r14aComplete: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('validator: NOT_SELECTED without provider; credentials ≠ ENABLED', () => {
    expect(
      validatePspConfiguration({
        providerSelected: false,
        nonMockAdapterRegistered: true,
        paymentEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        r14aComplete: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }),
    ).toBe('NOT_SELECTED');

    expect(
      validatePspConfiguration({
        providerSelected: true,
        nonMockAdapterRegistered: true,
        paymentEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        r14aComplete: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }),
    ).toBe('APPROVED'); // never ENABLED from validator alone
  });
});

describe('S85 fail-closed production mock ban', () => {
  it('mock gateway codes rejected for production rows', () => {
    expect(isMockGatewayCode('MOCK_PRIMARY')).toBe(true);
    expect(() => assertSandboxGatewayCode('MOCK_PRIMARY', 'production')).toThrow(ProblemException);
  });
});

describe('S85 globalization + S64 contract', () => {
  it('no hardcoded UPI/INR/₹/+91/IST in onboarding payload', () => {
    const blob = JSON.stringify(evaluatePspFirstOnboarding(null));
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });

  it('PAYMENTS_PSP activation contract remains NOT_SELECTED without provider', () => {
    const activation = evaluateProviderActivation(getProviderActivationContract('PAYMENTS_PSP'));
    expect(['NOT_SELECTED', 'EXTERNAL_GATED', 'NOT_CONFIGURED', 'DISABLED']).toContain(
      activation.stage,
    );
  });
});
