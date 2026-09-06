/**
 * Sprint 47 — Secret/config redaction. Never log or return secret values.
 */
const SENSITIVE_KEY =
  /(password|secret|token|pepper|authorization|api[_-]?key|private[_-]?key|database_url|redis_url|credential|cookie)/i;

export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redactSecretValue(value: string | null | undefined): 'SET' | 'MISSING' {
  return value?.trim() ? 'SET' : 'MISSING';
}

export function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveConfigKey(key)) {
      out[key] = typeof value === 'string' && value.trim() ? '[redacted]' : '[missing]';
      continue;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      out[key] = redactRecord(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function assertNoSecretLeak(payload: string): boolean {
  const lower = payload.toLowerCase();
  if (lower.includes('postgresql://') && lower.includes('@')) {
    return false;
  }
  if (/redis:\/\/[^:]+:[^@]+@/i.test(payload)) {
    return false;
  }
  return true;
}
