/**
 * Audit Service
 *
 * Logs security and business events for compliance and debugging.
 */

import { prisma, Prisma } from '@hta/database'
import type { AuditEvent, AuditAction, EntityType, ActorType } from './types.js'

export type { AuditEvent, AuditAction, EntityType, ActorType } from './types.js'

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        actorId: event.actorId,
        actorType: event.actorType,
        changes: event.changes ? (event.changes as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('[Audit] Failed to log event:', error)
  }
}

/**
 * Log a login success event
 */
export async function logLoginSuccess(
  userId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    entityType: 'USER',
    entityId: userId,
    action: 'LOGIN_SUCCESS',
    actorId: userId,
    actorType: 'USER',
    changes: { email, ipAddress, userAgent },
  })
}

/**
 * Log a login failure event
 */
export async function logLoginFailed(
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    entityType: 'SESSION',
    entityId: email, // Use email as entity since we don't have a user ID
    action: 'LOGIN_FAILED',
    actorType: 'ANONYMOUS',
    changes: { email, reason, ipAddress, userAgent },
  })
}

/**
 * Log a password change event
 */
export async function logPasswordChange(
  userId: string,
  email: string,
  ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    entityType: 'USER',
    entityId: userId,
    action: 'PASSWORD_CHANGE',
    actorId: userId,
    actorType: 'USER',
    changes: { email, ipAddress },
  })
}

/**
 * Log an account lockout event
 */
export async function logAccountLocked(
  email: string,
  reason: string,
  ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    entityType: 'SESSION',
    entityId: email,
    action: 'ACCOUNT_LOCKED',
    actorType: 'SYSTEM',
    changes: { email, reason, ipAddress },
  })
}

/**
 * Log a certificate event
 */
export async function logCertificateEvent(
  action:
    | 'CERTIFICATE_CREATED'
    | 'CERTIFICATE_UPDATED'
    | 'CERTIFICATE_SUBMITTED'
    | 'CERTIFICATE_APPROVED'
    | 'CERTIFICATE_REJECTED'
    | 'CERTIFICATE_SENT_TO_CUSTOMER'
    | 'CERTIFICATE_FINALIZED'
    | 'CERTIFICATE_DELETED',
  certificateId: string,
  actorId: string,
  actorType: ActorType = 'USER',
  changes?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    entityType: 'CERTIFICATE',
    entityId: certificateId,
    action,
    actorId,
    actorType,
    changes,
  })
}

/**
 * Log an admin action
 */
export async function logAdminAction(
  userId: string,
  description: string,
  entityType: EntityType,
  entityId: string,
  changes?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    entityType,
    entityId,
    action: 'ADMIN_ACTION',
    actorId: userId,
    actorType: 'USER',
    changes: { description, ...changes },
  })
}

/**
 * Log a customer event
 */
export async function logCustomerEvent(
  action: 'CUSTOMER_REGISTERED' | 'CUSTOMER_APPROVED' | 'CUSTOMER_REJECTED' | 'CUSTOMER_FEEDBACK_SUBMITTED',
  customerId: string,
  actorId?: string,
  actorType: ActorType = 'CUSTOMER',
  changes?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    entityType: 'CUSTOMER',
    entityId: customerId,
    action,
    actorId,
    actorType,
    changes,
  })
}

/**
 * Query audit logs
 */
export async function getAuditLogs(options: {
  entityType?: EntityType
  entityId?: string
  action?: AuditAction
  actorId?: string
  actorType?: ActorType
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}): Promise<{ logs: unknown[]; total: number }> {
  const {
    entityType,
    entityId,
    action,
    actorId,
    actorType,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options

  const where = {
    ...(entityType && { entityType }),
    ...(entityId && { entityId }),
    ...(action && { action }),
    ...(actorId && { actorId }),
    ...(actorType && { actorType }),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }
      : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { logs, total }
}
