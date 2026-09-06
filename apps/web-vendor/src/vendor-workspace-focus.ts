import type { VendorTabId } from './vendor-workspace-nav';
import { vendorWorkspaceHref } from './vendor-inbox';

export type VendorWorkspaceFocus = {
  tab: VendorTabId;
  orderId?: string;
  shipmentId?: string;
  settlementId?: string;
  ticketId?: string;
};

const STORAGE_KEY = 'wp-vendor-workspace-focus';

/** @deprecated use vendorWorkspaceHref + router navigation */
export function setVendorWorkspaceFocus(focus: VendorWorkspaceFocus): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(focus));
}

/** @deprecated use URL query params on workspace routes */
export function consumeVendorWorkspaceFocus(): VendorWorkspaceFocus | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    const focus = JSON.parse(raw) as VendorWorkspaceFocus;
    window.location.assign(vendorWorkspaceHref(focus));
    return focus;
  } catch {
    return null;
  }
}

export { vendorWorkspaceHref };
