import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { createLogger } from '@hta/shared'
import { sendSecurityAlertEmail, isEmailConfigured } from '../../services/index.js'

const logger = createLogger('security-routes')

interface CSPAlertPayload {
  timestamp: string
  severity: 'HIGH' | 'LOW'
  documentUri: string
  violatedDirective: string
  effectiveDirective: string
  blockedUri: string
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
}

const securityRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/security/csp-alert
   *
   * Internal endpoint called by web app when HIGH severity CSP violations occur.
   * Creates notifications for all master admins across all tenants.
   */
  fastify.post('/csp-alert', async (request, reply) => {
    // Verify internal service header
    const internalService = request.headers['x-internal-service']
    if (internalService !== 'web-hta') {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const payload = request.body as CSPAlertPayload

    if (!payload || payload.severity !== 'HIGH') {
      return reply.status(400).send({ error: 'Invalid payload or not high severity' })
    }

    try {
      // Log to external audit trail (tamper-evident)
      logger.warn({
        audit: true,
        security: true,
        event: 'CSP_VIOLATION_HIGH',
        ...payload,
      })

      // Get all master admins across all tenants
      const masterAdmins = await prisma.user.findMany({
        where: {
          role: 'ADMIN',
          adminType: 'MASTER',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
        },
      })

      if (masterAdmins.length === 0) {
        logger.warn('No master admins found to notify about CSP violation')
        return reply.status(200).send({ notified: 0, emailsSent: 0 })
      }

      // Create in-app notifications for all master admins (backup)
      const notifications = await prisma.notification.createMany({
        data: masterAdmins.map((admin) => ({
          userId: admin.id,
          type: 'SECURITY_ALERT',
          title: 'Security Alert: CSP Violation Detected',
          message: `A high-severity Content Security Policy violation was detected. An external script attempted to load from: ${payload.blockedUri}. This could indicate an XSS attack attempt.`,
          data: JSON.stringify({
            alertType: 'CSP_VIOLATION',
            severity: payload.severity,
            blockedUri: payload.blockedUri,
            documentUri: payload.documentUri,
            violatedDirective: payload.violatedDirective,
            timestamp: payload.timestamp,
            sourceFile: payload.sourceFile,
            lineNumber: payload.lineNumber,
          }),
        })),
      })

      // Send email alerts (primary notification method)
      let emailResult = { sent: 0, failed: 0 }
      if (isEmailConfigured()) {
        emailResult = await sendSecurityAlertEmail(
          masterAdmins.map((admin) => ({
            email: admin.email,
            name: admin.name || 'Admin',
          })),
          {
            alertType: 'CSP_VIOLATION',
            severity: 'HIGH',
            summary: `A high-severity Content Security Policy violation was detected. An external script attempted to load from: ${payload.blockedUri}. This could indicate an XSS attack attempt or a misconfigured third-party integration.`,
            details: [
              { label: 'Blocked URI', value: payload.blockedUri },
              { label: 'Document', value: payload.documentUri },
              { label: 'Directive', value: payload.violatedDirective },
              ...(payload.sourceFile
                ? [{ label: 'Source', value: `${payload.sourceFile}:${payload.lineNumber || '?'}` }]
                : []),
            ],
            timestamp: payload.timestamp,
          }
        )
      } else {
        logger.warn('Email not configured - only in-app notifications sent')
      }

      logger.info({
        event: 'CSP_ALERT_SENT',
        inAppNotifications: notifications.count,
        emailsSent: emailResult.sent,
        emailsFailed: emailResult.failed,
        adminEmails: masterAdmins.map((a) => a.email),
      })

      return reply.status(200).send({
        notified: notifications.count,
        emailsSent: emailResult.sent,
        emailsFailed: emailResult.failed,
      })
    } catch (error) {
      logger.error({ error }, 'Failed to process CSP alert')
      return reply.status(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * GET /api/security/alerts
   *
   * Get recent security alerts (for admin dashboard).
   * Requires master admin authentication.
   */
  fastify.get('/alerts', {
    preHandler: [
      async (request, reply) => {
        // Quick auth check - must have valid user
        if (!request.user?.sub) {
          return reply.status(401).send({ error: 'Unauthorized' })
        }

        // Must be master admin
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { role: true, adminType: true },
        })

        if (user?.role !== 'ADMIN' || user?.adminType !== 'MASTER') {
          return reply.status(403).send({ error: 'Master admin required' })
        }
      },
    ],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { limit?: string }
    const limit = Math.min(parseInt(query.limit || '50'), 100)

    // Get security notifications for this tenant's admins
    const alerts = await prisma.notification.findMany({
      where: {
        type: 'SECURITY_ALERT',
        user: { tenantId },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
      },
    })

    return {
      alerts: alerts.map((a) => ({
        ...a,
        data: a.data ? JSON.parse(a.data as string) : null,
        createdAt: a.createdAt.toISOString(),
      })),
    }
  })
}

export default securityRoutes
