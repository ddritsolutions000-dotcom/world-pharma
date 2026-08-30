import type { SessionSnapshot } from '@world-pharma/shell-core';

export type DoctorMobileTab =
  | 'dashboard'
  | 'profile'
  | 'credentials'
  | 'organizations'
  | 'availability'
  | 'appointments'
  | 'prescriptions'
  | 'patients'
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
  | 'patients'
  | 'patient-health'
  | 'health-artifact'
  | 'settings'
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
  { id: 'dashboard', label: 'Home' },
  { id: 'patients', label: 'Patients' },
  { id: 'profile', label: 'Profile' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'organizations', label: 'Orgs' },
  { id: 'availability', label: 'Availability' },
  { id: 'appointments', label: 'Appts' },
  { id: 'prescriptions', label: 'Rx' },
  { id: 'settings', label: 'Settings' },
];
