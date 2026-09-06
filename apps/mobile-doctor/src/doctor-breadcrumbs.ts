import { humanizeRouteSegment, type RouteCrumb } from '@world-pharma/shell-web';
import type { DoctorMobileTab } from './navigation';

const TAB_LABELS: Record<DoctorMobileTab, string> = {
  dashboard: 'Dashboard',
  profile: 'Profile',
  credentials: 'Credentials',
  organizations: 'Organizations',
  availability: 'Availability',
  appointments: 'Appointments',
  prescriptions: 'Prescriptions',
  'refill-requests': 'Refill requests',
  patients: 'Patients',
  inbox: 'Inbox',
  settings: 'Settings',
};

export function doctorTabBreadcrumb(tab: DoctorMobileTab, detail?: string): string {
  const base = TAB_LABELS[tab] ?? humanizeRouteSegment(tab);
  return detail ? `Doctor › ${base} › ${detail}` : `Doctor › ${base}`;
}

export function doctorTabCrumbs(tab: DoctorMobileTab, detail?: string): RouteCrumb[] {
  const items: RouteCrumb[] = [{ label: 'Doctor' }, { label: TAB_LABELS[tab] ?? humanizeRouteSegment(tab) }];
  if (detail) {
    items.push({ label: detail });
  }
  return items;
}
