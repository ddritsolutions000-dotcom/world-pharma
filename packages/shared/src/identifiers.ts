import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type IdentifierType = 'PHONE' | 'EMAIL';

export interface NormalizedIdentifier {
  type: IdentifierType;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase();
}

export function isEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw));
}

/**
 * Normalize a phone to E.164. `defaultRegion` is optional ISO 3166-1 alpha-2
 * from a future country pack — never assumed to be a single country.
 */
export function normalizePhone(raw: string, defaultRegion?: string): string | null {
  const trimmed = raw.trim();
  const parsed = parsePhoneNumberFromString(
    trimmed,
    defaultRegion && /^[A-Z]{2}$/.test(defaultRegion)
      ? (defaultRegion as never)
      : undefined,
  );
  if (!parsed || !parsed.isValid()) {
    return null;
  }
  return parsed.number;
}

export function normalizeIdentifier(
  raw: string,
  preferredType?: IdentifierType,
  defaultRegion?: string,
): NormalizedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const asEmail = preferredType === 'EMAIL' || (!preferredType && trimmed.includes('@'));
  if (asEmail) {
    const email = normalizeEmail(trimmed);
    return isEmail(email) ? { type: 'EMAIL', value: email } : null;
  }

  const phone = normalizePhone(trimmed, defaultRegion);
  return phone ? { type: 'PHONE', value: phone } : null;
}

export function redactIdentifier(value: string, type: IdentifierType): string {
  if (type === 'EMAIL') {
    const [user, domain] = value.split('@');
    if (!user || !domain) {
      return '***';
    }
    return `${user.slice(0, 1)}***@${domain}`;
  }
  if (value.length < 6) {
    return '***';
  }
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}
