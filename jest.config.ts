import type { Config } from 'jest'

const config: Config = {
  projects: [
    {
      displayName: 'main',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/main/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.node.json' }] },
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
        '^keytar$': '<rootDir>/tests/__mocks__/keytar.ts',
        '^googleapis$': '<rootDir>/tests/__mocks__/googleapis.ts',
        '^pusher-js$': '<rootDir>/tests/__mocks__/pusher-js.ts',
        '^tiktok-live-connector$': '<rootDir>/tests/__mocks__/tiktok-live-connector.ts'
      }
    },
    {
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/**/*.test.tsx', '<rootDir>/tests/renderer/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.web.json' }] },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
        '^keytar$': '<rootDir>/tests/__mocks__/keytar.ts',
        '^googleapis$': '<rootDir>/tests/__mocks__/googleapis.ts',
        '^pusher-js$': '<rootDir>/tests/__mocks__/pusher-js.ts',
        '^tiktok-live-connector$': '<rootDir>/tests/__mocks__/tiktok-live-connector.ts'
      }
    }
  ]
}

export default config
