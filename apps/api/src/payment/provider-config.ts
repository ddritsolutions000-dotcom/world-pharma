import { PaymentMethodFamily } from '@prisma/client';
import { Errors } from '../common/problem';
import { isForbiddenSecretLikeValue } from './r14a-gate';

/** Path-only credential reference. Never a live key, PAN, CVV, or PEM. */
const VAULT_PATH_PATTERN = /^(env|vault):[A-Za-z0-9_./{}:-]+$/;

const METHOD_FAMILIES = new Set<string>(Object.values(PaymentMethodFamily));

const LIVE_KEY_FRAGMENT = `${'sk'}_${'live'}`;
const TEST_KEY_FRAGMENT = `${'sk'}_${'test'}`;

export type ProviderConfigPatch = {
  active?: boolean;
  priority?: number;
  name?: string;
  vault_path?: string;
  environment?: string;
  account?: {
    code?: string;
    active?: boolean;
    countries_csv?: string;
    currencies_csv?: string;
    methods_csv?: string;
    vault_path?: string;
    environment?: string;
  };
};

export function isSafeVaultPath(ref: string): boolean {
  const trimmed = ref.trim();
  if (!VAULT_PATH_PATTERN.test(trimmed) || trimmed.length > 200) {
    return false;
  }
  if (new RegExp(LIVE_KEY_FRAGMENT, 'i').test(trimmed) || new RegExp(TEST_KEY_FRAGMENT, 'i').test(trimmed)) {
    return false;
  }
  if (/-----BEGIN/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function assertSafeVaultPath(ref: string): void {
  if (!isSafeVaultPath(ref)) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'Store a vault/env path only (env:NAME or vault:path). Do not store API keys, PAN/CVV, or certificates.',
    );
  }
}

export function assertSandboxProviderEnvironment(environment: string, gatewayCode: string): void {
  const env = environment.trim().toLowerCase();
  if (!env || env === 'sandbox') {
    return;
  }
  throw Errors.problem(
    409,
    'HUMAN_GATES_NOT_PRODUCTION_READY',
    'Human gates not production ready',
    `Gateway "${gatewayCode}" cannot be set to environment "${environment}". Production environment requires 7/7 OWNER_EVIDENCED Book-263 gates, PAYMENT_LIVE_ENABLED=true, and a registered live adapter. Admin configuration cannot unlock live payments.`,
  );
}

export function normalizePriority(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 9999) {
    throw Errors.validation('priority must be an integer from 1 to 9999');
  }
  return raw;
}

export function normalizeProviderName(raw: string): string {
  const name = raw.trim();
  if (!name || name.length > 120) {
    throw Errors.validation('name must be 1–120 characters');
  }
  if (isForbiddenSecretLikeValue(name)) {
    throw Errors.problem(
      400,
      'SECRET_VALUE_FORBIDDEN',
      'Secret value forbidden',
      'Provider name cannot contain credential-like values.',
    );
  }
  return name;
}

export function normalizeCountriesCsv(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      'countries_csv is required. Use * or comma-separated ISO2 codes.',
    );
  }
  if (value === '*') {
    return '*';
  }
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[A-Z]{2}$/.test(part))) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      'countries_csv must be * or comma-separated ISO2 codes.',
    );
  }
  return parts.join(',');
}

export function normalizeCurrenciesCsv(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      'currencies_csv is required. Use * or comma-separated ISO 4217 codes.',
    );
  }
  if (value === '*') {
    return '*';
  }
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[A-Z]{3}$/.test(part))) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      'currencies_csv must be * or comma-separated ISO 4217 codes.',
    );
  }
  return parts.join(',');
}

export function normalizeMethodsCsv(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      'methods_csv is required.',
    );
  }
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => !METHOD_FAMILIES.has(part))) {
    throw Errors.problem(
      400,
      'PROVIDER_CONFIG_INCOMPLETE',
      'Provider configuration incomplete',
      `methods_csv must be a subset of ${[...METHOD_FAMILIES].join(',')}.`,
    );
  }
  return parts.join(',');
}
