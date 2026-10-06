/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.spec.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/test'],
      testMatch: ['**/*.int-spec.ts'],
    },
  ],
};
