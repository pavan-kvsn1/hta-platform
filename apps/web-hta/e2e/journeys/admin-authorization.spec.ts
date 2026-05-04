/**
 * Admin Authorization Flow E2E Tests
 *
 * Tests the admin authorization workflow:
 * - View certificates pending authorization
 * - Navigate to authorization page
 * - Authorize a certificate (completes the action)
 * - Verify authorized certificates show download option
 *
 * Requires seed data with at least one PENDING_ADMIN_AUTHORIZATION certificate.
 */

import { test, expect } from '@playwright/test'
import { STATUS_LABELS } from '../fixtures/test-data'

test.describe('Admin Authorization Flow', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test('admin can access admin dashboard', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/admin|dashboard/)
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('can view certificates pending authorization', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('domcontentloaded')

    // Seed data guarantees pending authorization certificates or a certificate table
    await expect(
      page.locator('table, [role="table"]').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('can navigate to authorization review page', async ({ page }) => {
    await page.goto('/admin')

    const pendingAuthBadge = page.locator(`text=${STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION}`).first()
    await expect(pendingAuthBadge).toBeVisible({ timeout: 10000 })

    const row = pendingAuthBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()

    await expect(page).toHaveURL(/admin\/.*\/|authorize/, { timeout: 10000 })
  })

  test('authorization page shows certificate details', async ({ page }) => {
    await page.goto('/admin')

    const pendingAuthBadge = page.locator(`text=${STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION}`).first()
    await expect(pendingAuthBadge).toBeVisible({ timeout: 10000 })

    const row = pendingAuthBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1, h2').first()).toBeVisible()
    await expect(page.locator('text=/customer|instrument|uuc/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('authorization page shows authorize button', async ({ page }) => {
    await page.goto('/admin')

    const pendingAuthBadge = page.locator(`text=${STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION}`).first()
    await expect(pendingAuthBadge).toBeVisible({ timeout: 10000 })

    const row = pendingAuthBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.locator('button:has-text("Authorize"), button:has-text("Approve")').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('admin can authorize a certificate', async ({ page }) => {
    await page.goto('/admin')

    const pendingAuthBadge = page.locator(`text=${STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION}`).first()
    await expect(pendingAuthBadge).toBeVisible({ timeout: 10000 })

    const row = pendingAuthBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    // Click Authorize
    const authorizeButton = page.locator('button:has-text("Authorize"), button:has-text("Approve")').first()
    await expect(authorizeButton).toBeVisible({ timeout: 5000 })
    await authorizeButton.click()

    // Handle confirmation dialog if present
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Verify authorized status
    await expect(
      page.getByText(/authorized|success/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('authorization page shows signatures section', async ({ page }) => {
    await page.goto('/admin')

    const pendingAuthBadge = page.locator(`text=${STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION}`).first()
    await expect(pendingAuthBadge).toBeVisible({ timeout: 10000 })

    const row = pendingAuthBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('text=/signature|signed/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('can view authorized certificates with download option', async ({ page }) => {
    await page.goto('/admin')

    const authorizedBadge = page.locator(`text=${STATUS_LABELS.AUTHORIZED}`).first()
    await expect(authorizedBadge).toBeVisible({ timeout: 10000 })

    const row = authorizedBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator(`text=${STATUS_LABELS.AUTHORIZED}`)).toBeVisible()
    await expect(
      page.locator('button:has-text("Download"), a:has-text("Download"), button:has-text("PDF")').first()
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Admin Dashboard Statistics', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test('dashboard shows authorization statistics', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('domcontentloaded')

    // Stats cards should be visible
    await expect(
      page.locator('.grid, [class*="stats"], [class*="card"]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('can search certificates by number', async ({ page }) => {
    await page.goto('/admin')

    const searchInput = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'))
    await expect(searchInput.first()).toBeVisible({ timeout: 5000 })

    await searchInput.first().fill('HTA')
    await searchInput.first().press('Enter')
    await page.waitForLoadState('domcontentloaded')
  })
})
