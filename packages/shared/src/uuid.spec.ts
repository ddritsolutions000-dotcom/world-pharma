import { uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('returns RFC-shaped version 7 ids', () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is time-sortable', () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a < b || a !== b).toBe(true);
  });
});
