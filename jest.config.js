/**
 * Jest Configuration for Play Store Scraper Module
 * 
 * Note: This project uses ES modules. Jest is configured to handle
 * ESM via the --experimental-vm-modules Node flag (set in package.json).
 */
export default {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/*.test.js',
    ],
    collectCoverageFrom: [
        'src/lib/playstore/**/*.js',
        '!src/lib/playstore/__tests__/**',
        '!src/lib/playstore/index.js',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 75,
            lines: 75,
            statements: 75,
        },
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {},
    testPathIgnorePatterns: ['/node_modules/', '/.next/'],
    verbose: true,
    testTimeout: 10000,
};
