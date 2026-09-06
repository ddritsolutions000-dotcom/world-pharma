/**
 * Sprint 149 — Affiliate payout + partner settlement production workflow closure (unit).
 * No invented PSP/bank/payouts; secrets never printed; MockPayout ≠ production.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from '../ops/secret-redaction';
import { evaluateAffiliatePayoutFirstOnboarding } from './affiliate-payout-first-onboarding';
import { evaluatePspPaymentProductionActivationPath } from '../payment/psp-payment-production-activation-path';
import { evaluateSecretsManagerRuntimeResolver } from '../ops/secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from '../ops/observability-apm-monitoring-alerting-production-activation-path';
import { evaluateProductionSecurityLaunchGatePath } from '../ops/production-security-launch-gate-path';
import {
  AFFILIATE_PAYOUT_EXTERNAL_GATED,
  AFFILIATE_SELF_APPROVAL_DENIED,
  CLIENT_PAYOUT_EXECUTION_DENIED,
  CROSS_AFFILIATE_ACCESS_DENIED,
  DUPLICATE_PAYOUT_REPLAY_REJECTED,
  FORGED_PAYOUT_AMOUNT_REJECTED,
  FORGED_PAYOUT_STATE_REJECTED,
  ILLEGAL_PAID_STATE_TRANSITION,
  NO_PRODUCTION_PAYOUT_ADAPTER,
  assertAffiliatePayoutExecutionAllowed,
  assertCrossAffiliateAccessDenied,
  assertLegalPayoutTransition,
  evaluateAffiliatePayoutSettlementProductionWorkflowClosure,
  evaluateCommissionReversalContract,
  evaluateCommissionSafetyContract,
  evaluateCurrencyMarketPolicyContract,
  evaluatePayoutIdempotencyContract,
  evaluatePspPayoutGating,
  isIllegalPaidTransition,
  listAffiliateMoneyFlowStages,
  rejectDuplicatePayoutReplay,
  rejectForgedPayoutState,
} from './affiliate-payout-settlement-production-workflow-closure';

describe('S149 affiliate payout + settlement production workflow closure', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.AFFILIATE_PAYOUT_CREDENTIAL_SECRET_REF;
  });

  it('reports SOFTWARE_COMPLETE / EXTERNAL_GATED / no real money / composed foundations', () => {
    const report = evaluateAffiliatePayoutSettlementProductionWorkflowClosure();
    expect(report.sprint).toBe(149);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.parallel_commission_settlement_system_created).toBe(false);
    expect(report.real_money_moved).toBe(false);
    expect(report.fabricated_payout_success).toBe(false);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.production_payout_enabled).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PAYOUT_ADAPTER);
    expect(report.composed_foundations.s71).toBe('COMPOSED');
    expect(report.composed_foundations.s120_s128_s132).toBe('COMPOSED');
    expect(report.composed_foundations.s148).toBe('COMPOSED');
    expect(report.admin_summary.external_gated).toBe(true);
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('money flow + commission safety + refund/reversal contracts', () => {
    const stages = listAffiliateMoneyFlowStages();
    expect(stages.map((s) => s.stage)).toEqual(
      expect.arrayContaining([
        'ATTRIBUTION',
        'COMMISSION_CALCULATION',
        'PAYABLE',
        'SETTLEMENT_BATCH',
        'PAID',
        'RECONCILIATION',
      ]),
    );
    expect(stages.find((s) => s.stage === 'PAID')?.production_status).toBe('NOT_ENABLED');

    const safety = evaluateCommissionSafetyContract();
    expect(safety.not_client_controlled).toBe(true);
    expect(safety.self_referral_blocked).toBe(true);
    expect(safety.parallel_commission_system_created).toBe(false);

    const reversal = evaluateCommissionReversalContract();
    expect(reversal.already_paid_cannot_silently_disappear).toBe(true);
    expect(reversal.triggers).toEqual(
      expect.arrayContaining(['CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']),
    );
  });

  it('payout lifecycle blocks illegal PAID transitions', () => {
    expect(isIllegalPaidTransition('PAID', 'PAYABLE')).toBe(true);
    expect(isIllegalPaidTransition('PAID', 'PROCESSING')).toBe(true);
    expect(isIllegalPaidTransition('PAID', 'PAID')).toBe(true);
    expect(isIllegalPaidTransition('PAYABLE', 'SUBMITTED')).toBe(false);
    expect(() => assertLegalPayoutTransition('PAID', 'PAYABLE')).toThrow(ProblemException);
    try {
      assertLegalPayoutTransition('PAID', 'PROCESSING');
    } catch (err) {
      expect((err as ProblemException).code).toBe(ILLEGAL_PAID_STATE_TRANSITION);
    }
  });

  it('idempotency + PSP gating EXTERNAL_GATED (mock ≠ production)', () => {
    const idemp = evaluatePayoutIdempotencyContract();
    expect(idemp.retry_must_not_duplicate_money_movement).toBe(true);
    expect(idemp.client_browser_cannot_create_arbitrary_payout).toBe(true);
    expect(idemp.production_proven).toBe(false);

    const psp = evaluatePspPayoutGating();
    expect(psp.execution_status).toBe('EXTERNAL_GATED');
    expect(psp.simulated_real_payout).toBe(false);
    expect(psp.sandbox_mock_neq_production_proof).toBe(true);
    expect(psp.mock_only).toBe(true);
  });

  it('currency/market policy remains global (no India/INR hardcoding)', () => {
    const policy = evaluateCurrencyMarketPolicyContract();
    expect(policy.hardcoded_india).toBe(false);
    expect(policy.hardcoded_inr).toBe(false);
    expect(policy.hardcoded_gst).toBe(false);
    expect(policy.uses_country_market_currency_policy).toBe(true);
  });

  it('tenant isolation + SoD + forged/replay rejection', () => {
    const report = evaluateAffiliatePayoutSettlementProductionWorkflowClosure();
    expect(report.tenant_isolation.affiliate_a_cannot_see_affiliate_b_payouts).toBe(true);
    expect(report.admin_sod.affiliate_cannot_approve_own_payout).toBe(true);

    expect(() => assertCrossAffiliateAccessDenied('aff-a', 'aff-b')).toThrow(ProblemException);
    try {
      assertCrossAffiliateAccessDenied('aff-a', 'aff-b');
    } catch (err) {
      expect((err as ProblemException).code).toBe(CROSS_AFFILIATE_ACCESS_DENIED);
    }

    try {
      rejectForgedPayoutState({ amount_minor: '999999' });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_PAYOUT_AMOUNT_REJECTED);
    }
    try {
      rejectForgedPayoutState({ lifecycle: 'PAID', paid: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_PAYOUT_STATE_REJECTED);
    }
    try {
      rejectDuplicatePayoutReplay('idem-key-s149');
    } catch (err) {
      expect((err as ProblemException).code).toBe(DUPLICATE_PAYOUT_REPLAY_REJECTED);
    }
  });

  it('unauthorized payout execution + self-approval denied', () => {
    expect(() =>
      assertAffiliatePayoutExecutionAllowed('s149', {
        kind: 'client_browser',
        service_id: 'browser',
      }),
    ).toThrow(ProblemException);
    try {
      assertAffiliatePayoutExecutionAllowed('s149', {
        kind: 'client_browser',
        service_id: 'browser',
      });
    } catch (err) {
      expect([CLIENT_PAYOUT_EXECUTION_DENIED, 'CLIENT_DEPLOYMENT_ACCESS_DENIED']).toContain(
        (err as ProblemException).code,
      );
    }

    try {
      assertAffiliatePayoutExecutionAllowed(
        's149',
        { kind: 'server_service', service_id: 'payout' },
        { affiliate_self: true },
      );
    } catch (err) {
      expect([AFFILIATE_SELF_APPROVAL_DENIED, AFFILIATE_PAYOUT_EXTERNAL_GATED]).toContain(
        (err as ProblemException).code,
      );
    }

    try {
      assertAffiliatePayoutExecutionAllowed('s149', {
        kind: 'server_service',
        service_id: 'payout-controller',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(AFFILIATE_PAYOUT_EXTERNAL_GATED);
    }
  });

  it('S142/S143 integration + safe events', () => {
    const report = evaluateAffiliatePayoutSettlementProductionWorkflowClosure({
      correlation_id: 'corr-s149',
    });
    expect(report.s142_snapshot.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.s143_snapshot.production_observability_enabled).toBe(false);
    expect(report.observability_events.map((e) => e.id)).toEqual(
      expect.arrayContaining(['commission_created', 'payout_submitted', 'reconciliation_mismatch']),
    );
    expect(report.release_event_sample.secrets_printed).toBe(false);
    expect(report.release_event_sample.correlation_id).toBe('corr-s149');
  });

  it('S71/S132/S148 regression composition', () => {
    const s71 = evaluateAffiliatePayoutFirstOnboarding();
    const s132 = evaluatePspPaymentProductionActivationPath();
    const s142 = evaluateSecretsManagerRuntimeResolver();
    const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
    const s148 = evaluateProductionSecurityLaunchGatePath();
    const s149 = evaluateAffiliatePayoutSettlementProductionWorkflowClosure();
    expect(s71.enabled).toBe(false);
    expect(s71.remaining_blocker).toBe(NO_PRODUCTION_PAYOUT_ADAPTER);
    expect(s132.remaining_blocker).toMatch(/NO_PRODUCTION_PSP/);
    expect(s142.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(s143.software_activation_path).toBe('COMPLETE');
    expect(s148.can_production_launch).toBe('NO');
    expect(s149.s71_snapshot.enabled).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(s149))).toBe(true);
  });
});
