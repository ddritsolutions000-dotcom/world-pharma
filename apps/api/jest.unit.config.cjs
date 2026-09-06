module.exports = {
  displayName: 'api-unit',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testTimeout: 120_000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
};
