import { vendorInboxHref } from './vendor-inbox';
import type { VendorInboxItem } from './vendor-api';

describe('vendor inbox deep links', () => {
  const base: VendorInboxItem = {
    id: 'n1',
    channel: 'in_app',
    title: 'Order update',
    body: 'Sandbox notice',
    read: false,
    created_at: '2026-08-30T10:00:00.000Z',
  };

  it('maps reference types to vendor shell tabs', () => {
    expect(vendorInboxHref({ ...base, reference_type: 'order' })).toBe('#orders');
    expect(vendorInboxHref({ ...base, reference_type: 'shipment' })).toBe('#shipments');
    expect(vendorInboxHref({ ...base, reference_type: 'settlement_line' })).toBe('#settlements');
    expect(vendorInboxHref({ ...base, reference_type: 'support' })).toBe('#support');
  });
});
