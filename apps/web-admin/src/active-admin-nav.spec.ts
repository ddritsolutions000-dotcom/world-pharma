import { ADMIN_NAV } from './nav';
import { resolveActiveNavId } from './active-admin-nav';

describe('resolveActiveNavId', () => {
  it('keeps Home only on the dashboard', () => {
    expect(resolveActiveNavId('/', ADMIN_NAV)).toBe('home');
    expect(resolveActiveNavId('/catalog', ADMIN_NAV)).toBe('catalog');
  });

  it('highlights nested CMS and CRM routes', () => {
    expect(resolveActiveNavId('/cms/new', ADMIN_NAV)).toBe('cms');
    expect(resolveActiveNavId('/cms/blog', ADMIN_NAV)).toBe('cms-blog');
    expect(resolveActiveNavId('/cms/legal', ADMIN_NAV)).toBe('cms-legal');
    expect(resolveActiveNavId('/cms/faq', ADMIN_NAV)).toBe('cms-faq');
    expect(resolveActiveNavId('/cms/pages', ADMIN_NAV)).toBe('cms-pages');
    expect(resolveActiveNavId('/crm/customers/abc', ADMIN_NAV)).toBe('crm');
    expect(resolveActiveNavId('/crm/automation', ADMIN_NAV)).toBe('crm-automation');
    expect(resolveActiveNavId('/governance/health/consents', ADMIN_NAV)).toBe('health-consents');
  });
});
