import { apiBaseUrl } from '@world-pharma/shell-core';

export class VendorHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VendorHttpError';
  }
}

/** Resolve API root on every call so client uses Next rewrites on vendor dev hosts. */
export function vendorApiRoot(): string {
  if (typeof window !== 'undefined') {
    const port = window.location.port;
    const hostname = window.location.hostname;
    if (port === '3004' || hostname === 'vendor.demo.com') {
      return window.location.origin;
    }
  }
  return apiBaseUrl();
}
