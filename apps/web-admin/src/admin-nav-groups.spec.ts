import { groupedAdminNav, filterNavItems } from './admin-nav-groups';
import { ADMIN_NAV } from './nav';

describe('groupedAdminNav', () => {
  it('puts catalog under Commerce with a real href', () => {
    const groups = groupedAdminNav(ADMIN_NAV);
    const commerce = groups.find((g) => g.id === 'commerce');
    expect(commerce?.items.some((item) => item.id === 'catalog' && item.href === '/catalog')).toBe(true);
  });

  it('filters nav by label', () => {
    expect(filterNavItems(ADMIN_NAV, 'order').some((item) => item.id === 'orders')).toBe(true);
  });

  it('places every nav item into a named group', () => {
    const groups = groupedAdminNav(ADMIN_NAV);
    expect(groups.some((g) => g.id === 'more')).toBe(false);
    const groupedIds = new Set(groups.flatMap((g) => g.items.map((item) => item.id)));
    expect([...groupedIds].sort()).toEqual([...ADMIN_NAV.map((item) => item.id)].sort());
  });
});
