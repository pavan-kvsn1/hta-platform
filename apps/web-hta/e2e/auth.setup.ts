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
  // Capture console errors for debugging
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  // Track failed network requests (4xx, 5xx)
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`)
    }
  })

  // Wait for page and CSRF token to load
  const csrfPromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/csrf'),
    { timeout: 10000 }
  ).catch(() => null)

  await page.goto('/login')
  const csrfResponse = await csrfPromise

  console.log('CSRF response received:', csrfResponse ? 'yes' : 'no')
  if (failedRequests.length > 0) {
    console.log('Failed requests so far:', failedRequests)
  }

  // Wait for form to be fully hydrated with extended timeout
  try {
    await page.getByLabel('Email Address').waitFor({ state: 'visible', timeout: 15000 })
  } catch (e) {
    // Debug: print page state on failure
    console.log('=== DEBUG: Form not found ===')
    console.log('Console errors:', consoleErrors)
    console.log('Failed network requests:', failedRequests)
    console.log('Page URL:', page.url())
    console.log('Page content (first 2000 chars):', (await page.content()).slice(0, 2000))
    throw e
  }

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
