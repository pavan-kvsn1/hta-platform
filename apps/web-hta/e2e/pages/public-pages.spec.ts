/**
 * Public Pages E2E Tests
 *
 * Tests that public-facing pages render correctly:
 * - Support / Contact page
 * - Privacy Policy
 * - Terms of Service
 * - Staff login page
 * - Customer login page
 *
 * No authentication required.
 */

import { test, expect } from '@playwright/test'

test.describe('Support Page', () => {
  test('renders support page with contact information', async ({ page }) => {
    await page.goto('/support')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/support|contact|help/i).first()).toBeVisible()
  })

  test('has email or phone contact info', async ({ page }) => {
    await page.goto('/support')

    await expect(
      page.locator('a[href^="mailto:"], a[href^="tel:"]').first()
        .or(page.getByText(/@|phone|email/i).first())
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Privacy Policy', () => {
  test('renders privacy policy page', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/privacy/i).first()).toBeVisible()
  })

  test('has substantive content (not just a title)', async ({ page }) => {
    await page.goto('/privacy')

    // Privacy page should have paragraphs of text
    const paragraphs = page.locator('p')
    const count = await paragraphs.count()
    expect(count).toBeGreaterThan(2)
  })
})

test.describe('Terms of Service', () => {
  test('renders terms page', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/terms/i).first()).toBeVisible()
  })

  test('has substantive content', async ({ page }) => {
    await page.goto('/terms')

    const paragraphs = page.locator('p')
    const count = await paragraphs.count()
    expect(count).toBeGreaterThan(2)
  })
})

test.describe('Staff Login Page', () => {
  test('renders login form with email and password fields', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"], input[name="email"]', 'bad@example.com')
    await page.fill('input[type="password"]', 'wrongpass')
    await page.click('button[type="submit"]')

    // Should show error or stay on login page
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
    await expect(
      page.getByText(/invalid|error|incorrect|failed/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('has forgot password link', async ({ page }) => {
    await page.goto('/login')

    await expect(
      page.getByRole('link', { name: /forgot|reset/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Customer Login Page', () => {
  test('renders customer login form', async ({ page }) => {
    await page.goto('/customer/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/customer/login')

    await page.fill('input[type="email"], input[name="email"]', 'bad@example.com')
    await page.fill('input[type="password"]', 'wrongpass')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL(/customer\/login/, { timeout: 10000 })
  })
})
