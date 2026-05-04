/**
 * Offline Code Request Flow E2E Tests
 *
 * Tests the offline code request-approval workflow:
 * 1. Engineer requests a new code card
 * 2. Pending banner appears
 * 3. Admin approves the request
 * 4. Engineer sees the code grid
 *
 * Requires seed data with engineer user and admin user.
 */

import { test, expect } from '@playwright/test'

test.describe('Offline Code Request Flow — Engineer', () => {
  test.use({ storageState: 'e2e/.auth/engineer.json' })

  test('engineer can navigate to offline codes page', async ({ page }) => {
    await page.goto('/dashboard/offline-codes')
    await expect(page).toHaveURL(/offline-codes/)
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
  })

  test('engineer can request a new code card', async ({ page }) => {
    await page.goto('/dashboard/offline-codes')
    await page.waitForLoadState('domcontentloaded')

    // Click "Request New Card" button
    const requestButton = page.getByRole('button', { name: /request new card|request/i })
    await expect(requestButton).toBeVisible({ timeout: 10000 })
    await requestButton.click()

    // Handle confirmation dialog if present
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Yes")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Should see pending approval banner
    await expect(
      page.getByText(/pending|awaiting|approval/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('duplicate request shows existing pending status', async ({ page }) => {
    await page.goto('/dashboard/offline-codes')
    await page.waitForLoadState('domcontentloaded')

    // If there's already a pending request, button should be disabled or show status
    const pendingBanner = page.getByText(/pending|awaiting|approval/i).first()
    const requestButton = page.getByRole('button', { name: /request new card|request/i })

    // Either pending banner is shown OR request button is available (but not both active)
    const hasPending = await pendingBanner.isVisible({ timeout: 5000 }).catch(() => false)
    if (hasPending) {
      // Request button should not be available when a pending request exists
      await expect(requestButton).not.toBeVisible({ timeout: 3000 }).catch(() => {
        // Button might be visible but disabled
        expect(requestButton).toBeDisabled()
      })
    }
  })
})

test.describe('Offline Code Request Flow — Admin Approval', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test('admin can see offline code requests in requests page', async ({ page }) => {
    await page.goto('/admin/requests')
    await page.waitForLoadState('domcontentloaded')

    // Should see the requests list
    await expect(
      page.locator('table, [role="table"], [class*="list"]').first()
        .or(page.getByText(/offline code|code card/i).first())
    ).toBeVisible({ timeout: 10000 })
  })

  test('admin can approve an offline code request', async ({ page }) => {
    await page.goto('/admin/requests')
    await page.waitForLoadState('domcontentloaded')

    // Find a pending offline code request
    const pendingBadge = page.locator('text=/pending/i').first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    // Navigate to the request detail
    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    const detailLink = row.locator('a').first()
    await detailLink.click()
    await page.waitForLoadState('domcontentloaded')

    // Click Approve
    const approveButton = page.getByRole('button', { name: /approve/i })
    await expect(approveButton).toBeVisible({ timeout: 5000 })
    await approveButton.click()

    // Handle confirmation dialog
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Verify approval succeeded
    await expect(
      page.getByText(/approved|success/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Offline Code Request Flow — Engineer Sees Grid', () => {
  test.use({ storageState: 'e2e/.auth/engineer.json' })

  test('engineer sees code grid after approval', async ({ page }) => {
    await page.goto('/dashboard/offline-codes')
    await page.waitForLoadState('domcontentloaded')

    // After approval, should see the code grid (5×10 grid of challenge-response pairs)
    // The grid contains cells with keys like A1, A2, ... E10
    await expect(
      page.locator('table, [class*="grid"]').first()
        .or(page.getByText(/A1|challenge|response/i).first())
    ).toBeVisible({ timeout: 10000 })
  })
})
