import type { SessionSnapshot } from '@world-pharma/shell-core';

export type LabTab =
  | 'bookings'
  | 'collections'
  | 'transport'
  | 'accessions'
  | 'processing'
  | 'pathology'
  | 'inbox'
  | 'support'
  | 'more';

export type LabMobileScreen = 'sign-in' | LabTab | 'expired';

export function labMobileScreen(session: SessionSnapshot, tab: LabTab = 'bookings'): LabMobileScreen {
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  return tab;
}

export const LAB_TABS: Array<{ id: LabTab; label: string }> = [
  { id: 'accessions', label: 'Queue' },
  { id: 'processing', label: 'Bench' },
  { id: 'transport', label: 'Dock' },
  { id: 'more', label: 'More' },
];
