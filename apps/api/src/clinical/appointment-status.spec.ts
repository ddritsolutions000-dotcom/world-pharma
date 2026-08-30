import { AppointmentStatus } from '@prisma/client';
import { assertAppointmentTransition } from './appointment-status';

describe('appointment transitions', () => {
  it('allows confirm and check-in, rejects skip-to-complete', () => {
    expect(() => assertAppointmentTransition(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED)).not.toThrow();
    expect(() => assertAppointmentTransition(AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN)).not.toThrow();
    expect(() => assertAppointmentTransition(AppointmentStatus.REQUESTED, AppointmentStatus.COMPLETED)).toThrow();
    expect(() => assertAppointmentTransition(AppointmentStatus.COMPLETED, AppointmentStatus.CONFIRMED)).toThrow();
  });
});
