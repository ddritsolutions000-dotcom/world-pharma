import { DOMAIN_EVENT_TYPES } from './envelope';

describe('catalog domain events', () => {
  it('includes archive so admin retire is an audited event', () => {
    expect(DOMAIN_EVENT_TYPES).toContain('PRODUCT_ARCHIVED');
  });
});
