/**
 * Sprint 90 — Production carrier / logistics activation readiness (no fake live carrier).
 */
import {
  CARRIER_CREDENTIAL_REFERENCE_MISSING,
  CARRIER_MARKET_CONFIGURATION_MISSING,
  CARRIER_PROVIDER_NOT_SELECTED,
  CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
  CARRIER_TRACKING_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_CONFIGURATION_MISSING,
  CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
  NO_PRODUCTION_CARRIER_ADAPTER,
  buildShipmentLifecycleMachine,
  buildTrackingEventMachine,
  evaluateCarrierEnablementGuard,
  evaluateCarrierFirstOnboarding,
  validateCarrierConfiguration,
} from './carrier-first-onboarding';
import { validateProductionCarrierConfiguration } from './production-carrier-requirements';

describe('S90 carrier activation contract', () => {
  it('reports Sprint 90 / NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateCarrierFirstOnboarding();
    expect(report.sprint).toBe(90);
    expect(report.foundation_sprint).toBe(77);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_CARRIER_ADAPTER,
        CARRIER_PROVIDER_NOT_SELECTED,
        CARRIER_CREDENTIAL_REFERENCE_MISSING,
        CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING,
        CARRIER_WEBHOOK_CONFIGURATION_MISSING,
        CARRIER_MARKET_CONFIGURATION_MISSING,
        CARRIER_SERVICEABILITY_CONFIGURATION_MISSING,
        CARRIER_TRACKING_CONFIGURATION_MISSING,
      ]),
    );
    expect(report.shipment_creation).toBe('SANDBOX_ONLY');
    expect(report.shipping_cost).toBe('SANDBOX_ONLY');
    expect(report.pod).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.returns).toBe('POLICY_REQUIRED');
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_gps_invented).toBe(false);
  });

  it('configuration readiness stays MISSING / EXTERNAL_GATED / DEVICE_NOT_AVAILABLE', () => {
    const v = validateProductionCarrierConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.configuration_readiness.provider).toBe('NOT_SELECTED');
    expect(v.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.pod_capability).toBe('DEVICE_NOT_AVAILABLE');
    expect(v.configuration_readiness.shipment_capability).toBe('SANDBOX_ONLY');
    expect(JSON.stringify(v)).not.toMatch(/sk_live|api_key|password|Bearer /i);

    const report = evaluateCarrierFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.country_policy.source_country_equals_customer_country).toBe(false);
  });
});

describe('S90 lifecycle + enablement + globalization', () => {
  it('shipment/tracking machines + validator never ENABLED', () => {
    const ship = buildShipmentLifecycleMachine();
    expect(ship.success_path).toContain('READY_TO_SHIP');
    expect(ship.idempotent_booking).toBe(true);
    const track = buildTrackingEventMachine();
    expect(track.duplicate_event_safe).toBe(true);
    expect(track.terminal_overwrite_forbidden).toBe(true);

    expect(
      validateCarrierConfiguration({
        providerSelected: true,
        nonMockAdapterRegistered: true,
        logisticsEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        credentialsPresent: true,
        accountIdentifierPresent: true,
        originPickupConfigured: true,
        serviceConfigured: true,
        countrySupportConfigured: true,
        webhookConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateCarrierEnablementGuard({
        nonMockAdapterRegistered: false,
        logisticsEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented carriers', () => {
    const blob = JSON.stringify(evaluateCarrierFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bDHL\b|\bFEDEX\b|\bUPS\b|\bDELHIVERY\b/i);
  });
});
