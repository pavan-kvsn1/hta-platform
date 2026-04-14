/**
 * Visual Regression Tests
 *
 * These tests capture screenshots of key pages for visual comparison.
 * Uses Chromatic for cloud-based visual testing with automatic baseline management.
 *
 * Usage:
 * - Run tests: npm run test:visual
 * - Upload to Chromatic: npm run chromatic
 *
 * Chromatic handles:
 * - Baseline storage in the cloud
 * - Cross-browser consistency
 * - AI-powered diff detection
 * - Visual review dashboard
 *
 * Migrated from hta-calibration/tests/e2e/evals/visual-regression.spec.ts
 */

import { test, takeSnapshot } from '@chromatic-com/playwright'
import { loginAsEngineer, loginAsAdmin, loginAsCustomer, waitForPageStable, maskDynamicContent } from './fixtures/test-utils'

test.describe('Visual Regression - Public Pages', () => {
  test('login page visual snapshot', async ({ page }, testInfo) => {
    await page.goto('/login')
    await waitForPageStable(page)

    await takeSnapshot(page, 'login-page', testInfo)
  })

  test('customer login page visual snapshot', async ({ page }, testInfo) => {
    await page.goto('/customer/login')
    await waitForPageStable(page)

    await takeSnapshot(page, 'customer-login-page', testInfo)
  })
})

test.describe('Visual Regression - Engineer Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEngineer(page)
  })

  test('engineer dashboard visual snapshot', async ({ page }, testInfo) => {
    await waitForPageStable(page)
    await maskDynamicContent(page)

    await takeSnapshot(page, 'engineer-dashboard', testInfo)
  })

  test('new certificate form visual snapshot', async ({ page }, testInfo) => {
    await page.goto('/dashboard/certificates/new')
    await waitForPageStable(page)
    await maskDynamicContent(page)

    await takeSnapshot(page, 'new-certificate-form', testInfo)
  })
})

test.describe('Visual Regression - Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin dashboard visual snapshot', async ({ page }, testInfo) => {
    await page.goto('/admin')
    await waitForPageStable(page)
    await maskDynamicContent(page)

    await takeSnapshot(page, 'admin-dashboard', testInfo)
  })
})

test.describe('Visual Regression - Customer Portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCustomer(page)
  })

  test('customer dashboard visual snapshot', async ({ page }, testInfo) => {
    await waitForPageStable(page)
    await maskDynamicContent(page)

    await takeSnapshot(page, 'customer-dashboard', testInfo)
  })
})

test.describe('Visual Regression - Responsive Design', () => {
  test('login page mobile view', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/login')
    await waitForPageStable(page)

    await takeSnapshot(page, 'login-page-mobile', testInfo)
  })

  test('login page tablet view', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/login')
    await waitForPageStable(page)

    await takeSnapshot(page, 'login-page-tablet', testInfo)
  })
})

test.describe('Visual Regression - Component States', () => {
  test('login form with validation error', async ({ page }, testInfo) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.click('button[type="submit"]')
    await page.waitForTimeout(500)

    await takeSnapshot(page, 'login-form-validation-error', testInfo)
  })

  test('login form with invalid credentials error', async ({ page }, testInfo) => {
    await page.goto('/login')
    await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await takeSnapshot(page, 'login-form-invalid-credentials', testInfo)
  })
})

test.describe('Visual Regression - Certificate Views', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEngineer(page)
  })

  test('certificate list view', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await waitForPageStable(page)
    await maskDynamicContent(page)

    await takeSnapshot(page, 'certificate-list', testInfo)
  })
})
