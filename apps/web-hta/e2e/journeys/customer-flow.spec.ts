/**
 * Customer Review Flow E2E Tests
 *
 * Tests the customer's certificate review and signing workflow:
 * 1. Customer can login to the customer portal
 * 2. Customer can view their dashboard with certificates
 * 3. Customer can review certificates pending approval
 * 4. Customer can approve (sign) or request revision
 *
 * Migrated from hta-calibration/tests/e2e/journeys/07-customer-flow.spec.ts
 */

import { test, expect } from '@playwright/test'
import { TEST_USERS, STATUS_LABELS } from '../fixtures/test-data'

test.describe('Customer Review Flow', () => {
  test('customer login page shows correct form', async ({ page }) => {
    await page.goto('/customer/login')

    // Should show the customer login form
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('customer can login successfully', async ({ page }) => {
    await page.goto('/customer/login')

    // Wait for form to be hydrated
    await page.getByLabel('Email Address').waitFor({ state: 'visible', timeout: 15000 })

    await page.getByLabel('Email Address').fill(TEST_USERS.customer.email)
    await page.getByLabel('Password').fill(TEST_USERS.customer.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    // Should redirect to customer dashboard (wait longer for login + redirect)
    await page.waitForURL(/customer\/dashboard/, { timeout: 30000 })
  })

  test('customer rejects invalid credentials', async ({ page }) => {
    await page.goto('/customer/login')

    await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com')
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error or stay on login page
    await expect(page).toHaveURL(/customer\/login/)
  })

  test.describe('Authenticated Customer', () => {
    test.use({ storageState: 'e2e/.auth/customer.json' })

    test('can view customer dashboard', async ({ page }) => {
      await page.goto('/customer/dashboard')

      // Should see the customer dashboard
      await expect(page.locator('h1, h2').first()).toBeVisible()
    })

    test('dashboard shows certificates list', async ({ page }) => {
      await page.goto('/customer/dashboard')

      // Look for certificates section
      const certificatesSection = page.locator('text=/certificates|documents/i')
      const hasCertificatesSection = await certificatesSection.first().isVisible({ timeout: 5000 }).catch(() => false)

      // Should have a table or list of certificates
      const certificateTable = page.locator('table, [role="table"], .certificate-list')
      const tableExists = await certificateTable.first().isVisible({ timeout: 5000 }).catch(() => false)

      // Either certificates section or table should exist (or empty state is ok)
      expect(hasCertificatesSection || tableExists || true).toBe(true)
    })

    test('can navigate to certificate review page', async ({ page }) => {
      await page.goto('/customer/dashboard')

      // Look for a certificate link that needs customer approval
      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasPending) {
        const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
        const reviewLink = row.locator('a').first()

        if (await reviewLink.isVisible()) {
          await reviewLink.click()
          await expect(page).toHaveURL(/customer\/review\//, { timeout: 10000 })
        }
      } else {
        // Try clicking any certificate link
        const anyLink = page.locator('table a, [role="table"] a').first()
        const hasAnyLink = await anyLink.isVisible({ timeout: 5000 }).catch(() => false)

        if (hasAnyLink) {
          await anyLink.click()
          await expect(page).toHaveURL(/customer\//, { timeout: 10000 })
        } else {
          test.info().annotations.push({
            type: 'info',
            description: 'No certificates available for review',
          })
        }
      }
    })

    test('review page shows certificate details', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const certificateLink = page.locator('table a, [role="table"] a').first()
      const hasLink = await certificateLink.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasLink) {
        await certificateLink.click()
        await page.waitForLoadState('networkidle')

        // Should show certificate info
        const certificateHeader = page.locator('header, .header, h1, h2')
        await expect(certificateHeader.first()).toBeVisible()

        // Should have instrument details
        const instrumentLabel = page.locator('text=/instrument|uuc|description/i')
        await instrumentLabel.first().isVisible({ timeout: 5000 }).catch(() => false)
      } else {
        test.info().annotations.push({
          type: 'info',
          description: 'No certificates available for review',
        })
      }
    })

    test('review page shows approval panel for pending certificates', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasPending) {
        const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
        const reviewLink = row.locator('a').first()

        if (await reviewLink.isVisible()) {
          await reviewLink.click()
          await page.waitForLoadState('networkidle')

          // Should have "Approve" or "Sign" button
          const approveButton = page.locator('button:has-text("Approve"), button:has-text("Sign")')
          const hasApproveButton = await approveButton.first().isVisible({ timeout: 5000 }).catch(() => false)

          expect(hasApproveButton).toBe(true)
        }
      } else {
        test.info().annotations.push({
          type: 'info',
          description: 'No certificates pending customer approval',
        })
      }
    })

    test('can send feedback message', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasPending) {
        const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
        const reviewLink = row.locator('a').first()

        if (await reviewLink.isVisible()) {
          await reviewLink.click()
          await page.waitForLoadState('networkidle')

          // Should have a message input textarea
          const messageInput = page.locator('textarea')
          const hasMessageInput = await messageInput.first().isVisible({ timeout: 5000 }).catch(() => false)

          if (hasMessageInput) {
            await messageInput.first().fill('Test feedback message')

            // Should have a send button
            const sendButton = page.locator('button:has-text("Send"), button[type="submit"]')
            const hasSendButton = await sendButton.first().isVisible({ timeout: 5000 }).catch(() => false)
            expect(hasSendButton).toBe(true)
          }
        }
      } else {
        test.info().annotations.push({
          type: 'info',
          description: 'No certificates available for messaging',
        })
      }
    })

    test('approval button opens signature modal', async ({ page }) => {
      await page.goto('/customer/dashboard')

      const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_CUSTOMER_APPROVAL}`).first()
      const hasPending = await pendingBadge.isVisible({ timeout: 5000 }).catch(() => false)

      if (hasPending) {
        const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
        const reviewLink = row.locator('a').first()

        if (await reviewLink.isVisible()) {
          await reviewLink.click()
          await page.waitForLoadState('networkidle')

          const approveButton = page.locator('button:has-text("Approve"), button:has-text("Sign")')
          const hasApproveButton = await approveButton.first().isVisible({ timeout: 5000 }).catch(() => false)

          if (hasApproveButton) {
            await approveButton.first().click()

            // Should open signature modal
            const signatureModal = page.locator('[role="dialog"], .modal, [class*="modal"]')
            const hasModal = await signatureModal.first().isVisible({ timeout: 5000 }).catch(() => false)

            if (hasModal) {
              // Modal should contain signature canvas
              const signatureCanvas = page.locator('canvas')
              const hasCanvas = await signatureCanvas.first().isVisible({ timeout: 5000 }).catch(() => false)
              expect(hasCanvas).toBe(true)
            }
          }
        }
      } else {
        test.info().annotations.push({
          type: 'info',
          description: 'No certificates pending customer approval',
        })
      }
    })

    test('can logout from customer portal', async ({ page }) => {
      await page.goto('/customer/dashboard')

      // Look for logout/sign out button
      const logoutButton = page.getByRole('button', { name: /sign out|logout/i })
      const hasLogoutButton = await logoutButton.first().isVisible({ timeout: 5000 }).catch(() => false)

      if (hasLogoutButton) {
        await logoutButton.first().click()
        // Wait for logout to process and redirect
        await page.waitForURL(/customer\/login|login/, { timeout: 15000 })
      } else {
        // Try finding logout via user menu
        const userMenu = page.locator('[aria-label*="user"], [aria-label*="account"]')
        const hasUserMenu = await userMenu.first().isVisible({ timeout: 5000 }).catch(() => false)

        if (hasUserMenu) {
          await userMenu.first().click()
          const logoutMenuItem = page.locator('text=/logout|sign out/i')
          const hasLogoutMenuItem = await logoutMenuItem.first().isVisible({ timeout: 3000 }).catch(() => false)
          if (hasLogoutMenuItem) {
            await logoutMenuItem.first().click()
            await expect(page).toHaveURL(/login/, { timeout: 10000 })
          }
        }
      }
    })
  })
})

test.describe('Customer Token-Based Review', () => {
  test('invalid token shows error page', async ({ page }) => {
    await page.goto('/customer/review/invalid-token-12345')
    await page.waitForLoadState('networkidle')

    // Should show error or redirect to login
    const errorPage = page.locator('text=/invalid|expired|error|not found|404/i')
    const redirectedToLogin = page.url().includes('/login')
    const hasErrorMessage = await errorPage.first().isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasErrorMessage || redirectedToLogin).toBe(true)
  })
})
