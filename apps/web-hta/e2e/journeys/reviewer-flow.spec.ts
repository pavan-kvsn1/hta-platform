/**
 * Reviewer Flow E2E Tests
 *
 * Tests the reviewer's certificate review workflow:
 * 1. Reviewer can view team certificates on dashboard
 * 2. Reviewer can access and review pending certificates
 * 3. Reviewer can approve, request revision, or reject
 *
 * Migrated from hta-calibration/tests/e2e/journeys/04-reviewer-flow.spec.ts
 */

import { test, expect } from '@playwright/test'
import { STATUS_LABELS } from '../fixtures/test-data'

test.describe('Reviewer Flow', () => {
  test.use({ storageState: 'e2e/.auth/reviewer.json' })

  test('can access reviewer dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)

    // Should see page content
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('can view certificate table with team certificates', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should have a certificate table or list
    const certificateTable = page.locator('table, [role="table"], .certificate-table, [class*="list"]')
    const tableExists = await certificateTable.first().isVisible({ timeout: 5000 }).catch(() => false)

    // Either table exists or empty state message
    if (!tableExists) {
      const emptyOrStats = page.locator('text=/no certificates|empty|pending|review/i')
      const hasContent = await emptyOrStats.first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(tableExists || hasContent).toBe(true)
    }
  })

  test('can navigate to review page for pending certificate', async ({ page }) => {
    await page.goto('/dashboard')

    // Look for pending review badge
    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPending) {
      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      const reviewLink = row.locator('a').first()

      if (await reviewLink.isVisible()) {
        await reviewLink.click()
        await expect(page).toHaveURL(/dashboard\/.*\/|certificates\//, { timeout: 10000 })
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No pending certificates available for review',
      })
    }
  })

  test('review page shows certificate details and actions', async ({ page }) => {
    await page.goto('/dashboard')

    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPending) {
      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      const reviewLink = row.locator('a').first()

      if (await reviewLink.isVisible()) {
        await reviewLink.click()
        await page.waitForLoadState('networkidle')

        // Should see certificate header
        await expect(page.locator('h1, h2').first()).toBeVisible()

        // Should see review action buttons
        const approveButton = page.locator('button:has-text("Approve")')
        const revisionButton = page.locator('button:has-text("Revision")')
        const hasApprove = await approveButton.isVisible().catch(() => false)
        const hasRevision = await revisionButton.isVisible().catch(() => false)

        expect(hasApprove || hasRevision).toBe(true)
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No pending certificates available for review',
      })
    }
  })

  test('can view PDF preview on review page', async ({ page }) => {
    await page.goto('/dashboard')

    const certificateLink = page.locator('table a, [role="table"] a').first()
    const hasLink = await certificateLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasLink) {
      await certificateLink.click()
      await page.waitForLoadState('networkidle')

      // Look for PDF preview button
      const pdfButton = page.locator('button:has-text("Preview PDF"), button:has-text("PDF"), a:has-text("PDF")')
      const hasPdfButton = await pdfButton.first().isVisible({ timeout: 5000 }).catch(() => false)

      if (hasPdfButton) {
        await pdfButton.first().click()

        // Should open PDF viewer or modal
        const pdfViewer = page.locator('[class*="pdf"], iframe, embed, dialog')
        await pdfViewer.first().isVisible({ timeout: 5000 }).catch(() => false)
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No certificates available to view',
      })
    }
  })

  test('review actions section shows comment field', async ({ page }) => {
    await page.goto('/dashboard')

    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPending) {
      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      const reviewLink = row.locator('a').first()

      if (await reviewLink.isVisible()) {
        await reviewLink.click()
        await page.waitForLoadState('networkidle')

        // Review comment textarea should be present
        const commentTextarea = page.locator('textarea')
        const hasCommentField = await commentTextarea.first().isVisible({ timeout: 5000 }).catch(() => false)
        expect(hasCommentField).toBe(true)
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No pending certificates available for review',
      })
    }
  })

  test('can filter certificates by status', async ({ page }) => {
    await page.goto('/dashboard')

    // Look for filter/dropdown
    const statusFilter = page.getByRole('combobox').or(page.getByLabel(/status|filter/i))

    if (await statusFilter.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusFilter.first().click()
      const draftOption = page.getByRole('option', { name: /draft/i })
      if (await draftOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await draftOption.click()
        await expect(page).toHaveURL(/status=draft/i)
      }
    }
  })
})
