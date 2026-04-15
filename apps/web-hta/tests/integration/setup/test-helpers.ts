/**
 * Integration Test Helpers
 *
 * Provides utilities for creating test data in the PostgreSQL database.
 * Uses Prisma directly to set up test fixtures.
 */

import { prisma } from './postgres-setup'
import { hash } from 'bcryptjs'

// Test tenant constants
const TEST_TENANT_SLUG = 'test-tenant'
const TEST_TENANT_NAME = 'Test Tenant'

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
 * Create a test user (staff)
 */
export async function createTestUser(overrides: {
  email?: string
  name?: string
  role?: string
  isAdmin?: boolean
  adminType?: string
  password?: string
  isActive?: boolean
} = {}): Promise<{
  id: string
  email: string
  name: string
  role: string
  tenantId: string
}> {
  const tenant = await getTestTenant()
  const passwordHash = await hash(overrides.password || 'Test123!@#', 10)

  const user = await prisma.user.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      email: overrides.email || `test-${Date.now()}@example.com`,
      name: overrides.name || 'Test User',
      role: overrides.role || 'ENGINEER',
      isAdmin: overrides.isAdmin || false,
      adminType: overrides.adminType,
      passwordHash,
      isActive: overrides.isActive ?? true,
      authProvider: 'PASSWORD',
    },
  })

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
  }
}

/**
 * Create an admin user
 */
export async function createTestAdmin(overrides: {
  email?: string
  name?: string
  adminType?: string
} = {}): Promise<{
  id: string
  email: string
  name: string
  role: string
  tenantId: string
}> {
  return createTestUser({
    ...overrides,
    role: 'ADMIN',
    isAdmin: true,
    adminType: overrides.adminType || 'HOD',
  })
}

/**
 * Create a test customer user
 */
export async function createTestCustomerUser(overrides: {
  email?: string
  name?: string
  companyName?: string
  password?: string
  isActive?: boolean
  customerAccountId?: string
} = {}): Promise<{
  id: string
  email: string
  name: string
  tenantId: string
  customerAccountId: string | null
}> {
  const tenant = await getTestTenant()
  const passwordHash = await hash(overrides.password || 'Test123!@#', 10)

  const customerUser = await prisma.customerUser.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      email: overrides.email || `customer-${Date.now()}@example.com`,
      name: overrides.name || 'Test Customer',
      companyName: overrides.companyName || 'Test Company',
      passwordHash,
      isActive: overrides.isActive ?? true,
      ...(overrides.customerAccountId && {
        customerAccount: { connect: { id: overrides.customerAccountId } },
      }),
    },
  })

  return {
    id: customerUser.id,
    email: customerUser.email,
    name: customerUser.name,
    tenantId: customerUser.tenantId,
    customerAccountId: customerUser.customerAccountId,
  }
}

/**
 * Create a test customer account
 */
export async function createTestCustomerAccount(overrides: {
  companyName?: string
  address?: string
  contactEmail?: string
  assignedAdminId?: string
} = {}): Promise<{
  id: string
  companyName: string
  tenantId: string
}> {
  const tenant = await getTestTenant()

  const account = await prisma.customerAccount.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      companyName: overrides.companyName || `Test Company ${Date.now()}`,
      address: overrides.address || '123 Test St',
      contactEmail: overrides.contactEmail || 'contact@test.com',
      ...(overrides.assignedAdminId && {
        assignedAdmin: { connect: { id: overrides.assignedAdminId } },
      }),
    },
  })

  return {
    id: account.id,
    companyName: account.companyName,
    tenantId: account.tenantId,
  }
}

/**
 * Create a test certificate
 */
export async function createTestCertificate(overrides: {
  certificateNumber?: string
  status?: string
  customerName?: string
  createdById?: string
  assignedTo?: string
} = {}): Promise<{
  id: string
  certificateNumber: string
  status: string
  tenantId: string
  createdById: string
}> {
  const tenant = await getTestTenant()

  // Create a user if not provided
  let createdById = overrides.createdById
  if (!createdById) {
    const user = await createTestUser()
    createdById = user.id
  }

  const certificate = await prisma.certificate.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      certificateNumber: overrides.certificateNumber || `CERT-${Date.now()}`,
      status: overrides.status || 'DRAFT',
      customerName: overrides.customerName || 'Test Customer',
      createdBy: { connect: { id: createdById } },
      lastModifiedBy: { connect: { id: createdById } },
    },
  })

  return {
    id: certificate.id,
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    tenantId: certificate.tenantId,
    createdById: certificate.createdById,
  }
}

/**
 * Create a test master instrument
 */
export async function createTestMasterInstrument(overrides: {
  description?: string
  category?: string
  make?: string
  model?: string
  serialNumber?: string
  modifiedById?: string
} = {}): Promise<{
  id: number
  description: string
  category: string
  tenantId: string
}> {
  const tenant = await getTestTenant()

  // Create a user if not provided
  let modifiedById = overrides.modifiedById
  if (!modifiedById) {
    const user = await createTestUser()
    modifiedById = user.id
  }

  const instrument = await prisma.masterInstrument.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      instrumentId: `INST-${Date.now()}`,
      description: overrides.description || 'Test Instrument',
      category: overrides.category || 'CALIBRATOR',
      make: overrides.make || 'Test Make',
      model: overrides.model || 'Test Model',
      serialNumber: overrides.serialNumber || `SN-${Date.now()}`,
      assetNumber: `ASSET-${Date.now()}`,
      calibratedAtLocation: 'Test Lab',
      reportNo: `RPT-${Date.now()}`,
      calibrationDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  })

  return {
    id: instrument.id,
    description: instrument.description,
    category: instrument.category,
    tenantId: instrument.tenantId,
  }
}

/**
 * Create a test notification
 */
export async function createTestNotification(overrides: {
  userId?: string
  type?: string
  title?: string
  message?: string
} = {}): Promise<{
  id: string
  userId: string | null
  type: string
  read: boolean
}> {
  // Create a user if not provided
  let userId = overrides.userId
  if (!userId) {
    const user = await createTestUser()
    userId = user.id
  }

  const notification = await prisma.notification.create({
    data: {
      user: { connect: { id: userId } },
      type: overrides.type || 'INFO',
      title: overrides.title || 'Test Notification',
      message: overrides.message || 'This is a test notification',
      read: false,
    },
  })

  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    read: notification.read,
  }
}

/**
 * Create a test job queue entry
 */
export async function createTestQueueJob(overrides: {
  type?: string
  payload?: object
  status?: string
  priority?: number
  scheduledFor?: Date
} = {}): Promise<{
  id: string
  type: string
  status: string
}> {
  const job = await prisma.jobQueue.create({
    data: {
      type: overrides.type || 'test:job',
      payload: overrides.payload || { test: true },
      status: overrides.status || 'pending',
      priority: overrides.priority || 0,
      scheduledFor: overrides.scheduledFor || new Date(),
      attempts: 0,
      maxRetries: 3,
    },
  })

  return {
    id: job.id,
    type: job.type,
    status: job.status,
  }
}

/**
 * Create multiple test certificates
 */
export async function createTestCertificates(
  count: number,
  overrides: Parameters<typeof createTestCertificate>[0] = {}
): Promise<Array<Awaited<ReturnType<typeof createTestCertificate>>>> {
  const certificates = []
  for (let i = 0; i < count; i++) {
    const cert = await createTestCertificate({
      ...overrides,
      certificateNumber: `CERT-${Date.now()}-${i}`,
    })
    certificates.push(cert)
  }
  return certificates
}

/**
 * Create a signing evidence record
 */
export async function createTestSigningEvidence(overrides: {
  certificateId: string
  signatureId?: string
  eventType: string
  revision?: number
  evidence?: object
} ): Promise<{
  id: string
  certificateId: string
  eventType: string
}> {
  const evidence = await prisma.signingEvidence.create({
    data: {
      certificateId: overrides.certificateId,
      signatureId: overrides.signatureId,
      eventType: overrides.eventType,
      revision: overrides.revision || 1,
      sequenceNumber: 1,
      evidence: JSON.stringify(overrides.evidence || {
        timestamp: new Date().toISOString(),
        ipAddress: '127.0.0.1',
      }),
    },
  })

  return {
    id: evidence.id,
    certificateId: evidence.certificateId,
    eventType: evidence.eventType,
  }
}

/**
 * Clean all test data
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in dependency order
  await prisma.$transaction([
    prisma.signingEvidence.deleteMany(),
    prisma.signature.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.approvalToken.deleteMany(),
    prisma.downloadToken.deleteMany(),
    prisma.calibrationResult.deleteMany(),
    prisma.certificateMasterInstrument.deleteMany(),
    prisma.parameter.deleteMany(),
    prisma.certificateRevision.deleteMany(),
    prisma.reviewFeedback.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.masterInstrument.deleteMany(),
    prisma.customerRequest.deleteMany(),
    prisma.customerRegistration.deleteMany(),
    prisma.customerUser.deleteMany(),
    prisma.customerAccount.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.jobQueue.deleteMany(),
  ])
}

// Re-export prisma for direct use in tests
export { prisma }
