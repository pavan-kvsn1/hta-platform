/**
 * Compliance Audit Logger Unit Tests
 *
 * Tests for the extended audit logging for GDPR compliance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger
vi.mock('../src/logger/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Use vi.hoisted for prisma mock
const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}))

vi.mock('@hta/database', () => ({
  prisma: {
    auditLog: mockAuditLog,
  },
  Prisma: {},
}))

import {
  logComplianceEvent,
  logPiiAccess,
  logPiiModification,
  logDataExport,
  logDataDeletion,
  logDataRectification,
  logConsentChange,
  queryComplianceAuditLogs,
} from '../src/compliance/audit-logger'

describe('Compliance Audit Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  describe('logComplianceEvent', () => {
    it('creates an audit log entry in the database', async () => {
      await logComplianceEvent({
        action: 'PII_ACCESS',
        resourceType: 'USER',
        resourceId: 'user-1',
        userId: 'admin-1',
        service: 'api',
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'USER',
          entityId: 'user-1',
          action: 'PII_ACCESS',
          actorId: 'admin-1',
          actorType: 'USER',
        }),
      })
    })

    it('sets actorType to CUSTOMER for customer users', async () => {
      await logComplianceEvent({
        action: 'DATA_EXPORT',
        resourceType: 'CUSTOMER',
        resourceId: 'cust-1',
        userId: 'cust-1',
        userType: 'customer',
        service: 'api',
      })

      const callArg = mockAuditLog.create.mock.calls[0][0]
      expect(callArg.data.actorType).toBe('CUSTOMER')
    })

    it('sets actorType to SYSTEM when no userId', async () => {
      await logComplianceEvent({
        action: 'DATA_DELETE',
        resourceType: 'USER',
        resourceId: 'user-1',
        service: 'worker',
      })

      const callArg = mockAuditLog.create.mock.calls[0][0]
      expect(callArg.data.actorType).toBe('SYSTEM')
    })

    it('does not throw when database write fails', async () => {
      mockAuditLog.create.mockRejectedValue(new Error('DB connection failed'))

      await expect(
        logComplianceEvent({
          action: 'PII_ACCESS',
          resourceType: 'USER',
          resourceId: 'user-1',
          service: 'api',
        })
      ).resolves.not.toThrow()
    })

    it('includes all context fields in changes JSON', async () => {
      await logComplianceEvent({
        action: 'PII_ACCESS',
        resourceType: 'USER',
        resourceId: 'user-1',
        userId: 'admin-1',
        userEmail: 'admin@test.com',
        userRole: 'ADMIN',
        service: 'api',
        tenantId: 'tenant-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome/100',
        piiAccessed: ['email', 'name'],
        details: { reason: 'support ticket' },
      })

      const callArg = mockAuditLog.create.mock.calls[0][0]
      const changes = callArg.data.changes
      expect(changes.service).toBe('api')
      expect(changes.tenantId).toBe('tenant-1')
      expect(changes.userEmail).toBe('admin@test.com')
      expect(changes.ipAddress).toBe('192.168.1.1')
      expect(changes.piiAccessed).toEqual(['email', 'name'])
      expect(changes.reason).toBe('support ticket')
    })
  })

  describe('logPiiAccess', () => {
    it('logs PII access with correct action', async () => {
      await logPiiAccess('USER', 'user-1', ['email', 'phone'], {
        userId: 'admin-1',
        service: 'api',
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PII_ACCESS',
          entityType: 'USER',
          entityId: 'user-1',
        }),
      })
    })

    it('includes reason when provided', async () => {
      await logPiiAccess('USER', 'user-1', ['email'], {
        service: 'api',
        reason: 'Customer support request',
      })

      const callArg = mockAuditLog.create.mock.calls[0][0]
      expect(callArg.data.changes.reason).toBe('Customer support request')
    })
  })

  describe('logPiiModification', () => {
    it('logs PII modification with correct action', async () => {
      await logPiiModification('USER', 'user-1', ['email'], {
        userId: 'admin-1',
        service: 'api',
        changes: [{ field: 'email', action: 'update' }],
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PII_MODIFICATION',
        }),
      })
    })
  })

  describe('logDataExport', () => {
    it('logs data export event', async () => {
      await logDataExport('user-1', 'admin-1', {
        service: 'api',
        tenantId: 'tenant-1',
        exportedCategories: ['profile', 'certificates'],
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_EXPORT',
          entityType: 'DATA_SUBJECT',
          entityId: 'user-1',
        }),
      })
    })
  })

  describe('logDataDeletion', () => {
    it('logs pseudonymization event', async () => {
      await logDataDeletion('user-1', 'admin-1', {
        service: 'api',
        deletedCategories: ['email', 'name'],
        pseudonymized: true,
        retainedData: ['10 certificates'],
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_PSEUDONYMIZE',
        }),
      })
    })

    it('logs full deletion event', async () => {
      await logDataDeletion('user-1', 'admin-1', {
        service: 'api',
        deletedCategories: ['all_personal_data'],
        pseudonymized: false,
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_DELETE',
        }),
      })
    })
  })

  describe('logDataRectification', () => {
    it('logs data rectification event', async () => {
      await logDataRectification('user-1', 'admin-1', {
        service: 'api',
        tenantId: 'tenant-1',
        rectifiedFields: ['email', 'name'],
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_RECTIFY',
          entityType: 'DATA_SUBJECT',
        }),
      })
    })
  })

  describe('logConsentChange', () => {
    it('logs consent granted event', async () => {
      await logConsentChange('user-1', 'analytics', true, {
        service: 'web',
        version: '1.0',
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CONSENT_GRANTED',
          entityType: 'CONSENT',
          entityId: 'user-1:analytics',
        }),
      })
    })

    it('logs consent revoked event', async () => {
      await logConsentChange('user-1', 'marketing_email', false, {
        service: 'web',
        version: '1.0',
      })

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CONSENT_REVOKED',
        }),
      })
    })
  })

  describe('queryComplianceAuditLogs', () => {
    it('queries logs with default pagination', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      const result = await queryComplianceAuditLogs({})

      expect(result.logs).toEqual([])
      expect(result.total).toBe(0)
      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
          orderBy: { createdAt: 'desc' },
        })
      )
    })

    it('filters by subjectId', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      await queryComplianceAuditLogs({ subjectId: 'user-1' })

      const findCall = mockAuditLog.findMany.mock.calls[0][0]
      expect(findCall.where).toHaveProperty('entityId', 'user-1')
    })

    it('filters by action', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      await queryComplianceAuditLogs({ action: 'PII_ACCESS' })

      const findCall = mockAuditLog.findMany.mock.calls[0][0]
      expect(findCall.where).toHaveProperty('action', 'PII_ACCESS')
    })

    it('filters by date range', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      const startDate = new Date('2025-01-01')
      const endDate = new Date('2025-12-31')

      await queryComplianceAuditLogs({ startDate, endDate })

      const findCall = mockAuditLog.findMany.mock.calls[0][0]
      expect(findCall.where.createdAt).toHaveProperty('gte', startDate)
      expect(findCall.where.createdAt).toHaveProperty('lte', endDate)
    })

    it('applies custom limit and offset', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      await queryComplianceAuditLogs({ limit: 50, offset: 10 })

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 10,
        })
      )
    })

    it('filters by service', async () => {
      mockAuditLog.findMany.mockResolvedValue([])
      mockAuditLog.count.mockResolvedValue(0)

      await queryComplianceAuditLogs({ service: 'api' })

      const findCall = mockAuditLog.findMany.mock.calls[0][0]
      expect(findCall.where.changes).toBeDefined()
    })
  })
})
