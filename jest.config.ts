import type { Config } from 'jest'

const config: Config = {
  projects: [
    {
      displayName: 'main',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/main/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.node.json' }] },
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
      }
    },
    {
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/**/*.test.tsx'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.web.json' }] },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
      }
    }
  ]
}

export default config
