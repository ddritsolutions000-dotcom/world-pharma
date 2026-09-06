import { isTerminalShipmentStatus, shipmentStatusLabel } from './shipment-status-labels';

describe('shipmentStatusLabel', () => {
  it('maps backend shipment statuses', () => {
    expect(shipmentStatusLabel('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(shipmentStatusLabel('DELIVERY_FAILED')).toBe('Delivery failed');
    expect(shipmentStatusLabel('RETURN_TO_ORIGIN')).toBe('Return to origin');
  });

  it('detects terminal statuses', () => {
    expect(isTerminalShipmentStatus('DELIVERED')).toBe(true);
    expect(isTerminalShipmentStatus('RETURN_TO_ORIGIN')).toBe(true);
    expect(isTerminalShipmentStatus('OUT_FOR_DELIVERY')).toBe(false);
  });
});
