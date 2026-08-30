module.exports = {
  displayName: 'web-customer',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/../../packages/ui-kit/src/test/style-mock.ts',
    '^@world-pharma/shell-web$': '<rootDir>/../../packages/shell-web/src/index.ts',
    '^@world-pharma/shell-core$': '<rootDir>/../../packages/shell-core/src/index.ts',
    '^@world-pharma/ui-kit/web$': '<rootDir>/../../packages/ui-kit/src/web/index.ts',
  },
};
