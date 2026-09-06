/** Orders eligible for per-order reorder (delivered only). */
export const REORDER_ELIGIBLE_STATUSES = new Set(['DELIVERED']);

export function isReorderEligible(status: string): boolean {
  return REORDER_ELIGIBLE_STATUSES.has(status);
}
