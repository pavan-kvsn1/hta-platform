/**
 * Integration Test Fixtures
 *
 * Factory functions for creating test data in the database.
 * Each factory creates realistic data with sensible defaults
 * that can be overridden as needed.
 *
 * Migrated from hta-calibration/tests/integration/setup/fixtures.ts
 */

import { prisma } from '@hta/database'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

// Type alias for prisma transaction client
type PrismaClient = typeof prisma
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Default password hash for test users (password: 'test123')
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('test123', 10)

/**
 * Create a test tenant
 */
export async function createTestTenant(
  client: PrismaClient | TransactionClient = prisma,
  overrides: Partial<{
    slug: string
    name: string
    domain: string | null
    isActive: boolean
  }> = {}
) {
  const slug = overrides.slug || `test-tenant-${randomUUID().slice(0, 8)}`
  const defaults = {
    slug,
    name: overrides.name || 'Test Tenant',
    domain: overrides.domain ?? null,
    isActive: overrides.isActive ?? true,
  }

  return client.tenant.create({
    data: defaults,
  })
}

/**
 * Create a test user
 */
export async function createTestUser(
  client: PrismaClient | TransactionClient = prisma,
  overrides: Partial<{
    email: string
    name: string
    role: string
    isAdmin: boolean
    isActive: boolean
    passwordHash: string
    assignedAdminId: string | null
    tenantId: string
  }> = {}
) {
  // Create tenant if not provided
  let tenantId = overrides.tenantId
  if (!tenantId) {
    const tenant = await createTestTenant(client)
    tenantId = tenant.id
  }

  const defaults = {
    email: `user-${randomUUID()}@test.com`,
    name: 'Test User',
    role: 'ENGINEER',
    isAdmin: false,
    isActive: true,
    passwordHash: DEFAULT_PASSWORD_HASH,
    assignedAdminId: null,
  }

  return client.user.create({
    data: { ...defaults, ...overrides, tenantId },
  })
}

/**
 * Create an engineer with an assigned Admin/Reviewer
 */
export async function createEngineerWithAdmin(
  client: PrismaClient | TransactionClient = prisma,
  tenantId?: string
) {
  // Create shared tenant if not provided
  if (!tenantId) {
    const tenant = await createTestTenant(client)
    tenantId = tenant.id
  }

  const admin = await createTestUser(client, {
    name: 'Test Admin',
    role: 'ADMIN',
    isAdmin: true,
    tenantId,
  })

  const engineer = await createTestUser(client, {
    name: 'Test Engineer',
    role: 'ENGINEER',
    assignedAdminId: admin.id,
    tenantId,
  })

  return { engineer, admin, tenantId }
}

/**
 * Create a customer account
 */
export async function createCustomerAccount(
  client: PrismaClient | TransactionClient = prisma,
  tenantId: string,
  overrides: Partial<{
    companyName: string
    address: string
    contactEmail: string
    assignedAdminId: string | null
  }> = {}
) {
  const defaults = {
    companyName: `Test Company ${randomUUID().slice(0, 8)}`,
    address: '123 Test Street, Test City',
    contactEmail: 'contact@testcompany.com',
    assignedAdminId: null,
  }

  return client.customerAccount.create({
    data: { ...defaults, ...overrides, tenantId },
  })
}

/**
 * Create a customer user
 */
export async function createCustomerUser(
  client: PrismaClient | TransactionClient = prisma,
  tenantId: string,
  customerAccountId: string,
  overrides: Partial<{
    email: string
    name: string
    passwordHash: string
  }> = {}
) {
  const defaults = {
    email: `customer-${randomUUID()}@test.com`,
    name: 'Test Customer',
    passwordHash: DEFAULT_PASSWORD_HASH,
  }

  return client.customerUser.create({
    data: {
      ...defaults,
      ...overrides,
      customerAccountId,
      tenantId,
    },
  })
}

/**
 * Create a certificate with minimal required data
 */
export async function createTestCertificate(
  client: PrismaClient | TransactionClient = prisma,
  tenantId: string,
  createdById: string,
  overrides: Partial<{
    certificateNumber: string
    status: string
    customerName: string
    customerAddress: string
    uucDescription: string
    uucMake: string
    uucModel: string
    uucSerialNumber: string
    signedPdfPath: string | null
  }> = {}
) {
  const certNumber = overrides.certificateNumber || `HTA/CAL/${Date.now()}/${randomUUID().slice(0, 4)}`

  const defaults = {
    certificateNumber: certNumber,
    status: 'DRAFT',
    customerName: 'Test Customer Pvt Ltd',
    customerAddress: '123 Test Street',
    uucDescription: 'Digital Multimeter',
    uucMake: 'Fluke',
    uucModel: '87V',
    uucSerialNumber: `SN-${randomUUID().slice(0, 8)}`,
    calibratedAt: 'LAB',
    currentRevision: 1,
  }

  return client.certificate.create({
    data: {
      ...defaults,
      ...overrides,
      tenantId,
      createdById,
      lastModifiedById: createdById,
    },
  })
}

/**
 * Create a parameter for a certificate
 */
export async function createTestParameter(
  client: PrismaClient | TransactionClient = prisma,
  certificateId: string,
  overrides: Partial<{
    parameterName: string
    parameterUnit: string
    rangeMin: string
    rangeMax: string
  }> = {}
) {
  const defaults = {
    parameterName: 'Voltage',
    parameterUnit: 'V',
    rangeMin: '0',
    rangeMax: '1000',
    sortOrder: 0,
  }

  return client.parameter.create({
    data: {
      ...defaults,
      ...overrides,
      certificateId,
    },
  })
}

/**
 * Create calibration results for a parameter
 */
export async function createCalibrationResults(
  client: PrismaClient | TransactionClient = prisma,
  parameterId: string,
  count: number = 5
) {
  const results = []

  for (let i = 1; i <= count; i++) {
    const result = await client.calibrationResult.create({
      data: {
        parameterId,
        pointNumber: i,
        standardReading: (i * 100).toString(),
        beforeAdjustment: (i * 100 + 0.5).toString(),
        errorObserved: 0.5,
        isOutOfLimit: false,
      },
    })
    results.push(result)
  }

  return results
}

/**
 * Create a notification
 */
export async function createTestNotification(
  client: PrismaClient | TransactionClient = prisma,
  userId: string,
  certificateId: string | null = null,
  overrides: Partial<{
    type: string
    title: string
    message: string
    read: boolean
  }> = {}
) {
  const defaults = {
    type: 'CERTIFICATE_APPROVED',
    title: 'Certificate Approved',
    message: 'Your certificate has been approved.',
    read: false,
  }

  return client.notification.create({
    data: {
      ...defaults,
      ...overrides,
      userId,
      certificateId,
    },
  })
}

/**
 * Create a master instrument
 */
export async function createMasterInstrument(
  client: PrismaClient | TransactionClient = prisma,
  tenantId: string,
  createdById: string,
  overrides: Partial<{
    category: string
    description: string
    make: string
    model: string
    assetNumber: string
    serialNumber: string
  }> = {}
) {
  const instrumentId = randomUUID()

  const defaults = {
    instrumentId,
    category: 'Electro-Technical',
    description: 'Digital Multimeter',
    make: 'Fluke',
    model: '87V',
    assetNumber: `AST-${randomUUID().slice(0, 6)}`,
    serialNumber: `SN-${randomUUID().slice(0, 8)}`,
    version: 1,
    isLatest: true,
  }

  return client.masterInstrument.create({
    data: {
      ...defaults,
      ...overrides,
      tenantId,
      createdById,
    },
  })
}

/**
 * Create a subscription for a tenant
 * Useful for testing limit enforcement
 */
export async function createTestSubscription(
  client: PrismaClient | TransactionClient = prisma,
  tenantId: string,
  overrides: Partial<{
    tier: 'STARTER' | 'GROWTH' | 'SCALE' | 'INTERNAL'
    status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
    extraStaffSeats: number
    extraCustomerAccounts: number
    extraCustomerUserSeats: number
  }> = {}
) {
  const now = new Date()
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const defaults = {
    tier: 'INTERNAL' as const, // Internal tier has no limits - best for tests
    status: 'ACTIVE' as const,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    basePriceInPaise: 0,
    extraStaffSeats: 0,
    extraCustomerAccounts: 0,
    extraCustomerUserSeats: 0,
  }

  return client.tenantSubscription.create({
    data: { ...defaults, ...overrides, tenantId },
  })
}

/**
 * Create a complete test scenario with all related entities
 */
export async function createFullTestScenario(client: PrismaClient | TransactionClient = prisma) {
  // Create tenant first
  const tenant = await createTestTenant(client)
  const tenantId = tenant.id

  // Create users
  const { engineer, admin } = await createEngineerWithAdmin(client, tenantId)

  // Create customer
  const customerAccount = await createCustomerAccount(client, tenantId, {
    assignedAdminId: admin.id,
  })
  const customerUser = await createCustomerUser(client, tenantId, customerAccount.id)

  // Create certificate with parameters
  const certificate = await createTestCertificate(client, tenantId, engineer.id, { status: 'PENDING_REVIEW' })
  const parameter = await createTestParameter(client, certificate.id)
  const results = await createCalibrationResults(client, parameter.id)

  // Create instrument
  const instrument = await createMasterInstrument(client, tenantId, engineer.id)

  return {
    tenant,
    tenantId,
    engineer,
    admin,
    customerAccount,
    customerUser,
    certificate,
    parameter,
    results,
    instrument,
  }
}

// Export default password for test assertions
export const TEST_PASSWORD = 'test123'
export const TEST_PASSWORD_HASH = DEFAULT_PASSWORD_HASH
