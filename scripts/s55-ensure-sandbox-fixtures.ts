/**
 * Sprint 55 — ensure sandbox fixtures for eligible reorder + address dedupe.
 * Safe to re-run. Does NOT weaken reorder eligibility (still DELIVERED-only).
 *
 *   npx tsx scripts/s55-ensure-sandbox-fixtures.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
const REORDER_ORDER_NUMBER = 'DEMO-SBX-REORDER-IN';

async function dedupeAddresses(customerPersonId: string) {
  const rows = await prisma.customerAddress.findMany({
    where: { customerPersonId },
    orderBy: { createdAt: 'asc' },
  });
  const seen = new Set<string>();
  let removed = 0;
  for (const row of rows) {
    const key = [
      row.countryId,
      row.recipientName.trim().toLowerCase(),
      row.line1.trim().toLowerCase(),
      row.city.trim().toLowerCase(),
      (row.postalCode ?? '').trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) {
      // Only remove duplicates not referenced by active checkout sessions
      const inUse = await prisma.checkoutSession.count({ where: { addressId: row.id } });
      if (inUse > 0) continue;
      await prisma.customerAddress.delete({ where: { id: row.id } }).catch(() => undefined);
      removed += 1;
    } else {
      seen.add(key);
    }
  }
  return removed;
}

async function ensureDeliveredReorderOrder(customerPersonId: string) {
  const tagged = await prisma.order.findFirst({
    where: { orderNumber: REORDER_ORDER_NUMBER },
    include: { items: true },
  });
  if (tagged && tagged.items.length > 0) {
    if (tagged.status !== 'DELIVERED') {
      await prisma.order.update({ where: { id: tagged.id }, data: { status: 'DELIVERED' } });
      await prisma.shipment.updateMany({
        where: { orderId: tagged.id },
        data: { status: 'DELIVERED' },
      });
      return { orderNumber: tagged.orderNumber, action: 'marked_delivered' };
    }
    return { orderNumber: tagged.orderNumber, action: 'already_delivered' };
  }

  // Prefer an existing customer order with line items (from prior sandbox journeys).
  const candidate = await prisma.order.findFirst({
    where: {
      customerPersonId,
      items: { some: {} },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    },
    include: { items: true, country: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!candidate || candidate.items.length === 0) {
    return { orderNumber: null, action: 'missing_order_create_via_ui' };
  }

  await prisma.order.update({
    where: { id: candidate.id },
    data: { status: 'DELIVERED' },
  });
  await prisma.shipment.updateMany({
    where: { orderId: candidate.id },
    data: { status: 'DELIVERED' },
  });
  return { orderNumber: candidate.orderNumber, action: 'promoted_existing' };
}

async function main() {
  const ident = await prisma.accountIdentifier.findFirst({
    where: { type: 'EMAIL', valueNormalized: CUSTOMER_EMAIL },
  });
  if (!ident) {
    throw new Error(`Sandbox customer ${CUSTOMER_EMAIL} not found`);
  }

  const removed = await dedupeAddresses(ident.personId);
  const reorder = await ensureDeliveredReorderOrder(ident.personId);

  // Ensure IN Mumbai fixture address (single) for checkout
  const inCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'IN' } });
  if (inCountry) {
    const existingIn = await prisma.customerAddress.findFirst({
      where: {
        customerPersonId: ident.personId,
        countryId: inCountry.id,
        line1: '12 Marine Drive',
        city: 'Mumbai',
        postalCode: '400001',
      },
    });
    if (!existingIn) {
      const { randomUUID } = await import('node:crypto');
      const now = Date.now();
      const bytes = Buffer.alloc(16);
      bytes.writeUIntBE(now, 0, 6);
      const rand = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
      rand.copy(bytes, 6, 0, 10);
      bytes[6] = (bytes[6]! & 0x0f) | 0x70;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = bytes.toString('hex');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      await prisma.customerAddress.create({
        data: {
          id,
          customerPersonId: ident.personId,
          countryId: inCountry.id,
          recipientName: 'Demo Customer',
          phone: '+919999999999',
          city: 'Mumbai',
          postalCode: '400001',
          line1: '12 Marine Drive',
          isDefault: false,
        },
      });
    }
  }

  console.log(JSON.stringify({ ok: true, addressesRemoved: removed, reorder }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
