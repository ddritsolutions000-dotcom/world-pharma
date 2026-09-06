import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';

describe('shipmentStatusLabel', () => {
  it('maps known backend statuses', () => {
    expect(shipmentStatusLabel('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(shipmentStatusLabel('DELIVERED')).toBe('Delivered');
  });
});

describe('shipmentLifecycleSummary', () => {
  it('describes in transit without fake ETA', () => {
    expect(shipmentLifecycleSummary('IN_TRANSIT').headline).toBe('In transit');
  });

  it('describes delivered state', () => {
    expect(shipmentLifecycleSummary('DELIVERED').headline).toBe('Delivered');
  });
});
