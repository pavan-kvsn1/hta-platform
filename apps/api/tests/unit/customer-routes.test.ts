/**
 * Customer Routes Tests
 *
 * Tests for the /api/customer/* endpoints covering registration, activation,
 * dashboard, team, instruments, account management, and password reset flows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    customerUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    customerAccount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    customerRegistration: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    customerRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    certificate: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    approvalToken: {
      findMany: vi.fn(),
    },
    signature: {
      findMany: vi.fn(),
    },
    certificateMasterInstrument: {
      findMany: vi.fn(),
    },
    masterInstrument: {
      findFirst: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  Prisma: {},
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireCustomer: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  optionalAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

vi.mock('../../src/services/queue.js', () => ({
  queueCustomerApprovalNotificationEmail: vi.fn(),
  enqueueNotification: vi.fn(),
}))

vi.mock('../../src/lib/signing-evidence.js', () => ({
  appendSigningEvidence: vi.fn(),
  collectFastifyEvidence: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../src/lib/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  paginationResponse: vi.fn().mockReturnValue({ page: 1, limit: 20, total: 0, totalPages: 1 }),
}))

vi.mock('@hta/shared/auth', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('hashedpassword'),
}))

vi.mock('../../src/services/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import customerRoutes from '../../src/routes/customer/index.js'
import { verifyPassword } from '@hta/shared/auth'

const mockedPrisma = vi.mocked(prisma)
const mockedVerifyPassword = vi.mocked(verifyPassword)

// ── Helpers ────────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify({ logger: false })

  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    const role = (req.headers['x-user-role'] as string) || 'CUSTOMER'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'cust-user-1',
      email: (req.headers['x-user-email'] as string) || 'customer@acme.com',
      name: 'Customer User',
      role,
      userType: role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
      tenantId: (req.headers['x-tenant-id'] as string) || 'tenant-1',
      isAdmin: false,
      iat: 0,
      exp: 9999999999,
    } as any
  })

  app.register(customerRoutes, { prefix: '/api/customer' })
  return app
}

// ── Tests ──────────────────────────────────────────────────────────

describe('customer routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── GET /register/companies ──────────────────────────────────────

  describe('GET /api/customer/register/companies', () => {
    it('returns list of active companies for tenant', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([
        { id: 'acct-1', companyName: 'Acme Corp' },
        { id: 'acct-2', companyName: 'Beta Ltd' },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/register/companies',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.companies).toHaveLength(2)
      expect(body.companies[0].companyName).toBe('Acme Corp')
      expect(mockedPrisma.customerAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', isActive: true }),
        }),
      )
    })

    it('returns empty array when no companies exist', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/register/companies',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().companies).toHaveLength(0)
    })
  })

  // ── POST /register ──────────────────────────────────────────────

  describe('POST /api/customer/register', () => {
    const validPayload = {
      name: 'John Doe',
      email: 'john@acme.com',
      password: 'SecurePass1',
      customerAccountId: 'acct-1',
    }

    it('creates a registration and links to company', async () => {
      mockedPrisma.customerAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        isActive: true,
        companyName: 'Acme Corp',
      } as any)
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)
      mockedPrisma.customerRegistration.findFirst.mockResolvedValue(null)
      mockedPrisma.customerRegistration.create.mockResolvedValue({
        id: 'reg-1',
        ...validPayload,
        status: 'PENDING',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.registrationId).toBe('reg-1')
    })

    it('rejects registration with invalid email format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { ...validPayload, email: 'not-an-email' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid email/i)
    })

    it('rejects registration with password too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { ...validPayload, password: 'short' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/at least 8/i)
    })

    it('rejects when account does not exist', async () => {
      mockedPrisma.customerAccount.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid company/i)
    })

    it('rejects duplicate email', async () => {
      mockedPrisma.customerAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        isActive: true,
      } as any)
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'john@acme.com',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })

    it('rejects duplicate pending registration', async () => {
      mockedPrisma.customerAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        isActive: true,
      } as any)
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)
      mockedPrisma.customerRegistration.findFirst.mockResolvedValue({
        id: 'reg-pending',
        status: 'PENDING',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already pending/i)
    })

    it('rejects when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/register',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { name: 'John Doe' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/required/i)
    })
  })

  // ── GET /activate ────────────────────────────────────────────────

  describe('GET /api/customer/activate', () => {
    it('returns valid=true for a valid token', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@acme.com',
        isActive: false,
        activationExpiry: new Date(Date.now() + 3600000),
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp' },
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/activate?token=valid-token-123',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.valid).toBe(true)
      expect(body.user.name).toBe('John Doe')
    })

    it('returns 400 when token is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/token is required/i)
    })

    it('returns 400 for invalid token', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/activate?token=invalid-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid activation token/i)
    })

    it('returns 400 for already activated account', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        activationExpiry: new Date(Date.now() + 3600000),
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/activate?token=valid-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already been activated/i)
    })

    it('returns 400 for expired token', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: false,
        activationExpiry: new Date(Date.now() - 3600000), // expired
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/activate?token=expired-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/expired/i)
    })
  })

  // ── POST /activate ───────────────────────────────────────────────

  describe('POST /api/customer/activate', () => {
    it('activates account with valid token and strong password', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@acme.com',
        isActive: false,
        activationExpiry: new Date(Date.now() + 3600000),
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp' },
      } as any)
      mockedPrisma.customerUser.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', password: 'SecurePass1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(mockedPrisma.customerUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isActive: true, activationToken: null }),
        }),
      )
    })

    it('returns 400 when password is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', password: 'short1A' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/at least 8/i)
    })

    it('returns 400 when password lacks uppercase', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', password: 'lowercase123' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/uppercase/i)
    })

    it('returns 400 when password lacks number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', password: 'NoNumbers!!!' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/number/i)
    })

    it('returns 400 for invalid activation token', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'invalid-token', password: 'SecurePass1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid activation token/i)
    })

    it('returns 400 for expired activation token', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: false,
        activationExpiry: new Date(Date.now() - 3600000),
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/activate',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'expired-token', password: 'SecurePass1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/expired/i)
    })
  })

  // ── GET /team ────────────────────────────────────────────────────

  describe('GET /api/customer/team', () => {
    it('returns team members for the customer account', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        customerAccountId: 'acct-1',
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp' },
      } as any)
      mockedPrisma.customerAccount.findUnique.mockResolvedValue({
        id: 'acct-1',
        companyName: 'Acme Corp',
        primaryPocId: 'cust-user-1',
        primaryPoc: {
          id: 'cust-user-1',
          name: 'John',
          email: 'john@acme.com',
          isActive: true,
          activatedAt: new Date(),
          createdAt: new Date(),
        },
      } as any)
      mockedPrisma.customerRequest.findMany.mockResolvedValue([])
      mockedPrisma.customerUser.findMany.mockResolvedValue([
        { id: 'cust-user-1', name: 'John Doe', email: 'john@acme.com', isActive: true, activatedAt: new Date(), createdAt: new Date() },
        { id: 'cust-user-2', name: 'Jane Doe', email: 'jane@acme.com', isActive: true, activatedAt: new Date(), createdAt: new Date() },
      ] as any)
      mockedPrisma.customerUser.count.mockResolvedValue(2)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/team',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.account.companyName).toBe('Acme Corp')
      expect(body.currentUserId).toBe('cust-user-1')
    })

    it('returns 400 when customer has no account', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        customerAccountId: null,
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/team',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/no customer account/i)
    })
  })

  // ── GET /instruments ─────────────────────────────────────────────

  describe('GET /api/customer/instruments', () => {
    it('returns instruments for customer company from authorized certificates', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        customerAccountId: 'acct-1',
        companyName: null,
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp' },
      } as any)
      mockedPrisma.certificateMasterInstrument.findMany.mockResolvedValue([
        {
          masterInstrumentId: 'inst-1',
          category: 'Temperature',
          description: 'Thermometer',
          make: 'TempMaker',
          model: 'TM200',
          assetNo: 'A001',
          serialNumber: 'SN001',
          calibratedAt: null,
          reportNo: null,
          calibrationDueDate: null,
          sopReference: 'SOP-001',
          certificate: {
            id: 'cert-1',
            certificateNumber: 'CERT-001',
            uucDescription: 'Temperature gauge',
            dateOfCalibration: new Date('2026-01-01'),
            status: 'AUTHORIZED',
          },
        },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/instruments',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
      })

      expect(res.statusCode).toBe(200)
    })

    it('returns 400 when customer has no account', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        customerAccountId: null,
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/instruments',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/no customer account/i)
    })
  })

  // ── POST /team/request ───────────────────────────────────────────

  describe('POST /api/customer/team/request', () => {
    const baseCustomer = {
      id: 'cust-user-1',
      customerAccountId: 'acct-1',
      customerAccount: { id: 'acct-1', companyName: 'Acme', primaryPocId: 'cust-user-1' },
    }

    it('creates a USER_ADDITION request when POC submits', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(baseCustomer as any)
      mockedPrisma.customerUser.findFirst.mockResolvedValue(null) // no existing user
      mockedPrisma.customerRequest.findMany.mockResolvedValue([]) // no duplicate pending
      mockedPrisma.customerRequest.create.mockResolvedValue({ id: 'req-1', type: 'USER_ADDITION' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/team/request',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { type: 'USER_ADDITION', data: { name: 'New User', email: 'newuser@acme.com' } },
      })

      expect(res.statusCode).toBe(200)
    })

    it('returns 403 when non-POC tries to add user', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        ...baseCustomer,
        customerAccount: { ...baseCustomer.customerAccount, primaryPocId: 'other-user' },
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/team/request',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { type: 'USER_ADDITION', data: { name: 'New User', email: 'newuser@acme.com' } },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toMatch(/primary POC/i)
    })

    it('returns 400 for invalid request type', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(baseCustomer as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/team/request',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { type: 'INVALID_TYPE', data: {} },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid request type/i)
    })

    it('returns 400 when duplicate ACCOUNT_DELETION request pending', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(baseCustomer as any)
      mockedPrisma.customerRequest.findFirst.mockResolvedValue({ id: 'req-existing', status: 'PENDING' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/team/request',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { type: 'ACCOUNT_DELETION', data: {} },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already exists/i)
    })

    it('returns 400 when no customer account found', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        customerAccountId: null,
        customerAccount: null,
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/team/request',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { type: 'DATA_EXPORT', data: {} },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/no customer account/i)
    })
  })

  // ── POST /delete-account ─────────────────────────────────────────

  describe('POST /api/customer/delete-account', () => {
    it('soft-deletes and anonymizes PII on valid password', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        email: 'customer@acme.com',
        passwordHash: 'hashed-password',
        customerAccount: null,
      } as any)
      mockedVerifyPassword.mockResolvedValue(true)
      mockedPrisma.customerUser.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/delete-account',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { password: 'CorrectPassword1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(mockedPrisma.customerUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cust-user-1' },
          data: expect.objectContaining({
            name: 'Deleted User',
            isActive: false,
            passwordHash: null,
          }),
        }),
      )
    })

    it('returns 400 on incorrect password', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        email: 'customer@acme.com',
        passwordHash: 'hashed-password',
        customerAccount: null,
      } as any)
      mockedVerifyPassword.mockResolvedValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/delete-account',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { password: 'WrongPassword1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid password/i)
    })

    it('returns 400 when password is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/delete-account',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/password is required/i)
    })

    it('returns 404 when customer not found', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/delete-account',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
        payload: { password: 'SomePassword1' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // ── POST /forgot-password ────────────────────────────────────────

  describe('POST /api/customer/forgot-password', () => {
    it('always returns success message regardless of email existence', async () => {
      mockedPrisma.customerUser.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/forgot-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'nonexistent@example.com' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.message).toMatch(/if an account/i)
    })

    it('creates reset token when user exists and has password', async () => {
      mockedPrisma.customerUser.findFirst.mockResolvedValue({
        id: 'cust-1',
        name: 'John',
        email: 'john@acme.com',
        passwordHash: 'hashed',
      } as any)
      mockedPrisma.passwordResetToken.count.mockResolvedValue(0)
      mockedPrisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-1' } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/forgot-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'john@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.passwordResetToken.create).toHaveBeenCalledOnce()
    })

    it('does not create reset token when rate limit is exceeded (3+ tokens in last hour)', async () => {
      mockedPrisma.customerUser.findFirst.mockResolvedValue({
        id: 'cust-1',
        name: 'John',
        email: 'john@acme.com',
        passwordHash: 'hashed',
      } as any)
      mockedPrisma.passwordResetToken.count.mockResolvedValue(3) // at limit

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/forgot-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { email: 'john@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.passwordResetToken.create).not.toHaveBeenCalled()
    })

    it('returns success even when no email is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/forgot-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })
  })

  // ── GET /reset-password ──────────────────────────────────────────

  describe('GET /api/customer/reset-password', () => {
    it('returns valid=true for a valid unused token', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        customerId: 'cust-1',
        customer: { email: 'john@acme.com' },
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/reset-password?token=valid-reset-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.valid).toBe(true)
      expect(body.email).toBe('john@acme.com')
    })

    it('returns valid=false when token is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().valid).toBe(false)
    })

    it('returns valid=false when token is not found', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/reset-password?token=nonexistent',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().valid).toBe(false)
    })

    it('returns valid=false for expired token', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        expiresAt: new Date(Date.now() - 3600000), // expired
        usedAt: null,
        customerId: 'cust-1',
        customer: { email: 'john@acme.com' },
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/reset-password?token=expired-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().valid).toBe(false)
      expect(res.json().error).toMatch(/expired/i)
    })

    it('returns valid=false for already-used token', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(), // already used
        customerId: 'cust-1',
        customer: { email: 'john@acme.com' },
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/reset-password?token=used-token',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().valid).toBe(false)
      expect(res.json().error).toMatch(/already been used/i)
    })
  })

  // ── POST /reset-password ─────────────────────────────────────────

  describe('POST /api/customer/reset-password', () => {
    it('resets password successfully', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        customerId: 'cust-1',
        customer: { id: 'cust-1', email: 'john@acme.com' },
      } as any)
      mockedPrisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops))
      mockedPrisma.customerUser.update.mockResolvedValue({} as any)
      mockedPrisma.passwordResetToken.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', newPassword: 'NewPass1234', confirmPassword: 'NewPass1234' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('returns 400 when token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { newPassword: 'NewPass1234', confirmPassword: 'NewPass1234' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/token is required/i)
    })

    it('returns 400 when passwords do not match', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', newPassword: 'NewPass1234', confirmPassword: 'DifferentPass1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/do not match/i)
    })

    it('returns 400 when password is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'valid-token', newPassword: 'short', confirmPassword: 'short' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/at least 8/i)
    })

    it('returns 400 for invalid or expired token', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'bad-token', newPassword: 'NewPass1234', confirmPassword: 'NewPass1234' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid or expired/i)
    })

    it('returns 400 for already-used token', async () => {
      mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
        customerId: 'cust-1',
        customer: { id: 'cust-1', email: 'john@acme.com' },
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/reset-password',
        headers: { 'x-tenant-id': 'tenant-1' },
        payload: { token: 'used-token', newPassword: 'NewPass1234', confirmPassword: 'NewPass1234' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already been used/i)
    })
  })

  // ── GET /dashboard ────────────────────────────────────────────────

  describe('GET /api/customer/dashboard', () => {
    it('returns dashboard data for authenticated customer', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        email: 'customer@acme.com',
        companyName: null,
        customerAccountId: 'acct-1',
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp', primaryPocId: 'cust-user-1' },
      } as any)
      mockedPrisma.customerUser.count.mockResolvedValue(2)
      mockedPrisma.approvalToken.findMany.mockResolvedValue([])
      mockedPrisma.certificate.findMany.mockResolvedValue([])
      mockedPrisma.signature.findMany.mockResolvedValue([])
      mockedPrisma.certificateMasterInstrument.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/dashboard',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.counts).toBeDefined()
      expect(body.companyName).toBe('Acme Corp')
    })

    it('returns error when customer not found', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/dashboard',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'notfound@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().error).toMatch(/customer not found/i)
    })
  })

  // ── GET /dashboard/counts ─────────────────────────────────────────

  describe('GET /api/customer/dashboard/counts', () => {
    it('returns counts scoped to customer company', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        id: 'cust-user-1',
        email: 'customer@acme.com',
        companyName: 'Acme Corp',
        customerAccountId: 'acct-1',
        customerAccount: { id: 'acct-1', companyName: 'Acme Corp', primaryPocId: 'cust-user-1' },
      } as any)
      mockedPrisma.certificate.count.mockResolvedValue(5)
      mockedPrisma.customerUser.count.mockResolvedValue(3)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/dashboard/counts',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'customer@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.counts).toBeDefined()
      expect(body.counts.pending).toBe(5)
    })

    it('returns error object when customer context not found', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customer/dashboard/counts',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-user-1', 'x-user-role': 'CUSTOMER', 'x-user-email': 'notfound@acme.com' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().error).toMatch(/customer not found/i)
    })
  })
})
