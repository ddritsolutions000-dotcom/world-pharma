import { isMegaSectionActive, MEGA_MENU_SECTIONS } from './store-mega-menu-config';

describe('store mega menu config', () => {
  it('marks shop section active on product routes', () => {
    const shop = MEGA_MENU_SECTIONS.find((s) => s.id === 'shop');
    expect(shop).toBeDefined();
    expect(isMegaSectionActive(shop!, '/deals')).toBe(true);
    expect(isMegaSectionActive(shop!, '/buy-again')).toBe(true);
    expect(isMegaSectionActive(shop!, '/salts')).toBe(true);
    expect(isMegaSectionActive(shop!, '/lab')).toBe(false);
  });

  it('marks wellness section active on specialty verticals', () => {
    const wellness = MEGA_MENU_SECTIONS.find((s) => s.id === 'specialty');
    expect(isMegaSectionActive(wellness!, '/vaccines')).toBe(true);
    expect(isMegaSectionActive(wellness!, '/pet-care')).toBe(true);
    expect(isMegaSectionActive(wellness!, '/programs')).toBe(true);
    expect(isMegaSectionActive(wellness!, '/programs/cancer-care')).toBe(true);
  });

  it('marks healthcare section active on reminders', () => {
    const healthcare = MEGA_MENU_SECTIONS.find((s) => s.id === 'healthcare');
    expect(isMegaSectionActive(healthcare!, '/reminders')).toBe(true);
    expect(isMegaSectionActive(healthcare!, '/corporate')).toBe(true);
    expect(isMegaSectionActive(healthcare!, '/programs')).toBe(true);
  });
});
