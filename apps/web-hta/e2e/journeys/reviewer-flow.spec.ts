/**
 * Reviewer Flow E2E Tests
 *
 * Tests the reviewer's certificate review workflow:
 * - View pending certificates
 * - Navigate to review page
 * - Approve a certificate (completes the action)
 *
 * Requires seed data with at least one PENDING_REVIEW certificate.
 */

import { test, expect } from '@playwright/test'
import { STATUS_LABELS } from '../fixtures/test-data'

test.describe('Reviewer Flow', () => {
  test.use({ storageState: 'e2e/.auth/reviewer.json' })

  test('can access reviewer dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
    await expect(page.locator('h1, h2, [class*="header"], [class*="title"]').first()).toBeVisible({ timeout: 15000 })
  })

  test('can view certificate table with team certificates', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Seed data guarantees at least one certificate exists
    await expect(
      page.locator('table, [role="table"], .certificate-table, [class*="list"]').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('can navigate to review page for pending certificate', async ({ page }) => {
    await page.goto('/dashboard')

    // Seed data guarantees a PENDING_REVIEW certificate
    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    const reviewLink = row.locator('a').first()
    await reviewLink.click()

    await expect(page).toHaveURL(/dashboard\/.*\/|certificates\//, { timeout: 10000 })
  })

  test('review page shows certificate details and action buttons', async ({ page }) => {
    await page.goto('/dashboard')

    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    // Should see certificate header
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // Should see review action buttons
    const approveButton = page.locator('button:has-text("Approve")')
    const revisionButton = page.locator('button:has-text("Revision")')
    await expect(approveButton.or(revisionButton).first()).toBeVisible({ timeout: 5000 })
  })

  test('review page shows comment field', async ({ page }) => {
    await page.goto('/dashboard')

    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 })
  })

  test('reviewer can approve a certificate', async ({ page }) => {
    await page.goto('/dashboard')

    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    // Click Approve
    const approveButton = page.locator('button:has-text("Approve")')
    await expect(approveButton).toBeVisible({ timeout: 5000 })
    await approveButton.click()

    // Verify status changes (may show confirmation dialog first)
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Should see approved status or success feedback
    await expect(
      page.getByText(/approved|success|pending authorization/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('can view PDF preview on review page', async ({ page }) => {
    await page.goto('/dashboard')

    const certificateLink = page.locator('table a, [role="table"] a').first()
    await expect(certificateLink).toBeVisible({ timeout: 5000 })
    await certificateLink.click()
    await page.waitForLoadState('domcontentloaded')

    const pdfButton = page.locator('button:has-text("Preview PDF"), button:has-text("PDF"), a:has-text("PDF")')
    await expect(pdfButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('can filter certificates by status', async ({ page }) => {
    await page.goto('/dashboard')

    const statusFilter = page.getByRole('combobox').or(page.getByLabel(/status|filter/i))
    await expect(statusFilter.first()).toBeVisible({ timeout: 5000 })
    await statusFilter.first().click()

    const draftOption = page.getByRole('option', { name: /draft/i })
    await expect(draftOption).toBeVisible({ timeout: 3000 })
    await draftOption.click()
  })
})
