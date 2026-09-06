import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const ident = await p.accountIdentifier.findFirst({
    where: { valueNormalized: 'sandbox-customer@dev.local' },
  });
  if (!ident) throw new Error('no customer');
  const addrs = await p.customerAddress.findMany({ where: { customerPersonId: ident.personId }, take: 8 });
  console.log(
    'addrs',
    addrs.map((a) => ({ id: a.id, city: a.city, countryId: a.countryId, postal: a.postalCode })),
  );
  const locs = await p.location.findMany({
    where: { kind: 'IMAGING' },
    take: 8,
    include: { organization: true },
  });
  console.log(
    'imaging locs',
    locs.map((l) => ({ id: l.id, org: l.organization?.legalName, orgId: l.organizationId })),
  );
  const offers = await p.catalogOffer.findMany({
    where: {
      status: 'PUBLISHED',
      variant: { item: { slug: { in: ['demo-lipid-panel', 'demo-chest-xray'] } } },
    },
    take: 12,
    include: { variant: { include: { item: true } }, country: true },
  });
  console.log(
    'offers',
    offers.map((o) => ({ id: o.id, slug: o.variant?.item?.slug, cc: o.country?.isoAlpha2 })),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
