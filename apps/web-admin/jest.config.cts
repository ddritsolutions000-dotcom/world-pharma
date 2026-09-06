module.exports = {
  displayName: 'web-admin',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/../../packages/ui-kit/src/test/style-mock.ts',
    '^@world-pharma/shared/site-chrome$': '<rootDir>/../../packages/shared/src/site-chrome.ts',
    '^@world-pharma/shared/site-page-blocks$': '<rootDir>/../../packages/shared/src/site-page-blocks.ts',
    '^@world-pharma/shared/partner-fields$': '<rootDir>/../../packages/shared/src/partner-fields.ts',
    '^@world-pharma/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@world-pharma/shell-web$': '<rootDir>/../../packages/shell-web/src/index.ts',
    '^@world-pharma/shell-core$': '<rootDir>/../../packages/shell-core/src/index.ts',
    '^@world-pharma/ui-kit/web$': '<rootDir>/../../packages/ui-kit/src/web/index.ts',
  },
};
