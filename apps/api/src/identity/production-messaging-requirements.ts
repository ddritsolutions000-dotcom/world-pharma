/**
 * Sprint 89 — Production OTP / SMS / Email / Push configuration validation.
 * Never invent providers, sender IDs, domains, or credentials.
 * Never expose secret values — only reference_present / configured flags.
 */
import {
  isLiveOtpEnabled,
  readCommunicationEnvironment,
} from './communication.config';

export const NO_PRODUCTION_OTP_CREDENTIAL = 'NO_PRODUCTION_OTP_CREDENTIAL';
export const NO_PRODUCTION_SMS_CREDENTIAL = 'NO_PRODUCTION_SMS_CREDENTIAL';
export const NO_PRODUCTION_SMS_SENDER = 'NO_PRODUCTION_SMS_SENDER';
export const NO_PRODUCTION_EMAIL_CREDENTIAL = 'NO_PRODUCTION_EMAIL_CREDENTIAL';
export const NO_PRODUCTION_EMAIL_SENDER = 'NO_PRODUCTION_EMAIL_SENDER';
export const NO_PRODUCTION_EMAIL_DOMAIN = 'NO_PRODUCTION_EMAIL_DOMAIN';

export type MessagingConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type ChannelConfigurationReadiness = {
  provider: 'NOT_SELECTED' | string;
  configuration: 'READY' | 'MISSING';
  credential: 'READY' | 'MISSING';
  sender_or_origin: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  domain: 'READY' | 'MISSING' | 'NOT_APPLICABLE';
  countries: 'READY' | 'MISSING' | 'POLICY_DRIVEN';
  production: 'EXTERNAL_GATED' | 'READY';
  device: 'DEVICE_NOT_AVAILABLE' | 'NOT_APPLICABLE' | 'READY';
};

export type ProductionMessagingConfigurationValidation = {
  environment: 'sandbox' | 'production';
  live_enabled: boolean;
  otp_provider_selected: boolean;
  sms_provider_selected: boolean;
  email_provider_selected: boolean;
  push_provider_selected: boolean;
  otp_credential: MessagingConfigPresence;
  sms_credential: MessagingConfigPresence;
  sms_sender: MessagingConfigPresence;
  email_credential: MessagingConfigPresence;
  email_sender: MessagingConfigPresence;
  email_domain: MessagingConfigPresence;
  countries: MessagingConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  otp_readiness: ChannelConfigurationReadiness;
  sms_readiness: ChannelConfigurationReadiness;
  email_readiness: ChannelConfigurationReadiness;
  push_readiness: ChannelConfigurationReadiness;
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): MessagingConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

/**
 * Deterministic production communications configuration validation.
 * Does not invent providers. Does not enable live delivery.
 */
export function validateProductionMessagingConfiguration(input?: {
  otpProviderSelected?: boolean;
  smsProviderSelected?: boolean;
  emailProviderSelected?: boolean;
  pushProviderSelected?: boolean;
}): ProductionMessagingConfigurationValidation {
  const env = readCommunicationEnvironment();
  const live = isLiveOtpEnabled();
  const otpSelected = Boolean(input?.otpProviderSelected);
  const smsSelected = Boolean(input?.smsProviderSelected);
  const emailSelected = Boolean(input?.emailProviderSelected);
  const pushSelected = Boolean(input?.pushProviderSelected);

  const otp_credential = presence('OTP_PROVIDER_SECRET_REF');
  const sms_credential = presence('SMS_PROVIDER_SECRET_REF');
  const sms_sender = presence('SMS_SENDER_ORIGIN_REF');
  const email_credential = presence('EMAIL_PROVIDER_SECRET_REF');
  const email_sender = presence('EMAIL_SENDER_IDENTITY_REF');
  const email_domain = presence('EMAIL_SENDING_DOMAIN_REF');
  const countries = presence('COMMUNICATION_PRODUCTION_COUNTRIES');

  const blockers: string[] = [];
  if (!otp_credential.reference_present) blockers.push(NO_PRODUCTION_OTP_CREDENTIAL);
  if (!sms_credential.reference_present) blockers.push(NO_PRODUCTION_SMS_CREDENTIAL);
  if (!sms_sender.reference_present) blockers.push(NO_PRODUCTION_SMS_SENDER);
  if (!email_credential.reference_present) blockers.push(NO_PRODUCTION_EMAIL_CREDENTIAL);
  if (!email_sender.reference_present) blockers.push(NO_PRODUCTION_EMAIL_SENDER);
  if (!email_domain.reference_present) blockers.push(NO_PRODUCTION_EMAIL_DOMAIN);

  const gated = 'EXTERNAL_GATED' as const;
  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const otp_readiness: ChannelConfigurationReadiness = {
    provider: otpSelected ? 'SELECTED' : 'NOT_SELECTED',
    configuration: missing(otpSelected && otp_credential.reference_present),
    credential: missing(otp_credential.reference_present),
    sender_or_origin: missing(sms_sender.reference_present), // OTP often shares SMS origin
    domain: 'NOT_APPLICABLE',
    countries: countries.reference_present ? 'READY' : 'POLICY_DRIVEN',
    production: gated,
    device: 'NOT_APPLICABLE',
  };
  const sms_readiness: ChannelConfigurationReadiness = {
    provider: smsSelected ? 'SELECTED' : 'NOT_SELECTED',
    configuration: missing(smsSelected && sms_credential.reference_present && sms_sender.reference_present),
    credential: missing(sms_credential.reference_present),
    sender_or_origin: missing(sms_sender.reference_present),
    domain: 'NOT_APPLICABLE',
    countries: countries.reference_present ? 'READY' : 'POLICY_DRIVEN',
    production: gated,
    device: 'NOT_APPLICABLE',
  };
  const email_readiness: ChannelConfigurationReadiness = {
    provider: emailSelected ? 'SELECTED' : 'NOT_SELECTED',
    configuration: missing(
      emailSelected &&
        email_credential.reference_present &&
        email_sender.reference_present &&
        email_domain.reference_present,
    ),
    credential: missing(email_credential.reference_present),
    sender_or_origin: missing(email_sender.reference_present),
    domain: missing(email_domain.reference_present),
    countries: countries.reference_present ? 'READY' : 'POLICY_DRIVEN',
    production: gated,
    device: 'NOT_APPLICABLE',
  };
  const push_readiness: ChannelConfigurationReadiness = {
    provider: pushSelected ? 'SELECTED' : 'NOT_SELECTED',
    configuration: 'MISSING',
    credential: 'MISSING',
    sender_or_origin: 'NOT_APPLICABLE',
    domain: 'NOT_APPLICABLE',
    countries: 'POLICY_DRIVEN',
    production: gated,
    device: 'DEVICE_NOT_AVAILABLE',
  };

  return {
    environment: env,
    live_enabled: live,
    otp_provider_selected: otpSelected,
    sms_provider_selected: smsSelected,
    email_provider_selected: emailSelected,
    push_provider_selected: pushSelected,
    otp_credential,
    sms_credential,
    sms_sender,
    email_credential,
    email_sender,
    email_domain,
    countries,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    otp_readiness,
    sms_readiness,
    email_readiness,
    push_readiness,
    message:
      'No production OTP/SMS/email/push provider selected — configuration references missing. Sandbox console OTP remains available.',
  };
}
