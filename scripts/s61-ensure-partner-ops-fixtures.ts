/**
 * Sprint 61 — partner-ops fixtures for live UI retest.
 * Respects published lab report immutability (DB trigger).
 *
 *   npx tsx scripts/s61-ensure-partner-ops-fixtures.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAB_REPORT_ID = '01a069a8-8cdc-7887-9f9e-ce454d265d12';
const IMAGING_REPORT_ID = '01a069b8-9c07-7d66-81ab-cdced013bafe';
const VENDOR_ORDER = 'WP-IN-4B5C33D1C4';

async function inspectLab() {
  const report = await prisma.labReport.findUnique({
    where: { id: LAB_REPORT_ID },
    include: { currentVersion: true },
  });
  console.log('lab report', report?.currentVersion?.status ?? 'missing');
  return {
    id: LAB_REPORT_ID,
    status: report?.currentVersion?.status ?? null,
    immutable_if_published: report?.currentVersion?.status === 'PUBLISHED',
  };
}

async function resetImagingForRadiologist() {
  const versions = await prisma.imagingReportVersion.findMany({
    where: { imagingReportId: IMAGING_REPORT_ID },
    orderBy: { versionNumber: 'desc' },
    take: 1,
  });
  const current = versions[0];
  if (!current) {
    console.warn('imaging version missing');
    return null;
  }
  if (['PUBLISHED', 'VERIFIED', 'PENDING_VERIFY'].includes(current.status)) {
    try {
      await prisma.imagingReportVersion.update({
        where: { id: current.id },
        data: {
          status: 'DRAFT',
          publishedAt: null,
          publishedByPersonId: null,
          verifiedByPersonId: null,
        },
      });
      console.log('imaging version reset DRAFT');
      return { id: IMAGING_REPORT_ID, status: 'DRAFT' };
    } catch (e) {
      console.warn('imaging reset blocked', (e as Error).message.slice(0, 160));
      return { id: IMAGING_REPORT_ID, status: current.status, reset: false };
    }
  }
  console.log('imaging already', current.status);
  return { id: IMAGING_REPORT_ID, status: current.status };
}

async function resetVendorOrder() {
  const order = await prisma.order.findFirst({ where: { orderNumber: VENDOR_ORDER } });
  if (!order) {
    console.warn('vendor order missing');
    return null;
  }
  await prisma.orderStatusHistory.deleteMany({
    where: {
      orderId: order.id,
      reason: {
        in: [
          'vendor_accept',
          'pick_start',
          'pick_complete',
          'pack_start',
          'pack_complete',
          'ready_to_ship',
          'shipped',
        ],
      },
    },
  });
  // Reset pick/pack tasks so Start pick is legal again
  const groups = await prisma.fulfillmentGroup.findMany({ where: { orderId: order.id }, select: { id: true } });
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length) {
    await prisma.pickTask.updateMany({
      where: { groupId: { in: groupIds } },
      data: { status: 'OPEN', pickedQty: 0 },
    });
    await prisma.packTask.updateMany({
      where: { groupId: { in: groupIds } },
      data: { status: 'OPEN' },
    });
    await prisma.fulfillmentGroup.updateMany({
      where: { id: { in: groupIds } },
      data: { status: 'ALLOCATED' },
    });
  }
  await prisma.order.update({ where: { id: order.id }, data: { status: 'ALLOCATED' } });
  // Remove prior sandbox shipments (cascade label/events/costs) so pack→book is clean
  const deletedShipments = await prisma.shipment.deleteMany({ where: { orderId: order.id } });
  // Clear prior fulfillment outbox keys so re-pick/re-pack can enqueue
  const deletedOutbox = await prisma.outboxEvent.deleteMany({
    where: {
      aggregateId: order.id,
      type: {
        in: [
          'ORDER_PICKING',
          'ORDER_PICKED',
          'ORDER_PACKING',
          'ORDER_PACKED',
          'ORDER_READY_TO_SHIP',
          'ORDER_SHIPPED',
        ],
      },
    },
  });
  console.log(
    'vendor order reset ALLOCATED',
    VENDOR_ORDER,
    'groups',
    groupIds.length,
    'shipments deleted',
    deletedShipments.count,
    'outbox cleared',
    deletedOutbox.count,
  );
  return { orderNumber: VENDOR_ORDER, status: 'ALLOCATED' };
}

async function main() {
  const lab = await inspectLab();
  const imaging = await resetImagingForRadiologist();
  const vendor = await resetVendorOrder();
  console.log(JSON.stringify({ ok: true, lab, imaging, vendor }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
