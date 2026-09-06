import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const orders = await p.order.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { orderNumber: true, status: true },
  });
  const apps = await p.partnerApplication.findMany({
    take: 10,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, partnerTypeCode: true },
  });
  const items = await p.catalogItem.findMany({
    take: 5,
    where: { slug: { contains: 'paracetamol' } },
    select: { id: true, slug: true, status: true },
  });
  console.log(JSON.stringify({ orders, apps, items }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
