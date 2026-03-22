const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests//**/*(*.)@(spec|test).ts'],
  moduleNameMapper: {
    '^src/(.*)\\.ksy$': '<rootDir>/tests/__mocks__/ksyFileMock.js',
    '\\.ksy$': '<rootDir>/tests/__mocks__/ksyFileMock.js',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest'],
    'node_modules/onelibrary-connect/.+\\.js$': ['ts-jest', {useESM: false}],
  },
  transformIgnorePatterns: [
    'node_modules/(?!onelibrary-connect)',
  ],
};

export default config;
