const SENSITIVE_KEY =
  /^(password|otp|code|token|access_token|refresh_token|secret|mfa|totp|cvv|pan|ssn|kyc|document|health_record|clinical|note|authorization|private_url|card|credential_number|license_number|prescription|lab_result|api_secret|livekit_api_secret|participant_token)$/i;

const SENSITIVE_SUBSTRING =
  /\b(otp|password|token|secret|refresh|mfa|cvv|pan|bearer)[=:\s]+[^\s,;]+/gi;

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_SUBSTRING, '[redacted]');
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(nested);
    }
    return out;
  }
  return value;
}

export function redactText(text: string): string {
  return text.replace(SENSITIVE_SUBSTRING, '[redacted]');
}

export const REDACTED_CATEGORIES = [
  'passwords',
  'otps',
  'access/refresh tokens',
  'mfa secrets',
  'kyc documents',
  'health records / clinical notes',
  'payment card data (PAN/CVV)',
  'private storage URLs',
] as const;
