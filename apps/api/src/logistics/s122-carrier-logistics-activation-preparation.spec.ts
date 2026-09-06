/**
 * Sprint 122 — Real carrier + logistics activation preparation.
 */
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  CARRIER_PROVIDER_NOT_SELECTED,
  buildCarrierLogisticsConfigurationReferenceSlots,
  evaluateCarrierLogisticsFailClosedCases,
  evaluateCarrierLogisticsActivationPreparation,
} from './carrier-logistics-activation-preparation';
import { evaluateCarrierFirstOnboarding, buildShipmentLifecycleMachine, buildTrackingEventMachine } from './carrier-first-onboarding';
import { evaluateRealCarrierFirstOnboarding } from './carrier-real-activation-first-onboarding';
import { isMockCarrierCode } from './carrier.config';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S122 carrier logistics activation preparation', () => {
  it('carrier NOT_SELECTED / EXTERNAL_GATED / no invented carrier or shipment', () => {
    const report = evaluateCarrierLogisticsActivationPreparation();
    expect(report.sprint).toBe(122);
    expect(report.authoritative_source).toBe('carrier-logistics-activation-preparation');
    expect(report.parallel_carrier_abstraction_created).toBe(false);
    expect(report.parallel_shipment_state_machine_created).toBe(false);
    expect(report.parallel_tracking_system_created).toBe(false);
    expect(report.parallel_webhook_system_created).toBe(false);
    expect(report.parallel_idempotency_system_created).toBe(false);
    expect(report.parallel_provider_lifecycle_created).toBe(false);
    expect(report.fake_carrier_invented).toBe(false);
    expect(report.real_shipment_created).toBe(false);
    expect(report.real_tracking_number_generated).toBe(false);
    expect(report.real_delivery_completed).toBe(false);
    expect(report.carrier.lifecycle).toBe('NOT_SELECTED');
    expect(report.carrier.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.carrier.production).toBe('EXTERNAL_GATED');
    expect(report.carrier.enabled).toBe(false);
    expect(report.admin_summary.carrier).toBe('NOT_SELECTED');
    expect(report.admin_summary.production_credentials).toBe('MISSING');
    expect(report.admin_summary.webhook).toBe('NOT_CONFIGURED');
    expect(report.admin_summary.serviceability).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.verification).toBe('NOT_VERIFIED');
    expect(report.admin_summary.approval).toBe('NOT_APPROVED');
    expect(report.admin_summary.enablement).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.production_logistics).toBe('BLOCKED');
    expect(report.webhook_security.unsigned_rejected).toBe(true);
    expect(report.webhook_security.provider_specific_algorithm_invented).toBe(false);
    expect(report.idempotency.status).toBe('SOFTWARE_READY');
    expect(report.serviceability.hardcoded_india_global).toBe(false);
    expect(report.cross_border.medicine_import_legally_approved_claimed).toBe(false);
    expect(report.cross_border.legal_gates).toBe('LEGAL_GATED');
    expect(report.pod.native_rider).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.returns_rto.auto_arbitrary_financial_from_delivery).toBe('FORBIDDEN');
    expect(report.order_fulfillment_integrity.status).toBe('PASS');
    expect(report.sandbox_vs_production.production_mock_forbidden).toBe(true);
    expect(report.production_fail_closed.overall).toBe('PASS');
    expect(report.force_launch_available).toBe(false);
    expect(report.force_enable_carrier_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(report.secrets_printed).toBe(false);
    expect(report.configuration_references.every((s) => s.value_present === false)).toBe(true);
    expect(buildCarrierLogisticsConfigurationReferenceSlots().length).toBeGreaterThanOrEqual(15);
  });

  it('fail-closed cases block production shipping', () => {
    const cases = evaluateCarrierLogisticsFailClosedCases();
    expect(cases).toHaveLength(8);
    expect(cases.every((c) => c.production_shipping_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(CARRIER_PROVIDER_NOT_SELECTED);
    expect(isMockCarrierCode('MOCK')).toBe(true);
    const shipment = buildShipmentLifecycleMachine();
    const tracking = buildTrackingEventMachine();
    expect(shipment).toBeTruthy();
    expect(tracking).toBeTruthy();
  });
});

describe('S122 compose + regression', () => {
  it('composes S90/S105/S116 and does not bypass S87', () => {
    expect(evaluateCarrierFirstOnboarding().remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(evaluateRealCarrierFirstOnboarding().real_shipment_created).toBe(false);
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(JSON.stringify(evaluateCarrierLogisticsActivationPreparation())),
    ).toBe(true);
  });

  it('no India hardcoding / no secret leaks', () => {
    const blob = JSON.stringify(evaluateCarrierLogisticsActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
    expect(blob).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|apiSecret=/i);
    expect(blob).not.toMatch(/Provider:\s*DHL|tracking_number:\s*[A-Z0-9]{8,}/i);
  });
});
