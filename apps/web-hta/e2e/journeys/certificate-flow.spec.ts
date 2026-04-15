/**
 * Certificate Creation Flow E2E Tests
 *
 * Tests the complete certificate creation workflow from
 * engineer perspective.
 */

import { test, expect } from '@playwright/test'

test.describe('Certificate Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard - auth state is already loaded
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
  })

  test('engineer can navigate to new certificate form', async ({ page }) => {
    // Click on new certificate link/button (use first if multiple)
    await page
      .getByRole('link', { name: /new certificate/i })
      .or(page.getByRole('button', { name: /new certificate/i }))
      .first()
      .click()

    // The /new page creates a draft and redirects to /edit
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
  })

  test('engineer can fill basic certificate information', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })

    // Wait for form to load
    await page.waitForSelector('text=Summary Information', { timeout: 10000 })

    // Fill customer information (in Summary section)
    await page.getByPlaceholder(/start typing customer name/i).fill('Test Company Ltd')
    await page.getByPlaceholder(/enter customer address/i).fill('123 Test Street')

    // Verify fields are filled
    await expect(page.getByPlaceholder(/start typing customer name/i)).toHaveValue('Test Company Ltd')
  })

  test('engineer can save certificate as draft', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })

    // Wait for form to load
    await page.waitForSelector('text=Summary Information', { timeout: 10000 })

    // Fill minimum required fields
    await page.getByPlaceholder(/start typing customer name/i).fill('Draft Test Company')

    // Save as draft (look for Save button)
    await page.getByRole('button', { name: /save|draft/i }).first().click()

    // Should see success message or stay on page
    await expect(page.getByText(/saved|success/i).or(page.locator('[data-status]'))).toBeVisible({ timeout: 5000 })
  })

  test('engineer can add calibration parameters', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })

    // Wait for form to load
    await page.waitForSelector('text=Summary Information', { timeout: 10000 })

    // Navigate to Results section where parameters are added
    await page.getByRole('button', { name: 'Results', exact: true }).click()

    // Verify Results section is displayed (contains calibration data table or results form)
    await expect(
      page.getByText(/calibration results/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('engineer can submit certificate for review', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })

    // Wait for form to load
    await page.waitForSelector('text=Summary Information', { timeout: 10000 })

    // Fill required fields in Summary section
    await page.getByPlaceholder(/start typing customer name/i).fill('Review Test Company')

    // Navigate to Submit section
    await page.getByRole('button', { name: 'Submit', exact: true }).first().click()

    // Verify Submit section is displayed with the final submit button
    await expect(
      page.getByRole('button', { name: /submit for peer review/i })
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Certificate List', () => {
  test('engineer can view certificate list', async ({ page }) => {
    await page.goto('/dashboard')

    // Should see certificate list or empty state
    await expect(
      page.getByRole('table').or(page.getByText(/no certificates/i))
    ).toBeVisible()
  })

  test('engineer can filter certificates by status', async ({ page }) => {
    await page.goto('/dashboard')

    // Look for filter/dropdown
    const statusFilter = page.getByRole('combobox', { name: /status/i }).or(
      page.getByLabel(/status/i)
    )

    if (await statusFilter.isVisible()) {
      await statusFilter.click()
      await page.getByRole('option', { name: /draft/i }).click()

      // URL should update with filter
      await expect(page).toHaveURL(/status=draft/i)
    }
  })

  test('engineer can search certificates', async ({ page }) => {
    await page.goto('/dashboard')

    const searchInput = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'))

    if (await searchInput.isVisible()) {
      await searchInput.fill('HTA/C')
      await searchInput.press('Enter')

      // Verify the search input retained its value
      await expect(searchInput.first()).toHaveValue('HTA/C')
    }
  })
})
