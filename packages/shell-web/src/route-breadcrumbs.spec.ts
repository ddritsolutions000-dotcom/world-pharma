import { buildPortalBreadcrumbs, buildRouteBreadcrumbs } from './route-breadcrumbs';

describe('buildRouteBreadcrumbs', () => {
  it('builds customer order detail trail', () => {
    const items = buildRouteBreadcrumbs('/orders/ord-123', {
      root: { href: '/', label: 'Home' },
      labels: { '/orders': 'My Orders' },
    });
    expect(items.map((i) => i.label)).toEqual(['Home', 'My Orders', 'ORD 123']);
    expect(items[2]?.href).toBeUndefined();
  });

  it('builds admin nested cms trail', () => {
    const items = buildRouteBreadcrumbs('/cms/new', {
      root: { href: '/', label: 'Dashboard' },
      labels: { '/cms': 'CMS', '/cms/new': 'New Content' },
    });
    expect(items.map((i) => i.label)).toEqual(['Dashboard', 'CMS', 'New Content']);
  });
});

describe('buildPortalBreadcrumbs', () => {
  it('builds vendor tab trail', () => {
    const items = buildPortalBreadcrumbs('Vendor', 'orders', { orders: 'Orders' });
    expect(items.map((i) => i.label)).toEqual(['Vendor', 'Orders']);
  });
});
