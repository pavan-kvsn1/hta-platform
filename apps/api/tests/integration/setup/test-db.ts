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
      // Chat
      await tx.chatAttachment.deleteMany()
      await tx.chatMessage.deleteMany()
      await tx.chatThread.deleteMany()

      // Calibration data
      await tx.calibrationResult.deleteMany()
      await tx.certificateMasterInstrument.deleteMany()
      await tx.parameter.deleteMany()

      // Certificate lifecycle
      await tx.emailDeliveryEvent.deleteMany()
      await tx.emailDelivery.deleteMany()
      await tx.internalRequest.deleteMany()
      await tx.reviewFeedback.deleteMany()
      await tx.signingEvidence.deleteMany()
      await tx.openSignDocument.deleteMany()
      await tx.signature.deleteMany()
      await tx.approvalToken.deleteMany()
      await tx.tokenAccessLog.deleteMany()
      await tx.certificateEvent.deleteMany()
      await tx.certificateRevision.deleteMany()
      await tx.downloadToken.deleteMany()
      await tx.uUCImage.deleteMany()
      await tx.certificateImage.deleteMany()

      // Notifications
      await tx.notification.deleteMany()

      // Auth tokens
      await tx.passwordResetToken.deleteMany()
      await tx.refreshToken.deleteMany()

      // Audit
      await tx.auditLog.deleteMany()
      await tx.authActivityLog.deleteMany()
      await tx.certificateEditSessionLog.deleteMany()
      await tx.deviceAuditLog.deleteMany()
      await tx.jobQueue.deleteMany()
      await tx.realtimeEvent.deleteMany()

      // Certificate (depends on user)
      await tx.certificate.deleteMany()

      // Master instruments
      await tx.masterInstrumentCertificate.deleteMany()
      await tx.masterInstrumentTraining.deleteMany()
      await tx.masterInstrument.deleteMany()

      // Customer tables
      await tx.customerRequest.deleteMany()
      await tx.customerRegistration.deleteMany()
      await tx.customerAccount.updateMany({ data: { primaryPocId: null } })
      await tx.customerUser.deleteMany()
      await tx.customerAccount.deleteMany()

      // Device access
      await tx.offlineCode.deleteMany()
      await tx.offlineCodeBatch.deleteMany()
      await tx.deviceRegistration.deleteMany()
      await tx.vpnPeer.deleteMany()

      // Subscriptions (TenantUsage references TenantSubscription)
      await tx.tenantUsage.deleteMany()
      await tx.tenantSubscription.deleteMany()
      await tx.tenantInvoice.deleteMany()

      // Users
      await tx.user.deleteMany()

      // Global allow-list
      await tx.allowedGoogleEmail.deleteMany()

      // Tenants last
      await tx.tenant.deleteMany()
    }, { timeout: 30_000 })
  } catch (error) {
    console.error('Error cleaning test database:', error)
    // Fallback to individual deletes
    try {
      await prisma.chatAttachment.deleteMany()
      await prisma.chatMessage.deleteMany()
      await prisma.chatThread.deleteMany()
      await prisma.calibrationResult.deleteMany()
      await prisma.certificateMasterInstrument.deleteMany()
      await prisma.parameter.deleteMany()
      await prisma.emailDeliveryEvent.deleteMany()
      await prisma.emailDelivery.deleteMany()
      await prisma.internalRequest.deleteMany()
      await prisma.reviewFeedback.deleteMany()
      await prisma.signingEvidence.deleteMany()
      await prisma.openSignDocument.deleteMany()
      await prisma.signature.deleteMany()
      await prisma.approvalToken.deleteMany()
      await prisma.tokenAccessLog.deleteMany()
      await prisma.certificateEvent.deleteMany()
      await prisma.certificateRevision.deleteMany()
      await prisma.downloadToken.deleteMany()
      await prisma.uUCImage.deleteMany()
      await prisma.certificateImage.deleteMany()
      await prisma.notification.deleteMany()
      await prisma.passwordResetToken.deleteMany()
      await prisma.refreshToken.deleteMany()
      await prisma.auditLog.deleteMany()
      await prisma.authActivityLog.deleteMany()
      await prisma.certificateEditSessionLog.deleteMany()
      await prisma.deviceAuditLog.deleteMany()
      await prisma.jobQueue.deleteMany()
      await prisma.realtimeEvent.deleteMany()
      await prisma.certificate.deleteMany()
      await prisma.masterInstrumentCertificate.deleteMany()
      await prisma.masterInstrumentTraining.deleteMany()
      await prisma.masterInstrument.deleteMany()
      await prisma.customerRequest.deleteMany()
      await prisma.customerRegistration.deleteMany()
      await prisma.customerAccount.updateMany({ data: { primaryPocId: null } })
      await prisma.customerUser.deleteMany()
      await prisma.customerAccount.deleteMany()
      await prisma.offlineCode.deleteMany()
      await prisma.offlineCodeBatch.deleteMany()
      await prisma.deviceRegistration.deleteMany()
      await prisma.vpnPeer.deleteMany()
      await prisma.tenantUsage.deleteMany()
      await prisma.tenantSubscription.deleteMany()
      await prisma.tenantInvoice.deleteMany()
      await prisma.user.deleteMany()
      await prisma.allowedGoogleEmail.deleteMany()
      await prisma.tenant.deleteMany()
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
