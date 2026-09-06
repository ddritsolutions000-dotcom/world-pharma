/**
 * Sprint 123 — Vendor fulfillment real-use closure (unit).
 */
import {
  S122_VENDOR_PROBE_WRONG_PATH,
  VENDOR_ORDERS_AUTHORITATIVE_PATH,
  S123_VENDOR_FULFILLMENT_ROOT_CAUSE,
  assertVendorFulfillmentStateIntegrity,
  evaluateVendorFulfillmentRealUseClosure,
} from './vendor-fulfillment-real-use-closure';
import { canTransitionOrder } from './state-machine';
import { OrderStatus } from '@prisma/client';
import { evaluateCarrierLogisticsActivationPreparation } from '../logistics/carrier-logistics-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S123 vendor fulfillment real-use closure', () => {
  it('documents S122 vendor_ok=false root cause as wrong probe path (not app defect)', () => {
    const report = evaluateVendorFulfillmentRealUseClosure();
    expect(report.sprint).toBe(123);
    expect(report.s122_vendor_probe.vendor_ok).toBe(false);
    expect(report.s122_vendor_probe.wrong_path).toBe('/orders');
    expect(report.s122_vendor_probe.authoritative_path).toBe('/workspace/orders');
    expect(S122_VENDOR_PROBE_WRONG_PATH).toBe('/orders');
    expect(VENDOR_ORDERS_AUTHORITATIVE_PATH).toBe('/workspace/orders');
    expect(report.s122_vendor_probe.root_cause).toBe(S123_VENDOR_FULFILLMENT_ROOT_CAUSE);
    expect(report.s122_vendor_probe.application_defect).toBe(false);
    expect(report.parallel_fulfillment_system_created).toBe(false);
    expect(report.parallel_authorization_framework_created).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.carrier_handoff.production_carrier).toBe('NOT_SELECTED');
    expect(report.carrier_handoff.production_shipping).toBe('BLOCKED');
  });

  it('enforces fulfillment state integrity (payment/Rx/spoof delivered)', () => {
    const integrity = assertVendorFulfillmentStateIntegrity();
    expect(integrity.unpaid_cannot_ready).toBe(true);
    expect(integrity.allocated_cannot_ready).toBe(true);
    expect(integrity.packed_can_ready).toBe(true);
    expect(integrity.ready_cannot_delivered_directly).toBe(true);
    expect(canTransitionOrder(OrderStatus.PACKING, OrderStatus.READY_TO_SHIP)).toBe(false);
    expect(canTransitionOrder(OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED)).toBe(true);
  });
});

describe('S123 compose + regression guards', () => {
  it('does not bypass S122 carrier / S87 launch gates', () => {
    expect(evaluateCarrierLogisticsActivationPreparation().carrier.lifecycle).toBe('NOT_SELECTED');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluateVendorFulfillmentRealUseClosure()))).toBe(
      true,
    );
  });
});
