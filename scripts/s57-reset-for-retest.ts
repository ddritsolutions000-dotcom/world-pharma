import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const report = await p.labReport.findUnique({
    where: { id: '01a069a8-8cdc-7887-9f9e-ce454d265d12' },
    include: { currentVersion: true },
  });
  console.log('lab', report?.currentVersion?.status, report?.assignedPathologistPersonId);
  if (report?.currentVersion && ['PUBLISHED', 'VERIFIED'].includes(report.currentVersion.status)) {
    await p.labReportVersion.update({
      where: { id: report.currentVersion.id },
      data: {
        status: 'PENDING_VERIFY',
        publishedAt: null,
        publishedByPersonId: null,
        verifiedByPersonId: null,
      },
    });
    console.log('lab reset to PENDING_VERIFY');
  }

  const order = await p.order.findFirst({ where: { orderNumber: 'WP-IN-4B5C33D1C4' } });
  console.log('order before', order?.status);
  if (order) {
    await p.orderStatusHistory.deleteMany({ where: { orderId: order.id, reason: 'vendor_accept' } });
    await p.order.update({ where: { id: order.id }, data: { status: 'ALLOCATED' } });
    console.log('vendor reset ALLOCATED');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
