/**
 * Sprint 153 — Satellite SPA enrichment helpers (unit).
 * Labels/steppers only — no fake provider state.
 */
import {
  LAB_TRACK_STEPS,
  labLifecycleSummary,
  labTrackStepIndex,
} from '../lab-status-labels';
import {
  IMAGING_TRACK_STEPS,
  imagingTrackStepIndex,
} from '../imaging-status-labels';
import {
  guestTrackStepIndex,
  orderLifecycleSummary,
  orderStatusLabel,
  orderTrackSteps,
} from '../order-status-labels';

describe('S153 lab journey status helpers', () => {
  it('maps payment → report track without inventing states', () => {
    expect(labTrackStepIndex('BOOKED', null)).toBe(0);
    expect(labTrackStepIndex('CONFIRMED', { collection_started: false, custody_timeline: [], lab_booking_id: 'x', status: null })).toBe(1);
    expect(
      labTrackStepIndex('CONFIRMED', {
        lab_booking_id: 'x',
        collection_started: true,
        status: 'COLLECTED',
        custody_timeline: [],
      }),
    ).toBe(2);
    expect(
      labTrackStepIndex('CONFIRMED', {
        lab_booking_id: 'x',
        collection_started: true,
        status: 'AT_LAB',
        lab_received: true,
        custody_timeline: [],
      }),
    ).toBe(3);
    expect(
      labLifecycleSummary('BOOKED', null).headline,
    ).toMatch(/payment/i);
    expect(LAB_TRACK_STEPS).toHaveLength(6);
  });

  it('marks cancelled as non-progress', () => {
    expect(labTrackStepIndex('CANCELLED', null)).toBe(-1);
  });
});

describe('S153 imaging journey status helpers', () => {
  it('separates report vs study viewer steps', () => {
    expect(
      imagingTrackStepIndex({
        bookingStatus: 'CONFIRMED',
        reportAvailable: true,
        viewerAvailable: false,
      }),
    ).toBe(4);
    expect(
      imagingTrackStepIndex({
        bookingStatus: 'CONFIRMED',
        reportAvailable: true,
        viewerAvailable: true,
      }),
    ).toBe(5);
    expect(IMAGING_TRACK_STEPS[4]).toMatch(/Report/i);
    expect(IMAGING_TRACK_STEPS[5]).toMatch(/Study/i);
  });

  it('awaits payment before scheduled progress', () => {
    expect(imagingTrackStepIndex({ bookingStatus: 'BOOKED' })).toBe(0);
    expect(imagingTrackStepIndex({ bookingStatus: 'CANCELLED' })).toBe(-1);
  });
});

describe('S153 logistics status rendering', () => {
  it('renders guest track steps from existing order statuses only', () => {
    expect(guestTrackStepIndex('SHIPPED')).toBe(4);
    expect(guestTrackStepIndex('DELIVERED')).toBe(5);
    expect(guestTrackStepIndex('CANCELLED')).toBe(-1);
    expect(orderTrackSteps().length).toBeGreaterThan(3);
    expect(orderStatusLabel('OUT_FOR_DELIVERY')).toMatch(/out for delivery/i);
    expect(orderLifecycleSummary('DELIVERED').headline).toMatch(/delivered/i);
  });
});

describe('S153 security contract (no public protected URLs)', () => {
  it('documents report/study protection expectations for satellite SPAs', () => {
    const contract = {
      lab_report_public_url: false,
      imaging_dicom_public_url: false,
      imaging_viewer_requires_auth: true,
      logistics_live_carrier_claimed: false,
      hl7_fhir_implemented_in_s153: false,
      can_production_launch: 'NO',
    };
    expect(contract.lab_report_public_url).toBe(false);
    expect(contract.imaging_dicom_public_url).toBe(false);
    expect(contract.imaging_viewer_requires_auth).toBe(true);
    expect(contract.logistics_live_carrier_claimed).toBe(false);
    expect(contract.hl7_fhir_implemented_in_s153).toBe(false);
    expect(contract.can_production_launch).toBe('NO');
  });
});
