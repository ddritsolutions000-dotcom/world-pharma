export const GUEST_CART_KEY = 'wp_guest_cart';

export type GuestCartLine = {
  offer_id: string;
  qty: number;
  title: string;
  currency: string;
  sell_minor: string;
  image_url?: string;
  country: string;
  seller_org_id?: string;
};

export class GuestCartError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function storage(): Storage | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function parseLines(raw: string | null): GuestCartLine[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((row): row is GuestCartLine => {
      if (!row || typeof row !== 'object') {
        return false;
      }
      const line = row as GuestCartLine;
      return Boolean(line.offer_id && line.country && Number(line.qty) > 0);
    });
  } catch {
    return [];
  }
}

export function readGuestCart(country: string): GuestCartLine[] {
  const store = storage();
  if (!store) {
    return [];
  }
  return parseLines(store.getItem(GUEST_CART_KEY)).filter((row) => row.country === country);
}

export function guestCartQty(country: string): number {
  return readGuestCart(country).reduce((sum, row) => sum + Number(row.qty || 0), 0);
}

export function writeGuestCart(lines: GuestCartLine[]): void {
  const store = storage();
  if (!store) {
    return;
  }
  store.setItem(GUEST_CART_KEY, JSON.stringify(lines));
}

export function clearGuestCart(country?: string): void {
  const store = storage();
  if (!store) {
    return;
  }
  if (!country) {
    store.removeItem(GUEST_CART_KEY);
    return;
  }
  const rest = parseLines(store.getItem(GUEST_CART_KEY)).filter((row) => row.country !== country);
  writeGuestCart(rest);
}

export function addGuestCartLine(input: GuestCartLine): GuestCartLine[] {
  const qty = Math.max(1, Math.floor(Number(input.qty) || 1));
  const existing = parseLines(storage()?.getItem(GUEST_CART_KEY) ?? null);
  const inCountry = existing.filter((row) => row.country === input.country);
  const other = existing.filter((row) => row.country !== input.country);
  const seller = inCountry.find((row) => row.seller_org_id)?.seller_org_id;
  if (seller && input.seller_org_id && seller !== input.seller_org_id) {
    throw new GuestCartError('CART_SELLER_CONFLICT', 'Your cart has items from another seller.');
  }
  const match = inCountry.find((row) => row.offer_id === input.offer_id);
  const nextInCountry = match
    ? inCountry.map((row) => (row.offer_id === input.offer_id ? { ...row, qty: row.qty + qty } : row))
    : [...inCountry, { ...input, qty }];
  const next = [...other, ...nextInCountry];
  writeGuestCart(next);
  return nextInCountry;
}

export function updateGuestCartQty(country: string, offerId: string, qty: number): GuestCartLine[] {
  const nextQty = Math.floor(Number(qty) || 0);
  const existing = parseLines(storage()?.getItem(GUEST_CART_KEY) ?? null);
  const next = existing
    .map((row) => (row.country === country && row.offer_id === offerId ? { ...row, qty: nextQty } : row))
    .filter((row) => row.qty > 0);
  writeGuestCart(next);
  return next.filter((row) => row.country === country);
}

export function removeGuestCartLine(country: string, offerId: string): GuestCartLine[] {
  return updateGuestCartQty(country, offerId, 0);
}

export function guestLinesAsCartItems(lines: GuestCartLine[]) {
  return lines.map((row) => ({
    id: `guest:${row.offer_id}`,
    offer_id: row.offer_id,
    title: row.title,
    qty: row.qty,
    sell_minor: row.sell_minor,
    currency: row.currency,
    image_url: row.image_url,
  }));
}
