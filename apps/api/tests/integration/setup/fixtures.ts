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
  }> = {}
) {
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
    data: { ...defaults, ...overrides },
  })
}

/**
 * Create an engineer with an assigned Admin/Reviewer
 */
export async function createEngineerWithAdmin(client: PrismaClient | TransactionClient = prisma) {
  const admin = await createTestUser(client, {
    name: 'Test Admin',
    role: 'ADMIN',
    isAdmin: true,
  })

  const engineer = await createTestUser(client, {
    name: 'Test Engineer',
    role: 'ENGINEER',
    assignedAdminId: admin.id,
  })

  return { engineer, admin }
}

/**
 * Create a customer account
 */
export async function createCustomerAccount(
  client: PrismaClient | TransactionClient = prisma,
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
    data: { ...defaults, ...overrides },
  })
}

/**
 * Create a customer user
 */
export async function createCustomerUser(
  client: PrismaClient | TransactionClient = prisma,
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
    },
  })
}

/**
 * Create a certificate with minimal required data
 */
export async function createTestCertificate(
  client: PrismaClient | TransactionClient = prisma,
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
      createdById,
    },
  })
}

/**
 * Create a complete test scenario with all related entities
 */
export async function createFullTestScenario(client: PrismaClient | TransactionClient = prisma) {
  // Create users
  const { engineer, admin } = await createEngineerWithAdmin(client)

  // Create customer
  const customerAccount = await createCustomerAccount(client, {
    assignedAdminId: admin.id,
  })
  const customerUser = await createCustomerUser(client, customerAccount.id)

  // Create certificate with parameters
  const certificate = await createTestCertificate(client, engineer.id, { status: 'PENDING_REVIEW' })
  const parameter = await createTestParameter(client, certificate.id)
  const results = await createCalibrationResults(client, parameter.id)

  // Create instrument
  const instrument = await createMasterInstrument(client, engineer.id)

  return {
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
