export function maskCredentialNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  return `${'•'.repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}
