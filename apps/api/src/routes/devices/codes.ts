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

    const [batchStatus, latestRequest] = await Promise.all([
      getBatchStatus({ tenantId, userId }),
      prisma.internalRequest.findFirst({
        where: { requestedById: userId, type: 'OFFLINE_CODE_REQUEST' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, adminNote: true, createdAt: true },
      }),
    ])

    return { ...batchStatus, pendingRequest: latestRequest }
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
}

export default offlineCodesRoutes
