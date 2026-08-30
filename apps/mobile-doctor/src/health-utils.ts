import type { ApiCallResult } from '@world-pharma/shell-core';

export type DoctorHealthViewError =
  | 'network'
  | 'forbidden'
  | 'consent_revoked'
  | 'consent_expired'
  | 'consent_required'
  | 'disabled'
  | 'unauthorized'
  | 'not_found'
  | 'generic';

export function classifyDoctorHealthFailure(result: ApiCallResult<unknown>): DoctorHealthViewError {
  if (result.ok) {
    throw new Error('classifyDoctorHealthFailure expects a failed result');
  }
  if (result.kind === 'unauthorized') {
    return 'unauthorized';
  }
  if (result.kind === 'forbidden') {
    const message = result.error.toLowerCase();
    if (message.includes('not enabled')) {
      return 'disabled';
    }
    if (message.includes('revoked')) {
      return 'consent_revoked';
    }
    if (message.includes('expired')) {
      return 'consent_expired';
    }
    if (message.includes('consent')) {
      return 'consent_required';
    }
    return 'forbidden';
  }
  if (result.kind === 'network') {
    return 'network';
  }
  if (result.status === 404) {
    return 'not_found';
  }
  return 'generic';
}

export function formatArtifactType(type: string | null | undefined): string {
  if (!type) {
    return 'Health record';
  }
  if (type === 'LAB_REPORT') {
    return 'Lab report';
  }
  if (type === 'IMAGING_REPORT') {
    return 'Imaging report';
  }
  if (type === 'PRESCRIPTION_STRUCTURED') {
    return 'Prescription';
  }
  return type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function shortPatientId(personId: string): string {
  return `${personId.slice(0, 8)}…`;
}
