import type { DeliveryJob } from './delivery-api';

export type DeliveryPrimaryKind = 'accept' | 'arrive' | 'pickup' | 'deliver' | 'pod' | 'done' | 'failed';

export function isReturnPickupJob(job: Pick<DeliveryJob, 'direction' | 'parcel_label'>): boolean {
  return job.direction === 'RETURN_PICKUP' || job.parcel_label === 'Return pickup';
}

export function deliveryJobKicker(job: DeliveryJob): string {
  if (isReturnPickupJob(job)) return 'RETURN';
  if (job.job_type === 'SAMPLE_TRANSPORT') return 'SAMPLE';
  if (job.job_type === 'REPORT_DELIVERY') return 'REPORT';
  return 'MEDICINE';
}

export function deliveryPrimaryKind(job: DeliveryJob): DeliveryPrimaryKind {
  const status = (job.status ?? '').toUpperCase();
  if (status === 'DELIVERED') return 'done';
  if (['FAILED', 'RETURNED'].includes(status)) return 'failed';
  if (!job.assignee_id) return 'accept';
  const sampleLike = job.job_type === 'SAMPLE_TRANSPORT' || job.job_type === 'REPORT_DELIVERY';
  if (sampleLike) {
    if (['CREATED', 'ASSIGNED', 'IN_PROGRESS'].includes(status)) return 'pickup';
    if (status === 'PICKUP') return 'deliver';
    return 'done';
  }
  if (['CREATED', 'ASSIGNED'].includes(status)) return 'arrive';
  if (status === 'IN_PROGRESS') return 'pickup';
  if (status === 'PICKUP') return 'pod';
  return 'pod';
}

export function deliveryPrimaryLabel(
  kind: DeliveryPrimaryKind,
  jobType?: string,
  direction?: string | null,
): string {
  const isReturn = direction === 'RETURN_PICKUP';
  if (kind === 'accept') return isReturn ? 'Accept return pickup' : 'Accept job';
  if (kind === 'arrive') return isReturn ? 'Arrive at customer' : 'Arrive at pickup';
  if (kind === 'pickup') {
    if (isReturn) return 'Collect return parcel';
    return jobType === 'REPORT_DELIVERY'
      ? 'Pickup parcel'
      : jobType === 'SAMPLE_TRANSPORT'
        ? 'Pickup sample'
        : 'Confirm pickup';
  }
  if (kind === 'deliver') return jobType === 'REPORT_DELIVERY' ? 'Deliver parcel' : 'Deliver to lab';
  if (kind === 'pod') {
    return isReturn ? 'Confirm return at pharmacy' : 'Attach photo + verify OTP POD';
  }
  if (kind === 'done') return 'Completed';
  return 'Closed';
}
