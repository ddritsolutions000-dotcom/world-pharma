/** Mask email/phone for CRM 360 — no reveal-pii in R12-A (TD-R11A-04). */

export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) {
    return '***';
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) {
    return '****';
  }
  return `***${digits.slice(-4)}`;
}

export function maskIdentifier(type: string, value: string): string {
  if (type === 'EMAIL') {
    return maskEmail(value);
  }
  if (type === 'PHONE') {
    return maskPhone(value);
  }
  return '***';
}
