import { apiBaseUrl, createCorrelationId } from './http';

describe('http helpers', () => {
  it('strips trailing slashes from the API base', () => {
    expect(apiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/' })).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('creates non-empty correlation ids', () => {
    expect(createCorrelationId().length).toBeGreaterThan(8);
  });
});
