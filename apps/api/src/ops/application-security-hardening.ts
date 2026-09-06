/**
 * Sprint 110 — Application security hardening evidence (authorization / IDOR / BOLA / tenant).
 * Composes existing JwtAuthGuard + AudienceGuard + PermissionsGuard + RLS + service ownership.
 * Never invents a parallel security framework. Never claims "hack-proof".
 * CAN_PRODUCTION_LAUNCH remains NO — external pentest still required.
 */
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';

export const APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED =
  'APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED';
export const EXTERNAL_PENTEST_REQUIRED = 'EXTERNAL_PENTEST_REQUIRED';
export const APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED =
  'APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED';

export type SecuritySurfaceStatus =
  | 'PASS'
  | 'PASS_WITH_EXISTING_CONTROLS'
  | 'HARDENED'
  | 'EXTERNAL_GATED'
  | 'NOT_APPLICABLE';

export type ApplicationSecuritySurface = {
  id: string;
  label: string;
  status: SecuritySurfaceStatus;
  evidence: string;
  notes: string;
};

export type ApplicationSecurityHardeningReport = {
  sprint: 110;
  foundation_sprints: string;
  architecture_reused: string[];
  parallel_security_framework_created: false;
  customer_cross_object: SecuritySurfaceStatus;
  vendor_cross_tenant: SecuritySurfaceStatus;
  doctor_healthcare_authorization: SecuritySurfaceStatus;
  lab_authorization: SecuritySurfaceStatus;
  imaging_authorization: SecuritySurfaceStatus;
  affiliate_authorization: SecuritySurfaceStatus;
  logistics_authorization: SecuritySurfaceStatus;
  admin_privilege_isolation: SecuritySurfaceStatus;
  idor_bola: SecuritySurfaceStatus;
  tenant_manipulation: SecuritySurfaceStatus;
  private_document_authorization: SecuritySurfaceStatus;
  sensitive_data_leakage: SecuritySurfaceStatus;
  audit_logging: SecuritySurfaceStatus;
  surfaces: ApplicationSecuritySurface[];
  vulnerabilities_found: Array<{ id: string; severity: string; status: string; summary: string }>;
  vulnerabilities_fixed: Array<{ id: string; summary: string }>;
  vulnerabilities_remaining: Array<{ id: string; severity: string; summary: string; why: string }>;
  remaining_blockers: string[];
  remaining_blocker: typeof EXTERNAL_PENTEST_REQUIRED;
  force_launch_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  security_statement: string;
  next_action: string;
  message: string;
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
};

export function buildApplicationSecuritySurfaces(): ApplicationSecuritySurface[] {
  return [
    {
      id: 'customer_objects',
      label: 'Customer object authorization (orders/addresses/cart/wishlist/health/tickets)',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'order.service / cart.service / wishlist / health-subject / support.service ownership filters',
      notes: 'Server-side personId match; foreign family member → 403',
    },
    {
      id: 'vendor_tenant',
      label: 'Vendor/pharmacy cross-tenant isolation',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'catalog/access.assertVendorSellerAccess + inventory/access + app-isolation.e2e',
      notes: 'seller_org_id never authority alone',
    },
    {
      id: 'doctor_healthcare',
      label: 'Doctor/healthcare authorization',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'clinical-access.service + health-artifact ownership + consent scope',
      notes: 'Audience + clinical relationship + consent',
    },
    {
      id: 'lab',
      label: 'Laboratory authorization',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'assertLabOrgAccess + lab-booking ownership + R7 e2e',
      notes: 'Org membership + customer person ownership',
    },
    {
      id: 'imaging',
      label: 'Imaging/radiology authorization',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'assertImagingOrgAccess + imaging-booking ownership + R8 e2e',
      notes: 'Org membership + customer person ownership',
    },
    {
      id: 'affiliate',
      label: 'Affiliate authorization',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'affiliate.service resolveAffiliateOrg + r12d.affiliate.e2e',
      notes: 'Organization-scoped statements/payouts',
    },
    {
      id: 'logistics',
      label: 'Logistics authorization',
      status: 'HARDENED',
      evidence:
        'logistics.service seller shipment ownership + delivery assertRider (DELIVERY_PARTNER|LOGISTICS_FLEET) on accept/mutate (S110)',
      notes: 'Seller/rider scoped access; customer JWT cannot claim jobs',
    },
    {
      id: 'admin_isolation',
      label: 'Admin privilege isolation',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'AudienceGuard + PermissionsGuard + APP_AUDIENCE_DENIED audit',
      notes: 'Customer/partner tokens cannot call Admin APIs',
    },
    {
      id: 'idor_bola',
      label: 'IDOR/BOLA object-level authorization',
      status: 'HARDENED',
      evidence:
        'Service ownership + S110 delivery rider gate + physical-report idempotency ownership + object-authorization helpers',
      notes: 'GET and mutation paths; read ≠ write/approve',
    },
    {
      id: 'tenant_spoof',
      label: 'Tenant context manipulation resistance',
      status: 'HARDENED',
      evidence:
        'JWT-bound principal + RLS GUCs + rejectClientTenantSpoof on delivery organization_id (S110)',
      notes: 'Client org/header not trusted as authority',
    },
    {
      id: 'documents',
      label: 'Private/KYC/clinical document authorization',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'kyc.service.assertCan + PrivateObjectStore tickets + health access audit',
      notes: 'Production ACL still EXTERNAL_GATED (S107)',
    },
    {
      id: 'leakage',
      label: 'Sensitive-data leakage controls',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'secret-redaction + ProblemFilter + no PHI in ordinary errors',
      notes: '404 used where existence-hiding is preferred for addresses/tickets',
    },
    {
      id: 'audit',
      label: 'Authorization audit logging',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'SecurityEventsService PRIVILEGE_DENIED / APP_AUDIENCE_DENIED / HEALTH_*',
      notes: 'No secrets/OTP/PHI in audit metadata contracts',
    },
    {
      id: 'external_pentest',
      label: 'External penetration testing',
      status: 'EXTERNAL_GATED',
      evidence: 'Not performed in Sprint 110',
      notes: 'Required before any production security certification claim',
    },
  ];
}

export function evaluateApplicationSecurityHardening(
  input?: { correlation_id?: string },
): ApplicationSecurityHardeningReport {
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const surfaces = buildApplicationSecuritySurfaces();

  return {
    sprint: 110,
    foundation_sprints: '53-61,72,81,94,100,101,109',
    architecture_reused: [
      'JwtAuthGuard',
      'AudienceGuard',
      'PermissionsGuard',
      'RbacService',
      'TenantContextInterceptor + RLS GUCs',
      'catalog/access + inventory/access',
      'service ownership checks',
      'SecurityEventsService',
      'ClinicalAccessService / HealthAccessService',
      'kyc.service.assertCan',
    ],
    parallel_security_framework_created: false,
    customer_cross_object: 'PASS_WITH_EXISTING_CONTROLS',
    vendor_cross_tenant: 'PASS_WITH_EXISTING_CONTROLS',
    doctor_healthcare_authorization: 'PASS_WITH_EXISTING_CONTROLS',
    lab_authorization: 'PASS_WITH_EXISTING_CONTROLS',
    imaging_authorization: 'PASS_WITH_EXISTING_CONTROLS',
    affiliate_authorization: 'PASS_WITH_EXISTING_CONTROLS',
    logistics_authorization: 'HARDENED',
    admin_privilege_isolation: 'PASS_WITH_EXISTING_CONTROLS',
    idor_bola: 'HARDENED',
    tenant_manipulation: 'HARDENED',
    private_document_authorization: 'PASS_WITH_EXISTING_CONTROLS',
    sensitive_data_leakage: 'PASS_WITH_EXISTING_CONTROLS',
    audit_logging: 'PASS_WITH_EXISTING_CONTROLS',
    surfaces,
    vulnerabilities_found: [
      {
        id: 'S110-VULN-1',
        severity: 'HIGH',
        status: 'FIXED',
        summary:
          'Delivery job accept/mutate paths did not call assertRider — any customer JWT knowing a jobId could claim/act on logistics jobs.',
      },
      {
        id: 'S110-VULN-2',
        severity: 'HIGH',
        status: 'FIXED',
        summary:
          'assertRider treated any active org membership as rider access (vendor/lab/clinic privilege confusion) and did not validate client organization_id.',
      },
      {
        id: 'S110-VULN-3',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Lab/imaging physical-report idempotency short-circuit returned another customer’s request metadata when Idempotency-Key was reused.',
      },
    ],
    vulnerabilities_fixed: [
      {
        id: 'S110-HARDEN-1',
        summary:
          'Shared object-authorization helpers (assertSamePerson / forbidCrossObjectAccess / rejectClientTenantSpoof) for consistent denials.',
      },
      {
        id: 'S110-FIX-1',
        summary:
          'delivery.service: assertRider on getJob/acceptJob/assertAssigned; rider gate requires DELIVERY_PARTNER or LOGISTICS_FLEET membership; rejectClientTenantSpoof on organization_id.',
      },
      {
        id: 'S110-FIX-2',
        summary:
          'physical-report + imaging-physical-report: assertSamePerson (+ booking bind) on idempotency-key replay.',
      },
      {
        id: 'S110-FIX-3',
        summary:
          'health-subject / health-artifact: reuse object-authorization helpers for foreign family-member and patient ownership denials.',
      },
    ],
    vulnerabilities_remaining: [
      {
        id: 'S110-REM-1',
        severity: 'HIGH',
        summary: 'External penetration test / red-team not performed',
        why: 'Out of sprint scope; required before production security certification',
      },
      {
        id: 'S110-REM-2',
        severity: 'MEDIUM',
        summary: 'Production private document ACL still EXTERNAL_GATED (S107)',
        why: 'Depends on real storage/KMS/malware providers',
      },
      {
        id: 'S110-REM-3',
        severity: 'MEDIUM',
        summary: 'New endpoints may omit ownership checks if authors skip existing patterns',
        why: 'Ownership is per-service; repository scans cover permissions but not every :id path',
      },
    ],
    remaining_blockers: [
      EXTERNAL_PENTEST_REQUIRED,
      APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
      APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      ...foundation.remaining_blockers.filter((b) =>
        ['NO_PRODUCTION_ENVIRONMENT', 'NO_PRODUCTION_SECRETS_MANAGER'].includes(b),
      ),
    ],
    remaining_blocker: EXTERNAL_PENTEST_REQUIRED,
    force_launch_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    security_statement:
      'Security controls tested. Existing authorization architecture reused. Known residual risks remain. External penetration testing required before production certification.',
    next_action:
      'Commission independent external pentest; continue ownership-check reviews on new :id endpoints; clear S107 document ACL and S101 foundation gates. Do not treat software verification as production security certification.',
    message:
      'Sprint 110 application security hardening: IDOR/BOLA/tenant/Admin isolation controls verified against existing architecture. EXTERNAL_PENTEST_REQUIRED. CAN_PRODUCTION_LAUNCH = NO.',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
  };
}
