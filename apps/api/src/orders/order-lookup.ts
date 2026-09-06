import type { Prisma } from '@prisma/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve order by UUID id or human order number without casting non-UUIDs to uuid. */
export function orderIdOrNumberWhere(idOrNumber: string): Prisma.OrderWhereInput {
  const value = idOrNumber.trim();
  if (UUID_RE.test(value)) {
    return { OR: [{ id: value }, { orderNumber: value }] };
  }
  return { orderNumber: value };
}
