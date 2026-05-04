import { defineConfig } from 'vitest/config'
import path from 'path'

const root = path.resolve(__dirname, '../..')

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root,
    include: ['tests/compliance/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@hta/database': path.resolve(root, 'packages/database/src/index.ts'),
    },
  },
})
