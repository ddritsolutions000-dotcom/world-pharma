module.exports = {
  displayName: 'ui-kit',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  coverageDirectory: '../../coverage/packages/ui-kit',
  moduleNameMapper: {
    '\\.css$': '<rootDir>/src/test/style-mock.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};
