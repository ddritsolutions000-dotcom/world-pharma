module.exports = {
  displayName: 'mobile',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  coverageDirectory: '../../coverage/apps/mobile',
  moduleNameMapper: {
    '^@world-pharma/shell-core$': '<rootDir>/../../packages/shell-core/src/index.ts',
    '^@world-pharma/ui-kit/native$': '<rootDir>/../../packages/ui-kit/src/native/index.ts',
  },
};
