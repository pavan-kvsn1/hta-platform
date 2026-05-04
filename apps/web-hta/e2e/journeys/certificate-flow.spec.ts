/**
 * Certificate Creation Flow E2E Tests
 *
 * Tests the complete certificate creation workflow from
 * engineer perspective: create → fill → save draft → submit for review.
 */

import { test, expect } from '@playwright/test'

test.describe('Certificate Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
  })

  test('engineer can navigate to new certificate form', async ({ page }) => {
    const newCertLink = page
      .getByRole('link', { name: /new certificate/i })
      .or(page.getByRole('button', { name: /new certificate/i }))
      .first()

    await newCertLink.click({ timeout: 10000 })
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
  })

  test('engineer can fill basic certificate information', async ({ page }) => {
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })

    // Wait for form to load
    await page.waitForSelector('text=Loading certificate...', { state: 'hidden', timeout: 20000 })
    await page.waitForSelector('text=Summary Information', { timeout: 15000 })

    // Fill customer information
    await page.getByPlaceholder(/start typing customer name/i).fill('Test Company Ltd')
    await page.getByPlaceholder(/enter customer address/i).fill('123 Test Street')

    await expect(page.getByPlaceholder(/start typing customer name/i)).toHaveValue('Test Company Ltd')
  })

  test('engineer can save certificate as draft', async ({ page }) => {
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    await page.waitForSelector('text=Loading certificate...', { state: 'hidden', timeout: 20000 })
    await page.waitForSelector('text=Summary Information', { timeout: 15000 })

    await page.getByPlaceholder(/start typing customer name/i).fill('Draft Test Company')

    // Save as draft
    await page.getByRole('button', { name: /save|draft/i }).first().click()

    // Verify success feedback
    await expect(
      page.getByText(/saved|success/i).or(page.locator('[data-status]'))
    ).toBeVisible({ timeout: 5000 })
  })

  test('engineer can add calibration parameters', async ({ page }) => {
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    await page.waitForSelector('text=Loading certificate...', { state: 'hidden', timeout: 20000 })
    await page.waitForSelector('text=Summary Information', { timeout: 15000 })

    // Navigate to Results section
    await page.getByRole('button', { name: 'Results', exact: true }).click()

    await expect(page.getByText(/calibration results/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('engineer can submit certificate for review', async ({ page }) => {
    await page.goto('/dashboard/certificates/new')
    await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
    await page.waitForSelector('text=Loading certificate...', { state: 'hidden', timeout: 20000 })
    await page.waitForSelector('text=Summary Information', { timeout: 15000 })

    // Fill required fields
    await page.getByPlaceholder(/start typing customer name/i).fill('Review Test Company')

    // Navigate to Submit section
    await page.getByRole('button', { name: 'Submit', exact: true }).first().click()

    // Click the submit for review button
    const submitButton = page.getByRole('button', { name: /submit for peer review/i })
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()

    // Verify status changes to Pending Review
    await expect(
      page.getByText(/pending review|submitted/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Certificate List', () => {
  test('engineer can view certificate list', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(
      page.getByRole('table').or(page.getByText(/no certificates/i)).first()
    ).toBeVisible()
  })

  test('engineer can filter certificates by status', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    const statusFilter = page.getByRole('combobox', { name: /status/i })
      .or(page.getByLabel(/status/i))
      .or(page.locator('select[name*="status"]'))
      .or(page.locator('[data-testid*="status-filter"]'))

    await expect(statusFilter.first()).toBeVisible({ timeout: 5000 })
    await statusFilter.first().click()

    const draftOption = page.getByRole('option', { name: /draft/i })
      .or(page.locator('li:has-text("Draft")'))
      .or(page.locator('[data-value="DRAFT"]'))

    await draftOption.first().click()
    await page.waitForTimeout(500)
  })

  test('engineer can search certificates', async ({ page }) => {
    await page.goto('/dashboard')

    const searchInput = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'))
    await expect(searchInput.first()).toBeVisible()

    await searchInput.first().fill('HTA/C')
    await searchInput.first().press('Enter')

    await expect(searchInput.first()).toHaveValue('HTA/C')
  })
})
