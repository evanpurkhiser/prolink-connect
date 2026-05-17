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
    // Match onelibrary-connect whether it's under node_modules or resolved as
    // a sibling dir (npm `file:` deps install as symlinks; Jest sees the
    // realpath, which has no node_modules prefix in CI).
    '[/\\\\]onelibrary-connect[/\\\\].+\\.js$': ['ts-jest', {useESM: false}],
  },
  transformIgnorePatterns: [
    'node_modules/(?!onelibrary-connect)',
  ],
};

export default config;
