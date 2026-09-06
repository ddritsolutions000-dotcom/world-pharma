import { computeVendorDashboardMetrics } from './vendor-dashboard-metrics';
import type { VendorOrder, VendorShipment } from './vendor-api';

describe('computeVendorDashboardMetrics', () => {
  it('counts awaiting acceptance using real order statuses and vendor_accepted flag', () => {
    const orders: VendorOrder[] = [
      { id: '1', order_number: 'A', status: 'ALLOCATED', vendor_accepted: false },
      { id: '2', order_number: 'B', status: 'ALLOCATED', vendor_accepted: true },
      { id: '3', order_number: 'C', status: 'PLACED' as string, vendor_accepted: false },
    ];
    const metrics = computeVendorDashboardMetrics({
      orders,
      offers: [],
      lots: [],
      settlements: [],
      shipments: [],
      tickets: [],
      inbox: [],
      eligibility: null,
    });
    expect(metrics.fulfilment.awaitingAcceptance).toBe(1);
  });

  it('uses backend shipment status enums for pending shipments', () => {
    const shipments: VendorShipment[] = [
      { id: 's1', status: 'BOOKED' },
      { id: 's2', status: 'CREATED' as string },
    ];
    const metrics = computeVendorDashboardMetrics({
      orders: [],
      offers: [],
      lots: [],
      settlements: [],
      shipments,
      tickets: [],
      inbox: [],
      eligibility: null,
    });
    expect(metrics.fulfilment.shipmentPending).toBe(1);
  });
});
