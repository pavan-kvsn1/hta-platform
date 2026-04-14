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
    // Click on new certificate button
    await page.getByRole('link', { name: /new certificate|create certificate/i }).click()

    // Should be on certificate creation page
    await expect(page).toHaveURL(/certificates\/new|certificates\/create/)
  })

  test('engineer can fill basic certificate information', async ({ page }) => {
    await page.goto('/certificates/new')

    // Fill customer information
    await page.getByLabel(/customer name/i).fill('Test Company Ltd')
    await page.getByLabel(/customer address/i).fill('123 Test Street')

    // Fill UUC (Unit Under Calibration) information
    await page.getByLabel(/description|instrument/i).first().fill('Digital Multimeter')
    await page.getByLabel(/make/i).fill('Fluke')
    await page.getByLabel(/model/i).fill('87V')
    await page.getByLabel(/serial/i).fill('SN123456')

    // Verify fields are filled
    await expect(page.getByLabel(/customer name/i)).toHaveValue('Test Company Ltd')
  })

  test('engineer can save certificate as draft', async ({ page }) => {
    await page.goto('/certificates/new')

    // Fill minimum required fields
    await page.getByLabel(/customer name/i).fill('Draft Test Company')
    await page.getByLabel(/description|instrument/i).first().fill('Test Instrument')

    // Save as draft
    await page.getByRole('button', { name: /save draft/i }).click()

    // Should see success message or redirect
    await expect(page.getByText(/saved|draft/i)).toBeVisible({ timeout: 5000 })
  })

  test('engineer can add calibration parameters', async ({ page }) => {
    await page.goto('/certificates/new')

    // Fill basic info first
    await page.getByLabel(/customer name/i).fill('Parameter Test Company')

    // Add a parameter
    await page.getByRole('button', { name: /add parameter/i }).click()

    // Fill parameter details
    await page.getByLabel(/parameter name/i).first().fill('Temperature')
    await page.getByLabel(/unit/i).first().fill('°C')

    // Verify parameter was added
    await expect(page.getByText('Temperature')).toBeVisible()
  })

  test('engineer can submit certificate for review', async ({ page }) => {
    await page.goto('/certificates/new')

    // Fill required fields
    await page.getByLabel(/customer name/i).fill('Review Test Company')
    await page.getByLabel(/customer address/i).fill('456 Review Street')
    await page.getByLabel(/description|instrument/i).first().fill('Pressure Gauge')
    await page.getByLabel(/make/i).fill('Ashcroft')
    await page.getByLabel(/model/i).fill('1005')

    // Submit for review
    await page.getByRole('button', { name: /submit for review|submit/i }).click()

    // Should see confirmation or redirect to certificate view
    await expect(
      page.getByText(/submitted|pending review/i).or(page.locator('[data-status="pending"]'))
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Certificate List', () => {
  test('engineer can view certificate list', async ({ page }) => {
    await page.goto('/certificates')

    // Should see certificate list or empty state
    await expect(
      page.getByRole('table').or(page.getByText(/no certificates|empty/i))
    ).toBeVisible()
  })

  test('engineer can filter certificates by status', async ({ page }) => {
    await page.goto('/certificates')

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
    await page.goto('/certificates')

    const searchInput = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'))

    if (await searchInput.isVisible()) {
      await searchInput.fill('HTA/C')
      await searchInput.press('Enter')

      // Should filter results
      await expect(page).toHaveURL(/search=HTA/i)
    }
  })
})
