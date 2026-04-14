/**
 * Authentication Setup for E2E Tests
 *
 * This runs once before all tests to create authenticated sessions.
 * Each role's session is stored and reused across tests, eliminating
 * the need to login for every single test.
 *
 * Expected time savings: ~8-10s per test
 */

import { test as setup, expect } from '@playwright/test'
import { TEST_USERS } from './fixtures/test-data'

const STORAGE_STATE_DIR = 'e2e/.auth'

setup.describe.configure({ mode: 'serial' })

setup('authenticate as engineer', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"], input[name="email"]').fill(TEST_USERS.engineer.email)
  await page.locator('input[type="password"], input[name="password"]').fill(TEST_USERS.engineer.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/engineer.json` })
})

setup('authenticate as reviewer', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"], input[name="email"]').fill(TEST_USERS.reviewer.email)
  await page.locator('input[type="password"], input[name="password"]').fill(TEST_USERS.reviewer.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/dashboard|admin/, { timeout: 15000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/reviewer.json` })
})

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"], input[name="email"]').fill(TEST_USERS.admin.email)
  await page.locator('input[type="password"], input[name="password"]').fill(TEST_USERS.admin.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/admin|dashboard/, { timeout: 15000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/admin.json` })
})

setup('authenticate as customer', async ({ page }) => {
  await page.goto('/customer/login')
  await page.locator('input[type="email"], input[name="email"]').fill(TEST_USERS.customer.email)
  await page.locator('input[type="password"], input[name="password"]').fill(TEST_USERS.customer.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/customer\/dashboard/, { timeout: 15000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/customer.json` })
})
