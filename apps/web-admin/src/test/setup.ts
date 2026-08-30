import '@testing-library/jest-dom';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }),
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
