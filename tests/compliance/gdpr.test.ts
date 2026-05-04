/**
 * GDPR Compliance Tests
 *
 * Tests for GDPR compliance features including:
 * - Right to Access (Article 15)
 * - Right to Erasure (Article 17)
 * - Right to Rectification (Article 16)
 * - Consent Management (Article 7)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the database
vi.mock('@hta/database', () => ({
  prisma: {
    customerUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    certificate: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    signature: {
      deleteMany: vi.fn(),
    },
    chatMessage: {
      deleteMany: vi.fn(),
    },
    approvalToken: {
      deleteMany: vi.fn(),
    },
    notification: {
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      signature: { deleteMany: vi.fn() },
      chatMessage: { deleteMany: vi.fn() },
      approvalToken: { deleteMany: vi.fn() },
      notification: { deleteMany: vi.fn() },
      passwordResetToken: { deleteMany: vi.fn() },
      customerUser: { delete: vi.fn() },
    })),
  },
  Prisma: {
    InputJsonValue: {},
    DbNull: null,
  },
}))

// Import after mocking
import { prisma } from '@hta/database'
import {
  DataProcessingInventory,
  getActiveProcessingActivities,
  getThirdPartyRecipients,
  getDataCategories,
} from '../../packages/shared/src/compliance/data-inventory.js'
import {
  recordConsent,
  checkConsent,
  getUserConsents,
  revokeAllConsents,
  getConsentStatus,
  CONSENT_VERSIONS,
  _resetConsentStore,
} from '../../packages/shared/src/compliance/consent.js'
import {
  exportCustomerUserData,
  deleteCustomerUserData,
  rectifyCustomerUserData,
} from '../../packages/shared/src/compliance/dsr.js'
import {
  logComplianceEvent,
  queryComplianceAuditLogs,
} from '../../packages/shared/src/compliance/audit-logger.js'

describe('Data Processing Inventory', () => {
  it('should have all required processing activities', () => {
    const requiredActivities = [
      'customer-registration',
      'user-account',
      'certificate-processing',
      'email-notifications',
      'authentication-logs',
      'audit-logging',
    ]

    for (const activity of requiredActivities) {
      expect(DataProcessingInventory[activity]).toBeDefined()
    }
  })

  it('should have valid legal basis for each activity', () => {
    const validLegalBases = [
      'consent',
      'contract',
      'legal_obligation',
      'vital_interests',
      'public_task',
      'legitimate_interests',
    ]

    for (const activity of Object.values(DataProcessingInventory)) {
      expect(validLegalBases).toContain(activity.legalBasis)
    }
  })

  it('should return active processing activities', () => {
    const active = getActiveProcessingActivities()

    expect(active.length).toBeGreaterThan(0)
    for (const activity of active) {
      expect(activity.isActive).toBe(true)
    }
  })

  it('should list all third-party recipients', () => {
    const thirdParties = getThirdPartyRecipients()

    expect(thirdParties).toContain('Resend')
    expect(thirdParties).toContain('Sentry')
    expect(thirdParties).toContain('Google Cloud Storage')
  })

  it('should list all data categories', () => {
    const categories = getDataCategories()

    expect(categories).toContain('email')
    expect(categories).toContain('name')
    expect(categories).toContain('calibration_readings')
  })
})

describe('Consent Management', () => {
  const testUserId = 'test-user-123'

  beforeEach(() => {
    vi.clearAllMocks()
    _resetConsentStore()
  })

  it('should record consent', async () => {
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'marketing_email',
      granted: true,
      version: CONSENT_VERSIONS.marketing_email,
    })

    const hasConsent = await checkConsent(testUserId, 'marketing_email')
    expect(hasConsent).toBe(true)
  })

  it('should revoke consent', async () => {
    // First grant
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'analytics',
      granted: true,
      version: CONSENT_VERSIONS.analytics,
    })

    // Then revoke
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'analytics',
      granted: false,
      version: CONSENT_VERSIONS.analytics,
    })

    const hasConsent = await checkConsent(testUserId, 'analytics')
    expect(hasConsent).toBe(false)
  })

  it('should return false for non-existent consent', async () => {
    const hasConsent = await checkConsent('unknown-user', 'marketing_email')
    expect(hasConsent).toBe(false)
  })

  it('should get all user consents', async () => {
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'essential_cookies',
      granted: true,
      version: CONSENT_VERSIONS.essential_cookies,
    })

    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'analytics',
      granted: true,
      version: CONSENT_VERSIONS.analytics,
    })

    const consents = await getUserConsents(testUserId)
    expect(consents.length).toBe(2)
  })

  it('should revoke all consents', async () => {
    // Grant some consents
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'marketing_email',
      granted: true,
      version: CONSENT_VERSIONS.marketing_email,
    })

    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'analytics',
      granted: true,
      version: CONSENT_VERSIONS.analytics,
    })

    // Revoke all
    await revokeAllConsents(testUserId)

    const hasMarketing = await checkConsent(testUserId, 'marketing_email')
    const hasAnalytics = await checkConsent(testUserId, 'analytics')

    expect(hasMarketing).toBe(false)
    expect(hasAnalytics).toBe(false)
  })

  it('should get consent status summary', async () => {
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'essential_cookies',
      granted: true,
      version: CONSENT_VERSIONS.essential_cookies,
    })

    const status = await getConsentStatus(testUserId)

    expect(status.consents).toBeDefined()
    expect(status.consents.length).toBe(5) // All consent types

    const essentialConsent = status.consents.find(c => c.type === 'essential_cookies')
    expect(essentialConsent?.granted).toBe(true)
    expect(essentialConsent?.needsRenewal).toBe(false)
  })

  it('should flag consent needing renewal when version changes', async () => {
    await recordConsent({
      userId: testUserId,
      userType: 'customer',
      type: 'data_processing',
      granted: true,
      version: '0.9', // Old version
    })

    const status = await getConsentStatus(testUserId)
    const dataConsent = status.consents.find(c => c.type === 'data_processing')

    expect(dataConsent?.needsRenewal).toBe(true)
  })
})

describe('Data Subject Rights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Right to Access (Export)', () => {
    it('should export customer user data', async () => {
      const mockCustomer = {
        id: 'customer-123',
        email: 'test@example.com',
        name: 'Test User',
        companyName: 'Test Company',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
        customerAccountId: 'account-123',
        isPoc: false,
        activatedAt: new Date('2024-01-02'),
      }

      vi.mocked(prisma.customerUser.findUnique).mockResolvedValue(mockCustomer)
      vi.mocked(prisma.certificate.findMany).mockResolvedValue([])
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([])

      const result = await exportCustomerUserData('customer-123', 'admin-123', {
        tenantId: 'tenant-123',
      })

      expect(result.user.email).toBe('test@example.com')
      expect(result.user.name).toBe('Test User')
      expect(result.exportedAt).toBeInstanceOf(Date)
      expect(result.format).toBe('json')
    })

    it('should throw error for non-existent customer', async () => {
      vi.mocked(prisma.customerUser.findUnique).mockResolvedValue(null)

      await expect(
        exportCustomerUserData('unknown', 'admin', { tenantId: 'tenant-123' })
      ).rejects.toThrow('Customer user not found')
    })
  })

  describe('Right to Erasure (Delete)', () => {
    it('should pseudonymize customer with regulatory hold', async () => {
      const mockCustomer = {
        id: 'customer-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
      }

      vi.mocked(prisma.customerUser.findUnique).mockResolvedValue(mockCustomer)
      vi.mocked(prisma.certificate.count).mockResolvedValue(5) // Has certificates
      vi.mocked(prisma.customerUser.update).mockResolvedValue({
        ...mockCustomer,
        email: 'deleted-customer@anonymized.local',
        name: 'Deleted User',
      })

      const result = await deleteCustomerUserData('customer-123', 'admin-123', {
        tenantId: 'tenant-123',
      })

      expect(result.success).toBe(true)
      expect(result.pseudonymized).toBe(true)
      expect(result.retainedData).toBeDefined()
      expect(result.retainedData?.[0]).toContain('certificates')
    })

    it('should fully delete customer without regulatory hold', async () => {
      const mockCustomer = {
        id: 'customer-456',
        email: 'delete-me@example.com',
        tenantId: 'tenant-123',
      }

      vi.mocked(prisma.customerUser.findUnique).mockResolvedValue(mockCustomer)
      vi.mocked(prisma.certificate.count).mockResolvedValue(0) // No certificates

      const result = await deleteCustomerUserData('customer-456', 'admin-123', {
        tenantId: 'tenant-123',
      })

      expect(result.success).toBe(true)
      expect(result.pseudonymized).toBe(false)
    })
  })

  describe('Right to Rectification (Update)', () => {
    it('should update customer data', async () => {
      const mockCustomer = {
        id: 'customer-123',
        email: 'old@example.com',
        name: 'Old Name',
        companyName: 'Old Company',
      }

      vi.mocked(prisma.customerUser.findUnique).mockResolvedValue(mockCustomer)
      vi.mocked(prisma.customerUser.update).mockResolvedValue({
        ...mockCustomer,
        email: 'new@example.com',
        name: 'New Name',
      })

      await rectifyCustomerUserData(
        'customer-123',
        { email: 'new@example.com', name: 'New Name' },
        'admin-123',
        { tenantId: 'tenant-123' }
      )

      expect(prisma.customerUser.update).toHaveBeenCalledWith({
        where: { id: 'customer-123' },
        data: { email: 'new@example.com', name: 'New Name' },
      })
    })
  })
})

describe('Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should log compliance events to database', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({
      id: 'audit-123',
      entityType: 'DATA_SUBJECT',
      entityId: 'user-123',
      action: 'DATA_EXPORT',
      actorId: 'admin-123',
      actorType: 'USER',
      changes: {},
      createdAt: new Date(),
    })

    await logComplianceEvent({
      action: 'DATA_EXPORT',
      resourceType: 'DATA_SUBJECT',
      resourceId: 'user-123',
      userId: 'admin-123',
      service: 'api',
      piiAccessed: ['email', 'name'],
    })

    expect(prisma.auditLog.create).toHaveBeenCalled()
  })

  it('should query compliance audit logs', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-1',
        entityType: 'DATA_SUBJECT',
        entityId: 'user-123',
        action: 'DATA_EXPORT',
        actorId: 'admin',
        actorType: 'USER',
        changes: {},
        createdAt: new Date(),
      },
    ])
    vi.mocked(prisma.auditLog.count).mockResolvedValue(1)

    const result = await queryComplianceAuditLogs({
      subjectId: 'user-123',
      action: 'DATA_EXPORT',
    })

    expect(result.total).toBe(1)
    expect(result.logs.length).toBe(1)
  })
})
