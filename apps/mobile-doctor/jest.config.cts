module.exports = {
  displayName: 'mobile-doctor',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  coverageDirectory: '../../coverage/apps/mobile-doctor',
  moduleNameMapper: {
    '^@world-pharma/shell-core$': '<rootDir>/../../packages/shell-core/src/index.ts',
    '^@world-pharma/ui-kit/native$': '<rootDir>/../../packages/ui-kit/src/native/index.ts',
  },
};
