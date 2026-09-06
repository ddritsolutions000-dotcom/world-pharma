/**
 * Sprint 77 — Carrier / logistics final activation readiness (no fake live carrier).
 */
import {
  NO_PRODUCTION_CARRIER_ADAPTER,
  buildShipmentLifecycleMachine,
  buildTrackingEventMachine,
  evaluateCarrierEnablementGuard,
  evaluateCarrierFirstOnboarding,
  validateCarrierConfiguration,
} from './carrier-first-onboarding';
import {
  assertSandboxOnlyLogisticsRuntime,
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
} from './carrier.config';
import { evaluateProductionLogisticsAvailable } from './production-logistics-gate';
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S77 carrier availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_CARRIER_ADAPTER', () => {
    const report = evaluateCarrierFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(77);
    expect([67, 77]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_carrier_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.shipment_creation).toBe('SANDBOX_ONLY');
    expect(report.webhook).toBe('SANDBOX_ONLY');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(report.pod).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.fake_gps_invented).toBe(false);
    expect(report.fake_driver_invented).toBe(false);
    expect(report.fake_pod_invented).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
  });
});

describe('S77 shipment + tracking machines', () => {
  it('documents order→delivery and tracking paths without inventing DELIVERED', () => {
    const ship = buildShipmentLifecycleMachine();
    expect(ship.success_path).toContain('READY_TO_SHIP');
    expect(ship.success_path).toContain('SHIPMENT_CREATED');
    expect(ship.exception_states).toContain('UNDELIVERABLE');
    expect(ship.idempotent_booking).toBe(true);
    expect(ship.shipment_creation).toBe('SANDBOX_ONLY');

    const track = buildTrackingEventMachine();
    expect(track.success_path[0]).toBe('LABEL_CREATED');
    expect(track.duplicate_event_safe).toBe(true);
    expect(track.terminal_overwrite_forbidden).toBe(true);
  });
});

describe('S77 webhook + idempotency + notifications', () => {
  it('keeps unsigned fail-closed and sandbox-only notifications', () => {
    const report = evaluateCarrierFirstOnboarding();
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
    expect(report.webhook_security.production_gated_without_provider).toBe(true);
    expect(report.outbox_idempotency.duplicate_shipment_prevented).toBe(true);
    expect(report.notification_integration.real_sms_email_push).toBe('EXTERNAL_GATED');
    expect(report.notification_integration.sandbox_records_only).toBe(true);
    expect(report.carrier_coverage).toBe('CARRIER_COVERAGE_EXTERNAL_GATED');
    expect(report.cod).toBe('NOT_INVENTED');
    expect(report.returns).toBe('POLICY_REQUIRED');
  });
});

describe('S77 enablement guard', () => {
  it('never enables without non-mock adapter', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: false,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including coverage/legal defaults', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: true,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryCoverageConfigured: true,
      legalComplianceClear: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when country coverage missing', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: true,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryCoverageConfigured: false,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S77 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockAdapterRegistered: true,
    logisticsEnvironment: 'production' as const,
    liveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    accountIdentifierPresent: true,
    originPickupConfigured: true,
    serviceConfigured: true,
    countrySupportConfigured: true,
    webhookConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateCarrierConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('credentials alone never ENABLED', () => {
    expect(validateCarrierConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S77 sandbox/production fail-closed', () => {
  const prev = {
    env: process.env['LOGISTICS_ENVIRONMENT'],
    live: process.env['CARRIER_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('LOGISTICS_ENVIRONMENT', prev.env);
    restore('CARRIER_LIVE_ENABLED', prev.live);
  });

  it('production without live flag fail-closes', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'false';
    expect(readLogisticsEnvironment()).toBe('production');
    expect(isLiveCarrierEnabled()).toBe(false);
    expect(() => assertSandboxOnlyLogisticsRuntime('s77')).toThrow(ProblemException);
  });

  it('treats MOCK_* as mock; production gate never opens without live adapter', async () => {
    expect(isMockCarrierCode('MOCK_CARRIER')).toBe(true);
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'AE',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findFirst: async () => ({
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:carrier',
          externalGated: false,
          providerIdentifier: 'HYPOTHETICAL_LIVE',
        }),
      },
      serviceabilityZone: { count: async () => 1 },
      carrierCoverage: { count: async () => 1 },
    } as never;
    const result = await evaluateProductionLogisticsAvailable(prisma, { countryCode: 'AE' });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(result.never_fallback_to_mock).toBe(true);
  });
});

describe('S77 globalization + activation contract', () => {
  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluateCarrierFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });

  it('CARRIER contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('CARRIER'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.external_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
  });
});
