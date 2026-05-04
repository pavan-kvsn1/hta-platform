import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    internalRequest: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    certificate: { findFirst: vi.fn() },
    certificateEvent: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import internalRequestRoutes from '../../src/routes/internal-requests/index.js'

const mockedPrisma = vi.mocked(prisma)

// ── Helpers ────────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify()

  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'user-1',
      role: (req.headers['x-user-role'] as string) || 'ENGINEER',
      isAdmin: req.headers['x-user-role'] === 'ADMIN',
    } as any
  })

  app.register(internalRequestRoutes, { prefix: '/api/internal-requests' })
  return app
}

describe('internal-requests routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── POST / — OFFLINE_CODE_REQUEST ────────────────────────────────

  describe('POST /api/internal-requests (OFFLINE_CODE_REQUEST)', () => {
    it('creates an offline code request and notifies admins', async () => {
      // No existing pending request
      mockedPrisma.internalRequest.findFirst.mockResolvedValue(null)

      const createdRequest = {
        id: 'req-1',
        type: 'OFFLINE_CODE_REQUEST',
        status: 'PENDING',
        data: JSON.stringify({ reason: 'Need codes for field work' }),
        certificateId: null,
        requestedBy: { id: 'user-1', name: 'Alice', email: 'alice@test.com' },
        createdAt: new Date('2026-05-04T12:00:00Z'),
      }
      mockedPrisma.internalRequest.create.mockResolvedValue(createdRequest as any)

      // Two admins in the tenant
      mockedPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ] as any)
      mockedPrisma.notification.createMany.mockResolvedValue({ count: 2 } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/internal-requests',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { type: 'OFFLINE_CODE_REQUEST', reason: 'Need codes for field work' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.request.type).toBe('OFFLINE_CODE_REQUEST')
      expect(body.request.status).toBe('PENDING')
      expect(body.request.data.reason).toBe('Need codes for field work')

      // Verify admin notifications were created
      expect(mockedPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'admin-1', type: 'OFFLINE_CODE_REQUESTED' }),
            expect.objectContaining({ userId: 'admin-2', type: 'OFFLINE_CODE_REQUESTED' }),
          ]),
        }),
      )
    })

    it('returns 400 when a PENDING offline code request already exists', async () => {
      mockedPrisma.internalRequest.findFirst.mockResolvedValue({
        id: 'existing-req',
        type: 'OFFLINE_CODE_REQUEST',
        status: 'PENDING',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/internal-requests',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { type: 'OFFLINE_CODE_REQUEST', reason: 'Another attempt' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already have a pending/i)
      // Should not create a new request
      expect(mockedPrisma.internalRequest.create).not.toHaveBeenCalled()
    })

    it('creates request even when no reason is provided', async () => {
      mockedPrisma.internalRequest.findFirst.mockResolvedValue(null)
      mockedPrisma.internalRequest.create.mockResolvedValue({
        id: 'req-2',
        type: 'OFFLINE_CODE_REQUEST',
        status: 'PENDING',
        data: JSON.stringify({ reason: null }),
        certificateId: null,
        requestedBy: { id: 'user-1', name: 'Alice', email: 'alice@test.com' },
        createdAt: new Date('2026-05-04T12:00:00Z'),
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/internal-requests',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { type: 'OFFLINE_CODE_REQUEST' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.internalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OFFLINE_CODE_REQUEST',
            data: JSON.stringify({ reason: null }),
          }),
        }),
      )
    })

    it('skips notification when no admins exist for the tenant', async () => {
      mockedPrisma.internalRequest.findFirst.mockResolvedValue(null)
      mockedPrisma.internalRequest.create.mockResolvedValue({
        id: 'req-3',
        type: 'OFFLINE_CODE_REQUEST',
        status: 'PENDING',
        data: JSON.stringify({ reason: null }),
        certificateId: null,
        requestedBy: { id: 'user-1', name: 'Alice', email: 'alice@test.com' },
        createdAt: new Date('2026-05-04T12:00:00Z'),
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/internal-requests',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { type: 'OFFLINE_CODE_REQUEST' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.notification.createMany).not.toHaveBeenCalled()
    })
  })

  // ── POST / — invalid type ───────────────────────────────────────

  describe('POST /api/internal-requests (invalid type)', () => {
    it('returns 400 for an unrecognised request type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/internal-requests',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { type: 'INVALID_TYPE', certificateId: 'cert-1' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/invalid request type/i)
    })
  })

  // ── GET / — list requests ───────────────────────────────────────

  describe('GET /api/internal-requests', () => {
    const mockRequests = [
      {
        id: 'req-1',
        type: 'OFFLINE_CODE_REQUEST',
        status: 'PENDING',
        data: JSON.stringify({ reason: 'field work' }),
        certificate: null,
        reviewedBy: null,
        reviewedAt: null,
        adminNote: null,
        createdAt: new Date('2026-05-04T12:00:00Z'),
      },
      {
        id: 'req-2',
        type: 'SECTION_UNLOCK',
        status: 'APPROVED',
        data: JSON.stringify({ sections: ['results'], reason: 'correction' }),
        certificate: { id: 'cert-1', certificateNumber: 'HTA-001', status: 'REVISION_REQUIRED' },
        reviewedBy: { id: 'admin-1', name: 'Admin' },
        reviewedAt: new Date('2026-05-04T14:00:00Z'),
        adminNote: 'Approved',
        createdAt: new Date('2026-05-04T10:00:00Z'),
      },
    ]

    it('lists requests with pagination metadata', async () => {
      mockedPrisma.internalRequest.findMany.mockResolvedValue(mockRequests as any)
      mockedPrisma.internalRequest.count
        .mockResolvedValueOnce(5 as any)  // total
        .mockResolvedValueOnce(2 as any)  // pending
        .mockResolvedValueOnce(2 as any)  // approved
        .mockResolvedValueOnce(1 as any)  // rejected

      const res = await app.inject({
        method: 'GET',
        url: '/api/internal-requests?page=1&limit=15',
        headers: { 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.requests).toHaveLength(2)
      expect(body.pagination.page).toBe(1)
      expect(body.pagination.total).toBe(5)
      expect(body.counts.pending).toBe(2)
      expect(body.counts.approved).toBe(2)
      expect(body.counts.rejected).toBe(1)
    })

    it('filters by status when query param is provided', async () => {
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.count
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/internal-requests?status=PENDING',
        headers: { 'x-user-id': 'user-1' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requestedById: 'user-1', status: 'PENDING' }),
        }),
      )
    })

    it('returns all statuses when status=ALL', async () => {
      mockedPrisma.internalRequest.findMany.mockResolvedValue([] as any)
      mockedPrisma.internalRequest.count
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)
        .mockResolvedValueOnce(0 as any)

      await app.inject({
        method: 'GET',
        url: '/api/internal-requests?status=ALL',
        headers: { 'x-user-id': 'user-1' },
      })

      // When status=ALL the where clause should NOT include a status filter
      expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: 'user-1' },
        }),
      )
    })
  })
})
