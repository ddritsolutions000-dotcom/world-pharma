import { rankByNearestDestination, haversineKm, pickNearestOnlineRider } from './geo';

describe('geo nearest ranking', () => {
  it('prefers matching postal code', () => {
    const ranked = rankByNearestDestination(
      [
        { id: 'far', postalCode: '99999', city: 'other', latitude: 28.7, longitude: 77.2 },
        { id: 'near', postalCode: '110001', city: 'delhi', latitude: 28.61, longitude: 77.21 },
      ],
      { postalCode: '110001', city: 'delhi', latitude: 28.61, longitude: 77.2 },
    );
    expect(ranked[0]?.id).toBe('near');
  });

  it('uses haversine when postal differs', () => {
    const ranked = rankByNearestDestination(
      [
        { id: 'far', postalCode: 'A', latitude: 19.07, longitude: 72.87 },
        { id: 'near', postalCode: 'B', latitude: 28.62, longitude: 77.21 },
      ],
      { postalCode: 'Z', latitude: 28.61, longitude: 77.2 },
    );
    expect(ranked[0]?.id).toBe('near');
    expect(haversineKm(28.61, 77.2, 28.62, 77.21)).toBeLessThan(5);
  });
});

describe('pickNearestOnlineRider', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const earlier = new Date('2026-09-06T00:00:00Z');

  it('picks closer GPS rider to pickup', () => {
    const pick = pickNearestOnlineRider(
      [
        {
          personId: 'mumbai',
          updatedAt: now,
          latitude: 19.07,
          longitude: 72.87,
        },
        {
          personId: 'delhi',
          updatedAt: earlier,
          latitude: 28.62,
          longitude: 77.21,
        },
      ],
      { latitude: 28.6139, longitude: 77.209, postalCode: '110001', city: 'delhi' },
    );
    expect(pick?.personId).toBe('delhi');
  });

  it('falls back to preferred org then freshest when GPS missing', () => {
    const byOrg = pickNearestOnlineRider(
      [
        { personId: 'a', organizationId: 'org-x', updatedAt: earlier },
        { personId: 'b', organizationId: 'org-y', updatedAt: now },
      ],
      { latitude: 28.61, longitude: 77.2 },
      { preferredOrganizationId: 'org-x' },
    );
    expect(byOrg?.personId).toBe('a');

    const freshest = pickNearestOnlineRider(
      [
        { personId: 'a', updatedAt: earlier },
        { personId: 'b', updatedAt: now },
      ],
      null,
    );
    expect(freshest?.personId).toBe('b');
  });

  it('returns null when empty', () => {
    expect(pickNearestOnlineRider([], { latitude: 1, longitude: 1 })).toBeNull();
  });
});
