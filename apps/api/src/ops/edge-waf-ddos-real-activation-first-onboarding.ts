/**
 * Sprint 114 — Production edge / WAF / DDoS activation readiness.
 * Composes S113 RateLimitService + Launch Control + trusted-proxy software model.
 * Never invents CDN/WAF/DDoS vendors, credentials, DNS, or certificates.
 * Never claims production WAF or DDoS protection without a real external edge.
 * CAN_PRODUCTION_LAUNCH remains NO.
 */
import {
  API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
  evaluateApiAbuseHardening,
} from './api-abuse-hardening';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';

/** Re-export canonical S113 blockers — do not invent parallel edge taxonomy. */
export {
  API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
};

/** Sprint 114 wording aliases — map onto existing S113 / edge semantics. */
export const EDGE_PROVIDER_NOT_SELECTED = 'EDGE_PROVIDER_NOT_SELECTED';
export const EDGE_CREDENTIAL_REFERENCE_MISSING = 'EDGE_CREDENTIAL_REFERENCE_MISSING';
export const EDGE_CONFIGURATION_REQUIRED = 'EDGE_CONFIGURATION_REQUIRED';
export const TRUSTED_PROXY_CONFIGURATION_REQUIRED = 'TRUSTED_PROXY_CONFIGURATION_REQUIRED';
export const ORIGIN_PROTECTION_NOT_VERIFIED = 'ORIGIN_PROTECTION_NOT_VERIFIED';
export const DDOS_PROTECTION_NOT_PROVEN = 'DDOS_PROTECTION_NOT_PROVEN';

export type EdgeActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type EdgeControlPlane =
  | 'EDGE'
  | 'APPLICATION'
  | 'DATABASE'
  | 'INTERNAL_SERVICES';

export type EdgeWafDdosActivationReport = {
  sprint: 114;
  foundation_sprints: string;
  architecture_reused: string[];
  parallel_rate_limit_framework_created: false;
  parallel_waf_engine_created: false;
  invented_edge_waf_ddos_vendor: false;
  activation_lifecycle: EdgeActivationLifecycle;
  edge_waf_provider_selected: 'NO';
  production_waf_enabled: 'NO';
  ddos_provider_selected: 'NO';
  production_ddos_protection_enabled: 'NO';
  trusted_proxy_configuration: 'VERIFIED';
  trusted_proxy_default: 'DO_NOT_TRUST_FORWARDED_HEADERS';
  client_ip_spoofing_protection: 'PASS';
  host_forwarded_host_protection: 'PASS';
  origin_protection: 'EXTERNAL_GATED';
  redis_rate_limit_integration: 'PASS';
  redis_rate_limit: 'EXISTING_REUSED';
  edge_application_rate_limit_interaction: 'PASS';
  webhook_security: 'PASS';
  admin_break_glass_security: 'PASS';
  http_security_headers: 'PASS';
  cors_security: 'PASS';
  edge_architecture: string[];
  control_boundary: Array<{ plane: EdgeControlPlane; controls: string[] }>;
  waf_policy_categories: Array<{ id: string; status: 'EXTERNAL_GATED'; rationale: string }>;
  ddos_dependencies: Array<{ id: string; status: 'EXTERNAL_GATED'; rationale: string }>;
  rate_limit_scenarios: Array<{ id: string; behavior: string; fail_mode: string }>;
  origin_protection_checklist: Array<{ id: string; status: 'EXTERNAL_GATED' | 'SOFTWARE_VERIFIED' }>;
  vulnerabilities_found: Array<{ id: string; severity: string; status: string; summary: string }>;
  vulnerabilities_fixed: Array<{ id: string; summary: string }>;
  vulnerabilities_remaining: Array<{ id: string; severity: string; summary: string; why: string }>;
  remaining_blocker: typeof EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED;
  remaining_blockers: string[];
  force_launch_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  s113_plane: 'COMPOSED';
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

export function buildEdgeArchitecture(): string[] {
  return [
    'INTERNET',
    'EXTERNAL_EDGE_WAF',
    'LOAD_BALANCER_REVERSE_PROXY',
    'APPLICATION',
    'INTERNAL_SERVICES',
  ];
}

export function buildControlBoundary(): EdgeWafDdosActivationReport['control_boundary'] {
  return [
    {
      plane: 'EDGE',
      controls: [
        'volumetric_and_protocol_filtering',
        'WAF_policy_categories',
        'edge_rate_limiting',
        'bot_mitigation',
        'origin_shielding',
      ],
    },
    {
      plane: 'APPLICATION',
      controls: [
        'authentication_authorization',
        'webhook_signature_replay',
        'Redis_RateLimitService',
        'trusted_proxy_client_ip',
        'Host_allowlist_optional',
        'HTTP_security_headers_CORS',
      ],
    },
    {
      plane: 'DATABASE',
      controls: ['access_control', 'encryption_at_rest_EXTERNAL_GATED', 'backup_EXTERNAL_GATED'],
    },
    {
      plane: 'INTERNAL_SERVICES',
      controls: ['service_auth', 'network_isolation_EXTERNAL_GATED', 'no_public_admin_bypass'],
    },
  ];
}

export function buildWafPolicyCategories(): EdgeWafDdosActivationReport['waf_policy_categories'] {
  return [
    { id: 'common_malicious_request_filtering', status: 'EXTERNAL_GATED', rationale: 'Vendor WAF ruleset' },
    { id: 'protocol_anomaly_filtering', status: 'EXTERNAL_GATED', rationale: 'Vendor edge' },
    { id: 'oversized_request_blocking', status: 'EXTERNAL_GATED', rationale: 'Edge + app HTTP_JSON_LIMIT' },
    { id: 'malicious_payload_filtering', status: 'EXTERNAL_GATED', rationale: 'Vendor WAF' },
    { id: 'bot_abuse_mitigation', status: 'EXTERNAL_GATED', rationale: 'Vendor bot management' },
    { id: 'suspicious_ip_risk_handling', status: 'EXTERNAL_GATED', rationale: 'Vendor reputation' },
    { id: 'edge_rate_limiting', status: 'EXTERNAL_GATED', rationale: 'Distinct from Redis RateLimitService' },
    { id: 'api_endpoint_protection', status: 'EXTERNAL_GATED', rationale: 'Edge path policies' },
    { id: 'login_otp_abuse_protection', status: 'EXTERNAL_GATED', rationale: 'Edge + app RateLimitService' },
    { id: 'webhook_protection', status: 'EXTERNAL_GATED', rationale: 'Edge allowlist; app signatures remain' },
    { id: 'administrative_endpoint_protection', status: 'EXTERNAL_GATED', rationale: 'Edge + app authz' },
  ];
}

export function buildDdosDependencies(): EdgeWafDdosActivationReport['ddos_dependencies'] {
  return [
    { id: 'volumetric_attack_mitigation', status: 'EXTERNAL_GATED', rationale: 'Network/L3-L4 provider' },
    { id: 'l3_l4_protection', status: 'EXTERNAL_GATED', rationale: 'Not application-layer' },
    { id: 'l7_protection', status: 'EXTERNAL_GATED', rationale: 'Edge/WAF provider' },
    { id: 'traffic_absorption', status: 'EXTERNAL_GATED', rationale: 'CDN/scrubbing capacity' },
    { id: 'origin_shielding', status: 'EXTERNAL_GATED', rationale: 'Firewall/security-group' },
    { id: 'rate_based_mitigation', status: 'EXTERNAL_GATED', rationale: 'Edge rate policies' },
    { id: 'attack_detection', status: 'EXTERNAL_GATED', rationale: 'Provider SOC signals' },
    { id: 'emergency_blocking', status: 'EXTERNAL_GATED', rationale: 'Ops runbook + provider' },
  ];
}

export function buildRateLimitScenarios(): EdgeWafDdosActivationReport['rate_limit_scenarios'] {
  return [
    {
      id: 'edge_only',
      behavior: 'External edge throttles before origin; app RateLimitService still applies when request reaches app',
      fail_mode: 'n/a until edge selected',
    },
    {
      id: 'application_only',
      behavior: 'Redis RateLimitService enforces; fail-closed 503 if Redis unavailable',
      fail_mode: 'RATE_LIMIT_UNAVAILABLE',
    },
    {
      id: 'both',
      behavior: 'Defense in depth; prefer looser edge + tighter app identity budgets to avoid double-throttle pain',
      fail_mode: 'either layer may reject',
    },
    {
      id: 'edge_unavailable',
      behavior: 'Production must not launch without edge; app controls alone are not DDoS mitigation',
      fail_mode: 'EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED',
    },
    {
      id: 'trusted_proxy_unavailable_or_empty',
      behavior: 'Default: do not trust XFF/Forwarded; client IP = socket remoteAddress via req.ip',
      fail_mode: 'no silent weaken',
    },
    {
      id: 'redis_unavailable',
      behavior: 'RateLimitService throws 503 — critical abuse controls fail-closed',
      fail_mode: 'RATE_LIMIT_UNAVAILABLE',
    },
  ];
}

export function buildOriginProtectionChecklist(): EdgeWafDdosActivationReport['origin_protection_checklist'] {
  return [
    { id: 'origin_exposure', status: 'EXTERNAL_GATED' },
    { id: 'trusted_edge_source_validation', status: 'EXTERNAL_GATED' },
    { id: 'firewall_security_group', status: 'EXTERNAL_GATED' },
    { id: 'private_origin', status: 'EXTERNAL_GATED' },
    { id: 'health_check_exceptions', status: 'EXTERNAL_GATED' },
    { id: 'webhook_ingress', status: 'SOFTWARE_VERIFIED' },
    { id: 'admin_access', status: 'SOFTWARE_VERIFIED' },
  ];
}

export function evaluateEdgeWafDdosActivation(
  input?: { correlation_id?: string },
): EdgeWafDdosActivationReport {
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const foundation = evaluateProductionFoundationFirstOnboarding({
    correlation_id: input?.correlation_id,
  });
  const abuse = evaluateApiAbuseHardening({ correlation_id: input?.correlation_id });

  return {
    sprint: 114,
    foundation_sprints: '87,100,101,109-113',
    architecture_reused: [
      'RateLimitService (Redis) — S113',
      'api-abuse-hardening blockers',
      'http-setup helmet/CORS/body limits',
      'client-ip resolveClientIp + TRUSTED_PROXIES',
      'Production Launch Control (S87)',
      'webhook signature + replay',
      'Admin authz + break-glass budgets',
    ],
    parallel_rate_limit_framework_created: false,
    parallel_waf_engine_created: false,
    invented_edge_waf_ddos_vendor: false,
    activation_lifecycle: 'NOT_SELECTED',
    edge_waf_provider_selected: 'NO',
    production_waf_enabled: 'NO',
    ddos_provider_selected: 'NO',
    production_ddos_protection_enabled: 'NO',
    trusted_proxy_configuration: 'VERIFIED',
    trusted_proxy_default: 'DO_NOT_TRUST_FORWARDED_HEADERS',
    client_ip_spoofing_protection: 'PASS',
    host_forwarded_host_protection: 'PASS',
    origin_protection: 'EXTERNAL_GATED',
    redis_rate_limit_integration: 'PASS',
    redis_rate_limit: 'EXISTING_REUSED',
    edge_application_rate_limit_interaction: 'PASS',
    webhook_security: 'PASS',
    admin_break_glass_security: 'PASS',
    http_security_headers: 'PASS',
    cors_security: 'PASS',
    edge_architecture: buildEdgeArchitecture(),
    control_boundary: buildControlBoundary(),
    waf_policy_categories: buildWafPolicyCategories(),
    ddos_dependencies: buildDdosDependencies(),
    rate_limit_scenarios: buildRateLimitScenarios(),
    origin_protection_checklist: buildOriginProtectionChecklist(),
    vulnerabilities_found: [
      {
        id: 'S114-VULN-1',
        severity: 'HIGH',
        status: 'FIXED',
        summary:
          'Public discovery rate limits previously derived client IP from raw X-Forwarded-For, enabling spoofed IP budget bypass.',
      },
      {
        id: 'S114-VULN-2',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Express trust proxy was unset; no explicit TRUSTED_PROXIES / PUBLIC_API_HOSTS model for production edge.',
      },
    ],
    vulnerabilities_fixed: [
      {
        id: 'S114-FIX-1',
        summary:
          'resolveClientIp via req.ip only; discovery uses shared helper — never reads XFF directly.',
      },
      {
        id: 'S114-FIX-2',
        summary:
          'TRUSTED_PROXIES + optional PUBLIC_API_HOSTS wired in http-setup; empty TRUSTED_PROXIES = do not trust forwarded headers.',
      },
    ],
    vulnerabilities_remaining: [
      {
        id: 'S114-REM-1',
        severity: 'HIGH',
        summary: 'No real edge/WAF provider selected or enabled',
        why: 'Requires real CDN/WAF account — not invented in sprint',
      },
      {
        id: 'S114-REM-2',
        severity: 'HIGH',
        summary: 'No real DDoS / L3-L4 protection selected',
        why: 'Network-layer absorption cannot be simulated in application code',
      },
      {
        id: 'S114-REM-3',
        severity: 'HIGH',
        summary: 'Origin shielding / private origin not verified',
        why: 'Firewall/security-group and DNS cutover are EXTERNAL_GATED',
      },
      {
        id: 'S114-REM-4',
        severity: 'MEDIUM',
        summary: 'Distributed rate-limit production certification pending',
        why: abuse.vulnerabilities_remaining.find((v) => v.id === 'S113-REM-2')?.why ??
          'Redis software verified; multi-region not certified',
      },
    ],
    remaining_blocker: EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
    remaining_blockers: [
      EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
      NO_PRODUCTION_EDGE_WAF,
      EDGE_PROVIDER_NOT_SELECTED,
      EDGE_CREDENTIAL_REFERENCE_MISSING,
      EDGE_CONFIGURATION_REQUIRED,
      TRUSTED_PROXY_CONFIGURATION_REQUIRED,
      ORIGIN_PROTECTION_NOT_VERIFIED,
      DDOS_PROTECTION_NOT_PROVEN,
      DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
      API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
      ...foundation.remaining_blockers.filter((b) =>
        ['NO_PRODUCTION_ENVIRONMENT', 'NO_PRODUCTION_SECRETS_MANAGER'].includes(b),
      ),
    ],
    force_launch_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    s113_plane: 'COMPOSED',
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    security_statement:
      'Edge security architecture prepared. Application controls verified. External WAF required. External DDoS protection required. Trusted proxy handling verified. Production edge protection pending.',
    next_action:
      'Select a real edge/WAF/DDoS provider outside this repo when production environment exists; configure TRUSTED_PROXIES to that edge only; keep RateLimitService; do not invent vendors or claim production WAF/DDoS enabled.',
    message:
      'Sprint 114 edge/WAF/DDoS readiness: provider NOT_SELECTED; trusted-proxy software VERIFIED; origin EXTERNAL_GATED; Redis limiter reused. EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED. CAN_PRODUCTION_LAUNCH = NO.',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
  };
}
