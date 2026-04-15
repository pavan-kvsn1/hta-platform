/**
 * Test Helpers for Worker Integration Tests
 */

import { prisma } from './postgres-setup'
import { hash } from 'bcryptjs'

// Test tenant constants
const TEST_TENANT_SLUG = 'worker-test-tenant'
const TEST_TENANT_NAME = 'Worker Test Tenant'

let testTenantId: string | null = null

/**
 * Get or create the test tenant
 */
export async function getTestTenant(): Promise<{ id: string; slug: string; name: string }> {
  if (testTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: testTenantId },
    })
    if (tenant) {
      return tenant
    }
  }

  let tenant = await prisma.tenant.findUnique({
    where: { slug: TEST_TENANT_SLUG },
  })

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: TEST_TENANT_SLUG,
        name: TEST_TENANT_NAME,
        isActive: true,
      },
    })
  }

  testTenantId = tenant.id
  return tenant
}

/**
 * Create a test user
 */
export async function createTestUser(overrides: {
  email?: string
  name?: string
  password?: string
} = {}): Promise<{
  id: string
  email: string
  name: string
  tenantId: string
}> {
  const tenant = await getTestTenant()
  const passwordHash = await hash(overrides.password || 'Test123!@#', 10)

  const user = await prisma.user.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      email: overrides.email || `test-${Date.now()}@example.com`,
      name: overrides.name || 'Test User',
      role: 'ENGINEER',
      passwordHash,
      isActive: true,
      authProvider: 'PASSWORD',
    },
  })

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
  }
}

/**
 * Create a test customer user
 */
export async function createTestCustomerUser(overrides: {
  email?: string
  name?: string
} = {}): Promise<{
  id: string
  email: string
  name: string
  tenantId: string
}> {
  const tenant = await getTestTenant()

  const customerUser = await prisma.customerUser.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      email: overrides.email || `customer-${Date.now()}@example.com`,
      name: overrides.name || 'Test Customer',
      isActive: true,
    },
  })

  return {
    id: customerUser.id,
    email: customerUser.email,
    name: customerUser.name,
    tenantId: customerUser.tenantId,
  }
}

/**
 * Create a password reset token
 */
export async function createPasswordResetToken(overrides: {
  userId: string
  expiresAt?: Date
}): Promise<{
  id: string
  token: string
  expiresAt: Date
}> {
  const token = await prisma.passwordResetToken.create({
    data: {
      userId: overrides.userId,
      token: `reset-${Date.now()}-${Math.random().toString(36)}`,
      expiresAt: overrides.expiresAt || new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  return {
    id: token.id,
    token: token.token,
    expiresAt: token.expiresAt,
  }
}

/**
 * Create a notification for a staff user
 */
export async function createUserNotification(overrides: {
  userId: string
  type?: string
  title?: string
  message?: string
  read?: boolean
  createdAt?: Date
}): Promise<{
  id: string
  userId: string | null
  read: boolean
  createdAt: Date
}> {
  let notification = await prisma.notification.create({
    data: {
      user: { connect: { id: overrides.userId } },
      type: overrides.type || 'INFO',
      title: overrides.title || 'Test Notification',
      message: overrides.message || 'This is a test notification',
      read: overrides.read ?? false,
    },
  })

  // Backdate createdAt if specified (Prisma @default(now()) overrides on create)
  if (overrides.createdAt) {
    notification = await prisma.notification.update({
      where: { id: notification.id },
      data: { createdAt: overrides.createdAt },
    })
  }

  return {
    id: notification.id,
    userId: notification.userId,
    read: notification.read,
    createdAt: notification.createdAt,
  }
}

/**
 * Create a notification for a customer user
 */
export async function createCustomerNotification(overrides: {
  customerId: string
  type?: string
  title?: string
  message?: string
  read?: boolean
  createdAt?: Date
}): Promise<{
  id: string
  customerId: string | null
  read: boolean
  createdAt: Date
}> {
  let notification = await prisma.notification.create({
    data: {
      customer: { connect: { id: overrides.customerId } },
      type: overrides.type || 'INFO',
      title: overrides.title || 'Test Notification',
      message: overrides.message || 'This is a test notification',
      read: overrides.read ?? false,
    },
  })

  // Backdate createdAt if specified (Prisma @default(now()) overrides on create)
  if (overrides.createdAt) {
    notification = await prisma.notification.update({
      where: { id: notification.id },
      data: { createdAt: overrides.createdAt },
    })
  }

  return {
    id: notification.id,
    customerId: notification.customerId,
    read: notification.read,
    createdAt: notification.createdAt,
  }
}

/**
 * Clean all test data
 * Deletion order matters due to foreign key constraints.
 * Delete child tables before parent tables.
 * Uses interactive transaction to guarantee sequential execution.
 */
export async function cleanupTestData(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Calibration data (must delete before Certificate/Parameter)
    await tx.calibrationResult.deleteMany()
    await tx.certificateMasterInstrument.deleteMany()
    await tx.parameter.deleteMany()
    // Certificate lifecycle
    await tx.certificateRevision.deleteMany()
    await tx.downloadToken.deleteMany()
    // Notification references Certificate, User, CustomerUser
    await tx.notification.deleteMany()
    // Audit logs
    await tx.auditLog.deleteMany()
    // Certificate references User (createdById, lastModifiedById)
    await tx.certificate.deleteMany()
    // Auth tokens
    await tx.passwordResetToken.deleteMany()
    // Instruments reference User
    await tx.masterInstrument.deleteMany()
    // Customer tables
    await tx.customerUser.deleteMany()
    await tx.customerAccount.deleteMany()
    // User references Tenant
    await tx.user.deleteMany()
  })
}

// Re-export prisma
export { prisma }
