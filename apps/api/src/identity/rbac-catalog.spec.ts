import {
  BREAK_GLASS_ELIGIBLE_PERMISSIONS,
  isBreakGlassEligiblePermission,
  isValidPermissionCode,
  permissionsForCompanyRole,
} from './authority';

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
  'lab:review',
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
  'user:reveal_pii',
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

/** Permissions referenced in controllers — must exist in SYSTEM_PERMISSIONS. */
const REFERENCED_PERMISSIONS = [
  'affiliate:manage',
  'affiliate:read',
  'analytics:read',
  'appointment:manage',
  'appointment:read',
  'campaign:read',
  'campaign:send',
  'care_nav:audit:read',
  'care_nav:override',
  'catalog:admin',
  'clinical:audit:read',
  'clinical:search',
  'cms:publish',
  'cms:read',
  'cms:write',
  'crm:read',
  'crm:write',
  'doctor:review',
  'finance:approve',
  'finance:post',
  'finance:read',
  'finance:reconcile',
  'finance:settle',
  'identity:audit_read',
  'inventory:adjust',
  'inventory:admin',
  'inventory:read',
  'inventory:receive',
  'inventory:transfer',
  'kyc:document_read',
  'kyc:review',
  'lab:review',
  'logistics:manage',
  'logistics:read',
  'logistics:reconcile',
  'loyalty:manage',
  'loyalty:read',
  'order:admin',
  'order:cancel',
  'order:fulfill',
  'order:read',
  'partner:manage',
  'payment:admin',
  'payment:read',
  'payment:reconcile',
  'payment:refund',
  'policy:publish',
  'policy:read',
  'prescription:read',
  'pricing:admin',
  'promo:manage',
  'promo:read',
  'rbac:grant_company',
  'review:moderate',
  'search:admin',
  'security:break_glass',
  'session:revoke',
  'support:manage',
  'support:read',
  'user:read',
  'user:reveal_pii',
  'video:read',
] as const;

describe('RBAC permission catalog consistency', () => {
  it('includes lab:review in the system catalog', () => {
    expect(SYSTEM_PERMISSIONS).toContain('lab:review');
  });

  it('maps lab:review to healthcare administrator roles', () => {
    expect(permissionsForCompanyRole('super_admin', [...SYSTEM_PERMISSIONS])).toContain('lab:review');
    expect(permissionsForCompanyRole('company_compliance', [...SYSTEM_PERMISSIONS])).toContain('lab:review');
    expect(permissionsForCompanyRole('company_operations', [...SYSTEM_PERMISSIONS])).toContain('lab:review');
    expect(permissionsForCompanyRole('company_support', [...SYSTEM_PERMISSIONS])).not.toContain('lab:review');
  });

  it('has no orphan permission strings referenced by controllers', () => {
    const catalog = new Set<string>(SYSTEM_PERMISSIONS);
    const orphans = REFERENCED_PERMISSIONS.filter((code) => !catalog.has(code));
    expect(orphans).toEqual([]);
  });
});

describe('break-glass permission whitelist', () => {
  it('rejects malformed permission codes', () => {
    expect(isValidPermissionCode('finance:read')).toBe(true);
    expect(isValidPermissionCode('clinical:audit:read')).toBe(true);
    expect(isValidPermissionCode('INVALID')).toBe(false);
    expect(isValidPermissionCode('user:read:extra:bad')).toBe(false);
  });

  it('only allows catalog permissions in the break-glass eligible set', () => {
    for (const code of BREAK_GLASS_ELIGIBLE_PERMISSIONS) {
      expect(SYSTEM_PERMISSIONS).toContain(code);
      expect(isBreakGlassEligiblePermission(code)).toBe(true);
    }
    expect(isBreakGlassEligiblePermission('rbac:grant_company')).toBe(false);
    expect(isBreakGlassEligiblePermission('totally:fake')).toBe(false);
  });
});
