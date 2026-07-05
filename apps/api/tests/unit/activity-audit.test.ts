import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest } from 'fastify'

vi.mock('@hta/database', () => ({
  Prisma: {},
  prisma: {
    authActivityLog: { create: vi.fn() },
    deviceAuditLog: { create: vi.fn() },
    certificateEditSessionLog: { create: vi.fn() },
  },
}))

import { prisma } from '@hta/database'
import {
  getRequestDeviceId,
  getRequestIp,
  getRequestSurface,
  getRequestUserAgent,
  writeAuthActivity,
  writeCertificateEditSession,
  writeDeviceAudit,
} from '../../src/lib/activity-audit.js'

const mockedPrisma = vi.mocked(prisma)

function mockRequest(headers: Record<string, string> = {}, ip = '127.0.0.1'): FastifyRequest {
  return {
    headers,
    ip,
    log: { warn: vi.fn() },
  } as unknown as FastifyRequest
}

describe('activity-audit helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPrisma.authActivityLog.create.mockResolvedValue({} as never)
    mockedPrisma.deviceAuditLog.create.mockResolvedValue({} as never)
    mockedPrisma.certificateEditSessionLog.create.mockResolvedValue({} as never)
  })

  it('extracts request context from forwarded headers', () => {
    const request = mockRequest({
      'x-forwarded-for': '203.0.113.10, 10.0.0.5',
      'user-agent': 'HTA Desktop/0.1.0',
      'x-desktop-device-id': 'device-123',
      'x-auth-surface': 'desktop',
    })

    expect(getRequestIp(request)).toBe('203.0.113.10')
    expect(getRequestUserAgent(request)).toBe('HTA Desktop/0.1.0')
    expect(getRequestDeviceId(request)).toBe('device-123')
    expect(getRequestSurface(request)).toBe('DESKTOP')
  })

  it('writes auth activity with request context and metadata', async () => {
    const request = mockRequest({
      'x-forwarded-for': '198.51.100.20',
      'user-agent': 'Chrome',
      'x-device-id': 'device-456',
      'x-auth-surface': 'web',
    })

    await writeAuthActivity(request, {
      tenantId: 'tenant-1',
      userId: 'user-1',
      email: 'engineer@example.com',
      userType: 'STAFF',
      eventType: 'LOGIN_SUCCESS',
      metadata: { reason: 'password' },
    })

    expect(mockedPrisma.authActivityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        email: 'engineer@example.com',
        userType: 'STAFF',
        eventType: 'LOGIN_SUCCESS',
        surface: 'WEB',
        deviceId: 'device-456',
        ipAddress: '198.51.100.20',
        userAgent: 'Chrome',
        metadata: { reason: 'password' },
      }),
    })
  })

  it('writes device audit with nullable identity fields and request context', async () => {
    const request = mockRequest({
      'user-agent': 'WireGuard Provisioner',
      'x-forwarded-for': '192.0.2.44',
    })
    const occurredAt = new Date('2026-06-13T10:30:00.000Z')

    await writeDeviceAudit(request, {
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'VPN_PROVISIONED',
      entityType: 'VpnPeer',
      entityId: 'peer-1',
      occurredAt,
      metadata: { assignedIp: '10.8.3.2' },
    })

    expect(mockedPrisma.deviceAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        deviceId: undefined,
        action: 'VPN_PROVISIONED',
        entityType: 'VpnPeer',
        entityId: 'peer-1',
        ipAddress: '192.0.2.44',
        userAgent: 'WireGuard Provisioner',
        occurredAt,
        metadata: { assignedIp: '10.8.3.2' },
      }),
    })
  })

  it('writes certificate edit session events with duration and request context', async () => {
    const request = mockRequest({
      'user-agent': 'Chrome',
      'x-forwarded-for': '203.0.113.55',
      'x-auth-surface': 'web',
    })

    await writeCertificateEditSession(request, {
      tenantId: 'tenant-1',
      certificateId: 'cert-1',
      userId: 'engineer-1',
      eventType: 'CLOSED',
      mode: 'edit',
      revision: 3,
      activeDurationSeconds: 420,
      metadata: { source: 'pagehide' },
    })

    expect(mockedPrisma.certificateEditSessionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        certificateId: 'cert-1',
        userId: 'engineer-1',
        eventType: 'CLOSED',
        mode: 'edit',
        source: 'WEB',
        revision: 3,
        activeDurationSeconds: 420,
        ipAddress: '203.0.113.55',
        userAgent: 'Chrome',
        metadata: { source: 'pagehide' },
      }),
    })
  })

  it('does not throw when audit writes fail', async () => {
    const request = mockRequest()
    mockedPrisma.authActivityLog.create.mockRejectedValue(new Error('db unavailable') as never)

    await expect(writeAuthActivity(request, {
      eventType: 'LOGIN_FAILED',
      email: 'missing@example.com',
    })).resolves.toBeUndefined()

    expect(request.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'LOGIN_FAILED' }),
      'Failed to write auth activity log'
    )
  })
})
