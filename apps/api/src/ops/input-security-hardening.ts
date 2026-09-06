/**
 * Sprint 115 — Production input security hardening evidence
 * (injection + SSRF + path traversal + unsafe input).
 * Composes S110–S114 + existing Zod/Prisma/object-store/ProblemFilter.
 * Never invents a parallel validation/sanitization/security framework.
 * Never claims absolute immunity from injection or SSRF.
 * CAN_PRODUCTION_LAUNCH remains NO — external pentest still required.
 */
import {
  APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_PENTEST_REQUIRED,
} from './application-security-hardening';
import { evaluateExternalPentestPreparation } from './external-pentest-preparation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';

/** Re-export canonical blockers — do not invent duplicates of S110/S111 codes. */
export {
  APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_PENTEST_REQUIRED,
};

/** Sprint 115 wording aliases for input-security evidence (map onto existing certification gate). */
export const INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED =
  'INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED';
export const INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED =
  'INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED';
export const SSRF_DNS_REBINDING_RESIDUAL_RISK = 'SSRF_DNS_REBINDING_RESIDUAL_RISK';

export type InputSecurityStatus =
  | 'TESTED'
  | 'PASS_WITH_EXISTING_CONTROLS'
  | 'HARDENED'
  | 'PROTECTED'
  | 'NOT_APPLICABLE'
  | 'EXTERNAL_GATED'
  | 'REQUIRED';

export type InputSecuritySurface = {
  id: string;
  label: string;
  status: InputSecurityStatus;
  evidence: string;
  notes: string;
};

export type InputSecurityHardeningReport = {
  sprint: 115;
  foundation_sprints: string;
  architecture_reused: string[];
  parallel_security_framework_created: false;
  parallel_validation_system_created: false;
  invented_security_vendor: false;
  sql_orm_injection: InputSecurityStatus;
  nosql_injection: InputSecurityStatus;
  command_injection: InputSecurityStatus;
  ssrf: InputSecurityStatus;
  ssrf_redirect: InputSecurityStatus;
  ssrf_private_network: InputSecurityStatus;
  ssrf_metadata_endpoint: InputSecurityStatus;
  path_traversal: InputSecurityStatus;
  archive_traversal: InputSecurityStatus;
  unsafe_redirect: InputSecurityStatus;
  prototype_pollution: InputSecurityStatus;
  unsafe_deserialization: InputSecurityStatus;
  template_expression_injection: InputSecurityStatus;
  http_crlf_injection: InputSecurityStatus;
  malformed_input_handling: InputSecurityStatus;
  sensitive_error_leakage: InputSecurityStatus;
  surfaces: InputSecuritySurface[];
  vulnerabilities_found: Array<{ id: string; severity: string; status: string; summary: string }>;
  vulnerabilities_fixed: Array<{ id: string; summary: string }>;
  vulnerabilities_remaining: Array<{ id: string; severity: string; summary: string; why: string }>;
  remaining_blocker: typeof EXTERNAL_PENTEST_REQUIRED;
  remaining_blockers: string[];
  external_pentest: 'REQUIRED';
  external_pentest_passed: 'NO';
  production_security_certified: 'NO';
  force_launch_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  s110_plane: 'COMPOSED';
  s111_plane: 'COMPOSED';
  s113_plane: 'COMPOSED';
  s114_plane: 'COMPOSED';
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

export function buildInputSecuritySurfaces(): InputSecuritySurface[] {
  return [
    {
      id: 'sql_orm',
      label: 'SQL / ORM injection',
      status: 'TESTED',
      evidence: 'Prisma tagged $queryRaw/$executeRaw; no user-concatenated SQL; dynamic ORDER BY absent',
      notes: 'Raw savepoints use non-user identifiers',
    },
    {
      id: 'nosql',
      label: 'NoSQL / operator injection',
      status: 'NOT_APPLICABLE',
      evidence: 'Postgres + Prisma only; no Mongo filter objects',
      notes: '',
    },
    {
      id: 'command',
      label: 'Command injection',
      status: 'NOT_APPLICABLE',
      evidence: 'No production child_process/exec/shell:true with user input',
      notes: 'Test harness uses execFileSync/argv lists only',
    },
    {
      id: 'ssrf',
      label: 'SSRF (URL destination safety)',
      status: 'TESTED',
      evidence: 'url-safety assertSafeExternalHttpUrl on catalog asset URLs; no user URL→fetch today',
      notes: 'DNS rebinding residual when live outbound fetch is added',
    },
    {
      id: 'path',
      label: 'Path traversal',
      status: 'TESTED',
      evidence: 'assertSafeObjectKey + resolveObjectPathUnderRoot; CMS key checks',
      notes: 'Production local-disk storage forbidden (S107)',
    },
    {
      id: 'archive',
      label: 'Archive extraction traversal',
      status: 'NOT_APPLICABLE',
      evidence: 'No zip/tar extract libraries in runtime path',
      notes: '',
    },
    {
      id: 'redirect',
      label: 'Unsafe redirect',
      status: 'HARDENED',
      evidence: 'Admin + customer safeInternalPath allowlist for next=',
      notes: '',
    },
    {
      id: 'prototype',
      label: 'Prototype pollution',
      status: 'HARDENED',
      evidence: 'stripPrototypePollutionKeys on admin catalog attributes; no lodash.merge of bodies',
      notes: '',
    },
    {
      id: 'deserialize',
      label: 'Unsafe deserialization / eval',
      status: 'NOT_APPLICABLE',
      evidence: 'No eval/Function/vm/yaml.load in application path',
      notes: '',
    },
    {
      id: 'template',
      label: 'Template / expression injection',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'No server template engines; JSX escape; controlled JSON-LD stringify',
      notes: '',
    },
    {
      id: 'http_parse',
      label: 'HTTP / CRLF / malformed input',
      status: 'PASS_WITH_EXISTING_CONTROLS',
      evidence: 'HTTP_JSON_LIMIT, URI length, helmet, ProblemFilter redaction',
      notes: 'S113 body/URI limits reused',
    },
    {
      id: 'errors',
      label: 'Sensitive error leakage',
      status: 'PROTECTED',
      evidence: 'ProblemFilter generic internal errors + redactText; no SQL/path in client bodies',
      notes: '',
    },
  ];
}

export function evaluateInputSecurityHardening(
  input?: { correlation_id?: string },
): InputSecurityHardeningReport {
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const foundation = evaluateProductionFoundationFirstOnboarding({
    correlation_id: input?.correlation_id,
  });
  const pentest = evaluateExternalPentestPreparation({
    correlation_id: input?.correlation_id,
  });

  return {
    sprint: 115,
    foundation_sprints: '107-114',
    architecture_reused: [
      'Zod per-route safeParse',
      'Prisma ORM + tagged raw SQL',
      'PrivateObjectStore key checks',
      'ProblemFilter + redactText',
      'SecurityEventsService',
      'safeInternalPath (customer + admin)',
      'http-setup body/URI limits (S113/S114)',
      'S110/S111 authz + pentest gate',
    ],
    parallel_security_framework_created: false,
    parallel_validation_system_created: false,
    invented_security_vendor: false,
    sql_orm_injection: 'TESTED',
    nosql_injection: 'NOT_APPLICABLE',
    command_injection: 'NOT_APPLICABLE',
    ssrf: 'TESTED',
    ssrf_redirect: 'TESTED',
    ssrf_private_network: 'TESTED',
    ssrf_metadata_endpoint: 'TESTED',
    path_traversal: 'TESTED',
    archive_traversal: 'NOT_APPLICABLE',
    unsafe_redirect: 'HARDENED',
    prototype_pollution: 'HARDENED',
    unsafe_deserialization: 'NOT_APPLICABLE',
    template_expression_injection: 'PASS_WITH_EXISTING_CONTROLS',
    http_crlf_injection: 'PASS_WITH_EXISTING_CONTROLS',
    malformed_input_handling: 'PASS_WITH_EXISTING_CONTROLS',
    sensitive_error_leakage: 'PROTECTED',
    surfaces: buildInputSecuritySurfaces(),
    vulnerabilities_found: [
      {
        id: 'S115-VULN-1',
        severity: 'HIGH',
        status: 'FIXED',
        summary:
          'Main Admin login next= used a weak startsWith("/") check (open redirect vs customer safeInternalPath).',
      },
      {
        id: 'S115-VULN-2',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Catalog asset public_url accepted any http(s) URL including localhost/private/metadata hosts (stored URL / future SSRF risk).',
      },
      {
        id: 'S115-VULN-3',
        severity: 'MEDIUM',
        status: 'FIXED',
        summary:
          'Local private object store joined keys without resolve-under-root defense-in-depth; Windows drive / encoded .. edge cases weak.',
      },
      {
        id: 'S115-VULN-4',
        severity: 'LOW',
        status: 'FIXED',
        summary:
          'Admin catalog attributes Record spread did not strip __proto__/constructor/prototype keys.',
      },
    ],
    vulnerabilities_fixed: [
      {
        id: 'S115-FIX-1',
        summary: 'Admin next= now uses safeInternalPath allowlist (parity with customer).',
      },
      {
        id: 'S115-FIX-2',
        summary:
          'assertSafeExternalHttpUrl + vendor/admin catalog asset URL filtering (blocks private/metadata/unsafe protocols).',
      },
      {
        id: 'S115-FIX-3',
        summary:
          'resolveObjectPathUnderRoot + stronger assertSafeObjectKey; CMS key checks tightened.',
      },
      {
        id: 'S115-FIX-4',
        summary: 'stripPrototypePollutionKeys on admin catalog attribute updates.',
      },
    ],
    vulnerabilities_remaining: [
      {
        id: 'S115-REM-1',
        severity: 'HIGH',
        summary: 'External penetration test not executed',
        why: 'EXTERNAL_PENTEST_REQUIRED — independent validation pending',
      },
      {
        id: 'S115-REM-2',
        severity: 'MEDIUM',
        summary: 'DNS rebinding residual for any future server-side URL fetch',
        why: 'Hostname checks alone do not re-validate post-DNS; fetcher must revalidate',
      },
      {
        id: 'S115-REM-3',
        severity: 'MEDIUM',
        summary: 'Not every @Body controller uses Zod',
        why: 'AuthZ + typed fields primary; add Zod where abuse class justifies (not a parallel framework)',
      },
      {
        id: 'S115-REM-4',
        severity: 'LOW',
        summary: 'Live provider webhook/import URL allowlists EXTERNAL_GATED',
        why: 'Real adapters not selected; keep signatures + config-bound URLs',
      },
    ],
    remaining_blocker: EXTERNAL_PENTEST_REQUIRED,
    remaining_blockers: [
      EXTERNAL_PENTEST_REQUIRED,
      APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
      INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED,
      SSRF_DNS_REBINDING_RESIDUAL_RISK,
      ...foundation.remaining_blockers.filter((b) =>
        ['NO_PRODUCTION_ENVIRONMENT', 'NO_PRODUCTION_SECRETS_MANAGER'].includes(b),
      ),
    ],
    external_pentest: 'REQUIRED',
    external_pentest_passed: pentest.external_pentest_passed,
    production_security_certified: pentest.production_security_certified,
    force_launch_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    s110_plane: 'COMPOSED',
    s111_plane: 'COMPOSED',
    s113_plane: 'COMPOSED',
    s114_plane: 'COMPOSED',
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    security_statement:
      'Input security controls tested. Vulnerabilities identified/fixed. Known risks documented. External pentest required. Production certification pending.',
    next_action:
      'Keep Zod/Prisma/object-store/url-safety patterns; commission external pentest; do not invent security vendors or overclaim input defenses.',
    message:
      'Sprint 115 input security: SQL/SSRF/path TESTED; admin redirect HARDENED; archive/cmd/NoSQL N/A. EXTERNAL_PENTEST_REQUIRED. CAN_PRODUCTION_LAUNCH = NO.',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
  };
}
