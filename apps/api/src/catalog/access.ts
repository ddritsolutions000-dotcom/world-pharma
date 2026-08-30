import { MembershipScope, OrganizationKind, OrganizationStatus } from '@prisma/client';
import type { Principal } from '../identity/current-principal';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { COMPANY_ROLE_CODES } from '../identity/authority';

export async function orgIdsForPerson(prisma: PrismaService, personId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { personId, status: 'ACTIVE', deletedAt: null, organizationId: { not: null } },
    select: { organizationId: true },
  });
  return [...new Set(rows.map((row) => row.organizationId).filter((id): id is string => Boolean(id)))];
}

export async function isPlatformOperator(prisma: PrismaService, personId: string): Promise<boolean> {
  const count = await prisma.membership.count({
    where: {
      personId,
      status: 'ACTIVE',
      deletedAt: null,
      scope: { in: [MembershipScope.platform, MembershipScope.country] },
      role: { code: { in: [...COMPANY_ROLE_CODES] } },
    },
  });
  return count > 0;
}

/** Vendor surfaces may only target OrganizationKind.VENDOR (client org id is never authority alone). */
export async function assertVendorOrganization(prisma: PrismaService, organizationId: string): Promise<void> {
  const org = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      kind: OrganizationKind.VENDOR,
      status: { in: [OrganizationStatus.ACTIVE, OrganizationStatus.DRAFT, OrganizationStatus.SUSPENDED] },
    },
    select: { id: true },
  });
  if (!org) {
    throw Errors.forbidden('Organization is not a vendor seller.');
  }
}

export async function assertCanManageSeller(
  prisma: PrismaService,
  principal: Principal,
  sellerOrgId: string,
): Promise<void> {
  if (await isPlatformOperator(prisma, principal.personId)) {
    return;
  }
  const allowed = await prisma.membership.count({
    where: {
      personId: principal.personId,
      organizationId: sellerOrgId,
      status: 'ACTIVE',
      deletedAt: null,
    },
  });
  if (!allowed) {
    throw Errors.forbidden('You cannot manage another organization’s catalog.');
  }
}

/** Membership + VENDOR kind — for `/vendor/*` seller-scoped operations. */
export async function assertVendorSellerAccess(
  prisma: PrismaService,
  principal: Principal,
  sellerOrgId: string,
): Promise<void> {
  await assertVendorOrganization(prisma, sellerOrgId);
  await assertCanManageSeller(prisma, principal, sellerOrgId);
}

/** Lab surfaces may only target OrganizationKind.LAB (client org id is never authority alone). */
export async function assertLabOrganization(prisma: PrismaService, organizationId: string): Promise<void> {
  const org = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      kind: OrganizationKind.LAB,
      status: { in: [OrganizationStatus.ACTIVE, OrganizationStatus.DRAFT, OrganizationStatus.SUSPENDED] },
    },
    select: { id: true },
  });
  if (!org) {
    throw Errors.forbidden('Organization is not a laboratory.');
  }
}

/** Membership + LAB kind — for `/lab/*` lab-scoped operations. */
export async function assertLabOrgAccess(
  prisma: PrismaService,
  principal: Principal,
  labOrgId: string,
): Promise<void> {
  await assertLabOrganization(prisma, labOrgId);
  await assertCanManageSeller(prisma, principal, labOrgId);
}

/** Imaging surfaces may only target OrganizationKind.IMAGING_CENTER. */
export async function assertImagingOrganization(prisma: PrismaService, organizationId: string): Promise<void> {
  const org = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      kind: OrganizationKind.IMAGING_CENTER,
      status: { in: [OrganizationStatus.ACTIVE, OrganizationStatus.DRAFT, OrganizationStatus.SUSPENDED] },
    },
    select: { id: true },
  });
  if (!org) {
    throw Errors.forbidden('Organization is not an imaging center.');
  }
}

/** Membership + IMAGING_CENTER kind — for `/radiology/*` imaging-scoped operations. */
export async function assertImagingOrgAccess(
  prisma: PrismaService,
  principal: Principal,
  imagingOrgId: string,
): Promise<void> {
  await assertImagingOrganization(prisma, imagingOrgId);
  await assertCanManageSeller(prisma, principal, imagingOrgId);
}

export async function assertCanReadDraft(
  prisma: PrismaService,
  principal: Principal | undefined,
  createdByOrgId: string | null,
): Promise<void> {
  if (!principal) {
    throw Errors.forbidden();
  }
  if (await isPlatformOperator(prisma, principal.personId)) {
    return;
  }
  if (!createdByOrgId) {
    throw Errors.forbidden();
  }
  await assertCanManageSeller(prisma, principal, createdByOrgId);
}
