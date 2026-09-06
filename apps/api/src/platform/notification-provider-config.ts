import { Errors } from '../common/problem';

const VAULT_PATH_PATTERN = /^(env|vault):[A-Za-z0-9_./{}:-]+$/;

export const NOTIFICATION_CHANNELS = ['SMS', 'EMAIL', 'PUSH', 'IN_APP', 'WHATSAPP'] as const;
export type NotificationChannelCode = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_PROVIDER_ROLES = ['PRIMARY', 'FALLBACK'] as const;
export type NotificationProviderRoleCode = (typeof NOTIFICATION_PROVIDER_ROLES)[number];

export const NOTIFICATION_CONFIG_STATUSES = ['UNCONFIGURED', 'SANDBOX', 'VERIFIED'] as const;
export type NotificationConfigStatusCode = (typeof NOTIFICATION_CONFIG_STATUSES)[number];

export type NotificationProviderPatch = {
  active?: boolean;
  provider_name?: string;
  environment?: string;
  config_status?: NotificationConfigStatusCode;
  secret_ref?: string | null;
  priority?: number;
  role?: NotificationProviderRoleCode;
};

export function assertNotificationChannel(raw: string): NotificationChannelCode {
  const code = raw.trim().toUpperCase();
  if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(code)) {
    throw Errors.validation(`channel must be one of: ${NOTIFICATION_CHANNELS.join(', ')}`);
  }
  return code as NotificationChannelCode;
}

export function assertProviderRole(raw: string): NotificationProviderRoleCode {
  const code = raw.trim().toUpperCase();
  if (!(NOTIFICATION_PROVIDER_ROLES as readonly string[]).includes(code)) {
    throw Errors.validation(`role must be PRIMARY or FALLBACK`);
  }
  return code as NotificationProviderRoleCode;
}

export function assertConfigStatus(raw: string): NotificationConfigStatusCode {
  const code = raw.trim().toUpperCase();
  if (!(NOTIFICATION_CONFIG_STATUSES as readonly string[]).includes(code)) {
    throw Errors.validation(`config_status must be UNCONFIGURED, SANDBOX, or VERIFIED`);
  }
  return code as NotificationConfigStatusCode;
}

export function isSafeSecretRef(ref: string): boolean {
  const trimmed = ref.trim();
  if (!trimmed) {
    return false;
  }
  if (VAULT_PATH_PATTERN.test(trimmed) && trimmed.length <= 200) {
    return true;
  }
  return false;
}

export function assertSafeSecretRef(ref: string): void {
  if (!isSafeSecretRef(ref)) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'Store a vault/env path only (env:NAME or vault:path). Do not store API keys or live credentials.',
    );
  }
}

export function deriveEffectiveStatus(input: {
  active: boolean;
  configStatus: NotificationConfigStatusCode;
  secretRef: string | null;
  environment: string;
}): { live: boolean; effective: string; sandbox: boolean } {
  const configured = Boolean(input.secretRef?.trim()) || input.configStatus === 'SANDBOX';
  const verified = input.configStatus === 'VERIFIED' && configured;
  const sandbox = input.environment.trim().toLowerCase() !== 'production';
  const live = input.active && verified && !sandbox;
  let effective = 'disabled';
  if (!input.active) {
    effective = 'disabled';
  } else if (input.active && verified && !sandbox) {
    effective = 'live';
  } else if (input.active && configured && sandbox) {
    effective = 'sandbox';
  } else if (input.active && !sandbox && !verified) {
    effective = 'misconfigured';
  } else if (input.active && !configured) {
    effective = 'misconfigured';
  }
  return { live, effective, sandbox };
}
