/** Minimal browser globals for shell-core http resolution in node tests. */
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      hostname: 'localhost',
      port: '8081',
      protocol: 'http:',
      origin: 'http://localhost:8081',
    },
  },
  configurable: true,
});
