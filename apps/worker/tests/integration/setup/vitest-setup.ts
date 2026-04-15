/**
 * Vitest Setup for Worker Integration Tests
 */

import { beforeAll, afterAll } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from './postgres-setup'

beforeAll(async () => {
  await setupTestDatabase()
})

afterAll(async () => {
  await cleanupTestDatabase()
})
