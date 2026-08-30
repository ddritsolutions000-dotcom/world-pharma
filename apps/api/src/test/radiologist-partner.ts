import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../app/prisma.service';
import { uuidv7 } from '@world-pharma/shared';

export async function attachRadiologist(
  prisma: PrismaService,
  personId: string,
  imagingOrgId: string,
  countryIso = 'XX',
) {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: countryIso } });
  await prisma.partner.create({
    data: {
      id: uuidv7(),
      personId,
      partnerTypeCode: 'RADIOLOGIST',
      countryId: country.id,
      status: 'ACTIVE',
    },
  });
  const role = await prisma.role.findUnique({ where: { code: 'org_staff' } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: 'organization',
      organizationId: imagingOrgId,
      status: 'ACTIVE',
    },
  });
}
