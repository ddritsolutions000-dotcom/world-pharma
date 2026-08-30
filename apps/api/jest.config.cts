module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  setupFilesAfterEnv: ['<rootDir>/src/test/jest-after-env.ts'],
  globalSetup: '<rootDir>/src/test/global-setup.cjs',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  maxWorkers: 1,
  // Do not forceExit — open handles must be closed via lifecycle (CR-PRE-R6-REPAIR-123).
  forceExit: false,
  coverageDirectory: '../../coverage/apps/api',
  moduleNameMapper: {
    '^@world-pharma/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@world-pharma/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@world-pharma/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};
