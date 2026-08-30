import { LocationKind } from '@prisma/client';
import type { Principal } from '../identity/current-principal';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { isPlatformOperator } from '../catalog/access';

export const INVENTORY_LOCATION_KINDS: LocationKind[] = [
  LocationKind.STORE,
  LocationKind.WAREHOUSE,
  LocationKind.VENDOR_WAREHOUSE,
];

export async function locationScopeIds(prisma: PrismaService, personId: string): Promise<string[] | null> {
  const rows = await prisma.membership.findMany({
    where: { personId, status: 'ACTIVE', deletedAt: null, locationId: { not: null } },
    select: { locationId: true },
  });
  const ids = [...new Set(rows.map((row) => row.locationId).filter((id): id is string => Boolean(id)))];
  return ids.length ? ids : null;
}

export async function assertInventoryOwner(
  prisma: PrismaService,
  principal: Principal,
  ownerOrgId: string,
  locationId?: string,
): Promise<void> {
  if (await isPlatformOperator(prisma, principal.personId)) {
    return;
  }
  const allowed = await prisma.membership.count({
    where: {
      personId: principal.personId,
      organizationId: ownerOrgId,
      status: 'ACTIVE',
      deletedAt: null,
    },
  });
  if (!allowed) {
    throw Errors.forbidden('You cannot access another organization’s inventory.');
  }
  if (locationId) {
    const scoped = await locationScopeIds(prisma, principal.personId);
    if (scoped && !scoped.includes(locationId)) {
      throw Errors.forbidden('You cannot access this location.');
    }
  }
}

export async function requireInventoryLocation(prisma: PrismaService, locationId: string, ownerOrgId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || !location.isActive) {
    throw Errors.notFound('Location not found.');
  }
  if (location.organizationId !== ownerOrgId) {
    throw Errors.validation('Location does not belong to the owning organization.');
  }
  if (!INVENTORY_LOCATION_KINDS.includes(location.kind)) {
    throw Errors.validation('Location kind cannot hold inventory.');
  }
  return location;
}

export { isPlatformOperator };
