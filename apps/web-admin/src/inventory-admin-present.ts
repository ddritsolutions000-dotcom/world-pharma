function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

export type InventoryLocationRow = {
  id: string;
  name: string;
  kind: string;
  city: string;
  postal_code: string;
};

export type InventoryLotRow = {
  id: string;
  sku: string;
  lot_code: string;
  status: string;
  location_name: string;
  available: number;
  on_hand: number;
  reserved: number;
  variant_id: string;
  location_id: string;
};

export type InventoryReceiptRow = {
  id: string;
  status: string;
  location_id: string;
  line_count: number;
};

export type InventoryTransferRow = {
  id: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
};

export function presentLocations(body: unknown): InventoryLocationRow[] {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: pickString(row, 'id') || `location-${index}`,
      name: pickString(row, 'name') || pickString(row, 'id') || 'Location',
      kind: pickString(row, 'kind'),
      city: pickString(row, 'city'),
      postal_code: pickString(row, 'postal_code', 'postalCode'),
    };
  });
}

export function presentLots(body: unknown): InventoryLotRow[] {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data)
      : [];
  return rows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: pickString(row, 'id') || `lot-${index}`,
      sku: pickString(row, 'sku'),
      lot_code: pickString(row, 'lot_code', 'lotCode'),
      status: pickString(row, 'status') || 'UNKNOWN',
      location_name: pickString(row, 'location_name', 'locationName'),
      available: pickNumber(row, 'available'),
      on_hand: pickNumber(row, 'on_hand', 'onHand'),
      reserved: pickNumber(row, 'reserved'),
      variant_id: pickString(row, 'variant_id', 'variantId'),
      location_id: pickString(row, 'location_id', 'locationId'),
    };
  });
}

export function presentReceipts(body: unknown): InventoryReceiptRow[] {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    return {
      id: pickString(row, 'id') || `grn-${index}`,
      status: pickString(row, 'status') || 'UNKNOWN',
      location_id: pickString(row, 'location_id', 'locationId'),
      line_count: lines.length,
    };
  });
}

export function presentTransfers(body: unknown): InventoryTransferRow[] {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: pickString(row, 'id') || `xfer-${index}`,
      status: pickString(row, 'status') || 'UNKNOWN',
      from_location_id: pickString(row, 'from_location_id', 'fromLocationId'),
      to_location_id: pickString(row, 'to_location_id', 'toLocationId'),
    };
  });
}
