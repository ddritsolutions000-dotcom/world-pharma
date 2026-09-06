/**
 * Sprint 88 — Production PSP activation readiness (no inventing PSP / credentials / real money).
 */
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentGatewayRegistry } from './gateway.registry';
import {
  NO_PRODUCTION_PSP,
  describePspWebhookSecurity,
  evaluatePspEnablementGuard,
  evaluatePspFirstOnboarding,
  toPspActivationLifecycle,
  validatePspConfiguration,
} from './psp-first-onboarding';
import {
  PSP_CREDENTIAL_REFERENCE_MISSING,
  PSP_CURRENCY_CONFIGURATION_MISSING,
  PSP_MARKET_CONFIGURATION_MISSING,
  PSP_PROVIDER_NOT_SELECTED,
  PSP_RECONCILIATION_CONFIGURATION_MISSING,
  PSP_WEBHOOK_CONFIGURATION_MISSING,
  PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
  validateProductionPspConfiguration,
} from './production-psp-requirements';

describe('S88 PSP activation contract', () => {
  it('reports Sprint 88 / NOT_SELECTED / EXTERNAL_GATED with NO_PRODUCTION_PSP', () => {
    const registry = new PaymentGatewayRegistry(new MockPaymentGatewayAdapter());
    const report = evaluatePspFirstOnboarding(registry);
    expect(report.sprint).toBe(88);
    expect(report.foundation_sprint).toBe(85);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.activation_stage).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.production_payment).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PSP);
    expect(report.remaining_blockers).toContain(NO_PRODUCTION_PSP);
    expect(report.remaining_blockers).toContain(PSP_PROVIDER_NOT_SELECTED);
    expect(report.fake_psp_invented).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.sandbox_cannot_silently_become_production).toBe(true);
  });

  it('exposes canonical lifecycle states without inventing ENABLED', () => {
    expect(toPspActivationLifecycle('NOT_SELECTED', { realPsp: false, productionStatus: 'EXTERNAL_GATED' })).toBe(
      'EXTERNAL_GATED',
    );
    expect(toPspActivationLifecycle('APPROVED', { realPsp: true, productionStatus: 'READY_FOR_ENABLEMENT' })).toBe(
      'APPROVED',
    );
    expect(toPspActivationLifecycle('ENABLED', { realPsp: true, productionStatus: 'ENABLED' })).toBe('ENABLED');
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

describe('S88 production configuration validation', () => {
  it('emits explicit blockers without exposing secrets', () => {
    const v = validateProductionPspConfiguration({
      providerSelected: false,
      providerName: 'NOT_SELECTED',
      nonMockAdapterRegistered: false,
    });
    expect(v.provider_selected).toBe(false);
    expect(v.provider_name).toBe('NOT_SELECTED');
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.blockers).toEqual(
      expect.arrayContaining([
        PSP_PROVIDER_NOT_SELECTED,
        PSP_CREDENTIAL_REFERENCE_MISSING,
        PSP_WEBHOOK_SECRET_REFERENCE_MISSING,
        PSP_WEBHOOK_CONFIGURATION_MISSING,
        PSP_MARKET_CONFIGURATION_MISSING,
        PSP_CURRENCY_CONFIGURATION_MISSING,
        PSP_RECONCILIATION_CONFIGURATION_MISSING,
      ]),
    );
    expect(v.credential_reference.reference_present).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/sk_live|whsec_|api_key|password/i);
  });

  it('Admin readiness badges stay MISSING / EXTERNAL_GATED without real PSP', () => {
    const report = evaluatePspFirstOnboarding(null);
    expect(report.configuration_readiness.provider).toBe('NOT_SELECTED');
    expect(report.configuration_readiness.configuration).toBe('MISSING');
    expect(report.configuration_readiness.webhook).toBe('MISSING');
    expect(report.configuration_readiness.markets).toBe('MISSING');
    expect(report.configuration_readiness.currencies).toBe('MISSING');
    expect(report.configuration_readiness.reconciliation).toBe('MISSING');
    expect(report.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(report.configuration_validation.secrets_exposed).toBe(false);
  });
});

describe('S88 webhook + enablement + globalization', () => {
  it('webhook security remains fail-closed for production', () => {
    const wh = describePspWebhookSecurity(false);
    expect(wh.unsigned_rejected).toBe(true);
    expect(wh.invalid_signature_rejected).toBe(true);
    expect(wh.duplicate_idempotent).toBe(true);
    expect(wh.production_status).toBe('EXTERNAL_GATED');
    expect(wh.secrets_logged).toBe(false);
  });

  it('enablement guard never flips without provider', () => {
    expect(
      evaluatePspEnablementGuard({
        providerSelected: false,
        nonMockAdapterRegistered: false,
        paymentEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        r14aComplete: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded IN/INR/UPI/+91/IST or invented PSP brands', () => {
    const blob = JSON.stringify(evaluatePspFirstOnboarding(null));
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bSTRIPE\b|\bRAZORPAY\b|\bADYEN\b/i);
  });
});
