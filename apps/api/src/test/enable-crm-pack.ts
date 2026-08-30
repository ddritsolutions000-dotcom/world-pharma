import type { PrismaService } from '../app/prisma.service';

export async function enableCrmPack(
  prisma: PrismaService,
  countryIso = 'XX',
  policyCache?: { invalidate: (code: string) => Promise<void> },
) {
  const country = await prisma.country.findUnique({ where: { isoAlpha2: countryIso } });
  if (!country) {
    throw new Error(`${countryIso} country seed required`);
  }
  let pack = country.publishedPolicyPackId
    ? await prisma.policyPack.findUnique({ where: { id: country.publishedPolicyPackId } })
    : null;
  if (!pack) {
    pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
  }
  if (!pack) {
    throw new Error(`Published policy pack required for ${countryIso}`);
  }
  const doc = pack.document as Record<string, unknown>;
  const next = {
    ...doc,
    crm: {
      ...((doc.crm as Record<string, unknown> | undefined) ?? {}),
      enabled: true,
      marketing: {
        ...(((doc.crm as Record<string, unknown> | undefined)?.marketing as Record<string, unknown>) ??
          {}),
        enabled: true,
        channels: ['in_app'],
        medicine_advertising: false,
      },
      automation: {
        ...(((doc.crm as Record<string, unknown> | undefined)?.automation as Record<string, unknown>) ??
          {}),
        enabled: true,
        reorder_reminder_days: 1,
      },
    },
  };
  await prisma.policyPack.update({
    where: { id: pack.id },
    data: { document: next },
  });
  if (policyCache) {
    await policyCache.invalidate(countryIso);
  }
  return { countryId: country.id, packId: pack.id };
}
