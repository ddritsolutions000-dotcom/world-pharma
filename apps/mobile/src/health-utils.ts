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

export type MobileHealthDestination =
  | { screen: 'health-artifact-detail'; artifactId: string }
  | { screen: 'appointment-detail'; appointmentId: string }
  | { screen: 'lab-booking-detail'; bookingId: string }
  | { screen: 'imaging-booking-detail'; bookingId: string }
  | { screen: 'prescriptions' }
  | { screen: 'orders' }
  | { screen: 'reminders' }
  | { screen: 'care-plan' }
  | null;

export function resolveTimelineDestination(item: HealthTimelineItem): MobileHealthDestination {
  if (item.artifact_id) {
    return { screen: 'health-artifact-detail', artifactId: item.artifact_id };
  }
  if (item.deep_link?.startsWith('/health/artifacts/')) {
    const artifactId = item.deep_link.split('/').pop()?.trim();
    if (artifactId) {
      return { screen: 'health-artifact-detail', artifactId };
    }
  }
  const sourceId = item.source_id?.trim();
  if (!sourceId) {
    return null;
  }
  const module = item.source_module?.toLowerCase() ?? '';
  if (module === 'lab') {
    return { screen: 'lab-booking-detail', bookingId: sourceId };
  }
  if (module === 'radiology') {
    return { screen: 'imaging-booking-detail', bookingId: sourceId };
  }
  if (module === 'encounter' || module === 'clinical') {
    if (item.event_type.includes('APPOINTMENT') || item.event_type.includes('CONSULT')) {
      return { screen: 'appointment-detail', appointmentId: sourceId };
    }
  }
  if (module === 'prescription' || item.artifact_type === 'PRESCRIPTION_STRUCTURED') {
    return { screen: 'prescriptions' };
  }
  return null;
}

export function resolvePendingActionDestination(action: {
  kind: string;
  id: string;
}): MobileHealthDestination {
  if (action.kind === 'appointment_upcoming') {
    return { screen: 'appointment-detail', appointmentId: action.id };
  }
  if (action.kind === 'lab_report_pending') {
    return { screen: 'lab-booking-detail', bookingId: action.id };
  }
  if (action.kind === 'imaging_report_pending') {
    return { screen: 'imaging-booking-detail', bookingId: action.id };
  }
  if (action.kind === 'prescription_available') {
    return { screen: 'prescriptions' };
  }
  if (action.kind === 'medicine_reorder' || action.kind === 'medicine_purchase') {
    return { screen: 'orders' };
  }
  if (action.kind === 'care_plan_action') {
    return { screen: 'care-plan' };
  }
  return null;
}

export function recordLabel(row: Record<string, unknown>, fallback: string): string {
  if (typeof row.title === 'string' && row.title.trim()) {
    return row.title;
  }
  if (typeof row.doctor_display_name === 'string' && row.doctor_display_name.trim()) {
    return row.doctor_display_name;
  }
  if (typeof row.lab_display_name === 'string' && row.lab_display_name.trim()) {
    return row.lab_display_name;
  }
  if (typeof row.imaging_display_name === 'string' && row.imaging_display_name.trim()) {
    return row.imaging_display_name;
  }
  if (typeof row.order_number === 'string' && row.order_number.trim()) {
    return `Order ${row.order_number}`;
  }
  if (typeof row.status === 'string' && row.status.trim()) {
    return `${fallback} · ${row.status}`;
  }
  return fallback;
}

export function recordWhen(row: Record<string, unknown>): string {
  const candidates = ['starts_at', 'created_at', 'issued_at', 'updated_at', 'occurred_at'];
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return formatWhen(value);
    }
  }
  return '—';
}
