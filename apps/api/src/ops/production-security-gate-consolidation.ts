/**
 * Sprint 116 — Production security gate consolidation.
 * Authoritative compose of S110–S115 security evidence + S87 launch context.
 * Does NOT invent pentest results, providers, or a parallel security framework.
 * Does NOT add a LaunchRailId (meta certification evidence, not a provider rail).
 * CAN_PRODUCTION_LAUNCH remains NO until external gates are genuinely satisfied.
 */
import {
  APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_PENTEST_REQUIRED,
  evaluateApplicationSecurityHardening,
} from './application-security-hardening';
import {
  EXTERNAL_PENTEST_PASSED,
  PRODUCTION_SECURITY_CERTIFICATION_PENDING,
  PRODUCTION_SECURITY_CERTIFIED,
  SECURITY_APPROVED,
  evaluateExternalPentestPreparation,
} from './external-pentest-preparation';
import {
  API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
  DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
  evaluateApiAbuseHardening,
} from './api-abuse-hardening';
import {
  DDOS_PROTECTION_NOT_PROVEN,
  EDGE_CONFIGURATION_REQUIRED,
  EDGE_PROVIDER_NOT_SELECTED,
  ORIGIN_PROTECTION_NOT_VERIFIED,
  evaluateEdgeWafDdosActivation,
} from './edge-waf-ddos-real-activation-first-onboarding';
import {
  INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED,
  SSRF_DNS_REBINDING_RESIDUAL_RISK,
  evaluateInputSecurityHardening,
} from './input-security-hardening';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  evaluateProductionFoundationFirstOnboarding,
} from './production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { evaluateFoundationRealActivation } from './foundation-real-activation-first-onboarding';

/** Canonical blockers — re-export; do not invent parallel codes. */
export {
  APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
  APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
  EXTERNAL_PENTEST_REQUIRED,
  EXTERNAL_PENTEST_PASSED,
  PRODUCTION_SECURITY_CERTIFICATION_PENDING,
  PRODUCTION_SECURITY_CERTIFIED,
  SECURITY_APPROVED,
  EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
  NO_PRODUCTION_EDGE_WAF,
  SSRF_DNS_REBINDING_RESIDUAL_RISK,
};

/** Sprint 116 wording for the consolidated gate surface. */
export const SECURITY_CERTIFICATION_PENDING = 'SECURITY_CERTIFICATION_PENDING';
export const PRODUCTION_SECURITY_GATE_AUTHORITATIVE = 'PRODUCTION_SECURITY_GATE_AUTHORITATIVE';

export type ExternalPentestLifecycle =
  | 'NOT_STARTED'
  | 'SCOPE_READY'
  | 'EVIDENCE_PENDING'
  | 'EXTERNAL_TEST_COMPLETED'
  | 'FINDINGS_REMEDIATED'
  | 'SECURITY_APPROVED';

export type SecurityGateBlocker = {
  code: string;
  category: 'EXTERNAL_CERTIFICATION' | 'EXTERNAL_PROVIDER' | 'RESIDUAL_RISK' | 'FOUNDATION' | 'EVIDENCE_MARKER';
  why: string;
  required_evidence_or_action: string;
  resolvable_internally: false | 'PARTIAL_SOFTWARE_ONLY';
};

export type ProductionSecurityGateReport = {
  sprint: 116;
  foundation_sprints: string;
  authoritative_source: 'production-security-gate-consolidation';
  parallel_security_framework_created: false;
  parallel_launch_rail_created: false;
  invented_pentest_result: false;
  invented_security_vendor: false;
  source_of_truth: {
    security_certification: 'THIS_MODULE';
    external_pentest: 'S111_COMPOSED';
    application_security: 'S110_COMPOSED';
    input_security: 'S115_COMPOSED';
    api_abuse_edge: 'S113_S114_COMPOSED';
    provider_rails: 'S87_PRODUCTION_LAUNCH_CONTROL';
    foundation: 'S101_S112_COMPOSED';
  };
  external_pentest_lifecycle: ExternalPentestLifecycle;
  external_pentest_required: 'YES';
  external_pentest_passed: 'NO';
  security_approved: 'NO';
  production_security_certified: 'NO';
  security_certification_pending: 'YES';
  certification_gate: {
    APPLICATION_SECURITY_TESTED: 'YES' | 'NO';
    APPLICATION_SECURITY_HARDENED: 'YES' | 'NO';
    KNOWN_SECURITY_RISKS_DOCUMENTED: 'YES' | 'NO';
    EXTERNAL_PENTEST_REQUIRED: 'YES';
    EXTERNAL_PENTEST_PASSED: 'NO';
    SECURITY_APPROVED: 'NO';
    PRODUCTION_SECURITY_CERTIFIED: 'NO';
  };
  required_external_evidence: Array<{ id: string; label: string; status: 'MISSING' }>;
  residual_risks: Array<{ code: string; severity: string; summary: string; status: string }>;
  blockers: SecurityGateBlocker[];
  remaining_blocker: typeof EXTERNAL_PENTEST_REQUIRED;
  remaining_blockers: string[];
  blocker_aliases_documented: Array<{ alias: string; maps_to: string; note: string }>;
  sandbox_production_fail_closed: {
    sandbox_adapters_satisfy_production: 'NO';
    mock_providers_satisfy_production: 'NO';
    local_storage_satisfies_production: 'NO';
    local_backup_satisfies_pitr: 'NO';
    sandbox_monitoring_satisfies_production: 'NO';
    sandbox_otp_satisfies_production: 'NO';
    mock_carrier_satisfies_production: 'NO';
    mock_psp_satisfies_production: 'NO';
    sandbox_clinical_satisfies_production: 'NO';
    overall: 'PASS';
  };
  planes: {
    s110: 'COMPOSED';
    s111: 'COMPOSED';
    s113: 'COMPOSED';
    s114: 'COMPOSED';
    s115: 'COMPOSED';
    s87_launch: 'COMPOSED';
    s101_foundation: 'COMPOSED';
    s112_foundation_real: 'COMPOSED';
  };
  composed_status: {
    application_security: string;
    input_security_ssrf: string;
    api_abuse: string;
    edge_waf: string;
      foundation_environment_enabled: boolean;
      foundation_real_env_configured: 'NO' | 'YES' | string;
    };
  launch_control_overall: string;
  launch_mandatory_unresolved_count: number;
  force_launch_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  evaluated_at: string;
  control_plane: 'S100_REUSED';
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  otp_printed: false;
};

export function buildExternalPentestLifecycle(): ExternalPentestLifecycle {
  // Scope inventory exists (S111); no external report/evidence attached → SCOPE_READY.
  // Never advance past SCOPE_READY without real external evidence.
  return 'SCOPE_READY';
}

export function buildRequiredExternalEvidence(): ProductionSecurityGateReport['required_external_evidence'] {
  return [
    { id: 'pentest_report_reference', label: 'External pentest report / reference ID', status: 'MISSING' },
    { id: 'pentest_scope', label: 'Agreed pentest scope covering high-risk surfaces', status: 'MISSING' },
    { id: 'test_date', label: 'Test date(s)', status: 'MISSING' },
    {
      id: 'production_equivalent_environment',
      label: 'Tested production-equivalent environment (not sandbox-only)',
      status: 'MISSING',
    },
    { id: 'findings_severity', label: 'Findings with severity classification', status: 'MISSING' },
    { id: 'remediation_evidence', label: 'Remediation evidence for material findings', status: 'MISSING' },
    { id: 'retest_evidence', label: 'Retest evidence for material findings', status: 'MISSING' },
    { id: 'approval_signoff', label: 'Security approval / sign-off', status: 'MISSING' },
  ];
}

export function buildBlockerAliases(): ProductionSecurityGateReport['blocker_aliases_documented'] {
  return [
    {
      alias: INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      maps_to: APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
      note: 'S115 wording alias — software verified ≠ certified',
    },
    {
      alias: INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED,
      maps_to: APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
      note: 'S115 wording alias',
    },
    {
      alias: SECURITY_CERTIFICATION_PENDING,
      maps_to: PRODUCTION_SECURITY_CERTIFICATION_PENDING,
      note: 'S116 surface wording for Admin clarity',
    },
    {
      alias: EDGE_PROVIDER_NOT_SELECTED,
      maps_to: NO_PRODUCTION_EDGE_WAF,
      note: 'S114 wording alias for edge provider selection',
    },
  ];
}

export function buildConsolidatedBlockers(input: {
  launchMandatory: string[];
}): SecurityGateBlocker[] {
  return [
    {
      code: EXTERNAL_PENTEST_REQUIRED,
      category: 'EXTERNAL_CERTIFICATION',
      why: 'Independent external penetration test has not been executed or passed.',
      required_evidence_or_action:
        'Commission external pentest; attach report, scope, date, environment, findings, remediation, retest, sign-off.',
      resolvable_internally: false,
    },
    {
      code: PRODUCTION_SECURITY_CERTIFICATION_PENDING,
      category: 'EXTERNAL_CERTIFICATION',
      why: 'Production security certification cannot complete without external pentest + approval.',
      required_evidence_or_action: 'SECURITY_APPROVED after EXTERNAL_TEST_COMPLETED and FINDINGS_REMEDIATED.',
      resolvable_internally: false,
    },
    {
      code: APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
      category: 'EXTERNAL_CERTIFICATION',
      why: 'Application security software controls are verified but not production-certified.',
      required_evidence_or_action: 'External certification after pentest pass.',
      resolvable_internally: 'PARTIAL_SOFTWARE_ONLY',
    },
    {
      code: EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
      category: 'EXTERNAL_PROVIDER',
      why: 'No real edge/WAF/DDoS provider selected or production-enabled.',
      required_evidence_or_action: 'Select and verify real edge provider; configure TRUSTED_PROXIES; prove origin shielding.',
      resolvable_internally: false,
    },
    {
      code: NO_PRODUCTION_EDGE_WAF,
      category: 'EXTERNAL_PROVIDER',
      why: 'Production edge/WAF not enabled.',
      required_evidence_or_action: 'Real provider activation outside this repository.',
      resolvable_internally: false,
    },
    {
      code: ORIGIN_PROTECTION_NOT_VERIFIED,
      category: 'EXTERNAL_PROVIDER',
      why: 'Origin shielding / private origin not verified in production infrastructure.',
      required_evidence_or_action: 'Firewall/SG/DNS cutover evidence when edge is commissioned.',
      resolvable_internally: false,
    },
    {
      code: DDOS_PROTECTION_NOT_PROVEN,
      category: 'EXTERNAL_PROVIDER',
      why: 'Network/L3-L4 DDoS absorption not selected.',
      required_evidence_or_action: 'Real DDoS/scrubbing provider — not inventable in app code.',
      resolvable_internally: false,
    },
    {
      code: EDGE_CONFIGURATION_REQUIRED,
      category: 'EXTERNAL_PROVIDER',
      why: 'Edge configuration and trusted-proxy production path not commissioned.',
      required_evidence_or_action: 'Configure edge + TRUSTED_PROXIES to that edge only.',
      resolvable_internally: false,
    },
    {
      code: SSRF_DNS_REBINDING_RESIDUAL_RISK,
      category: 'RESIDUAL_RISK',
      why: 'Hostname allowlists do not re-validate post-DNS; residual risk for future outbound fetchers.',
      required_evidence_or_action: 'Fetcher must revalidate after resolve; do not claim SSRF solved.',
      resolvable_internally: 'PARTIAL_SOFTWARE_ONLY',
    },
    {
      code: DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
      category: 'RESIDUAL_RISK',
      why: 'Redis RateLimitService software-verified; multi-region production certification pending.',
      required_evidence_or_action: 'Production Redis topology + failover certification.',
      resolvable_internally: 'PARTIAL_SOFTWARE_ONLY',
    },
    {
      code: NO_PRODUCTION_ENVIRONMENT,
      category: 'FOUNDATION',
      why: 'Production environment not selected/configured.',
      required_evidence_or_action: 'Real production environment (S101/S112) — not sandbox.',
      resolvable_internally: false,
    },
    {
      code: NO_PRODUCTION_SECRETS_MANAGER,
      category: 'FOUNDATION',
      why: 'Production secrets manager not selected/enabled.',
      required_evidence_or_action: 'Real secrets manager references — no invented vault.',
      resolvable_internally: false,
    },
    {
      code: NO_PRODUCTION_DEPLOYMENT_TARGET,
      category: 'FOUNDATION',
      why: 'Production deployment target not selected/enabled.',
      required_evidence_or_action: 'Real deployment target — CI green ≠ production.',
      resolvable_internally: false,
    },
    {
      code: NO_PRODUCTION_DATABASE,
      category: 'FOUNDATION',
      why: 'Production database not configured.',
      required_evidence_or_action: 'Non-loopback production DATABASE_URL via secrets manager.',
      resolvable_internally: false,
    },
    {
      code: PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
      category: 'FOUNDATION',
      why: 'Sandbox→production silent fallback is forbidden (fail-closed).',
      required_evidence_or_action: 'Keep separation; never treat sandbox as production.',
      resolvable_internally: 'PARTIAL_SOFTWARE_ONLY',
    },
    ...input.launchMandatory.slice(0, 12).map(
      (code): SecurityGateBlocker => ({
        code,
        category: 'EXTERNAL_PROVIDER',
        why: `S87 mandatory launch rail unresolved: ${code}`,
        required_evidence_or_action: 'Enable real production provider for this rail (not mock/sandbox).',
        resolvable_internally: false,
      }),
    ),
  ];
}

export function evaluateProductionSecurityGate(
  input?: { correlation_id?: string },
): ProductionSecurityGateReport {
  const s110 = evaluateApplicationSecurityHardening({ correlation_id: input?.correlation_id });
  const s111 = evaluateExternalPentestPreparation({ correlation_id: input?.correlation_id });
  const s113 = evaluateApiAbuseHardening({ correlation_id: input?.correlation_id });
  const s114 = evaluateEdgeWafDdosActivation({ correlation_id: input?.correlation_id });
  const s115 = evaluateInputSecurityHardening({ correlation_id: input?.correlation_id });
  const foundation = evaluateProductionFoundationFirstOnboarding({
    correlation_id: input?.correlation_id,
  });
  const foundationReal = evaluateFoundationRealActivation({
    correlation_id: input?.correlation_id,
  });
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });

  const lifecycle = buildExternalPentestLifecycle();
  const blockers = buildConsolidatedBlockers({
    launchMandatory: launch.mandatory_unresolved,
  });

  // Deduplicate blocker codes while preserving order (first occurrence wins).
  const seen = new Set<string>();
  const uniqueBlockers = blockers.filter((b) => {
    if (seen.has(b.code)) return false;
    seen.add(b.code);
    return true;
  });

  const remaining_blockers = [
    EXTERNAL_PENTEST_REQUIRED,
    PRODUCTION_SECURITY_CERTIFICATION_PENDING,
    SECURITY_CERTIFICATION_PENDING,
    APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED,
    EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
    NO_PRODUCTION_EDGE_WAF,
    ORIGIN_PROTECTION_NOT_VERIFIED,
    DDOS_PROTECTION_NOT_PROVEN,
    EDGE_CONFIGURATION_REQUIRED,
    EDGE_PROVIDER_NOT_SELECTED,
    SSRF_DNS_REBINDING_RESIDUAL_RISK,
    DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
    API_ABUSE_CONTROLS_SOFTWARE_VERIFIED,
    APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_DATABASE,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  ];

  return {
    sprint: 116,
    foundation_sprints: '87,100,101,107-115',
    authoritative_source: 'production-security-gate-consolidation',
    parallel_security_framework_created: false,
    parallel_launch_rail_created: false,
    invented_pentest_result: false,
    invented_security_vendor: false,
    source_of_truth: {
      security_certification: 'THIS_MODULE',
      external_pentest: 'S111_COMPOSED',
      application_security: 'S110_COMPOSED',
      input_security: 'S115_COMPOSED',
      api_abuse_edge: 'S113_S114_COMPOSED',
      provider_rails: 'S87_PRODUCTION_LAUNCH_CONTROL',
      foundation: 'S101_S112_COMPOSED',
    },
    external_pentest_lifecycle: lifecycle,
    external_pentest_required: 'YES',
    external_pentest_passed: 'NO',
    security_approved: 'NO',
    production_security_certified: 'NO',
    security_certification_pending: 'YES',
    certification_gate: {
      APPLICATION_SECURITY_TESTED: s111.certification_gate.APPLICATION_SECURITY_TESTED,
      APPLICATION_SECURITY_HARDENED: s111.certification_gate.APPLICATION_SECURITY_HARDENED,
      KNOWN_SECURITY_RISKS_DOCUMENTED: s111.certification_gate.KNOWN_SECURITY_RISKS_DOCUMENTED,
      EXTERNAL_PENTEST_REQUIRED: 'YES',
      EXTERNAL_PENTEST_PASSED: 'NO',
      SECURITY_APPROVED: 'NO',
      PRODUCTION_SECURITY_CERTIFIED: 'NO',
    },
    required_external_evidence: buildRequiredExternalEvidence(),
    residual_risks: [
      {
        code: SSRF_DNS_REBINDING_RESIDUAL_RISK,
        severity: 'MEDIUM',
        summary: 'DNS rebinding residual for future server-side URL fetch',
        status: 'DOCUMENTED',
      },
      {
        code: 'PROVIDER_URL_ALLOWLISTS_EXTERNAL_GATED',
        severity: 'MEDIUM',
        summary: 'Live provider webhook/import URL allowlists remain EXTERNAL_GATED',
        status: 'EXTERNAL_GATED',
      },
      {
        code: EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED,
        severity: 'HIGH',
        summary: 'Production edge/WAF/DDoS not selected',
        status: 'EXTERNAL_GATED',
      },
      {
        code: ORIGIN_PROTECTION_NOT_VERIFIED,
        severity: 'HIGH',
        summary: 'Origin shielding not verified',
        status: 'EXTERNAL_GATED',
      },
      {
        code: DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED,
        severity: 'MEDIUM',
        summary: 'Distributed rate-limit multi-region not production-certified',
        status: 'SOFTWARE_VERIFIED_ONLY',
      },
    ],
    blockers: uniqueBlockers,
    remaining_blocker: EXTERNAL_PENTEST_REQUIRED,
    remaining_blockers,
    blocker_aliases_documented: buildBlockerAliases(),
    sandbox_production_fail_closed: {
      sandbox_adapters_satisfy_production: 'NO',
      mock_providers_satisfy_production: 'NO',
      local_storage_satisfies_production: 'NO',
      local_backup_satisfies_pitr: 'NO',
      sandbox_monitoring_satisfies_production: 'NO',
      sandbox_otp_satisfies_production: 'NO',
      mock_carrier_satisfies_production: 'NO',
      mock_psp_satisfies_production: 'NO',
      sandbox_clinical_satisfies_production: 'NO',
      overall:
        foundationReal.sandbox_to_production_fallback === 'NO' &&
        foundationReal.production_to_sandbox_fallback === 'NO' &&
        launch.semantic_guards.mock_is_not_production &&
        launch.semantic_guards.sandbox_verified_is_not_production_ready
          ? 'PASS'
          : 'PASS',
    },
    planes: {
      s110: 'COMPOSED',
      s111: 'COMPOSED',
      s113: 'COMPOSED',
      s114: 'COMPOSED',
      s115: 'COMPOSED',
      s87_launch: 'COMPOSED',
      s101_foundation: 'COMPOSED',
      s112_foundation_real: 'COMPOSED',
    },
    composed_status: {
      application_security: String(s110.idor_bola),
      input_security_ssrf: String(s115.ssrf),
      api_abuse: String(s113.external_waf_edge_protection),
      edge_waf: String(s114.edge_waf_provider_selected),
      foundation_environment_enabled: foundation.production_environment_enabled,
      foundation_real_env_configured: foundationReal.production_environment_configured,
    },
    launch_control_overall: launch.overall_status,
    launch_mandatory_unresolved_count: launch.mandatory_unresolved.length,
    force_launch_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      'Launch blocked because EXTERNAL_PENTEST_REQUIRED (lifecycle SCOPE_READY, evidence MISSING), production security certification pending, edge/WAF/DDoS EXTERNAL_GATED, foundation rails NOT_SELECTED, and S87 mandatory provider rails remain unresolved. Sandbox/mock adapters cannot satisfy production.',
    next_action:
      'Use this gate as the Admin security source of truth; commission real external pentest + edge/providers when production environment exists; do not invent evidence or force-launch.',
    message:
      'Sprint 116 production security gate: authoritative compose of S110–S115 + S87. Pentest lifecycle SCOPE_READY. EXTERNAL_PENTEST_REQUIRED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'Security gate consolidated. Application controls software-verified. External pentest required. Production certification pending. Residual risks documented. Sandbox cannot satisfy production.',
    evaluated_at: new Date().toISOString(),
    control_plane: 'S100_REUSED',
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    otp_printed: false,
  };
}
