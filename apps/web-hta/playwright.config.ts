import { defineConfig, devices } from '@playwright/test'

const STORAGE_STATE_DIR = 'e2e/.auth'

/**
 * Playwright E2E Test Configuration
 *
 * Mirrors hta-calibration setup with multi-role authentication.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  reporter: process.env.CI
    ? [
        ['html', { open: 'never' }],
        ['github'],
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [
        ['html', { open: 'never' }],
        ['list'],
      ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'off',
  },

  projects: [
    // === SETUP PROJECT: Authenticate once, reuse sessions ===
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // === AUTHENTICATED PROJECTS: Use stored sessions ===
    {
      name: 'engineer-tests',
      testMatch: /journeys\/certificate-flow\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/engineer.json`,
      },
    },
    {
      name: 'reviewer-tests',
      testMatch: /journeys\/reviewer-flow\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/reviewer.json`,
      },
    },
    {
      name: 'admin-tests',
      testMatch: /journeys\/admin-authorization\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/admin.json`,
      },
    },
    {
      name: 'customer-tests',
      testMatch: /journeys\/customer-flow\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/customer.json`,
      },
    },

    // === VISUAL REGRESSION TESTS ===
    {
      name: 'chromium',
      testMatch: /visual-regression\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // === UNAUTHENTICATED TESTS ===
    {
      name: 'public-tests',
      testMatch: /pages\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // === CROSS-BROWSER (optional) ===
    {
      name: 'firefox',
      testMatch: /pages\/.*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  // Run local dev server before tests (skip if server already running on port 3000)
  webServer: process.env.SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
})
