import {
  deliveryJobKicker,
  deliveryPrimaryKind,
  deliveryPrimaryLabel,
  isReturnPickupJob,
} from './delivery-job-next';

describe('deliveryPrimaryKind', () => {
  const base = {
    id: 'j1',
    job_type: 'MEDICINE_DELIVERY' as const,
    assignee_id: 'r1',
    status: 'ASSIGNED',
    tracking_number: 'TRK-1',
    shipment_status: 'LABEL_CREATED',
    dropoff: { city: 'Demo', region: 'XX', recipient: 'Customer' },
  };

  it('maps medicine delivery job states to rider actions', () => {
    expect(deliveryPrimaryKind({ ...base, assignee_id: null, status: 'CREATED' })).toBe('accept');
    expect(deliveryPrimaryKind({ ...base, status: 'ASSIGNED' })).toBe('arrive');
    expect(deliveryPrimaryKind({ ...base, status: 'IN_PROGRESS' })).toBe('pickup');
    expect(deliveryPrimaryKind({ ...base, status: 'PICKUP' })).toBe('pod');
    expect(deliveryPrimaryKind({ ...base, status: 'DELIVERED' })).toBe('done');
    expect(deliveryPrimaryKind({ ...base, status: 'FAILED' })).toBe('failed');
  });

  it('uses sample transport flow separately', () => {
    const sample = { ...base, job_type: 'SAMPLE_TRANSPORT' as const, status: 'IN_PROGRESS' as const };
    expect(deliveryPrimaryKind(sample)).toBe('pickup');
    expect(deliveryPrimaryKind({ ...sample, status: 'PICKUP' })).toBe('deliver');
  });

  it('labels return pickup stops honestly', () => {
    expect(isReturnPickupJob({ direction: 'RETURN_PICKUP' })).toBe(true);
    expect(deliveryJobKicker({ ...base, direction: 'RETURN_PICKUP' })).toBe('RETURN');
    expect(deliveryPrimaryLabel('arrive', 'MEDICINE_DELIVERY', 'RETURN_PICKUP')).toMatch(/customer/i);
    expect(deliveryPrimaryLabel('pickup', 'MEDICINE_DELIVERY', 'RETURN_PICKUP')).toMatch(/collect/i);
    expect(deliveryPrimaryLabel('pod', 'MEDICINE_DELIVERY', 'RETURN_PICKUP')).toMatch(/pharmacy/i);
  });

  it('labels OTP POD honestly', () => {
    expect(deliveryPrimaryLabel('pod')).toMatch(/photo/i);
    expect(deliveryPrimaryLabel('pod')).toMatch(/OTP/i);
  });
});
