export const GUEST_CART_KEY = 'wp_guest_cart';

export type GuestCartLine = {
  offer_id: string;
  qty: number;
  title: string;
  currency: string;
  sell_minor: string;
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

let memoryRaw = '[]';

function storage(): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void } {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      return ls;
    }
  } catch {
    /* native / private mode */
  }
  return {
    getItem: () => memoryRaw,
    setItem: (_key, value) => {
      memoryRaw = value;
    },
    removeItem: () => {
      memoryRaw = '[]';
    },
  };
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
  return parseLines(storage().getItem(GUEST_CART_KEY)).filter((row) => row.country === country);
}

export function guestCartQty(country: string): number {
  return readGuestCart(country).reduce((sum, row) => sum + Number(row.qty || 0), 0);
}

export function writeGuestCart(lines: GuestCartLine[]): void {
  storage().setItem(GUEST_CART_KEY, JSON.stringify(lines));
}

export function addGuestCartLine(input: GuestCartLine): GuestCartLine[] {
  const qty = Math.max(1, Math.floor(Number(input.qty) || 1));
  const existing = parseLines(storage().getItem(GUEST_CART_KEY));
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
  writeGuestCart([...other, ...nextInCountry]);
  return nextInCountry;
}

export function guestLinesAsCartItems(lines: GuestCartLine[]) {
  return lines.map((row) => ({
    id: `guest:${row.offer_id}`,
    offer_id: row.offer_id,
    title: row.title,
    qty: row.qty,
    sell_minor: row.sell_minor,
    currency: row.currency,
  }));
}

export function removeGuestCartLine(country: string, offerId: string) {
  const next = parseLines(storage().getItem(GUEST_CART_KEY)).filter(
    (row) => !(row.country === country && row.offer_id === offerId),
  );
  writeGuestCart(next);
  return next.filter((row) => row.country === country);
}
