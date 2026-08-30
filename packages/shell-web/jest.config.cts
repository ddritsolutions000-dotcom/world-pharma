module.exports = {
  displayName: 'shell-web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  coverageDirectory: '../../coverage/packages/shell-web',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/../ui-kit/src/test/style-mock.ts',
    '^@world-pharma/shell-core$': '<rootDir>/../shell-core/src/index.ts',
    '^@world-pharma/ui-kit/web$': '<rootDir>/../ui-kit/src/web/index.ts',
  },
};
