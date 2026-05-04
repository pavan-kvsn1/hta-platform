/**
 * Customer Review Flow E2E Tests
 *
 * Tests the customer's certificate review and signing workflow:
 * - Login to customer portal
 * - View dashboard with certificates
 * - Navigate to review page
 * - Approve certificate with signature (completes the action)
 *
 * Requires seed data with at least one PENDING_CUSTOMER_APPROVAL certificate.
 */

import { test, expect } from '@playwright/test'
import { TEST_USERS, STATUS_LABELS } from '../fixtures/test-data'

test.describe('Customer Review Flow', () => {
  test('customer login page shows correct form', async ({ page }) => {
    await page.goto('/customer/login')

    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('customer can login successfully', async ({ page }) => {
    await page.goto('/customer/login')

    await page.getByLabel('Email Address').waitFor({ state: 'visible', timeout: 15000 })
    await page.getByLabel('Email Address').fill(TEST_USERS.customer.email)
    await page.getByLabel('Password').fill(TEST_USERS.customer.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await page.waitForURL(/customer\/dashboard/, { timeout: 30000 })
  })

  test('customer rejects invalid credentials', async ({ page }) => {
    await page.goto('/customer/login')

    await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com')
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL(/customer\/login/)
  })

  test.describe('Authenticated Customer', () => {
    test.use({ storageState: 'e2e/.auth/customer.json' })

    test('can view customer dashboard', async ({ page }) => {
      await page.goto('/customer/dashboard')
      await expect(page.locator('h1, h2').first()).toBeVisible()
    })

    test('dashboard shows certificates list or table', async ({ page }) => {
      await page.goto('/customer/dashboard')

      // Seed data guarantees at least one certificate for this customer
      await expect(
        page.locator('table, [role="table"], .certificate-list').first()
          .or(page.locator('text=/certificates|documents/i').first())
      ).toBeVisible({ timeout: 10000 })
    })

    test('can navigate to certificate review page', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()

      await expect(page).toHaveURL(/customer\/review\//, { timeout: 10000 })
    })

    test('review page shows certificate details', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('header, .header, h1, h2').first()).toBeVisible()
    })

    test('review page shows approval panel with approve button', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await page.waitForLoadState('domcontentloaded')

      await expect(
        page.locator('button:has-text("Approve"), button:has-text("Sign")').first()
      ).toBeVisible({ timeout: 5000 })
    })

    test('can send feedback message', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await page.waitForLoadState('domcontentloaded')

      const messageInput = page.locator('textarea').first()
      await expect(messageInput).toBeVisible({ timeout: 5000 })
      await messageInput.fill('Test feedback message')

      await expect(
        page.locator('button:has-text("Send"), button[type="submit"]').first()
      ).toBeVisible({ timeout: 5000 })
    })

    test('approval button opens signature modal and customer can sign', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await page.waitForLoadState('domcontentloaded')

      // Click Approve/Sign
      const approveButton = page.locator('button:has-text("Approve"), button:has-text("Sign")').first()
      await expect(approveButton).toBeVisible({ timeout: 5000 })
      await approveButton.click()

      // Signature modal should open
      const signatureModal = page.locator('[role="dialog"], .modal, [class*="modal"]').first()
      await expect(signatureModal).toBeVisible({ timeout: 5000 })

      // Should have signature canvas
      const signatureCanvas = page.locator('canvas').first()
      await expect(signatureCanvas).toBeVisible({ timeout: 5000 })

      // Draw a signature (simple line across the canvas)
      const box = await signatureCanvas.boundingBox()
      if (box) {
        await page.mouse.move(box.x + 20, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 10 })
        await page.mouse.up()
      }

      // Confirm/Submit the signature
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Accept")').first()
      await expect(confirmButton).toBeVisible({ timeout: 5000 })
      await confirmButton.click()

      // Verify approval succeeded
      await expect(
        page.getByText(/approved|success|thank you/i).first()
      ).toBeVisible({ timeout: 10000 })
    })

    test('can logout from customer portal', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const logoutButton = page.getByRole('button', { name: /sign out|logout/i }).first()
        .or(page.locator('[aria-label*="user"], [aria-label*="account"]').first())

      await expect(logoutButton).toBeVisible({ timeout: 5000 })
      await logoutButton.click()

      // If user menu opened, click the logout item
      const logoutMenuItem = page.locator('text=/logout|sign out/i')
      if (await logoutMenuItem.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await logoutMenuItem.first().click()
      }

      await expect(page).toHaveURL(/login/, { timeout: 15000 })
    })
  })
})

test.describe('Customer Token-Based Review', () => {
  test('invalid token shows error page', async ({ page }) => {
    await page.goto('/customer/review/invalid-token-12345')
    await page.waitForLoadState('domcontentloaded')

    const hasErrorMessage = await page.locator('text=/invalid|expired|error|not found|404/i').first().isVisible({ timeout: 5000 })
    const redirectedToLogin = page.url().includes('/login')

    expect(hasErrorMessage || redirectedToLogin).toBe(true)
  })
})
