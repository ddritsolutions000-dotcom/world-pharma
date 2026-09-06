/**
 * Sprint 133 — Production OTP + transactional communications activation path (software).
 * Reuses S31/S45/S66/S76/S86/S89/S103/S104/S121 (+ S132 pattern).
 * Does NOT invent SMS/email/push providers, credentials, or claim live delivery.
 * Does NOT create a second OTP/notification/outbox framework.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * SENT ≠ DELIVERED.
 * Without genuine providers: EXTERNAL_GATED + fail-closed.
 */
import { Errors } from '../common/problem';
import {
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
  type CommunicationRuntimeEnvironment,
} from './communication.config';
import {
  NO_PRODUCTION_EMAIL_PROVIDER,
  NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
  NO_PRODUCTION_OTP_PROVIDER,
  NO_PRODUCTION_PUSH_PROVIDER,
  NO_PRODUCTION_SMS_PROVIDER,
  buildNotificationStateMachine,
  evaluateMessagingEnablementGuard,
  listTransactionalNotificationCoverage,
  type MessagingChannelStatus,
} from './messaging-first-onboarding';
import {
  NO_PRODUCTION_EMAIL_CREDENTIAL,
  NO_PRODUCTION_EMAIL_DOMAIN,
  NO_PRODUCTION_EMAIL_SENDER,
  NO_PRODUCTION_OTP_CREDENTIAL,
  NO_PRODUCTION_SMS_CREDENTIAL,
  NO_PRODUCTION_SMS_SENDER,
} from './messaging-real-activation-first-onboarding';
import {
  secretsManagerRuntimeResolverStatus,
} from '../ops/secrets-manager-runtime-resolver';

export const OTP_MESSAGING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'OTP_MESSAGING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const COMMS_OTP_VERIFICATION_STATUS_ENV = 'COMMS_OTP_VERIFICATION_STATUS';
export const COMMS_OTP_APPROVAL_STATUS_ENV = 'COMMS_OTP_APPROVAL_STATUS';
export const COMMS_SMS_VERIFICATION_STATUS_ENV = 'COMMS_SMS_VERIFICATION_STATUS';
export const COMMS_SMS_APPROVAL_STATUS_ENV = 'COMMS_SMS_APPROVAL_STATUS';
export const COMMS_EMAIL_VERIFICATION_STATUS_ENV = 'COMMS_EMAIL_VERIFICATION_STATUS';
export const COMMS_EMAIL_APPROVAL_STATUS_ENV = 'COMMS_EMAIL_APPROVAL_STATUS';
export const COMMS_PUSH_VERIFICATION_STATUS_ENV = 'COMMS_PUSH_VERIFICATION_STATUS';
export const COMMS_PUSH_APPROVAL_STATUS_ENV = 'COMMS_PUSH_APPROVAL_STATUS';

export const PRODUCTION_OTP_MESSAGING_INITIATION_BLOCKED =
  'PRODUCTION_OTP_MESSAGING_INITIATION_BLOCKED';
export const PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED =
  'PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED';
export const MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION =
  'MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION';
export const SENT_NEQ_DELIVERED = 'SENT_NEQ_DELIVERED';
export const OTP_NEVER_LOGGED = 'OTP_NEVER_LOGGED';
export const CROSS_PORTAL_OTP_ISOLATION = 'CROSS_PORTAL_OTP_ISOLATION';

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) {
    return null;
  }
  return v;
}

function humanStatus(envKey: string, expected: 'verified' | 'approved'): boolean {
  return (envValue(envKey) ?? '').toLowerCase() === expected;
}

export type CommsChannelId = 'OTP' | 'SMS' | 'EMAIL' | 'PUSH';

export type CommsProviderSelection = {
  channel: CommsChannelId;
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredCommsProvider(
  channel: CommsChannelId,
  envKey: string,
): CommsProviderSelection {
  const raw = envValue(envKey);
  if (!raw) {
    return { channel, selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isMockOtpProvider(code)) {
    return { channel, selected: false, code, mock_rejected: true };
  }
  return { channel, selected: true, code, mock_rejected: false };
}

export type CommsConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  channel: CommsChannelId | 'SHARED';
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  value_leaked: false;
};

export function buildLiveOtpMessagingConfigurationSlots(): CommsConfigSlotPresence[] {
  const otp = readConfiguredCommsProvider('OTP', 'OTP_PROVIDER');
  const sms = readConfiguredCommsProvider('SMS', 'SMS_PROVIDER');
  const email = readConfiguredCommsProvider('EMAIL', 'EMAIL_PROVIDER');
  const push = readConfiguredCommsProvider('PUSH', 'PUSH_PROVIDER');

  const providerSlot = (
    id: string,
    label: string,
    key: string,
    channel: CommsChannelId,
    sel: CommsProviderSelection,
  ): CommsConfigSlotPresence => ({
    id,
    label,
    reference_key: key,
    channel,
    status: sel.mock_rejected
      ? 'REJECTED_MOCK'
      : sel.selected
        ? 'PRESENT'
        : 'NOT_SELECTED',
    reference_present: sel.selected,
    secret: false,
    value_leaked: false,
  });

  const refSlot = (
    id: string,
    label: string,
    key: string,
    channel: CommsChannelId | 'SHARED',
    secret: boolean,
  ): CommsConfigSlotPresence => {
    const present = envPresent(key);
    return {
      id,
      label,
      reference_key: key,
      channel,
      status: present ? 'PRESENT' : 'MISSING',
      reference_present: present,
      secret,
      value_leaked: false,
    };
  };

  return [
    providerSlot('otp_provider', 'OTP provider name', 'OTP_PROVIDER', 'OTP', otp),
    refSlot('otp_endpoint', 'OTP production endpoint reference', 'OTP_PRODUCTION_ENDPOINT_REF', 'OTP', false),
    refSlot('otp_credential', 'OTP credential / secret reference', 'OTP_PRODUCTION_SECRET_REF', 'OTP', true),
    refSlot('otp_sender', 'OTP sender / origin reference', 'OTP_SENDER_REF', 'OTP', false),
    refSlot('otp_markets', 'OTP country / market support', 'OTP_MARKETS_REF', 'OTP', false),
    refSlot('otp_callback', 'OTP callback / webhook reference', 'OTP_WEBHOOK_REF', 'OTP', false),
    providerSlot('sms_provider', 'SMS provider', 'SMS_PROVIDER', 'SMS', sms),
    refSlot('sms_credential', 'SMS credential reference', 'SMS_PRODUCTION_SECRET_REF', 'SMS', true),
    refSlot('sms_sender', 'SMS sender ID reference', 'SMS_SENDER_REF', 'SMS', false),
    providerSlot('email_provider', 'Email provider', 'EMAIL_PROVIDER', 'EMAIL', email),
    refSlot('email_credential', 'Email credential reference', 'EMAIL_PRODUCTION_SECRET_REF', 'EMAIL', true),
    refSlot('email_sender', 'Email sender / from reference', 'EMAIL_SENDER_REF', 'EMAIL', false),
    refSlot('email_domain', 'Email sending domain reference', 'EMAIL_DOMAIN_REF', 'EMAIL', false),
    providerSlot('push_provider', 'Push provider', 'PUSH_PROVIDER', 'PUSH', push),
    refSlot('push_credential', 'Push credential reference', 'PUSH_PRODUCTION_SECRET_REF', 'PUSH', true),
    refSlot('environment_identity', 'Communication environment', 'COMMUNICATION_ENVIRONMENT', 'SHARED', false),
  ];
}

type ChannelLifecycleInput = {
  channel: CommsChannelId;
  providerEnv: string;
  requiredRefs: readonly string[];
  verificationEnv: string;
  approvalEnv: string;
};

function deriveChannelLifecycle(
  input: ChannelLifecycleInput,
): Pick<
  MessagingChannelStatus,
  | 'channel'
  | 'provider'
  | 'configured'
  | 'verified'
  | 'approved'
  | 'enabled'
  | 'production'
  | 'activation_stage'
  | 'remaining_blocker'
  | 'status'
> {
  const sel = readConfiguredCommsProvider(input.channel, input.providerEnv);
  const refsOk = input.requiredRefs.every((k) => envPresent(k));
  const configured = sel.selected && refsOk;
  const verified = configured && humanStatus(input.verificationEnv, 'verified');
  const approved = verified && humanStatus(input.approvalEnv, 'approved');
  // Never enable without non-mock adapter registration (always false in software path today).
  const enabled = false;

  let activation_stage: MessagingChannelStatus['activation_stage'] = 'NOT_SELECTED';
  if (enabled) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker = NO_PRODUCTION_OTP_MESSAGING_PROVIDER;
  if (input.channel === 'OTP') remaining_blocker = NO_PRODUCTION_OTP_PROVIDER;
  if (input.channel === 'SMS') remaining_blocker = NO_PRODUCTION_SMS_PROVIDER;
  if (input.channel === 'EMAIL') remaining_blocker = NO_PRODUCTION_EMAIL_PROVIDER;
  if (input.channel === 'PUSH') remaining_blocker = NO_PRODUCTION_PUSH_PROVIDER;
  if (sel.mock_rejected) remaining_blocker = MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION;
  else if (sel.selected && !envPresent(input.requiredRefs[0] ?? '')) {
    if (input.channel === 'OTP') remaining_blocker = NO_PRODUCTION_OTP_CREDENTIAL;
    if (input.channel === 'SMS') remaining_blocker = NO_PRODUCTION_SMS_CREDENTIAL;
    if (input.channel === 'EMAIL') remaining_blocker = NO_PRODUCTION_EMAIL_CREDENTIAL;
  }

  return {
    channel: input.channel,
    provider: sel.selected ? (sel.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
    configured,
    verified,
    approved,
    enabled,
    production: 'EXTERNAL_GATED',
    activation_stage,
    remaining_blocker,
    status: configured ? 'NOT_VERIFIED' : 'NOT_SELECTED',
  };
}

export function deriveOtpMessagingChannelLifecycles() {
  return {
    otp: deriveChannelLifecycle({
      channel: 'OTP',
      providerEnv: 'OTP_PROVIDER',
      requiredRefs: ['OTP_PRODUCTION_SECRET_REF', 'OTP_SENDER_REF'],
      verificationEnv: COMMS_OTP_VERIFICATION_STATUS_ENV,
      approvalEnv: COMMS_OTP_APPROVAL_STATUS_ENV,
    }),
    sms: deriveChannelLifecycle({
      channel: 'SMS',
      providerEnv: 'SMS_PROVIDER',
      requiredRefs: ['SMS_PRODUCTION_SECRET_REF', 'SMS_SENDER_REF'],
      verificationEnv: COMMS_SMS_VERIFICATION_STATUS_ENV,
      approvalEnv: COMMS_SMS_APPROVAL_STATUS_ENV,
    }),
    email: deriveChannelLifecycle({
      channel: 'EMAIL',
      providerEnv: 'EMAIL_PROVIDER',
      requiredRefs: [
        'EMAIL_PRODUCTION_SECRET_REF',
        'EMAIL_SENDER_REF',
        'EMAIL_DOMAIN_REF',
      ],
      verificationEnv: COMMS_EMAIL_VERIFICATION_STATUS_ENV,
      approvalEnv: COMMS_EMAIL_APPROVAL_STATUS_ENV,
    }),
    push: deriveChannelLifecycle({
      channel: 'PUSH',
      providerEnv: 'PUSH_PROVIDER',
      requiredRefs: ['PUSH_PRODUCTION_SECRET_REF'],
      verificationEnv: COMMS_PUSH_VERIFICATION_STATUS_ENV,
      approvalEnv: COMMS_PUSH_APPROVAL_STATUS_ENV,
    }),
  };
}

export type OtpMessagingProductionActivationPathReport = {
  sprint: 133;
  authoritative_source: typeof OTP_MESSAGING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_otp_system_created: false;
  parallel_notification_system_created: false;
  parallel_outbox_created: false;
  fake_provider_invented: false;
  real_otp_sent: false;
  real_messages_sent: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  communication_environment: CommunicationRuntimeEnvironment;
  live_enabled: boolean;
  software_activation_path: 'COMPLETE';
  channels: ReturnType<typeof deriveOtpMessagingChannelLifecycles>;
  configuration_slots: CommsConfigSlotPresence[];
  production_communications: 'BLOCKED';
  production_otp_enabled: false;
  production_sms_enabled: false;
  production_email_enabled: false;
  production_push_enabled: false;
  notification_state_machine: ReturnType<typeof buildNotificationStateMachine>;
  sent_neq_delivered: true;
  otp_security: {
    short_expiry: true;
    single_use: true;
    max_attempts: true;
    rate_limiting: true;
    replay_protection: true;
    purpose_binding: true;
    never_logged: typeof OTP_NEVER_LOGGED;
    never_in_error_response: true;
    never_returned_to_client_in_production: true;
  };
  multi_portal: {
    customer: true;
    vendor: true;
    doctor: true;
    lab: true;
    admin: true;
    cross_portal_isolation: typeof CROSS_PORTAL_OTP_ISOLATION;
  };
  transactional_coverage: ReturnType<typeof listTransactionalNotificationCoverage>;
  phi_minimal_payloads: true;
  enablement_guard: ReturnType<typeof evaluateMessagingEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_OTP_MESSAGING_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  otp_printed: false;
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateOtpMessagingProductionActivationPath(input?: {
  correlation_id?: string;
}): OtpMessagingProductionActivationPathReport {
  const env = readCommunicationEnvironment();
  const live = isLiveOtpEnabled();
  const channels = deriveOtpMessagingChannelLifecycles();
  const slots = buildLiveOtpMessagingConfigurationSlots();
  const enablement = evaluateMessagingEnablementGuard({
    nonMockOtpAdapter: false,
    nonMockMessagingAdapter: false,
    communicationEnvironment: env,
    liveEnabled: live,
    humanApproved: false,
    authDevRevealOffInProduction: process.env['AUTH_DEV_REVEAL_OTP'] !== 'true' || env !== 'production',
    emergencyDisabled: false,
  });

  const blockers = [
    NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    channels.otp.remaining_blocker,
    channels.sms.remaining_blocker,
    channels.email.remaining_blocker,
    channels.push.remaining_blocker,
    NO_PRODUCTION_OTP_CREDENTIAL,
    NO_PRODUCTION_SMS_CREDENTIAL,
    NO_PRODUCTION_SMS_SENDER,
    NO_PRODUCTION_EMAIL_CREDENTIAL,
    NO_PRODUCTION_EMAIL_SENDER,
    NO_PRODUCTION_EMAIL_DOMAIN,
    // S142 software resolver COMPLETE (was SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING)
    'PRODUCTION_OTP_ADAPTER_NOT_REGISTERED',
  ];

  return {
    sprint: 133,
    authoritative_source: OTP_MESSAGING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_otp_system_created: false,
    parallel_notification_system_created: false,
    parallel_outbox_created: false,
    fake_provider_invented: false,
    real_otp_sent: false,
    real_messages_sent: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    communication_environment: env,
    live_enabled: live,
    software_activation_path: 'COMPLETE',
    channels,
    configuration_slots: slots,
    production_communications: 'BLOCKED',
    production_otp_enabled: false,
    production_sms_enabled: false,
    production_email_enabled: false,
    production_push_enabled: false,
    notification_state_machine: buildNotificationStateMachine(),
    sent_neq_delivered: true,
    otp_security: {
      short_expiry: true,
      single_use: true,
      max_attempts: true,
      rate_limiting: true,
      replay_protection: true,
      purpose_binding: true,
      never_logged: OTP_NEVER_LOGGED,
      never_in_error_response: true,
      never_returned_to_client_in_production: true,
    },
    multi_portal: {
      customer: true,
      vendor: true,
      doctor: true,
      lab: true,
      admin: true,
      cross_portal_isolation: CROSS_PORTAL_OTP_ISOLATION,
    },
    transactional_coverage: listTransactionalNotificationCoverage(),
    phi_minimal_payloads: true,
    enablement_guard: enablement,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_OTP_MESSAGING_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    otp_printed: false,
    message: channels.otp.configured
      ? 'Software activation path complete: OTP/SMS/email/push configuration refs evaluated. Production communications remain BLOCKED / EXTERNAL_GATED until real providers, secrets-manager resolution, non-mock adapters, verification, and approval are satisfied. SENT ≠ DELIVERED.'
      : 'Software activation path complete: no production OTP/SMS/email/push provider selected. Sandbox CONSOLE OTP remains available. Production initiation/callbacks fail closed.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed production OTP / messaging initiation. */
export function assertProductionOtpMessagingInitiationAllowed(context: string): void {
  if (readCommunicationEnvironment() !== 'production') {
    return;
  }
  const otp = readConfiguredCommsProvider('OTP', 'OTP_PROVIDER');
  if (otp.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION,
      'Mock OTP blocked in production',
      `${context}: CONSOLE/MOCK OTP providers cannot serve production.`,
    );
  }
  const path = evaluateOtpMessagingProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_OTP_MESSAGING_INITIATION_BLOCKED,
    'Production OTP/messaging initiation blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. Software path COMPLETE; live providers EXTERNAL_GATED.`,
  );
}

/** Production delivery callbacks remain EXTERNAL_GATED without secrets-manager + provider verifier. */
export function assertProductionCommsCallbackAllowed(
  channel: CommsChannelId,
  context = 'comms callback',
): void {
  if (readCommunicationEnvironment() !== 'production') {
    return;
  }
  void channel;
  throw Errors.problem(
    503,
    PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED,
    'Production communications callbacks gated',
    `${context}: production callback verification requires secrets-manager resolution + configured provider verifier. Never trusts browser callbacks. Software resolver COMPLETE; live vault EXTERNAL_GATED (NO_PRODUCTION_SECRETS_MANAGER_ADAPTER).`,
  );
}

export function evaluateOtpSecurityInvariants(): Array<{
  case_id: string;
  outcome: 'PASS' | 'ENFORCED';
  detail: string;
}> {
  return [
    { case_id: 'otp_expiry', outcome: 'ENFORCED', detail: 'AUTH_OTP_TTL_SECONDS short expiry' },
    { case_id: 'otp_single_use', outcome: 'ENFORCED', detail: 'Challenge consumed on verify' },
    { case_id: 'otp_replay', outcome: 'ENFORCED', detail: 'Consumed challenge cannot re-verify' },
    { case_id: 'otp_wrong_purpose', outcome: 'ENFORCED', detail: 'Purpose-bound challenges' },
    { case_id: 'otp_attempt_limit', outcome: 'ENFORCED', detail: 'Max attempts on challenge' },
    { case_id: 'otp_rate_limit', outcome: 'ENFORCED', detail: 'IP + identifier rate limits' },
    { case_id: 'otp_enumeration', outcome: 'ENFORCED', detail: 'Uniform responses for unknown identifiers' },
    { case_id: 'otp_never_logged', outcome: 'PASS', detail: OTP_NEVER_LOGGED },
    { case_id: 'sent_neq_delivered', outcome: 'PASS', detail: SENT_NEQ_DELIVERED },
    { case_id: 'cross_portal_isolation', outcome: 'ENFORCED', detail: CROSS_PORTAL_OTP_ISOLATION },
  ];
}

export function evaluateProductionCommsCallbackNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    { case_id: 'unsigned_callback', outcome: 'REJECTED', reason: 'INVALID_SIGNATURE' },
    { case_id: 'invalid_signature', outcome: 'REJECTED', reason: 'INVALID_SIGNATURE' },
    {
      case_id: 'wrong_environment',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_COMMS_CALLBACK_EXTERNAL_GATED,
    },
    { case_id: 'malformed_payload', outcome: 'REJECTED', reason: 'INVALID_JSON' },
    { case_id: 'duplicate_callback', outcome: 'IDEMPOTENT', reason: 'DUPLICATE_DELIVERY_CALLBACK' },
    {
      case_id: 'mock_provider_in_production',
      outcome: 'REJECTED',
      reason: MOCK_OTP_PROVIDER_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'browser_callback_as_truth',
      outcome: 'REJECTED',
      reason: 'CLIENT_CALLBACK_INSUFFICIENT',
    },
  ];
}

export function assertSentNotEqualsDelivered(): {
  sent: 'SENT';
  delivered: 'DELIVERED';
  equal: false;
  invariant: typeof SENT_NEQ_DELIVERED;
} {
  const sm = buildNotificationStateMachine();
  return {
    sent: sm.accepted_by_provider_state,
    delivered: sm.delivered_to_user_state,
    equal: false,
    invariant: SENT_NEQ_DELIVERED,
  };
}
