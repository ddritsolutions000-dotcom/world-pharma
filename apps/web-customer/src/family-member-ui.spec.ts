import { matchAddressForMember, memberSummary, relationshipLabel } from './family-member-ui';
import type { FamilyMember } from './family-member-ui';

describe('family-member-ui', () => {
  const member: FamilyMember = {
    id: '1',
    country_code: 'IN',
    display_name: 'Mom',
    relationship_code: 'PARENT',
    age_years: 62,
    phone: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('labels relationships', () => {
    expect(relationshipLabel('PARENT')).toBe('Parent');
    expect(relationshipLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('summarizes members', () => {
    expect(memberSummary(member)).toContain('62 yrs');
  });

  it('matches addresses by recipient name', () => {
    expect(
      matchAddressForMember(member, [{ id: 'a1', recipient_name: 'Mom' }, { id: 'a2', recipient_name: 'Dad' }]),
    ).toBe('a1');
  });
});
