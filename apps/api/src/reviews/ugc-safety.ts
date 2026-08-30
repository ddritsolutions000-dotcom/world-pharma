import { Errors } from '../common/problem';

const FORBIDDEN_TOKENS = [
  'lab_result',
  'diagnosis',
  'prescription',
  'artifact',
  'consent_scope',
  'break_glass',
  'health_timeline',
  'imaging_finding',
  'blood_pressure',
  'hba1c',
  'clinical_note',
];

export function assertSafeUgcText(field: string, value: string, maxLen = 4000) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw Errors.validation(`${field} is required`);
  }
  if (trimmed.length > maxLen) {
    throw Errors.validation(`${field} is too long`);
  }
  const lower = trimmed.toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    if (lower.includes(token)) {
      throw Errors.validation(`${field} must not contain clinical or health-record content`);
    }
  }
}

export function assertSafeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return;
  }
  const raw = JSON.stringify(metadata).toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    if (raw.includes(token)) {
      throw Errors.validation('metadata must not contain clinical payload keys');
    }
  }
}

export function assertRating(rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Errors.validation('rating must be an integer between 1 and 5');
  }
}
