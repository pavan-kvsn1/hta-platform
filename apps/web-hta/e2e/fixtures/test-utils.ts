/**
 * E2E Test Utilities
 *
 * Helper functions for E2E tests including authentication,
 * page navigation, and common assertions.
 *
 * Migrated from hta-calibration/tests/e2e/fixtures/test-utils.ts
 */

import { expect } from '@playwright/test'
import { TEST_USERS } from './test-data'

// Use a generic Page type that's compatible with both @playwright/test and @chromatic-com/playwright
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any

type UserRole = keyof typeof TEST_USERS

interface LoginOptions {
  loginPath?: string
  expectedUrlPattern?: RegExp
  /** Skip login if already authenticated (uses storageState) */
  skipIfAuthenticated?: boolean
}

/**
 * Check if user is already logged in by checking for dashboard/admin URL or session cookie
 */
async function isAuthenticated(page: Page, expectedUrlPattern: RegExp): Promise<boolean> {
  try {
    // Check if we're already on an authenticated page
    const url = page.url()
    if (expectedUrlPattern.test(url)) {
      return true
    }

    // Check for session cookie
    const cookies = await page.context().cookies()
    const hasSessionCookie = cookies.some(
      (c) => c.name.includes('session') || c.name.includes('next-auth')
    )
    return hasSessionCookie
  } catch {
    return false
  }
}

/**
 * Robust login helper that handles network timing issues
 * This prevents flaky tests by properly waiting for all states
 *
 * When using storageState in playwright.config.ts, this will skip
 * the login flow if the user is already authenticated.
 */
export async function login(page: Page, role: UserRole, options: LoginOptions = {}) {
  const user = TEST_USERS[role]
  const loginPath = options.loginPath ?? '/login'
  const expectedUrlPattern = options.expectedUrlPattern ?? /dashboard|admin|customer/
  const skipIfAuthenticated = options.skipIfAuthenticated ?? true

  // Check if already authenticated (when using storageState)
  if (skipIfAuthenticated && (await isAuthenticated(page, expectedUrlPattern))) {
    // Already logged in, just navigate to expected page if needed
    if (!expectedUrlPattern.test(page.url())) {
      const targetPath = role === 'customer' ? '/customer/dashboard' : '/dashboard'
      await page.goto(targetPath)
      await page.waitForLoadState('domcontentloaded')
    }
    return
  }

  // Navigate and wait for login page to be fully loaded
  await page.goto(loginPath)
  await page.waitForLoadState('domcontentloaded')

  // Wait for form elements to be ready
  const emailInput = page.locator('input[type="email"], input[name="email"]')
  const passwordInput = page.locator('input[type="password"], input[name="password"]')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 10000 })
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 })

  // Fill credentials
  await emailInput.fill(user.email)
  await passwordInput.fill(user.password)

  // Click submit and wait for navigation simultaneously
  await Promise.all([
    page.waitForURL(expectedUrlPattern, { timeout: 15000 }),
    submitButton.click(),
  ])

  // Ensure the page is loaded after redirect
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Role-specific login helpers for convenience
 */
export async function loginAsEngineer(page: Page) {
  await login(page, 'engineer', { expectedUrlPattern: /dashboard/ })
  await expect(page).toHaveURL(/dashboard/)
}

export async function loginAsReviewer(page: Page) {
  await login(page, 'reviewer', { expectedUrlPattern: /dashboard|admin/ })
  await expect(page).toHaveURL(/dashboard|admin/)
}

export async function loginAsAdmin(page: Page) {
  await login(page, 'admin', { expectedUrlPattern: /admin|dashboard/ })
  await expect(page).toHaveURL(/admin|dashboard/)
}

export async function loginAsCustomer(page: Page) {
  // Clear any existing session to ensure we login as customer
  await page.context().clearCookies()
  await login(page, 'customer', {
    loginPath: '/customer/login',
    expectedUrlPattern: /customer\/dashboard/,
    skipIfAuthenticated: false, // Force fresh login
  })
  await expect(page).toHaveURL(/customer\/dashboard/)
}

/**
 * Wait for page to be fully loaded and stable
 */
export async function waitForPageStable(page: Page, timeout = 500) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(timeout)
}

/**
 * Mask dynamic content like timestamps for visual regression tests
 */
export async function maskDynamicContent(page: Page) {
  await page.evaluate(() => {
    // Mask timestamps
    document.querySelectorAll('[data-testid="timestamp"], time').forEach((el) => {
      el.textContent = '2026-01-01 00:00'
    })

    // Mask draft certificate numbers
    document.querySelectorAll('h1, h2, h3').forEach((el) => {
      if (el.textContent?.includes('DRAFT-')) {
        el.textContent = 'DRAFT-XXXXXXXX'
      }
    })

    document
      .querySelectorAll('input[name="certificateNumber"], input[id="certificateNumber"]')
      .forEach((el) => {
        const input = el as HTMLInputElement
        if (input.value.includes('DRAFT-')) {
          input.value = 'DRAFT-XXXXXXXX'
        }
      })
  })
}
