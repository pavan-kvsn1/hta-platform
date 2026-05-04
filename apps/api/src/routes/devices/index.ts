/**
 * Device Management Routes
 *
 * Endpoints for registering, listing, and managing Electron desktop devices.
 */

import { FastifyPluginAsync } from 'fastify'
import { prisma, Prisma } from '@hta/database'
import { requireStaff, requireAdmin } from '../../middleware/auth.js'
import { createRefreshToken } from '../../services/refresh-token.js'
import { getBatchStatus, generateCodeBatch } from '../../services/offline-codes.js'

const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/devices/register — Register a new desktop device
  fastify.post<{
    Body: {
      deviceId: string
      deviceName: string
      platform: string
      appVersion?: string
    }
  }>('/register', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { deviceId, deviceName, platform, appVersion } = request.body

    if (!deviceId || !deviceName || !platform) {
      return reply.status(400).send({ error: 'deviceId, deviceName, and platform are required' })
    }

    // Check if device already registered
    const existing = await prisma.deviceRegistration.findUnique({
      where: { deviceId },
    })

    if (existing) {
      if (existing.userId !== userId || existing.tenantId !== tenantId) {
        return reply.status(409).send({ error: 'Device already registered to another user' })
      }
      // Re-registration of same device by same user — reactivate
      await prisma.deviceRegistration.update({
        where: { deviceId },
        data: { status: 'ACTIVE', appVersion, lastSyncAt: new Date(), wipedAt: null },
      })
    } else {
      await prisma.deviceRegistration.create({
        data: { tenantId, userId, deviceId, deviceName, platform, appVersion },
      })
    }

    // Get existing code batch, or generate a new one if none exists
    let batch = await getBatchStatus({ tenantId, userId })
    if (!batch.hasBatch) {
      const newBatch = await generateCodeBatch({ tenantId, userId })
      batch = { hasBatch: true, batchId: newBatch.batchId, pairs: newBatch.pairs, expiresAt: newBatch.expiresAt, total: newBatch.total, remaining: newBatch.total, isExpired: false }
    }

    // Issue 30-day desktop refresh token bound to this device
    const { refreshToken, expiresAt } = await createRefreshToken({
      userId,
      userType: 'STAFF',
      tenantId,
      tokenType: 'desktop',
      deviceId,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    })

    return {
      device: { deviceId, deviceName, platform, status: 'ACTIVE' },
      codes: batch.pairs,
      codesExpiresAt: batch.expiresAt ?? null,
      refreshToken,
      tokenExpiresAt: expiresAt,
    }
  })

  // GET /api/devices — List all devices for tenant (admin only)
  fastify.get('/', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId

    const devices = await prisma.deviceRegistration.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { registeredAt: 'desc' },
    })

    return { devices }
  })

  // GET /api/devices/my — List current user's devices
  fastify.get('/my', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const devices = await prisma.deviceRegistration.findMany({
      where: { tenantId, userId },
      orderBy: { registeredAt: 'desc' },
    })

    return { devices }
  })

  // GET /api/devices/:deviceId/status — Device status
  fastify.get<{ Params: { deviceId: string } }>('/:deviceId/status', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId

    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }

    return { device }
  })

  // POST /api/devices/:deviceId/heartbeat — Update lastSyncAt
  fastify.post<{
    Params: { deviceId: string }
    Body: { appVersion?: string }
  }>('/:deviceId/heartbeat', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId, userId },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }

    if (device.status === 'REVOKED') {
      return reply.status(403).send({ error: 'Device has been revoked', status: 'REVOKED' })
    }

    if (device.status === 'WIPE_PENDING') {
      return reply.status(200).send({ status: 'WIPE_PENDING', wipeRequired: true })
    }

    await prisma.deviceRegistration.update({
      where: { id: device.id },
      data: {
        lastSyncAt: new Date(),
        ...(request.body.appVersion && { appVersion: request.body.appVersion }),
      },
    })

    return { status: device.status }
  })

  // POST /api/devices/:deviceId/revoke — Revoke device (admin only)
  fastify.post<{ Params: { deviceId: string } }>('/:deviceId/revoke', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId

    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }

    await prisma.deviceRegistration.update({
      where: { id: device.id },
      data: { status: 'REVOKED' },
    })

    return { status: 'REVOKED' }
  })

  // POST /api/devices/:deviceId/wipe — Request remote wipe (admin only)
  fastify.post<{ Params: { deviceId: string } }>('/:deviceId/wipe', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId

    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }

    await prisma.deviceRegistration.update({
      where: { id: device.id },
      data: { status: 'WIPE_PENDING' },
    })

    return { status: 'WIPE_PENDING' }
  })

  // POST /api/devices/:deviceId/confirm-wipe — Confirm wipe completed (from device)
  fastify.post<{ Params: { deviceId: string } }>('/:deviceId/confirm-wipe', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId, userId, status: 'WIPE_PENDING' },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found or not pending wipe' })
    }

    await prisma.deviceRegistration.update({
      where: { id: device.id },
      data: { status: 'WIPED', wipedAt: new Date() },
    })

    return { status: 'WIPED' }
  })

  // POST /api/devices/:deviceId/audit-logs — Bulk insert audit logs from device
  fastify.post<{
    Params: { deviceId: string }
    Body: {
      logs: Array<{
        action: string
        entityType?: string
        entityId?: string
        metadata?: Record<string, unknown>
        occurredAt: string
      }>
    }
  }>('/:deviceId/audit-logs', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const { deviceId } = request.params
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { logs } = request.body

    if (!Array.isArray(logs) || logs.length === 0) {
      return reply.status(400).send({ error: 'logs array is required' })
    }

    // Verify device belongs to user
    const device = await prisma.deviceRegistration.findFirst({
      where: { deviceId, tenantId, userId },
    })

    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }

    const created = await prisma.deviceAuditLog.createMany({
      data: logs.map((log) => ({
        tenantId,
        deviceId,
        userId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: (log.metadata as Prisma.InputJsonValue) ?? undefined,
        occurredAt: new Date(log.occurredAt),
      })),
    })

    return { inserted: created.count }
  })
}

export default deviceRoutes
