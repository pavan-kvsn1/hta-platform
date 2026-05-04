/**
 * Vitest Setup for API Integration Tests
 *
 * Ensures the database connection is verified before any test file runs
 * and properly torn down after all tests complete — even if individual
 * test files omit their own afterAll hooks.
 */

import { beforeAll, afterAll } from 'vitest'
import { setupTestDatabase, teardownTestDatabase } from './test-db'

beforeAll(async () => {
  await setupTestDatabase()
})

afterAll(async () => {
  await teardownTestDatabase()
})
