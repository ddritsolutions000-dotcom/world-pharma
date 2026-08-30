import { AppointmentStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const T = AppointmentStatus;

export const OCCUPYING_STATUSES: AppointmentStatus[] = [
  T.REQUESTED,
  T.CONFIRMED,
  T.RESCHEDULE_REQUESTED,
  T.RESCHEDULED,
  T.CHECKED_IN,
  T.IN_CONSULTATION,
];

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  [T.REQUESTED]: [T.CONFIRMED, T.CANCELLED, T.FAILED],
  [T.CONFIRMED]: [T.CHECKED_IN, T.CANCELLED, T.NO_SHOW, T.RESCHEDULE_REQUESTED, T.RESCHEDULED, T.FAILED],
  [T.RESCHEDULE_REQUESTED]: [T.RESCHEDULED, T.CONFIRMED, T.CANCELLED, T.FAILED],
  [T.RESCHEDULED]: [T.CHECKED_IN, T.CANCELLED, T.NO_SHOW, T.RESCHEDULE_REQUESTED, T.FAILED],
  [T.CHECKED_IN]: [T.IN_CONSULTATION, T.NO_SHOW, T.CANCELLED, T.FAILED],
  [T.IN_CONSULTATION]: [T.COMPLETED, T.FAILED],
  [T.CANCELLED]: [],
  [T.NO_SHOW]: [],
  [T.COMPLETED]: [],
  [T.FAILED]: [],
};

export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED[from]?.includes(to)) {
    throw Errors.conflict(`Illegal appointment transition ${from} → ${to}`);
  }
}
