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
  // Wait for page and CSRF token to load
  const csrfPromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/csrf'),
    { timeout: 10000 }
  ).catch(() => null)

  await page.goto('/login')
  await csrfPromise

  // Wait for form to be fully hydrated
  await page.getByLabel('Email Address').waitFor({ state: 'visible' })

  await page.getByLabel('Email Address').fill(TEST_USERS.engineer.email)
  await page.getByLabel('Password').fill(TEST_USERS.engineer.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL(/dashboard/, { timeout: 30000 })
  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/engineer.json` })
})

setup('authenticate as reviewer', async ({ page }) => {
  await page.goto('/login')

  // Wait for form to be fully hydrated
  await page.getByLabel('Email Address').waitFor({ state: 'visible' })

  await page.getByLabel('Email Address').fill(TEST_USERS.reviewer.email)
  await page.getByLabel('Password').fill(TEST_USERS.reviewer.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for redirect - use waitForURL for more reliable redirect handling
  await page.waitForURL(/dashboard|admin/, { timeout: 20000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/reviewer.json` })
})

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login')

  // Wait for form to be fully hydrated
  await page.getByLabel('Email Address').waitFor({ state: 'visible' })

  await page.getByLabel('Email Address').fill(TEST_USERS.admin.email)
  await page.getByLabel('Password').fill(TEST_USERS.admin.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for redirect - use waitForURL for more reliable redirect handling
  await page.waitForURL(/admin|dashboard/, { timeout: 20000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/admin.json` })
})

setup('authenticate as customer', async ({ page }) => {
  await page.goto('/customer/login')

  // Wait for form to be fully hydrated
  await page.getByLabel('Email Address').waitFor({ state: 'visible' })

  await page.getByLabel('Email Address').fill(TEST_USERS.customer.email)
  await page.getByLabel('Password').fill(TEST_USERS.customer.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Wait for redirect - use waitForURL for more reliable redirect handling
  await page.waitForURL(/customer\/dashboard/, { timeout: 20000 })

  await page.context().storageState({ path: `${STORAGE_STATE_DIR}/customer.json` })
})
