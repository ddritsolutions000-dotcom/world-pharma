import { MembershipScope } from '@prisma/client';

/** Company-owned platform roles. Never assigned by partner Join, org admin, or public signup. */
export const COMPANY_ROLE_CODES = [
  'super_admin',
  'global_admin',
  'company_admin',
  'company_finance',
  'company_compliance',
  'company_security',
  'company_operations',
  'company_support',
] as const;

export const ORG_ROLE_CODES = [
  'org_owner',
  'org_admin',
  'org_manager',
  'org_staff',
  'org_finance',
  'org_operations',
  'clinic_doctor',
  'hospital_doctor',
  'independent_doctor',
] as const;

export const COMPANY_ONLY_PERMISSIONS = [
  'session:revoke',
  'identity:audit_read',
  'policy:publish',
  'partner:manage',
  'kyc:review',
  'kyc:document_read',
  'catalog:admin',
  'pricing:admin',
  'inventory:admin',
  'payment:admin',
  'payment:reconcile',
  'payment:refund',
  'order:admin',
  'logistics:admin',
  'logistics:reconcile',
  'finance:post',
  'finance:approve',
  'finance:settle',
  'finance:reconcile',
  'finance:admin',
  'doctor:review',
  'consent:manage',
  'clinical:audit:read',
  'clinical:access:evaluate',
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
  'video:manage',
  'prescription:read',
  'rbac:grant_company',
  'security:break_glass',
] as const;

/** Org-scoped operational permissions. Never includes company policy/finance/payment-admin/clinical payload. */
export const ORG_SAFE_PERMISSIONS = [
  'user:read',
  'policy:read',
  'catalog:read',
  'catalog:write',
  'inventory:read',
  'inventory:adjust',
  'inventory:receive',
  'inventory:transfer',
  'order:read',
  'order:manage',
  'order:cancel',
  'order:fulfill',
  'logistics:read',
  'logistics:manage',
  'appointment:read',
  'appointment:manage',
] as const;

export const SENSITIVE_CLINICAL_PERMISSIONS = [
  'kyc:document_read',
  'clinical:access:evaluate',
  'clinical:search',
  'consent:manage',
  'video:manage',
] as const;

export const DUAL_CONTROL_COMPANY_ROLES = ['super_admin', 'global_admin'] as const;

const COMPANY_ROLE_SET = new Set<string>(COMPANY_ROLE_CODES);
const ORG_ROLE_SET = new Set<string>(ORG_ROLE_CODES);
const COMPANY_ONLY_SET = new Set<string>(COMPANY_ONLY_PERMISSIONS);
const COMPANY_SCOPES = new Set<MembershipScope>([
  MembershipScope.platform,
  MembershipScope.region,
  MembershipScope.country,
  MembershipScope.legal_entity,
]);

export function isCompanyRole(code: string): boolean {
  return COMPANY_ROLE_SET.has(code);
}

export function isOrgRole(code: string): boolean {
  return ORG_ROLE_SET.has(code);
}

export function isCompanyOnlyPermission(code: string): boolean {
  return COMPANY_ONLY_SET.has(code);
}

export function isCompanyMembershipScope(scope: MembershipScope): boolean {
  return COMPANY_SCOPES.has(scope);
}

export type CompanyGovernanceLevel =
  | 'global_company'
  | 'region'
  | 'country'
  | 'legal_entity'
  | 'business_unit'
  | 'organization'
  | 'location'
  | 'self'
  | 'none';

/** Maps membership scope to company hierarchy. Business unit is configuration, not a membership scope yet. */
export function companyGovernanceLevel(input: {
  isCompany: boolean;
  scope?: MembershipScope | string;
}): CompanyGovernanceLevel {
  if (!input.scope) {
    return 'none';
  }
  if (input.scope === MembershipScope.platform) {
    return input.isCompany ? 'global_company' : 'none';
  }
  if (input.scope === MembershipScope.region) {
    return 'region';
  }
  if (input.scope === MembershipScope.country) {
    return 'country';
  }
  if (input.scope === MembershipScope.legal_entity) {
    return 'legal_entity';
  }
  if (input.scope === MembershipScope.organization) {
    return 'organization';
  }
  if (input.scope === MembershipScope.location) {
    return 'location';
  }
  if (input.scope === MembershipScope.self) {
    return 'self';
  }
  return 'none';
}

export function permissionsForCompanyRole(roleCode: string, allPermissions: string[]): string[] {
  if (roleCode === 'super_admin' || roleCode === 'global_admin') {
    return allPermissions;
  }
  if (roleCode === 'company_admin') {
    return allPermissions.filter(
      (code) =>
        !SENSITIVE_CLINICAL_PERMISSIONS.includes(code as (typeof SENSITIVE_CLINICAL_PERMISSIONS)[number]) &&
        code !== 'finance:approve' &&
        code !== 'finance:settle' &&
        code !== 'finance:admin' &&
        code !== 'payment:admin',
    );
  }
  if (roleCode === 'company_finance') {
    return [
      'user:read',
      'policy:read',
      'finance:read',
      'finance:post',
      'finance:approve',
      'finance:settle',
      'finance:reconcile',
      'finance:admin',
      'payment:read',
      'payment:refund',
      'payment:reconcile',
      'payment:admin',
      'order:read',
      'identity:audit_read',
      'promo:read',
      'promo:manage',
      'affiliate:read',
    ];
  }
  if (roleCode === 'company_compliance') {
    return [
      'user:read',
      'policy:read',
      'policy:publish',
      'partner:manage',
      'kyc:review',
      'kyc:document_read',
      'identity:audit_read',
      'consent:manage',
      'clinical:audit:read',
      'care_nav:audit:read',
      'care_nav:override',
      'prescription:read',
      'cms:read',
      'cms:review',
      'cms:publish',
    ];
  }
  if (roleCode === 'company_security') {
    return [
      'user:read',
      'session:revoke',
      'identity:audit_read',
      'rbac:grant_company',
      'security:break_glass',
      'policy:read',
    ];
  }
  if (roleCode === 'company_operations') {
    return [
      'user:read',
      'policy:read',
      'partner:manage',
      'catalog:read',
      'catalog:write',
      'catalog:admin',
      'inventory:read',
      'inventory:adjust',
      'inventory:receive',
      'inventory:transfer',
      'inventory:admin',
      'order:read',
      'order:manage',
      'order:cancel',
      'order:fulfill',
      'order:admin',
      'logistics:read',
      'logistics:manage',
      'logistics:admin',
      'appointment:read',
      'appointment:manage',
      'doctor:review',
      'care_nav:audit:read',
      'prescription:read',
      'cms:read',
      'cms:write',
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
    ];
  }
  if (roleCode === 'company_support') {
    return [
      'user:read',
      'order:read',
      'appointment:read',
      'logistics:read',
      'support:read',
      'support:manage',
      'crm:read',
      'promo:read',
      'affiliate:read',
    ];
  }
  return [];
}

export function permissionsForOrgRole(roleCode: string): string[] {
  if (roleCode === 'org_owner' || roleCode === 'org_admin') {
    return [...ORG_SAFE_PERMISSIONS];
  }
  if (roleCode === 'org_manager' || roleCode === 'org_operations') {
    return ORG_SAFE_PERMISSIONS.filter((code) => code !== 'catalog:write');
  }
  if (roleCode === 'org_finance') {
    return ['user:read', 'policy:read', 'catalog:read', 'order:read', 'inventory:read'];
  }
  if (roleCode === 'org_staff') {
    return ['user:read', 'catalog:read', 'order:read', 'inventory:read', 'appointment:read'];
  }
  if (roleCode === 'clinic_doctor' || roleCode === 'hospital_doctor' || roleCode === 'independent_doctor') {
    return ['user:read', 'appointment:read', 'appointment:manage', 'clinical:search'];
  }
  return ['user:read'];
}
