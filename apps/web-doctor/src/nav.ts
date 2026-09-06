import type { ShellNavItem } from '@world-pharma/shell-core';

export const DOCTOR_NAV: ShellNavItem[] = [
  { id: 'home', label: 'Home', href: '/', audience: 'doctor' },
  { id: 'inbox', label: 'Inbox', href: '/inbox', audience: 'doctor' },
  { id: 'profile', label: 'Profile', href: '/profile', audience: 'doctor' },
  { id: 'credentials', label: 'Credentials', href: '/credentials', audience: 'doctor' },
  { id: 'organizations', label: 'Organizations', href: '/organizations', audience: 'doctor' },
  { id: 'availability', label: 'Availability', href: '/availability', audience: 'doctor' },
  { id: 'patients', label: 'Patients', href: '/patients', audience: 'doctor' },
  { id: 'appointments', label: 'Appointments', href: '/appointments', audience: 'doctor' },
  { id: 'earnings', label: 'Earnings', href: '/earnings', audience: 'doctor' },
  { id: 'prescriptions', label: 'Prescriptions', href: '/prescriptions', audience: 'doctor' },
  { id: 'refill-requests', label: 'Refill requests', href: '/refill-requests', audience: 'doctor' },
  { id: 'support', label: 'Support', href: '/support', audience: 'doctor' },
  { id: 'settings', label: 'Settings', href: '/settings', audience: 'doctor' },
];
