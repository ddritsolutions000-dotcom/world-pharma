import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const r = await p.labReport.findUnique({
  where: { id: '01a069a8-8cdc-7887-9f9e-ce454d265d12' },
  include: { currentVersion: true },
});
console.log(JSON.stringify({ status: r?.currentVersion?.status, assigned: r?.assignedPathologistPersonId }, null, 2));
await p.$disconnect();
