import { Injectable, OnModuleInit } from '@nestjs/common';
import { MembershipScope } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import {
  COMPANY_ROLE_CODES,
  ORG_ROLE_CODES,
  isCompanyMembershipScope,
  isCompanyOnlyPermission,
  isCompanyRole,
  permissionsForCompanyRole,
  permissionsForOrgRole,
} from './authority';

const SYSTEM_ROLES = [
  { code: 'super_admin', name: 'Super admin' },
  { code: 'global_admin', name: 'Global admin' },
  { code: 'company_admin', name: 'Company admin' },
  { code: 'company_finance', name: 'Company finance' },
  { code: 'company_compliance', name: 'Company compliance' },
  { code: 'company_security', name: 'Company security' },
  { code: 'company_operations', name: 'Company operations' },
  { code: 'company_support', name: 'Company support' },
  { code: 'org_owner', name: 'Organization owner' },
  { code: 'org_admin', name: 'Organization admin' },
  { code: 'org_manager', name: 'Organization manager' },
  { code: 'org_staff', name: 'Organization staff' },
  { code: 'org_finance', name: 'Organization finance' },
  { code: 'org_operations', name: 'Organization operations' },
  { code: 'clinic_doctor', name: 'Clinic doctor' },
  { code: 'hospital_doctor', name: 'Hospital doctor' },
  { code: 'independent_doctor', name: 'Independent doctor' },
] as const;

const SYSTEM_PERMISSIONS = [
  'user:read',
  'session:revoke',
  'identity:audit_read',
  'policy:read',
  'policy:publish',
  'partner:manage',
  'kyc:review',
  'kyc:document_read',
  'catalog:read',
  'catalog:write',
  'catalog:admin',
  'pricing:admin',
  'inventory:read',
  'inventory:adjust',
  'inventory:receive',
  'inventory:transfer',
  'inventory:admin',
  'payment:read',
  'payment:refund',
  'payment:admin',
  'payment:reconcile',
  'order:read',
  'order:manage',
  'order:cancel',
  'order:fulfill',
  'order:admin',
  'logistics:read',
  'logistics:manage',
  'logistics:admin',
  'logistics:reconcile',
  'finance:read',
  'finance:post',
  'finance:approve',
  'finance:settle',
  'finance:reconcile',
  'finance:admin',
  'doctor:review',
  'consent:manage',
  'clinical:audit:read',
  'clinical:search',
  'care_nav:audit:read',
  'care_nav:override',
  'cms:read',
  'cms:write',
  'cms:review',
  'cms:publish',
  'support:read',
  'support:manage',
  'crm:read',
  'crm:write',
  'campaign:read',
  'campaign:send',
  'promo:read',
  'promo:manage',
  'affiliate:read',
  'affiliate:manage',
  'loyalty:read',
  'loyalty:manage',
  'review:moderate',
  'search:admin',
  'analytics:read',
  'clinical:access:evaluate',
  'appointment:read',
  'appointment:manage',
  'video:read',
  'video:manage',
  'prescription:read',
  'rbac:grant_company',
  'security:break_glass',
] as const;

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCatalog();
  }

  async ensureCatalog(): Promise<void> {
    await this.prisma.permission.createMany({
      data: SYSTEM_PERMISSIONS.map((code) => ({ id: uuidv7(), code })),
      skipDuplicates: true,
    });
    await this.prisma.role.createMany({
      data: SYSTEM_ROLES.map((role) => ({
        id: uuidv7(),
        code: role.code,
        name: role.name,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: [...SYSTEM_PERMISSIONS] } },
    });
    const permissionByCode = new Map(permissions.map((row) => [row.code, row]));
    const roles = await this.prisma.role.findMany({
      where: { code: { in: SYSTEM_ROLES.map((r) => r.code) } },
    });

    await this.prisma.rolePermission.deleteMany({
      where: { role: { code: { in: [...ORG_ROLE_CODES] } } },
    });

    const assignments: { roleId: string; permissionId: string }[] = [];
    for (const role of roles) {
      const codes = isCompanyRole(role.code)
        ? permissionsForCompanyRole(role.code, [...SYSTEM_PERMISSIONS])
        : permissionsForOrgRole(role.code);
      for (const code of codes) {
        const permission = permissionByCode.get(code);
        if (permission) {
          assignments.push({ roleId: role.id, permissionId: permission.id });
        }
      }
    }
    if (assignments.length) {
      await this.prisma.rolePermission.createMany({ data: assignments, skipDuplicates: true });
    }
  }

  async permissionsForPerson(personId: string): Promise<{
    roles: string[];
    permissions: string[];
    membershipId?: string;
  }> {
    const memberships = await this.prisma.membership.findMany({
      where: { personId, status: 'ACTIVE', deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const roles: string[] = [];
    const permissionSet = new Set<string>();
    for (const membership of memberships) {
      const code = membership.role.code;
      if (isCompanyRole(code)) {
        if (!isCompanyMembershipScope(membership.scope)) {
          continue;
        }
        roles.push(code);
        for (const binding of membership.role.permissions) {
          permissionSet.add(binding.permission.code);
        }
        continue;
      }
      roles.push(code);
      for (const binding of membership.role.permissions) {
        if (!isCompanyOnlyPermission(binding.permission.code)) {
          permissionSet.add(binding.permission.code);
        }
      }
    }
    const now = new Date();
    const breakGlass = await this.prisma.breakGlassGrant.findMany({
      where: { personId, revokedAt: null, expiresAt: { gt: now } },
    });
    for (const grant of breakGlass) {
      const extra = Array.isArray(grant.permissions) ? (grant.permissions as string[]) : [];
      for (const code of extra) {
        permissionSet.add(code);
      }
    }
    return {
      roles: [...new Set(roles)],
      permissions: [...permissionSet],
      membershipId: memberships[0]?.id,
    };
  }

  async hasPermission(personId: string, permission: string): Promise<boolean> {
    const { permissions } = await this.permissionsForPerson(personId);
    return permissions.includes(permission);
  }

  async hasCompanyAuthority(personId: string): Promise<boolean> {
    const count = await this.prisma.membership.count({
      where: {
        personId,
        status: 'ACTIVE',
        deletedAt: null,
        scope: {
          in: [
            MembershipScope.platform,
            MembershipScope.region,
            MembershipScope.country,
            MembershipScope.legal_entity,
          ],
        },
        role: { code: { in: [...COMPANY_ROLE_CODES] } },
      },
    });
    return count > 0;
  }
}
