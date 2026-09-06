import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const labs = await p.organization.findMany({
    where: { kind: 'LAB', legalName: 'Demo Diagnostics Lab' },
    include: { country: true },
  });
  console.log(
    'labs',
    labs.map((l) => ({ id: l.id, cc: l.country.isoAlpha2, status: l.status })),
  );
  const imaging = await p.organization.findMany({
    where: { kind: 'IMAGING_CENTER', legalName: 'Demo Imaging Center' },
    include: { country: true },
  });
  console.log(
    'imaging',
    imaging.map((l) => ({ id: l.id, cc: l.country.isoAlpha2, status: l.status })),
  );
  const labPerson = await p.accountIdentifier.findFirst({
    where: { valueNormalized: 'sandbox-lab@dev.local' },
  });
  const memberships = await p.organizationMembership.findMany({
    where: { personId: labPerson!.personId },
    include: { organization: { include: { country: true } } },
  });
  console.log(
    'lab memberships',
    memberships.map((m) => ({
      org: m.organization.legalName,
      cc: m.organization.country.isoAlpha2,
      role: m.roleCode,
    })),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
