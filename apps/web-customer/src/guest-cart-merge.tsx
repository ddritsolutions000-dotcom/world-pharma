'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { addCartItem, notifyCartChanged } from './commerce-api';
import { readGuestCart, removeGuestCartLine } from './guest-cart';
import { useSelectedCountry } from './use-selected-country';

export type GuestMergeResult = {
  merged: number;
  skipped: number;
  conflict: boolean;
};

function isSellerConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const row = err as { code?: string; status?: number };
  return row.code === 'CART_SELLER_CONFLICT' || row.status === 409;
}

export async function mergeGuestCartForCountry(token: string, country: string): Promise<GuestMergeResult> {
  const lines = readGuestCart(country);
  const result: GuestMergeResult = { merged: 0, skipped: 0, conflict: false };
  if (!lines.length) {
    return result;
  }
  for (const line of lines) {
    try {
      await addCartItem(token, country, line.offer_id, line.qty, `guest-merge-${line.offer_id}`);
      removeGuestCartLine(country, line.offer_id);
      result.merged += 1;
    } catch (err) {
      if (isSellerConflict(err)) {
        result.skipped += 1;
        result.conflict = true;
        continue;
      }
      notifyCartChanged();
      throw err;
    }
  }
  notifyCartChanged();
  return result;
}

export function GuestCartMerge() {
  const { session, getAccessToken } = useSession();
  const { country, ready } = useSelectedCountry();
  const merging = useRef(false);

  useEffect(() => {
    if (!ready || session.status !== 'authenticated' || merging.current) {
      return;
    }
    const token = getAccessToken();
    if (!token || !readGuestCart(country).length) {
      return;
    }
    merging.current = true;
    void mergeGuestCartForCountry(token, country)
      .catch(() => notifyCartChanged())
      .finally(() => {
        merging.current = false;
      });
  }, [country, getAccessToken, ready, session.status]);

  return null;
}
