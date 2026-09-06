import {
  gateRows,
  presentCountryPicks,
  presentMembershipPeople,
  presentLocationPicks,
  presentOrgPicks,
  presentPartnerPeople,
} from './eligibility-admin-present';

describe('eligibility-admin-present', () => {
  it('filters vendor orgs from Prisma camelCase', () => {
    expect(
      presentOrgPicks(
        {
          data: [
            { id: 'v1', kind: 'VENDOR', displayName: 'Acme Pharma', status: 'ACTIVE' },
            { id: 'i1', kind: 'IMAGING_CENTER', displayName: 'Scan Co', status: 'ACTIVE' },
          ],
        },
        ['VENDOR'],
      ),
    ).toEqual([{ id: 'v1', name: 'Acme Pharma', kind: 'VENDOR', status: 'ACTIVE' }]);
  });

  it('returns every org when kinds are omitted', () => {
    expect(
      presentOrgPicks({
        data: [
          { id: 'v1', kind: 'VENDOR', displayName: 'Acme Pharma', status: 'ACTIVE' },
          { id: 'i1', kind: 'IMAGING_CENTER', displayName: 'Scan Co', status: 'ACTIVE' },
        ],
      }),
    ).toHaveLength(2);
  });

  it('maps country ISO and id', () => {
    expect(
      presentCountryPicks({
        data: [{ id: 'c1', isoAlpha2: 'IN', displayName: 'India' }],
      }),
    ).toEqual([{ id: 'c1', iso2: 'IN', name: 'India' }]);
  });

  it('maps membership people from nested person + role', () => {
    expect(
      presentMembershipPeople({
        data: [
          {
            personId: 'p1',
            role: { code: 'org_member' },
            person: {
              id: 'p1',
              identifiers: [{ type: 'EMAIL', valueNormalized: 'sandbox-phlebotomist@dev.local' }],
            },
          },
        ],
      }),
    ).toEqual([
      { id: 'p1', label: 'sandbox-phlebotomist@dev.local · org_member' },
    ]);
  });

  it('maps delivery partner people from applications', () => {
    expect(
      presentPartnerPeople(
        {
          data: [
            {
              partner_type_code: 'DELIVERY_PARTNER',
              partner: { person_id: 'd1' },
            },
            {
              partner_type_code: 'VENDOR',
              partner: { person_id: 'v1' },
            },
          ],
        },
        ['DELIVERY_PARTNER'],
      ),
    ).toEqual([{ id: 'd1', label: 'DELIVERY_PARTNER · d1…' }]);
  });

  it('maps location name and id', () => {
    expect(
      presentLocationPicks({
        data: [{ id: 'l1', name: 'Main warehouse' }],
      }),
    ).toEqual([{ id: 'l1', name: 'Main warehouse' }]);
  });

  it('lists gates', () => {
    expect(gateRows({ country: true, catalog_write: false })).toEqual([
      { key: 'country', ok: true },
      { key: 'catalog_write', ok: false },
    ]);
  });
});
