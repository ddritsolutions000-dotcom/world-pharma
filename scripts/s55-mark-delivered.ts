import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ident = await prisma.accountIdentifier.findFirst({
    where: { type: 'EMAIL', valueNormalized: 'sandbox-customer@dev.local' },
  });
  if (!ident) throw new Error('no customer');
  const orders = await prisma.order.findMany({
    where: { customerPersonId: ident.personId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      country: { select: { isoAlpha2: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  console.log(JSON.stringify(orders, null, 2));

  const inOrder = orders.find((o) => o.country?.isoAlpha2 === 'IN' && o._count.items > 0);
  const target = inOrder ?? orders.find((o) => o._count.items > 0);
  if (!target) {
    console.log('No order with items');
    return;
  }
  await prisma.order.update({ where: { id: target.id }, data: { status: 'DELIVERED' } });
  await prisma.shipment.updateMany({ where: { orderId: target.id }, data: { status: 'DELIVERED' } });
  console.log('Marked DELIVERED', target.orderNumber, target.country?.isoAlpha2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
