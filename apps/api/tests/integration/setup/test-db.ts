/**
 * Integration Test Database Setup
 *
 * Provides utilities for setting up and tearing down a test database
 * for integration tests that require real database interactions.
 *
 * Migrated from hta-calibration/tests/integration/setup/test-db.ts
 */

import { prisma, PrismaClient } from '@hta/database'

let setupComplete = false
let setupError: Error | null = null

/**
 * Initialize the test database
 * Uses the @hta/database package's prisma client.
 * Tests should use cleanTestDatabase() between tests to ensure isolation.
 */
export async function setupTestDatabase(): Promise<typeof prisma> {
  if (setupComplete) return prisma

  try {
    // Verify connection works
    await prisma.$queryRaw`SELECT 1`
    setupComplete = true
    return prisma
  } catch (error) {
    setupError = error instanceof Error ? error : new Error(String(error))
    throw new Error(
      `Failed to initialize test database. Integration tests require PostgreSQL. Run: pnpm docker:infra\nError: ${setupError.message}`
    )
  }
}

/**
 * Get the test Prisma client
 */
export function getTestPrisma(): typeof prisma {
  if (!setupComplete) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.')
  }
  return prisma
}

/**
 * Clean up all data from the test database
 * Useful for resetting between tests
 */
export async function cleanTestDatabase(): Promise<void> {
  if (!setupComplete) return

  // Delete in reverse order of dependencies (leaves first, roots last)
  try {
    await prisma.$transaction(async (tx) => {
      // Calibration data
      await tx.calibrationResult.deleteMany()
      await tx.certificateMasterInstrument.deleteMany()
      await tx.parameter.deleteMany()

      // Certificate lifecycle
      await tx.certificateRevision.deleteMany()
      await tx.downloadToken.deleteMany()

      // Notifications
      await tx.notification.deleteMany()

      // Audit
      await tx.auditLog.deleteMany()

      // Certificate (depends on user)
      await tx.certificate.deleteMany()

      // Master instruments
      await tx.masterInstrument.deleteMany()

      // Customer tables
      await tx.customerUser.deleteMany()
      await tx.customerAccount.deleteMany()

      // Users last
      await tx.user.deleteMany()
    })
  } catch (error) {
    console.error('Error cleaning test database:', error)
    // Fallback to individual deletes
    try {
      await prisma.calibrationResult.deleteMany()
      await prisma.certificateMasterInstrument.deleteMany()
      await prisma.parameter.deleteMany()
      await prisma.certificateRevision.deleteMany()
      await prisma.downloadToken.deleteMany()
      await prisma.notification.deleteMany()
      await prisma.auditLog.deleteMany()
      await prisma.certificate.deleteMany()
      await prisma.masterInstrument.deleteMany()
      await prisma.customerUser.deleteMany()
      await prisma.customerAccount.deleteMany()
      await prisma.user.deleteMany()
    } catch {
      // Ignore - database may be in inconsistent state
    }
  }
}

/**
 * Tear down the test database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  await cleanTestDatabase()
  await prisma.$disconnect()
  setupComplete = false
}

/**
 * Run a function within a transaction that gets rolled back
 * Useful for tests that shouldn't persist changes
 */
export async function withRollback<T>(
  fn: (tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<T>
): Promise<T> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const value = await fn(tx)
      // Throw to rollback
      throw { __rollback: true, value }
    })
    return result
  } catch (e: unknown) {
    if (e && typeof e === 'object' && '__rollback' in e) {
      return (e as { value: T }).value
    }
    throw e
  }
}

export { prisma }
