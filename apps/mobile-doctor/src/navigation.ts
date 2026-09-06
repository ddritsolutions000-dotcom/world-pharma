import type { SessionSnapshot } from '@world-pharma/shell-core';

export type DoctorMobileTab =
  | 'dashboard'
  | 'profile'
  | 'credentials'
  | 'organizations'
  | 'availability'
  | 'appointments'
  | 'prescriptions'
  | 'refill-requests'
  | 'patients'
  | 'inbox'
  | 'settings';

export type DoctorMobileScreen =
  | 'sign-in'
  | 'dashboard'
  | 'profile'
  | 'credentials'
  | 'organizations'
  | 'availability'
  | 'appointments'
  | 'appointment-detail'
  | 'prescriptions'
  | 'prescription-detail'
  | 'refill-requests'
  | 'patients'
  | 'patient-health'
  | 'health-artifact'
  | 'settings'
  | 'inbox'
  | 'support'
  | 'expired';

export function doctorMobileScreen(
  session: SessionSnapshot,
  tab: DoctorMobileTab = 'dashboard',
  appointmentDetailId?: string | null,
  prescriptionDetailId?: string | null,
  healthPatientId?: string | null,
  healthArtifactId?: string | null,
): DoctorMobileScreen {
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  if (appointmentDetailId) {
    return 'appointment-detail';
  }
  if (prescriptionDetailId) {
    return 'prescription-detail';
  }
  if (healthPatientId && healthArtifactId) {
    return 'health-artifact';
  }
  if (healthPatientId) {
    return 'patient-health';
  }
  return tab;
}

export const DOCTOR_TABS: Array<{ id: DoctorMobileTab; label: string }> = [
  { id: 'dashboard', label: 'Today' },
  { id: 'appointments', label: 'Queue' },
  { id: 'prescriptions', label: 'Rx' },
  { id: 'patients', label: 'Patients' },
  { id: 'settings', label: 'More' },
];
