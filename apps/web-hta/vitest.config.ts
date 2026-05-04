import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
    // Integration tests require database setup - run separately
    exclude: ['node_modules', '.next', 'e2e', 'tests/integration'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
      thresholds: {
        statements: 2,
        branches: 54,
        functions: 15,
        lines: 2,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
