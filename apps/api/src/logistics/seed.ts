import { ShippingServiceLevel } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';

const CAPS = [
  'quote',
  'create_shipment',
  'cancel',
  'label',
  'pickup',
  'tracking',
  'pod',
  'returns',
  'domestic',
  'temperature_controlled',
];

export async function seedMockCarrier(prisma: PrismaService): Promise<void> {
  const existing = await prisma.carrier.findUnique({ where: { code: 'MOCK' } });
  const id = existing?.id ?? uuidv7();
  await prisma.carrier.upsert({
    where: { code: 'MOCK' },
    update: { active: true, environment: 'sandbox' },
    create: {
      id,
      code: 'MOCK',
      name: 'Sandbox mock carrier (TEST ONLY)',
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
    },
  });
  const carrier = await prisma.carrier.findUniqueOrThrow({ where: { code: 'MOCK' } });
  await prisma.carrierAccount.upsert({
    where: { code: 'MOCK_SANDBOX' },
    update: { active: true },
    create: {
      id: uuidv7(),
      carrierId: carrier.id,
      code: 'MOCK_SANDBOX',
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
      priority: 10,
    },
  });
  for (const name of CAPS) {
    await prisma.carrierCapability.upsert({
      where: { carrierId_name: { carrierId: carrier.id, name } },
      update: { enabled: true },
      create: { id: uuidv7(), carrierId: carrier.id, name, enabled: true },
    });
  }
  await prisma.carrierService.upsert({
    where: { carrierId_code: { carrierId: carrier.id, code: 'STANDARD' } },
    update: { active: true },
    create: {
      id: uuidv7(),
      carrierId: carrier.id,
      code: 'STANDARD',
      level: ShippingServiceLevel.STANDARD,
      active: true,
    },
  });
  const coverage = await prisma.carrierCoverage.findFirst({ where: { carrierId: carrier.id, originIso2: '*', destIso2: '*' } });
  if (!coverage) {
    await prisma.carrierCoverage.create({
      data: { id: uuidv7(), carrierId: carrier.id, originIso2: '*', destIso2: '*', international: false, active: true },
    });
  }
  await prisma.carrierHealth.upsert({
    where: { carrierId: carrier.id },
    update: { score: 100, circuitOpen: false },
    create: { id: uuidv7(), carrierId: carrier.id, score: 100, circuitOpen: false },
  });
  await seedAltCarrier(prisma);
}

async function seedAltCarrier(prisma: PrismaService): Promise<void> {
  const existing = await prisma.carrier.findUnique({ where: { code: 'MOCK_B' } });
  const id = existing?.id ?? uuidv7();
  await prisma.carrier.upsert({
    where: { code: 'MOCK_B' },
    update: { active: true, environment: 'sandbox' },
    create: {
      id,
      code: 'MOCK_B',
      name: 'Sandbox mock carrier B (failover TEST ONLY)',
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
    },
  });
  const carrier = await prisma.carrier.findUniqueOrThrow({ where: { code: 'MOCK_B' } });
  await prisma.carrierAccount.upsert({
    where: { code: 'MOCK_B_SANDBOX' },
    update: { active: true },
    create: {
      id: uuidv7(),
      carrierId: carrier.id,
      code: 'MOCK_B_SANDBOX',
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
      priority: 20,
    },
  });
  for (const name of CAPS) {
    await prisma.carrierCapability.upsert({
      where: { carrierId_name: { carrierId: carrier.id, name } },
      update: { enabled: true },
      create: { id: uuidv7(), carrierId: carrier.id, name, enabled: true },
    });
  }
  await prisma.carrierService.upsert({
    where: { carrierId_code: { carrierId: carrier.id, code: 'STANDARD' } },
    update: { active: true },
    create: {
      id: uuidv7(),
      carrierId: carrier.id,
      code: 'STANDARD',
      level: ShippingServiceLevel.STANDARD,
      active: true,
    },
  });
  const coverage = await prisma.carrierCoverage.findFirst({
    where: { carrierId: carrier.id, originIso2: '*', destIso2: '*' },
  });
  if (!coverage) {
    await prisma.carrierCoverage.create({
      data: { id: uuidv7(), carrierId: carrier.id, originIso2: '*', destIso2: '*', international: false, active: true },
    });
  }
  await prisma.carrierHealth.upsert({
    where: { carrierId: carrier.id },
    update: { score: 90, circuitOpen: false },
    create: { id: uuidv7(), carrierId: carrier.id, score: 90, circuitOpen: false },
  });
}
