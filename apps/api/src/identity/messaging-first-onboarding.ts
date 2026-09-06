/**
 * Sprint 66/76 foundation + Sprint 86 readiness + Sprint 89 production
 * OTP + transactional communications activation readiness.
 * Never invent providers, credentials, sender IDs, or production delivery success.
 * Never print secrets or OTP codes.
 *
 * ConsoleOtpAdapter sandbox auth = SANDBOX_VERIFIED.
 * Production OTP/SMS/email/push = EXTERNAL_GATED until real non-mock adapters + human gates exist.
 * SENT ≠ DELIVERED — DELIVERED requires provider receipt.
 */
import {
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from '../identity/communication.config';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_DOMAIN,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_SENDER,
  validateProductionMessagingConfiguration,
  type ProductionMessagingConfigurationValidation,
} from './production-messaging-requirements';

/** Umbrella blocker retained from S66/S76/S86. Never remove. */
export const NO_PRODUCTION_OTP_MESSAGING_PROVIDER = 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER';
/** Granular channel blockers (S86 + S89). */
export const NO_PRODUCTION_OTP_PROVIDER = 'NO_PRODUCTION_OTP_PROVIDER';
export const NO_PRODUCTION_SMS_PROVIDER = 'NO_PRODUCTION_SMS_PROVIDER';
export const NO_PRODUCTION_EMAIL_PROVIDER = 'NO_PRODUCTION_EMAIL_PROVIDER';
export const NO_PRODUCTION_PUSH_PROVIDER = 'NO_PRODUCTION_PUSH_PROVIDER';

export {
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_SENDER,
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_EMAIL_DOMAIN,
};
export type MessagingChannelStatus = {
  channel: 'OTP' | 'SMS' | 'EMAIL' | 'PUSH';
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE' | 'NOT_APPLICABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  webhook_callback: 'NOT_APPLICABLE' | 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  remaining_blocker: string;
  status: 'PASS' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'NOT_VERIFIED' | 'SANDBOX_VERIFIED';
  activation_stage:
    | 'NOT_SELECTED'
    | 'CONFIGURED'
    | 'VERIFIED'
    | 'APPROVED'
    | 'ENABLED'
    | 'DISABLED'
    | 'EXTERNAL_GATED';
};

export type MessagingEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type MessagingValidationStatus =
  | 'NOT_SELECTED'
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

/** Target + sandbox notification delivery states (provider-independent). */
export type NotificationStateMachine = {
  success_path: Array<
    'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'SANDBOX_DELIVERED'
  >;
  failure_states: Array<'FAILED' | 'RETRYING' | 'CANCELLED' | 'DEAD_LETTER' | 'EXTERNAL_GATED'>;
  notes: string[];
  /** Without a live provider, never claim end-user DELIVERED for SMS/email/push. */
  delivered_requires_provider_receipt: true;
  accepted_by_provider_state: 'SENT';
  delivered_to_user_state: 'DELIVERED';
};

export type OtpSecurityChecklist = {
  never_logged_in_production: true;
  never_returned_in_production_responses: true;
  expiry_enforced: true;
  attempt_limits: true;
  resend_throttling: true;
  brute_force_protection: true;
  purpose_binding: true;
  replay_prevention: true;
  rate_limits_server_side: true;
  replacement_invalidates_prior: true;
  session_binding: true;
  auth_dev_reveal_otp_production: 'MUST_BE_FALSE';
  auth_dev_reveal_otp_current_safe: boolean;
};

export type TransactionalNotificationCoverageItem = {
  event: string;
  category: string;
  status: 'SOFTWARE_READY' | 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED' | 'POLICY_REQUIRED' | 'LEGAL_GATED';
  channels: Array<'IN_APP' | 'SMS' | 'EMAIL' | 'PUSH'>;
};

export type MessagingFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S86 on S76/S66 rail. */
  sprint: 89;
  foundation_sprint: 86;
  real_provider_available: false | true;
  environment: 'sandbox' | 'production';
  live_flag: boolean;
  remaining_blocker: typeof NO_PRODUCTION_OTP_MESSAGING_PROVIDER | string;
  remaining_blockers: string[];
  channels: MessagingChannelStatus[];
  otp: MessagingChannelStatus;
  sms: MessagingChannelStatus;
  email: MessagingChannelStatus;
  push: MessagingChannelStatus;
  otp_activation_stage: string;
  messaging_activation_stage: string;
  sandbox_authentication: 'SANDBOX_VERIFIED';
  production_authentication: 'EXTERNAL_GATED';
  sandbox_cannot_silently_become_production: true;
  enablement_guard: {
    can_enable: false | true;
    checks: MessagingEnablementGuardCheck[];
  };
  otp_security: OtpSecurityChecklist;
  notification_state_machine: NotificationStateMachine;
  sent_vs_delivered: {
    sent: 'accepted_by_provider';
    delivered: 'confirmed_to_user_requires_receipt';
    sandbox_in_app_may_use: 'SANDBOX_DELIVERED';
    production_sms_email_push_without_provider: 'EXTERNAL_GATED';
    never_fake_delivered_without_receipt: true;
  };
  outbox_idempotency: {
    occurrence_keys: 'DETERMINISTIC';
    duplicate_event_safe: true;
    otp_resend_throttled: true;
    retry_safe: true;
  };
  delivery_receipts: {
    status: 'EXTERNAL_GATED' | 'SANDBOX_ONLY' | 'NOT_APPLICABLE';
    signature_validation: 'REQUIRED_WHEN_PROVIDER_SUPPLIED';
    idempotent_receipts: true;
  };
  transactional_notification_coverage: TransactionalNotificationCoverageItem[];
  consent: {
    security_auth_independent_of_marketing: true;
    transactional_independent_of_marketing: true;
    marketing_opt_in_required_for_promotional: true;
  };
  country_policy: {
    status: 'POLICY_DRIVEN' | 'POLICY_REQUIRED' | 'LEGAL_REVIEW_REQUIRED';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  configuration_validation: ProductionMessagingConfigurationValidation;
  force_launch_available: false;
  phi_minimization: {
    templates_avoid_unnecessary_phi: true;
    prefer_authenticated_deep_links: true;
  };
  fake_provider_invented: false;
  fake_production_delivery_claimed: false;
  fake_sender_identity: false;
  native_device: 'DEVICE_NOT_AVAILABLE';
  android: 'DEVICE_NOT_AVAILABLE';
  ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  otp_codes_logged: false;
  message: string;
  next_action: string;
};

export function listTransactionalNotificationCoverage(): TransactionalNotificationCoverageItem[] {
  const gatedChannels: TransactionalNotificationCoverageItem['channels'] = ['IN_APP'];
  const item = (
    event: string,
    category: string,
    status: TransactionalNotificationCoverageItem['status'] = 'SANDBOX_VERIFIED',
  ): TransactionalNotificationCoverageItem => ({
    event,
    category,
    status,
    channels: gatedChannels,
  });
  return [
    // AUTH — OTP itself is adapter-bound; security notices are in-app ready
    item('AUTH_LOGIN_OTP', 'auth', 'EXTERNAL_GATED'),
    item('AUTH_RECOVERY_OTP', 'auth', 'EXTERNAL_GATED'),
    item('AUTH_SECURITY_NOTIFICATION', 'auth'),
    // CUSTOMER COMMERCE
    item('ORDER_CREATED', 'order'),
    item('ORDER_CONFIRMED', 'order'),
    item('PAYMENT_CAPTURED', 'payment'),
    item('PAYMENT_REQUIRES_ACTION', 'payment'),
    item('ORDER_REFUNDED', 'refund'),
    item('SHIPMENT_CREATED', 'shipment'),
    item('SHIPMENT_IN_TRANSIT', 'shipment'),
    item('ORDER_OUT_FOR_DELIVERY', 'delivery'),
    item('ORDER_DELIVERED', 'delivery'),
    item('ORDER_CANCELLED', 'order'),
    // VENDOR
    item('ORDER_ALLOCATED', 'vendor'),
    item('ORDER_READY_FOR_SHIPMENT', 'vendor'),
    item('SETTLEMENT_STATUS_CHANGED', 'vendor', 'EXTERNAL_GATED'),
    // DOCTOR / CLINICAL WORKFLOW
    item('APPOINTMENT_CREATED', 'doctor'),
    item('APPOINTMENT_CONFIRMED', 'doctor'),
    item('APPOINTMENT_REMINDER', 'consultation', 'POLICY_REQUIRED'),
    item('ENCOUNTER_COMPLETED', 'doctor'),
    // LAB / IMAGING (PHI-minimized titles; content LEGAL_GATED for results)
    item('LAB_BOOKING_CREATED', 'lab'),
    item('LAB_SAMPLE_COLLECTED', 'lab'),
    item('LAB_RESULT_READY', 'lab', 'LEGAL_GATED'),
    item('IMAGING_BOOKING_CREATED', 'imaging'),
    item('IMAGING_RESULT_READY', 'imaging', 'LEGAL_GATED'),
    item('PRESCRIPTION_READY', 'prescription', 'LEGAL_GATED'),
    // AFFILIATE
    item('AFFILIATE_REFERRAL_CREATED', 'affiliate'),
    item('AFFILIATE_REVENUE_UPDATE', 'affiliate', 'EXTERNAL_GATED'),
    // ADMIN / OPS + partner
    item('KYC_STATUS_CHANGED', 'partner'),
    item('SUPPORT_TICKET_UPDATE', 'ops'),
    {
      event: 'SMS_EMAIL_PUSH_PRODUCTION',
      category: 'external_channel',
      status: 'EXTERNAL_GATED',
      channels: ['SMS', 'EMAIL', 'PUSH'],
    },
  ];
}

/**
 * Credentials alone never return ENABLED.
 */
export function validateMessagingConfiguration(input: {
  nonMockOtpAdapter: boolean;
  nonMockMessagingAdapter: boolean;
  communicationEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  authDevRevealOffInProduction: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
  legalPrivacyClear?: boolean;
}): MessagingValidationStatus {
  if (!input.nonMockOtpAdapter && !input.nonMockMessagingAdapter) return 'NOT_SELECTED';
  if (input.emergencyDisabled) return 'DISABLED';
  if (input.communicationEnvironment !== 'production' || !input.liveEnabled) {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.authDevRevealOffInProduction) return 'VERIFIED_BUT_DISABLED';
  if (
    !input.humanApproved ||
    input.countryPolicyConfigured === false ||
    input.legalPrivacyClear === false
  ) {
    return 'VERIFIED_BUT_DISABLED';
  }
  return 'APPROVED'; // never ENABLED from validator alone
}

export function evaluateMessagingEnablementGuard(input: {
  nonMockOtpAdapter: boolean;
  nonMockMessagingAdapter: boolean;
  communicationEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  authDevRevealOffInProduction: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
  legalPrivacyClear?: boolean;
}): { can_enable: false | true; checks: MessagingEnablementGuardCheck[] } {
  const checks: MessagingEnablementGuardCheck[] = [
    {
      id: 'non_mock_otp_adapter',
      ok: input.nonMockOtpAdapter,
      detail: input.nonMockOtpAdapter
        ? 'Non-mock OTP adapter registered'
        : 'Only ConsoleOtpAdapter / MOCK — no production OTP adapter',
    },
    {
      id: 'non_mock_messaging_adapter',
      ok: input.nonMockMessagingAdapter,
      detail: input.nonMockMessagingAdapter
        ? 'Non-mock messaging adapter registered'
        : 'Transactional SMS/email remain CONSOLE / EXTERNAL_GATED',
    },
    {
      id: 'environment_production',
      ok: input.communicationEnvironment === 'production',
      detail: `COMMUNICATION_ENVIRONMENT=${input.communicationEnvironment}`,
    },
    {
      id: 'live_flag',
      ok: input.liveEnabled,
      detail: input.liveEnabled ? 'OTP/COMMUNICATION_LIVE_ENABLED=true' : 'Live messaging flag is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_OTP_AUTH / MESSAGING approval missing',
    },
    {
      id: 'auth_dev_reveal_off',
      ok: input.authDevRevealOffInProduction,
      detail: input.authDevRevealOffInProduction
        ? 'AUTH_DEV_REVEAL_OTP not forcing production reveal'
        : 'AUTH_DEV_REVEAL_OTP must be false for production messaging',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Country/channel policy POLICY_REQUIRED'
          : 'Country/channel policy is policy-driven (no hardcoded market in messaging rail)',
    },
    {
      id: 'legal_privacy',
      ok: input.legalPrivacyClear !== false,
      detail:
        input.legalPrivacyClear === false
          ? 'LEGAL_REVIEW_REQUIRED for production messaging'
          : 'Legal/privacy gate tracked separately; not blocking sandbox',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

function channel(
  name: MessagingChannelStatus['channel'],
  opts: Partial<MessagingChannelStatus> &
    Pick<MessagingChannelStatus, 'sandbox' | 'production' | 'status' | 'activation_stage' | 'remaining_blocker'>,
): MessagingChannelStatus {
  return {
    channel: name,
    provider: 'NOT_SELECTED',
    environment: readCommunicationEnvironment(),
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    webhook_callback: name === 'PUSH' ? 'NOT_APPLICABLE' : 'EXTERNAL_GATED',
    ...opts,
  };
}

export function buildNotificationStateMachine(): NotificationStateMachine {
  return {
    success_path: ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'SANDBOX_DELIVERED'],
    failure_states: ['FAILED', 'RETRYING', 'CANCELLED', 'DEAD_LETTER', 'EXTERNAL_GATED'],
    notes: [
      'SENT = accepted by provider (≠ delivered to user).',
      'DELIVERED requires provider delivery receipt; do not claim without it.',
      'In-app sandbox path may use SANDBOX_DELIVERED; SMS/email/push without provider stay EXTERNAL_GATED.',
      'NOT_SELECTED provider must not raise false provider-outage alerts.',
    ],
    delivered_requires_provider_receipt: true,
    accepted_by_provider_state: 'SENT',
    delivered_to_user_state: 'DELIVERED',
  };
}

/** Authoritative OTP/messaging onboarding snapshot — Console OTP only in this codebase. */
export function evaluateMessagingFirstOnboarding(): MessagingFirstOnboardingReport {
  const env = readCommunicationEnvironment();
  const live = isLiveOtpEnabled();
  const otpRow = evaluateProviderActivation(getProviderActivationContract('OTP_AUTH'));
  const msgRow = evaluateProviderActivation(getProviderActivationContract('MESSAGING'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_OTP_AUTH']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_MESSAGING']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_OTP_AUTH']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_MESSAGING']?.trim().toLowerCase() === 'true';
  const reveal = process.env['AUTH_DEV_REVEAL_OTP']?.trim().toLowerCase() === 'true';
  const authDevRevealOffInProduction = !(env === 'production' && reveal);

  // No non-mock adapters in this codebase.
  const nonMockOtp = false;
  const nonMockMessaging = false;
  const real = nonMockOtp || nonMockMessaging;

  const guard = evaluateMessagingEnablementGuard({
    nonMockOtpAdapter: nonMockOtp,
    nonMockMessagingAdapter: nonMockMessaging,
    communicationEnvironment: env,
    liveEnabled: live,
    humanApproved,
    authDevRevealOffInProduction,
    emergencyDisabled: emergency,
  });

  const otpChannel = channel('OTP', {
    provider: 'NOT_SELECTED',
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    status: 'SANDBOX_VERIFIED',
    activation_stage: 'EXTERNAL_GATED',
    webhook_callback: 'SANDBOX_ONLY',
    remaining_blocker: NO_PRODUCTION_OTP_PROVIDER,
  });
  const smsChannel = channel('SMS', {
    sandbox: 'SANDBOX_AVAILABLE',
    production: 'EXTERNAL_GATED',
    status: 'EXTERNAL_GATED',
    activation_stage: 'NOT_SELECTED',
    remaining_blocker: NO_PRODUCTION_SMS_PROVIDER,
  });
  const emailChannel = channel('EMAIL', {
    sandbox: 'SANDBOX_AVAILABLE',
    production: 'EXTERNAL_GATED',
    status: 'EXTERNAL_GATED',
    activation_stage: 'NOT_SELECTED',
    remaining_blocker: NO_PRODUCTION_EMAIL_PROVIDER,
  });
  const pushChannel = channel('PUSH', {
    sandbox: 'NOT_APPLICABLE',
    production: 'EXTERNAL_GATED',
    status: 'NOT_VERIFIED',
    activation_stage: 'NOT_SELECTED',
    webhook_callback: 'NOT_APPLICABLE',
    remaining_blocker: NO_PRODUCTION_PUSH_PROVIDER,
  });

  const channels: MessagingChannelStatus[] = [otpChannel, smsChannel, emailChannel, pushChannel];

  void isMockOtpProvider('CONSOLE');

  const configuration_validation = validateProductionMessagingConfiguration({
    otpProviderSelected: nonMockOtp,
    smsProviderSelected: nonMockMessaging,
    emailProviderSelected: nonMockMessaging,
    pushProviderSelected: false,
  });

  const remaining_blockers = [
    NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    NO_PRODUCTION_OTP_PROVIDER,
    NO_PRODUCTION_SMS_PROVIDER,
    NO_PRODUCTION_EMAIL_PROVIDER,
    NO_PRODUCTION_PUSH_PROVIDER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 89,
    foundation_sprint: 86,
    real_provider_available: real,
    environment: env,
    live_flag: live,
    remaining_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    remaining_blockers: [...new Set(remaining_blockers)],
    channels,
    otp: otpChannel,
    sms: smsChannel,
    email: emailChannel,
    push: pushChannel,
    otp_activation_stage: otpRow.stage,
    messaging_activation_stage: msgRow.stage,
    sandbox_authentication: 'SANDBOX_VERIFIED',
    production_authentication: 'EXTERNAL_GATED',
    sandbox_cannot_silently_become_production: true,
    enablement_guard: guard,
    otp_security: {
      never_logged_in_production: true,
      never_returned_in_production_responses: true,
      expiry_enforced: true,
      attempt_limits: true,
      resend_throttling: true,
      brute_force_protection: true,
      purpose_binding: true,
      replay_prevention: true,
      rate_limits_server_side: true,
      replacement_invalidates_prior: true,
      session_binding: true,
      auth_dev_reveal_otp_production: 'MUST_BE_FALSE',
      auth_dev_reveal_otp_current_safe: authDevRevealOffInProduction,
    },
    notification_state_machine: buildNotificationStateMachine(),
    sent_vs_delivered: {
      sent: 'accepted_by_provider',
      delivered: 'confirmed_to_user_requires_receipt',
      sandbox_in_app_may_use: 'SANDBOX_DELIVERED',
      production_sms_email_push_without_provider: 'EXTERNAL_GATED',
      never_fake_delivered_without_receipt: true,
    },
    outbox_idempotency: {
      occurrence_keys: 'DETERMINISTIC',
      duplicate_event_safe: true,
      otp_resend_throttled: true,
      retry_safe: true,
    },
    delivery_receipts: {
      status: 'EXTERNAL_GATED',
      signature_validation: 'REQUIRED_WHEN_PROVIDER_SUPPLIED',
      idempotent_receipts: true,
    },
    transactional_notification_coverage: listTransactionalNotificationCoverage(),
    consent: {
      security_auth_independent_of_marketing: true,
      transactional_independent_of_marketing: true,
      marketing_opt_in_required_for_promotional: true,
    },
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Channel selection is policy-driven; country-specific telecom rules remain LEGAL_REVIEW_REQUIRED when enabling live SMS. Messaging rail does not hardcode a single national market.',
    },
    configuration_validation,
    force_launch_available: false,
    phi_minimization: {
      templates_avoid_unnecessary_phi: true,
      prefer_authenticated_deep_links: true,
    },
    fake_provider_invented: false,
    fake_production_delivery_claimed: false,
    fake_sender_identity: false,
    native_device: 'DEVICE_NOT_AVAILABLE',
    android: 'DEVICE_NOT_AVAILABLE',
    ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    otp_codes_logged: false,
    message: real
      ? 'Real messaging adapter detected — complete enablement guard before live traffic. Foundation: Sprint 86 / 76.'
      : `No production OTP/SMS/email/push provider (${NO_PRODUCTION_OTP_MESSAGING_PROVIDER}). Channels NOT_SELECTED. Production EXTERNAL_GATED. Sandbox console OTP remains SANDBOX_VERIFIED. SENT ≠ DELIVERED. Sprint 89 readiness on Sprint 86/76/66 foundation.`,
    next_action:
      'Supply OTP/SMS/email/push vendor contracts + vault secret refs (OTP_PROVIDER_SECRET_REF, SMS_*, EMAIL_*) + register non-mock adapters; country/legal review; set PROVIDER_APPROVED_OTP_AUTH; AUTH_DEV_REVEAL_OTP=false in production; enable only after guard can_enable=true',
  };
}
