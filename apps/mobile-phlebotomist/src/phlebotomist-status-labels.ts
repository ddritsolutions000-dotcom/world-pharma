import type { CollectionJob } from './phlebotomist-api';

const FAILED = new Set([
  'REJECTED',
  'DAMAGED',
  'LOST',
  'TEMPERATURE_EXCEPTION',
  'INSUFFICIENT_SAMPLE',
  'WRONG_SAMPLE',
  'RECOLLECTION_REQUIRED',
  'FAILED',
]);

export function phlebotomistStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    CREATED: 'New job',
    ASSIGNED: 'Assigned',
    ACCEPTED: 'Accepted',
    ARRIVED: 'Arrived on site',
    VERIFIED: 'Customer verified',
    COLLECTED: 'Specimen collected',
    SEALED: 'Tube sealed',
    HANDED_OVER: 'Custody handed over',
    IN_TRANSIT: 'In transit to lab',
    LAB_RECEIVED: 'Lab received',
    REJECTED: 'Rejected',
    DAMAGED: 'Damaged',
    LOST: 'Lost',
    FAILED: 'Failed',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export type PhleboPrimaryStep =
  | 'accept'
  | 'arrive'
  | 'verify'
  | 'collect'
  | 'seal'
  | 'handover'
  | 'done'
  | 'failed'
  | 'other';

export function phleboPrimaryStep(job: CollectionJob): PhleboPrimaryStep {
  const status = (job.coc_status ?? job.status ?? '').toUpperCase();
  if (FAILED.has(status)) return 'failed';
  if (!job.is_mine && !job.assignee_id) return 'accept';
  if (!job.is_mine) return 'other';
  if (['HANDED_OVER', 'IN_TRANSIT', 'LAB_RECEIVED', 'ACCEPTED_BY_LAB', 'PROCESSING'].includes(status)) {
    return 'done';
  }
  if (status === 'SEALED') return 'handover';
  if (status === 'COLLECTED') return 'seal';
  if (status === 'VERIFIED') return 'collect';
  if (status === 'ARRIVED') return 'verify';
  return 'arrive';
}

export function phleboPrimaryLabel(step: PhleboPrimaryStep): string {
  const labels: Record<PhleboPrimaryStep, string> = {
    accept: 'Accept job',
    arrive: 'Arrive on site',
    verify: 'Verify customer',
    collect: 'Collect specimen',
    seal: 'Seal container',
    handover: 'Hand over custody',
    done: 'Collection complete',
    failed: 'Job failed',
    other: 'Assigned to another collector',
  };
  return labels[step];
}
