/**
 * Sprint 128 — PSP payment production activation control.
 */
import {
  NO_PRODUCTION_PSP,
  PSP_PROVIDER_NOT_SELECTED,
  SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION,
  buildPspProductionActivationGates,
  evaluatePspCustomerMoneySafetyCases,
  evaluatePspWebhookNegativeCases,
  assertPspLifecycleSeparation,
  evaluatePspPaymentProductionActivationControl,
} from './psp-payment-production-activation-control';
import { evaluatePspPaymentActivationPreparation } from './psp-payment-activation-preparation';
import { isMockGatewayCode } from './payment.config';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S128 PSP payment production activation control', () => {
  it('NOT_SELECTED / BLOCKED / lifecycle separation / no invented PSP', () => {
    const report = evaluatePspPaymentProductionActivationControl();
    expect(report.sprint).toBe(128);
    expect(report.authoritative_source).toBe('psp-payment-production-activation-control');
    expect(report.parallel_payment_framework_created).toBe(false);
    expect(report.parallel_psp_lifecycle_created).toBe(false);
    expect(report.parallel_webhook_system_created).toBe(false);
    expect(report.parallel_settlement_framework_created).toBe(false);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.real_money_processed).toBe(false);
    expect(report.real_psp_production_enabled).toBe(false);
    expect(report.provider_configured_equals_verified).toBe(false);
    expect(report.provider_verified_equals_approved).toBe(false);
    expect(report.provider_approved_equals_production_enabled).toBe(false);
    expect(report.psp.lifecycle).toBe('NOT_SELECTED');
    expect(report.psp.configured).toBe(false);
    expect(report.psp.verified).toBe(false);
    expect(report.psp.approved).toBe(false);
    expect(report.psp.production_enabled).toBe(false);
    expect(report.psp.production_payment).toBe('BLOCKED');
    expect(report.psp.sandbox_payment).toBe('SANDBOX_VERIFIED');
    expect(report.admin_summary.final_activation_state).toBe('BLOCKED');
    expect(report.admin_summary.production_payment).toBe('BLOCKED');
    expect(report.admin_summary.credentials).toBe('MISSING');
    expect(report.admin_summary.webhook).toBe('NOT_CONFIGURED');
    expect(report.fulfillment_gate.unpaid_neq_paid).toBe(true);
    expect(report.fulfillment_gate.failed_cannot_become_paid).toBe(true);
    expect(report.fulfillment_gate.status).toBe('PASS');
    expect(report.money_safety_status).toBe('PASS');
    expect(report.tenant_authorization.status).toBe('PASS');
    expect(report.webhook_security.unsigned_rejected).toBe(true);
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.sandbox_vs_production.sandbox_cannot_satisfy_production).toBe(true);
    expect(report.production_fail_closed.overall).toBe('PASS');
    expect(report.force_launch_available).toBe(false);
    expect(report.force_enable_psp_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        PSP_PROVIDER_NOT_SELECTED,
        SANDBOX_CREDENTIAL_CANNOT_SATISFY_PRODUCTION,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.configuration_references.every((s) => s.value_present === false)).toBe(true);
    expect(buildPspProductionActivationGates().length).toBeGreaterThanOrEqual(12);
  });

  it('money safety + webhook negatives + lifecycle separation', () => {
    const money = evaluatePspCustomerMoneySafetyCases();
    expect(money.length).toBeGreaterThanOrEqual(10);
    expect(money.every((c) => c.outcome === 'DENIED' || c.outcome === 'IDEMPOTENT' || c.outcome === 'BLOCKED')).toBe(
      true,
    );
    const wh = evaluatePspWebhookNegativeCases();
    expect(wh.every((c) => c.outcome === 'DENIED' || c.outcome === 'IGNORED_IDEMPOTENT')).toBe(true);
    const life = assertPspLifecycleSeparation();
    expect(life.configured_neq_verified).toBe(true);
    expect(life.verified_neq_approved).toBe(true);
    expect(life.approved_neq_enabled).toBe(true);
    expect(life.not_selected_cannot_enable).toBe(true);
    expect(isMockGatewayCode('MOCK_CARD')).toBe(true);
  });
});

describe('S128 compose + regression', () => {
  it('composes S120/S116 and does not bypass launch control', () => {
    expect(evaluatePspPaymentActivationPreparation().admin_summary.production_payment).toBe(
      'BLOCKED',
    );
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'MEDICINE_COMMERCE' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(JSON.stringify(evaluatePspPaymentProductionActivationControl())),
    ).toBe(true);
  });

  it('no India hardcoding / no invented PSP brands or secrets', () => {
    const blob = JSON.stringify(evaluatePspPaymentProductionActivationControl());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b|\bGST\b|\bPAN\b/);
    expect(blob).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/"provider":\s*"STRIPE"|"provider":\s*"RAZORPAY"/i);
  });
});
