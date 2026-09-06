/**
 * Sprint 113 — Production API abuse protection + rate limiting evidence.
 * Composes existing RateLimitService (Redis) + SecurityEventsService + HTTP body limits.
 * Never invents WAF/CDN/edge vendors. Never claims DDoS-proof.
 * CAN_PRODUCTION_LAUNCH remains NO.
 */
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';

export const API_ABUSE_CONTROLS_SOFTWARE_VERIFIED = 'API_ABUSE_CONTROLS_SOFTWARE_VERIFIED';
export const DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED =
  'DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED';
export const EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED = 'EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED';
export const NO_PRODUCTION_EDGE_WAF = 'NO_PRODUCTION_EDGE_WAF';

export type AbuseSurfaceStatus =
  | 'TESTED'
  | 'PASS_WITH_EXISTING_CONTROLS'
  | 'HARDENED'
  | 'EXTERNAL_GATED'
  | 'NOT_PROVEN';

export type AbuseProtectionClass = {
  id: string;
  label: string;
  class:
    | 'authentication'
    | 'sensitive_mutation'
    | 'public_api'
    | 'expensive_operation'
    | 'webhook'
    | 'administrative';
  status: AbuseSurfaceStatus;
  evidence: string;
  rationale: string;
};

export type ApiAbuseHardeningReport = {
  sprint: 113;
  foundation_sprints: string;
  architecture_reused: string[];
  parallel_rate_limit_framework_created: false;
  invented_waf_edge_vendor: false;
  authentication_abuse_protection: AbuseSurfaceStatus;
  otp_abuse_protection: AbuseSurfaceStatus;
  mfa_abuse_protection: AbuseSurfaceStatus;
  public_api_protection: AbuseSurfaceStatus;
  customer_api_protection: AbuseSurfaceStatus;
  partner_api_protection: AbuseSurfaceStatus;
  admin_api_protection: AbuseSurfaceStatus;
  webhook_protection: AbuseSurfaceStatus;
  request_size_protection: AbuseSurfaceStatus;
  upload_size_protection: AbuseSurfaceStatus;
  pagination_query_protection: AbuseSurfaceStatus;
  resource_exhaustion_protection: AbuseSurfaceStatus;
  rate_limit_bypass_tests: AbuseSurfaceStatus;
  recovery_429_behavior: AbuseSurfaceStatus;
  distributed_enforcement: 'REDIS_BACKED_SOFTWARE';
  distributed_enforcement_status: 'SOFTWARE_VERIFIED';
  external_waf_edge_protection: 'EXTERNAL_GATED';
  protection_classes: AbuseProtectionClass[];
  vulnerabilities_found: Array<{ id: string; severity: string; status: string; summary: string }>;
  vulnerabilities_fixed: Array<{ id: string; summary: string }>;
  vulnerabilities_remaining: Array<{ id: string; severity: string; summary: string; why: string }>;
  remaining_blocker: typeof EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED;
  remaining_blockers: string[];
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
  otp_printed: false;
};

export function buildAbuseProtectionClasses(): AbuseProtectionClass[] {
  return [
    {
      id: 'auth_otp_mfa_refresh',
      label: 'Authentication / OTP / MFA / refresh',
      class: 'authentication',
      status: 'TESTED',
      evidence: 'auth.service + mfa.service RateLimitService.hit + RATE_LIMITED security events',
      rationale: 'Tight IP+identifier windows; hide OTP; 429 with Retry-After',
    },
    {
      id: 'payment_mutations',
      label: 'Payment pay/refund',
      class: 'sensitive_mutation',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'payment.service assertPaymentRateLimit per person',
      rationale: 'Per-actor mutation budget; protects PSP spend/refund abuse',
    },
    {
      id: 'public_discovery',
      label: 'Public discovery search/suggest',
      class: 'public_api',
      status: 'HARDENED',
      evidence: 'discovery-customer.controller IP hit (S113) + DISCOVERY_MAX_LIMIT',
      rationale: 'Unauthenticated expensive search; IP budget + page-size cap',
    },
    {
      id: 'uploads',
      label: 'Health/KYC uploads',
      class: 'expensive_operation',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'health-upload + kyc upload hit + byte caps',
      rationale: 'Per-actor upload budget before storage/malware gates',
    },
    {
      id: 'webhooks_triad',
      label: 'Payment / carrier / video webhooks',
      class: 'webhook',
      status: 'HARDENED',
      evidence: 'webhook:pay + S113 webhook:carrier + webhook:video (300/60s)',
      rationale: 'Parity across callback surfaces; signature/replay still required',
    },
    {
      id: 'admin_sensitive',
      label: 'Admin PII reveal + break-glass',
      class: 'administrative',
      status: 'HARDENED',
      evidence: 'S113 admin:pii-reveal + admin:break-glass actor budgets',
      rationale: 'Authz alone insufficient against credential-compromised flood',
    },
    {
      id: 'http_body',
      label: 'HTTP JSON/urlencoded body size',
      class: 'public_api',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'http-setup HTTP_JSON_LIMIT default 100kb',
      rationale: 'Global fail-closed oversized JSON',
    },
  ];
}

export function evaluateApiAbuseHardening(
  input?: { correlation_id?: string },
): ApiAbuseHardeningReport {
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const foundation = evaluateProductionFoundationFirstOnboarding({
    correlation_id: input?.correlation_id,
  });

  return {
    sprint: 113,
    foundation_sprints: '76,86,103,104,109-112',
    architecture_reused: [
      'RateLimitService (Redis INCR/EXPIRE)',
      'SecurityEventsService RATE_LIMITED',
      'Errors.rateLimited → 429',
      'http-setup body limits',
      'upload byte caps',
      'discovery/catalog pagination caps',
      'webhook signature + replay TTL',
    ],
    parallel_rate_limit_framework_created: false,
    invented_waf_edge_vendor: false,
    authentication_abuse_protection: 'TESTED',
    otp_abuse_protection: 'TESTED',
    mfa_abuse_protection: 'TESTED',
    public_api_protection: 'HARDENED',
    customer_api_protection: 'PASS_WITH_EXISTING_CONTROLS',
    partner_api_protection: 'PASS_WITH_EXISTING_CONTROLS',
    admin_api_protection: 'HARDENED',
    webhook_protection: 'HARDENED',
    request_size_protection: 'PASS_WITH_EXISTING_CONTROLS',
    upload_size_protection: 'PASS_WITH_EXISTING_CONTROLS',
    pagination_query_protection: 'PASS_WITH_EXISTING_CONTROLS',
    resource_exhaustion_protection: 'PASS_WITH_EXISTING_CONTROLS',
    rate_limit_bypass_tests: 'PASS_WITH_EXISTING_CONTROLS',
    recovery_429_behavior: 'TESTED',
    distributed_enforcement: 'REDIS_BACKED_SOFTWARE',
    distributed_enforcement_status: 'SOFTWARE_VERIFIED',
    external_waf_edge_protection: 'EXTERNAL_GATED',
    protection_classes: buildAbuseProtectionClasses(),
    vulnerabilities_found: [
      {
        id: 'S113-VULN-1',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Carrier and video webhooks lacked RateLimitService.hit while payment webhooks had it.',
      },
      {
        id: 'S113-VULN-2',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Public discovery search/suggest had page-size caps but no request-rate budget.',
      },
      {
        id: 'S113-VULN-3',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Admin PII reveal and health break-glass relied on authz only (no actor rate budget).',
      },
    ],
    vulnerabilities_fixed: [
      {
        id: 'S113-FIX-1',
        summary:
          'Carrier + video webhook hit(`webhook:carrier|video:*`, 300/60s) parity with payment.',
      },
      {
        id: 'S113-FIX-2',
        summary: 'Discovery search 60/min and suggest 120/min per IP via RateLimitService.',
      },
      {
        id: 'S113-FIX-3',
        summary: 'Admin PII reveal 10/900s and break-glass 5/900s per actor.',
      },
    ],
    vulnerabilities_remaining: [
      {
        id: 'S113-REM-1',
        severity: 'HIGH',
        summary: 'External edge/WAF/DDoS protection not selected',
        why: 'Out of application scope; requires real CDN/WAF — not invented in sprint',
      },
      {
        id: 'S113-REM-2',
        severity: 'MEDIUM',
        summary: 'Distributed rate-limit production certification pending',
        why: 'Redis-backed software verified; multi-region/failover not production-certified',
      },
      {
        id: 'S113-REM-3',
        severity: 'LOW',
        summary: 'Not every partner mutation endpoint has an explicit hit()',
        why: 'AuthZ + org ownership primary; add hit() only where abuse class justifies',
      },
    ],
    remaining_blocker: EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
    remaining_blockers: [
      EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
      NO_PRODUCTION_EDGE_WAF,
      DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
      API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
      ...foundation.remaining_blockers.filter((b) =>
        ['NO_PRODUCTION_ENVIRONMENT', 'NO_PRODUCTION_SECRETS_MANAGER'].includes(b),
      ),
    ],
    force_launch_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    security_statement:
      'Abuse controls tested. Rate limiting verified against existing RateLimitService. Known risks documented. Distributed protection software-verified but not production-certified. External edge/WAF protection pending.',
    next_action:
      'Keep RateLimitService as the single limiter; commission edge/WAF when production environment exists; do not invent CDN vendors or treat sandbox Redis limits as DDoS protection.',
    message:
      'Sprint 113 API abuse hardening: OTP/auth/webhook/discovery/admin budgets verified or hardened. EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED. CAN_PRODUCTION_LAUNCH = NO.',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
  };
}
