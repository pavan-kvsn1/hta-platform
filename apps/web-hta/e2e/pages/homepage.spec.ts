/**
 * Homepage E2E Tests
 *
 * Tests the public homepage renders correctly on desktop and mobile viewports.
 * No authentication required.
 */

import { test, expect } from '@playwright/test'

test.describe('Homepage — Desktop', () => {
  test('renders hero section with branding', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Should show company branding / heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })

    // Should have a CTA or login link
    await expect(
      page.getByRole('link', { name: /login|sign in|get started/i }).first()
        .or(page.getByRole('button', { name: /login|sign in|get started/i }).first())
    ).toBeVisible({ timeout: 5000 })
  })

  test('navbar has links to public pages', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Navigation should have key links
    const nav = page.locator('nav, header')
    await expect(nav.first()).toBeVisible()

    await expect(
      page.getByRole('link', { name: /support|contact/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('footer is visible with legal links', async ({ page }) => {
    await page.goto('/')

    const footer = page.locator('footer')
    await expect(footer).toBeVisible()

    await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible()
    await expect(footer.getByRole('link', { name: /terms/i })).toBeVisible()
  })

  test('features section is visible', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByText(/features|calibration|certificate/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Homepage — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })
  })

  test('mobile navbar has hamburger menu', async ({ page }) => {
    await page.goto('/')

    // Mobile should have a menu toggle button
    const menuToggle = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], [class*="hamburger"], [class*="mobile-menu"]')
    await expect(menuToggle.first()).toBeVisible({ timeout: 5000 })
  })
})
