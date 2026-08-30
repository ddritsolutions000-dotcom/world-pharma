import type { SessionSnapshot } from '@world-pharma/shell-core';

export type PhlebotomistTab = 'jobs';

export type PhlebotomistMobileScreen = 'sign-in' | PhlebotomistTab | 'expired';

export function phlebotomistMobileScreen(
  session: SessionSnapshot,
  tab: PhlebotomistTab = 'jobs',
): PhlebotomistMobileScreen {
  if (session.status === 'expired') {
    return 'expired';
  }
  if (session.status !== 'authenticated') {
    return 'sign-in';
  }
  return tab;
}

export const PHLEBOTOMIST_TABS: Array<{ id: PhlebotomistTab; label: string }> = [{ id: 'jobs', label: 'Jobs' }];
