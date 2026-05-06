/**
 * Offline Codes Routes
 *
 * Endpoints for viewing batch status and validating challenge-response pairs.
 * Card generation is admin-controlled via internal requests.
 */

import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'
import { getBatchStatus, validateCode } from '../../services/offline-codes.js'

const offlineCodesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/offline-codes — Get active batch status + latest request status
  fastify.get('/', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const [batchStatus, latestRequest, latestVpnRequest, vpnPeer, user] = await Promise.all([
      getBatchStatus({ tenantId, userId }),
      prisma.internalRequest.findFirst({
        where: { requestedById: userId, type: 'OFFLINE_CODE_REQUEST' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, adminNote: true, createdAt: true },
      }),
      prisma.internalRequest.findFirst({
        where: { requestedById: userId, type: 'DESKTOP_VPN_REQUEST' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, adminNote: true, createdAt: true },
      }),
      prisma.vpnPeer.findUnique({
        where: { userId },
        select: { ipAddress: true, provisionedAt: true, isActive: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { vpnProvisioningToken: true, vpnTokenGeneratedAt: true },
      }),
    ])

    return {
      ...batchStatus,
      pendingRequest: latestRequest,
      vpn: {
        latestRequest: latestVpnRequest,
        provisioningToken: user?.vpnProvisioningToken || null,
        tokenGeneratedAt: user?.vpnTokenGeneratedAt?.toISOString() || null,
        peer: vpnPeer
          ? {
              ipAddress: vpnPeer.ipAddress,
              provisionedAt: vpnPeer.provisionedAt.toISOString(),
              isActive: vpnPeer.isActive,
            }
          : null,
      },
    }
  })

  // POST /api/offline-codes/validate — Validate a challenge-response
  fastify.post<{
    Body: { key: string; value: string }
  }>('/validate', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { key, value } = request.body

    if (!key || !value) {
      return reply.status(400).send({ error: 'key and value are required' })
    }

    const result = await validateCode({ tenantId, userId, key, value })

    if (!result.valid) {
      return reply.status(401).send({ valid: false, reason: result.reason })
    }

    return { valid: true }
  })

  // POST /api/offline-codes/mark-used — Mark codes as consumed (synced from desktop app)
  fastify.post<{
    Body: { keys: string[] }
  }>('/mark-used', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { keys } = request.body

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return reply.status(400).send({ error: 'keys array is required' })
    }

    // Find the user's active batch
    const batch = await prisma.offlineCodeBatch.findFirst({
      where: { tenantId, userId, isActive: true },
    })

    if (!batch) {
      return reply.status(404).send({ error: 'No active batch found' })
    }

    // Mark matching codes as used
    const result = await prisma.offlineCode.updateMany({
      where: {
        batchId: batch.id,
        key: { in: keys.map(k => k.toUpperCase()) },
        used: false,
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    })

    return { marked: result.count }
  })
}

export default offlineCodesRoutes
