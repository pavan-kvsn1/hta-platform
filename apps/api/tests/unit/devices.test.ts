import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    deviceRegistration: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    deviceAuditLog: { createMany: vi.fn() },
    offlineCodeBatch: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    offlineCode: { update: vi.fn() },
  },
  Prisma: {},
}))

vi.mock('../../src/services/offline-codes.js', () => ({
  getBatchStatus: vi.fn(),
  generateCodeBatch: vi.fn(),
}))

vi.mock('../../src/services/refresh-token.js', () => ({
  createRefreshToken: vi.fn(),
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import { getBatchStatus, generateCodeBatch } from '../../src/services/offline-codes.js'
import { createRefreshToken } from '../../src/services/refresh-token.js'
import deviceRoutes from '../../src/routes/devices/index.js'

const mockedPrisma = vi.mocked(prisma)
const mockedGetBatchStatus = vi.mocked(getBatchStatus)
const mockedGenerateCodeBatch = vi.mocked(generateCodeBatch)
const mockedCreateRefreshToken = vi.mocked(createRefreshToken)

// ── Helpers ────────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify()

  // Decorate request with tenant / user before routes register
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'user-1',
      role: (req.headers['x-user-role'] as string) || 'ADMIN',
      isAdmin: req.headers['x-user-role'] === 'ADMIN' || !req.headers['x-user-role'],
    } as any
  })

  app.register(deviceRoutes, { prefix: '/api/devices' })
  return app
}

describe('device management routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── POST /register ───────────────────────────────────────────────

  describe('POST /api/devices/register', () => {
    const registerPayload = {
      deviceId: 'device-abc',
      deviceName: 'Work Laptop',
      platform: 'win32',
      appVersion: '1.0.0',
    }

    it('registers a brand-new device and returns codes + refresh token', async () => {
      mockedPrisma.deviceRegistration.findUnique.mockResolvedValue(null)
      mockedPrisma.deviceRegistration.create.mockResolvedValue({} as any)
      mockedGetBatchStatus.mockResolvedValue({
        hasBatch: true,
        batchId: 'batch-1',
        pairs: [{ challenge: 'A1', response: 'R1' }],
        expiresAt: new Date('2026-06-01'),
        total: 50,
        remaining: 50,
        isExpired: false,
      } as any)
      mockedCreateRefreshToken.mockResolvedValue({
        refreshToken: 'rt_token',
        expiresAt: new Date('2026-06-04'),
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/register',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: registerPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.device.deviceId).toBe('device-abc')
      expect(body.device.status).toBe('ACTIVE')
      expect(body.codes).toBeDefined()
      expect(body.refreshToken).toBe('rt_token')

      expect(mockedPrisma.deviceRegistration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            userId: 'user-1',
            deviceId: 'device-abc',
            platform: 'win32',
          }),
        }),
      )
    })

    it('re-registers a device owned by the same user (reactivates)', async () => {
      mockedPrisma.deviceRegistration.findUnique.mockResolvedValue({
        deviceId: 'device-abc',
        userId: 'user-1',
        tenantId: 'tenant-1',
        status: 'WIPED',
      } as any)
      mockedPrisma.deviceRegistration.update.mockResolvedValue({} as any)
      mockedGetBatchStatus.mockResolvedValue({ hasBatch: true, batchId: 'b1', pairs: [], expiresAt: new Date(), total: 50, remaining: 50, isExpired: false } as any)
      mockedCreateRefreshToken.mockResolvedValue({ refreshToken: 'rt', expiresAt: new Date() } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/register',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: registerPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(mockedPrisma.deviceRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId: 'device-abc' },
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      )
      // create should NOT be called for re-registration
      expect(mockedPrisma.deviceRegistration.create).not.toHaveBeenCalled()
    })

    it('returns 409 when device is registered to a different user', async () => {
      mockedPrisma.deviceRegistration.findUnique.mockResolvedValue({
        deviceId: 'device-abc',
        userId: 'other-user',
        tenantId: 'tenant-1',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/register',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: registerPayload,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error).toMatch(/another user/i)
    })

    it('auto-generates a code batch when none exists', async () => {
      mockedPrisma.deviceRegistration.findUnique.mockResolvedValue(null)
      mockedPrisma.deviceRegistration.create.mockResolvedValue({} as any)
      mockedGetBatchStatus.mockResolvedValue({ hasBatch: false } as any)
      mockedGenerateCodeBatch.mockResolvedValue({
        batchId: 'new-batch',
        pairs: [{ challenge: 'C1', response: 'R1' }],
        expiresAt: new Date('2026-06-01'),
        total: 50,
      } as any)
      mockedCreateRefreshToken.mockResolvedValue({ refreshToken: 'rt', expiresAt: new Date() } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/register',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: registerPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(mockedGenerateCodeBatch).toHaveBeenCalledWith({ tenantId: 'tenant-1', userId: 'user-1' })
    })
  })

  // ── GET / (admin list) ──────────────────────────────────────────

  describe('GET /api/devices', () => {
    it('lists all tenant devices with user info', async () => {
      const devices = [
        { deviceId: 'd1', deviceName: 'Laptop', status: 'ACTIVE', user: { id: 'u1', name: 'Alice', email: 'a@a.com' }, registeredAt: new Date() },
        { deviceId: 'd2', deviceName: 'Tablet', status: 'REVOKED', user: { id: 'u2', name: 'Bob', email: 'b@b.com' }, registeredAt: new Date() },
      ]
      mockedPrisma.deviceRegistration.findMany.mockResolvedValue(devices as any)

      const res = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-role': 'ADMIN' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().devices).toHaveLength(2)
      expect(mockedPrisma.deviceRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          include: expect.objectContaining({ user: expect.any(Object) }),
        }),
      )
    })
  })

  // ── POST /:deviceId/heartbeat ────────────────────────────────────

  describe('POST /api/devices/:deviceId/heartbeat', () => {
    it('updates lastSyncAt and returns current status', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        deviceId: 'device-abc',
        status: 'ACTIVE',
      } as any)
      mockedPrisma.deviceRegistration.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/heartbeat',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ACTIVE')
      expect(mockedPrisma.deviceRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1' },
          data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
        }),
      )
    })

    it('returns WIPE_PENDING when device is flagged for wipe', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        deviceId: 'device-abc',
        status: 'WIPE_PENDING',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/heartbeat',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('WIPE_PENDING')
      expect(res.json().wipeRequired).toBe(true)
      // update should NOT be called — we just report the status
      expect(mockedPrisma.deviceRegistration.update).not.toHaveBeenCalled()
    })
  })

  // ── POST /:deviceId/revoke ──────────────────────────────────────

  describe('POST /api/devices/:deviceId/revoke', () => {
    it('sets device status to REVOKED', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({ id: 'reg-1', deviceId: 'device-abc' } as any)
      mockedPrisma.deviceRegistration.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/revoke',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-role': 'ADMIN' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('REVOKED')
      expect(mockedPrisma.deviceRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REVOKED' } }),
      )
    })
  })

  // ── POST /:deviceId/wipe ────────────────────────────────────────

  describe('POST /api/devices/:deviceId/wipe', () => {
    it('sets device status to WIPE_PENDING', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({ id: 'reg-1', deviceId: 'device-abc' } as any)
      mockedPrisma.deviceRegistration.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/wipe',
        headers: { 'x-tenant-id': 'tenant-1', 'x-user-role': 'ADMIN' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('WIPE_PENDING')
      expect(mockedPrisma.deviceRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'WIPE_PENDING' } }),
      )
    })
  })

  // ── POST /:deviceId/confirm-wipe ────────────────────────────────

  describe('POST /api/devices/:deviceId/confirm-wipe', () => {
    it('confirms wipe and sets status to WIPED', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        deviceId: 'device-abc',
        status: 'WIPE_PENDING',
      } as any)
      mockedPrisma.deviceRegistration.update.mockResolvedValue({} as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/confirm-wipe',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('WIPED')
      expect(mockedPrisma.deviceRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WIPED', wipedAt: expect.any(Date) }),
        }),
      )
    })

    it('returns 404 when device is not in WIPE_PENDING state', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/confirm-wipe',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: {},
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // ── POST /:deviceId/audit-logs ──────────────────────────────────

  describe('POST /api/devices/:deviceId/audit-logs', () => {
    it('bulk inserts audit logs and returns inserted count', async () => {
      mockedPrisma.deviceRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        deviceId: 'device-abc',
      } as any)
      mockedPrisma.deviceAuditLog.createMany.mockResolvedValue({ count: 3 } as any)

      const logs = [
        { action: 'LOGIN', occurredAt: '2026-05-01T10:00:00Z' },
        { action: 'SYNC_START', occurredAt: '2026-05-01T10:01:00Z' },
        { action: 'SYNC_END', entityType: 'certificate', entityId: 'cert-1', occurredAt: '2026-05-01T10:02:00Z' },
      ]

      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/audit-logs',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { logs },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().inserted).toBe(3)
      expect(mockedPrisma.deviceAuditLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ action: 'LOGIN', deviceId: 'device-abc', tenantId: 'tenant-1' }),
          ]),
        }),
      )
    })

    it('returns 400 when logs array is empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/device-abc/audit-logs',
        headers: { 'x-user-id': 'user-1', 'x-tenant-id': 'tenant-1' },
        payload: { logs: [] },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/logs array is required/i)
    })
  })
})
