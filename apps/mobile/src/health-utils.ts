import type { ApiCallResult } from '@world-pharma/shell-core';
import type { HealthTimelineItem } from './health-api';

export type HealthViewError =
  | 'network'
  | 'forbidden'
  | 'consent_revoked'
  | 'consent_expired'
  | 'consent_required'
  | 'disabled'
  | 'unauthorized'
  | 'not_found'
  | 'generic';

export function classifyHealthApiFailure(result: ApiCallResult<unknown>): HealthViewError {
  if (result.ok) {
    throw new Error('classifyHealthApiFailure expects a failed result');
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
    if (message.includes('active consent is required') || message.includes('consent')) {
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

export function formatSourceModule(module: string | null | undefined): string | null {
  if (!module) {
    return null;
  }
  if (module === 'lab') {
    return 'Laboratory';
  }
  if (module === 'radiology') {
    return 'Radiology';
  }
  if (module === 'clinical' || module === 'prescription') {
    return 'Prescription';
  }
  if (module === 'upload') {
    return 'Your upload';
  }
  return module;
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
  if (type === 'DOCUMENT') {
    return 'Uploaded document';
  }
  if (type === 'PRESCRIPTION_UPLOAD') {
    return 'Uploaded prescription';
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

export function formatDateHeading(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function groupTimelineByDate(
  items: HealthTimelineItem[],
): Array<{ dateKey: string; heading: string; items: HealthTimelineItem[] }> {
  const groups = new Map<string, HealthTimelineItem[]>();
  for (const item of items) {
    const dateKey = item.occurred_at.slice(0, 10);
    const bucket = groups.get(dateKey) ?? [];
    bucket.push(item);
    groups.set(dateKey, bucket);
  }
  return [...groups.entries()].map(([dateKey, grouped]) => ({
    dateKey,
    heading: formatDateHeading(`${dateKey}T12:00:00.000Z`),
    items: grouped,
  }));
}
