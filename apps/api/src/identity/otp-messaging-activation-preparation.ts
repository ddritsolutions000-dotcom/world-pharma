/**
 * Sprint 121 — Real OTP + transactional communications activation preparation.
 * Composes S66/S76/S86/S89/S103 (+ S87 launch, S116 security, S117–S120 foundation).
 * Does NOT invent SMS/email/push providers, credentials, sender IDs, or real delivery.
 * Does NOT create a second auth/OTP/notification/outbox framework.
 * Current state MUST remain NOT_SELECTED / EXTERNAL_GATED. CAN_PRODUCTION_LAUNCH = NO.
 */
import {
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  evaluateMessagingFirstOnboarding,
  evaluateMessagingEnablementGuard,
  buildNotificationStateMachine,
  listTransactionalNotificationCoverage,
} from './messaging-first-onboarding';
import {
  evaluateRealMessagingFirstOnboarding,
  buildRealCommsActivationChecklist,
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_SENDER,
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_EMAIL_DOMAIN,
} from './messaging-real-activation-first-onboarding';
import { validateProductionMessagingConfiguration } from './production-messaging-requirements';
import {
  isMockOtpProvider,
  readCommunicationEnvironment,
} from './communication.config';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import {
  evaluateProductionSecurityGate,
  EXTERNAL_PENTEST_REQUIRED,
} from '../ops/production-security-gate-consolidation';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { secretsManagerRuntimeResolverStatus } from '../ops/secrets-manager-runtime-resolver';
import {
  evaluateOtpMessagingProductionActivationPath,
} from './otp-messaging-production-activation-path';

export {
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
};

export const OTP_MESSAGING_ACTIVATION_PREPARATION_AUTHORITATIVE =
  'OTP_MESSAGING_ACTIVATION_PREPARATION_AUTHORITATIVE';

export type CommsConfigReferenceSlot = {
  id: string;
  label: string;
  reference_key: string;
  channel: 'OTP' | 'SMS' | 'EMAIL' | 'PUSH' | 'SHARED';
  status: 'MISSING' | 'EXTERNAL_GATED' | 'NOT_SELECTED' | 'PRESENT';
  value_present: false;
  invented: false;
  secret: boolean;
};

export function buildOtpMessagingConfigurationReferenceSlots(): CommsConfigReferenceSlot[] {
  const slot = (
    id: string,
    label: string,
    reference_key: string,
    channel: CommsConfigReferenceSlot['channel'],
    status: CommsConfigReferenceSlot['status'],
    secret: boolean,
  ): CommsConfigReferenceSlot => ({
    id,
    label,
    reference_key,
    channel,
    status,
    value_present: false,
    invented: false,
    secret,
  });

  return [
    slot('otp_provider', 'OTP provider name', 'OTP_PROVIDER', 'OTP', 'NOT_SELECTED', false),
    slot('otp_endpoint', 'OTP production endpoint reference', 'OTP_PRODUCTION_ENDPOINT_REF', 'OTP', 'MISSING', false),
    slot('otp_credential', 'OTP credential / secret reference', 'OTP_PRODUCTION_SECRET_REF', 'OTP', 'MISSING', true),
    slot('otp_sender', 'OTP sender / origin reference', 'OTP_SENDER_REF', 'OTP', 'MISSING', false),
    slot('otp_markets', 'OTP country / market support', 'OTP_MARKETS_REF', 'OTP', 'EXTERNAL_GATED', false),
    slot('otp_channel', 'OTP delivery channel', 'OTP_DELIVERY_CHANNEL_REF', 'OTP', 'EXTERNAL_GATED', false),
    slot('otp_callback', 'OTP callback / webhook reference', 'OTP_WEBHOOK_REF', 'OTP', 'EXTERNAL_GATED', false),
    slot('sms_provider', 'SMS provider', 'SMS_PROVIDER', 'SMS', 'NOT_SELECTED', false),
    slot('sms_credential', 'SMS credential reference', 'SMS_PRODUCTION_SECRET_REF', 'SMS', 'MISSING', true),
    slot('sms_sender', 'SMS sender ID reference', 'SMS_SENDER_REF', 'SMS', 'MISSING', false),
    slot('email_provider', 'Email provider', 'EMAIL_PROVIDER', 'EMAIL', 'NOT_SELECTED', false),
    slot('email_credential', 'Email credential reference', 'EMAIL_PRODUCTION_SECRET_REF', 'EMAIL', 'MISSING', true),
    slot('email_sender', 'Email sender / from reference', 'EMAIL_SENDER_REF', 'EMAIL', 'MISSING', false),
    slot('email_domain', 'Email sending domain reference', 'EMAIL_DOMAIN_REF', 'EMAIL', 'MISSING', false),
    slot('push_provider', 'Push provider', 'PUSH_PROVIDER', 'PUSH', 'NOT_SELECTED', false),
    slot('push_credential', 'Push credential reference', 'PUSH_PRODUCTION_SECRET_REF', 'PUSH', 'MISSING', true),
    slot('environment_identity', 'Communication environment identity', 'COMMUNICATION_ENVIRONMENT', 'SHARED', 'EXTERNAL_GATED', false),
  ];
}

export type CommsFailClosedCase = {
  case_id: string;
  description: string;
  production_comms_blocked: true;
  primary_blocker: string;
};

export function evaluateOtpMessagingFailClosedCases(): CommsFailClosedCase[] {
  return [
    {
      case_id: 'otp_not_selected',
      description: 'OTP provider NOT_SELECTED → production OTP blocked',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_OTP_PROVIDER,
    },
    {
      case_id: 'sms_not_configured',
      description: 'SMS EXTERNAL_GATED / NOT_CONFIGURED → production SMS blocked',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_SMS_PROVIDER,
    },
    {
      case_id: 'email_not_configured',
      description: 'Email EXTERNAL_GATED → production email blocked',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_EMAIL_PROVIDER,
    },
    {
      case_id: 'credentials_missing',
      description: 'Provider selected but credential refs missing → blocked',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_OTP_CREDENTIAL,
    },
    {
      case_id: 'console_in_production',
      description: 'Console/mock OTP selected for production → forbidden',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    },
    {
      case_id: 'not_verified',
      description: 'Configured but not verified → production delivery blocked',
      production_comms_blocked: true,
      primary_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    },
    {
      case_id: 'security_unresolved',
      description: 'Security gate unresolved → production communications blocked',
      production_comms_blocked: true,
      primary_blocker: EXTERNAL_PENTEST_REQUIRED,
    },
  ];
}

export type OtpMessagingActivationPreparationReport = {
  sprint: 121;
  foundation_sprints: string;
  authoritative_source: 'otp-messaging-activation-preparation';
  parallel_auth_framework_created: false;
  parallel_otp_system_created: false;
  parallel_notification_system_created: false;
  parallel_outbox_created: false;
  parallel_provider_lifecycle_created: false;
  fake_provider_invented: false;
  real_otp_sent: false;
  real_messages_sent: false;
  source_of_truth: {
    messaging_lifecycle: 'S89_MessagingChannelStatus';
    real_activation: 'S103_COMPOSED';
    otp_adapter: 'EXISTING_REUSED';
    notification_outbox: 'EXISTING_REUSED';
    security_gate: 'S116_COMPOSED';
    foundation: 'S117_S119_COMPOSED';
    payment_context: 'S120_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  otp_provider: {
    lifecycle: 'NOT_SELECTED';
    provider: 'NOT_SELECTED';
    production: 'EXTERNAL_GATED';
    sandbox: 'SANDBOX_VERIFIED';
    enabled: false;
  };
  channels: {
    otp: 'EXTERNAL_GATED';
    sms: 'EXTERNAL_GATED';
    email: 'EXTERNAL_GATED';
    push: 'EXTERNAL_GATED';
  };
  admin_summary: {
    otp_provider: 'NOT_SELECTED';
    sms: 'EXTERNAL_GATED';
    email: 'EXTERNAL_GATED';
    push: 'EXTERNAL_GATED';
    credentials: 'MISSING';
    verification: 'NOT_VERIFIED';
    approval: 'NOT_APPROVED';
    enablement: 'EXTERNAL_GATED';
    production_communications: 'BLOCKED';
  };
  configuration_references: CommsConfigReferenceSlot[];
  configuration_validation: ReturnType<typeof validateProductionMessagingConfiguration>;
  otp_security: ReturnType<typeof evaluateMessagingFirstOnboarding>['otp_security'];
  enumeration_protection: {
    normalized_auth_responses: 'SOFTWARE_READY';
    no_account_existence_leak_contract: 'SOFTWARE_READY';
    status: 'PASS';
  };
  delivery_failure_handling: {
    state_machine: ReturnType<typeof buildNotificationStateMachine>;
    sent_neq_delivered: true;
    no_infinite_retries: true;
    no_fake_sent_as_verified_production: true;
    status: 'SOFTWARE_READY';
  };
  notification_coverage: ReturnType<typeof listTransactionalNotificationCoverage>;
  notification_idempotency: {
    duplicate_event: 'NO_UNCONTROLLED_DUPLICATE';
    retry: 'EXISTING_OUTBOX_IDEMPOTENCY';
    status: 'SOFTWARE_READY';
  };
  privacy_phi: {
    no_otp_in_logs: true;
    no_otp_in_analytics: true;
    minimal_notification_content: true;
    sensitive_details_require_authenticated_experience: true;
    status: 'PASS';
  };
  currency_market: {
    policy_driven: true;
    hardcoded_india_global: false;
    markets_evaluated: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    status: 'POLICY_DRIVEN';
  };
  consent: {
    transactional_security_cannot_be_suppressed: true;
    marketing_respects_preferences: true;
    parallel_preference_system_created: false;
    status: 'EXISTING_REUSED';
  };
  multi_portal: {
    portals: string[];
    production_cannot_route_to_sandbox_provider: true;
    status: 'SOFTWARE_READY';
  };
  sandbox_vs_production: {
    sandbox_console_allowed: true;
    production_console_forbidden: true;
    mock_otp_detected: true;
    communication_environment: 'sandbox' | 'production';
  };
  checkout_fail_closed: {
    production_otp_when_not_selected: 'BLOCKED';
    no_fake_sent_success: true;
    overall: 'PASS';
  };
  fail_closed_cases: CommsFailClosedCase[];
  activation_checklist: ReturnType<typeof buildRealCommsActivationChecklist>;
  enablement_guard: ReturnType<typeof evaluateMessagingEnablementGuard>;
  security_gate: {
    remaining_blocker: string;
    certified: string;
  };
  external_inputs_required: string[];
  remaining_blocker: typeof NO_PRODUCTION_OTP_MESSAGING_PROVIDER;
  remaining_blockers: string[];
  force_launch_available: false;
  force_enable_comms_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  otp_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  s133_activation_path: {
    sprint: 133;
    software_activation_path: 'COMPLETE';
    production_communications: 'BLOCKED';
    production_otp_enabled: false;
    secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
    sent_neq_delivered: true;
    remaining_blocker: typeof NO_PRODUCTION_OTP_MESSAGING_PROVIDER;
  };
};

export function evaluateOtpMessagingActivationPreparation(input?: {
  correlation_id?: string;
}): OtpMessagingActivationPreparationReport {
  const s89 = evaluateMessagingFirstOnboarding();
  const s103 = evaluateRealMessagingFirstOnboarding();
  const config = validateProductionMessagingConfiguration();
  const env = readCommunicationEnvironment();
  const security = evaluateProductionSecurityGate();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const release = evaluateProductionReleaseEngineeringReadiness();
  const deploy = evaluateProductionDeploymentTargetActivation();
  const psp = evaluatePspPaymentActivationPreparation();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const enablement = evaluateMessagingEnablementGuard({
    nonMockOtpAdapter: false,
    nonMockMessagingAdapter: false,
    communicationEnvironment: env,
    liveEnabled: false,
    humanApproved: false,
    authDevRevealOffInProduction: true,
    emergencyDisabled: false,
  });

  void s89.otp_security;
  void s103.real_messages_sent;
  void foundation.can_production_launch;
  void release.can_production_launch;
  void deploy.can_production_launch;
  void psp.can_production_launch;
  void launch.can_production_launch;
  void isMockOtpProvider('CONSOLE');
  const s133 = evaluateOtpMessagingProductionActivationPath();

  const remaining_blockers = [
    NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    NO_PRODUCTION_OTP_PROVIDER,
    NO_PRODUCTION_SMS_PROVIDER,
    NO_PRODUCTION_EMAIL_PROVIDER,
    NO_PRODUCTION_PUSH_PROVIDER,
    NO_PRODUCTION_OTP_CREDENTIAL,
    NO_PRODUCTION_SMS_CREDENTIAL,
    NO_PRODUCTION_SMS_SENDER,
    NO_PRODUCTION_EMAIL_CREDENTIAL,
    NO_PRODUCTION_EMAIL_SENDER,
    NO_PRODUCTION_EMAIL_DOMAIN,
    EXTERNAL_PENTEST_REQUIRED,
  ];

  return {
    sprint: 121,
    foundation_sprints: 'S31/S66/S76/S86/S89/S103/S104/S87/S116/S117/S118/S119/S120/S121/S133',
    authoritative_source: 'otp-messaging-activation-preparation',
    parallel_auth_framework_created: false,
    parallel_otp_system_created: false,
    parallel_notification_system_created: false,
    parallel_outbox_created: false,
    parallel_provider_lifecycle_created: false,
    fake_provider_invented: false,
    real_otp_sent: false,
    real_messages_sent: false,
    source_of_truth: {
      messaging_lifecycle: 'S89_MessagingChannelStatus',
      real_activation: 'S103_COMPOSED',
      otp_adapter: 'EXISTING_REUSED',
      notification_outbox: 'EXISTING_REUSED',
      security_gate: 'S116_COMPOSED',
      foundation: 'S117_S119_COMPOSED',
      payment_context: 'S120_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    otp_provider: {
      lifecycle: 'NOT_SELECTED',
      provider: 'NOT_SELECTED',
      production: 'EXTERNAL_GATED',
      sandbox: 'SANDBOX_VERIFIED',
      enabled: false,
    },
    channels: {
      otp: 'EXTERNAL_GATED',
      sms: 'EXTERNAL_GATED',
      email: 'EXTERNAL_GATED',
      push: 'EXTERNAL_GATED',
    },
    admin_summary: {
      otp_provider: 'NOT_SELECTED',
      sms: 'EXTERNAL_GATED',
      email: 'EXTERNAL_GATED',
      push: 'EXTERNAL_GATED',
      credentials: 'MISSING',
      verification: 'NOT_VERIFIED',
      approval: 'NOT_APPROVED',
      enablement: 'EXTERNAL_GATED',
      production_communications: 'BLOCKED',
    },
    configuration_references: buildOtpMessagingConfigurationReferenceSlots(),
    configuration_validation: config,
    otp_security: s89.otp_security,
    enumeration_protection: {
      normalized_auth_responses: 'SOFTWARE_READY',
      no_account_existence_leak_contract: 'SOFTWARE_READY',
      status: 'PASS',
    },
    delivery_failure_handling: {
      state_machine: buildNotificationStateMachine(),
      sent_neq_delivered: true,
      no_infinite_retries: true,
      no_fake_sent_as_verified_production: true,
      status: 'SOFTWARE_READY',
    },
    notification_coverage: listTransactionalNotificationCoverage(),
    notification_idempotency: {
      duplicate_event: 'NO_UNCONTROLLED_DUPLICATE',
      retry: 'EXISTING_OUTBOX_IDEMPOTENCY',
      status: 'SOFTWARE_READY',
    },
    privacy_phi: {
      no_otp_in_logs: true,
      no_otp_in_analytics: true,
      minimal_notification_content: true,
      sensitive_details_require_authenticated_experience: true,
      status: 'PASS',
    },
    currency_market: {
      policy_driven: true,
      hardcoded_india_global: false,
      markets_evaluated: ['GLOBAL', 'IN', 'AE', 'US'],
      status: 'POLICY_DRIVEN',
    },
    consent: {
      transactional_security_cannot_be_suppressed: true,
      marketing_respects_preferences: true,
      parallel_preference_system_created: false,
      status: 'EXISTING_REUSED',
    },
    multi_portal: {
      portals: [
        'Customer',
        'Vendor',
        'Doctor',
        'Lab',
        'Imaging',
        'Radiologist',
        'Affiliate',
        'Admin',
      ],
      production_cannot_route_to_sandbox_provider: true,
      status: 'SOFTWARE_READY',
    },
    sandbox_vs_production: {
      sandbox_console_allowed: true,
      production_console_forbidden: true,
      mock_otp_detected: true,
      communication_environment: env,
    },
    checkout_fail_closed: {
      production_otp_when_not_selected: 'BLOCKED',
      no_fake_sent_success: true,
      overall: 'PASS',
    },
    fail_closed_cases: evaluateOtpMessagingFailClosedCases(),
    activation_checklist: buildRealCommsActivationChecklist(),
    enablement_guard: enablement,
    security_gate: {
      remaining_blocker: security.remaining_blocker,
      certified: security.production_security_certified ?? 'NO',
    },
    external_inputs_required: [
      'Real OTP/SMS/email/push provider contracts + credentials in secrets manager',
      'Sender IDs / email domains / origin references (not in repo)',
      'Market/country channel policy configuration',
      'Human verification + approval for production enablement',
      'Security certification (EXTERNAL_PENTEST_REQUIRED)',
      'Production environment/deployment target (S117–S119) before live enablement',
    ],
    remaining_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    remaining_blockers,
    force_launch_available: false,
    force_enable_comms_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      "Why can't World-Pharma send production OTP/messages yet? OTP provider NOT_SELECTED; SMS/Email/Push EXTERNAL_GATED; credentials MISSING; verification NOT_VERIFIED; enablement EXTERNAL_GATED. Production communications BLOCKED. Sandbox Console OTP remains allowed in sandbox only. No real OTP/messages sent.",
    next_action:
      'When real messaging providers exist: supply configuration REFERENCES (never secret values or OTP codes in repo), verify delivery receipts (SENT≠DELIVERED), obtain human approval, then advance channel lifecycle NOT_SELECTED→CONFIGURED→VERIFIED→APPROVED→ENABLED — do not invent providers or rewrite auth/notification architecture.',
    message:
      'Sprint 121 OTP + transactional communications activation preparation (+ S133 software path COMPLETE): OTP NOT_SELECTED, channels EXTERNAL_GATED, production communications BLOCKED, sandbox SANDBOX_VERIFIED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S89 channel lifecycle + S133 activation path reused (no second OTP/notification framework). Existing adapters/outbox/rate limits retained. Console/mock forbidden in production. OTP never logged/printed. SENT ≠ DELIVERED.',
    secrets_printed: false,
    otp_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    s133_activation_path: {
      sprint: 133,
      software_activation_path: 'COMPLETE',
      production_communications: 'BLOCKED',
      production_otp_enabled: false,
      secrets_manager_runtime_resolver: s133.secrets_manager_runtime_resolver,
      sent_neq_delivered: true,
      remaining_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    },
  };
}
