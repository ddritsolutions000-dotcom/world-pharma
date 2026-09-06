/**
 * Sprint 103 — Real OTP + transactional communications activation readiness.
 * Composes S66/S76/S86/S89. Never invents providers/credentials/sender IDs.
 * Never sends real OTP/SMS/email/push.
 */
import {
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  evaluateMessagingFirstOnboarding,
  type MessagingChannelStatus,
} from './messaging-first-onboarding';
import {
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_DOMAIN,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_SENDER,
  validateProductionMessagingConfiguration,
} from './production-messaging-requirements';
import { evaluateProductionFoundationFirstOnboarding } from '../ops/production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';

export {
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
};

export type RealCommsLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealCommsRailSummary = {
  rail: 'OTP' | 'SMS' | 'EMAIL' | 'PUSH';
  provider_selected: false;
  lifecycle: RealCommsLifecycle;
  sandbox: string;
  production: 'EXTERNAL_GATED';
  enabled: false;
  configuration_readiness: 'MISSING' | 'PARTIAL' | 'READY';
  credentials_readiness: 'MISSING' | 'PARTIAL' | 'READY' | 'N/A';
  sender_domain_readiness: 'MISSING' | 'PARTIAL' | 'READY' | 'N/A';
  delivery_capability: 'SANDBOX_ONLY' | 'EXTERNAL_GATED' | 'NOT_APPLICABLE';
  compliance_status: 'PENDING' | 'EXTERNAL_GATED';
  blocker: string;
  next_action: string;
};

export type RealCommsChecklistItem = {
  id: string;
  rail: 'OTP' | 'SMS' | 'EMAIL' | 'PUSH' | 'SHARED';
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

function channelLifecycle(ch: MessagingChannelStatus): RealCommsLifecycle {
  if (ch.enabled) return 'ENABLED';
  if (ch.activation_stage === 'NOT_SELECTED' || ch.provider === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (ch.activation_stage === 'DISABLED') return 'DISABLED';
  return 'EXTERNAL_GATED';
}

export function buildRealCommsActivationChecklist(): RealCommsChecklistItem[] {
  const v = validateProductionMessagingConfiguration();
  return [
    {
      id: 'otp_provider_selected',
      rail: 'OTP',
      label: 'Real OTP provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'otp_credentials',
      rail: 'OTP',
      label: 'OTP credentials via secret manager?',
      mandatory: true,
      status: v.otp_credential?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'sms_provider_selected',
      rail: 'SMS',
      label: 'Real SMS provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'sms_credentials',
      rail: 'SMS',
      label: 'SMS credentials via secret manager?',
      mandatory: true,
      status: v.sms_credential?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'sms_sender',
      rail: 'SMS',
      label: 'SMS sender/origin configured?',
      mandatory: true,
      status: v.sms_sender?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'email_provider_selected',
      rail: 'EMAIL',
      label: 'Real email provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'email_credentials',
      rail: 'EMAIL',
      label: 'Email credentials via secret manager?',
      mandatory: true,
      status: v.email_credential?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'email_sender',
      rail: 'EMAIL',
      label: 'Email sender identity configured?',
      mandatory: true,
      status: v.email_sender?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'email_domain',
      rail: 'EMAIL',
      label: 'Sending domain / DKIM-SPF-DMARC readiness?',
      mandatory: true,
      status: v.email_domain?.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'push_provider_selected',
      rail: 'PUSH',
      label: 'Real push provider selected?',
      mandatory: false,
      status: 'MISSING',
    },
    {
      id: 'market_configuration',
      rail: 'SHARED',
      label: 'Market/policy configuration complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'legal_compliance',
      rail: 'SHARED',
      label: 'Legal/compliance requirements complete?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'sandbox_verification',
      rail: 'SHARED',
      label: 'Sandbox verification complete?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'monitoring',
      rail: 'SHARED',
      label: 'Monitoring configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'rollback_disable',
      rail: 'SHARED',
      label: 'Rollback/disable path available?',
      mandatory: true,
      status: 'PRESENT',
    },
  ];
}

function summarizeRail(
  rail: 'OTP' | 'SMS' | 'EMAIL' | 'PUSH',
  ch: MessagingChannelStatus,
  blocker: string,
  senderDomain: 'MISSING' | 'PARTIAL' | 'READY' | 'N/A',
): RealCommsRailSummary {
  return {
    rail,
    provider_selected: false,
    lifecycle: channelLifecycle(ch),
    sandbox: ch.sandbox,
    production: 'EXTERNAL_GATED',
    enabled: false,
    configuration_readiness: 'MISSING',
    credentials_readiness: 'MISSING',
    sender_domain_readiness: senderDomain,
    delivery_capability: rail === 'OTP' ? 'SANDBOX_ONLY' : 'EXTERNAL_GATED',
    compliance_status: 'EXTERNAL_GATED',
    blocker,
    next_action: `Select real ${rail} provider + vault credentials; do not invent sender IDs or send real messages.`,
  };
}

export type RealMessagingFirstOnboardingReport = {
  sprint: 103;
  foundation_sprints: string;
  activation_lifecycle: RealCommsLifecycle;
  environment: 'sandbox' | 'production';
  real_otp_provider_selected: false;
  real_sms_provider_selected: false;
  real_email_provider_selected: false;
  real_push_provider_selected: false;
  production_otp_enabled: false;
  production_sms_enabled: false;
  production_email_enabled: false;
  production_push_enabled: false;
  real_messages_sent: false;
  ready_for_activation: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  rails: RealCommsRailSummary[];
  checklist: RealCommsChecklistItem[];
  otp_security: ReturnType<typeof evaluateMessagingFirstOnboarding>['otp_security'];
  notification_state_machine: ReturnType<typeof evaluateMessagingFirstOnboarding>['notification_state_machine'];
  sent_vs_delivered: ReturnType<typeof evaluateMessagingFirstOnboarding>['sent_vs_delivered'];
  outbox_idempotency: ReturnType<typeof evaluateMessagingFirstOnboarding>['outbox_idempotency'];
  transactional_notification_coverage: ReturnType<
    typeof evaluateMessagingFirstOnboarding
  >['transactional_notification_coverage'];
  phi_minimization: ReturnType<typeof evaluateMessagingFirstOnboarding>['phi_minimization'];
  consent: ReturnType<typeof evaluateMessagingFirstOnboarding>['consent'];
  country_policy: ReturnType<typeof evaluateMessagingFirstOnboarding>['country_policy'];
  remaining_blocker: typeof NO_PRODUCTION_OTP_MESSAGING_PROVIDER;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s89_plane: 'COMPOSED';
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  native_device: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  otp_codes_logged: false;
  fake_provider_invented: false;
  fake_production_delivery_claimed: false;
  evaluated_at: string;
  message: string;
};

export function evaluateRealMessagingFirstOnboarding(
  input?: { correlation_id?: string },
): RealMessagingFirstOnboardingReport {
  const s89 = evaluateMessagingFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealCommsActivationChecklist();

  const rails: RealCommsRailSummary[] = [
    summarizeRail('OTP', s89.otp, NO_PRODUCTION_OTP_PROVIDER, 'N/A'),
    summarizeRail('SMS', s89.sms, NO_PRODUCTION_SMS_PROVIDER, 'MISSING'),
    summarizeRail('EMAIL', s89.email, NO_PRODUCTION_EMAIL_PROVIDER, 'MISSING'),
    summarizeRail('PUSH', s89.push, NO_PRODUCTION_PUSH_PROVIDER, 'N/A'),
  ];

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
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s89.remaining_blockers.slice(0, 6),
  ];

  return {
    sprint: 103,
    foundation_sprints: '31,45,66,76,86,87,89,97,98,100,101,102',
    activation_lifecycle: 'NOT_SELECTED',
    environment: s89.environment,
    real_otp_provider_selected: false,
    real_sms_provider_selected: false,
    real_email_provider_selected: false,
    real_push_provider_selected: false,
    production_otp_enabled: false,
    production_sms_enabled: false,
    production_email_enabled: false,
    production_push_enabled: false,
    real_messages_sent: false,
    ready_for_activation: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    rails,
    checklist,
    otp_security: s89.otp_security,
    notification_state_machine: s89.notification_state_machine,
    sent_vs_delivered: s89.sent_vs_delivered,
    outbox_idempotency: s89.outbox_idempotency,
    transactional_notification_coverage: s89.transactional_notification_coverage,
    phi_minimization: s89.phi_minimization,
    consent: s89.consent,
    country_policy: s89.country_policy,
    remaining_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select real OTP/SMS/email/(optional push) providers + vault credentials + sender/domain evidence via S101 secrets manager. Do not invent providers or send real messages. SENT ≠ DELIVERED.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s89_plane: 'COMPOSED',
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    native_device: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    otp_codes_logged: false,
    fake_provider_invented: false,
    fake_production_delivery_claimed: false,
    evaluated_at: new Date().toISOString(),
    message:
      'Sprint 103 real OTP/SMS/email/push activation readiness: all channels NOT_SELECTED / EXTERNAL_GATED. Console OTP sandbox remains SANDBOX_VERIFIED. SENT ≠ DELIVERED. REAL MESSAGES SENT = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}
