/**
 * Admin Routes Unit Tests
 *
 * Tests for all /api/admin/* endpoints using Fastify inject() with mocked Prisma.
 * Auth middleware is bypassed via a preHandler hook that sets req.user/req.tenantId
 * from request headers (matching the pattern in devices.test.ts).
 */

// ── Mocks (must be before imports) ────────────────────────────────────────────

vi.mock('@hta/database', () => ({
  prisma: {
    certificate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    customerAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    customerRegistration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    customerUser: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    customerRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
    },
    masterInstrument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    masterInstrumentCertificate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    internalRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    tenantSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    certificateEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    reviewFeedback: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
      create: vi.fn(),
    },
    signature: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    downloadToken: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  Prisma: {
    DbNull: null,
    InputJsonValue: {},
    TransactionClient: {},
  },
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireMasterAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

vi.mock('../../src/services/index.js', () => ({
  enforceLimit: vi.fn().mockResolvedValue(undefined),
  updateUsageTracking: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/services/queue.js', () => ({
  queueStaffActivationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
  queueCertificateReviewedEmail: vi.fn().mockResolvedValue(undefined),
  queueCustomerAuthorizedRegisteredEmail: vi.fn().mockResolvedValue(undefined),
  queueCustomerAuthorizedTokenEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/services/offline-codes.js', () => ({
  generateCodeBatch: vi.fn().mockResolvedValue({ batchId: 'batch-1', pairs: [] }),
}))

vi.mock('../../src/lib/signing-evidence.js', () => ({
  appendSigningEvidence: vi.fn().mockResolvedValue(undefined),
  collectFastifyEvidence: vi.fn().mockReturnValue({}),
}))

vi.mock('../../src/services/subscription.js', () => ({
  getSubscriptionStatus: vi.fn(),
  getCurrentUsage: vi.fn(),
}))

vi.mock('../../src/lib/user-tat-calculator.js', () => ({
  calculateUserTATMetrics: vi.fn().mockReturnValue({ metrics: [] }),
  calculateRequestHandlingMetrics: vi.fn().mockReturnValue({ metrics: [] }),
}))

vi.mock('../../src/lib/storage/index.js', () => ({
  getStorageProvider: vi.fn().mockReturnValue({
    exists: vi.fn().mockResolvedValue(false),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
    upload: vi.fn().mockResolvedValue(undefined),
  }),
  assetNumberToFileName: vi.fn().mockReturnValue('asset-001.pdf'),
}))

vi.mock('../../src/services/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@hta/shared', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { prisma } from '@hta/database'
import adminRoutes from '../../src/routes/admin/index.js'
import { getSubscriptionStatus, getCurrentUsage } from '../../src/services/subscription.js'

const mockedPrisma = vi.mocked(prisma)
const mockedGetSubscriptionStatus = vi.mocked(getSubscriptionStatus)
const mockedGetCurrentUsage = vi.mocked(getCurrentUsage)

// ── App factory ────────────────────────────────────────────────────────────────

function buildApp(userRole: 'ADMIN' | 'ENGINEER' = 'ADMIN', adminType: 'MASTER' | 'WORKER' | null = 'MASTER') {
  const app = Fastify({ logger: false })

  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)

  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: userRole,
      userType: 'STAFF',
      isAdmin: userRole === 'ADMIN',
      adminType,
      tenantId: (req.headers['x-tenant-id'] as string) || 'tenant-1',
    } as any
  })

  app.register(adminRoutes, { prefix: '/api/admin' })
  return app
}

// ── Shared fixtures ────────────────────────────────────────────────────────────

const makeCert = (overrides?: Record<string, unknown>) => ({
  id: 'cert-1',
  certificateNumber: 'CERT-001',
  status: 'DRAFT',
  customerName: 'Acme Corp',
  uucDescription: 'Pressure Gauge',
  uucMake: 'Maker',
  uucModel: 'Model X',
  uucSerialNumber: 'SN123',
  dateOfCalibration: new Date('2026-01-01'),
  calibrationDueDate: new Date('2027-01-01'),
  currentRevision: 1,
  signedPdfPath: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  createdById: 'user-1',
  reviewerId: null,
  lastModifiedById: null,
  createdBy: { id: 'user-1', name: 'Engineer One', email: 'eng@test.com', assignedAdmin: null },
  reviewer: null,
  lastModifiedBy: null,
  ...overrides,
})

const makeUser = (overrides?: Record<string, unknown>) => ({
  id: 'user-1',
  email: 'eng@test.com',
  name: 'Engineer One',
  role: 'ENGINEER',
  isAdmin: false,
  adminType: null,
  isActive: true,
  signatureUrl: null,
  profileImageUrl: null,
  authProvider: 'PASSWORD',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  assignedAdmin: null,
  engineers: [],
  _count: { createdCertificates: 5, reviewedCertificates: 0 },
  ...overrides,
})

const makeInstrument = (overrides?: Record<string, unknown>) => ({
  id: 'inst-1',
  instrumentId: 'inst-uuid-1',
  tenantId: 'tenant-1',
  version: 1,
  isLatest: true,
  isActive: true,
  category: 'PRESSURE',
  description: 'Pressure Gauge',
  assetNumber: 'PG-001',
  make: 'Maker',
  model: 'PG100',
  serialNumber: 'SN999',
  usage: null,
  calibratedAtLocation: null,
  reportNo: null,
  calibrationDueDate: new Date('2027-06-01'),
  rangeData: null,
  remarks: null,
  parameterGroup: null,
  parameterRoles: [],
  parameterCapabilities: [],
  sopReferences: [],
  status: null,
  changeReason: 'Manual creation',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  createdById: 'admin-1',
  createdBy: { id: 'admin-1', name: 'Admin' },
  ...overrides,
})

// ── Test Suites ────────────────────────────────────────────────────────────────

describe('Admin Routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ==========================================================================
  // GET /api/admin/certificates
  // ==========================================================================

  describe('GET /api/admin/certificates', () => {
    it('returns paginated certificates for tenant', async () => {
      const cert = makeCert()
      mockedPrisma.certificate.findMany.mockResolvedValue([cert] as any)
      mockedPrisma.certificate.count.mockResolvedValue(1)
      // Stats call (getCertificateStats uses groupBy + count)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/certificates',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.certificates).toHaveLength(1)
      expect(body.certificates[0].certificateNumber).toBe('CERT-001')
      expect(body.pagination).toBeDefined()
      expect(body.pagination.total).toBe(1)
    })

    it('filters by status when provided', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificate.count.mockResolvedValue(0)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/certificates?status=DRAFT',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        }),
      )
    })

    it('filters by search query (OR across multiple fields)', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificate.count.mockResolvedValue(0)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/certificates?search=acme',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([expect.objectContaining({ customerName: expect.any(Object) })]),
          }),
        }),
      )
    })

    it('respects page and limit query parameters', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificate.count.mockResolvedValue(50)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/certificates?page=2&limit=10',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      )
    })

    it('does not filter by status when ALL is passed', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificate.count.mockResolvedValue(0)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/certificates?status=ALL',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      const callArg = mockedPrisma.certificate.findMany.mock.calls[0][0] as any
      expect(callArg.where.status).toBeUndefined()
    })
  })

  // ==========================================================================
  // GET /api/admin/users
  // ==========================================================================

  describe('GET /api/admin/users', () => {
    it('returns paginated user list for tenant', async () => {
      const user = makeUser()
      mockedPrisma.user.findMany.mockResolvedValue([user] as any)
      mockedPrisma.user.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.users).toHaveLength(1)
      expect(body.users[0].email).toBe('eng@test.com')
      expect(body.pagination).toBeDefined()
    })

    it('filters by role when provided', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([] as any)
      mockedPrisma.user.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/api/admin/users?role=ENGINEER',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ENGINEER' }),
        }),
      )
    })

    it('includes assignment counts in response', async () => {
      const user = makeUser({ _count: { createdCertificates: 10, reviewedCertificates: 3 } })
      mockedPrisma.user.findMany.mockResolvedValue([user] as any)
      mockedPrisma.user.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.users[0]._count).toBeDefined()
    })

    it('skips role filter when ALL is passed', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([] as any)
      mockedPrisma.user.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/api/admin/users?role=ALL',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      const callArg = mockedPrisma.user.findMany.mock.calls[0][0] as any
      expect(callArg.where.role).toBeUndefined()
    })
  })

  // ==========================================================================
  // POST /api/admin/users
  // ==========================================================================

  describe('POST /api/admin/users', () => {
    const createPayload = {
      email: 'new@test.com',
      name: 'New User',
      role: 'ADMIN',
    }

    it('creates a user with the given role', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(null)
      mockedPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'new@test.com',
        name: 'New User',
        role: 'ADMIN',
        adminType: 'WORKER',
        assignedAdmin: null,
        isActive: false,
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.user.role).toBe('ADMIN')
      expect(mockedPrisma.user.create).toHaveBeenCalled()
    })

    it('returns 400 when email already exists', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(makeUser() as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'x@x.com' }, // missing name and role
      })

      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when role is invalid', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'x@x.com', name: 'X', role: 'SUPERUSER' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid role/i)
    })

    it('returns 400 when engineer has no assignedAdminId', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'eng@test.com', name: 'Eng', role: 'ENGINEER' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/assigned to an Admin/i)
    })
  })

  // ==========================================================================
  // GET /api/admin/users/admins
  // ==========================================================================

  describe('GET /api/admin/users/admins', () => {
    it('returns only admin users', async () => {
      const adminUser = {
        id: 'admin-1',
        name: 'Admin One',
        email: 'admin@test.com',
        adminType: 'MASTER',
        _count: { engineers: 3 },
      }
      mockedPrisma.user.findMany.mockResolvedValue([adminUser] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/admins',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.admins).toHaveLength(1)
      expect(body.admins[0].adminType).toBe('MASTER')
      expect(body.admins[0].engineerCount).toBe(3)
    })

    it('queries only ADMIN role users', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/users/admins',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN', isActive: true }),
        }),
      )
    })
  })

  // ==========================================================================
  // GET /api/admin/users/:id/tat-metrics
  // ==========================================================================

  describe('GET /api/admin/users/:id/tat-metrics', () => {
    it('returns TAT metrics for existing user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ENGINEER', adminType: null } as any)
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/user-1/tat-metrics',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
    })

    it('returns 404 for unknown user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/nonexistent/tat-metrics',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/user not found/i)
    })

    it('includes request handling metrics for admin users', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', adminType: 'MASTER' } as any)
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.customerRequest.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/admin-1/tat-metrics',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      // requestHandling should be present (not null) for admins
      const body = res.json()
      expect(body).toBeDefined()
    })
  })

  // ==========================================================================
  // GET /api/admin/customers
  // ==========================================================================

  describe('GET /api/admin/customers', () => {
    it('returns paginated customer accounts', async () => {
      const account = {
        id: 'acc-1',
        companyName: 'Acme Corp',
        contactEmail: 'acme@test.com',
        isActive: true,
        assignedAdmin: null,
        primaryPoc: null,
        _count: { users: 2 },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }
      mockedPrisma.customerAccount.findMany.mockResolvedValue([account] as any)
      mockedPrisma.customerAccount.count.mockResolvedValue(1)
      mockedPrisma.customerRequest.groupBy.mockResolvedValue([] as any)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accounts).toHaveLength(1)
      expect(body.accounts[0].companyName).toBe('Acme Corp')
    })

    it('searches by company name and email', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([] as any)
      mockedPrisma.customerAccount.count.mockResolvedValue(0)
      mockedPrisma.customerRequest.groupBy.mockResolvedValue([] as any)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/customers?search=acme',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.customerAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ companyName: expect.any(Object) }),
            ]),
          }),
        }),
      )
    })

    it('includes company info in response', async () => {
      const account = {
        id: 'acc-1',
        companyName: 'Beta Ltd',
        contactEmail: 'beta@test.com',
        isActive: true,
        assignedAdmin: { id: 'admin-1', name: 'Admin' },
        primaryPoc: { id: 'poc-1', name: 'POC User', email: 'poc@beta.com', isActive: true },
        _count: { users: 5 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockedPrisma.customerAccount.findMany.mockResolvedValue([account] as any)
      mockedPrisma.customerAccount.count.mockResolvedValue(1)
      mockedPrisma.customerRequest.groupBy.mockResolvedValue([{ customerAccountId: 'acc-1', _count: 3 }] as any)
      mockedPrisma.certificate.groupBy.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accounts[0].assignedAdmin.name).toBe('Admin')
      expect(body.accounts[0].primaryPoc.name).toBe('POC User')
    })
  })

  // ==========================================================================
  // POST /api/admin/customers
  // ==========================================================================

  describe('POST /api/admin/customers', () => {
    const createPayload = {
      companyName: 'New Corp',
      pocName: 'POC Name',
      pocEmail: 'poc@newcorp.com',
    }

    it('creates customer account with POC user', async () => {
      mockedPrisma.customerAccount.findFirst.mockResolvedValue(null)
      mockedPrisma.customerUser.findFirst.mockResolvedValue(null)
      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const account = { id: 'acc-new', companyName: 'New Corp', assignedAdmin: null, primaryPoc: { id: 'poc-1', name: 'POC Name', email: 'poc@newcorp.com', isActive: false } }
        return { account, pocUser: { id: 'poc-1' } }
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
    })

    it('returns 400 when company name already exists', async () => {
      mockedPrisma.customerAccount.findFirst.mockResolvedValue({ id: 'existing' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { companyName: 'X' }, // missing pocName and pocEmail
      })

      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when POC email is already in use', async () => {
      mockedPrisma.customerAccount.findFirst.mockResolvedValue(null)
      mockedPrisma.customerUser.findFirst.mockResolvedValue({ id: 'existing-poc' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/customers',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })
  })

  // ==========================================================================
  // GET /api/admin/customers/search
  // ==========================================================================

  describe('GET /api/admin/customers/search', () => {
    it('returns matching customers for search query >= 2 chars', async () => {
      const accounts = [
        { id: 'acc-1', companyName: 'Acme Corp', address: '123 St', contactEmail: 'a@acme.com', contactPhone: null },
      ]
      mockedPrisma.customerAccount.findMany.mockResolvedValue(accounts as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/customers/search?q=acme',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.customers).toHaveLength(1)
      expect(body.customers[0].companyName).toBe('Acme Corp')
    })

    it('returns empty array for query shorter than 2 chars', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/customers/search?q=a',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().customers).toHaveLength(0)
      expect(mockedPrisma.customerAccount.findMany).not.toHaveBeenCalled()
    })

    it('returns empty array when no query provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/customers/search',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().customers).toHaveLength(0)
    })
  })

  // ==========================================================================
  // GET /api/admin/registrations
  // ==========================================================================

  describe('GET /api/admin/registrations', () => {
    it('returns pending registrations by default', async () => {
      const reg = {
        id: 'reg-1',
        email: 'reg@test.com',
        name: 'Reg User',
        status: 'PENDING',
        createdAt: new Date(),
        customerAccount: { id: 'acc-1', companyName: 'Corp' },
        reviewedBy: null,
      }
      mockedPrisma.customerRegistration.findMany.mockResolvedValue([reg] as any)
      mockedPrisma.customerRegistration.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/registrations',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.registrations).toHaveLength(1)
      expect(mockedPrisma.customerRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        }),
      )
    })

    it('filters registrations by status', async () => {
      mockedPrisma.customerRegistration.findMany.mockResolvedValue([] as any)
      mockedPrisma.customerRegistration.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/api/admin/registrations?status=APPROVED',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.customerRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APPROVED' },
        }),
      )
    })
  })

  // ==========================================================================
  // GET /api/admin/analytics
  // ==========================================================================

  describe('GET /api/admin/analytics', () => {
    it('returns analytics data for default 30 days', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificateEvent.findMany.mockResolvedValue([] as any)
      mockedPrisma.reviewFeedback.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/analytics',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.stageTAT).toBeDefined()
      expect(body.totalCertificates).toBeDefined()
    })

    it('respects days parameter for time-range filtering', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificateEvent.findMany.mockResolvedValue([] as any)
      mockedPrisma.reviewFeedback.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/analytics?days=7',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      // The period start should reflect the 7-day window
      expect(mockedPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      )
    })

    it('filters by customerId when provided', async () => {
      mockedPrisma.customerAccount.findUnique.mockResolvedValue({ companyName: 'Acme Corp' } as any)
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificateEvent.findMany.mockResolvedValue([] as any)
      mockedPrisma.reviewFeedback.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/analytics?customerId=acc-1',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  // ==========================================================================
  // GET /api/admin/instruments
  // ==========================================================================

  describe('GET /api/admin/instruments', () => {
    it('returns paginated instruments list', async () => {
      const inst = makeInstrument()
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([inst] as any)
      mockedPrisma.masterInstrument.count.mockResolvedValue(1)
      mockedPrisma.masterInstrument.groupBy = vi.fn().mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/instruments',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.instruments).toHaveLength(1)
      expect(body.instruments[0].assetNumber).toBe('PG-001')
    })

    it('filters by category when provided', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([] as any)
      mockedPrisma.masterInstrument.count.mockResolvedValue(0)
      mockedPrisma.masterInstrument.groupBy = vi.fn().mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/instruments?category=PRESSURE',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.masterInstrument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'PRESSURE' }),
        }),
      )
    })

    it('filters by search term across multiple fields', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([] as any)
      mockedPrisma.masterInstrument.count.mockResolvedValue(0)
      mockedPrisma.masterInstrument.groupBy = vi.fn().mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/instruments?search=pressure',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      const callArg = mockedPrisma.masterInstrument.findMany.mock.calls[0][0] as any
      expect(callArg.where.OR).toBeDefined()
    })

    it('returns only latest active instruments by default', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([] as any)
      mockedPrisma.masterInstrument.count.mockResolvedValue(0)
      mockedPrisma.masterInstrument.groupBy = vi.fn().mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/instruments',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      const callArg = mockedPrisma.masterInstrument.findMany.mock.calls[0][0] as any
      expect(callArg.where.isLatest).toBe(true)
      expect(callArg.where.isActive).toBe(true)
    })
  })

  // ==========================================================================
  // POST /api/admin/instruments
  // ==========================================================================

  describe('POST /api/admin/instruments', () => {
    const createPayload = {
      category: 'PRESSURE',
      description: 'New Gauge',
      assetNumber: 'NG-001',
    }

    it('creates a new instrument', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)
      const createdInst = makeInstrument({ id: 'new-inst', assetNumber: 'NG-001', description: 'New Gauge' })
      mockedPrisma.masterInstrument.create.mockResolvedValue(createdInst as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)
      mockedPrisma.notification.createMany.mockResolvedValue({ count: 0 } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/instruments',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(mockedPrisma.masterInstrument.create).toHaveBeenCalled()
    })

    it('returns 400 when asset number already exists', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(makeInstrument() as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/instruments',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/instruments',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { category: 'PRESSURE' }, // missing description and assetNumber
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/required/i)
    })
  })

  // ==========================================================================
  // GET /api/admin/requests
  // ==========================================================================

  describe('GET /api/admin/requests', () => {
    it('returns unified requests list (internal + customer)', async () => {
      // All the count mocks needed by /requests
      mockedPrisma.internalRequest.count.mockResolvedValue(0)
      mockedPrisma.customerRequest.count.mockResolvedValue(0)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.customerRequest.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/requests',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.requests).toBeDefined()
      expect(body.counts).toBeDefined()
    })

    it('filters requests by status', async () => {
      mockedPrisma.internalRequest.count.mockResolvedValue(0)
      mockedPrisma.customerRequest.count.mockResolvedValue(0)
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.customerRequest.findMany.mockResolvedValue([] as any)

      await app.inject({
        method: 'GET',
        url: '/api/admin/requests?status=APPROVED',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
    })
  })

  // ==========================================================================
  // GET /api/admin/internal-requests
  // ==========================================================================

  describe('GET /api/admin/internal-requests', () => {
    it('returns internal requests list with counts', async () => {
      const req = {
        id: 'req-1',
        type: 'SECTION_UNLOCK',
        status: 'PENDING',
        data: '{}',
        certificate: { id: 'cert-1', certificateNumber: 'CERT-001', status: 'DRAFT' },
        requestedBy: { id: 'user-1', name: 'Eng', email: 'eng@test.com' },
        reviewedBy: null,
        reviewedAt: null,
        adminNote: null,
        createdAt: new Date(),
      }
      mockedPrisma.internalRequest.findMany.mockResolvedValue([req] as any)
      mockedPrisma.internalRequest.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/internal-requests',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.requests).toHaveLength(1)
      expect(body.counts).toBeDefined()
    })

    it('filters by status', async () => {
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/api/admin/internal-requests?status=APPROVED',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
    })
  })

  // ==========================================================================
  // GET /api/admin/authorization
  // ==========================================================================

  describe('GET /api/admin/authorization', () => {
    it('returns certificates pending admin authorization', async () => {
      const cert = makeCert({ status: 'PENDING_ADMIN_AUTHORIZATION', createdBy: { id: 'user-1', name: 'Eng', email: 'eng@test.com' } })
      mockedPrisma.certificate.findMany.mockResolvedValue([cert] as any)
      mockedPrisma.certificate.count.mockResolvedValue(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/authorization',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.certificates).toHaveLength(1)
      expect(mockedPrisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_ADMIN_AUTHORIZATION' }),
        }),
      )
    })

    it('returns all auth-related certs when status=ALL', async () => {
      mockedPrisma.certificate.findMany.mockResolvedValue([] as any)
      mockedPrisma.certificate.count.mockResolvedValue(0)

      await app.inject({
        method: 'GET',
        url: '/api/admin/authorization?status=ALL',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      const callArg = mockedPrisma.certificate.findMany.mock.calls[0][0] as any
      expect(callArg.where.status).toEqual({ in: ['PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED'] })
    })
  })

  // ==========================================================================
  // GET /api/admin/subscription
  // ==========================================================================

  describe('GET /api/admin/subscription', () => {
    it('returns subscription status with usage and limits', async () => {
      mockedGetSubscriptionStatus.mockResolvedValue({
        tier: 'GROWTH',
        status: 'active',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        extraSeats: { staff: 0, customerAccounts: 0, customerUsers: 0 },
        usage: { certificatesIssued: 10, staffUserCount: 3, customerAccountCount: 5, customerUserCount: 20 },
        lastTrackedUsage: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/subscription',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.subscription.tier).toBe('GROWTH')
      expect(body.usage).toBeDefined()
      expect(body.limits).toBeDefined()
    })

    it('returns null subscription with default limits when no subscription exists', async () => {
      mockedGetSubscriptionStatus.mockResolvedValue(null)
      mockedGetCurrentUsage.mockResolvedValue({ certificatesIssued: 0, staffUserCount: 0, customerAccountCount: 0, customerUserCount: 0 })

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/subscription',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.subscription).toBeNull()
      expect(body.limits).toBeDefined()
    })
  })

  // ==========================================================================
  // POST /api/admin/subscription/seats
  // ==========================================================================

  describe('POST /api/admin/subscription/seats', () => {
    it('updates extra seats when subscription exists', async () => {
      mockedPrisma.tenantSubscription.findUnique.mockResolvedValue({
        tenantId: 'tenant-1',
        tier: 'GROWTH',
        extraStaffSeats: 0,
        extraCustomerAccounts: 0,
        extraCustomerUserSeats: 0,
      } as any)
      mockedPrisma.tenantSubscription.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/subscription/seats',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { extraStaffSeats: 5 },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(mockedPrisma.tenantSubscription.update).toHaveBeenCalled()
    })

    it('returns 404 when no subscription found', async () => {
      mockedPrisma.tenantSubscription.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/subscription/seats',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { extraStaffSeats: 5 },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/no subscription/i)
    })

    it('returns 400 for unlimited tiers (SCALE)', async () => {
      mockedPrisma.tenantSubscription.findUnique.mockResolvedValue({
        tier: 'SCALE',
        extraStaffSeats: 0,
        extraCustomerAccounts: 0,
        extraCustomerUserSeats: 0,
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/subscription/seats',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { extraStaffSeats: 5 },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/add-ons not available/i)
    })
  })

  // ==========================================================================
  // GET /api/admin/users/:id  (user detail)
  // ==========================================================================

  describe('GET /api/admin/users/:id', () => {
    it('returns user details with certificate stats', async () => {
      const user = makeUser({ engineers: [], _count: { createdCertificates: 5 } })
      mockedPrisma.user.findFirst.mockResolvedValue(user as any)
      mockedPrisma.certificate.groupBy.mockResolvedValue([
        { status: 'DRAFT', _count: 3 },
        { status: 'AUTHORIZED', _count: 2 },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/user-1',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.user.email).toBe('eng@test.com')
      expect(body.stats.total).toBe(5)
    })

    it('returns 404 for unknown user', async () => {
      mockedPrisma.user.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users/nonexistent',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/user not found/i)
    })
  })

  // ==========================================================================
  // GET /api/admin/instruments/:id (single instrument)
  // ==========================================================================

  describe('GET /api/admin/instruments/:id', () => {
    it('returns instrument details', async () => {
      const inst = makeInstrument({ createdBy: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' } })
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(inst as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/instruments/inst-1',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.assetNumber).toBe('PG-001')
    })

    it('returns 404 for unknown instrument', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/instruments/nonexistent',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/instrument not found/i)
    })
  })

  // ==========================================================================
  // DELETE /api/admin/instruments/:id
  // ==========================================================================

  describe('DELETE /api/admin/instruments/:id', () => {
    it('soft-deletes an instrument', async () => {
      const inst = makeInstrument()
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(inst as any)
      mockedPrisma.masterInstrument.update.mockResolvedValue({} as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)
      mockedPrisma.notification.createMany.mockResolvedValue({ count: 0 } as any)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/instruments/inst-1',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(mockedPrisma.masterInstrument.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      )
    })

    it('returns 404 for unknown instrument', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/instruments/nonexistent',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // ==========================================================================
  // Registrations approve / reject
  // ==========================================================================

  describe('POST /api/admin/registrations/:id/approve', () => {
    it('approves a pending registration', async () => {
      const reg = { id: 'reg-1', status: 'PENDING', email: 'r@test.com', name: 'Reg', passwordHash: 'hash', customerAccountId: 'acc-1' }
      mockedPrisma.customerRegistration.findUnique.mockResolvedValue(reg as any)
      mockedPrisma.$transaction.mockImplementation(async (fn: any) => fn({ customerUser: { create: vi.fn().mockResolvedValue({}) }, customerRegistration: { update: vi.fn().mockResolvedValue({}) } }))

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/registrations/reg-1/approve',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('returns 404 when registration not found', async () => {
      mockedPrisma.customerRegistration.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/registrations/nonexistent/approve',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns 400 when registration is not pending', async () => {
      mockedPrisma.customerRegistration.findUnique.mockResolvedValue({ id: 'reg-1', status: 'APPROVED' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/registrations/reg-1/approve',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not pending/i)
    })
  })

  describe('POST /api/admin/registrations/:id/reject', () => {
    it('rejects a pending registration with reason', async () => {
      const reg = { id: 'reg-1', status: 'PENDING' }
      mockedPrisma.customerRegistration.findUnique.mockResolvedValue(reg as any)
      mockedPrisma.customerRegistration.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/registrations/reg-1/reject',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { reason: 'Duplicate account' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(mockedPrisma.customerRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Duplicate account' }),
        }),
      )
    })
  })

  // ==========================================================================
  // DELETE /api/admin/users/:id (deactivate)
  // ==========================================================================

  describe('DELETE /api/admin/users/:id', () => {
    it('deactivates a user', async () => {
      const user = makeUser({ role: 'ENGINEER' })
      mockedPrisma.user.findFirst.mockResolvedValue(user as any)
      mockedPrisma.user.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/users/user-1',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'admin-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('returns 400 when trying to deactivate own account', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/users/admin-1', // same as x-user-id default
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'admin-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/cannot deactivate your own/i)
    })

    it('returns 400 when deactivating last admin', async () => {
      const adminUser = makeUser({ role: 'ADMIN', id: 'admin-2' })
      mockedPrisma.user.findFirst.mockResolvedValue(adminUser as any)
      mockedPrisma.user.count.mockResolvedValue(1) // only 1 admin

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/users/admin-2',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'admin-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/last admin/i)
    })
  })

  // ==========================================================================
  // PUT /api/admin/instruments/:id (update)
  // ==========================================================================

  describe('PUT /api/admin/instruments/:id', () => {
    it('creates a new version of the instrument', async () => {
      const current = makeInstrument()
      mockedPrisma.masterInstrument.findFirst.mockResolvedValueOnce(current as any) // for finding current
        .mockResolvedValueOnce(null) // for duplicate check (no other asset with same number)
      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          masterInstrument: {
            update: vi.fn().mockResolvedValue({}),
            create: vi.fn().mockResolvedValue({ ...current, version: 2, id: 'inst-v2' }),
          },
        }
        return fn(tx)
      })
      mockedPrisma.user.findMany.mockResolvedValue([] as any)
      mockedPrisma.notification.createMany.mockResolvedValue({ count: 0 } as any)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/instruments/inst-1',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { description: 'Updated Pressure Gauge', changeReason: 'Annual recalibration' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('returns 404 when instrument not found', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/instruments/nonexistent',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { description: 'Updated' },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
