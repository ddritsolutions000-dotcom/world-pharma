import { apiBaseUrl, createCorrelationId } from './http';

describe('http helpers', () => {
  it('strips trailing slashes from the API base', () => {
    expect(apiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/' })).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('uses EXPO_PUBLIC_API_BASE_URL for device LAN hosts', () => {
    expect(apiBaseUrl({ EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.40:4000/' })).toBe(
      'http://192.168.1.40:4000',
    );
  });

  it('defaults to loopback only when no public Expo URL is configured', () => {
    expect(apiBaseUrl({})).toBe('http://127.0.0.1:4000');
  });

  it('creates non-empty correlation ids', () => {
    expect(createCorrelationId().length).toBeGreaterThan(8);
  });

  it('uses the Next origin on store and admin ports', () => {
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window: { location: { port: string; origin: string; hostname: string; protocol: string } } }).window = {
      location: {
        port: '3000',
        origin: 'http://localhost:3000',
        hostname: 'localhost',
        protocol: 'http:',
      },
    };
    try {
      expect(apiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000' })).toBe('http://localhost:3000');
    } finally {
      if (previous === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous;
      }
    }
  });

  it('uses the Next origin on doctor portal port 3002', () => {
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window: { location: { port: string; origin: string; hostname: string; protocol: string } } }).window = {
      location: {
        port: '3002',
        origin: 'http://localhost:3002',
        hostname: 'localhost',
        protocol: 'http:',
      },
    };
    try {
      expect(apiBaseUrl({})).toBe('http://localhost:3002');
    } finally {
      if (previous === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous;
      }
    }
  });
});
