import type { Audience, SessionSnapshot } from './session';

export interface ShellNavItem {
  id: string;
  label: string;
  href: string;
  permission?: string;
  audience?: Audience;
}

export function visibleNavItems(session: SessionSnapshot, items: ShellNavItem[]): ShellNavItem[] {
  return items.filter((item) => {
    if (item.audience && session.audience !== item.audience) {
      return false;
    }
    if (item.permission && !session.permissions.includes(item.permission)) {
      return false;
    }
    return true;
  });
}

export function canAccessProtected(session: SessionSnapshot, audience: Audience): boolean {
  return session.status === 'authenticated' && session.audience === audience;
}
