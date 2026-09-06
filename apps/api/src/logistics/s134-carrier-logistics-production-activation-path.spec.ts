/**
 * Sprint 134 — Real carrier + logistics production activation path (unit).
 */
import { ProblemException } from '../common/problem';
import {
  assertProductionCarrierShipmentInitiationAllowed,
  assertProductionCarrierWebhookIngestAllowed,
  buildLiveCarrierConfigurationSlots,
  deriveProductionCarrierLifecycle,
  evaluateCarrierLogisticsProductionActivationPath,
  evaluateCarrierSafetyInvariants,
  evaluateCarrierWebhookNegativeCases,
  evaluateIllegalShipmentTransitions,
  MOCK_CARRIER_BLOCKED_IN_PRODUCTION,
  PRODUCTION_CARRIER_SHIPMENT_INITIATION_BLOCKED,
  PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED,
  readConfiguredProductionCarrierProvider,
} from './carrier-logistics-production-activation-path';
import { NO_PRODUCTION_CARRIER_ADAPTER } from './carrier-first-onboarding';
import { evaluateCarrierLogisticsActivationPreparation } from './carrier-logistics-activation-preparation';
import { canTransitionShipment } from './state';
import { ShipmentStatus } from '@prisma/client';

function assertNoSecretLeak(blob: string): void {
  expect(blob).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY|apiSecret=/i);
  expect(blob).not.toMatch(/tracking_number:\s*[A-Z0-9]{8,}/i);
}

describe('S134 carrier logistics production activation path', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  });

  it('software path complete; production remains BLOCKED', () => {
    delete process.env['CARRIER_PROVIDER'];
    process.env['LOGISTICS_ENVIRONMENT'] = 'sandbox';
    process.env['CARRIER_LIVE_ENABLED'] = 'false';

    const report = evaluateCarrierLogisticsProductionActivationPath();
    expect(report.sprint).toBe(134);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.parallel_carrier_system_created).toBe(false);
    expect(report.fake_carrier_invented).toBe(false);
    expect(report.real_shipment_created).toBe(false);
    expect(report.real_tracking_number_generated).toBe(false);
    expect(report.production_shipment_creation_enabled).toBe(false);
    expect(report.production_logistics).toBe('BLOCKED');
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_CARRIER_ADAPTER);
    expect(report.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.cross_border.medicine_import_legally_approved_claimed).toBe(false);
    expect(report.vendor_handoff.payment_gate_preserved).toBe(true);
    expect(report.vendor_handoff.rx_gate_preserved).toBe(true);
    expect(report.serviceability.hardcoded_india_global).toBe(false);
    assertNoSecretLeak(JSON.stringify(report));
  });

  it('rejects MOCK as production carrier selection', () => {
    process.env['CARRIER_PROVIDER'] = 'MOCK';
    const sel = readConfiguredProductionCarrierProvider();
    expect(sel.selected).toBe(false);
    expect(sel.mock_rejected).toBe(true);
  });

  it('CONFIGURED when refs present but never auto ENABLED', () => {
    process.env['CARRIER_PROVIDER'] = 'ACME_CARRIER';
    process.env['CARRIER_PRODUCTION_SECRET_REF'] = 'vault:prod/carrier';
    process.env['CARRIER_ACCOUNT_REF'] = 'acct:ref';
    process.env['CARRIER_WEBHOOK_ENDPOINT_REF'] = 'https://hooks.example/carrier';
    process.env['CARRIER_WEBHOOK_SECRET_REF'] = 'vault:prod/carrier-wh';
    delete process.env['CARRIER_VERIFICATION_STATUS'];
    delete process.env['CARRIER_APPROVAL_STATUS'];

    const life = deriveProductionCarrierLifecycle();
    expect(life.configured).toBe(true);
    expect(life.verified).toBe(false);
    expect(life.enabled).toBe(false);
    expect(life.activation_stage).toBe('CONFIGURED');
  });

  it('live slots never leak secrets or fake tracking', () => {
    process.env['CARRIER_PRODUCTION_SECRET_REF'] = 'vault:prod/carrier';
    const slots = buildLiveCarrierConfigurationSlots();
    for (const slot of slots) {
      expect(slot.value_leaked).toBe(false);
    }
    assertNoSecretLeak(JSON.stringify(slots));
  });

  it('production shipment initiation fail-closed', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    delete process.env['CARRIER_PROVIDER'];
    try {
      assertProductionCarrierShipmentInitiationAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_CARRIER_SHIPMENT_INITIATION_BLOCKED);
    }
  });

  it('mock carrier blocked in production initiation', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_PROVIDER'] = 'MOCK';
    try {
      assertProductionCarrierShipmentInitiationAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(MOCK_CARRIER_BLOCKED_IN_PRODUCTION);
    }
  });

  it('production webhooks EXTERNAL_GATED', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    try {
      assertProductionCarrierWebhookIngestAllowed('unit');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).code).toBe(PRODUCTION_CARRIER_WEBHOOK_EXTERNAL_GATED);
    }
  });

  it('illegal shipment transitions remain blocked', () => {
    expect(canTransitionShipment(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT)).toBe(false);
    expect(canTransitionShipment(ShipmentStatus.CANCELLED, ShipmentStatus.DELIVERED)).toBe(false);
    expect(canTransitionShipment(ShipmentStatus.RETURNED, ShipmentStatus.DELIVERED)).toBe(false);
    const illegal = evaluateIllegalShipmentTransitions();
    expect(illegal.length).toBeGreaterThanOrEqual(4);
    expect(illegal.every((c) => c.allowed === false)).toBe(true);
  });

  it('webhook + safety catalogs cover required cases', () => {
    const webhooks = evaluateCarrierWebhookNegativeCases();
    expect(webhooks.map((c) => c.case_id)).toEqual(
      expect.arrayContaining([
        'unsigned_webhook',
        'duplicate_webhook',
        'replayed_webhook',
        'client_forged_delivery',
      ]),
    );
    const safety = evaluateCarrierSafetyInvariants();
    expect(safety.map((c) => c.case_id)).toEqual(
      expect.arrayContaining([
        'production_mock_blocked',
        'vendor_logistics_handoff',
        'cross_border_legal_gate',
        'pod_authorization',
      ]),
    );
  });

  it('S122 preparation composes S134 path without enabling live carrier', () => {
    const prep = evaluateCarrierLogisticsActivationPreparation();
    expect(prep.s134_activation_path.sprint).toBe(134);
    expect(prep.s134_activation_path.software_activation_path).toBe('COMPLETE');
    expect(prep.s134_activation_path.production_logistics).toBe('BLOCKED');
    expect(prep.s134_activation_path.production_shipment_creation_enabled).toBe(false);
    expect(prep.real_shipment_created).toBe(false);
    expect(prep.can_production_launch).toBe('NO');
    assertNoSecretLeak(JSON.stringify(prep));
  });
});
