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

type CarrierSeed = {
  code: string;
  name: string;
  accountCode: string;
  priority: number;
  originIso2: string;
  destIso2: string;
  international: boolean;
};

const SANDBOX_CARRIERS: CarrierSeed[] = [
  {
    code: 'INDIA_POST',
    name: 'India Post',
    accountCode: 'INDIA_POST_SANDBOX',
    priority: 5,
    originIso2: 'IN',
    destIso2: 'IN',
    international: false,
  },
  {
    code: 'DHL',
    name: 'DHL Express',
    accountCode: 'DHL_SANDBOX',
    priority: 5,
    originIso2: '*',
    destIso2: '*',
    international: true,
  },
  {
    code: 'BLUEDART',
    name: 'Blue Dart',
    accountCode: 'BLUEDART_SANDBOX',
    priority: 8,
    originIso2: 'IN',
    destIso2: 'IN',
    international: false,
  },
  {
    code: 'DELHIVERY',
    name: 'Delhivery',
    accountCode: 'DELHIVERY_SANDBOX',
    priority: 10,
    originIso2: 'IN',
    destIso2: 'IN',
    international: false,
  },
  {
    code: 'MOCK',
    name: 'Sandbox mock carrier (TEST ONLY)',
    accountCode: 'MOCK_SANDBOX',
    priority: 90,
    originIso2: '*',
    destIso2: '*',
    international: false,
  },
  {
    code: 'MOCK_B',
    name: 'Sandbox mock carrier B (failover TEST ONLY)',
    accountCode: 'MOCK_B_SANDBOX',
    priority: 95,
    originIso2: '*',
    destIso2: '*',
    international: false,
  },
];

export async function seedMockCarrier(prisma: PrismaService): Promise<void> {
  for (const row of SANDBOX_CARRIERS) {
    await seedSandboxCarrier(prisma, row);
  }
}

async function seedSandboxCarrier(prisma: PrismaService, row: CarrierSeed): Promise<void> {
  const existing = await prisma.carrier.findUnique({ where: { code: row.code } });
  const id = existing?.id ?? uuidv7();
  await prisma.carrier.upsert({
    where: { code: row.code },
    update: { active: true, environment: 'sandbox', name: row.name },
    create: {
      id,
      code: row.code,
      name: row.name,
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
    },
  });
  const carrier = await prisma.carrier.findUniqueOrThrow({ where: { code: row.code } });
  await prisma.carrierAccount.upsert({
    where: { code: row.accountCode },
    update: { active: true, priority: row.priority },
    create: {
      id: uuidv7(),
      carrierId: carrier.id,
      code: row.accountCode,
      environment: 'sandbox',
      active: true,
      secretRef: 'env:CARRIER_MOCK_WEBHOOK_SECRET',
      priority: row.priority,
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
    where: { carrierId: carrier.id, originIso2: row.originIso2, destIso2: row.destIso2 },
  });
  if (!coverage) {
    await prisma.carrierCoverage.create({
      data: {
        id: uuidv7(),
        carrierId: carrier.id,
        originIso2: row.originIso2,
        destIso2: row.destIso2,
        international: row.international,
        active: true,
      },
    });
  } else {
    await prisma.carrierCoverage.update({
      where: { id: coverage.id },
      data: { international: row.international, active: true },
    });
  }
  await prisma.carrierHealth.upsert({
    where: { carrierId: carrier.id },
    update: { score: 100, circuitOpen: false },
    create: { id: uuidv7(), carrierId: carrier.id, score: 100, circuitOpen: false },
  });
}
