import type { VendorInboxItem } from './vendor-api';
import type { VendorWorkspaceFocus } from './vendor-workspace-focus';
import { vendorTabPath } from './vendor-workspace-nav';

export function vendorWorkspaceHref(focus: VendorWorkspaceFocus): string {
  const params = new URLSearchParams();
  if (focus.orderId) {
    params.set('orderId', focus.orderId);
  }
  if (focus.shipmentId) {
    params.set('shipmentId', focus.shipmentId);
  }
  if (focus.settlementId) {
    params.set('settlementId', focus.settlementId);
  }
  if (focus.ticketId) {
    params.set('ticketId', focus.ticketId);
  }
  const base = vendorTabPath(focus.tab);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function vendorInboxNavigate(item: VendorInboxItem): void {
  if (item.reference_type === 'order' && item.reference_id) {
    window.location.assign(
      vendorWorkspaceHref({ tab: 'orders', orderId: item.reference_id }),
    );
    return;
  }
  if (item.reference_type === 'shipment' && item.reference_id) {
    window.location.assign(
      vendorWorkspaceHref({ tab: 'shipments', shipmentId: item.reference_id }),
    );
    return;
  }
  if (
    (item.reference_type === 'settlement' || item.reference_type === 'settlement_line') &&
    item.reference_id
  ) {
    window.location.assign(
      vendorWorkspaceHref({ tab: 'settlements', settlementId: item.reference_id }),
    );
    return;
  }
  if (item.reference_type === 'support' && item.reference_id) {
    window.location.assign(
      vendorWorkspaceHref({ tab: 'support', ticketId: item.reference_id }),
    );
    return;
  }
  const fallback = vendorInboxHref(item);
  if (fallback) {
    window.location.assign(fallback);
  }
}

export function vendorInboxHref(item: VendorInboxItem): string | null {
  const type = item.reference_type;
  if (type === 'order') {
    return vendorTabPath('orders');
  }
  if (type === 'shipment') {
    return vendorTabPath('shipments');
  }
  if (type === 'settlement' || type === 'settlement_line') {
    return vendorTabPath('settlements');
  }
  if (type === 'support') {
    return vendorTabPath('support');
  }
  return null;
}
