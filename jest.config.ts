import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/lib/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['lib/**/*.ts', 'lib/**/*.tsx', '!lib/**/__tests__/**'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};

export default config;
