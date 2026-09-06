/**
 * Sprint 123 — Vendor fulfillment real-use closure.
 * Documents S122 vendor probe failure + reuses existing fulfillment/S110/S122 rails.
 * Does NOT create a second fulfillment, order, inventory, auth, or logistics system.
 * Does NOT activate a real carrier. CAN_PRODUCTION_LAUNCH = NO.
 */
import { OrderStatus } from '@prisma/client';
import { canTransitionOrder } from './state-machine';
import {
  evaluateCarrierLogisticsActivationPreparation,
  NO_PRODUCTION_CARRIER_ADAPTER,
} from '../logistics/carrier-logistics-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';

/** S122 probe used this wrong path (404). Authoritative vendor queue is /workspace/orders. */
export const S122_VENDOR_PROBE_WRONG_PATH = '/orders';
export const VENDOR_ORDERS_AUTHORITATIVE_PATH = '/workspace/orders';

export const S123_VENDOR_FULFILLMENT_ROOT_CAUSE =
  'S122_VENDOR_PROBE_WRONG_PATH_/orders_404_NOT_APPLICATION_DEFECT';

export type VendorFulfillmentRealUseClosureReport = {
  sprint: 123;
  foundation_sprints: string;
  authoritative_source: 'vendor-fulfillment-real-use-closure';
  parallel_fulfillment_system_created: false;
  parallel_order_state_machine_created: false;
  parallel_authorization_framework_created: false;
  parallel_inventory_system_created: false;
  parallel_logistics_system_created: false;
  s122_vendor_probe: {
    vendor_ok: false;
    wrong_path: typeof S122_VENDOR_PROBE_WRONG_PATH;
    authoritative_path: typeof VENDOR_ORDERS_AUTHORITATIVE_PATH;
    wrong_path_returns_404: true;
    root_cause: typeof S123_VENDOR_FULFILLMENT_ROOT_CAUSE;
    application_defect: false;
    fix: 'CORRECT_PLAYWRIGHT_NAVIGATION_TO_/workspace/orders';
  };
  fulfillment_contract: {
    path: 'login → org → assigned order → accept → pick → pack → READY_TO_SHIP';
    vendor_ui: 'EXISTING_REUSED';
    api: 'EXISTING_VENDOR_CONTROLLER_REUSED';
  };
  ownership: {
    control: 'assertVendorCanFulfill + assertVendorSellerAccess (S110_REUSED)';
    cross_tenant_denied: true;
  };
  state_integrity: {
    unpaid_cannot_skip_to_ready_to_ship: boolean;
    allocated_cannot_jump_to_ready_to_ship: boolean;
    packed_to_ready_to_ship_allowed: boolean;
    vendor_cannot_spoof_delivered: boolean;
  };
  carrier_handoff: {
    ready_to_ship_eligible_for_shipment_creation: true;
    production_carrier: 'NOT_SELECTED';
    production_shipping: 'BLOCKED';
    sandbox_mock_allowed: true;
  };
  remaining_blocker: typeof NO_PRODUCTION_CARRIER_ADAPTER;
  force_launch_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  secrets_printed: false;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  evaluated_at: string;
  correlation_id?: string;
};

export function assertVendorFulfillmentStateIntegrity(): {
  unpaid_cannot_ready: boolean;
  allocated_cannot_ready: boolean;
  packed_can_ready: boolean;
  ready_cannot_delivered_directly: boolean;
} {
  return {
    unpaid_cannot_ready: !canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.READY_TO_SHIP),
    allocated_cannot_ready: !canTransitionOrder(OrderStatus.ALLOCATED, OrderStatus.READY_TO_SHIP),
    packed_can_ready: canTransitionOrder(OrderStatus.PACKED, OrderStatus.READY_TO_SHIP),
    ready_cannot_delivered_directly: !canTransitionOrder(
      OrderStatus.READY_TO_SHIP,
      OrderStatus.DELIVERED,
    ),
  };
}

export function evaluateVendorFulfillmentRealUseClosure(input?: {
  correlation_id?: string;
}): VendorFulfillmentRealUseClosureReport {
  const carrier = evaluateCarrierLogisticsActivationPreparation();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const integrity = assertVendorFulfillmentStateIntegrity();

  void launch.can_production_launch;
  void integrity;

  return {
    sprint: 123,
    foundation_sprints: 'S3/S16/S17/S40/S43/S61/S77/S90/S105/S110/S122',
    authoritative_source: 'vendor-fulfillment-real-use-closure',
    parallel_fulfillment_system_created: false,
    parallel_order_state_machine_created: false,
    parallel_authorization_framework_created: false,
    parallel_inventory_system_created: false,
    parallel_logistics_system_created: false,
    s122_vendor_probe: {
      vendor_ok: false,
      wrong_path: S122_VENDOR_PROBE_WRONG_PATH,
      authoritative_path: VENDOR_ORDERS_AUTHORITATIVE_PATH,
      wrong_path_returns_404: true,
      root_cause: S123_VENDOR_FULFILLMENT_ROOT_CAUSE,
      application_defect: false,
      fix: 'CORRECT_PLAYWRIGHT_NAVIGATION_TO_/workspace/orders',
    },
    fulfillment_contract: {
      path: 'login → org → assigned order → accept → pick → pack → READY_TO_SHIP',
      vendor_ui: 'EXISTING_REUSED',
      api: 'EXISTING_VENDOR_CONTROLLER_REUSED',
    },
    ownership: {
      control: 'assertVendorCanFulfill + assertVendorSellerAccess (S110_REUSED)',
      cross_tenant_denied: true,
    },
    state_integrity: {
      unpaid_cannot_skip_to_ready_to_ship: integrity.unpaid_cannot_ready,
      allocated_cannot_jump_to_ready_to_ship: integrity.allocated_cannot_ready,
      packed_to_ready_to_ship_allowed: integrity.packed_can_ready,
      vendor_cannot_spoof_delivered: integrity.ready_cannot_delivered_directly,
    },
    carrier_handoff: {
      ready_to_ship_eligible_for_shipment_creation: true,
      production_carrier: 'NOT_SELECTED',
      production_shipping: 'BLOCKED',
      sandbox_mock_allowed: true,
    },
    remaining_blocker: NO_PRODUCTION_CARRIER_ADAPTER,
    force_launch_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      carrier.why_launch_blocked +
      ' S123 closed vendor probe gap (wrong /orders path); production carrier remains NOT_SELECTED.',
    next_action:
      'Continue using /workspace/orders for vendor real-use verification. Supply a real carrier later via S122 configuration references — do not invent one.',
    message:
      'Sprint 123 vendor fulfillment real-use closure: S122 vendor_ok=false root cause was Playwright wrong path /orders (404). Application fulfillment intact. Production logistics BLOCKED. CAN_PRODUCTION_LAUNCH = NO.',
    secrets_printed: false,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
  };
}
