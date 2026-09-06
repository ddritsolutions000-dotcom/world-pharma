import { mergeCountryOptions, WORLD_COUNTRIES } from './world-countries';

describe('world countries', () => {
  it('lists every ISO country for the header picker', () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(180);
    const merged = mergeCountryOptions([{ iso_alpha2: 'IN', name: { en: 'India' } }]);
    expect(merged.find((c) => c.iso_alpha2 === 'IN')?.name).toBe('India');
    expect(merged.find((c) => c.iso_alpha2 === 'GB')?.name).toBe('United Kingdom');
    expect(merged.find((c) => c.iso_alpha2 === 'XX')).toBeUndefined();
  });
});
