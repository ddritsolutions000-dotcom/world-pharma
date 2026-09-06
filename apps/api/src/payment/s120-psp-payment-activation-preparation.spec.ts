/**
 * Sprint 120 — PSP payment activation preparation contract.
 */
import {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  buildPspConfigurationReferenceSlots,
  evaluatePspProductionFailClosedCases,
  evaluatePspPaymentActivationPreparation,
} from './psp-payment-activation-preparation';
import { describePspPaymentStateMachine, describePspWebhookSecurity } from './psp-first-onboarding';
import { evaluateRealPspFirstOnboarding } from './psp-real-activation-first-onboarding';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';
import { isMockGatewayCode } from './payment.config';

describe('S120 PSP payment activation preparation', () => {
  it('lifecycle NOT_SELECTED / production BLOCKED / no invented PSP', () => {
    const report = evaluatePspPaymentActivationPreparation();
    expect(report.sprint).toBe(120);
    expect(report.authoritative_source).toBe('psp-payment-activation-preparation');
    expect(report.parallel_payment_framework_created).toBe(false);
    expect(report.parallel_psp_lifecycle_created).toBe(false);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.real_money_processed).toBe(false);
    expect(report.psp.lifecycle).toBe('NOT_SELECTED');
    expect(report.psp.provider).toBe('NOT_SELECTED');
    expect(report.psp.production_credentials).toBe('MISSING');
    expect(report.psp.webhook).toBe('NOT_CONFIGURED');
    expect(report.psp.verification).toBe('NOT_VERIFIED');
    expect(report.psp.approval).toBe('NOT_APPROVED');
    expect(report.psp.enablement).toBe('EXTERNAL_GATED');
    expect(report.psp.production_payment).toBe('BLOCKED');
    expect(report.psp.sandbox_payment).toBe('SANDBOX_VERIFIED');
    expect(report.psp.enabled).toBe(false);
    expect(report.checkout_fail_closed.overall).toBe('PASS');
    expect(report.checkout_fail_closed.production_initiation_when_not_selected).toBe('BLOCKED');
    expect(report.webhook_security.unsigned_rejected).toBe(true);
    expect(report.payment_state_machine.forbidden).toContain(
      'PAYMENT_FAILED→ORDER_PAID_WITHOUT_VERIFIED_RESULT',
    );
    expect(report.order_payment_integrity.unpaid_blocks_paid_fulfillment).toBe(true);
    expect(report.currency_market.hardcoded_inr_global).toBe(false);
    expect(report.sandbox_vs_production.production_mock_forbidden).toBe(true);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_enable_psp_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.configuration_references.every((s) => s.value_present === false)).toBe(true);
    expect(buildPspConfigurationReferenceSlots().length).toBeGreaterThanOrEqual(10);
  });

  it('fail-closed cases block production payment; mock codes detected', () => {
    const cases = evaluatePspProductionFailClosedCases();
    expect(cases).toHaveLength(7);
    expect(cases.every((c) => c.production_payment_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(PSP_PROVIDER_NOT_SELECTED);
    expect(isMockGatewayCode('MOCK_CARD')).toBe(true);
    expect(isMockGatewayCode('STRIPE')).toBe(false);
  });

  it('reuses S88 state machine + webhook contracts', () => {
    const sm = describePspPaymentStateMachine();
    expect(sm.rules).toEqual(
      expect.arrayContaining([
        'failed_payment_does_not_create_paid_order',
        'duplicate_confirmation_idempotent',
      ]),
    );
    const wh = describePspWebhookSecurity(false);
    expect(wh.invalid_signature_rejected).toBe(true);
    expect(wh.production_status).toBe('EXTERNAL_GATED');
  });
});

describe('S120 compose + regression', () => {
  it('composes S102/S116 and does not bypass S87', () => {
    expect(evaluateRealPspFirstOnboarding().production_psp_enabled).toBe(false);
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluatePspPaymentActivationPreparation()))).toBe(
      true,
    );
  });

  it('no India hardcoding / no invented PSP brands or secrets', () => {
    const blob = JSON.stringify(evaluatePspPaymentActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/"provider":\s*"STRIPE"|"provider":\s*"RAZORPAY"/i);
  });
});
