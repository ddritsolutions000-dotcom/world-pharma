import { labLifecycleSummary } from './lab-status-labels';
import type { LabBookingCollection } from './lab-api';

describe('labLifecycleSummary', () => {
  const baseCollection = {
    lab_booking_id: 'b1',
    collection_started: true,
    status: 'ASSIGNED',
    custody_timeline: [],
  } as LabBookingCollection;

  it('describes unpaid booking', () => {
    expect(labLifecycleSummary('BOOKED', null).headline).toBe('Awaiting payment');
  });

  it('describes report ready from collection boundary', () => {
    expect(
      labLifecycleSummary('CONFIRMED', {
        ...baseCollection,
        report_available: true,
        boundary: { pathology: true, results_available: true },
      }).headline,
    ).toBe('Report ready');
  });

  it('describes processing without inventing states', () => {
    expect(
      labLifecycleSummary('CONFIRMED', {
        ...baseCollection,
        processing_status: 'IN_PROGRESS',
      }).headline,
    ).toBe('Processing');
  });
});
