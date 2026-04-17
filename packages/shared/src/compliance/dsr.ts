/**
 * Data Subject Rights (DSR) Implementation
 *
 * GDPR Articles 15-17, 19-20 - Rights of the Data Subject
 * - Right to Access (Article 15)
 * - Right to Rectification (Article 16)
 * - Right to Erasure (Article 17)
 */

import { prisma } from '@hta/database'
import { createLogger } from '../logger/index.js'
import { logDataExport, logDataDeletion, logDataRectification } from './audit-logger.js'
import type { DataExportResult, DataDeletionResult } from './types.js'

const logger = createLogger('dsr')

// ISO/IEC 17025 requires 10-year retention for calibration records
const REGULATORY_RETENTION_YEARS = 10

/**
 * Export user data (Right to Access - Article 15)
 *
 * Returns all personal data associated with a customer user.
 */
export async function exportCustomerUserData(
  customerId: string,
  requestedById: string,
  context: {
    tenantId: string
    ipAddress?: string
  }
): Promise<DataExportResult> {
  logger.info({ customerId, requestedById }, 'Starting customer data export')

  const [customerUser, certificates, auditLogs] = await Promise.all([
    prisma.customerUser.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        createdAt: true,
        updatedAt: true,
        customerAccountId: true,
        isPoc: true,
        activatedAt: true,
      },
    }),
    // Get certificates where this customer is a contact
    prisma.certificate.findMany({
      where: {
        tenantId: context.tenantId,
        customerContactEmail: {
          equals: (await prisma.customerUser.findUnique({ where: { id: customerId } }))?.email,
        },
      },
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        customerName: true,
        customerAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { actorId: customerId },
          { entityId: customerId },
        ],
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ])

  if (!customerUser) {
    throw new Error(`Customer user not found: ${customerId}`)
  }

  // Log the data export
  await logDataExport(customerId, requestedById, {
    service: 'api',
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    exportedCategories: ['profile', 'certificates', 'audit_logs'],
  })

  return {
    user: {
      id: customerUser.id,
      email: customerUser.email,
      name: customerUser.name,
      companyName: customerUser.companyName,
      createdAt: customerUser.createdAt,
      updatedAt: customerUser.updatedAt,
    },
    certificates: certificates.map(cert => ({
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      status: cert.status,
      createdAt: cert.createdAt,
    })),
    auditLogs: auditLogs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      createdAt: log.createdAt,
    })),
    consents: [], // Would come from Consent table when implemented
    exportedAt: new Date(),
    format: 'json',
  }
}

/**
 * Export internal user data (Right to Access - Article 15)
 *
 * Returns all personal data associated with an internal user.
 */
export async function exportUserData(
  userId: string,
  requestedById: string,
  context: {
    tenantId: string
    ipAddress?: string
  }
): Promise<DataExportResult> {
  logger.info({ userId, requestedById }, 'Starting user data export')

  const [user, createdCertificates, auditLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        activatedAt: true,
      },
    }),
    prisma.certificate.findMany({
      where: {
        tenantId: context.tenantId,
        createdById: userId,
      },
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        createdAt: true,
      },
      take: 1000,
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { actorId: userId },
          { entityId: userId },
        ],
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ])

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  await logDataExport(userId, requestedById, {
    service: 'api',
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    exportedCategories: ['profile', 'certificates_created', 'audit_logs'],
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      companyName: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    certificates: createdCertificates.map(cert => ({
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      status: cert.status,
      createdAt: cert.createdAt,
    })),
    auditLogs: auditLogs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      createdAt: log.createdAt,
    })),
    consents: [],
    exportedAt: new Date(),
    format: 'json',
  }
}

/**
 * Delete/Pseudonymize customer user data (Right to Erasure - Article 17)
 *
 * ISO/IEC 17025 requires 10-year retention for calibration records,
 * so we pseudonymize instead of delete when certificates exist.
 */
export async function deleteCustomerUserData(
  customerId: string,
  requestedById: string,
  context: {
    tenantId: string
    ipAddress?: string
    immediate?: boolean
  }
): Promise<DataDeletionResult> {
  logger.info({ customerId, requestedById, immediate: context.immediate }, 'Starting customer data deletion')

  const customerUser = await prisma.customerUser.findUnique({
    where: { id: customerId },
    select: { email: true, tenantId: true },
  })

  if (!customerUser) {
    throw new Error(`Customer user not found: ${customerId}`)
  }

  // Check for regulatory holds (approved certificates within retention period)
  const retentionCutoff = new Date()
  retentionCutoff.setFullYear(retentionCutoff.getFullYear() - REGULATORY_RETENTION_YEARS)

  const certificatesWithHold = await prisma.certificate.count({
    where: {
      tenantId: context.tenantId,
      customerContactEmail: customerUser.email,
      status: { in: ['APPROVED', 'FINALIZED'] },
      createdAt: { gte: retentionCutoff },
    },
  })

  if (certificatesWithHold > 0 && !context.immediate) {
    // Pseudonymize instead of delete for regulatory compliance
    await prisma.customerUser.update({
      where: { id: customerId },
      data: {
        email: `deleted-${customerId.slice(0, 8)}@anonymized.local`,
        name: 'Deleted User',
        companyName: null,
        passwordHash: null,
        isActive: false,
        activationToken: null,
      },
    })

    await logDataDeletion(customerId, requestedById, {
      service: 'api',
      tenantId: context.tenantId,
      ipAddress: context.ipAddress,
      deletedCategories: ['email', 'name', 'company_name', 'password'],
      pseudonymized: true,
      retainedData: [`${certificatesWithHold} certificates (ISO/IEC 17025 - ${REGULATORY_RETENTION_YEARS} year retention)`],
    })

    return {
      success: true,
      pseudonymized: true,
      retainedData: [`${certificatesWithHold} certificates (ISO/IEC 17025 - ${REGULATORY_RETENTION_YEARS} year retention)`],
      deletedAt: new Date(),
    }
  }

  // Full deletion - use transaction
  await prisma.$transaction(async (tx) => {
    // Delete related records
    await tx.signature.deleteMany({
      where: { customerId },
    })
    await tx.chatMessage.deleteMany({
      where: { customerId },
    })
    await tx.approvalToken.deleteMany({
      where: { customerId },
    })
    await tx.notification.deleteMany({
      where: { customerId },
    })
    await tx.passwordResetToken.deleteMany({
      where: { customerId },
    })

    // Delete the customer user
    await tx.customerUser.delete({
      where: { id: customerId },
    })
  })

  await logDataDeletion(customerId, requestedById, {
    service: 'api',
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    deletedCategories: ['all_personal_data'],
    pseudonymized: false,
  })

  return {
    success: true,
    pseudonymized: false,
    deletedAt: new Date(),
  }
}

/**
 * Update customer user data (Right to Rectification - Article 16)
 */
export async function rectifyCustomerUserData(
  customerId: string,
  updates: Partial<{
    email: string
    name: string
    companyName: string
  }>,
  requestedById: string,
  context: {
    tenantId: string
    ipAddress?: string
  }
): Promise<void> {
  logger.info({ customerId, requestedById, fields: Object.keys(updates) }, 'Starting customer data rectification')

  const customerUser = await prisma.customerUser.findUnique({
    where: { id: customerId },
    select: { email: true, name: true, companyName: true },
  })

  if (!customerUser) {
    throw new Error(`Customer user not found: ${customerId}`)
  }

  // Only update allowed fields
  const allowedUpdates: Record<string, string | null> = {}
  if (updates.email !== undefined) allowedUpdates.email = updates.email
  if (updates.name !== undefined) allowedUpdates.name = updates.name
  if (updates.companyName !== undefined) allowedUpdates.companyName = updates.companyName

  if (Object.keys(allowedUpdates).length === 0) {
    return
  }

  await prisma.customerUser.update({
    where: { id: customerId },
    data: allowedUpdates,
  })

  await logDataRectification(customerId, requestedById, {
    service: 'api',
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    rectifiedFields: Object.keys(allowedUpdates),
  })
}

/**
 * Update internal user data (Right to Rectification - Article 16)
 */
export async function rectifyUserData(
  userId: string,
  updates: Partial<{
    email: string
    name: string
  }>,
  requestedById: string,
  context: {
    tenantId: string
    ipAddress?: string
  }
): Promise<void> {
  logger.info({ userId, requestedById, fields: Object.keys(updates) }, 'Starting user data rectification')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const allowedUpdates: Record<string, string> = {}
  if (updates.email !== undefined) allowedUpdates.email = updates.email
  if (updates.name !== undefined) allowedUpdates.name = updates.name

  if (Object.keys(allowedUpdates).length === 0) {
    return
  }

  await prisma.user.update({
    where: { id: userId },
    data: allowedUpdates,
  })

  await logDataRectification(userId, requestedById, {
    service: 'api',
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    rectifiedFields: Object.keys(allowedUpdates),
  })
}
