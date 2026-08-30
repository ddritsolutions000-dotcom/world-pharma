import { PaymentMethodFamily } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';

export async function seedSandboxGateways(prisma: PrismaService): Promise<void> {
  const families: Array<{ family: PaymentMethodFamily; label: string }> = [
    { family: PaymentMethodFamily.CARD, label: 'Card (sandbox token)' },
    { family: PaymentMethodFamily.BANK_TRANSFER, label: 'Bank transfer' },
    { family: PaymentMethodFamily.LOCAL_BANK, label: 'Local bank' },
    { family: PaymentMethodFamily.WALLET, label: 'Wallet' },
    { family: PaymentMethodFamily.MOBILE_PAYMENT, label: 'Mobile payment' },
    { family: PaymentMethodFamily.COD, label: 'Cash on delivery' },
  ];
  for (const row of families) {
    await prisma.paymentMethod.upsert({
      where: { family: row.family },
      update: { label: row.label, active: true },
      create: { id: uuidv7(), family: row.family, label: row.label, active: true },
    });
  }

  await upsertGateway(prisma, {
    code: 'MOCK_PRIMARY',
    name: 'Sandbox primary (TEST ONLY)',
    priority: 10,
    methodsCsv: 'CARD,BANK_TRANSFER,LOCAL_BANK,WALLET,MOBILE_PAYMENT,COD',
  });
  await upsertGateway(prisma, {
    code: 'MOCK_FALLBACK',
    name: 'Sandbox fallback (TEST ONLY)',
    priority: 20,
    methodsCsv: 'CARD,BANK_TRANSFER,WALLET,COD',
  });
}

async function upsertGateway(
  prisma: PrismaService,
  input: { code: string; name: string; priority: number; methodsCsv: string },
) {
  const existing = await prisma.paymentGateway.findUnique({ where: { code: input.code } });
  const id = existing?.id ?? uuidv7();
  await prisma.paymentGateway.upsert({
    where: { code: input.code },
    update: { active: true, environment: 'sandbox', priority: input.priority, healthScore: 100 },
    create: {
      id,
      code: input.code,
      name: input.name,
      environment: 'sandbox',
      active: true,
      priority: input.priority,
      healthScore: 100,
      secretRef: 'env:PAYMENT_MOCK_WEBHOOK_SECRET',
    },
  });
  const gw = await prisma.paymentGateway.findUniqueOrThrow({ where: { code: input.code } });
  const accountCode = `${input.code}_ACCOUNT`;
  const account = await prisma.paymentGatewayAccount.findUnique({ where: { code: accountCode } });
  if (!account) {
    await prisma.paymentGatewayAccount.create({
      data: {
        id: uuidv7(),
        gatewayId: gw.id,
        code: accountCode,
        countriesCsv: '*',
        currenciesCsv: '*',
        methodsCsv: input.methodsCsv,
        active: true,
        environment: 'sandbox',
        secretRef: 'env:PAYMENT_MOCK_WEBHOOK_SECRET',
      },
    });
  }
  for (const name of ['authorize', 'capture', 'void', 'partial_refund', 'refund', '3ds', 'webhooks']) {
    await prisma.paymentGatewayCapability.upsert({
      where: { gatewayId_name: { gatewayId: gw.id, name } },
      update: { enabled: true },
      create: { id: uuidv7(), gatewayId: gw.id, name, enabled: true },
    });
  }
}
