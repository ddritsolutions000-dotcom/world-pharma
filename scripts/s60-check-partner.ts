import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const id = '01a03e52-c198-7406-a6c8-70031b8d3ee2';
p.partnerApplication
  .findUnique({ where: { id }, select: { status: true, partnerTypeCode: true } })
  .then((r) => {
    console.log(r);
  })
  .finally(() => p.$disconnect());
