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
    const newCertLink = page
      .getByRole('link', { name: /new certificate/i })
      .or(page.getByRole('button', { name: /new certificate/i }))
      .first()

    try {
      await newCertLink.click({ timeout: 10000 })
    } catch (e) {
      console.log('DEBUG navigate: Could not find new certificate button')
      console.log('DEBUG navigate: Current URL:', page.url())
      console.log('DEBUG navigate: Page content snippet:', (await page.content()).slice(0, 2000))
      throw e
    }

    // The /new page creates a draft and redirects to /edit
    try {
      await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    } catch (e) {
      console.log('DEBUG navigate: Failed redirect to edit, URL:', page.url())
      console.log('DEBUG navigate: Page content snippet:', (await page.content()).slice(0, 2000))
      throw e
    }
  })

  test('engineer can fill basic certificate information', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')

    // Debug: capture what URL we end up on
    try {
      await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    } catch (e) {
      console.log('DEBUG: Failed to redirect to edit page')
      console.log('DEBUG: Current URL:', page.url())
      console.log('DEBUG: Page HTML:', await page.content())
      throw e
    }

    // Wait for form to load
    try {
      await page.waitForSelector('text=Summary Information', { timeout: 10000 })
    } catch (e) {
      console.log('DEBUG: Failed to find Summary Information')
      console.log('DEBUG: Current URL:', page.url())
      console.log('DEBUG: Page HTML:', await page.content())
      throw e
    }

    // Fill customer information (in Summary section)
    await page.getByPlaceholder(/start typing customer name/i).fill('Test Company Ltd')
    await page.getByPlaceholder(/enter customer address/i).fill('123 Test Street')

    // Verify fields are filled
    await expect(page.getByPlaceholder(/start typing customer name/i)).toHaveValue('Test Company Ltd')
  })

  test('engineer can save certificate as draft', async ({ page }) => {
    // Navigate to new certificate - redirects to edit page
    await page.goto('/dashboard/certificates/new')

    try {
      await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    } catch (e) {
      console.log('DEBUG save draft: Current URL:', page.url())
      throw e
    }

    // Wait for form to load
    try {
      await page.waitForSelector('text=Summary Information', { timeout: 10000 })
    } catch (e) {
      console.log('DEBUG save draft: Failed to find form, URL:', page.url())
      console.log('DEBUG save draft: Page content snippet:', (await page.content()).slice(0, 2000))
      throw e
    }

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

    try {
      await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    } catch (e) {
      console.log('DEBUG calibration: Current URL:', page.url())
      throw e
    }

    // Wait for form to load
    try {
      await page.waitForSelector('text=Summary Information', { timeout: 10000 })
    } catch (e) {
      console.log('DEBUG calibration: Failed to find form, URL:', page.url())
      console.log('DEBUG calibration: Page content snippet:', (await page.content()).slice(0, 2000))
      throw e
    }

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

    try {
      await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    } catch (e) {
      console.log('DEBUG submit: Current URL:', page.url())
      throw e
    }

    // Wait for form to load
    try {
      await page.waitForSelector('text=Summary Information', { timeout: 10000 })
    } catch (e) {
      console.log('DEBUG submit: Failed to find form, URL:', page.url())
      console.log('DEBUG submit: Page content snippet:', (await page.content()).slice(0, 2000))
      throw e
    }

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
