/**
 * Remaining Routes Tests
 *
 * Tests for:
 *   - routes/users/index.ts
 *   - routes/security/index.ts
 *   - routes/notifications/index.ts
 *   - routes/instruments/index.ts
 *   - routes/customers/index.ts
 *   - routes/health/index.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    masterInstrument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    customerAccount: {
      findMany: vi.fn(),
    },
    customerUser: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  Prisma: {},
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireCustomer: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireMasterAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  optionalAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

vi.mock('../../src/services/index.js', () => ({
  sendSecurityAlertEmail: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }),
  isEmailConfigured: vi.fn().mockReturnValue(false),
}))

vi.mock('@hta/shared', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import userRoutes from '../../src/routes/users/index.js'
import securityRoutes from '../../src/routes/security/index.js'
import notificationRoutes from '../../src/routes/notifications/index.js'
import instrumentRoutes from '../../src/routes/instruments/index.js'
import customersRoutes from '../../src/routes/customers/index.js'
import healthRoutes from '../../src/routes/health/index.js'

const mockedPrisma = vi.mocked(prisma)

// ── App factory helpers ────────────────────────────────────────────

function buildStaffApp() {
  const app = Fastify({ logger: false })
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'user-1',
      email: (req.headers['x-user-email'] as string) || 'staff@acme.com',
      name: 'Staff User',
      role: (req.headers['x-user-role'] as string) || 'ADMIN',
      userType: 'STAFF',
      tenantId: (req.headers['x-tenant-id'] as string) || 'tenant-1',
      isAdmin: true,
      adminType: 'MASTER',
      iat: 0,
      exp: 9999999999,
    } as any
  })
  return app
}

function buildCustomerApp() {
  const app = Fastify({ logger: false })
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'cust-1',
      email: (req.headers['x-user-email'] as string) || 'customer@acme.com',
      name: 'Customer User',
      role: 'CUSTOMER',
      userType: 'CUSTOMER',
      tenantId: (req.headers['x-tenant-id'] as string) || 'tenant-1',
      isAdmin: false,
      iat: 0,
      exp: 9999999999,
    } as any
  })
  return app
}

// ══════════════════════════════════════════════════════════════════
// HEALTH ROUTES
// ══════════════════════════════════════════════════════════════════

describe('health routes', () => {
  let app: ReturnType<typeof buildStaffApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildStaffApp()
    app.register(healthRoutes, { prefix: '/api/health' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/health', () => {
    it('returns 200 with status ok and service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/health' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.service).toBe('hta-api')
      expect(body.timestamp).toBeDefined()
    })
  })

  describe('GET /api/health/live', () => {
    it('returns 200 with status ok for liveness probe', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/health/live' })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ok')
    })
  })

  describe('GET /api/health/ready', () => {
    it('returns 200 when database check passes', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }] as any)

      const res = await app.inject({ method: 'GET', url: '/api/health/ready' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.checks.database.status).toBe('ok')
      expect(body.checks.database.latency).toBeGreaterThanOrEqual(0)
    })

    it('returns 503 when database check fails', async () => {
      mockedPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'))

      const res = await app.inject({ method: 'GET', url: '/api/health/ready' })

      expect(res.statusCode).toBe(503)
      const body = res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.database.status).toBe('error')
      expect(body.checks.database.error).toMatch(/connection refused/i)
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════

describe('user routes', () => {
  let app: ReturnType<typeof buildStaffApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildStaffApp()
    app.register(userRoutes, { prefix: '/api/users' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/users/me', () => {
    it('returns current staff user profile', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'staff@acme.com',
        name: 'Staff User',
        role: 'ADMIN',
        isAdmin: true,
        adminType: 'MASTER',
        profileImageUrl: null,
        signatureUrl: null,
        assignedAdmin: null,
        _count: { createdCertificates: 5, reviewedCertificates: 3 },
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.user.email).toBe('staff@acme.com')
      expect(body.user.role).toBe('ADMIN')
      expect(body.user._count.createdCertificates).toBe(5)
    })

    it('returns 404 when user is not found', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/not found/i)
    })
  })

  describe('GET /api/users/reviewers', () => {
    it('returns list of engineers and admins as reviewers', async () => {
      // First call for engineers, second call for admins
      mockedPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'eng-1', name: 'Engineer A', email: 'eng@acme.com', signatureUrl: 'sig.png', _count: { reviewedCertificates: 2 } },
        ] as any)
        .mockResolvedValueOnce([
          { id: 'admin-1', name: 'Admin A', email: 'admin@acme.com', adminType: 'MASTER', signatureUrl: null, _count: { reviewedCertificates: 0 } },
        ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/reviewers',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.reviewers).toHaveLength(2)
      expect(body.reviewers[0].role).toBe('ENGINEER')
      expect(body.reviewers[0].hasSignature).toBe(true)
      expect(body.reviewers[1].role).toBe('ADMIN')
    })

    it('returns empty reviewers when none found', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/reviewers',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().reviewers).toHaveLength(0)
    })

    it('filters out the current user from reviewer list', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/reviewers',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      // Verify the query excludes the current user
      const engineerCall = mockedPrisma.user.findMany.mock.calls[0][0] as any
      expect(engineerCall.where.id).toEqual({ not: 'user-1' })
    })
  })

  describe('GET /api/users/engineers', () => {
    it('returns list of active engineers for tenant', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([
        { id: 'eng-1', name: 'Engineer A', email: 'eng@acme.com', signatureUrl: 'sig.png', assignedAdmin: { id: 'admin-1', name: 'Admin A' } },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/users/engineers',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.engineers).toHaveLength(1)
      expect(body.engineers[0].name).toBe('Engineer A')
    })

    it('filters to current tenant', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/users/engineers',
        headers: { 'x-tenant-id': 'tenant-2', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.user.findMany.mock.calls[0][0] as any
      expect(call.where.tenantId).toBe('tenant-2')
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// SECURITY ROUTES
// ══════════════════════════════════════════════════════════════════

describe('security routes', () => {
  let app: ReturnType<typeof buildStaffApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildStaffApp()
    app.register(securityRoutes, { prefix: '/api/security' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/security/csp-alert', () => {
    const validPayload = {
      timestamp: new Date().toISOString(),
      severity: 'HIGH' as const,
      documentUri: 'https://app.hta.com/dashboard',
      violatedDirective: 'script-src',
      effectiveDirective: 'script-src',
      blockedUri: 'https://evil.com/xss.js',
    }

    it('notifies master admins on high severity CSP violation', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', name: 'Master Admin', email: 'admin@hta.com', tenantId: 'tenant-1' },
      ] as any)
      mockedPrisma.notification.createMany.mockResolvedValue({ count: 1 } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/security/csp-alert',
        headers: {
          'x-internal-service': 'web-hta',
          'content-type': 'application/json',
        },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.notified).toBe(1)
      expect(mockedPrisma.notification.createMany).toHaveBeenCalledOnce()
    })

    it('returns 403 when internal service header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/security/csp-alert',
        headers: { 'content-type': 'application/json' },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toMatch(/forbidden/i)
    })

    it('returns 403 when internal service header is wrong', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/security/csp-alert',
        headers: {
          'x-internal-service': 'wrong-service',
          'content-type': 'application/json',
        },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(403)
    })

    it('returns 400 for non-HIGH severity', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/security/csp-alert',
        headers: {
          'x-internal-service': 'web-hta',
          'content-type': 'application/json',
        },
        payload: { ...validPayload, severity: 'LOW' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not high severity/i)
    })

    it('returns 200 with notified=0 when no master admins exist', async () => {
      mockedPrisma.user.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'POST',
        url: '/api/security/csp-alert',
        headers: {
          'x-internal-service': 'web-hta',
          'content-type': 'application/json',
        },
        payload: validPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().notified).toBe(0)
      expect(mockedPrisma.notification.createMany).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/security/alerts', () => {
    it('returns security alerts for master admin', async () => {
      // Pre-handler checks if user is master admin
      mockedPrisma.user.findUnique.mockResolvedValue({
        role: 'ADMIN',
        adminType: 'MASTER',
      } as any)
      mockedPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          title: 'Security Alert: CSP Violation Detected',
          message: 'A violation was detected',
          data: JSON.stringify({ alertType: 'CSP_VIOLATION' }),
          read: false,
          createdAt: new Date('2026-05-01'),
        },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/security/alerts',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'admin-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.alerts).toHaveLength(1)
      expect(body.alerts[0].data.alertType).toBe('CSP_VIOLATION')
    })

    it('returns 403 when user is not master admin', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        role: 'ENGINEER',
        adminType: null,
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/security/alerts',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'eng-1' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toMatch(/master admin/i)
    })

    it('returns 401 when user is not authenticated', async () => {
      // Override the preHandler to simulate unauthenticated request
      const unauthedApp = Fastify({ logger: false })
      unauthedApp.decorateRequest('tenantId', '')
      unauthedApp.decorateRequest('user', null)
      unauthedApp.addHook('preHandler', async (req) => {
        req.tenantId = 'tenant-1'
        req.user = null // No user
      })
      unauthedApp.register(securityRoutes, { prefix: '/api/security' })
      await unauthedApp.ready()

      const res = await unauthedApp.inject({
        method: 'GET',
        url: '/api/security/alerts',
        headers: { 'x-tenant-id': 'tenant-1' },
      })

      expect(res.statusCode).toBe(401)
      await unauthedApp.close()
    })

    it('respects limit query parameter', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', adminType: 'MASTER' } as any)
      mockedPrisma.notification.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/security/alerts?limit=25',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'admin-1' },
      })

      const call = mockedPrisma.notification.findMany.mock.calls[0][0] as any
      expect(call.take).toBe(25)
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ══════════════════════════════════════════════════════════════════

describe('notification routes', () => {
  let staffApp: ReturnType<typeof buildStaffApp>
  let customerApp: ReturnType<typeof buildCustomerApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    staffApp = buildStaffApp()
    staffApp.register(notificationRoutes, { prefix: '/api/notifications' })
    await staffApp.ready()

    customerApp = buildCustomerApp()
    customerApp.register(notificationRoutes, { prefix: '/api/notifications' })
    await customerApp.ready()
  })

  afterEach(async () => {
    await staffApp.close()
    await customerApp.close()
  })

  describe('GET /api/notifications', () => {
    it('returns paginated notifications for staff user', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          type: 'CERTIFICATE_APPROVED',
          title: 'Certificate Approved',
          message: 'Your certificate has been approved',
          readAt: null,
          createdAt: new Date('2026-05-01'),
          data: null,
          certificate: null,
        },
      ] as any)
      mockedPrisma.notification.count.mockResolvedValue(1)

      const res = await staffApp.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.notifications).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.notifications[0].read).toBe(false)
    })

    it('uses userId for staff notifications', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([])
      mockedPrisma.notification.count.mockResolvedValue(0)

      await staffApp.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.notification.findMany.mock.calls[0][0] as any
      expect(call.where.userId).toBe('user-1')
      expect(call.where.customerId).toBeUndefined()
    })

    it('uses customerId for customer notifications', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([])
      mockedPrisma.notification.count.mockResolvedValue(0)

      await customerApp.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-1' },
      })

      const call = mockedPrisma.notification.findMany.mock.calls[0][0] as any
      expect(call.where.customerId).toBe('cust-1')
      expect(call.where.userId).toBeUndefined()
    })

    it('filters to unread only when unreadOnly=true', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([])
      mockedPrisma.notification.count.mockResolvedValue(0)

      await staffApp.inject({
        method: 'GET',
        url: '/api/notifications?unreadOnly=true',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.notification.findMany.mock.calls[0][0] as any
      expect(call.where.readAt).toBeNull()
    })

    it('respects limit and offset parameters', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([])
      mockedPrisma.notification.count.mockResolvedValue(20)

      const res = await staffApp.inject({
        method: 'GET',
        url: '/api/notifications?limit=5&offset=5',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      // offset(5) + limit(5) = 10, total=20, so hasMore = true
      expect(body.hasMore).toBe(true)
    })

    it('caps limit at 50', async () => {
      mockedPrisma.notification.findMany.mockResolvedValue([])
      mockedPrisma.notification.count.mockResolvedValue(0)

      await staffApp.inject({
        method: 'GET',
        url: '/api/notifications?limit=1000',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.notification.findMany.mock.calls[0][0] as any
      expect(call.take).toBe(50)
    })
  })

  describe('GET /api/notifications/unread-count', () => {
    it('returns unread count for staff user', async () => {
      mockedPrisma.notification.count.mockResolvedValue(7)

      const res = await staffApp.inject({
        method: 'GET',
        url: '/api/notifications/unread-count',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().count).toBe(7)
    })

    it('returns unread count for customer user', async () => {
      mockedPrisma.notification.count.mockResolvedValue(3)

      const res = await customerApp.inject({
        method: 'GET',
        url: '/api/notifications/unread-count',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().count).toBe(3)
      const call = mockedPrisma.notification.count.mock.calls[0][0] as any
      expect(call.where.customerId).toBe('cust-1')
    })
  })

  describe('POST /api/notifications/mark-read', () => {
    it('marks specific notifications as read', async () => {
      mockedPrisma.notification.updateMany.mockResolvedValue({ count: 2 } as any)

      const res = await staffApp.inject({
        method: 'POST',
        url: '/api/notifications/mark-read',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
        payload: { notificationIds: ['notif-1', 'notif-2'] },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      const call = mockedPrisma.notification.updateMany.mock.calls[0][0] as any
      expect(call.where.id).toEqual({ in: ['notif-1', 'notif-2'] })
    })

    it('marks all notifications as read when notificationIds is "all"', async () => {
      mockedPrisma.notification.updateMany.mockResolvedValue({ count: 10 } as any)

      const res = await staffApp.inject({
        method: 'POST',
        url: '/api/notifications/mark-read',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
        payload: { notificationIds: 'all' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      const call = mockedPrisma.notification.updateMany.mock.calls[0][0] as any
      expect(call.where.id).toBeUndefined() // no specific IDs when marking all
    })

    it('scopes mark-read to the customer user', async () => {
      mockedPrisma.notification.updateMany.mockResolvedValue({ count: 1 } as any)

      await customerApp.inject({
        method: 'POST',
        url: '/api/notifications/mark-read',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'cust-1' },
        payload: { notificationIds: 'all' },
      })

      const call = mockedPrisma.notification.updateMany.mock.calls[0][0] as any
      expect(call.where.customerId).toBe('cust-1')
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// INSTRUMENTS ROUTES
// ══════════════════════════════════════════════════════════════════

describe('instrument routes', () => {
  let app: ReturnType<typeof buildStaffApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildStaffApp()
    app.register(instrumentRoutes, { prefix: '/api/instruments' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/instruments', () => {
    const baseInstrument = {
      id: 'inst-uuid-1',
      legacyId: 101,
      category: 'Temperature',
      parameterGroup: 'Thermal',
      parameterRoles: ['REFERENCE'],
      parameterCapabilities: ['MEASURE'],
      sopReferences: ['SOP-001'],
      description: 'Thermometer Pro',
      make: 'TempMaker',
      model: 'TM200',
      assetNumber: 'A001',
      serialNumber: 'SN001',
      usage: 'Lab use',
      calibratedAtLocation: 'Lab A',
      reportNo: 'RPT-001',
      calibrationDueDate: new Date('2027-01-01'),
      rangeData: null,
      remarks: '',
      tenantId: 'tenant-1',
      isActive: true,
      isLatest: true,
    }

    it('returns all active instruments for tenant', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([baseInstrument] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/instruments',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(1)
      expect(body[0].instrument_desc).toBe('Thermometer Pro')
      expect(body[0].make).toBe('TempMaker')
    })

    it('scopes query to tenant and active/latest instruments', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/instruments',
        headers: { 'x-tenant-id': 'tenant-2', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.masterInstrument.findMany.mock.calls[0][0] as any
      expect(call.where.tenantId).toBe('tenant-2')
      expect(call.where.isActive).toBe(true)
      expect(call.where.isLatest).toBe(true)
    })

    it('filters by category when category query param is provided', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/instruments?category=Temperature',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.masterInstrument.findMany.mock.calls[0][0] as any
      expect(call.where.category).toBe('Temperature')
    })

    it('formats calibration due date as MM/DD/YYYY', async () => {
      mockedPrisma.masterInstrument.findMany.mockResolvedValue([{
        ...baseInstrument,
        calibrationDueDate: new Date('2027-03-15'),
      }] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/instruments',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()[0].next_due_on).toBe('03/15/2027')
    })
  })

  describe('GET /api/instruments/:id', () => {
    it('returns single instrument by id', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue({
        id: 'inst-uuid-1',
        legacyId: 101,
        category: 'Pressure',
        description: 'Pressure Gauge',
        make: 'PressMaker',
        model: 'PM100',
        assetNumber: 'P001',
        serialNumber: 'PSN001',
        usage: 'Field use',
        calibratedAtLocation: 'Lab B',
        reportNo: 'RPT-002',
        calibrationDueDate: null,
        rangeData: null,
        remarks: '',
      } as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/instruments/inst-uuid-1',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.instrument_desc).toBe('Pressure Gauge')
      expect(body.dbId).toBe('inst-uuid-1')
    })

    it('returns 404 when instrument not found', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/instruments/nonexistent-id',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/not found/i)
    })

    it('scopes single instrument query to tenant', async () => {
      mockedPrisma.masterInstrument.findFirst.mockResolvedValue(null)

      await app.inject({
        method: 'GET',
        url: '/api/instruments/some-id',
        headers: { 'x-tenant-id': 'tenant-3', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.masterInstrument.findFirst.mock.calls[0][0] as any
      expect(call.where.tenantId).toBe('tenant-3')
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// CUSTOMERS ROUTES
// ══════════════════════════════════════════════════════════════════

describe('customers routes', () => {
  let app: ReturnType<typeof buildStaffApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildStaffApp()
    app.register(customersRoutes, { prefix: '/api/customers' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/customers/search', () => {
    it('returns matching customers for a search query', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([
        { id: 'acct-1', companyName: 'Acme Corp', address: '123 Main St', contactEmail: 'contact@acme.com', contactPhone: '555-1234' },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/search?q=acme',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.customers).toHaveLength(1)
      expect(body.customers[0].companyName).toBe('Acme Corp')
    })

    it('returns empty array when query is too short (< 2 chars)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/search?q=a',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().customers).toHaveLength(0)
      expect(mockedPrisma.customerAccount.findMany).not.toHaveBeenCalled()
    })

    it('returns empty array when no query provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/search',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().customers).toHaveLength(0)
    })

    it('scopes search to tenant', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/customers/search?q=acme',
        headers: { 'x-tenant-id': 'tenant-5', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.customerAccount.findMany.mock.calls[0][0] as any
      expect(call.where.tenantId).toBe('tenant-5')
    })

    it('respects limit parameter (max 20)', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/customers/search?q=acme&limit=100',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.customerAccount.findMany.mock.calls[0][0] as any
      expect(call.take).toBe(20)
    })
  })

  describe('GET /api/customers/users', () => {
    it('returns users for matching customer accounts', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([
        { id: 'acct-1' },
      ] as any)
      mockedPrisma.customerUser.findMany.mockResolvedValue([
        { id: 'cust-1', name: 'POC User', email: 'poc@acme.com', isPoc: true },
        { id: 'cust-2', name: 'Regular User', email: 'user@acme.com', isPoc: false },
      ] as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/users?company=acme',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.users).toHaveLength(2)
      expect(body.users[0].name).toBe('POC User')
    })

    it('returns empty array when company query is too short', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/users?company=a',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().users).toHaveLength(0)
      expect(mockedPrisma.customerAccount.findMany).not.toHaveBeenCalled()
    })

    it('returns empty users when no customer accounts match', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/customers/users?company=nonexistent',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().users).toHaveLength(0)
      expect(mockedPrisma.customerUser.findMany).not.toHaveBeenCalled()
    })

    it('applies name search filter when q param is provided', async () => {
      mockedPrisma.customerAccount.findMany.mockResolvedValue([{ id: 'acct-1' }] as any)
      mockedPrisma.customerUser.findMany.mockResolvedValue([])

      await app.inject({
        method: 'GET',
        url: '/api/customers/users?company=acme&q=john',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      })

      const call = mockedPrisma.customerUser.findMany.mock.calls[0][0] as any
      expect(call.where.name).toBeDefined()
    })
  })
})
