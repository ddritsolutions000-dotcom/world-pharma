import { affiliateInboxHref } from './affiliate-inbox';
import type { AffiliateInboxItem } from './affiliate-api';

describe('affiliate inbox deep links', () => {
  const base: AffiliateInboxItem = {
    id: 'n1',
    channel: 'in_app',
    title: 'Application updated',
    body: 'Open the app for details.',
    read: false,
    created_at: '2026-08-30T10:00:00.000Z',
  };

  it('routes partner application notices to configured join status', () => {
    process.env.NEXT_PUBLIC_JOIN_URL = 'http://join.test';
    expect(affiliateInboxHref({ ...base, reference_type: 'partner_application' })).toBe('http://join.test/status');
  });

  it('defaults join partner-application links to join portal :3008', () => {
    delete process.env.NEXT_PUBLIC_JOIN_URL;
    expect(affiliateInboxHref({ ...base, reference_type: 'partner_application' })).toBe(
      'http://localhost:3008/status',
    );
  });

  it('routes earnings-related notices to earnings page', () => {
    expect(affiliateInboxHref({ ...base, reference_type: 'order' })).toBe('/support');
    expect(affiliateInboxHref({ ...base, reference_type: undefined })).toBe('/earnings');
  });
});
